// apps/web/src/api.ts
// Contratos da área logada (o que as telas usam) e o cliente HTTP do sistema real.
// A LOJA nunca é enviada pela tela: o servidor descobre pela sessão (cookie HttpOnly, que o
// JavaScript nem consegue ler). A demonstração implementa os mesmos contratos no navegador
// (demo/apiLocal.ts), então as telas são as mesmas nos dois.
import type {
  AcaoAutorizada,
  CaixaDoDia,
  EstadoCaixa,
  FormaPagamento,
  Gaveta,
  NovaAbertura,
  OperacaoCaixa,
  PedidoDesfazer,
  PedidoFechamento,
  PedidoLiberacao,
  Cliente,
  ConfiguracaoDaLoja,
  ContaId,
  DadosDaLoja,
  Devolucao,
  DevolucaoComVenda,
  ErroCampo,
  Fornecedor,
  NovoFornecedor,
  Compra,
  ContaPagar,
  LoteVencendo,
  NovaCompra,
  SituacaoContaPagar,
  Lancamento,
  MovimentoEstoque,
  MovimentoManual,
  MudancaRegras,
  NovaVenda,
  NovoCliente,
  NovoLancamentoManual,
  NovoProduto,
  AlteracaoProduto,
  UnidadeVenda,
  NovoUsuario,
  AlteracaoUsuario,
  PapelDeLoja,
  PedidoCancelamento,
  PedidoDevolucao,
  Recebivel,
  RegrasDaLoja,
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
  /** No produto vendido por kg, o preço do quilo. */
  precoCentavos: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  /** Cadastro completo (DaniPets PRD-01). Sem: null / 'un' (produtos antigos e o servidor, por enquanto). */
  marca?: string | null;
  pesoGramas?: number | null;
  unidade?: UnidadeVenda;
  /** Fornecedor principal (cadastro de fornecedores da loja). */
  fornecedorId?: string | null;
  /** Na listagem: tem vendas, entradas ou ajustes? (com história: não exclui nem muda de unidade) */
  temHistorico?: boolean;
}

