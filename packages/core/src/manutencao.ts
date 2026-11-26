// packages/core/src/manutencao.ts
// MANUTENÇÃO, ferramenta do Adm. Sup (Fase 2, módulo 13h; pedido do Luan, 25/11/2026: "para conseguirmos ter acesso
// mesmo quando vender"):
//   - CONFERIR O ESTOQUE: o saldo é sempre recalculado a partir dos movimentos; aqui aparecem os produtos que ficaram
//     com saldo negativo e os movimentos de produto que não existe mais. "Zerar o saldo" lança um ajuste (que fica no
//     histórico, como qualquer ajuste): nada é apagado;
//   - REGISTRO DE ERROS: o erro inesperado que acontece na tela de alguém da loja fica guardado (a mensagem técnica,
//     onde, em que aba, quem e quando), para o suporte ver sem precisar pedir print. Erro repetido em seguida vira
//     "N vezes" na mesma linha. Guarda os 100 mais novos de cada loja; o Adm. Sup pode limpar;
//   - o DIAGNÓSTICO (quantos registros, espaço, caixa) é montado pela API com as regras de cada assunto.
// Só o Adm. Sup vê e mexe (permissão 'suporte.ferramentas'). O registro de erros recebe de todos os logados.
import { CONTROLE, ehObjeto } from './interno';
import type { NovoMovimentoEstoque } from './estoque';
import type { Resultado } from './resultado';
import type { Operador } from './venda';

export const LIMITES_ERROS = { porLoja: 100, mensagemMax: 300, ondeMax: 200, telaMax: 40, juntarMs: 60_000 } as const;

export interface RegistroDeErro {
  id: string;
  /** A primeira vez (ISO). */
  em: string;
  /** A última vez que o mesmo erro aconteceu seguido (ISO). */
  ultimoEm: string;
  vezes: number;
  /** A mensagem técnica ("Cannot read properties of undefined (reading 'nome')"). */
  mensagem: string;
  /** Onde no código, quando o navegador diz (arquivo:linha:coluna ou o componente). */
  onde: string | null;
  /** A aba em que a pessoa estava ("frente-de-caixa"). */
  tela: string | null;
  /** Quem estava usando (id; o nome sai na hora de mostrar). */
  quem: string | null;
}

export type NovoErro = Pick<RegistroDeErro, 'mensagem' | 'onde' | 'tela'>;

/** Texto técnico de uma linha, sem caracteres de controle e cortado no tamanho máximo. */
const linha = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** O erro que a tela mandou: só textos, sem caractere de controle, cortados no tamanho máximo. */
export function lerErro(entrada: unknown): Resultado<NovoErro> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: 'erro', mensagem: 'Envie a mensagem do erro.' }] };
  const mensagem = linha(entrada.mensagem, LIMITES_ERROS.mensagemMax);
  if (!mensagem) return { ok: false, erros: [{ campo: 'mensagem', mensagem: 'Envie a mensagem do erro.' }] };
  return { ok: true, valor: { mensagem, onde: linha(entrada.onde, LIMITES_ERROS.ondeMax) || null, tela: linha(entrada.tela, LIMITES_ERROS.telaMax) || null } };
}

/**
 * Junta o erro novo ao registro: o mesmo erro (mensagem, lugar, aba e pessoa) logo em seguida vira "mais uma vez" na
 * mesma linha; senão entra uma linha nova. Fica só com os mais novos (LIMITES_ERROS.porLoja).
 */
export function juntarErro(lista: readonly RegistroDeErro[], novo: NovoErro, ctx: { id: string; em: string; quem: string | null }): RegistroDeErro[] {
  const ultimo = lista.at(-1);
  if (
    ultimo &&
    ultimo.mensagem === novo.mensagem &&
    ultimo.onde === novo.onde &&
    ultimo.tela === novo.tela &&
    ultimo.quem === ctx.quem &&
    Date.parse(ctx.em) - Date.parse(ultimo.ultimoEm) <= LIMITES_ERROS.juntarMs
  ) {
    return [...lista.slice(0, -1), { ...ultimo, vezes: ultimo.vezes + 1, ultimoEm: ctx.em }];
  }
  return [...lista, { id: ctx.id, em: ctx.em, ultimoEm: ctx.em, vezes: 1, ...novo, quem: ctx.quem }].slice(-LIMITES_ERROS.porLoja);
}

// ------------------------------------------------------------------ conferir o estoque

export interface SaldoNegativo {
  produtoId: string;
  nome: string;
  /** Unidades, ou gramas no produto vendido por kg (negativo). */
  saldo: number;
  unidade: string;
}

export interface ConferenciaDoEstoque {
  negativos: SaldoNegativo[];
  /** Movimentos de um produto que não existe mais (não mudam o saldo de nenhum produto da lista). */
  movimentosSemProduto: number;
}

/** Os produtos com saldo negativo (do mais negativo para o menos) e os movimentos sem produto. */
export function conferirEstoqueDaLoja(
  produtos: readonly { id: string; nome: string; unidade?: string | null }[],
  movimentos: readonly { produtoId: string; quantidade: number }[],
): ConferenciaDoEstoque {
  const saldos = new Map<string, number>();
  for (const m of movimentos) saldos.set(m.produtoId, (saldos.get(m.produtoId) ?? 0) + m.quantidade);
  const ids = new Set(produtos.map((p) => p.id));
  return {
    negativos: produtos
      .filter((p) => (saldos.get(p.id) ?? 0) < 0)
      .map((p) => ({ produtoId: p.id, nome: p.nome, saldo: saldos.get(p.id)!, unidade: p.unidade === 'kg' ? 'kg' : 'un' }))
      .sort((a, b) => a.saldo - b.saldo || a.nome.localeCompare(b.nome, 'pt-BR')),
    movimentosSemProduto: movimentos.filter((m) => !ids.has(m.produtoId)).length,
  };
}

export const MOTIVO_ZERAR_NEGATIVO = 'Manutenção do suporte: saldo negativo zerado';

/** O ajuste que leva o saldo negativo a zero (entra no histórico do produto como qualquer ajuste). */
export function ajusteParaZerar(produtoId: string, saldo: number, ctx: { em: string; por: Operador }): NovoMovimentoEstoque {
  return {
    produtoId,
    tipo: 'ajuste',
    quantidade: -saldo,
    criadoEm: ctx.em,
    motivo: MOTIVO_ZERAR_NEGATIVO,
    observacao: null,
    vendaId: null,
    vendaNumero: null,
    por: ctx.por,
  };
}
