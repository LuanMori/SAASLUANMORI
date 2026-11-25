// apps/web/src/demo/usuariosDemo.ts
// SÓ PARA A DEMONSTRAÇÃO: os usuários de cada loja, guardados no navegador, com AS MESMAS REGRAS do
// servidor (@saas/core): senha só com hash (PBKDF2, nunca o texto), senha provisória que a pessoa
// troca no primeiro acesso, 5 senhas erradas = 5 minutos bloqueado (login e autorização com senha),
// só o Dono e o Administrador cadastram, só o Dono mexe em Dono e exclui dados (LGPD), e o histórico
// de quem fez o quê. Não é segurança de verdade: tudo roda no navegador e qualquer pessoa pode ler.
// Cada operação que grava pega a trava entre abas e grava tudo ou nada (armazenamento.ts).
import {
  type AcaoAuditoria,
  acessosDaPessoa,
  ACOES_AUDITORIA,
  lerFotoDoPerfil,
  aposSenhaErrada,
  conferirGestaoDeUsuario,
  type EstadoTentativas,
  MENSAGEM_ACABOU_DE_BLOQUEAR,
  MENSAGEM_CREDENCIAIS,
  mensagemBloqueado,
  mensagemSemPermissao,
  NOME_USUARIO_REMOVIDO,
  normalizarLogin,
  type PapelDeLoja,
  pode,
  resumirAuditoria,
  SEM_TENTATIVAS,
  situacaoBloqueio,
  type UsuarioParaRegra,
  validarAlteracaoUsuario,
  validarNovoUsuario,
  validarSenhaNova,
  type NomesDasContas,
  NOME_SUPORTE,
  ehPapelDeLoja,
} from '@saas/core';
import { type ApiConta, type ApiUsuarios, ErroApi, type ItemAuditoria, type UsuarioDaLoja } from '../api';
import { comTrava, gravar, gravarDaLoja, ler, lerDaLoja, transacao } from './armazenamento';

export const SENHA_DEMO = 'demo1234';

export const LOJAS_DEMO = [
  { id: 'loja-a', subdominio: 'lojaa', nome: 'Loja A', descricao: 'Rações, petiscos e acessórios' },
  { id: 'loja-b', subdominio: 'lojab', nome: 'Loja B', descricao: 'Pet shop e banho e tosa' },
] as const;

/** Quem já vem cadastrado em cada loja (todos com a senha demo1234; Carla está desativada). */
const EQUIPE_INICIAL: { usuario: string; nome: string; papel: PapelDeLoja; ativo: boolean }[] = [
  { usuario: 'ana', nome: 'Ana', papel: 'dono', ativo: true },
  { usuario: 'caio', nome: 'Caio', papel: 'administrador', ativo: true },
  { usuario: 'bruno', nome: 'Bruno', papel: 'vendedor', ativo: true },
  { usuario: 'carla', nome: 'Carla', papel: 'vendedor', ativo: false },
];

const CHAVES = { usuarios: 'saas-demo:usuarios:v1', auditoria: 'saas-demo:auditoria:v1', suporte: 'saas-demo:suporte:v1' } as const;

/**
 * O Adm. Sup da demonstração (pedido do Luan, 23/11/2026): o usuário mestre, o mesmo em todas as lojas (login
 * "suporte", senha demo1234). Não aparece na lista de usuários de loja nenhuma; no histórico e nas vendas, aparece
 * como "Suporte". Fica guardado fora das lojas (como o super_admin do servidor, sem loja).
 */
export const LOGIN_SUPORTE = 'suporte';
const ID_SUPORTE = 'adm-sup';
/** O histórico da demonstração guarda só os últimos registros de cada loja. */
export const MAX_AUDITORIA = 2000;

interface UsuarioGuardado extends UsuarioDaLoja {
  /** pbkdf2$<iterações>$<sal base64>$<hash base64>; null = sem senha (não entra). */
  senhaHash: string | null;
  tentativasErradas: number;
}

