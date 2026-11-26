// packages/core/src/resultado.ts
// Tipo de retorno padrão das validações do core: nunca lança exceção para
// erro de entrada do usuário; devolve a lista de problemas por campo.

export interface ErroCampo {
  campo: string;
  mensagem: string;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erros: ErroCampo[] };
