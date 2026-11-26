// apps/web/src/api.ts
// Contratos da área logada (o que as telas usam) e o cliente HTTP do sistema real.
// A LOJA nunca é enviada pela tela: o servidor descobre pela sessão (cookie HttpOnly, que o
// JavaScript nem consegue ler). A demonstração implementa os mesmos contratos no navegador
// (demo/apiLocal.ts), então as telas são as mesmas nos dois.
import type {
  AcessoDoUsuario,
  AjustesDaLoja,
  MudancaDosAjustes,
  Atualizacao,
  AvisoDaEquipe,
  ImportanciaDoAviso,
  AssuntoDaCopia,
  CadastroDaPlanilha,
  SituacaoDaLinha,
  TabelaImportada,
  VendaAntiga,
  CopiaDaLoja,
  CotacaoRecebimento,
  FiadoAVencer,
  AcaoAutorizada,
  CaixaDoDia,
  CanalContato,
  ContatoCliente,
  CupomRetorno,
  SituacaoLembrete,
  TipoContato,
  ValeTroca,
  FormaReceberFiado,
  LinhaExtrato,
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
  ExtratoDaConta,
  NovaContaAPagar,
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
  PapelNaLoja,
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
  /** Com `modo: 'vale'`, o valor volta como vale-troca (depois de abater o fiado em aberto da venda): o vale vem em `vale`. */
  devolverItens(vendaId: string, pedido: PedidoDevolucao): Promise<{ venda: Venda; devolucao: Devolucao; vale?: ValeTroca | null }>;
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
  /** Limite de fiado do cadastro (0 = sem fiado sem a liberação de um Dono). */
  limiteFiadoCentavos?: number;
  /** Parte do fiado que já venceu e há quantos dias. */
  fiadoVencidoCentavos?: number;
  diasVencido?: number;
  /** Cashback para usar hoje (módulo 7) e o próximo vencimento. */
  cashbackCentavos?: number;
  cashbackVencimento?: { venceEm: string; valorCentavos: number } | null;
  /** Cupom de retorno que vale hoje: entra sozinho nos itens sem desconto manual. */
  cupom?: { id: string; pct: number; venceEm: string } | null;
  /** Nome, telefone e CPF válidos: sem isso, sem cashback, cupom e fiado. */
  completo?: boolean;
  /** Saldo dos vales-troca do cliente (módulo 8). */
  valeCentavos?: number;
}

/** Cliente sem o CPF inteiro (LGPD): o que as telas recebem. O CPF completo só por `verCpfDoCliente`. */
export type ClienteSemCpf = Omit<Cliente, 'cpf'> & { cpfMascarado: string };

export type FiltroClientes = 'todos' | 'cashback' | 'vale' | 'fiado' | 'vencido' | 'incompleto' | 'sumidos' | 'nao_incomodar' | 'desativados';

/** Uma linha da lista da aba Clientes. */
export interface LinhaCliente {
  id: string;
  nome: string;
  extra: string | null;
  telefone: string;
  whatsapp: boolean;
  aceitaMensagens: boolean;
  cpfMascarado: string;
  ativo: boolean;
  naoIncomodar: boolean;
  /** Nome, telefone e CPF válidos (sem isso, não compra no fiado). */
  completo: boolean;
  compras: number;
  ultimaCompraEm: string | null;
  /** Cashback para usar hoje (módulo 7). */
  cashbackCentavos: number;
  /** Saldo dos vales-troca do cliente (módulo 8). */
  valeCentavos: number;
  /** Só para quem vê o fiado de todos (Dono e Administrador). */
  fiado: { devendoCentavos: number; vencidoCentavos: number; diasVencido: number; limiteCentavos: number } | null;
}

/** Uma compra no fiado em aberto, na conta do cliente. */
export interface FiadoEmAberto {
  vendaNumero: number;
  criadoEm: string;
  venceEm: string;
  /** O que ainda falta pagar desta compra. */
  abertoCentavos: number;
}

