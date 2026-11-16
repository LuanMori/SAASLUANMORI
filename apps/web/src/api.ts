// apps/web/src/api.ts
// Cliente HTTP da API. O token do Auth0 vai no Authorization; a LOJA não é
// enviada pelo frontend em lugar nenhum — a API descobre pelo token.
import type {
  AcaoAutorizada,
  Cliente,
  ContaId,
  Devolucao,
  DevolucaoComVenda,
  ErroCampo,
  Lancamento,
  MovimentoEstoque,
  MovimentoManual,
  NovaVenda,
  NovoCliente,
  NovoLancamentoManual,
  NovoProduto,
  PapelDeLoja,
  PedidoCancelamento,
  PedidoDevolucao,
  Recebivel,
  ResumoAReceber,
  ResumoCliente,
  SituacaoEstoque,
  SituacaoRecebivel,
  TaxasCartao,
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
  /** O Vendedor só recebe as vendas de HOJE (de = até = hoje); outros períodos são dos Relatórios (Dono e Administrador). */
  listarVendas(filtro?: FiltroVendas): Promise<Venda[]>;
  /** Uma venda pelo número (para devolução ou cancelamento). 404 se não existir. */
  buscarVenda(numero: number): Promise<Venda>;
  criarVenda(dados: NovaVenda): Promise<Venda>;
  listarAutorizadores(): Promise<Autorizador[]>;
  /** Confere a senha de quem autoriza e devolve o identificador da autorização. 5 senhas erradas seguidas bloqueiam o autorizador por 1 minuto (429). */
  autorizar(pedido: PedidoAutorizacao): Promise<{ autorizacao: string; autorizador: Autorizador }>;
  cancelarVenda(vendaId: string, pedido: PedidoCancelamento): Promise<Venda>;
  devolverItens(vendaId: string, pedido: PedidoDevolucao): Promise<{ venda: Venda; devolucao: Devolucao }>;
  /** Devoluções feitas no período (pela data da devolução, não da venda). Para o Vendedor, só as de hoje. */
  listarDevolucoes(filtro?: FiltroVendas): Promise<DevolucaoComVenda[]>;
}

// ---- Estoque (alimentado pelas vendas, cancelamentos e devoluções)
// A aba Produtos e estoque ainda não tem tela: estas chamadas já ficam prontas para ela.

export interface SaldoEstoque {
  produtoId: string;
  /** Soma dos movimentos (unidades). */
  saldo: number;
  /** null = sem aviso de estoque baixo. */
  minimo: number | null;
  situacao: SituacaoEstoque;
}

export interface FiltroMovimentosEstoque extends FiltroVendas {
  produtoId?: string | null;
}

export interface ApiEstoque {
  /** Saldo de cada produto (o que nunca teve movimento aparece com saldo 0). */
  listarEstoque(): Promise<SaldoEstoque[]>;
  /** Do mais novo para o mais antigo. */
  listarMovimentosEstoque(filtro?: FiltroMovimentosEstoque): Promise<MovimentoEstoque[]>;
  /** Entrada (compra) ou ajuste com motivo (perda, avaria, contagem). Só Dono e Administrador. */
  lancarMovimentoEstoque(dados: MovimentoManual): Promise<SaldoEstoque>;
  /** Estoque mínimo do produto (null ou 0 = sem aviso). Só Dono e Administrador. */
  definirEstoqueMinimo(produtoId: string, minimo: number | null): Promise<SaldoEstoque>;
}

// ---- Clientes (identificados na Frente de caixa com F6)
// A aba Clientes ainda não tem tela: estas chamadas já ficam prontas para ela.

export interface HistoricoCliente {
  cliente: Cliente;
  resumo: ResumoCliente;
  /** Compras do cliente, da mais nova para a mais antiga (canceladas aparecem, mas não somam). */
  vendas: Venda[];
}

/** O que a busca da Frente de caixa (F6) recebe: o CPF já vem mascarado do servidor (LGPD). */
export interface ClienteDaBusca {
  id: string;
  nome: string;
  /** "***.456.789-**" */
  cpfMascarado: string;
  /** Só números, com DDD. */
  telefone: string;
}

export interface ApiClientes {
  /** Busca do F6, feita no servidor: até 8 clientes ativos por CPF, telefone ou nome. Sem termo, nada. */
  buscarClientesParaVenda(termo: string): Promise<ClienteDaBusca[]>;
  /** Cadastro completo (para a aba Clientes): busca por nome, CPF ou telefone; sem termo, todos os ativos. */
  listarClientes(termo?: string): Promise<Cliente[]>;
  /** Nome, telefone e CPF obrigatórios; CPF não pode repetir. */
  cadastrarCliente(dados: NovoCliente): Promise<Cliente>;
  atualizarCliente(id: string, dados: NovoCliente): Promise<Cliente>;
  /** Desativa (some da busca e não entra em venda nova) ou reativa. Só Dono e Administrador. */
  definirClienteAtivo(id: string, ativo: boolean): Promise<Cliente>;
  historicoDoCliente(id: string): Promise<HistoricoCliente>;
}

// ---- Financeiro (só Dono e Administrador; Vendedor recebe 403)
// A aba Financeiro ainda não tem tela; a Visão geral usa o resumo no card "Saldo das contas".

export interface ResumoFinanceiro {
  contas: { id: ContaId; nome: string; saldoCentavos: number }[];
  /** Caixa físico + Conta bancária. */
  totalCentavos: number;
  /** Vendas no cartão que a operadora ainda vai depositar (líquido, já sem a taxa). */
  aReceber: ResumoAReceber;
}

export interface FiltroLancamentos extends FiltroVendas {
  conta?: ContaId | null;
}

export interface ApiFinanceiro {
  resumoFinanceiro(): Promise<ResumoFinanceiro>;
  /** Do mais novo para o mais antigo. */
  listarLancamentos(filtro?: FiltroLancamentos): Promise<Lancamento[]>;
  /** Do vencimento mais próximo para o mais distante. */
  listarRecebiveis(filtro?: { situacao?: SituacaoRecebivel | null }): Promise<Recebivel[]>;
  /** Confirma que a operadora depositou: o líquido entra na conta. */
  receberRecebivel(id: string, conta: ContaId): Promise<Recebivel>;
  /** Entrada, despesa, retirada do dono ou transferência entre contas. */
  lancarNoFinanceiro(dados: NovoLancamentoManual): Promise<Lancamento[]>;
  /** Uma vez por conta. */
  definirSaldoInicial(dados: { conta: ContaId; valorCentavos: number }): Promise<Lancamento>;
  lerTaxasCartao(): Promise<TaxasCartao>;
  salvarTaxasCartao(taxas: TaxasCartao): Promise<TaxasCartao>;
}

/**
 * O que a área logada usa. Cada venda da Frente de caixa alimenta o resto do sistema:
 * estoque (baixa e devolução), clientes (histórico), financeiro (Caixa, Banco e cartão a receber),
 * Visão geral e Relatórios.
 */
export type ApiPainel = ApiProdutos & ApiVendas & ApiEstoque & ApiClientes & ApiFinanceiro;
