// apps/api/src/auth/sessao.service.ts
// Login próprio (revisão de 18/11/2026, itens 3.5 e 5.4): usuário + senha guardados no nosso banco.
//
// Entrar:
//   1. IP bloqueado (5 erros em 1 min)?                        -> 429
//   2. A loja vem do ENDEREÇO acessado (lojaa.dominio), nunca do que a tela manda (com DOMINIO_BASE).
//   3. Uma tentativa por vez para o mesmo usuário (FilaPorChave), sem segurar conexão do banco.
//   4. Usuário bloqueado (5 senhas erradas = 5 min)?          -> 429, sem nem conferir a senha
//   5. Senha conferida com scrypt FORA da transação (não prende o banco).
//   6. Errou: conta no banco com a linha travada (FOR UPDATE) -> 401 "Usuário ou senha incorretos."
//      (na 5ª, 429). Usuário que NÃO existe responde igual, no mesmo tempo e com o mesmo bloqueio.
//   7. Acertou, mas desativado                                -> 403 (só quem sabe a senha descobre)
//   8. Acertou: zera a contagem, cria a sessão (segredo novo a cada login) e registra no histórico.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  aposSenhaErrada,
  BLOQUEIO_MINUTOS,
  ehPapelDeLoja,
  FORMATO_LOGIN,
  MENSAGEM_ACABOU_DE_BLOQUEAR,
  MENSAGEM_CREDENCIAIS,
  mensagemBloqueado,
  normalizarLogin,
  type PapelDeLoja,
  situacaoBloqueio,
  subdominioDoEndereco,
  validarSenhaNova,
  validarSubdominio,
} from '@saas/core';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import { BancoService, type LojaResumo } from '../banco/banco.service.js';
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { MuitasTentativasException } from '../http/filtro-erros.js';
import { registrar } from '../http/log.js';
import type { ContextoRequisicao, RequisicaoAutenticada } from './contexto.js';
import { cookieDaSessao, hashDoSegredo, lerCookies, lerValorDoCookie, nomeDoCookie, novoSegredo, valorDoCookie } from './cookies.js';
import { FilaPorChave, LimitadorPorIp, TentativasSemUsuario } from './limites.js';
import { conferirSenha, gerarHashSenha } from './senhas.js';
import { encerrarSessoes, lerTentativasTravando, paraBanco } from './sessoes.js';

export interface RespostaSessao {
  usuario: { id: string; nome: string; usuario: string; papel: PapelDeLoja };
  loja: { nome: string; subdominio: string };
  /** true = a pessoa precisa criar a própria senha antes de usar o sistema. */
  senhaProvisoria: boolean;
  /** Minutos sem uso até a sessão cair (a tela avisa e sai sozinha). */
  inatividadeMin: number;
}

const BLOQUEIO_SEGUNDOS = BLOQUEIO_MINUTOS * 60;

const credenciais = () => new UnauthorizedException({ mensagem: MENSAGEM_CREDENCIAIS, codigo: 'credenciais' });

function mensagemIpBloqueado(segundos: number): string {
  const quando = segundos >= 60 ? `${Math.ceil(segundos / 60)} min` : `${Math.max(1, segundos)} s`;
  return `Muitas tentativas de login erradas a partir desta rede. Tente de novo em ${quando}.`;
}

function lerCampos(corpo: unknown, campos: readonly string[]): Record<string, string> | null {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) return null;
  const c = corpo as Record<string, unknown>;
  const lido: Record<string, string> = {};
  for (const nome of campos) {
    const v = c[nome];
    if (typeof v !== 'string' || v === '') return null;
    lido[nome] = v.slice(0, 1024); // senha real tem até 128; o resto só não pode travar o scrypt
  }
  return lido;
}

@Injectable()
export class SessaoService {
  private readonly porIp = new LimitadorPorIp();
  private readonly semUsuario = new TentativasSemUsuario();
  private readonly fila = new FilaPorChave();