/** A conta do cliente (DaniPets cliContaHtml): cadastro, resumo, fiado e extrato. */
export interface ContaDoCliente {
  cliente: ClienteSemCpf;
  resumo: ResumoCliente;
  extrato: LinhaExtrato[];
  fiado: { devendoCentavos: number; vencidoCentavos: number; diasVencido: number; abertos: FiadoEmAberto[] };
  limiteFiadoCentavos: number;
  /** Tem compra ou fiado: não pode ser excluído (só os dados, pela LGPD, por um Dono). */
  temHistorico: boolean;
  /** Cashback e cupom de hoje (módulo 7). */
  fidelidade: FidelidadeDaConta;
  /** Vales-troca do cliente com saldo (módulo 8). */
  vale: { saldoCentavos: number; abertos: { codigo: string; saldoCentavos: number }[] };
}

/** Cashback e cupom do cliente hoje (conta do cliente). */
export interface FidelidadeDaConta {
  saldoCentavos: number;
  /** Parte que vence em até "aviso de cashback vencendo" dias (regra da loja). */
  vencendoCentavos: number;
  proximoVencimento: { venceEm: string; valorCentavos: number } | null;
  vencidoCentavos: number;
  cupom: { id: string; pct: number; venceEm: string } | null;
  /** Sem comprar há "dias sem comprar" (regra da loja) ou mais: pode receber o lembrete de retorno. */
  sumido: boolean;
}

/** Uma conta em aberto na aba Fiado. */
export interface LinhaFiado {
  clienteId: string;
  nome: string;
  telefone: string;
  /** O telefone tem WhatsApp (o "Lembrar" do pagamento usa). */
  whatsapp?: boolean;
  ativo: boolean;
  devendoCentavos: number;
  vencidoCentavos: number;
  diasVencido: number;
  limiteCentavos: number;
  /** A compra em aberto que vence primeiro. */
  maisAntiga: { vendaNumero: number; venceEm: string };
}

/** Cliente sem histórico excluído pelo Vendedor: o Dono e o Administrador veem até marcar "Ciente". */
export interface AvisoExclusaoCliente {
  id: string;
  clienteNome: string;
  telefone: string;
  motivo: string;
  por: { id: string; nome: string };
  em: string;
  ciente: { por: { id: string; nome: string }; em: string } | null;
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
   * LGPD: apaga nome, CPF, telefone e os outros dados do cliente (fica "Cliente removido"; as vendas
   * continuam, sem o nome). Só o Dono, só sem fiado em aberto (a dívida precisa do cadastro até ser paga) e
   * com a liberação de um Dono (senha e motivo).
   */
  excluirDadosDoCliente(id: string, opcoes?: { liberacao?: PedidoLiberacao | null }): Promise<Cliente>;
  /** Lista da aba Clientes (até 300; a busca acha os outros): nome, campo extra, CPF ou telefone. */
  listarContasDeClientes(filtro?: { termo?: string; filtro?: FiltroClientes }): Promise<{ clientes: LinhaCliente[]; total: number }>;
  contaDoCliente(id: string): Promise<ContaDoCliente>;
  /** O CPF completo (Dono e Administrador); fica registrado no histórico. */
  verCpfDoCliente(id: string): Promise<{ cpf: string }>;
  /** Só cliente sem compra nem fiado, com motivo. Feito pelo Vendedor, vira um aviso para o Dono e o Administrador. */
  excluirCliente(id: string, motivo: string): Promise<void>;
  listarAvisosDeClientes(): Promise<AvisoExclusaoCliente[]>;
  conferirAvisoDeCliente(id: string): Promise<AvisoExclusaoCliente>;
  /**
   * Fiado pela conta do cliente: abate primeiro a compra mais antiga (ou só as de um `vencimento`). Dinheiro só com
   * o caixa de hoje aberto, com troco do que foi entregue; cartão com a taxa da maquininha repassada ao cliente, que
   * entra no banco na hora (baixa automática) ou fica a receber (manual). A mesma `chave` não recebe duas vezes
   * (devolve o resultado do primeiro). Se a taxa mudou desde a cotação da tela: 409 com codigo "taxa_mudou".
   */
  receberFiadoDoCliente(id: string, dados: PedidoReceberFiado): Promise<RecebimentoDoFiado>;
  /** As taxas da maquininha para cotar o recebimento do fiado (quem vende recebe o fiado). */
  taxasParaReceberFiado(): Promise<TaxasCartao>;
  /** Aba Fiado (Dono e Administrador): quem deve, da conta mais vencida para a menos. */
  listarFiado(): Promise<{ linhas: LinhaFiado[]; limitesCentavos: number }>;
}

