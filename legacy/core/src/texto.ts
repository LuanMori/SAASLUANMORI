// packages/core/src/texto.ts
// Textos digitados (nomes, motivos, descrições) são guardados em NFC: o "ç" que o Mac manda em duas
// partes (c + cedilha) vira o mesmo "ç" do Windows. Sem isso, a busca e a comparação falham (item 4.5).
/** Sem acento, em minúsculas e sem espaço nas pontas: para buscar "racao" e achar "Ração". */
export function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