  constructor(
    private readonly banco: BancoService,
    @Inject(AMBIENTE) private readonly amb: Ambiente,
  ) {}

  // ------------------------------------------------------------------ loja da tela de entrada

  /** Com DOMINIO_BASE, a loja é a do endereço (Host); sem ele (desenvolvimento), a informada. */
  private async lojaDoPedido(host: string | undefined, informada: unknown): Promise<LojaResumo | null> {
    let sub: string | null;
    if (this.amb.dominioBase) sub = subdominioDoEndereco(host, this.amb.dominioBase);
    else {
      const v = validarSubdominio(informada);
      sub = v.ok ? v.valor : null;
    }
    if (!sub) return null;
    const loja = await this.banco.buscarLojaPorSubdominio(sub);
    return loja?.ativa ? loja : null;
  }

  /** GET /sessao/loja: o nome da loja na tela de entrada, e se a tela precisa pedir o endereço. */
  async lojaParaEntrada(host: string | undefined, informada: unknown): Promise<{ loja: { nome: string; subdominio: string } | null; informarLoja: boolean }> {
    const loja = this.amb.dominioBase || informada !== undefined ? await this.lojaDoPedido(host, informada) : null;
    return { loja: loja ? { nome: loja.nome, subdominio: loja.subdominio } : null, informarLoja: !this.amb.dominioBase };
  }

  // ------------------------------------------------------------------ entrar

  private barrarIp(ip: string): void {
    const segundos = this.porIp.bloqueado(ip);
    if (segundos > 0) throw new MuitasTentativasException(mensagemIpBloqueado(segundos), segundos);
  }

  private falhaDeIp(ip: string): void {
    this.porIp.registrarFalha(ip);
    if (this.porIp.bloqueado(ip) > 0) registrar('aviso', 'ip_bloqueado', { ip });
  }

  async entrar(corpo: unknown, req: RequisicaoAutenticada): Promise<{ cookie: string; resposta: RespostaSessao }> {
    const dados = lerCampos(corpo, ['usuario', 'senha']);
    if (!dados) throw new BadRequestException({ mensagem: 'Informe o usuário e a senha.' });
    const ip = req.ip || 'desconhecido';
    this.barrarIp(ip);

    const loja = await this.lojaDoPedido(req.get('host'), (corpo as Record<string, unknown>).loja);
    if (!loja) {
      this.falhaDeIp(ip);
      throw new NotFoundException({ mensagem: 'Loja não encontrada. Confira o endereço.', codigo: 'loja_nao_encontrada' });
    }

    const login = normalizarLogin(dados.usuario!);
    const anterior = lerValorDoCookie(lerCookies(req.headers.cookie).get(nomeDoCookie(this.amb)));
    return this.fila.executar(`${loja.id}:${login}`, () => this.entrarNaLoja(loja, login, dados.senha!, ip, anterior));
  }