export interface PedidoReceberFiado {
  valorCentavos: number;
  forma: FormaReceberFiado;
  /** Só as compras deste vencimento (AAAA-MM-DD). */
  vencimento?: string | null;
  /** Em dinheiro: o que o cliente entregou (o troco é a diferença). Sem ele: o valor certo. */
  entregueCentavos?: number | null;
  /** O que a tela cotou (bruto e taxa): se a taxa mudou nesse meio tempo, a gravação recusa. */
  brutoPrevistoCentavos?: number | null;
  taxaPrevistaPct?: number | null;
  /** Identificador do pedido, para não receber duas vezes (clique duplo, rede lenta). */
  chave?: string | null;
}

export interface RecebimentoDoFiado {
  abatidas: { vendaNumero: number; valorCentavos: number }[];
  /** O que o cliente ainda deve (todas as compras). */
  ficaDevendoCentavos: number;
  cotacao: CotacaoRecebimento;
}

/** As pendências de clientes do card da Visão geral (arquivo do Luan, 23/11/2026). */
export interface PendenciasDeClientes {
  hoje: string;
  /** Fiado que vence de hoje a 7 dias, por cliente e vencimento. Só para quem vê o fiado de todos (null para os outros). */
  fiado: FiadoAVencer[] | null;
  /** Cashback vencendo (a mesma lista da aba Retorno). */
  cashback: PainelRetorno['cashback'];
  /** Promoções exclusivas: sem comprar há N dias, com o cupom de retorno (vazio se a loja não dá cupom). */
  promocao: (PainelRetorno['retorno'][number] & { percentual: number })[];
}

// ---- Financeiro (só Dono e Administrador; Vendedor recebe 403)
// Aba Financeiro (Fase 2, módulo 9): saldos, extrato de cada conta, a receber, a pagar, lançamentos e os nomes que a
// loja dá às contas (regras.financeiro.nomesContas, salvos por salvarRegrasDaLoja). A Visão geral usa o resumo.

export interface ResumoFinanceiro {
  /** Cada conta com o nome que a loja deu a ela ("Banco Itaú") e se o saldo inicial já foi definido. */
  contas: { id: ContaId; nome: string; saldoCentavos: number; temSaldoInicial: boolean }[];
  /** Caixa físico + Conta bancária. */
  totalCentavos: number;
  /** Vendas no cartão que a operadora ainda vai depositar (líquido, já sem a taxa). */
  aReceber: ResumoAReceber;
  /** Compras no fiado que os clientes ainda vão pagar (vencidos = passou do prazo de 30 dias). */
  fiado: ResumoAReceber;
  /** Contas a pagar em aberto (compras a prazo e contas avulsas); vencidas = venceram antes de hoje. */
  aPagar: { totalCentavos: number; quantidade: number; vencidasCentavos: number; vencidas: number };
  /** O cartão entra na Conta bancária na hora (true) ou fica a receber até alguém confirmar (false). */
  baixaAutomatica: boolean;
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
  /** Confirma vários de uma vez (os vencidos, por exemplo). Tudo ou nada; fiado não entra (é na conta do cliente). */
  receberRecebiveis(ids: string[], conta: ContaId): Promise<Recebivel[]>;
  /** Extrato da conta no período (até um ano), como o do banco: saldo anterior, linhas com o saldo e o saldo final. */
  extratoDaConta(filtro: { conta: ContaId; de: string; ate: string }): Promise<ExtratoDaConta>;
  /** Conta a pagar sem compra (aluguel, energia, boleto). */
  cadastrarContaAPagar(dados: NovaContaAPagar): Promise<ContaPagar>;
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
  /**
   * Fechamentos automáticos (à meia-noite, sem contagem) que ninguém conferiu: a pendência "Deseja verificar?".
   * Só para quem confere o caixa (Dono e Administrador); null para o Vendedor. Ausente = servidor sem essa parte.
   */
  aVerificar?: FechamentoAVerificar[] | null;
  /** Falta ou sobra acima da tolerância de que o Dono ainda não está ciente. Só para o Dono; null para os outros. */
  diferencasAConferir?: DiferencaAConferir[] | null;
}

