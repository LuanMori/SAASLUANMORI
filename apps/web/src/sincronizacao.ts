// apps/web/src/sincronizacao.ts
// "Os dados mudaram por fora": outra aba (na demonstração) ou outro computador gravou algo. As telas que
// carregam dados (usarCarga) recarregam sozinhas, mantendo o que a pessoa está digitando.
// A demonstração avisa a partir do evento "storage" do navegador (armazenamento.ts → DemoApp).
const ouvintes = new Set<() => void>();

export function avisarQueOsDadosMudaram(): void {
  ouvintes.forEach((f) => f());
}

/** Devolve a função que para de ouvir. */
export function aoMudaremOsDados(f: () => void): () => void {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}