  private async entrarNaLoja(
    loja: LojaResumo,
    login: string,
    senha: string,
    ip: string,
    anterior: { lojaId: string; segredo: string } | null,
  ): Promise<{ cookie: string; resposta: RespostaSessao }> {
    this.barrarIp(ip); // pode ter sido bloqueado enquanto esperava na fila
    const agora = new Date();
    const u = FORMATO_LOGIN.test(login)
      ? await this.banco.comLoja(loja.id, (tx) =>
          tx.usuario.findUnique({
            where: { lojaId_usuario: { lojaId: loja.id, usuario: login } },
            select: { id: true, nome: true, usuario: true, papel: true, ativo: true, senhaHash: true, senhaProvisoria: true, tentativasErradas: true, bloqueadoAte: true },
          }),
        )
      : null;

    if (!u || !ehPapelDeLoja(u.papel)) return this.falhaSemUsuario(`${loja.id}:${login}`, senha, ip, agora);

    const situacao = situacaoBloqueio({ tentativasErradas: u.tentativasErradas, bloqueadoAte: u.bloqueadoAte?.toISOString() ?? null }, agora);
    if (situacao.bloqueado) throw new MuitasTentativasException(mensagemBloqueado(situacao.restanteSegundos), situacao.restanteSegundos);

    if (!(await conferirSenha(senha, u.senhaHash))) {
      this.falhaDeIp(ip);
      const resultado = await this.banco.comLoja(loja.id, async (tx) => {
        const atual = await lerTentativasTravando(tx, u.id);
        const ja = situacaoBloqueio(atual, new Date());
        if (ja.bloqueado) return { bloqueou: true, segundos: ja.restanteSegundos };
        const r = aposSenhaErrada(atual, new Date());
        await tx.usuario.update({ where: { id: u.id }, data: paraBanco(r.estado), select: { id: true } });
        await registrarAuditoria(tx, loja.id, null, r.bloqueou ? 'sessao.bloqueado' : 'sessao.senha_errada', { tipo: 'usuario', id: u.id });
        return { bloqueou: r.bloqueou, segundos: BLOQUEIO_SEGUNDOS };
      });
      if (resultado.bloqueou) throw new MuitasTentativasException(MENSAGEM_ACABOU_DE_BLOQUEAR, resultado.segundos);
      throw credenciais();
    }

    if (!u.ativo) throw new ForbiddenException({ mensagem: 'Seu acesso a esta loja está desativado. Fale com o Dono da loja.', codigo: 'usuario_desativado' });

    const segredo = novoSegredo();
    await this.banco.comLoja(
      loja.id,
      async (tx) => {
        const atual = await lerTentativasTravando(tx, u.id);
        const ja = situacaoBloqueio(atual, new Date());
        if (ja.bloqueado) throw new MuitasTentativasException(mensagemBloqueado(ja.restanteSegundos), ja.restanteSegundos);
        await tx.usuario.update({ where: { id: u.id }, data: { tentativasErradas: 0, bloqueadoAte: null, ultimoAcessoEm: new Date() }, select: { id: true } });
        if (anterior?.lojaId === loja.id) {
          // sessão antiga deste navegador (se ainda aberta) não fica valendo em paralelo
          await tx.sessao.updateMany({ where: { tokenHash: hashDoSegredo(anterior.segredo), encerradaEm: null }, data: { encerradaEm: new Date() } });
        }
        await tx.sessao.create({
          data: { lojaId: loja.id, usuarioId: u.id, tokenHash: hashDoSegredo(segredo), expiraEm: new Date(Date.now() + this.amb.sessaoMaximaHoras * 3_600_000) },
          select: { id: true },
        });
        await registrarAuditoria(tx, loja.id, u.id, 'sessao.entrou');
      },
      u.id,
    );

    return {
      cookie: cookieDaSessao(this.amb, valorDoCookie(loja.id, segredo)),
      resposta: {
        usuario: { id: u.id, nome: u.nome, usuario: u.usuario, papel: u.papel },
        loja: { nome: loja.nome, subdominio: loja.subdominio },
        senhaProvisoria: u.senhaProvisoria,
        inatividadeMin: this.amb.sessaoInatividadeMin,
      },
    };
  }

  /** Usuário que não existe: o mesmo tempo (scrypt de mentira), a mesma resposta e o mesmo bloqueio. */
  private async falhaSemUsuario(chave: string, senha: string, ip: string, agora: Date): Promise<never> {
    const situacao = this.semUsuario.situacao(chave, agora);
    if (situacao.bloqueado) throw new MuitasTentativasException(mensagemBloqueado(situacao.restanteSegundos), situacao.restanteSegundos);
    await conferirSenha(senha, null);
    this.falhaDeIp(ip);
    if (this.semUsuario.registrarFalha(chave, agora)) throw new MuitasTentativasException(MENSAGEM_ACABOU_DE_BLOQUEAR, BLOQUEIO_SEGUNDOS);
    throw credenciais();
  }

