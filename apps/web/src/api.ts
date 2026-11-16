// apps/web/src/api.ts
// Cliente HTTP da API. O token do Auth0 vai no Authorization; a LOJA não é
// enviada pelo frontend em lugar nenhum — a API descobre pelo token.
import type {
  AcaoAutorizada,
  Devolucao,
  DevolucaoComVenda,
  ErroCampo,
  NovaVenda,
  NovoProduto,
  PapelDeLoja,
  PedidoCancelamento,
  PedidoDevolucao,
  Venda,
} from '@saas/core';

export interface Produto {
  id: string;
  /** Gerado pelo sistema: "0001", "0002", … */
  codigoInterno: string;
  codigoBarras: string | null;
  nome: string;
  precoCentavos: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export class ErroApi extends Error {
  constructor(
    /** 0 = sem conexão / sem resposta. */
    readonly status: number,
    mensagem: string,
    readonly erros: ErroCampo[] = [],
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export interface ApiProdutos {
  listarProdutos(): Promise<Produto[]>;
  criarProduto(dados: NovoProduto): Promise<Produto>;
}

export function criarApi(urlBase: string, obterToken: () => Promise<string>): ApiProdutos {
  async function chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    let token: string;
    try {
      token = await obterToken();
    } catch {
      throw new ErroApi(401, 'Sua sessão expirou. Entre novamente.');
    }

    let resposta: Response;
    try {
      resposta = await fetch(`${urlBase}${caminho}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch {
      throw new ErroApi(0, 'Sem conexão com o servidor. Verifique a internet.');
    }

    const corpo: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const c = (corpo ?? {}) as { mensagem?: unknown; erros?: unknown };
      throw new ErroApi(
        resposta.status,
        typeof c.mensagem === 'string' ? c.mensagem : 'Algo deu errado. Tente novamente.',
        Array.isArray(c.erros) ? (c.erros as ErroCampo[]) : [],
      );
    }
    return corpo as T;
  }

  return {
    listarProdutos: async () => (await chamar<{ itens: Produto[] }>('/produtos')).itens,
    criarProduto: (dados) => chamar<Produto>('/produtos', { method: 'POST', body: JSON.stringify(dados) }),
  };
}

// ---- Vendas (Frente de caixa, Visão geral e Relatórios)
// Quem vendeu e os preços de tabela não são enviados: a API usa a pessoa logada e o
// cadastro de produtos (ver @saas/core/venda). Desconto acima do permitido, brinde,
// cancelamento e devolução feitos pelo Vendedor levam uma autorização dada com senha.

export interface FiltroVendas {
  /** Dia inicial (AAAA-MM-DD), inclusive, no fuso da loja. */
  de?: string | null;
  /** Dia final (AAAA-MM-DD), inclusive, no fuso da loja. */
  ate?: string | null;
}

/** Quem pode autorizar (Dono ou Administrador ativo da loja). */
export interface Autorizador {
  id: string;
  nome: string;
  papel: PapelDeLoja;
}

export interface PedidoAutorizacao {
  /** Quem autoriza (um dos autorizadores). */
  usuarioId: string;
  senha: string;
  /** O que fica autorizado (uma vez só, por 4 horas). */
  acao: AcaoAutorizada;
}

export interface ApiVendas {
  listarVendas(filtro?: FiltroVendas): Promise<Venda[]>;
  criarVenda(dados: NovaVenda): Promise<Venda>;
  listarAutorizadores(): Promise<Autorizador[]>;
  /** Confere a senha de quem autoriza e devolve o identificador da autorização. */
  autorizar(pedido: PedidoAutorizacao): Promise<{ autorizacao: string; autorizador: Autorizador }>;
  cancelarVenda(vendaId: string, pedido: PedidoCancelamento): Promise<Venda>;
  devolverItens(vendaId: string, pedido: PedidoDevolucao): Promise<{ venda: Venda; devolucao: Devolucao }>;
  /** Devoluções feitas no período (pela data da devolução, não da venda). */
  listarDevolucoes(filtro?: FiltroVendas): Promise<DevolucaoComVenda[]>;
}

/** O que a área logada usa: produtos (para a Frente de caixa) e vendas. */
export type ApiPainel = ApiProdutos & ApiVendas;