interface RegistroAuditoria {
  id: string;
  acao: AcaoAuditoria;
  usuarioId: string | null;
  alvoTipo: string | null;
  alvoId: string | null;
  detalhes: Record<string, unknown>;
  criadoEm: string;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------- senha (PBKDF2 do navegador)

const ITERACOES = 100_000;
const paraBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const deBase64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function derivar(senha: string, sal: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // o navegador só libera a criptografia em "contexto seguro": arquivo aberto com dois cliques, https ou localhost
    throw new Error('Abra a demonstração com dois cliques no arquivo (ou por https): este navegador bloqueou a criptografia da senha.');
  }
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteracoes }, chave, 256));
}

export async function gerarHashDemo(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACOES}$${paraBase64(sal)}$${paraBase64(await derivar(senha, sal, ITERACOES))}`;
}

/** Sem hash (usuário que não existe ou sem senha), gasta o mesmo tempo e responde false. */
export async function conferirHashDemo(senha: string, guardado: string | null): Promise<boolean> {
  const partes = guardado?.split('$') ?? [];
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') {
    await derivar(senha, new Uint8Array(16), ITERACOES);
    return false;
  }
  const calculado = await derivar(senha, deBase64(partes[2]!), Number(partes[1]));
  const esperado = deBase64(partes[3]!);
  let diferenca = calculado.length ^ esperado.length;
  for (let i = 0; i < Math.min(calculado.length, esperado.length); i += 1) diferenca |= calculado[i]! ^ esperado[i]!;
  return diferenca === 0;
}

// ---------------------------------------------------------------- guarda

const preparando = new Map<string, Promise<void>>();

/** Na primeira vez de cada loja, cadastra a equipe inicial (com o hash da senha demo1234). */
async function prepararLoja(lojaId: string): Promise<void> {
  if (ler<Record<string, unknown>>(CHAVES.usuarios, {})[lojaId]) return;
  let p = preparando.get(lojaId);
  if (!p) {
    p = (async () => {
      const criadoEm = new Date().toISOString();
      const equipe: UsuarioGuardado[] = [];
      for (const u of EQUIPE_INICIAL) {
        equipe.push({
          ...u,
          id: u.usuario, // o id é o login: as vendas antigas da demonstração guardaram assim quem vendeu
          senhaHash: await gerarHashDemo(SENHA_DEMO),
          senhaProvisoria: false,
          tentativasErradas: 0,
          bloqueadoAte: null,
          ultimoAcessoEm: null,
          criadoEm,
        });
      }
      if (!ler<Record<string, unknown>>(CHAVES.usuarios, {})[lojaId]) gravarDaLoja(CHAVES.usuarios, lojaId, equipe);
    })().finally(() => preparando.delete(lojaId));
    preparando.set(lojaId, p);
  }
  await p;
}

let preparandoSuporte: Promise<UsuarioGuardado> | null = null;

/** O Adm. Sup (criado na primeira vez, com a senha demo1234). */
async function suporte(): Promise<UsuarioGuardado> {
  const guardado = ler<UsuarioGuardado | null>(CHAVES.suporte, null);
  if (guardado) return guardado;
  preparandoSuporte ??= (async () => {
    const u: UsuarioGuardado = {
      id: ID_SUPORTE,
      usuario: LOGIN_SUPORTE,
      nome: NOME_SUPORTE,
      papel: 'super_admin',
      ativo: true,
      senhaHash: await gerarHashDemo(SENHA_DEMO),
      senhaProvisoria: false,
      tentativasErradas: 0,
      bloqueadoAte: null,
      ultimoAcessoEm: null,
      criadoEm: new Date().toISOString(),
    };
    if (!ler<UsuarioGuardado | null>(CHAVES.suporte, null)) gravar(CHAVES.suporte, u);
    return ler<UsuarioGuardado | null>(CHAVES.suporte, null) ?? u;
  })().finally(() => (preparandoSuporte = null));
  return preparandoSuporte;
}

const ehSuporte = (id: string | null | undefined) => id === ID_SUPORTE;

/** Volta à equipe inicial (Ana, Caio, Bruno e Carla, senha demo1234) e apaga o histórico, nas duas lojas. */
export function apagarUsuariosDemo(): void {
  gravar(CHAVES.usuarios, {});
  gravar(CHAVES.auditoria, {});
  gravar(CHAVES.suporte, null);
  semUsuario.clear();
}

async function usuariosDaLoja(lojaId: string): Promise<UsuarioGuardado[]> {
  await prepararLoja(lojaId);
  return lerDaLoja<UsuarioGuardado>(CHAVES.usuarios, lojaId);
}

function salvarUsuario(lojaId: string, u: UsuarioGuardado): void {
  const lista = lerDaLoja<UsuarioGuardado>(CHAVES.usuarios, lojaId);
  const i = lista.findIndex((x) => x.id === u.id);
  gravarDaLoja(CHAVES.usuarios, lojaId, i < 0 ? [...lista, u] : lista.map((x, j) => (j === i ? u : x)));
}

/** Grava a própria pessoa: o Adm. Sup fica fora das lojas (CHAVES.suporte), os outros na lista da loja. */
function salvarEu(lojaId: string, u: UsuarioGuardado): void {
  if (ehSuporte(u.id)) gravar(CHAVES.suporte, u);
  else salvarUsuario(lojaId, u);
}

const publico = ({ senhaHash: _h, tentativasErradas: _t, ...u }: UsuarioGuardado): UsuarioDaLoja => u;
const estadoDe = (u: UsuarioGuardado): EstadoTentativas => ({ tentativasErradas: u.tentativasErradas, bloqueadoAte: u.bloqueadoAte });
const comEstado = (u: UsuarioGuardado, e: EstadoTentativas): UsuarioGuardado => ({ ...u, tentativasErradas: e.tentativasErradas, bloqueadoAte: e.bloqueadoAte });

/** A equipe da loja para a cópia de segurança (Dados e backup): sem senha, sem tentativas erradas. Só para consulta. */
export function equipeParaCopiaDemo(lojaId: string): UsuarioDaLoja[] {
  return lerDaLoja<UsuarioGuardado>(CHAVES.usuarios, lojaId).map(publico);
}

/** O histórico da loja como está guardado, para a cópia de segurança. Só para consulta: a restauração não o troca. */
export function historicoParaCopiaDemo(lojaId: string): unknown[] {
  return lerDaLoja<RegistroAuditoria>(CHAVES.auditoria, lojaId);
}

/** Histórico (auditoria) da loja: só acrescenta. Sem dado pessoal nos detalhes. */
export function registrarAuditoriaDemo(
  lojaId: string,
  usuarioId: string | null,
  acao: AcaoAuditoria,
  alvo: { tipo: string; id: string } | null = null,
  detalhes: Record<string, unknown> = {},
  agora = new Date(),
): void {
  const lista = lerDaLoja<RegistroAuditoria>(CHAVES.auditoria, lojaId);
  const novo: RegistroAuditoria = { id: novoId(), acao, usuarioId, alvoTipo: alvo?.tipo ?? null, alvoId: alvo?.id ?? null, detalhes, criadoEm: agora.toISOString() };
  gravarDaLoja(CHAVES.auditoria, lojaId, [...lista, novo].slice(-MAX_AUDITORIA));
}

// ---------------------------------------------------------------- entrar

export type ResultadoEntradaDemo = { ok: true; lojaId: string; usuario: UsuarioDaLoja } | { ok: false; mensagem: string };

/** Tentativas com login que não existe: o mesmo bloqueio (o bloqueio não revela quem existe). */
const semUsuario = new Map<string, EstadoTentativas>();

export async function entrarDemo(
  subdominio: string,
  usuario: string,
  senha: string,
  { agora = () => new Date(), atrasoMs = 250 }: { agora?: () => Date; atrasoMs?: number } = {},
): Promise<ResultadoEntradaDemo> {
  await esperar(atrasoMs);
  const loja = LOJAS_DEMO.find((l) => l.subdominio === subdominio);
  if (!loja) return { ok: false, mensagem: 'Loja não encontrada. Confira o endereço.' };
  return comTrava(() => entrarNaLoja(loja.id, usuario, senha, agora));
}

async function entrarNaLoja(lojaId: string, usuario: string, senha: string, agora: () => Date): Promise<ResultadoEntradaDemo> {
  const loja = { id: lojaId };
  const login = normalizarLogin(usuario);
  if (login === LOGIN_SUPORTE) return entrarComoSuporte(lojaId, senha, agora);
  const u = (await usuariosDaLoja(loja.id)).find((x) => x.usuario === login);

  if (!u) {
    const chave = `${loja.id}:${login}`;
    const estado = semUsuario.get(chave) ?? SEM_TENTATIVAS;
    const sit = situacaoBloqueio(estado, agora());
    if (sit.bloqueado) return { ok: false, mensagem: mensagemBloqueado(sit.restanteSegundos) };
    await conferirHashDemo(senha, null);
    const r = aposSenhaErrada(estado, agora());
    semUsuario.set(chave, r.estado);
    return { ok: false, mensagem: r.bloqueou ? MENSAGEM_ACABOU_DE_BLOQUEAR : MENSAGEM_CREDENCIAIS };
  }

  const sit = situacaoBloqueio(estadoDe(u), agora());
  if (sit.bloqueado) return { ok: false, mensagem: mensagemBloqueado(sit.restanteSegundos) };
  if (!(await conferirHashDemo(senha, u.senhaHash))) {
    const r = aposSenhaErrada(estadoDe(u), agora());
    transacao(() => {
      salvarUsuario(loja.id, comEstado(u, r.estado));
      registrarAuditoriaDemo(loja.id, null, r.bloqueou ? 'sessao.bloqueado' : 'sessao.senha_errada', { tipo: 'usuario', id: u.id }, {}, agora());
    });
    return { ok: false, mensagem: r.bloqueou ? MENSAGEM_ACABOU_DE_BLOQUEAR : MENSAGEM_CREDENCIAIS };
  }
  if (!u.ativo) return { ok: false, mensagem: 'Seu acesso a esta loja está desativado. Fale com o Dono da loja.' };
  const entrou: UsuarioGuardado = { ...u, tentativasErradas: 0, bloqueadoAte: null, ultimoAcessoEm: agora().toISOString() };
  transacao(() => {
    salvarUsuario(loja.id, entrou);
    registrarAuditoriaDemo(loja.id, u.id, 'sessao.entrou', null, {}, agora());
  });
  return { ok: true, lojaId: loja.id, usuario: publico(entrou) };
}

/** O Adm. Sup entra em qualquer loja; as senhas erradas contam no cadastro dele (o mesmo bloqueio de todos). */
async function entrarComoSuporte(lojaId: string, senha: string, agora: () => Date): Promise<ResultadoEntradaDemo> {
  const u = await suporte();
  const sit = situacaoBloqueio(estadoDe(u), agora());
  if (sit.bloqueado) return { ok: false, mensagem: mensagemBloqueado(sit.restanteSegundos) };
  if (!(await conferirHashDemo(senha, u.senhaHash))) {
    const r = aposSenhaErrada(estadoDe(u), agora());
    gravar(CHAVES.suporte, comEstado(u, r.estado));
    return { ok: false, mensagem: r.bloqueou ? MENSAGEM_ACABOU_DE_BLOQUEAR : MENSAGEM_CREDENCIAIS };
  }
  const entrou: UsuarioGuardado = { ...u, tentativasErradas: 0, bloqueadoAte: null, ultimoAcessoEm: agora().toISOString() };
  transacao(() => {
    gravar(CHAVES.suporte, entrou);
    registrarAuditoriaDemo(lojaId, u.id, 'sessao.entrou', null, {}, agora());
  });
  return { ok: true, lojaId, usuario: publico(entrou) };
}

/**
 * Registra a saída no histórico (não espera: sair nunca fica preso numa gravação). `motivo` 'inatividade': saiu
 * sozinho por falta de uso (a aba "Meu usuário" mostra como cada sessão terminou).
 */
export function registrarSaidaDemo(lojaId: string, usuarioId: string, motivo: 'inatividade' | null = null, agora = new Date()): Promise<void> {
  return comTrava(() => registrarAuditoriaDemo(lojaId, usuarioId, 'sessao.saiu', null, motivo ? { motivo } : {}, agora)).catch(() => undefined);
}

/**
 * Como a pessoa logada está AGORA no cadastro (outra aba pode ter mudado o papel ou desativado).
 * null = não existe mais ou a loja ainda não tem a equipe gravada.
 */
export function usuarioGuardadoDemo(lojaId: string, usuarioId: string): UsuarioDaLoja | null {
  if (ehSuporte(usuarioId)) {
    const sup = ler<UsuarioGuardado | null>(CHAVES.suporte, null);
    return sup ? publico(sup) : null;
  }
  const u = lerDaLoja<UsuarioGuardado>(CHAVES.usuarios, lojaId).find((x) => x.id === usuarioId);
  return u ? publico(u) : null;
}

/** A loja já tem a equipe gravada? (antes disso, não há como conferir quem está logado) */
export const equipeGravadaDemo = (lojaId: string): boolean => Boolean(ler<Record<string, unknown>>(CHAVES.usuarios, {})[lojaId]);

// ---------------------------------------------------------------- autorização com senha (PDV)

/** Dono e Administrador ativos: quem pode autorizar desconto, brinde, cancelamento e devolução. */
export async function autorizadoresDemo(lojaId: string): Promise<{ id: string; nome: string; papel: PapelDeLoja }[]> {
  return (await usuariosDaLoja(lojaId))
    .filter((u): u is UsuarioGuardado & { papel: PapelDeLoja } => u.ativo && ehPapelDeLoja(u.papel) && pode(u, 'desconto.acima_do_limite'))
    .map((u) => ({ id: u.id, nome: u.nome, papel: u.papel }));
}

/**
 * Confere a senha de quem autoriza. A contagem de senhas erradas é a MESMA do login: errar a senha do
 * gerente 5 vezes no caixa bloqueia o gerente por 5 minutos (é tentativa de adivinhar a senha dele).
 */
export async function conferirAutorizadorDemo(
  lojaId: string,
  usuarioId: string,
  senha: string,
  agora: () => Date = () => new Date(),
): Promise<{ id: string; nome: string; papel: PapelDeLoja }> {
  const u = (await usuariosDaLoja(lojaId)).find((x): x is UsuarioGuardado & { papel: PapelDeLoja } => x.id === usuarioId && x.ativo && ehPapelDeLoja(x.papel) && pode(x, 'desconto.acima_do_limite'));
  if (!u) throw new ErroApi(403, 'Escolha quem vai autorizar (Dono ou Administrador ativo).');
  const sit = situacaoBloqueio(estadoDe(u), agora());
  if (sit.bloqueado) throw new ErroApi(429, mensagemBloqueado(sit.restanteSegundos));
  if (!(await conferirHashDemo(senha, u.senhaHash))) {
    const r = aposSenhaErrada(estadoDe(u), agora());
    transacao(() => {
      salvarUsuario(lojaId, comEstado(u, r.estado));
      registrarAuditoriaDemo(lojaId, null, r.bloqueou ? 'sessao.bloqueado' : 'sessao.senha_errada', { tipo: 'usuario', id: u.id }, {}, agora());
    });
    if (r.bloqueou) throw new ErroApi(429, MENSAGEM_ACABOU_DE_BLOQUEAR);
    throw new ErroApi(403, 'Senha incorreta.');
  }
  if (u.tentativasErradas > 0) salvarUsuario(lojaId, comEstado(u, SEM_TENTATIVAS));
  return { id: u.id, nome: u.nome, papel: u.papel };
}

// ---------------------------------------------------------------- tela Usuários e a própria conta

export interface OpcoesUsuariosDemo {
  lojaId: string;
  /** Quem está logado (id do usuário). */
  operadorId: string | null;
  agora?: () => Date;
  atrasoMs?: number;
  /** Nome de um produto ou cliente (para o histórico mostrar "Produto cadastrado: Ração 1kg"). */
  nomeDoAlvo?: (tipo: string, id: string) => string | null;
  /** Os nomes que a loja deu às contas do Financeiro ("Banco Itaú"), lidos na hora de mostrar o histórico. */
  nomesDasContas?: () => Partial<NomesDasContas> | null;
}

export function criarApiUsuariosDemo({
  lojaId,
  operadorId,
  agora = () => new Date(),
  atrasoMs = 120,
  nomeDoAlvo = () => null,
  nomesDasContas = () => null,
}: OpcoesUsuariosDemo): ApiUsuarios & ApiConta {
  const ator = async (): Promise<{ eu: UsuarioGuardado; todos: UsuarioGuardado[] }> => {
    await esperar(atrasoMs);
    if (!operadorId) throw new ErroApi(401, 'Faça login para continuar.');
    const todos = await usuariosDaLoja(lojaId);
    const eu = ehSuporte(operadorId) ? await suporte() : todos.find((u) => u.id === operadorId);
    if (!eu?.ativo) throw new ErroApi(401, 'Sua sessão terminou. Entre de novo.');
    return { eu, todos };
  };
  const exigirGestao = async () => {
    const r = await ator();
    if (!pode(r.eu, 'usuarios')) throw new ErroApi(403, mensagemSemPermissao('usuarios'));
    return r;
  };
  const regra = (u: UsuarioGuardado): UsuarioParaRegra => ({ id: u.id, papel: u.papel, ativo: u.ativo, permissoes: u.permissoes ?? null });
  const conferir = (eu: UsuarioGuardado, alvo: UsuarioGuardado | null, acao: Parameters<typeof conferirGestaoDeUsuario>[2], todos: UsuarioGuardado[]) => {
    const r = conferirGestaoDeUsuario(regra(eu), alvo && regra(alvo), acao, todos.map(regra));
    if (!r.ok) throw new ErroApi(403, r.erros[0]!.mensagem, r.erros);
  };
  const acharAlvo = (todos: UsuarioGuardado[], id: string) => {
    const alvo = todos.find((u) => u.id === id);
    if (!alvo) throw new ErroApi(404, 'Usuário não encontrado.');
    return alvo;
  };
  const auditar = (acao: AcaoAuditoria, alvoId: string | null, detalhes: Record<string, unknown> = {}) =>
    registrarAuditoriaDemo(lojaId, operadorId, acao, alvoId ? { tipo: 'usuario', id: alvoId } : null, detalhes, agora());

  return {
    async listarUsuarios() {
      const { todos } = await exigirGestao();
      return [...todos].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR')).map(publico);
    },

    criarUsuario(dados) {
      return comTrava(async () => {
        const { eu, todos } = await exigirGestao();
        const v = validarNovoUsuario(dados);
        if (!v.ok) throw new ErroApi(400, 'Dados do usuário inválidos.', v.erros);
        conferir(eu, null, { tipo: 'criar', papel: v.valor.papel, ...(v.valor.permissoes ? { permissoes: v.valor.permissoes } : {}) }, todos);
        if (todos.some((u) => u.usuario === v.valor.usuario) || v.valor.usuario === LOGIN_SUPORTE) {
          throw new ErroApi(409, `Já existe o usuário "${v.valor.usuario}" nesta loja. Escolha outro login.`, [{ campo: 'usuario', mensagem: 'Já usado nesta loja.' }]);
        }
        const novo: UsuarioGuardado = {
          id: novoId(),
          nome: v.valor.nome,
          usuario: v.valor.usuario,
          papel: v.valor.papel,
          ...(v.valor.permissoes ? { permissoes: v.valor.permissoes } : {}),
          ativo: true,
          senhaHash: await gerarHashDemo(v.valor.senha),
          senhaProvisoria: true,
          tentativasErradas: 0,
          bloqueadoAte: null,
          ultimoAcessoEm: null,
          criadoEm: agora().toISOString(),
        };
        transacao(() => {
          salvarUsuario(lojaId, novo);
          auditar('usuario.criado', novo.id, { papel: novo.papel, ...(novo.permissoes ? { permissoes: novo.permissoes } : {}) });
        });
        return publico(novo);
      });
    },

    alterarUsuario(id, mudanca) {
      return comTrava(async () => {
        const { eu, todos } = await exigirGestao();
        const v = validarAlteracaoUsuario(mudanca);
        if (!v.ok) throw new ErroApi(400, 'Dados do usuário inválidos.', v.erros);
        const alvo = acharAlvo(todos, id);
        conferir(eu, alvo, { tipo: 'alterar', mudanca: v.valor }, todos);
        const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        const campos = (Object.keys(v.valor) as (keyof typeof v.valor)[]).filter((k) => !igual(v.valor[k], alvo[k]));
        if (campos.length === 0) return publico(alvo);
        const salvo: UsuarioGuardado = { ...alvo, ...Object.fromEntries(campos.map((k) => [k, v.valor[k]])) };
        // funções só no Personalizado: quem deixa de ser Personalizado perde a lista
        if (salvo.papel !== 'personalizado' && salvo.permissoes) {
          delete salvo.permissoes;
          if (alvo.permissoes && !campos.includes('permissoes')) campos.push('permissoes');
        }
        transacao(() => {
          salvarUsuario(lojaId, salvo);
          if (campos.includes('ativo')) auditar(salvo.ativo ? 'usuario.reativado' : 'usuario.desativado', id);
          const outros = campos.filter((k) => k !== 'ativo');
          if (outros.length > 0) {
            auditar('usuario.alterado', id, {
              campos: outros,
              ...(outros.includes('papel') ? { papelAntes: alvo.papel, papelDepois: salvo.papel } : {}),
              ...(outros.includes('permissoes') ? { permissoes: salvo.permissoes ?? [] } : {}),
            });
          }
        });
        return publico(salvo);
      });
    },

    redefinirSenhaUsuario(id, senha) {
      return comTrava(async () => {
        const { eu, todos } = await exigirGestao();
        const alvo = acharAlvo(todos, id);
        conferir(eu, alvo, { tipo: 'redefinir_senha' }, todos);
        const v = validarSenhaNova(senha, { usuario: alvo.usuario, nome: alvo.nome });
        if (!v.ok) throw new ErroApi(400, v.erros[0]!.mensagem, v.erros);
        const senhaHash = await gerarHashDemo(v.valor);
        transacao(() => {
          salvarUsuario(lojaId, { ...alvo, senhaHash, senhaProvisoria: true, tentativasErradas: 0, bloqueadoAte: null });
          auditar('usuario.senha_redefinida', id);
        });
      });
    },

    excluirDadosUsuario(id) {
      return comTrava(async () => {
        const { eu, todos } = await exigirGestao();
        const alvo = acharAlvo(todos, id);
        conferir(eu, alvo, { tipo: 'excluir_dados' }, todos);
        const salvo: UsuarioGuardado = {
          ...alvo,
          nome: NOME_USUARIO_REMOVIDO,
          usuario: `removido-${novoId().replace(/-/g, '').slice(-24)}`,
          senhaHash: null,
          senhaProvisoria: true,
          tentativasErradas: 0,
          bloqueadoAte: null,
          ultimoAcessoEm: null,
          foto: null,
        };
        transacao(() => {
          salvarUsuario(lojaId, salvo);
          auditar('usuario.dados_excluidos', id);
        });
        return publico(salvo);
      });
    },

    async listarAuditoria(limite = 40) {
      const { todos } = await exigirGestao();
      const nome = new Map<string, string>([[ID_SUPORTE, NOME_SUPORTE], ...todos.map((u): [string, string] => [u.id, u.nome])]);
      const nomeDaPessoa = (id: string) => nome.get(id) ?? null;
      const nomeDe = (tipo: string, id: string) => (tipo === 'usuario' ? nomeDaPessoa(id) : nomeDoAlvo(tipo, id));
      const contas = nomesDasContas();
      return lerDaLoja<RegistroAuditoria>(CHAVES.auditoria, lojaId)
        .slice(-limite)
        .reverse()
        .map(
          (r): ItemAuditoria => ({
            id: r.id,
            acao: r.acao,
            texto: ACOES_AUDITORIA[r.acao] ?? r.acao,
            quem: r.usuarioId ? nomeDaPessoa(r.usuarioId) : null,
            alvo: r.alvoTipo && r.alvoId ? { tipo: r.alvoTipo, id: r.alvoId, nome: nomeDe(r.alvoTipo, r.alvoId) } : null,
            detalhes: r.detalhes,
            resumo: resumirAuditoria(r.acao, r.detalhes, nomeDaPessoa, contas),
            criadoEm: r.criadoEm,
          }),
        );
    },

    trocarMinhaSenha(senhaAtual, senhaNova) {
      return comTrava(async () => {
        const { eu } = await ator();
        const sit = situacaoBloqueio(estadoDe(eu), agora());
        if (sit.bloqueado) throw new ErroApi(429, mensagemBloqueado(sit.restanteSegundos));
        if (!(await conferirHashDemo(senhaAtual, eu.senhaHash))) {
          const r = aposSenhaErrada(estadoDe(eu), agora());
          transacao(() => {
            salvarEu(lojaId, comEstado(eu, r.estado));
            if (r.bloqueou) registrarAuditoriaDemo(lojaId, null, 'sessao.bloqueado', { tipo: 'usuario', id: eu.id }, {}, agora());
          });
          if (r.bloqueou) throw new ErroApi(429, MENSAGEM_ACABOU_DE_BLOQUEAR, [], 'sessao_encerrada');
          throw new ErroApi(400, 'A senha atual não confere.', [{ campo: 'senhaAtual', mensagem: 'Senha atual errada.' }]);
        }
        const v = validarSenhaNova(senhaNova, { usuario: eu.usuario, nome: eu.nome });
        if (!v.ok) throw new ErroApi(400, v.erros[0]!.mensagem, v.erros.map((e) => ({ ...e, campo: 'senhaNova' })));
        if (senhaNova === senhaAtual) throw new ErroApi(400, 'A senha nova precisa ser diferente da atual.', [{ campo: 'senhaNova', mensagem: 'Igual à atual.' }]);
        const senhaHash = await gerarHashDemo(senhaNova);
        transacao(() => {
          salvarEu(lojaId, { ...eu, senhaHash, senhaProvisoria: false, tentativasErradas: 0, bloqueadoAte: null });
          auditar('usuario.senha_trocada', eu.id);
        });
      });
    },

    // aba "Meu usuário" (pedido do Luan, 25/11/2026): cada pessoa vê e muda só o que é dela
    async meuPerfil() {
      const { eu } = await ator();
      return publico(eu);
    },

    salvarMinhaFoto(foto) {
      return comTrava(async () => {
        const { eu } = await ator();
        const r = lerFotoDoPerfil(foto);
        if (!r.ok) throw new ErroApi(400, r.erros[0]!.mensagem, r.erros);
        if ((eu.foto ?? null) === r.valor) return publico(eu);
        const salvo: UsuarioGuardado = { ...eu, foto: r.valor };
        transacao(() => {
          salvarEu(lojaId, salvo);
          auditar('usuario.foto_alterada', eu.id, r.valor ? {} : { tirou: true });
        });
        return publico(salvo);
      });
    },

    async meusAcessos() {
      const { eu } = await ator();
      return acessosDaPessoa(lerDaLoja<RegistroAuditoria>(CHAVES.auditoria, lojaId).filter((r) => r.usuarioId === eu.id));
    },
  };
}