/** Fechamento contado com falta ou sobra acima da tolerância de que o Dono ainda não está ciente (pendência 3). */
export interface DiferencaAConferir {
  caixaId: string;
  /** AAAA-MM-DD. */
  dia: string;
  /** Negativo = falta; positivo = sobra. */
  diferencaCentavos: number;
  /** A tolerância da loja quando o caixa fechou. */
  toleranciaCentavos: number;
  fechouPor: string | null;
  autorizadoPor: string | null;
}

/** Um fechamento automático que o Dono ou o Administrador ainda não conferiu. */
export interface FechamentoAVerificar {
  caixaId: string;
  /** AAAA-MM-DD. */
  dia: string;
  esperadoCentavos: number;
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
  /**
   * O Dono ou o Administrador conferiu o fechamento automático (contou a gaveta): a pendência some. A observação
   * (opcional) guarda o que achou. Não mexe em saldo: se a gaveta não bateu, o caminho é desfazer e fechar contando.
   */
  verificarFechamentoAutomatico(caixaId: string, dados?: { observacao?: string | null }): Promise<CaixaDoDia>;
  /** O Dono ficou ciente da falta ou da sobra acima da tolerância: a pendência some. Só o Dono. */
  darCienciaDaDiferenca(caixaId: string): Promise<CaixaDoDia>;
  /** Só o último fechamento, pelo Dono ou pelo Administrador. */
  desfazerFechamento(caixaId: string, dados: Omit<PedidoDesfazer, 'explicacao'> & { explicacao?: string | null }): Promise<CaixaDoDia>;
}

// ---- Fidelidade (Fase 2, módulo 7): cashback, cupom de retorno, lista de retorno e lembretes pelo WhatsApp.

/** Um cliente da lista de retorno. `bloqueio`: por que não dá para mandar mensagem (null = pode). */
export interface ClienteDoRetorno {
  clienteId: string;
  nome: string;
  telefone: string;
  bloqueio: string | null;
}

export interface PainelRetorno {
  hoje: string;
  regras: Pick<RegrasDaLoja, 'cashback' | 'retorno'>;
  /** Sem comprar há N dias ou mais (de quem está há mais tempo). */
  retorno: (ClienteDoRetorno & { diasSemComprar: number; ultimaCompraDia: string; ultimaCompraItens: string; cashbackCentavos: number })[];
  /** Cashback vencendo (do que vence antes). */
  cashback: (ClienteDoRetorno & { venceEm: string; valorCentavos: number })[];
  /** Ficaram de fora hoje: já lembrados, adiados ou "não incomodar". */
  fora: { clienteId: string; nome: string; motivo: string }[];
  /** Resultado dos lembretes de retorno (os 100 mais novos). */
  resultado: {
    linhas: { contatoId: string; dia: string; clienteNome: string; canal: CanalContato; situacao: SituacaoLembrete; voltou: { dia: string; vendaNumero: number } | null }[];
    enviados: number;
    voltaram: number;
    taxaPct: number;
  };
}

/** A mensagem pronta para o WhatsApp. */
export interface MensagemParaCliente {
  tipo: TipoContato;
  clienteId: string;
  nome: string;
  telefone: string;
  texto: string;
  /** A mensagem de retorno dá (ou repete) este cupom quando for marcada como enviada. */
  cupom: { pct: number; venceEm: string } | null;
  /** Por que não dá para mandar (null = pode). */
  bloqueio: string | null;
}

