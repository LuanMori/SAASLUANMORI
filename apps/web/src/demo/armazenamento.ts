// apps/web/src/demo/armazenamento.ts
// SÓ PARA A DEMONSTRAÇÃO: o "banco" é o localStorage do navegador, uma chave por assunto, com as
// listas separadas por loja. Sem localStorage (aba anônima restrita), fica na memória da aba.
export type PorLoja<T> = Record<string, T[]>;

const memoria: Record<string, unknown> = {};

export function ler<T>(chave: string, vazio: T): T {
  try {
    const texto = localStorage.getItem(chave);
    return texto ? (JSON.parse(texto) as T) : vazio;
  } catch {
    // Sem localStorage (ou dado corrompido): usa a cópia em memória desta aba.
    return (memoria[chave] as T | undefined) ?? vazio;
  }
}

export function gravar(chave: string, valor: unknown): void {
  memoria[chave] = valor;
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Navegador sem localStorage (ex.: aba anônima restrita): fica só na memória.
  }
}

export const lerDaLoja = <T,>(chave: string, lojaId: string): T[] => ler<PorLoja<T>>(chave, {})[lojaId] ?? [];
export const gravarDaLoja = <T,>(chave: string, lojaId: string, lista: T[]) => gravar(chave, { ...ler<PorLoja<T>>(chave, {}), [lojaId]: lista });