  // ------------------------------------------------------------------ sessão a cada pedido

  /**
   * Confere o cookie no banco: sessão aberta, dentro das 12 h, usada nos últimos 30 min, pessoa ativa,
   * loja ativa e (com DOMINIO_BASE) no endereço da própria loja. Sessão que falha é encerrada.
   */
  async validar(req: RequisicaoAutenticada): Promise<ContextoRequisicao | null> {
    const lido = lerValorDoCookie(lerCookies(req.headers.cookie).get(nomeDoCookie(this.amb)));
    if (!lido) return null;
    const agora = new Date();
    return this.banco.comLoja(lido.lojaId, async (tx) => {
      const s = await tx.sessao.findUnique({
        where: { tokenHash: hashDoSegredo(lido.segredo) },
        select: {
          id: true,
          lojaId: true,
          ultimoUsoEm: true,
          expiraEm: true,
          encerradaEm: true,
          usuario: { select: { id: true, nome: true, usuario: true, papel: true, ativo: true, senhaProvisoria: true } },
          loja: { select: { nome: true, subdominio: true, ativa: true } },
        },
      });
      if (!s || s.lojaId !== lido.lojaId) return null;
      const venceu =
        s.encerradaEm !== null || s.expiraEm <= agora || s.ultimoUsoEm.getTime() + this.amb.sessaoInatividadeMin * 60_000 <= agora.getTime();
      const outroEndereco = this.amb.dominioBase !== null && subdominioDoEndereco(req.get('host'), this.amb.dominioBase) !== s.loja.subdominio;
      if (venceu || outroEndereco || !s.usuario.ativo || !s.loja.ativa || !ehPapelDeLoja(s.usuario.papel)) {
        if (s.encerradaEm === null) await tx.sessao.update({ where: { id: s.id }, data: { encerradaEm: agora }, select: { id: true } });
        return null;
      }
      if (agora.getTime() - s.ultimoUsoEm.getTime() >= 60_000) {
        await tx.sessao.update({ where: { id: s.id }, data: { ultimoUsoEm: agora }, select: { id: true } });
      }
      return {
        lojaId: s.lojaId,
        lojaNome: s.loja.nome,
        lojaSubdominio: s.loja.subdominio,
        usuarioId: s.usuario.id,
        papel: s.usuario.papel,
        nome: s.usuario.nome,
        usuario: s.usuario.usuario,
        sessaoId: s.id,
        senhaProvisoria: s.usuario.senhaProvisoria,
      };
    });
  }

  resposta(ctx: ContextoRequisicao): RespostaSessao {
    return {
      usuario: { id: ctx.usuarioId, nome: ctx.nome, usuario: ctx.usuario, papel: ctx.papel },
      loja: { nome: ctx.lojaNome, subdominio: ctx.lojaSubdominio },
      senhaProvisoria: ctx.senhaProvisoria,
      inatividadeMin: this.amb.sessaoInatividadeMin,
    };
  }

  // ------------------------------------------------------------------ sair e trocar a senha

  async sair(req: RequisicaoAutenticada): Promise<void> {
    const lido = lerValorDoCookie(lerCookies(req.headers.cookie).get(nomeDoCookie(this.amb)));
    if (!lido) return;
    await this.banco.comLoja(lido.lojaId, async (tx) => {
      const s = await tx.sessao.findUnique({ where: { tokenHash: hashDoSegredo(lido.segredo) }, select: { id: true, usuarioId: true, encerradaEm: true } });
      if (!s || s.encerradaEm) return;
      await tx.sessao.update({ where: { id: s.id }, data: { encerradaEm: new Date() }, select: { id: true } });
      await registrarAuditoria(tx, lido.lojaId, s.usuarioId, 'sessao.saiu');
    });
  }

