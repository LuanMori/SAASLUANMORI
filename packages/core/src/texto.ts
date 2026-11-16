// packages/core/src/texto.ts
/** Sem acento, em minúsculas e sem espaço nas pontas: para buscar "racao" e achar "Ração". */
export function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
