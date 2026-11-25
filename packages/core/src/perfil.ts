// packages/core/src/perfil.ts
// "Meu usuário" (pedido do Luan, 25/11/2026): a foto do perfil e as entradas e saídas da pessoa no sistema
// (DaniPets USR-07, "Meus acessos": cada pessoa vê os próprios acessos, inclusive o Vendedor).
//   - foto: imagem PNG, JPEG ou WebP em data URL, já reduzida pelo navegador. Cada pessoa troca só a própria;
//   - entradas e saídas: montadas a partir do histórico ("Entrou no sistema" e "Saiu do sistema"). A saída pode ser
//     pelo botão Sair ou por falta de uso. Entrada sem saída registrada é a sessão de agora (a mais recente) ou uma
//     sessão em que o sistema foi fechado sem clicar em Sair.
import { ehObjeto } from './interno';
import type { Resultado } from './resultado';

export const LIMITES_FOTO = {
  /** Tamanho do data URL (a foto reduzida a 256 px fica bem abaixo disso). */
  maxCaracteres: 150_000,
} as const;

const FORMATO_FOTO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export const MENSAGENS_FOTO = {
  formato: 'A foto precisa ser uma imagem PNG, JPEG ou WebP.',
  grande: 'A foto é grande demais. Use uma imagem menor (até 100 KB).',
} as const;

/** Confere a foto do perfil. null, undefined ou vazio = sem foto (tira a que havia). */
export function lerFotoDoPerfil(v: unknown): Resultado<string | null> {
  if (v === null || v === undefined || v === '') return { ok: true, valor: null };
  if (typeof v !== 'string' || !FORMATO_FOTO.test(v)) return { ok: false, erros: [{ campo: 'foto', mensagem: MENSAGENS_FOTO.formato }] };
  if (v.length > LIMITES_FOTO.maxCaracteres) return { ok: false, erros: [{ campo: 'foto', mensagem: MENSAGENS_FOTO.grande }] };
  return { ok: true, valor: v };
}

/** Como a pessoa saiu: pelo botão Sair ou porque o sistema ficou sem uso. */
export type ComoSaiu = 'sair' | 'inatividade';

/** Uma entrada no sistema e a saída dela. */
export interface AcessoDoUsuario {
  /** ISO. null = a entrada já saiu do histórico (ele guarda só os registros mais recentes). */
  entrada: string | null;
  /** ISO. null = sem saída registrada: é a sessão de agora, ou o sistema foi fechado sem clicar em Sair. */
  saida: string | null;
  /** null = sem saída registrada. */
  como: ComoSaiu | null;
  /** A sessão de agora: a entrada mais recente, ainda sem saída. */
  atual: boolean;
}

/** O que o histórico guarda de cada entrada e saída (só da pessoa). */
export interface RegistroDeSessao {
  acao: string;
  criadoEm: string;
  detalhes?: unknown;
}

/** Quantas entradas e saídas a aba mostra. */
export const ACESSOS_MAX = 30;

/**
 * As entradas e saídas da pessoa, da mais recente para a mais antiga: cada "Entrou" com o "Saiu" seguinte. Duas
 * entradas seguidas: a primeira ficou sem saída registrada. A última entrada sem saída é a sessão de agora.
 */
export function acessosDaPessoa(registros: readonly RegistroDeSessao[], limite: number = ACESSOS_MAX): AcessoDoUsuario[] {
  const ordem = registros
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.acao === 'sessao.entrou' || r.acao === 'sessao.saiu')
    .sort((a, b) => a.r.criadoEm.localeCompare(b.r.criadoEm) || a.i - b.i)
    .map(({ r }) => r);
  const lista: AcessoDoUsuario[] = [];
  let aberto: AcessoDoUsuario | null = null;
  for (const r of ordem) {
    if (r.acao === 'sessao.entrou') {
      if (aberto) lista.push(aberto);
      aberto = { entrada: r.criadoEm, saida: null, como: null, atual: false };
      continue;
    }
    const como: ComoSaiu = ehObjeto(r.detalhes) && r.detalhes.motivo === 'inatividade' ? 'inatividade' : 'sair';
    lista.push(aberto ? { ...aberto, saida: r.criadoEm, como } : { entrada: null, saida: r.criadoEm, como, atual: false });
    aberto = null;
  }
  if (aberto) lista.push({ ...aberto, atual: true });
  return lista.reverse().slice(0, Math.max(0, limite));
}

/** Quanto tempo a pessoa ficou (em minutos inteiros). `agora` conta para a sessão de agora; null = não dá para saber. */
export function minutosDoAcesso(a: AcessoDoUsuario, agora: Date): number | null {
  if (!a.entrada) return null;
  const fim = a.saida ? Date.parse(a.saida) : a.atual ? agora.getTime() : null;
  if (fim === null) return null;
  const min = Math.floor((fim - Date.parse(a.entrada)) / 60_000);
  return Number.isFinite(min) && min >= 0 ? min : null;
}

/** "45 min", "2 h", "2 h 05 min", "menos de 1 min". */
export function formatarDuracao(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}
