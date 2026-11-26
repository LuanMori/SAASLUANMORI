// apps/web/src/demo/armazenamento.ts
// SÓ PARA A DEMONSTRAÇÃO: o "banco" é o localStorage do navegador, uma chave por assunto, com as
// listas separadas por loja. Faz aqui o que o Postgres faz no servidor (Fase 2, módulo 1):
//   - TUDO OU NADA (transacao): as gravações de uma operação (venda + estoque + financeiro + histórico)
//     ficam guardadas até o fim e vão juntas; se o navegador recusar uma delas (armazenamento cheio),
//     as que já foram são desfeitas e a operação inteira é recusada. Nada fica pela metade.
//   - UMA OPERAÇÃO POR VEZ entre as abas (comTrava, com Web Locks): duas abas vendendo ao mesmo tempo
//     não sobrescrevem a venda uma da outra (DaniPets ACE-12: lá era uma aba só; aqui várias, sincronizadas).
//   - AVISO quando o navegador recusa gravar (DaniPets ACE-13) ou não deixa guardar nada (aba anônima
//     restrita, visualização de e-mail): a tela mostra um aviso fixo (situacaoGravacao).
//   - AS OUTRAS ABAS FICAM SABENDO (aoMudarEmOutraAba): quando uma aba grava, as outras recarregam.
import { ErroApi } from '../api';

export type PorLoja<T> = Record<string, T[]>;

export type SituacaoGravacao =
  | { tipo: 'ok' }
  /** O navegador recusou gravar (ex.: armazenamento cheio). A operação foi desfeita. */
  | { tipo: 'falhou'; desde: string; mensagem: string }
  /** Este navegador não deixa guardar nada: os dados ficam só nesta aba e somem ao fechar. */
  | { tipo: 'so-memoria' };

export const MENSAGEM_CHEIO = 'O armazenamento do navegador está cheio. Nada foi salvo nesta operação.';
export const MENSAGEM_RECUSOU = 'O navegador recusou gravar. Nada foi salvo nesta operação.';

/** O navegador recusou gravar: a operação foi desfeita por inteiro. */
export class ErroGravacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroGravacao';
  }
}

const SONDA = 'saas-demo:sonda';
const NOME_DA_TRAVA = 'saas-demo:gravacao';

let armazenamento: Storage | null = null;
const memoria = new Map<string, string>();
/** Gravações da transação em andamento (null = fora de transação). */
let pendente: Map<string, string> | null = null;
let situacao: SituacaoGravacao = { tipo: 'ok' };
const ouvintesSituacao = new Set<(s: SituacaoGravacao) => void>();

/** O navegador recusou por falta de espaço? (DOMException nem sempre é "instanceof Error") */
const ehCheio = (e: unknown) => {
  const { name = '', message = '' } = (typeof e === 'object' && e !== null ? e : {}) as { name?: string; message?: string };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(String(message));
};

function mudarSituacao(nova: SituacaoGravacao): void {
  situacao = nova;
  ouvintesSituacao.forEach((f) => f(nova));
}

/** Descobre se dá para guardar no navegador (e se há espaço). */
function conectar(s: Storage | null): void {
  armazenamento = s;
  if (!s) {
    mudarSituacao({ tipo: 'so-memoria' });
    return;
  }
  try {
    s.setItem(SONDA, '1');
    s.removeItem(SONDA);
    mudarSituacao({ tipo: 'ok' });
  } catch (e) {
    mudarSituacao({ tipo: 'falhou', desde: new Date().toISOString(), mensagem: ehCheio(e) ? MENSAGEM_CHEIO : MENSAGEM_RECUSOU });
  }
}

function localStorageDoNavegador(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s.getItem(SONDA); // em aba anônima restrita, até ler dá erro
    return s;
  } catch {
    return null;
  }
}

conectar(localStorageDoNavegador());

/** SÓ PARA TESTES: troca o armazenamento (null = navegador que não deixa guardar). Limpa a memória. */
export function usarArmazenamentoParaTeste(s: Storage | null): void {
  memoria.clear();
  pendente = null;
  conectar(s);
}

export const situacaoGravacao = (): SituacaoGravacao => situacao;

/** Quantos caracteres a demonstração ocupa no navegador (chaves e valores; null = sem acesso ao armazenamento). */
export function caracteresGuardados(): number | null {
  if (!armazenamento) return [...memoria].reduce((t, [k, v]) => t + k.length + v.length, 0);
  try {
    let total = 0;
    for (let i = 0; i < armazenamento.length; i++) {
      const k = armazenamento.key(i);
      if (k) total += k.length + (armazenamento.getItem(k)?.length ?? 0);
    }
    return total;
  } catch {
    return null;
  }
}

/** Avisa quando a situação muda (a tela mostra o aviso fixo). Devolve a função que para de avisar. */
export function aoMudarSituacao(f: (s: SituacaoGravacao) => void): () => void {
  ouvintesSituacao.add(f);
  return () => ouvintesSituacao.delete(f);
}

/** "Tentar gravar de novo": confere se o navegador voltou a aceitar. */
export function testarGravacao(): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.setItem(SONDA, String(Date.now()));
    armazenamento.removeItem(SONDA);
    if (situacao.tipo !== 'ok') mudarSituacao({ tipo: 'ok' });
    return true;
  } catch (e) {
    mudarSituacao({ tipo: 'falhou', desde: situacao.tipo === 'falhou' ? situacao.desde : new Date().toISOString(), mensagem: ehCheio(e) ? MENSAGEM_CHEIO : MENSAGEM_RECUSOU });
    return false;
  }
}

