// packages/core/src/dinheiro.ts
// Dinheiro é sempre inteiro em centavos dentro do sistema. Nada de float.

/** Maior valor que cabe numa coluna INTEGER do Postgres. Limite técnico, não regra de negócio. */
export const CENTAVOS_MAX = 2_147_483_647;

const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 1250 -> "R$ 12,50" (com espaço não separável, padrão do Intl). */
export function formatarCentavos(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError('centavos deve ser inteiro');
  }
  // -0 (ex.: uma soma de faltas vazia com o sinal trocado) aparece como "R$ 0,00", sem o "-"
  return formatador.format(centavos === 0 ? 0 : centavos / 100);
}

/**
 * Converte o que a pessoa digitou em centavos, sem passar por float.
 * Aceita: "12", "12,5", "12,50", "1.234,56", "R$ 1.234,56", "12.50".
 * Recusa (retorna null): vazio, negativo, mais de 2 casas decimais, letras.
 *
 * Regra do ponto sem vírgula: "12.50" (1 ou 2 dígitos após o ponto) é decimal;
 * "1.234" ou "1.234.567" (grupos de 3) é separador de milhar.
 */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, ''); // \s do JS já cobre o espaço não separável (U+00A0)
  if (limpo === '') return null;

  let inteiro: string;
  let fracao: string;

  if (limpo.includes(',')) {
    const partes = limpo.split(',');
    if (partes.length !== 2) return null;
    inteiro = partes[0] ?? '';
    fracao = partes[1] ?? '';
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(inteiro)) return null;
    inteiro = inteiro.replace(/\./g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    inteiro = limpo.replace(/\./g, '');
    fracao = '';
  } else {
    const partes = limpo.split('.');
    if (partes.length > 2) return null;
    inteiro = partes[0] ?? '';
    fracao = partes[1] ?? '';
    if (!/^\d+$/.test(inteiro)) return null;
  }

  if (!/^\d{0,2}$/.test(fracao)) return null;
  if (inteiro === '') return null;

  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos > CENTAVOS_MAX) return null;
  return centavos;
}