/** De onde vem o "cashback em aberto" da aba Clientes (DaniPets cliDetalheHtml). */
export interface ResumoCashback {
  hoje: string;
  regras: RegrasDaLoja['cashback'];
  abertoCentavos: number;
  clientesComSaldo: number;
  vencendoCentavos: number;
  geradoCentavos: number;
  devolvidoCentavos: number;
  usadoCentavos: number;
  retiradoCentavos: number;
  vencidoCentavos: number;
  /** Do maior saldo para o menor. */
  linhas: { clienteId: string; nome: string; geradoCentavos: number; usadoCentavos: number; vencidoCentavos: number; abertoCentavos: number; proximoVencimento: { venceEm: string; valorCentavos: number } | null }[];
  /** Lotes que vencem nos próximos dias (aviso de cashback vencendo). */
  vencendo: { clienteId: string; nome: string; dia: string; origem: string; valorCentavos: number; venceEm: string }[];
}

export interface ApiVales {
  /** Vales-troca da loja (todos os logados: a Frente de caixa escolhe o vale). Padrão: os com saldo, do mais novo. */
  listarVales(filtro?: { situacao?: 'aberto' | 'todos' }): Promise<ValeTroca[]>;
  /** O vale pelo código (VT-0001-ABC; maiúsculas ou minúsculas). 404 se não existir. */
  buscarValePorCodigo(codigo: string): Promise<ValeTroca>;
}

