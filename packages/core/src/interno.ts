// packages/core/src/interno.ts
// Utilidades usadas pelas validações do core. NÃO fazem parte da API pública (fora do index.ts).

/** Caracteres de controle (inclui \n, \t, NUL): recusados em nomes, motivos e descrições. */
export const CONTROLE = /[\u0000-\u001f\u007f]/;

export const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** "529.982.247-25" -> "52998224725". */
export const soDigitos = (t: unknown): string => String(t ?? '').replace(/\D/g, '');
