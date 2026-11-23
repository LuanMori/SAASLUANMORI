// apps/api/src/usuarios/usuarios.service.ts
// Tela Usuários (revisão de 18/11/2026, item 5.4): o Dono e o Administrador cadastram a equipe.
// As regras são as de @saas/core (conferirGestaoDeUsuario), as mesmas da tela; o banco tem uma trava
// própria (trigger usuarios_trava_api) para o que é mais grave: papel de Dono e a loja sem Dono.
//
// Toda alteração roda com a trava da loja (pg_advisory_xact_lock 'usuarios:<loja>', a mesma do
// trigger): dois Donos se rebaixando ao mesmo tempo não deixam a loja sem nenhum.
// Pedido do Luan (23/11/2026): o Dono e o Administrador cadastram Vendedor e Personalizado (com as funções marcadas);
// o Dono e o Administrador só o Adm. Sup (super_admin) cadastra. O Adm. Sup não é da loja: não aparece na lista e o
// login dele não pode ser usado por ninguém da loja.
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AcaoSobreUsuario,
  conferirGestaoDeUsuario,
  ehPapelDeLoja,
  NOME_USUARIO_REMOVIDO,
  type UsuarioParaRegra,
  validarAlteracaoUsuario,
  validarNovoUsuario,
  validarSenhaNova,
} from '@saas/core';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { ContextoRequisicao } from '../auth/contexto.js';
import { gerarHashSenha } from '../auth/senhas.js';
import { encerrarSessoes } from '../auth/sessoes.js';
import { BancoService, type Tx, UUID } from '../banco/banco.service.js';
import { Prisma } from '../generated/prisma/client.js';

const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  usuario: true,
  papel: true,
  permissoes: true,
  ativo: true,
  senhaProvisoria: true,
  bloqueadoAte: true,
  ultimoAcessoEm: true,
  criadoEm: true,
} as const satisfies Prisma.UsuarioSelect;

export type UsuarioPublico = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS_PUBLICOS }>;

type Alvo = UsuarioPublico & UsuarioParaRegra;

const naoEncontrado = () => new NotFoundException({ mensagem: 'Usuário não encontrado.' });

function recusar(r: { ok: false; erros: { campo: string; mensagem: string }[] }): ForbiddenException {
  return new ForbiddenException({ mensagem: r.erros[0]!.mensagem, codigo: 'regra_usuarios', erros: r.erros });
}

@Injectable()
export class UsuariosService {
  constructor(private readonly banco: BancoService) {}

  listar(ctx: ContextoRequisicao): Promise<UsuarioPublico[]> {
    return this.banco.comLoja(ctx.lojaId, (tx) =>
      tx.usuario.findMany({
        where: { lojaId: ctx.lojaId },
        orderBy: [{ ativo: 'desc' }, { nome: 'asc' }, { id: 'asc' }],
        select: CAMPOS_PUBLICOS,
      }),
    );
  }