function lerTexto(chave: string): string | null {
  if (pendente?.has(chave)) return pendente.get(chave)!;
  if (!armazenamento) return memoria.get(chave) ?? null;
  try {
    return armazenamento.getItem(chave);
  } catch {
    return null;
  }
}

/** Lê o que está guardado (ou o que esta transação já gravou). Dado ilegível conta como vazio. */
export function ler<T>(chave: string, vazio: T): T {
  const texto = lerTexto(chave);
  if (texto === null) return vazio;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return vazio;
  }
}

/** Grava junto com as outras gravações da transação. Fora de transação, grava na hora (tudo ou nada da chave). */
export function gravar(chave: string, valor: unknown): void {
  const texto = JSON.stringify(valor);
  if (pendente) pendente.set(chave, texto);
  else efetivar(new Map([[chave, texto]]));
}

/** Grava todas as mudanças; se uma falhar, desfaz as anteriores e recusa (ErroGravacao). */
function efetivar(mudancas: ReadonlyMap<string, string>): void {
  if (mudancas.size === 0) return;
  if (!armazenamento) {
    for (const [k, v] of mudancas) memoria.set(k, v);
    return;
  }
  const antes: [string, string | null][] = [];
  try {
    for (const [k, v] of mudancas) {
      antes.push([k, armazenamento.getItem(k)]);
      armazenamento.setItem(k, v);
    }
  } catch (e) {
    for (const [k, v] of antes.reverse()) {
      try {
        if (v === null) armazenamento.removeItem(k);
        else armazenamento.setItem(k, v);
      } catch {
        // não deu nem para desfazer: a chave fica como o navegador deixou
      }
    }
    const mensagem = ehCheio(e) ? MENSAGEM_CHEIO : MENSAGEM_RECUSOU;
    mudarSituacao({ tipo: 'falhou', desde: situacao.tipo === 'falhou' ? situacao.desde : new Date().toISOString(), mensagem });
    throw new ErroGravacao(mensagem);
  }
  if (situacao.tipo === 'falhou') mudarSituacao({ tipo: 'ok' });
}

/**
 * TUDO OU NADA: as gravações feitas dentro de `fn` vão juntas no fim. Se `fn` der erro, nada é gravado;
 * se o navegador recusar, nada fica gravado (ErroGravacao). `fn` é síncrona (as esperas vêm antes).
 * Dentro de outra transação, faz parte dela.
 */
export function transacao<T>(fn: () => T): T {
  if (pendente) return fn();
  pendente = new Map();
  try {
    const r = fn();
    if (r instanceof Promise) throw new Error('transacao() é síncrona: faça as esperas antes de abrir a transação.');
    const mudancas = pendente;
    pendente = null;
    efetivar(mudancas);
    return r;
  } finally {
    pendente = null;
  }
}

let fila: Promise<unknown> = Promise.resolve();

/**
 * UMA OPERAÇÃO POR VEZ, em todas as abas deste navegador (Web Locks). Sem Web Locks, uma por vez nesta aba.
 * Só as operações de fora (as da API da demonstração) pegam a trava: nunca chame dentro de outra (travaria).
 * Se o navegador recusar a gravação, a tela recebe um erro da API (507), como receberia do servidor.
 */
export function comTrava<T>(fn: () => T | Promise<T>): Promise<T> {
  const executar = async (): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErroGravacao) throw new ErroApi(507, `${e.message} Veja o aviso vermelho no alto da tela.`, [], 'gravacao_recusada');
      throw e;
    }
  };
  const travas = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (travas?.request) return travas.request(NOME_DA_TRAVA, executar) as Promise<T>;
  const minha = fila.then(executar);
  fila = minha.catch(() => undefined);
  return minha;
}

/** Trava + tudo ou nada: o jeito de cada operação gravar. */
export const gravando = <T,>(fn: () => T): Promise<T> => comTrava(() => transacao(fn));

export const lerDaLoja = <T,>(chave: string, lojaId: string): T[] => ler<PorLoja<T>>(chave, {})[lojaId] ?? [];
export const gravarDaLoja = <T,>(chave: string, lojaId: string, lista: T[]) => gravar(chave, { ...ler<PorLoja<T>>(chave, {}), [lojaId]: lista });

/**
 * Avisa quando OUTRA aba deste navegador gravou dados da demonstração (evento "storage"), juntando as
 * gravações de uma mesma operação num aviso só. Devolve a função que para de avisar.
 */
export function aoMudarEmOutraAba(f: (chaves: string[]) => void, esperaMs = 60): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let chaves = new Set<string>();
  let relogio: ReturnType<typeof setTimeout> | null = null;
  const ouvir = (e: StorageEvent) => {
    if (e.key !== null && (!e.key.startsWith('saas-demo:') || e.key === SONDA)) return;
    chaves.add(e.key ?? '*');
    if (relogio) return;
    relogio = setTimeout(() => {
      const lista = [...chaves];
      chaves = new Set();
      relogio = null;
      f(lista);
    }, esperaMs);
  };
  window.addEventListener('storage', ouvir);
  return () => {
    window.removeEventListener('storage', ouvir);
    if (relogio) clearTimeout(relogio);
  };
}
