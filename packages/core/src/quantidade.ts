// packages/core/src/quantidade.ts
// Como cada produto é vendido (DaniPets PRD-13 e PDV-02): por UNIDADE ou por QUILO (ração a granel).
// A quantidade é SEMPRE um número inteiro, como o dinheiro em centavos (diagnóstico, conflito C5):
//   - un: unidades (3 = 3 unidades);
//   - kg: gramas, os milésimos do quilo (1250 = 1,25 kg). O preço do produto é o preço do quilo.
// Assim não há número quebrado nem erro de arredondamento na venda, no estoque e na devolução.
// Dados antigos (sem unidade) são todos "un": nada muda neles.

export const UNIDADES_VENDA = ['un', 'kg'] as const;
export type UnidadeVenda = (typeof UNIDADES_VENDA)[number];

export const NOME_UNIDADE: Record<UnidadeVenda, string> = { un: 'Unidade (un)', kg: 'Quilo (kg, a granel)' };

export const ehUnidadeVenda = (v: unknown): v is UnidadeVenda => v === 'un' || v === 'kg';

/** O que vier de dados antigos ou estranhos vale como unidade. */
export const unidadeDe = (v: unknown): UnidadeVenda => (v === 'kg' ? 'kg' : 'un');

/** Maior quantidade de um produto numa venda: 9999 unidades ou 999,999 kg. */
export const QUANTIDADE_MAX: Record<UnidadeVenda, number> = { un: 9999, kg: 999_999 };

/** Quanto os botões + e − da Frente de caixa mudam (DaniPets: 1 unidade ou 0,5 kg). */
export const PASSO_QUANTIDADE: Record<UnidadeVenda, number> = { un: 1, kg: 500 };

const GRAMAS_NO_KG = 1000;

/** 3 -> "3 un"; 1250 (kg) -> "1,25 kg"; 500 (kg) -> "0,5 kg"; -2000 (kg) -> "-2 kg". */
export function formatarQuantidade(quantidade: number, unidade: UnidadeVenda = 'un'): string {
  if (unidade === 'un') return `${quantidade} un`;
  const sinal = quantidade < 0 ? '-' : '';
  const abs = Math.abs(quantidade);
  const inteiro = Math.floor(abs / GRAMAS_NO_KG);
  const fracao = String(abs % GRAMAS_NO_KG)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${sinal}${inteiro}${fracao ? `,${fracao}` : ''} kg`;
}

/** Só o número, sem a unidade (para preencher campos): 1250 (kg) -> "1,25"; 3 (un) -> "3". */
export const quantidadeParaTexto = (quantidade: number, unidade: UnidadeVenda = 'un'): string =>
  formatarQuantidade(quantidade, unidade).replace(/ (un|kg)$/, '');

/**
 * O que a pessoa digitou -> quantidade guardada. un: inteiro ("2"); kg: até 3 casas ("1,25" ou "1.25" -> 1250).
 * null = inválido (vazio, letras, negativo, unidade quebrada, mais de 3 casas no kg).
 */
export function lerQuantidade(texto: string, unidade: UnidadeVenda = 'un'): number | null {
  const t = String(texto ?? '').trim().replace(/\s*(un|kg)$/i, '').replace(',', '.');
  if (unidade === 'un') return /^\d+$/.test(t) ? Number(t) : null;
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * GRAMAS_NO_KG + Number((m[2] ?? '').padEnd(3, '0') || '0');
}

/** Valor de uma quantidade ao preço dado (o preço do kg, no kg), em centavos inteiros. */
export function valorDaQuantidade(precoCentavos: number, quantidade: number, unidade: UnidadeVenda = 'un'): number {
  return unidade === 'kg' ? Math.round((precoCentavos * quantidade) / GRAMAS_NO_KG) : precoCentavos * quantidade;
}

/** A quantidade é válida para a unidade (inteira, maior que zero e dentro do máximo)? */
export const quantidadeValida = (q: unknown, unidade: UnidadeVenda = 'un'): q is number =>
  typeof q === 'number' && Number.isInteger(q) && q > 0 && q <= QUANTIDADE_MAX[unidade];
