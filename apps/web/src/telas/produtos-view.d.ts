import type { ApiProdutos } from '../api';

export interface Sessao {
  nome: string;
  loja: string | null;
}
export function montarProdutos(raiz: HTMLElement, api: ApiProdutos, aoSair: () => void, intervaloMs?: number): () => void;
export function mostrarSessao(raiz: HTMLElement, sessao: Sessao): void;