export class ErroApi extends Error {
  constructor(
    /** 0 = sem conexão / sem resposta. 501 = parte que ainda não está no servidor. */
    readonly status: number,
    mensagem: string,
    readonly erros: ErroCampo[] = [],
    /** Para a tela reagir sem comparar texto (ex.: "senha_provisoria", "sessao_encerrada"). */
    readonly codigo: string | null = null,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export interface ApiProdutos {
  listarProdutos(): Promise<Produto[]>;
  /**
   * Cadastro (Dono, Administrador e Vendedor; o custo do estoque inicial, só Dono e Administrador).
   * Produto com o mesmo nome, marca e peso: 409 com codigo "produto_parecido"; `mesmoAssim` cadastra.
   */
  criarProduto(dados: NovoProduto, opcoes?: { mesmoAssim?: boolean }): Promise<Produto>;
  /** Só Dono e Administrador. Com história, a unidade não muda (409). Parecido: como no cadastro. */
  alterarProduto(id: string, mudanca: AlteracaoProduto, opcoes?: { mesmoAssim?: boolean }): Promise<Produto>;
  /** Inativar (some da Frente de caixa) ou reativar. Só Dono e Administrador. */
  definirProdutoAtivo(id: string, ativo: boolean): Promise<Produto>;
  /** Só sem história (vendas, entradas, ajustes); com história, inative. Só Dono e Administrador. */
  excluirProduto(id: string): Promise<void>;
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
  /** Confere a senha de quem autoriza e devolve o identificador da autorização. 5 senhas erradas seguidas bloqueiam o autorizador por 5 minutos (429), como no login. */
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
  /** Custo médio (por unidade ou kg), só para Dono e Administrador; null = sem custo ainda. */
  custoMedioCentavos?: number | null;
}

export interface FiltroMovimentosEstoque extends FiltroVendas {
  produtoId?: string | null;
}

export interface ApiEstoque {
  /** Saldo de cada produto (o que nunca teve movimento aparece com saldo 0). */
  listarEstoque(): Promise<SaldoEstoque[]>;
  /** Do mais novo para o mais antigo. */
  listarMovimentosEstoque(filtro?: FiltroMovimentosEstoque): Promise<MovimentoEstoque[]>;
  /**
   * Entrada (compra) ou ajuste com motivo (perda, avaria, contagem). Só Dono e Administrador. Com `dia` de um
   * dia já fechado no Caixa do dia: 409 com codigo "dia_fechado"; `liberacao` (senha e motivo do Dono) libera.
   */
  lancarMovimentoEstoque(dados: MovimentoManual, opcoes?: { liberacao?: PedidoLiberacao | null }): Promise<SaldoEstoque>;
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
  /** Quanto o cliente deve no fiado. */
  fiadoEmAbertoCentavos: number;
}

/** O que a busca da Frente de caixa (F6) recebe: o CPF já vem mascarado do servidor (LGPD). */
export interface ClienteDaBusca {
  id: string;
  nome: string;
  /** "***.456.789-**" */
  cpfMascarado: string;
  /** Só números, com DDD. */
  telefone: string;
  /** Quanto deve no fiado (a Frente de caixa mostra na faixa do cliente, como no DaniPets). */
  fiadoEmAbertoCentavos: number;
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
  /**
   * LGPD: apaga nome, CPF e telefone do cliente (fica "Cliente removido"; as vendas continuam, sem o
   * nome). Só o Dono, e só sem fiado em aberto (a dívida precisa do cadastro até ser paga).
   */
  excluirDadosDoCliente(id: string): Promise<Cliente>;
}

// ---- Financeiro (só Dono e Administrador; Vendedor recebe 403)
// A aba Financeiro ainda não tem tela; a Visão geral usa o resumo no card "Saldo das contas".

export interface ResumoFinanceiro {
  contas: { id: ContaId; nome: string; saldoCentavos: number }[];
  /** Caixa físico + Conta bancária. */
  totalCentavos: number;
  /** Vendas no cartão que a operadora ainda vai depositar (líquido, já sem a taxa). */
  aReceber: ResumoAReceber;
  /** Compras no fiado que os clientes ainda vão pagar (vencidos = passou do prazo de 30 dias). */
  fiado: ResumoAReceber;
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

// ---- Fornecedores (Fase 2, módulo 3): cadastro simples da loja; Dono e Administrador (como Compras).

export interface ApiFornecedores {
  /** Ativos primeiro, por nome. */
  listarFornecedores(): Promise<Fornecedor[]>;
  /** Nome obrigatório; CNPJ/CPF e telefone conferidos; o documento não se repete na loja. */
  cadastrarFornecedor(dados: NovoFornecedor): Promise<Fornecedor>;
  alterarFornecedor(id: string, dados: NovoFornecedor): Promise<Fornecedor>;
  /** Desativado some das listas de escolha (o que já aponta para ele continua). */
  definirFornecedorAtivo(id: string, ativo: boolean): Promise<Fornecedor>;
}

// ---- Compras e contas a pagar (Fase 2, módulo 4): Dono e Administrador.

export interface ApiCompras {
  /** Da mais nova para a mais antiga (pelo dia da compra). */
  listarCompras(filtro?: FiltroVendas): Promise<Compra[]>;
  /**
   * Nota repetida do mesmo fornecedor: 409 com codigo "nf_repetida"; `mesmoAssim` registra. Data de um dia já
   * fechado no Caixa do dia: 409 com codigo "dia_fechado"; `liberacao` (senha e motivo do Dono) libera.
   */
  registrarCompra(dados: NovaCompra, opcoes?: { mesmoAssim?: boolean; liberacao?: PedidoLiberacao | null }): Promise<Compra>;
  /** Compra lançada errada: estorna um item (estoque, dinheiro ou conta a pagar voltam). */
  estornarItemDaCompra(compraId: string, linha: number, motivo: string): Promise<Compra>;
  /** Contas a pagar (das compras a prazo), do vencimento mais próximo para o mais distante. */
  listarContasAPagar(filtro?: { situacao?: SituacaoContaPagar | null }): Promise<ContaPagar[]>;
  pagarContaAPagar(id: string, conta: ContaId): Promise<ContaPagar>;
  /** Lotes vencidos ou vencendo nos próximos 30 dias, com saldo e sem baixa. */
  listarLotesVencendo(): Promise<LoteVencendo[]>;
  /** O que ainda estava na prateleira sai do estoque como "Produto vencido" (0 = o lote já tinha acabado). */
  darBaixaNoLote(compraId: string, linha: number, dados: { quantidade: number; observacao?: string }): Promise<Compra>;
}

// ---- Caixa do dia (Fase 2, módulo 5): Dono, Administrador e Vendedor (permissão "caixa").

/** Tudo o que a aba Caixa do dia mostra. */
export interface PainelCaixa {
  hoje: string;
  /** Situação do caixa de hoje. */
  estado: EstadoCaixa;
  /** O caixa de hoje (aberto ou fechado), ou null. */
  caixa: CaixaDoDia | null;
  /** Dia anterior ainda aberto: precisa ser fechado antes de abrir o de hoje. */
  atrasado: CaixaDoDia | null;
  /** O caixa a fechar agora (o dia mais antigo em aberto) e a conta da gaveta dele. */
  aFechar: { caixa: CaixaDoDia; gaveta: Gaveta } | null;
  /** Vendas de hoje por forma de pagamento (sem as canceladas). */
  vendasDeHoje: Record<FormaPagamento, number>;
  /** Dinheiro movimentado desde a abertura do caixa de hoje (sem caixa aberto: o de hoje no Caixa físico). */
  movimentos: Lancamento[];
  /** Todos os caixas, do dia mais novo para o mais antigo. */
  historico: CaixaDoDia[];
  /** Saldo do Caixa físico no sistema (para conferir o fundo de troco na abertura). Só para quem vê o Financeiro. */
  saldoCaixaFisicoCentavos: number | null;
  /** Diferença que fecha sem a senha do Dono ou do Administrador (regras da loja). */
  toleranciaCentavos: number;
  ultimoDiaFechado: string | null;
}

/** A situação do caixa de hoje para a Frente de caixa e a Visão geral ("Caixa aberto às 08:10"). */
export interface SituacaoDoCaixaHoje {
  hoje: string;
  estado: EstadoCaixa;
  /** ISO 8601. */
  abertoEm: string | null;
  fechadoEm: string | null;
  responsavel: string | null;
  /** Caixa de um dia anterior ainda aberto (fecha sozinho à meia-noite; aparece só se não fechou). */
  atrasado: string | null;
}

export interface ApiCaixa {
  lerCaixa(): Promise<PainelCaixa>;
  lerSituacaoDoCaixa(): Promise<SituacaoDoCaixaHoje>;
  /** Só o de hoje, uma vez, depois de fechar os dias anteriores. Quem está logado é o responsável. */
  abrirCaixa(dados: Partial<NovaAbertura>): Promise<CaixaDoDia>;
  /**
   * Sangria (deposita na Conta bancária), retirada do dono ou suprimento. Não tira mais do que o esperado na
   * gaveta. Retirada do dono feita pelo Vendedor: a autorização dada com a senha do Dono ou do Administrador.
   */
  operarCaixa(dados: Omit<OperacaoCaixa, 'autorizacao'> & { autorizacao?: string | null }): Promise<Lancamento[]>;
  /**
   * Fecha o dia mais antigo em aberto. Diferença precisa de justificativa; acima da tolerância, o Vendedor
   * precisa da autorização (403 com codigo "precisa_autorizacao").
   */
  fecharCaixa(dados: Omit<PedidoFechamento, 'justificativa' | 'autorizacao'> & { justificativa?: string | null; autorizacao?: string | null }): Promise<CaixaDoDia>;
  /** Só o último fechamento, pelo Dono ou pelo Administrador. */
  desfazerFechamento(caixaId: string, dados: Omit<PedidoDesfazer, 'explicacao'> & { explicacao?: string | null }): Promise<CaixaDoDia>;
}

// ---- Dados e regras da loja (Fase 2, módulo 1): todos os logados leem; Dono e Administrador alteram.

export interface ApiLoja {
  /** Nome, descrição, logo e as regras (com os padrões do DaniPets no que a loja não mudou). */
  lerConfiguracao(): Promise<ConfiguracaoDaLoja>;
  /** Só os campos enviados mudam. Logo: data URL PNG, JPEG ou WebP (null tira). */
  salvarDadosDaLoja(mudanca: Partial<DadosDaLoja>): Promise<DadosDaLoja>;
  /** Só as partes e os campos enviados mudam; cada um é conferido com os limites do DaniPets. */
  salvarRegrasDaLoja(mudanca: MudancaRegras): Promise<RegrasDaLoja>;
}

/**
 * O que a área logada usa. Cada venda da Frente de caixa alimenta o resto do sistema:
 * estoque (baixa e devolução), clientes (histórico), financeiro (Caixa, Banco e cartão a receber),
 * Visão geral e Relatórios.
 */
export type ApiPainel = ApiProdutos & ApiVendas & ApiEstoque & ApiClientes & ApiFinanceiro & ApiLoja & ApiFornecedores & ApiCompras & ApiCaixa;

// ---- Usuários da loja e a própria conta (item 5.4: login próprio; o Dono cadastra a equipe)

/** Como a tela Usuários recebe cada pessoa (nunca a senha nem o hash). */
export interface UsuarioDaLoja {
  id: string;
  nome: string;
  /** Login, minúsculo. */
  usuario: string;
  papel: PapelDeLoja;
  ativo: boolean;
  /** Senha criada ou redefinida pelo Dono: no próximo acesso a pessoa cria a dela. */
  senhaProvisoria: boolean;
  /** ISO; bloqueado por senhas erradas até este instante (null = não). */
  bloqueadoAte: string | null;
  ultimoAcessoEm: string | null;
  criadoEm: string;
}

/** Uma linha do histórico (quem fez o quê). */
export interface ItemAuditoria {
  id: string;
  acao: string;
  /** "Usuário criado", "Entrou no sistema"... */
  texto: string;
  /** Nome de quem fez (null = sistema ou tentativa sem login). */
  quem: string | null;
  alvo: { tipo: string; id: string; nome: string | null } | null;
  detalhes: unknown;
  /** Resumo dos detalhes ("venda nº 00012 • R$ 5,00 • autorizado por Ana"); vazio = nada a acrescentar. */
  resumo?: string;
  criadoEm: string;
}

export interface ApiUsuarios {
  listarUsuarios(): Promise<UsuarioDaLoja[]>;
  /** A senha informada é PROVISÓRIA. Só Dono e Administrador; Dono novo, só outro Dono. */
  criarUsuario(dados: NovoUsuario): Promise<UsuarioDaLoja>;
  alterarUsuario(id: string, mudanca: AlteracaoUsuario): Promise<UsuarioDaLoja>;
  /** Nova senha provisória (e o bloqueio por senhas erradas some). Não vale para a própria senha. */
  redefinirSenhaUsuario(id: string, senha: string): Promise<void>;
  /** LGPD: só o Dono, só de usuário desativado. */
  excluirDadosUsuario(id: string): Promise<UsuarioDaLoja>;
  /** Do mais novo para o mais antigo. Só Dono e Administrador. */
  listarAuditoria(limite?: number): Promise<ItemAuditoria[]>;
}

export interface ApiConta {
  /** "Trocar minha senha" (e criar a própria no primeiro acesso). Pede a senha atual. */
  trocarMinhaSenha(senhaAtual: string, senhaNova: string): Promise<void>;
}

/** Tudo o que a área logada usa. */
export type ApiSistema = ApiPainel & ApiUsuarios & ApiConta;

// ---- Cliente HTTP do sistema real

/** Quem está logado (GET /sessao e resposta do login). */
export interface SessaoAtual {
  usuario: { id: string; nome: string; usuario: string; papel: PapelDeLoja };
  loja: { nome: string; subdominio: string };
  senhaProvisoria: boolean;
  /** Minutos sem uso até a sessão cair (a tela sai sozinha). */
  inatividadeMin: number;
}

export const MENSAGEM_SEM_SERVIDOR = 'Esta parte ainda não está ligada ao servidor. Por enquanto ela funciona na demonstração (sistema-padrao-demo.html).';

type Chamar = <T>(caminho: string, init?: RequestInit) => Promise<T>;

/**
 * fetch com cookie (mesmo endereço: o nginx manda /api para o servidor), JSON e erros no formato
 * do servidor ({ status, mensagem, codigo?, erros? }). 401 numa área logada chama `aoSessaoEncerrada`.
 */
export function criarChamador(urlBase: string, aoSessaoEncerrada: (mensagem: string) => void = () => undefined): Chamar {
  return async function chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    let resposta: Response;
    try {
      resposta = await fetch(`${urlBase}${caminho}`, {
        ...init,
        credentials: 'same-origin',
        headers: { ...init.headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch {
      throw new ErroApi(0, 'Sem conexão com o servidor. Verifique a internet.');
    }
    if (resposta.status === 204) return undefined as T;
    const corpo: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const c = (corpo ?? {}) as { mensagem?: unknown; erros?: unknown; codigo?: unknown };
      const erro = new ErroApi(
        resposta.status,
        typeof c.mensagem === 'string' ? c.mensagem : 'Algo deu errado. Tente novamente.',
        Array.isArray(c.erros) ? (c.erros as ErroCampo[]) : [],
        typeof c.codigo === 'string' ? c.codigo : null,
      );
      if (resposta.status === 401 && (erro.codigo === 'sessao_encerrada' || erro.codigo === 'sem_sessao')) aoSessaoEncerrada(erro.message);
      throw erro;
    }
    return corpo as T;
  };
}

/** Entrada e saída (antes de existir sessão). */
export function criarApiEntrada(urlBase: string) {
  const chamar = criarChamador(urlBase);
  return {
    /** Loja da tela de entrada: pelo endereço (produção) ou pelo endereço informado (desenvolvimento). */
    lojaDaEntrada: (loja?: string | null) =>
      chamar<{ loja: { nome: string; subdominio: string } | null; informarLoja: boolean }>(`/sessao/loja${loja ? `?loja=${encodeURIComponent(loja)}` : ''}`),
    /** null = ninguém logado neste navegador. */
    sessaoAtual: async (): Promise<SessaoAtual | null> => {
      try {
        return await chamar<SessaoAtual>('/sessao');
      } catch (e) {
        if (e instanceof ErroApi && e.status === 401) return null;
        throw e;
      }
    },
    entrar: (dados: { loja?: string | null; usuario: string; senha: string }) => chamar<SessaoAtual>('/sessao', { method: 'POST', body: JSON.stringify(dados) }),
    sair: () => chamar<void>('/sessao/sair', { method: 'POST' }),
  };
}

/**
 * A área logada falando com o servidor. Hoje o servidor tem produtos, usuários, histórico e a conta;
 * o resto (vendas, estoque, clientes, financeiro) responde 501 até chegar a vez de cada parte — as
 * telas dessas partes ficam com um aviso no sistema real (TelaPainel, `secoesDisponiveis`).
 */
export function criarApiServidor(urlBase: string, aoSessaoEncerrada: (mensagem: string) => void): ApiSistema {
  const chamar = criarChamador(urlBase, aoSessaoEncerrada);
  const json = (corpo: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corpo) });
  const implementado: Partial<ApiSistema> = {
    listarProdutos: async () => (await chamar<{ itens: Produto[] }>('/produtos')).itens,
    criarProduto: (dados) => chamar<Produto>('/produtos', json(dados)),
    listarUsuarios: async () => (await chamar<{ itens: UsuarioDaLoja[] }>('/usuarios')).itens,
    criarUsuario: (dados) => chamar<UsuarioDaLoja>('/usuarios', json(dados)),
    alterarUsuario: (id, mudanca) => chamar<UsuarioDaLoja>(`/usuarios/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(mudanca) }),
    redefinirSenhaUsuario: (id, senha) => chamar<void>(`/usuarios/${encodeURIComponent(id)}/senha`, json({ senha })),
    excluirDadosUsuario: (id) => chamar<UsuarioDaLoja>(`/usuarios/${encodeURIComponent(id)}/excluir-dados`, { method: 'POST' }),
    listarAuditoria: async (limite = 40) => (await chamar<{ itens: ItemAuditoria[] }>(`/auditoria?limite=${limite}`)).itens,
    trocarMinhaSenha: async (senhaAtual, senhaNova) => {
      await chamar<SessaoAtual>('/sessao/senha', json({ senhaAtual, senhaNova }));
    },
  };
  // O que não está em `implementado` responde 501 com a mesma mensagem (sem listar 30 funções à mão).
  return new Proxy(implementado, {
    get(alvo, nome) {
      if (typeof nome !== 'string' || nome === 'then') return undefined;
      return (alvo as Record<string, unknown>)[nome] ?? (async () => Promise.reject(new ErroApi(501, MENSAGEM_SEM_SERVIDOR)));
    },
  }) as ApiSistema;
}