  /**
   * "Trocar minha senha" (e criar a própria senha no primeiro acesso). Pede a senha atual: quem pega o
   * computador destravado não troca a senha de ninguém. Senha atual errada conta como tentativa errada.
   * Depois da troca, as OUTRAS sessões da pessoa (outros aparelhos) são encerradas.
   */
  async trocarSenha(ctx: ContextoRequisicao, corpo: unknown): Promise<RespostaSessao> {
    const dados = lerCampos(corpo, ['senhaAtual', 'senhaNova']);
    if (!dados) throw new BadRequestException({ mensagem: 'Informe a senha atual e a senha nova.' });

    const u = await this.banco.comLoja(ctx.lojaId, (tx) =>
      tx.usuario.findUnique({ where: { id: ctx.usuarioId }, select: { senhaHash: true, tentativasErradas: true, bloqueadoAte: true } }),
    );
    if (!u) throw new UnauthorizedException({ mensagem: 'Sua sessão terminou. Entre de novo.', codigo: 'sessao_encerrada' });
    const situacao = situacaoBloqueio({ tentativasErradas: u.tentativasErradas, bloqueadoAte: u.bloqueadoAte?.toISOString() ?? null }, new Date());
    if (situacao.bloqueado) throw new MuitasTentativasException(mensagemBloqueado(situacao.restanteSegundos), situacao.restanteSegundos);

    if (!(await conferirSenha(dados.senhaAtual!, u.senhaHash))) {
      const bloqueou = await this.banco.comLoja(
        ctx.lojaId,
        async (tx) => {
          const atual = await lerTentativasTravando(tx, ctx.usuarioId);
          if (situacaoBloqueio(atual, new Date()).bloqueado) return true;
          const r = aposSenhaErrada(atual, new Date());
          await tx.usuario.update({ where: { id: ctx.usuarioId }, data: paraBanco(r.estado), select: { id: true } });
          if (r.bloqueou) {
            await encerrarSessoes(tx, ctx.lojaId, ctx.usuarioId);
            await registrarAuditoria(tx, ctx.lojaId, null, 'sessao.bloqueado', { tipo: 'usuario', id: ctx.usuarioId });
          }
          return r.bloqueou;
        },
        ctx.usuarioId,
      );
      if (bloqueou) throw new MuitasTentativasException(MENSAGEM_ACABOU_DE_BLOQUEAR, BLOQUEIO_SEGUNDOS);
      throw new BadRequestException({ mensagem: 'A senha atual não confere.', erros: [{ campo: 'senhaAtual', mensagem: 'Senha atual errada.' }] });
    }

    const nova = validarSenhaNova(dados.senhaNova, { usuario: ctx.usuario, nome: ctx.nome });
    if (!nova.ok) throw new BadRequestException({ mensagem: nova.erros[0]!.mensagem, erros: nova.erros.map((e) => ({ ...e, campo: 'senhaNova' })) });
    if (dados.senhaNova === dados.senhaAtual) {
      throw new BadRequestException({ mensagem: 'A senha nova precisa ser diferente da atual.', erros: [{ campo: 'senhaNova', mensagem: 'Igual à atual.' }] });
    }

    const hash = await gerarHashSenha(dados.senhaNova!);
    await this.banco.comLoja(
      ctx.lojaId,
      async (tx) => {
        await tx.usuario.update({
          where: { id: ctx.usuarioId },
          data: { senhaHash: hash, senhaProvisoria: false, tentativasErradas: 0, bloqueadoAte: null },
          select: { id: true },
        });
        await encerrarSessoes(tx, ctx.lojaId, ctx.usuarioId, ctx.sessaoId);
        await registrarAuditoria(tx, ctx.lojaId, ctx.usuarioId, 'usuario.senha_trocada', { tipo: 'usuario', id: ctx.usuarioId });
      },
      ctx.usuarioId,
    );
    return this.resposta({ ...ctx, senhaProvisoria: false });
  }
}