  /** Transação com a trava da loja; `ator` é relido do banco (o papel pode ter mudado desde o login). */
  private comTrava<T>(ctx: ContextoRequisicao, fn: (tx: Tx, ator: UsuarioParaRegra, daLoja: UsuarioParaRegra[]) => Promise<T>): Promise<T> {
    return this.banco.comLoja(
      ctx.lojaId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`usuarios:${ctx.lojaId}`}, 0))`;
        const todos = await tx.usuario.findMany({ where: { lojaId: ctx.lojaId }, select: { id: true, papel: true, ativo: true, permissoes: true } });
        const daLoja = todos.filter((u): u is UsuarioParaRegra & typeof u => ehPapelDeLoja(u.papel));
        // o Adm. Sup não é da loja: a sessão já conferiu que ele está ativo
        const ator: UsuarioParaRegra | undefined = ctx.papel === 'super_admin' ? { id: ctx.usuarioId, papel: 'super_admin', ativo: true } : daLoja.find((u) => u.id === ctx.usuarioId);
        if (!ator) throw new ForbiddenException({ mensagem: 'Seu acesso a esta loja está desativado.' });
        return fn(tx, ator, daLoja);
      },
      ctx.usuarioId,
    );
  }

  private async lerAlvo(tx: Tx, ctx: ContextoRequisicao, id: string): Promise<Alvo> {
    if (!UUID.test(id)) throw naoEncontrado();
    const alvo = await tx.usuario.findFirst({ where: { id, lojaId: ctx.lojaId }, select: CAMPOS_PUBLICOS });
    if (!alvo || !ehPapelDeLoja(alvo.papel)) throw naoEncontrado();
    return alvo as Alvo;
  }

  private conferir(ator: UsuarioParaRegra, alvo: Alvo | null, acao: AcaoSobreUsuario, daLoja: UsuarioParaRegra[]): void {
    const r = conferirGestaoDeUsuario(ator, alvo, acao, daLoja);
    if (!r.ok) throw recusar(r);
  }

  async criar(ctx: ContextoRequisicao, entrada: unknown): Promise<UsuarioPublico> {
    const v = validarNovoUsuario(entrada);
    if (!v.ok) throw new BadRequestException({ mensagem: 'Dados do usuário inválidos.', erros: v.erros });
    const novo = v.valor;
    const hash = await gerarHashSenha(novo.senha);
    try {
      return await this.comTrava(ctx, async (tx, ator, daLoja) => {
        this.conferir(ator, null, { tipo: 'criar', papel: novo.papel, ...(novo.permissoes ? { permissoes: novo.permissoes } : {}) }, daLoja);
        const existe = await tx.usuario.findUnique({ where: { lojaId_usuario: { lojaId: ctx.lojaId, usuario: novo.usuario } }, select: { id: true } });
        // o login do Adm. Sup também fica fora (senão a pessoa da loja tomaria o lugar dele no login)
        const doSuporte = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM app_suporte_para_login(${novo.usuario})`;
        if (existe || doSuporte.length) throw loginRepetido(novo.usuario);
        const criado = await tx.usuario.create({
          data: { lojaId: ctx.lojaId, nome: novo.nome, usuario: novo.usuario, papel: novo.papel, permissoes: novo.permissoes ?? [], senhaHash: hash, senhaProvisoria: true },
          select: CAMPOS_PUBLICOS,
        });
        await registrarAuditoria(tx, ctx.lojaId, ctx.usuarioId, 'usuario.criado', { tipo: 'usuario', id: criado.id }, { papel: novo.papel, ...(novo.permissoes ? { permissoes: novo.permissoes } : {}) });
        return criado;
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') throw loginRepetido(novo.usuario);
      throw erro;
    }
  }

  async alterar(ctx: ContextoRequisicao, id: string, entrada: unknown): Promise<UsuarioPublico> {
    const v = validarAlteracaoUsuario(entrada);
    if (!v.ok) throw new BadRequestException({ mensagem: 'Dados do usuário inválidos.', erros: v.erros });
    const mudanca = v.valor;
    return this.comTrava(ctx, async (tx, ator, daLoja) => {
      const alvo = await this.lerAlvo(tx, ctx, id);
      this.conferir(ator, alvo, { tipo: 'alterar', mudanca }, daLoja);

      const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const campos = (Object.keys(mudanca) as (keyof typeof mudanca)[]).filter((k) => !igual(mudanca[k], alvo[k]));
      // quem deixa de ser Personalizado perde as funções
      if (mudanca.papel !== undefined && mudanca.papel !== 'personalizado' && alvo.permissoes.length > 0 && !campos.includes('permissoes')) campos.push('permissoes');
      if (campos.length === 0) return alvo;
      const dados: Record<string, unknown> = Object.fromEntries(campos.map((k) => [k, mudanca[k]]));
      if ((mudanca.papel ?? alvo.papel) !== 'personalizado') dados.permissoes = [];
      const salvo = await tx.usuario.update({ where: { id: alvo.id }, data: dados, select: CAMPOS_PUBLICOS });

      const alvoAud = { tipo: 'usuario', id: alvo.id } as const;
      if (campos.includes('ativo')) {
        if (!salvo.ativo) await encerrarSessoes(tx, ctx.lojaId, alvo.id);
        await registrarAuditoria(tx, ctx.lojaId, ctx.usuarioId, salvo.ativo ? 'usuario.reativado' : 'usuario.desativado', alvoAud);
      }
      const outros = campos.filter((k) => k !== 'ativo');
      if (outros.length > 0) {
        // sem o nome novo/antigo no histórico (dado pessoal): só QUAIS campos mudaram, e o papel
        await registrarAuditoria(tx, ctx.lojaId, ctx.usuarioId, 'usuario.alterado', alvoAud, {
          campos: outros,
          ...(outros.includes('papel') ? { papelAntes: alvo.papel, papelDepois: salvo.papel } : {}),
          ...(outros.includes('permissoes') ? { permissoes: salvo.permissoes } : {}),
        });
      }
      return salvo;
    });
  }

  /** O Dono/Administrador cria uma senha PROVISÓRIA (a pessoa cria a dela no próximo acesso). */
  async redefinirSenha(ctx: ContextoRequisicao, id: string, entrada: unknown): Promise<void> {
    const senha = typeof entrada === 'object' && entrada !== null ? (entrada as Record<string, unknown>).senha : undefined;
    await this.comTrava(ctx, async (tx, ator, daLoja) => {
      const alvo = await this.lerAlvo(tx, ctx, id);
      this.conferir(ator, alvo, { tipo: 'redefinir_senha' }, daLoja);
      const v = validarSenhaNova(senha, { usuario: alvo.usuario, nome: alvo.nome });
      if (!v.ok) throw new BadRequestException({ mensagem: v.erros[0]!.mensagem, erros: v.erros });
      await tx.usuario.update({
        where: { id: alvo.id },
        data: { senhaHash: await gerarHashSenha(v.valor), senhaProvisoria: true, tentativasErradas: 0, bloqueadoAte: null },
        select: { id: true },
      });
      await encerrarSessoes(tx, ctx.lojaId, alvo.id);
      await registrarAuditoria(tx, ctx.lojaId, ctx.usuarioId, 'usuario.senha_redefinida', { tipo: 'usuario', id: alvo.id });
    });
  }

  /**
   * LGPD: apaga os dados pessoais de um usuário DESATIVADO (nome, login, senha, último acesso). A linha
   * fica, com "Usuário removido", para o histórico continuar dizendo que alguém fez aquilo. Só o Dono.
   */
  async excluirDados(ctx: ContextoRequisicao, id: string): Promise<UsuarioPublico> {
    return this.comTrava(ctx, async (tx, ator, daLoja) => {
      const alvo = await this.lerAlvo(tx, ctx, id);
      this.conferir(ator, alvo, { tipo: 'excluir_dados' }, daLoja);
      const salvo = await tx.usuario.update({
        where: { id: alvo.id },
        data: {
          nome: NOME_USUARIO_REMOVIDO,
          usuario: `removido-${alvo.id.replace(/-/g, '').slice(-24)}`,
          senhaHash: null,
          senhaProvisoria: true,
          tentativasErradas: 0,
          bloqueadoAte: null,
          ultimoAcessoEm: null,
        },
        select: CAMPOS_PUBLICOS,
      });
      await encerrarSessoes(tx, ctx.lojaId, alvo.id);
      await registrarAuditoria(tx, ctx.lojaId, ctx.usuarioId, 'usuario.dados_excluidos', { tipo: 'usuario', id: alvo.id });
      return salvo;
    });
  }
}

function loginRepetido(login: string): ConflictException {
  return new ConflictException({
    mensagem: `Já existe o usuário "${login}" nesta loja. Escolha outro login.`,
    erros: [{ campo: 'usuario', mensagem: 'Já usado nesta loja.' }],
  });
}