export interface ApiFidelidade {
  /** Aba Retorno (todos os logados): quem lembrar hoje, quem ficou de fora e o resultado dos lembretes. */
  listarRetorno(): Promise<PainelRetorno>;
  /** Cashback em aberto da loja e de onde ele vem. */
  resumoDoCashback(): Promise<ResumoCashback>;
  /**
   * A mensagem com o nome da loja e os dados do cliente. O lembrete de pagamento: só Dono e Administrador; com a
   * `referencia` de um vencimento ("fiado:AAAA-MM-DD"), fala do valor e da data daquele vencimento.
   */
  mensagemParaCliente(clienteId: string, tipo: TipoContato, referencia?: string | null): Promise<MensagemParaCliente>;
  /** Pendências de clientes do card da Visão geral: fiado a vencer, cashback a vencer e promoções exclusivas. */
  pendenciasDeClientes(): Promise<PendenciasDeClientes>;
  /**
   * "Marcar como enviado" (WhatsApp, só para quem autorizou mensagens) ou "Já falei" (sem mensagem). A mensagem
   * de retorno pelo WhatsApp dá o cupom (ou repete o que ainda vale).
   */
  registrarContato(clienteId: string, dados: { tipo: TipoContato; canal: CanalContato; referencia?: string | null }): Promise<{ contato: ContatoCliente; cupom: CupomRetorno | null }>;
  /** Tira o cliente da lista de retorno por 7 dias. */
  adiarLembrete(clienteId: string): Promise<{ ate: string }>;
  /** O cliente sai das listas de lembrete (desfaz no cadastro). */
  marcarNaoIncomodar(clienteId: string): Promise<void>;
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
// ---- Relatórios (Fase 2, módulo 10): os dados vêm das outras partes; aqui só o registro de quem exportou.
export interface ApiRelatorios {
  /** Registra no histórico que alguém exportou relatórios para o Excel (o assunto, o período e quantas abas). */
  registrarExportacao(dados: { assunto: string; de: string | null; ate: string | null; abas: number }): Promise<void>;
}

// ---- Dados e backup (Fase 2, módulo 13): cópia de segurança e o registro das planilhas exportadas.

/** O que a cópia leva (a prévia antes de restaurar e o resumo depois). */
export interface PreviaDaCopia {
  loja: { id: string; nome: string };
  /** ISO. */
  geradaEm: string;
  /** Nome de quem baixou a cópia (null = não se sabe). */
  geradaPor: string | null;
  registros: number;
  assuntos: { assunto: AssuntoDaCopia; nome: string; quantidade: number }[];
}

/** O que a planilha traz, antes de importar (Dados e backup → Importar uma planilha). */
export interface PreviaDaImportacao {
  cadastro: CadastroDaPlanilha;
  /** As colunas do modelo achadas na planilha. */
  colunas: string[];
  /** Os títulos que ficam de fora (não são do modelo ou são só de consulta). */
  ignoradas: string[];
  contagem: Record<SituacaoDaLinha, number>;
  /** As linhas que não entram ou que entram com observação (até 500); as outras entram sem nada a dizer. */
  linhas: { numero: number; situacao: SituacaoDaLinha; nome: string; motivos: string[]; avisos: string[] }[];
}

export interface ResultadoDaImportacao {
  cadastro: CadastroDaPlanilha;
  importadas: number;
  existentes: number;
  repetidas: number;
  comErro: number;
}

/** As vendas antigas da planilha, antes de importar: a contagem das linhas e as vendas já juntadas. */
export interface PreviaDasVendasAntigas {
  colunas: string[];
  ignoradas: string[];
  contagem: Record<SituacaoDaLinha, number>;
  /** As linhas que não entram (até 500). */
  linhas: PreviaDaImportacao['linhas'];
  /** Quantas vendas entram (as linhas de cada uma juntadas), o total e os dias da primeira e da última. */
  vendas: number;
  totalCentavos: number;
  de: string | null;
  ate: string | null;
  vendasExistentes: number;
}

export interface ResultadoDasVendasAntigas {
  vendas: number;
  totalCentavos: number;
  vendasExistentes: number;
  linhasComErro: number;
}

export interface ApiDados {
  /**
   * A cópia de segurança completa da loja (@saas/core copiaDaLoja). Precisa de Dados e backup e de ver o CPF completo
   * (a cópia leva o CPF dos clientes). Fica no histórico.
   */
  gerarCopiaDaLoja(): Promise<CopiaDaLoja>;
  /** Confere o arquivo (formato, loja, conferência) e mostra o que ele leva, sem gravar nada. Só o Adm. Sup. */
  conferirCopiaDaLoja(texto: string): Promise<PreviaDaCopia>;
  /**
   * Troca os dados da loja pelos da cópia. Só o Adm. Sup. A equipe (com as senhas de hoje) e o histórico continuam;
   * a restauração entra no histórico. A tela baixa antes uma cópia dos dados de agora.
   */
  restaurarCopiaDaLoja(texto: string): Promise<PreviaDaCopia>;
  /** Registra no histórico a planilha de cadastro exportada em Dados e backup (o cadastro e quantas linhas). */
  registrarPlanilhaExportada(dados: { assunto: string; linhas: number }): Promise<void>;
  /**
   * Confere a planilha (a tabela lida do arquivo, títulos na primeira linha) com as regras do cadastro e o que a loja já
   * tem (@saas/core importacao.ts). Não grava nada. Precisa de Dados e backup e do acesso ao cadastro.
   */
  conferirImportacao(cadastro: CadastroDaPlanilha, tabela: TabelaImportada): Promise<PreviaDaImportacao>;
  /**
   * Grava as linhas novas, tudo ou nada; o que já existe fica como está. Com linhas com erro, só importa se
   * `semAsLinhasComErro` (elas ficam de fora). Fica no histórico.
   */
  importarCadastro(cadastro: CadastroDaPlanilha, tabela: TabelaImportada, opcoes?: { semAsLinhasComErro?: boolean }): Promise<ResultadoDaImportacao>;
  /**
   * Vendas antigas, só como histórico (@saas/core vendasAntigas.ts): não mexem em estoque, caixa nem financeiro.
   * Conferir não grava; importar grava tudo de uma vez. Precisa de Dados e backup e de Relatórios.
   */
  conferirVendasAntigas(tabela: TabelaImportada): Promise<PreviaDasVendasAntigas>;
  importarVendasAntigas(tabela: TabelaImportada, opcoes?: { semAsLinhasComErro?: boolean }): Promise<ResultadoDasVendasAntigas>;
  /** As vendas antigas importadas (Relatórios → Vendas antigas), da mais nova para a mais antiga. */
  listarVendasAntigas(): Promise<VendaAntiga[]>;
}

// ---- Ferramentas do Adm. Sup (Fase 2, módulo 13): atualizações do sistema e avisos para a equipe da loja.

/** O que a pessoa logada vê: a versão de agora, os avisos do suporte que ela ainda não fechou e as novidades novas. */
export interface ComunicadosDaPessoa {
  versao: string;
  avisos: AvisoDaEquipe[];
  novidades: Atualizacao | null;
}

export interface ApiComunicados {
  /** Todos os logados. */
  meusComunicados(): Promise<ComunicadosDaPessoa>;
  /** A pessoa fechou o aviso ou viu as novidades: some só para ela. */
  marcarComunicadoVisto(id: string): Promise<void>;
  /** As atualizações publicadas, da mais nova para a mais antiga. */
  listarAtualizacoes(): Promise<Atualizacao[]>;
  /** Só o Adm. Sup. Vale para todas as lojas. `novidades`: uma por linha. */
  publicarAtualizacao(dados: { versao: string; novidades: string }): Promise<Atualizacao>;
  /** Os avisos desta loja (ativos, vencidos e encerrados). Só o Adm. Sup. */
  listarAvisosDaEquipe(): Promise<AvisoDaEquipe[]>;
  criarAvisoDaEquipe(dados: { texto: string; importancia?: ImportanciaDoAviso; ate?: string | null }): Promise<AvisoDaEquipe>;
  encerrarAvisoDaEquipe(id: string): Promise<AvisoDaEquipe>;
}

// ---- Ajustes da loja (Adm. Sup, módulo 13f): recursos ligados e desligados e limites (@saas/core recursosDaLoja).

export interface ApiAjustes {
  /** Todos os logados (as telas escondem o que está desligado). */
  lerAjustesDaLoja(): Promise<AjustesDaLoja>;
  /** Só o Adm. Sup. Os limites vazios (null) = sem limite. */
  salvarAjustesDaLoja(ajustes: MudancaDosAjustes): Promise<AjustesDaLoja>;
}

export type ApiPainel = ApiProdutos &
  ApiVendas &
  ApiEstoque &
  ApiClientes &
  ApiFinanceiro &
  ApiLoja &
  ApiFornecedores &
  ApiCompras &
  ApiCaixa &
  ApiFidelidade &
  ApiVales &
  ApiRelatorios &
  ApiDados &
  ApiComunicados &
  ApiAjustes;

// ---- Usuários da loja e a própria conta (item 5.4: login próprio; o Dono cadastra a equipe)

/** Como a tela Usuários recebe cada pessoa (nunca a senha nem o hash). */
export interface UsuarioDaLoja {
  id: string;
  nome: string;
  /** Login, minúsculo. */
  usuario: string;
  /** Na lista da loja, só os papéis da loja; o Adm. Sup aparece só na própria sessão. */
  papel: PapelNaLoja;
  /** Só no Personalizado: as funções escolhidas para ele. */
  permissoes?: string[] | null;
  ativo: boolean;
  /** Senha criada ou redefinida pelo Dono: no próximo acesso a pessoa cria a dela. */
  senhaProvisoria: boolean;
  /** ISO; bloqueado por senhas erradas até este instante (null = não). */
  bloqueadoAte: string | null;
  ultimoAcessoEm: string | null;
  criadoEm: string;
  /** Foto do perfil (data URL PNG, JPEG ou WebP). Sem: a barra mostra a inicial do nome. */
  foto?: string | null;
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
  /** Aba "Meu usuário" (pedido do Luan, 25/11/2026): eu, como estou no cadastro (nome, login, papel e foto). */
  meuPerfil(): Promise<UsuarioDaLoja>;
  /** A minha foto (data URL PNG, JPEG ou WebP, já reduzida; null tira). Cada pessoa troca só a própria. */
  salvarMinhaFoto(foto: string | null): Promise<UsuarioDaLoja>;
  /** As minhas entradas e saídas do sistema, da mais recente para a mais antiga (@saas/core acessosDaPessoa). */
  meusAcessos(): Promise<AcessoDoUsuario[]>;
}

/** Tudo o que a área logada usa. */
export type ApiSistema = ApiPainel & ApiUsuarios & ApiConta;

// ---- Cliente HTTP do sistema real

/** Quem está logado (GET /sessao e resposta do login). */
export interface SessaoAtual {
  usuario: { id: string; nome: string; usuario: string; papel: PapelNaLoja; permissoes?: string[] | null };
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
