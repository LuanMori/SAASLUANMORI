// apps/web/src/demo/apiLocal.ts
// SÓ PARA A DEMONSTRAÇÃO (sistema-padrao-demo.html): faz o papel da API, mas
// guarda tudo no próprio navegador (localStorage), separado por loja.
// Segue as mesmas regras da API/@saas/core: validação do produto e da venda,
// código interno sequencial, preço vindo do cadastro, QUEM VENDEU = quem está
// logado (o operador da sessão, nunca um campo enviado pela tela), desconto e
// estorno conferidos com as autorizações dadas com senha.
//
// Cada venda da Frente de caixa alimenta o resto do sistema, como no DaniPets:
//   - estoque: a venda dá baixa (e é recusada sem estoque); o cancelamento devolve tudo; a devolução
//     devolve o que voltou para a prateleira;
//   - cliente: a venda pode ter um cliente identificado (F6), que ganha o histórico de compras;
//   - financeiro: Dinheiro entra no Caixa físico, Pix na Conta bancária e cartão vira "a receber"
//     (com taxa e prazo); cancelamento e devolução estornam pela mesma forma;
//   - Visão geral e Relatórios leem as vendas e o resumo do financeiro.
//
// Na primeira vez de cada loja, cria produtos (com estoque), clientes e algumas vendas de dias
// anteriores (para os Relatórios terem o que mostrar; a Visão geral de hoje começa zerada).
// Lojas gravadas por versões anteriores da demonstração ganham o estoque e o financeiro montados
// a partir das vendas que já tinham (uma vez só).
//
// Usuários, senhas (com hash), bloqueio por senhas erradas e histórico: usuariosDemo.ts.
//
// Como no servidor (Fase 2, módulo 1): cada operação que grava pega a trava entre abas e grava TUDO OU
// NADA (armazenamento.ts: venda, estoque, financeiro e histórico vão juntos, ou nada vai); cada ação
// importante entra no histórico (sem dado pessoal: o nome é buscado na hora de mostrar); as regras da
// loja (desconto sem senha, prazo do fiado...) vêm das configurações da loja, com os padrões do DaniPets;
// quem foi desativado em outra aba perde o acesso na próxima operação.
//
// NÃO é segurança: aqui não há servidor, RLS nem cookie HttpOnly — tudo roda no navegador.
import {
  liquidoAReceber,
  devolverNoVale,
  emitirVale,
  normalizarCodigoVale,
  proximoNumeroDoVale,
  repartirNosVales,
  usarVale,
  type ValeTroca,
  valesDoCliente,
  valesEmAberto,
  ACAO_DO_CONTATO,
  analisarRetorno,
  type CanalContato,
  cashbackARetirar,
  cashbackVencendo,
  cashbackVencido,
  consumirCashback,
  type ContatoCliente,
  creditarCashback,
  type CupomRetorno,
  cupomAtivo,
  DIAS_ADIAR_LEMBRETE,
  extratoCompletoDoCliente,
  formatarNumeroVenda,
  gerarCashback,
  type LoteCashback,
  lotesValidos,
  mensagemDoCliente,
  motivoSemMensagem,
  proximoVencimento,
  registrarContato,
  resultadoDosLembretes,
  retirarCashbackDaVenda,
  saldoCashback,
  TIPOS_CONTATO,
  type TipoContato,
  type UsoCashback,
  zerarCashbackDoCliente,
  cadastroCompleto,
  clienteTemHistorico,
  fiadoDoCliente,
  liberacaoDoFiadoServe,
  mensagemFiadoPrecisaDono,
  motivosDoFiado,
  receberFiado,
  semAcento,
  temWhatsapp,
  abrirCaixa,
  autorizacaoServe,
  type CaixaDoDia,
  conferirCaixaAberto,
  conferirCaixaParaVender,
  conferirDesfazer,
  conferirVerificacao,
  conferirFechamento,
  conferirHojeNaoFechado,
  conferirLiberacao,
  desfazerFechamento,
  diaDoLancamento,
  fecharCaixa,
  fecharDiasPassados,
  fechamentosAVerificar,
  FORMAS_PAGAMENTO,
  type FormaPagamento,
  formatarCentavos,
  gavetaDoCaixa,
  lancamentosDaOperacao,
  type Liberacao,
  movimentosDaGaveta,
  type Resultado,
  situacaoDoCaixa,
  validarAbertura,
  validarLiberacao,
  validarOperacaoCaixa,
  validarPedidoDesfazer,
  validarPedidoVerificacao,
  verificarFechamento,
  precisaFecharSozinho,
  validarPedidoFechamento,
  type AcaoAuditoria,
  type AcaoAutorizada,
  anonimizarCliente,
  calcularBaixaDoLote,
  calcularEstornoDoItem,
  type Compra,
  type ContaPagar,
  custosMedios,
  DIAS_AVISO_VALIDADE,
  efeitosDaCompra,
  lotesVencendo,
  montarItensDaCompra,
  notaRepetida,
  pagarConta,
  validarNovaCompra,
  aplicarMudancaNasRegras,
  aplicarMudancaNosDados,
  type Autorizacao,
  buscarClientes,
  calcularCancelamento,
  calcularDevolucao,
  calcularVenda,
  type Cliente,
  conferirCpfUnico,
  conferirDocumentoUnico,
  conferirExclusaoDeCliente,
  conferirSaida,
  type ConfiguracaoDaLoja,
  CONTAS,
  type DadosDaLoja,
  diaNoFuso,
  type Devolucao,
  type Fornecedor,
  devolucoesComVenda,
  efeitosFinanceirosDaVenda,
  efeitosFinanceirosDoEstorno,
  fiadoEmAberto,
  formatarCodigoInterno,
  formatarQuantidade,
  FUSO_PADRAO,
  type Lancamento,
  lancamentosManuais,
  LIMITES_CLIENTE,
  mascararCpf,
  mensagemSemPermissao,
  type MovimentoEstoque,
  movimentoInicial,
  movimentoManual,
  movimentosDaDevolucao,
  movimentosDaVenda,
  movimentosDoCancelamento,
  NOME_CLIENTE_REMOVIDO,
  NOME_CONTA,
  normalizarDadosDaLoja,
  normalizarRegras,
  type NovoCliente,
  type Operador,
  type OperadorComPapel,
  type Pagamento,
  type Permissao,
  pode,
  produtoParecido,
  produtoTemHistorico,
  type ProdutoParaVenda,
  type Recebivel,
  receberRecebivel,
  recebiveisDeCartao,
  recebiveisDeFiado,
  resumirAReceber,
  resumirCliente,
  type RegrasDaLoja,
  saldosDasContas,
  saldosDeEstoque,
  situacaoEstoque,
  somarDias,
  TAXAS_CARTAO_PADRAO,
  tirarNomeDoCliente,
  type TaxasCartao,
  unidadeDe,
  validarAlteracaoProduto,
  validarEstoqueMinimo,
  validarFornecedor,
  validarLancamentoManual,
  validarMovimentoManual,
  validarNovaVenda,
  validarNovoCliente,
  validarNovoProduto,
  validarPedidoCancelamento,
  validarPedidoDevolucao,
  validarSaldoInicial,
  validarTaxasCartao,
  type Venda,
  vendasNoPeriodo,
} from '@saas/core';
import { type ApiSistema, ErroApi, type FiltroVendas, type Produto, type SaldoEstoque } from '../api';
import { comTrava, gravando, gravar, gravarDaLoja, ler, lerDaLoja, type PorLoja, transacao } from './armazenamento';
import {
  autorizadoresDemo,
  conferirAutorizadorDemo,
  criarApiUsuariosDemo,
  LOJAS_DEMO,
  registrarAuditoriaDemo,
  usuarioGuardadoDemo,
} from './usuariosDemo';

const CHAVES = {
  produtos: 'saas-demo:produtos:v1',
  vendas: 'saas-demo:vendas:v1',
  exemplos: 'saas-demo:exemplos:v1',
  /** Movimentos de estoque de cada loja. */
  estoque: 'saas-demo:estoque:v1',
  /** Estoque mínimo: loja -> produto -> unidades. */
  minimos: 'saas-demo:estoque-minimo:v1',
  clientes: 'saas-demo:clientes:v1',
  lancamentos: 'saas-demo:lancamentos:v1',
  recebiveis: 'saas-demo:recebiveis:v1',
  /** Taxas e prazos do cartão de cada loja. */
  taxas: 'saas-demo:taxas-cartao:v1',
  /** Lojas que já tiveram o estoque e o financeiro montados a partir das vendas antigas. */
  ecossistema: 'saas-demo:ecossistema:v1',
  /** Dados (nome, descrição, logo) e regras de cada loja: loja -> { dados, regras }. */
  configuracao: 'saas-demo:configuracao:v1',
  /** Fornecedores de cada loja (módulo 3). */
  fornecedores: 'saas-demo:fornecedores:v1',
  /** Compras por nota fiscal e contas a pagar (módulo 4). */
  compras: 'saas-demo:compras:v1',
  contasPagar: 'saas-demo:contas-pagar:v1',
  /** Caixa do dia de cada loja: um por dia (módulo 5). */
  caixas: 'saas-demo:caixas:v1',
  /** Clientes sem histórico excluídos pelo Vendedor, até o Dono ou o Administrador marcar "Ciente" (módulo 6). */
  avisosClientes: 'saas-demo:avisos-clientes:v1',
  /** Fidelidade (módulo 7): lotes de cashback, usos e retiradas, cupons de retorno e lembretes. */
  cashback: 'saas-demo:cashback:v1',
  usosCashback: 'saas-demo:cashback-usos:v1',
  cupons: 'saas-demo:cupons-retorno:v1',
  contatos: 'saas-demo:contatos-clientes:v1',
  /** Vales-troca de cada loja (módulo 8). */
  vales: 'saas-demo:vales-troca:v1',
} as const;

/** Nome e descrição de cada loja antes de alguém mudar (os da faixa da demonstração). */
function dadosPadrao(lojaId: string): DadosDaLoja {
  const l = LOJAS_DEMO.find((x) => x.id === lojaId);
  return { nome: l?.nome ?? 'Minha loja', descricao: l?.descricao ?? null, logo: null };
}

/** Configuração da loja (o que não foi mudado vem com os padrões do DaniPets). */
export function configuracaoDemo(lojaId: string): ConfiguracaoDaLoja {
  const g = ler<Record<string, { dados?: unknown; regras?: unknown }>>(CHAVES.configuracao, {})[lojaId] ?? {};
  return { dados: normalizarDadosDaLoja(g.dados, dadosPadrao(lojaId)), regras: normalizarRegras(g.regras) };
}

function gravarConfiguracao(lojaId: string, c: ConfiguracaoDaLoja): void {
  gravar(CHAVES.configuracao, { ...ler<Record<string, unknown>>(CHAVES.configuracao, {}), [lojaId]: c });
}

/** Apaga produtos, vendas, estoque, clientes e financeiro de todas as lojas (os exemplos não voltam). */
export function apagarDadosDemo(): void {
  const lojas = Object.keys(ler<PorLoja<Produto>>(CHAVES.produtos, {}));
  for (const chave of [
    CHAVES.produtos,
    CHAVES.vendas,
    CHAVES.estoque,
    CHAVES.minimos,
    CHAVES.clientes,
    CHAVES.lancamentos,
    CHAVES.recebiveis,
    CHAVES.taxas,
    CHAVES.configuracao,
    CHAVES.fornecedores,
    CHAVES.compras,
    CHAVES.contasPagar,
  ]) {
    gravar(chave, {});
  }
  const apagadas = [...new Set([...ler<string[]>(CHAVES.exemplos, []), ...lojas, 'loja-a', 'loja-b'])];
  gravar(CHAVES.exemplos, apagadas);
  // nada a montar nessas lojas (e os clientes de exemplo também não voltam)
  gravar(CHAVES.ecossistema, apagadas);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const comId = <T extends object>(x: T): T & { id: string } => ({ ...x, id: novoId() });

/** Do mais novo para o mais antigo; no mesmo instante, o gravado por último vem primeiro. */
function maisNovosPrimeiro<T extends { criadoEm: string }>(lista: readonly T[]): T[] {
  return lista
    .map((x, i) => [x, i] as const)
    .sort((a, b) => b[0].criadoEm.localeCompare(a[0].criadoEm) || b[1] - a[1])
    .map(([x]) => x);
}

/**
 * Vendas gravadas por versões anteriores da demonstração (uma forma de pagamento só, sem
 * desconto, sem cancelamento, sem cliente) passam para o formato atual na leitura. Nada se perde.
 */
export function normalizarVenda(bruta: Venda & { formaPagamento?: Pagamento['forma'] }): Venda {
  const pagamentos =
    Array.isArray(bruta.pagamentos) ? bruta.pagamentos : bruta.formaPagamento ? [{ forma: bruta.formaPagamento, valorCentavos: bruta.totalCentavos }] : [];
  const { formaPagamento: _antiga, ...resto } = bruta;
  return {
    ...resto,
    cliente: bruta.cliente ?? null,
    itens: bruta.itens.map((i) => ({ ...i, precoListaCentavos: i.precoListaCentavos ?? i.precoCentavos, desconto: i.desconto ?? null })),
    descontoCentavos: bruta.descontoCentavos ?? 0,
    pagamentos,
    recebidoDinheiroCentavos: bruta.recebidoDinheiroCentavos ?? null,
    trocoCentavos: bruta.trocoCentavos ?? 0,
    status: bruta.status ?? 'finalizada',
    cancelamento: bruta.cancelamento ?? null,
    // devolução antiga (sem a marcação) voltou para a prateleira, como o padrão de hoje
    devolucoes: (bruta.devolucoes ?? []).map((d) => ({ ...d, itens: d.itens.map((i) => ({ ...i, voltaAoEstoque: i.voltaAoEstoque !== false })) })),
  };
}

/** Produtos gravados antes do cadastro completo: sem marca, sem peso, sem fornecedor e vendidos por unidade. */
export function normalizarProduto(p: Produto): Produto {
  const { temHistorico: _calculado, ...guardado } = p;
  return { ...guardado, marca: p.marca ?? null, pesoGramas: p.pesoGramas ?? null, unidade: unidadeDe(p.unidade), fornecedorId: p.fornecedorId ?? null };
}

// ------------------------------------------------------------------ autorizações dadas com senha
// Ficam só na memória desta aba (como no DaniPets): recarregar a página não cria autorização.
const autorizacoes = new Map<string, Autorizacao & { lojaId: string }>();

// ------------------------------------------------------------------ exemplos
/**
 * estoque = quanto o produto tem depois das vendas de exemplo; minimo = aviso de estoque baixo (no produto
 * por kg, em gramas).
 */
const PRODUTOS_EXEMPLO: { nome: string; codigoBarras: string | null; precoCentavos: number; estoque: number; minimo: number; unidade?: 'kg'; marca?: string }[] = [
  { nome: 'Ração Premium Cães Adultos 15 kg', codigoBarras: '7891000100103', precoCentavos: 18990, estoque: 12, minimo: 4 },
  { nome: 'Ração Gatos Castrados 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990, estoque: 18, minimo: 5 },
  { nome: 'Areia Sanitária 4 kg', codigoBarras: '7896000300306', precoCentavos: 2490, estoque: 25, minimo: 6 },
  { nome: 'Petisco Bifinho Carne 65 g', codigoBarras: '7897000400403', precoCentavos: 750, estoque: 60, minimo: 12 },
  { nome: 'Shampoo Neutro 500 ml', codigoBarras: null, precoCentavos: 3200, estoque: 8, minimo: 3 },
  { nome: 'Coleira Ajustável M', codigoBarras: null, precoCentavos: 2990, estoque: 3, minimo: 5 },
  // vendida a granel, por kg (DaniPets: ração a granel); preço do quilo
  { nome: 'Ração a granel Cães Adultos', codigoBarras: '2000000000015', precoCentavos: 1990, estoque: 25_000, minimo: 5000, unidade: 'kg', marca: 'Granel da casa' },
];

/** Produto que não é dos exemplos, numa loja antiga: começa com este estoque. */
const ESTOQUE_PRODUTO_ANTIGO = 20;

/** Clientes fictícios (CPFs de teste, que começam com 000). */
/** A Maria tem R$ 200,00 de limite de fiado (para a demonstração do fiado). */
const CLIENTES_EXEMPLO: (Pick<NovoCliente, 'nome' | 'telefone' | 'cpf'> & { limiteFiadoCentavos?: number })[] = [
  { nome: 'Maria Oliveira', telefone: '41999990001', cpf: '00000000191', limiteFiadoCentavos: 20_000 },
  { nome: 'João Pereira', telefone: '41999990002', cpf: '00000000272' },
  { nome: 'Fernanda Lima', telefone: '4133330003', cpf: '00000000353' },
];

type ExemploVenda = {
  diasAtras: number;
  hora: number;
  minuto: number;
  vendedor: { id: string; nome: string };
  /** [índice do produto, quantidade, preço final (desconto) opcional] */
  itens: [number, number, number?][];
  /** Partes do pagamento; a última recebe o que faltar. */
  pagamentos: [Pagamento['forma'], number?][];
  recebido?: number;
  motivoDesconto?: string;
  /** Índice em CLIENTES_EXEMPLO. */
  cliente?: number;
};

const VENDAS_EXEMPLO: ExemploVenda[] = [
  { diasAtras: 2, hora: 9, minuto: 32, vendedor: { id: 'ana', nome: 'Ana' }, itens: [[0, 1]], pagamentos: [['credito']], cliente: 0 },
  { diasAtras: 2, hora: 16, minuto: 18, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[3, 3], [2, 1]], pagamentos: [['pix']] },
  { diasAtras: 1, hora: 10, minuto: 5, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[1, 2]], pagamentos: [['debito']], cliente: 1 },
  {
    diasAtras: 1,
    hora: 14,
    minuto: 41,
    vendedor: { id: 'ana', nome: 'Ana' },
    itens: [[4, 1], [5, 1]],
    pagamentos: [['dinheiro', 3000], ['pix']],
    recebido: 5000,
    cliente: 0,
  },
  { diasAtras: 1, hora: 17, minuto: 56, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[3, 6, 700]], pagamentos: [['pix']], motivoDesconto: 'Leve 6, pague menos' },
];

/** Clientes de exemplo, se a loja ainda não tem nenhum. */
function criarClientesExemplo(lojaId: string, criadoEm: string): Cliente[] {
  const existentes = lerDaLoja<Cliente>(CHAVES.clientes, lojaId);
  if (existentes.length > 0) return existentes;
  const clientes = CLIENTES_EXEMPLO.map((c) => ({ id: novoId(), ...c, ativo: true, criadoEm, atualizadoEm: criadoEm }));
  gravarDaLoja(CHAVES.clientes, lojaId, clientes);
  return clientes;
}

/** Instante em que são hora:minuto do dia AAAA-MM-DD no fuso da loja (não no fuso do navegador). */
export function instanteNoFuso(dia: string, hora: number, minuto: number, fuso: string): Date {
  const [a, m, d] = dia.split('-').map(Number);
  const palpite = Date.UTC(a!, m! - 1, d!, hora, minuto);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(palpite))
    .reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.type]: Number(x.value) }), {});
  const noFuso = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!);
  return new Date(palpite - (noFuso - palpite));
}

/** Cria os exemplos da loja (uma vez). Devolve true se criou as vendas de exemplo agora. */
function criarExemplos(lojaId: string, agora: Date, fuso: string): boolean {
  const feitos = ler<string[]>(CHAVES.exemplos, []);
  if (feitos.includes(lojaId)) return false;
  let criouVendas = false;

  const criadoEm = new Date(agora.getTime() - 3 * 86_400_000).toISOString();
  const existentes = lerDaLoja<Produto>(CHAVES.produtos, lojaId);
  const produtos: Produto[] =
    existentes.length > 0
      ? existentes
      : PRODUTOS_EXEMPLO.map((p, i) => ({
          id: novoId(),
          codigoInterno: formatarCodigoInterno(i + 1),
          codigoBarras: p.codigoBarras,
          nome: p.nome,
          precoCentavos: p.precoCentavos,
          marca: p.marca ?? null,
          pesoGramas: null,
          unidade: p.unidade ?? 'un',
          ativo: true,
          criadoEm,
          atualizadoEm: criadoEm,
        }));
  const clientes = criarClientesExemplo(lojaId, criadoEm);

  const vendas: Venda[] = lerDaLoja<Venda>(CHAVES.vendas, lojaId);
  if (vendas.length === 0 && produtos.length >= PRODUTOS_EXEMPLO.length) {
    criouVendas = true;
    VENDAS_EXEMPLO.forEach((e, n) => {
      // dia e hora no fuso da loja, como todo o resto do sistema
      const quando = instanteNoFuso(somarDias(diaNoFuso(agora, fuso), -e.diasAtras), e.hora, e.minuto, fuso);
      const itens = e.itens.map(([indice, quantidade, precoFinal]) => {
        const p = produtos[indice]!;
        const preco = precoFinal ?? p.precoCentavos;
        return {
          produtoId: p.id,
          codigoInterno: p.codigoInterno,
          nome: p.nome,
          precoListaCentavos: p.precoCentavos,
          precoCentavos: preco,
          quantidade,
          subtotalCentavos: preco * quantidade,
          desconto: precoFinal === undefined ? null : { motivo: e.motivoDesconto ?? 'Desconto', responsavel: e.vendedor, autorizadoComSenha: false },
        };
      });
      const total = itens.reduce((s, it) => s + it.subtotalCentavos, 0);
      let falta = total;
      const pagamentos = e.pagamentos.map(([forma, valor], i) => {
        const v = i === e.pagamentos.length - 1 ? falta : valor!;
        falta -= v;
        return { forma, valorCentavos: v };
      });
      const dinheiro = pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valorCentavos, 0);
      const cliente = e.cliente === undefined ? undefined : clientes[e.cliente];
      vendas.push({
        id: novoId(),
        numero: n + 1,
        criadaEm: quando.toISOString(),
        vendedor: e.vendedor,
        cliente: cliente ? { id: cliente.id, nome: cliente.nome } : null,
        itens,
        totalCentavos: total,
        descontoCentavos: itens.reduce((s, it) => s + (it.precoListaCentavos - it.precoCentavos) * it.quantidade, 0),
        pagamentos,
        recebidoDinheiroCentavos: dinheiro > 0 ? (e.recebido ?? dinheiro) : null,
        trocoCentavos: dinheiro > 0 ? (e.recebido ?? dinheiro) - dinheiro : 0,
        status: 'finalizada',
        cancelamento: null,
        devolucoes: [],
      });
    });
  }

  gravarDaLoja(CHAVES.produtos, lojaId, produtos);
  gravarDaLoja(CHAVES.vendas, lojaId, vendas);
  gravar(CHAVES.exemplos, [...feitos, lojaId]);
  return criouVendas;
}

const IMPLANTACAO: Operador = { id: 'implantacao', nome: 'Implantação do sistema' };
/** Cliente sem histórico excluído pelo Vendedor (o Dono e o Administrador veem até marcar "Ciente"). */
interface AvisoDeCliente {
  id: string;
  clienteNome: string;
  telefone: string;
  motivo: string;
  por: Operador;
  em: string;
  ciente: { por: Operador; em: string } | null;
}
/** Quem abriu e fechou o caixa nos dias dos exemplos (a Dona da loja de exemplo) e o fundo de troco. */
const DONO_EXEMPLO: Operador = { id: 'ana', nome: 'Ana' };
const FUNDO_EXEMPLO = 10_000;

/**
 * Uma vez por loja: monta o estoque e o financeiro a partir das vendas que já existem (exemplos ou
 * vendas feitas em versões anteriores da demonstração). O estoque inicial de cada produto é lançado
 * de forma que, depois das vendas, sobre a quantidade do exemplo (nunca fica negativo).
 */
function prepararEcossistema(lojaId: string, opcoes: { fuso: string; exemplos: boolean; vendasDeExemplo?: boolean }): void {
  const feitos = ler<string[]>(CHAVES.ecossistema, []);
  if (feitos.includes(lojaId)) return;

  const produtos = lerDaLoja<Produto>(CHAVES.produtos, lojaId);
  const vendas = lerDaLoja<Venda>(CHAVES.vendas, lojaId)
    .map(normalizarVenda)
    .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  const taxas = ler<Record<string, TaxasCartao>>(CHAVES.taxas, {})[lojaId] ?? TAXAS_CARTAO_PADRAO;
  const movimentos: MovimentoEstoque[] = [];
  const lancamentos: Lancamento[] = [];
  let recebiveis: Recebivel[] = [];

  const estornar = (venda: Venda, estornos: Pagamento[], rotulo: string, em: string, por: Operador) => {
    const r = efeitosFinanceirosDoEstorno(venda, estornos, recebiveis.filter((x) => x.vendaId === venda.id), { rotulo, em, por });
    if (!r.ok) return;
    lancamentos.push(...r.valor.lancamentos.map(comId));
    recebiveis = [...recebiveis.filter((x) => x.vendaId !== venda.id), ...r.valor.recebiveis];
  };

  for (const v of vendas) {
    movimentos.push(...movimentosDaVenda(v).map(comId));
    const f = efeitosFinanceirosDaVenda(v, { taxas, fuso: opcoes.fuso, prazoFiadoDias: configuracaoDemo(lojaId).regras.fiado.prazoDias });
    lancamentos.push(...f.lancamentos.map(comId));
    recebiveis.push(...f.recebiveis.map(comId));
    for (const d of [...v.devolucoes].sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))) {
      movimentos.push(...movimentosDaDevolucao(v, d).map(comId));
      estornar(v, d.estornos, `Devolução nº ${d.numero}`, d.criadaEm, d.feitaPor);
    }
    if (v.status === 'cancelada' && v.cancelamento) {
      const c = v.cancelamento;
      movimentos.push(...movimentosDoCancelamento(v, { motivo: c.motivo, em: c.em, por: c.por }).map(comId));
      estornar(v, c.estornos, 'Cancelamento', c.em, c.por);
    }
  }

  const saldos = saldosDeEstoque(movimentos);
  const iniciais: MovimentoEstoque[] = [];
  const minimos: Record<string, number> = { ...(ler<Record<string, Record<string, number>>>(CHAVES.minimos, {})[lojaId] ?? {}) };
  for (const p of produtos) {
    const exemplo = PRODUTOS_EXEMPLO.find((e) => e.nome === p.nome);
    const quantidade = Math.max(0, (exemplo?.estoque ?? ESTOQUE_PRODUTO_ANTIGO) - (saldos.get(p.id) ?? 0));
    if (quantidade > 0) {
      iniciais.push(comId({ produtoId: p.id, tipo: 'inicial' as const, quantidade, criadoEm: p.criadoEm, motivo: 'Estoque inicial', vendaId: null, vendaNumero: null, por: IMPLANTACAO }));
    }
    if (exemplo && opcoes.exemplos && minimos[p.id] === undefined) minimos[p.id] = exemplo.minimo;
  }

  if (opcoes.exemplos) criarClientesExemplo(lojaId, produtos[0]?.criadoEm ?? new Date().toISOString());
  // Caixa do dia dos exemplos: nos dias com vendas, o caixa abriu às 08:00 com R$ 100,00 de troco e fechou às
  // 18:30 sem diferença. O Caixa físico começa com esses R$ 100,00 (saldo inicial da implantação), para a
  // gaveta e o saldo baterem. O caixa de hoje fica para a pessoa abrir.
  const caixas = lerDaLoja<CaixaDoDia>(CHAVES.caixas, lojaId);
  if (opcoes.vendasDeExemplo && vendas.length > 0 && caixas.length === 0) {
    const antigos = lerDaLoja<Lancamento>(CHAVES.lancamentos, lojaId);
    const primeiroDia = vendas.map((v) => diaNoFuso(v.criadaEm, opcoes.fuso)).sort()[0]!;
    if (!antigos.some((l) => l.conta === 'caixa' && l.tipo === 'saldo_inicial')) {
      lancamentos.unshift(
        comId({
          conta: 'caixa' as const,
          tipo: 'saldo_inicial' as const,
          valorCentavos: FUNDO_EXEMPLO,
          descricao: 'Saldo inicial (implantação)',
          criadoEm: instanteNoFuso(somarDias(primeiroDia, -1), 18, 0, opcoes.fuso).toISOString(),
          vendaId: null,
          vendaNumero: null,
          recebivelId: null,
          categoria: null,
          por: IMPLANTACAO,
        }),
      );
    }
    const todos = [...antigos, ...lancamentos];
    const dias = [...new Set(vendas.map((v) => diaNoFuso(v.criadaEm, opcoes.fuso)))].sort();
    for (const dia of dias) {
      const aberto = abrirCaixa({ fundoCentavos: FUNDO_EXEMPLO, observacao: null }, { id: novoId(), hoje: dia, em: instanteNoFuso(dia, 8, 0, opcoes.fuso).toISOString(), por: DONO_EXEMPLO });
      const gaveta = gavetaDoCaixa(aberto, todos, opcoes.fuso);
      const { caixa } = fecharCaixa(
        { caixa: aberto, gaveta, contadoCentavos: gaveta.esperadoCentavos, diferencaCentavos: 0, justificativa: null, precisaAutorizacao: false },
        { em: instanteNoFuso(dia, 18, 30, opcoes.fuso).toISOString(), por: DONO_EXEMPLO, autorizadoPor: null, vendas, lancamentos: todos, fuso: opcoes.fuso },
      );
      caixas.push(caixa);
      // as vendas dos exemplos ficam ligadas ao caixa do dia delas
      for (const v of vendas) if (diaNoFuso(v.criadaEm, opcoes.fuso) === dia) v.caixaId = caixa.id;
    }
    // cashback das vendas de exemplo com cliente (como se o programa já estivesse ligado): a Maria e o João
    // começam com saldo para usar na Frente de caixa (módulo 7)
    if (lerDaLoja<LoteCashback>(CHAVES.cashback, lojaId).length === 0) {
      const regrasCb = configuracaoDemo(lojaId).regras.cashback;
      const clientesEx = lerDaLoja<Cliente>(CHAVES.clientes, lojaId);
      const lotes: LoteCashback[] = [];
      for (const v of vendas) {
        const cli = v.cliente ? clientesEx.find((c) => c.id === v.cliente!.id) : undefined;
        const l = v.status === 'finalizada' ? gerarCashback(v, cli, regrasCb, { dia: diaNoFuso(v.criadaEm, opcoes.fuso), em: v.criadaEm, por: v.vendedor, novoId }) : null;
        if (!l) continue;
        lotes.push(l);
        v.cashbackGeradoCentavos = l.valorCentavos;
      }
      gravarDaLoja(CHAVES.cashback, lojaId, lotes);
    }
    gravarDaLoja(CHAVES.vendas, lojaId, vendas);
    gravarDaLoja(CHAVES.caixas, lojaId, caixas);
  }
  gravarDaLoja(CHAVES.estoque, lojaId, [...iniciais, ...lerDaLoja<MovimentoEstoque>(CHAVES.estoque, lojaId), ...movimentos]);
  gravarDaLoja(CHAVES.lancamentos, lojaId, [...lerDaLoja<Lancamento>(CHAVES.lancamentos, lojaId), ...lancamentos]);
  gravarDaLoja(CHAVES.recebiveis, lojaId, [...lerDaLoja<Recebivel>(CHAVES.recebiveis, lojaId), ...recebiveis]);
  gravar(CHAVES.minimos, { ...ler<Record<string, Record<string, number>>>(CHAVES.minimos, {}), [lojaId]: minimos });
  gravar(CHAVES.ecossistema, [...feitos, lojaId]);
}

// ------------------------------------------------------------------ API local
export interface OpcoesApiLocal {
  /** Loja ativa (no sistema real vem do token, nunca do cliente). */
  lojaId: string;
  /** Quem está logado. É quem fica registrado como vendedor. */
  operador?: OperadorComPapel | null;
  /** Simula a pessoa sem acesso: a API responde 403. */
  bloqueio?: string | null;
  fuso?: string;
  /** Relógio (para testes). */
  agora?: () => Date;
  /** Cria produtos, clientes e vendas de exemplo na primeira vez da loja. */
  exemplos?: boolean;
  /** Atraso simulado da rede, em ms. */
  atrasoMs?: number;
  /** A pessoa logada foi desativada (em outra aba): a tela volta para a entrada com esta mensagem. */
  aoSessaoEncerrada?: (mensagem: string) => void;
}

/** A loja já tem os exemplos e o estoque e o financeiro montados? */
const lojaPreparada = (lojaId: string, exemplos: boolean) =>
  (!exemplos || ler<string[]>(CHAVES.exemplos, []).includes(lojaId)) && ler<string[]>(CHAVES.ecossistema, []).includes(lojaId);

export function criarApiLocal({
  lojaId,
  operador = null,
  bloqueio = null,
  fuso = FUSO_PADRAO,
  agora = () => new Date(),
  exemplos = true,
  atrasoMs = 120,
  aoSessaoEncerrada,
}: OpcoesApiLocal): ApiSistema {
  const preparar = async (ms = atrasoMs) => {
    await esperar(ms);
    if (bloqueio) throw new ErroApi(403, bloqueio);
    // na primeira vez da loja, uma aba só monta os exemplos (as outras esperam e encontram pronto)
    if (!lojaPreparada(lojaId, exemplos)) {
      await comTrava(() =>
        transacao(() => {
          const vendasDeExemplo = exemplos ? criarExemplos(lojaId, agora(), fuso) : false;
          prepararEcossistema(lojaId, { fuso, exemplos, vendasDeExemplo });
        }),
      );
    }
  };
  /**
   * Toda operação que grava: trava entre abas + tudo ou nada. Antes, o caixa de um dia anterior que ficou
   * aberto fecha sozinho (DaniPets: fechamento automático à meia-noite, sem contagem e sem ajuste).
   */
  const gravarOperacao = <T,>(fn: () => T): Promise<T> =>
    gravando(() => {
      fecharCaixasPassados();
      return fn();
    });
  /**
   * Quem está logado, como está AGORA no cadastro (o servidor também confere a cada pedido): desativado
   * em outra aba perde o acesso; papel mudado vale na hora.
   */
  const exigirOperador = (): OperadorComPapel => {
    if (!operador) throw new ErroApi(401, 'Faça login para continuar.');
    const atual = usuarioGuardadoDemo(lojaId, operador.id);
    if (atual && !atual.ativo) {
      const mensagem = 'Seu acesso a esta loja foi desativado. Fale com o Dono da loja.';
      aoSessaoEncerrada?.(mensagem);
      throw new ErroApi(401, mensagem, [], 'sessao_encerrada');
    }
    return atual ? { id: atual.id, nome: atual.nome, papel: atual.papel } : operador;
  };
  const config = () => configuracaoDemo(lojaId);
  const regras = (): RegrasDaLoja => config().regras;
  /** Histórico: quem está logado fez. Sem dado pessoal nos detalhes. */
  const auditar = (acao: AcaoAuditoria, alvo: { tipo: string; id: string } | null = null, detalhes: Record<string, unknown> = {}) =>
    registrarAuditoriaDemo(lojaId, operador?.id ?? null, acao, alvo, detalhes, agora());
  /** Mesma matriz de permissões do servidor (@saas/core/permissoes). */
  const exigir = (permissao: Permissao): OperadorComPapel => {
    const quem = exigirOperador();
    if (!pode(quem.papel, permissao)) throw new ErroApi(403, mensagemSemPermissao(permissao));
    return quem;
  };
  const pessoa = (o: OperadorComPapel): Operador => ({ id: o.id, nome: o.nome });
  /** O Vendedor só consulta o dia de hoje; outros períodos são dos Relatórios (Dono e Administrador). */
  const exigirPeriodoPermitido = (filtro: FiltroVendas) => {
    const quem = exigirOperador();
    const hoje = diaNoFuso(agora(), fuso);
    if (!pode(quem.papel, 'relatorios') && (filtro.de !== hoje || filtro.ate !== hoje)) {
      throw new ErroApi(403, 'Vendas de outros dias: só o Dono ou o Administrador (Relatórios).');
    }
  };

  const produtosDaLoja = () => lerDaLoja<Produto>(CHAVES.produtos, lojaId).map(normalizarProduto);
  const vendasDaLoja = () => lerDaLoja<Venda>(CHAVES.vendas, lojaId).map(normalizarVenda);
  const gravarVendas = (vendas: Venda[]) => gravarDaLoja(CHAVES.vendas, lojaId, vendas);
  const movimentosDaLoja = () => lerDaLoja<MovimentoEstoque>(CHAVES.estoque, lojaId);
  const juntarMovimentos = (novos: Omit<MovimentoEstoque, 'id'>[]) => gravarDaLoja(CHAVES.estoque, lojaId, [...movimentosDaLoja(), ...novos.map(comId)]);
  const minimosDaLoja = () => ler<Record<string, Record<string, number>>>(CHAVES.minimos, {})[lojaId] ?? {};
  const clientesDaLoja = () => lerDaLoja<Cliente>(CHAVES.clientes, lojaId);
  const lancamentosDaLoja = () => lerDaLoja<Lancamento>(CHAVES.lancamentos, lojaId);
  const juntarLancamentos = (novos: Omit<Lancamento, 'id'>[]) => {
    const comIds = novos.map(comId);
    gravarDaLoja(CHAVES.lancamentos, lojaId, [...lancamentosDaLoja(), ...comIds]);
    return comIds;
  };
  const recebiveisDaLoja = () => lerDaLoja<Recebivel>(CHAVES.recebiveis, lojaId);
  const taxasDaLoja = () => ler<Record<string, TaxasCartao>>(CHAVES.taxas, {})[lojaId] ?? TAXAS_CARTAO_PADRAO;
  const autorizacoesDaLoja = () => new Map([...autorizacoes].filter(([, a]) => a.lojaId === lojaId));
  const acharVenda = (vendas: Venda[], vendaId: string) => {
    const i = vendas.findIndex((v) => v.id === vendaId);
    if (i < 0) throw new ErroApi(404, 'Venda não encontrada.');
    return i;
  };
  const diaNoPeriodo = (dia: string, filtro: FiltroVendas) => (!filtro.de || dia >= filtro.de) && (!filtro.ate || dia <= filtro.ate);
  const saldoDoProduto = (produtoId: string): SaldoEstoque => {
    const saldo = saldosDeEstoque(movimentosDaLoja()).get(produtoId) ?? 0;
    const minimo = minimosDaLoja()[produtoId] ?? null;
    return { produtoId, saldo, minimo, situacao: situacaoEstoque(saldo, minimo) };
  };
  const exigirProduto = (produtoId: unknown) => {
    const p = produtosDaLoja().find((x) => x.id === produtoId);
    if (!p) throw new ErroApi(404, 'Produto não encontrado.');
    return p;
  };
  /** A loja vende por kg? (Produtos e estoque → Regras do estoque) */
  const exigirUnidadeDaLoja = (unidade: 'un' | 'kg') => {
    if (!regras().produtos.unidades.includes(unidade)) {
      throw new ErroApi(400, unidade === 'kg' ? 'Esta loja não vende por quilo. Ligue o kg em Produtos e estoque → Regras do estoque.' : 'Esta loja não vende por unidade.', [
        { campo: 'unidade', mensagem: 'Unidade desligada nas regras da loja.' },
      ]);
    }
  };
  const fornecedoresDaLoja = () => lerDaLoja<Fornecedor>(CHAVES.fornecedores, lojaId);
  const comprasDaLoja = () => lerDaLoja<Compra>(CHAVES.compras, lojaId);
  const contasPagarDaLoja = () => lerDaLoja<ContaPagar>(CHAVES.contasPagar, lojaId);
  /** O fornecedor escolhido existe nesta loja e está ativo. */
  const exigirFornecedorAtivo = (id: string | null | undefined) => {
    if (!id) return;
    if (!fornecedoresDaLoja().some((f) => f.id === id && f.ativo)) {
      throw new ErroApi(400, 'Fornecedor não encontrado ou desativado. Escolha outro na lista.', [{ campo: 'fornecedorId', mensagem: 'Fornecedor inválido.' }]);
    }
  };
  /** Código de barras único na loja e diferente de qualquer código interno (DaniPets). */
  const conferirCodigoDeBarras = (codigo: string | null, daLoja: readonly Produto[], excetoId: string | null) => {
    if (!codigo) return;
    const dono = daLoja.find((p) => p.id !== excetoId && (p.codigoInterno === codigo || p.codigoBarras === codigo));
    if (dono) {
      throw new ErroApi(409, `Código de barras repetido: ${codigo} já está vinculado ao produto "${dono.nome}".`, [{ campo: 'codigoBarras', mensagem: `Já usado em "${dono.nome}".` }]);
    }
  };

  // ---------------------------------------------------------------- caixa do dia (módulo 5)
  const caixasDaLoja = () => lerDaLoja<CaixaDoDia>(CHAVES.caixas, lojaId);
  const gravarCaixas = (caixas: CaixaDoDia[]) => gravarDaLoja(CHAVES.caixas, lojaId, caixas);
  const hojeNaLoja = () => diaNoFuso(agora(), fuso);
  const situacaoCaixa = () => situacaoDoCaixa(caixasDaLoja(), hojeNaLoja());
  /** Com o caixa de hoje aberto: o dinheiro esperado na gaveta (o limite do que pode sair dela). */
  const gavetaDeHoje = (): { esperadoCentavos: number } | null => {
    const s = situacaoCaixa();
    return s.estado === 'aberto' && s.caixa ? gavetaDoCaixa(s.caixa, lancamentosDaLoja(), fuso) : null;
  };
  /** Caixa de um dia anterior que fecha sozinho (o dia reaberto hoje para contar a gaveta não conta). */
  const temCaixaPassadoAberto = () => {
    const hoje = hojeNaLoja();
    return caixasDaLoja().some((c) => precisaFecharSozinho(c, hoje, fuso));
  };
  /** Caixas de dias anteriores que ficaram abertos fecham sozinhos (sem contagem e sem ajuste). */
  function fecharCaixasPassados() {
    if (!temCaixaPassadoAberto()) return;
    const r = fecharDiasPassados(caixasDaLoja(), { hoje: hojeNaLoja(), em: agora().toISOString(), vendas: vendasDaLoja(), lancamentos: lancamentosDaLoja(), fuso });
    gravarCaixas(r.caixas);
    for (const c of r.fechados) {
      registrarAuditoriaDemo(lojaId, null, 'caixa.fechamento_automatico', null, { dia: c.dia, esperadoCentavos: c.fechamento!.esperadoCentavos }, agora());
    }
  }
  /** Resultado das regras: recusa com a mensagem da regra (e o código para a tela reagir). */
  const exigirOk = <T,>(r: Resultado<T>, status = 409, codigo: string | null = null): T => {
    if (!r.ok) throw new ErroApi(status, r.erros[0]?.mensagem ?? 'Não foi possível concluir.', r.erros, codigo);
    return r.valor;
  };
  const exigirHojeNaoFechado = () => exigirOk(conferirHojeNaoFechado(situacaoCaixa()), 409, 'caixa');
  /**
   * Dia já fechado no Caixa do dia: só com a liberação de um Dono (senha e motivo, DaniPets assertRetro).
   * `confirmar` (no fim da operação) gasta a autorização e registra no histórico.
   */
  const exigirLiberacao = (dia: string, oque: string, codigo: 'compra' | 'ajuste' | 'entrada' | 'financeiro', pedido: unknown) => {
    const v = exigirOk(validarLiberacao(pedido), 400);
    const a = v ? (autorizacoesDaLoja().get(v.autorizacao) ?? null) : null;
    const r = exigirOk(conferirLiberacao(dia, { hoje: hojeNaLoja(), caixas: caixasDaLoja(), oque, liberacao: v, autorizacao: a, agora: agora() }), 409, 'dia_fechado');
    return {
      liberacao: r.liberacao as Liberacao | null,
      confirmar: () => {
        if (r.autorizacaoUsada) autorizacoes.delete(r.autorizacaoUsada); // uso único
        if (r.liberacao) auditar('dia_fechado.liberado', null, { oque: codigo, dia, autorizadoPor: r.liberacao.por.id });
      },
    };
  };
  const vendasDoDia = (dia: string): Record<FormaPagamento, number> => {
    const porForma = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f, 0])) as Record<FormaPagamento, number>;
    for (const v of vendasDaLoja()) {
      if (v.status === 'cancelada' || diaNoFuso(v.criadaEm, fuso) !== dia) continue;
      for (const p of v.pagamentos) porForma[p.forma] += p.valorCentavos;
    }
    return porForma;
  };

  // ---------------------------------------------------------------- fidelidade (módulo 7)
  const lotesDaLoja = () => lerDaLoja<LoteCashback>(CHAVES.cashback, lojaId);
  const gravarLotes = (lotes: LoteCashback[]) => gravarDaLoja(CHAVES.cashback, lojaId, lotes);
  const usosDaLoja = () => lerDaLoja<UsoCashback>(CHAVES.usosCashback, lojaId);
  const juntarUso = (uso: Omit<UsoCashback, 'id'>) => gravarDaLoja(CHAVES.usosCashback, lojaId, [...usosDaLoja(), comId(uso)]);
  const cuponsDaLoja = () => lerDaLoja<CupomRetorno>(CHAVES.cupons, lojaId);
  const gravarCupons = (cupons: CupomRetorno[]) => gravarDaLoja(CHAVES.cupons, lojaId, cupons);
  const contatosDaLoja = () => lerDaLoja<ContatoCliente>(CHAVES.contatos, lojaId);
  // ---------------------------------------------------------------- vale-troca (módulo 8)
  const valesDaLoja = () => lerDaLoja<ValeTroca>(CHAVES.vales, lojaId);
  const gravarVales = (vales: ValeTroca[]) => gravarDaLoja(CHAVES.vales, lojaId, vales);
  /** Os 3 caracteres sorteados do código (VT-0001-ABC), como o DaniPets: crypto.getRandomValues. */
  const sortearCodigo = () => crypto.getRandomValues(new Uint8Array(3));
  /**
   * O que volta pela forma "vale-troca" vai para os vales usados na venda (cada um até o que pagou nela). Devolve
   * os estornos com o vale de cada parte e a função que grava os vales.
   */
  const prepararValesDoEstorno = (venda: Venda, estornos: readonly Pagamento[], rotulo: string, em: string, por: Operador) => {
    const valorNoVale = estornos.filter((e) => e.forma === 'vale').reduce((t, e) => t + e.valorCentavos, 0);
    if (valorNoVale === 0) return { estornos: [...estornos], gravar: () => undefined };
    const vales = valesDaLoja();
    const partes = exigirOk(repartirNosVales(vales, venda.pagamentos, venda.id, valorNoVale));
    const porVale = new Map(partes.map((x) => [x.valeId, x.valorCentavos]));
    return {
      // a parte do vale, separada por vale (para mostrar o código e devolver no vale certo)
      estornos: [
        ...estornos.filter((e) => e.forma !== 'vale' && FORMAS_PAGAMENTO.indexOf(e.forma) < FORMAS_PAGAMENTO.indexOf('vale')),
        ...partes.map((x) => ({ forma: 'vale' as const, valorCentavos: x.valorCentavos, valeId: x.valeId, valeCodigo: x.codigo })),
        ...estornos.filter((e) => e.forma !== 'vale' && FORMAS_PAGAMENTO.indexOf(e.forma) > FORMAS_PAGAMENTO.indexOf('vale')),
      ],
      gravar: () =>
        gravarVales(
          vales.map((v) =>
            porVale.has(v.id) ? devolverNoVale(v, porVale.get(v.id)!, { vendaId: venda.id, vendaNumero: venda.numero, dia: hojeNaLoja(), em, por, rotulo }) : v,
          ),
        ),
    };
  };
  /** Dia da última compra (não cancelada) de cada cliente. */
  const ultimasCompras = (vendas: readonly Venda[]) => {
    const m = new Map<string, string>();
    for (const v of vendas) {
      if (v.status === 'cancelada' || !v.cliente) continue;
      const dia = diaNoFuso(v.criadaEm, fuso);
      if ((m.get(v.cliente.id) ?? '') < dia) m.set(v.cliente.id, dia);
    }
    return m;
  };
  const cupomResumido = (k: CupomRetorno | null) => (k ? { id: k.id, pct: k.pct, venceEm: k.venceEm } : null);
  /** Cliente da loja que pode participar das listas e mensagens (não excluído pela LGPD). */
  const exigirClienteDaFidelidade = (id: string) => {
    const c = clientesDaLoja().find((x) => x.id === id);
    if (!c || c.dadosExcluidos || c.nome === NOME_CLIENTE_REMOVIDO) throw new ErroApi(404, 'Cliente não encontrado.');
    return c;
  };
  /**
   * Cashback e cupom quando a venda volta (cancelamento ou devolução), como o DaniPets (DEV-07):
   *   - o cashback USADO que voltou para o cliente vira lote novo, com prazo novo;
   *   - o cashback que a compra GEROU sai (proporcional na devolução; tudo no cancelamento); o que já tinha
   *     sido usado ou vencido fica no histórico como "não recuperado";
   *   - no cancelamento, o cupom usado volta a valer (até a validade dele).
   * Confere antes e devolve a função que grava (e a venda com o cashback retirado).
   */
  const prepararFidelidadeDoEstorno = (venda: Venda, estornos: readonly Pagamento[], quando: { tipo: 'cancelamento' } | { tipo: 'devolucao'; numero: number; antesCentavos: number; agoraCentavos: number }, em: string, por: Operador) => {
    const hoje = hojeNaLoja();
    const devolvido = estornos.filter((e) => e.forma === 'cashback').reduce((t, e) => t + e.valorCentavos, 0);
    const cliente = venda.cliente ? clientesDaLoja().find((c) => c.id === venda.cliente!.id && !c.dadosExcluidos) : undefined;
    if (devolvido > 0 && !cliente) throw new ErroApi(409, 'O cliente desta venda não foi encontrado para devolver o cashback.');
    const rotulo = quando.tipo === 'cancelamento' ? 'Cancelamento' : `Devolução nº ${quando.numero}`;
    const retirar = quando.tipo === 'cancelamento' ? cashbackARetirar(venda) : cashbackARetirar(venda, quando.antesCentavos, quando.agoraCentavos);
    const vendaDepois: Venda = retirar > 0 ? { ...venda, cashbackRetiradoCentavos: (venda.cashbackRetiradoCentavos ?? 0) + retirar } : venda;
    return {
      venda: vendaDepois,
      gravar: () => {
        let lotes = lotesDaLoja();
        if (devolvido > 0 && cliente) {
          const novo = creditarCashback(devolvido, {
            dia: hoje,
            em,
            por,
            novoId,
            clienteId: cliente.id,
            validadeDias: regras().cashback.validadeDias,
            origem: `${rotulo} • venda ${formatarNumeroVenda(venda.numero)}`,
            vendaId: venda.id,
            vendaNumero: venda.numero,
          });
          if (novo) lotes = [...lotes, novo];
        }
        if (retirar > 0 && venda.cliente) {
          const r = retirarCashbackDaVenda(lotes, { id: venda.id, clienteId: venda.cliente.id }, retirar, hoje);
          lotes = r.lotes;
          if (r.tiradoCentavos > 0) {
            juntarUso({ clienteId: venda.cliente.id, tipo: 'retirada', dia: hoje, valorCentavos: r.tiradoCentavos, vendaId: venda.id, vendaNumero: venda.numero, lotes: r.usados, rotulo, criadoEm: em, por });
          }
          if (r.naoRecuperadoCentavos > 0) {
            auditar('cliente.cashback_nao_recuperado', { tipo: 'cliente', id: venda.cliente.id }, { rotulo: quando.tipo, numero: venda.numero, valorCentavos: r.naoRecuperadoCentavos });
          }
        }
        gravarLotes(lotes);
        if (quando.tipo === 'cancelamento') {
          const cupons = cuponsDaLoja();
          if (cupons.some((k) => k.uso?.vendaId === venda.id)) gravarCupons(cupons.map((k) => (k.uso?.vendaId === venda.id ? { ...k, uso: null } : k)));
        }
      },
    };
  };

  /**
   * Desfaz no financeiro o que voltou para o cliente. Confere antes de gravar qualquer coisa
   * (devolução em dinheiro não passa do que há no Caixa) e devolve a função que grava.
   */
  const prepararEstornoFinanceiro = (venda: Venda, estornos: Pagamento[], rotulo: string, em: string, por: Operador) => {
    const todos = recebiveisDaLoja();
    const gaveta = gavetaDeHoje();
    const r = efeitosFinanceirosDoEstorno(
      venda,
      estornos,
      todos.filter((x) => x.vendaId === venda.id),
      // com o caixa de hoje aberto, a devolução em dinheiro não passa do esperado na gaveta (DaniPets DEV-05)
      { rotulo, em, por, saldoCaixaCentavos: saldosDasContas(lancamentosDaLoja()).porConta.caixa, ...(gaveta ? { gavetaCentavos: gaveta.esperadoCentavos } : {}) },
    );
    if (!r.ok) throw new ErroApi(409, r.erros[0]?.mensagem ?? 'Não foi possível estornar no financeiro.', r.erros);
    return () => {
      juntarLancamentos(r.valor.lancamentos);
      const novos = new Map(r.valor.recebiveis.map((x) => [x.id, x]));
      gravarDaLoja(CHAVES.recebiveis, lojaId, todos.map((x) => novos.get(x.id) ?? x));
    };
  };

  const usuarios = criarApiUsuariosDemo({
    lojaId,
    operadorId: operador?.id ?? null,
    agora,
    atrasoMs,
    nomeDoAlvo: (tipo, id) =>
      tipo === 'produto'
        ? (produtosDaLoja().find((p) => p.id === id)?.nome ?? null)
        : tipo === 'cliente'
          ? (clientesDaLoja().find((c) => c.id === id)?.nome ?? null)
          : tipo === 'fornecedor'
            ? (lerDaLoja<Fornecedor>(CHAVES.fornecedores, lojaId).find((f) => f.id === id)?.nome ?? null)
            : null,
  });

  return {
    ...usuarios,

    // ---------------------------------------------------------------- produtos
    async listarProdutos() {
      await preparar();
      const movimentos = movimentosDaLoja();
      const vendas = vendasDaLoja();
      return produtosDaLoja()
        .map((p) => ({ ...p, temHistorico: produtoTemHistorico(p.id, movimentos, vendas) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
    },

    async criarProduto(dados, opcoes = {}) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('produtos.cadastrar');
        const validacao = validarNovoProduto(dados, { completo: true });
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do produto inválidos.', validacao.erros);
        const { estoqueInicial = 0, custoInicialCentavos = null, ...novo } = validacao.valor;
        const unidade = unidadeDe(novo.unidade);
        exigirUnidadeDaLoja(unidade);
        // DaniPets: o custo do estoque inicial é só do Dono e do Administrador
        if (custoInicialCentavos !== null && !pode(quem.papel, 'produtos.alterar')) {
          throw new ErroApi(403, 'Custo do estoque inicial: só o Dono ou o Administrador.', [{ campo: 'custoInicialCentavos', mensagem: 'Só o Dono ou o Administrador.' }]);
        }

        exigirFornecedorAtivo(novo.fornecedorId);
        const daLoja = produtosDaLoja();
        conferirCodigoDeBarras(novo.codigoBarras, daLoja, null);
        const parecido = produtoParecido(novo, daLoja);
        if (parecido && !opcoes.mesmoAssim) {
          throw new ErroApi(409, `Já existe produto com o mesmo nome, marca e peso: "${parecido.nome}" (código ${parecido.codigoInterno}).`, [], 'produto_parecido');
        }

        // Maior código interno da loja + 1, pulando números já usados como código de barras.
        const comCodigo = (codigo: string) => daLoja.find((p) => p.codigoInterno === codigo || p.codigoBarras === codigo) ?? null;
        let numero = daLoja.reduce((maior, p) => Math.max(maior, Number(p.codigoInterno)), 0) + 1;
        let codigoInterno = formatarCodigoInterno(numero);
        while (codigoInterno === novo.codigoBarras || comCodigo(codigoInterno)) {
          numero += 1;
          codigoInterno = formatarCodigoInterno(numero);
        }

        const quando = agora().toISOString();
        const produto: Produto = {
          id: novoId(),
          codigoInterno,
          nome: novo.nome,
          codigoBarras: novo.codigoBarras,
          precoCentavos: novo.precoCentavos,
          marca: novo.marca ?? null,
          pesoGramas: novo.pesoGramas ?? null,
          unidade,
          fornecedorId: novo.fornecedorId ?? null,
          ativo: true,
          criadoEm: quando,
          atualizadoEm: quando,
        };
        gravarDaLoja(CHAVES.produtos, lojaId, [...lerDaLoja<Produto>(CHAVES.produtos, lojaId), produto]);
        if (estoqueInicial > 0) {
          juntarMovimentos([movimentoInicial({ produtoId: produto.id, quantidade: estoqueInicial, custoUnitarioCentavos: custoInicialCentavos }, { em: quando, por: pessoa(quem) })]);
        }
        auditar('produto.criado', { tipo: 'produto', id: produto.id }, { codigoInterno, ...(estoqueInicial > 0 ? { estoqueInicial, unidade } : {}) });
        return produto;
      });
    },

    async alterarProduto(id, mudanca, opcoes = {}) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('produtos.alterar');
        const validacao = validarAlteracaoProduto(mudanca);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do produto inválidos.', validacao.erros);
        const guardados = lerDaLoja<Produto>(CHAVES.produtos, lojaId);
        const i = guardados.findIndex((p) => p.id === id);
        if (i < 0) throw new ErroApi(404, 'Produto não encontrado.');
        const antes = normalizarProduto(guardados[i]!);
        const depois: Produto = { ...antes, ...validacao.valor };
        const campos = (Object.keys(validacao.valor) as (keyof typeof validacao.valor)[]).filter((k) => antes[k] !== depois[k]);
        if (campos.length === 0) return antes;

        const daLoja = guardados.map(normalizarProduto);
        if (campos.includes('fornecedorId')) exigirFornecedorAtivo(depois.fornecedorId);
        if (campos.includes('codigoBarras')) conferirCodigoDeBarras(depois.codigoBarras, daLoja, id);
        if (campos.includes('unidade')) {
          exigirUnidadeDaLoja(unidadeDe(depois.unidade));
          if (produtoTemHistorico(id, movimentosDaLoja(), vendasDaLoja())) {
            throw new ErroApi(
              409,
              `${antes.nome} já tem vendas ou movimentos de estoque: a unidade não pode mudar (o saldo e as vendas estão em ${antes.unidade === 'kg' ? 'kg' : 'unidades'}). Para vender de outro jeito, cadastre um produto novo e inative este.`,
              [{ campo: 'unidade', mensagem: 'Não muda com história.' }],
            );
          }
        }
        const parecido = campos.some((k) => k === 'nome' || k === 'marca' || k === 'pesoGramas') ? produtoParecido(depois, daLoja, id) : null;
        if (parecido && !opcoes.mesmoAssim) {
          throw new ErroApi(409, `Já existe produto com o mesmo nome, marca e peso: "${parecido.nome}" (código ${parecido.codigoInterno}).`, [], 'produto_parecido');
        }
        const salvo: Produto = { ...depois, atualizadoEm: agora().toISOString() };
        guardados[i] = salvo;
        gravarDaLoja(CHAVES.produtos, lojaId, guardados);
        if (campos.includes('precoCentavos')) auditar('produto.preco_alterado', { tipo: 'produto', id }, { de: antes.precoCentavos, para: salvo.precoCentavos });
        const outros = campos.filter((k) => k !== 'precoCentavos');
        if (outros.length > 0) auditar('produto.alterado', { tipo: 'produto', id }, { campos: outros });
        return salvo;
      });
    },

    async definirProdutoAtivo(id, ativo) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('produtos.alterar');
        const guardados = lerDaLoja<Produto>(CHAVES.produtos, lojaId);
        const i = guardados.findIndex((p) => p.id === id);
        if (i < 0) throw new ErroApi(404, 'Produto não encontrado.');
        const antes = normalizarProduto(guardados[i]!);
        if (antes.ativo === (ativo === true)) return antes;
        const salvo: Produto = { ...antes, ativo: ativo === true, atualizadoEm: agora().toISOString() };
        guardados[i] = salvo;
        gravarDaLoja(CHAVES.produtos, lojaId, guardados);
        auditar(salvo.ativo ? 'produto.reativado' : 'produto.inativado', { tipo: 'produto', id });
        return salvo;
      });
    },

    async excluirProduto(id) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('produtos.alterar');
        const p = produtosDaLoja().find((x) => x.id === id);
        if (!p) throw new ErroApi(404, 'Produto não encontrado.');
        if (produtoTemHistorico(id, movimentosDaLoja(), vendasDaLoja())) {
          throw new ErroApi(409, `${p.nome} tem vendas ou movimentos de estoque e não pode ser excluído. Use “Inativar”.`);
        }
        gravarDaLoja(CHAVES.produtos, lojaId, lerDaLoja<Produto>(CHAVES.produtos, lojaId).filter((x) => x.id !== id));
        gravarDaLoja(CHAVES.estoque, lojaId, movimentosDaLoja().filter((m) => m.produtoId !== id)); // o estoque inicial do cadastro
        const { [id]: _minimo, ...outros } = minimosDaLoja();
        gravar(CHAVES.minimos, { ...ler<Record<string, Record<string, number>>>(CHAVES.minimos, {}), [lojaId]: outros });
        auditar('produto.excluido', null, { nome: p.nome, codigo: p.codigoBarras ?? p.codigoInterno });
      });
    },

    // ---------------------------------------------------------------- vendas
    async listarVendas(filtro = {}) {
      await preparar();
      exigirPeriodoPermitido(filtro);
      return vendasNoPeriodo(vendasDaLoja(), filtro, fuso).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm) || b.numero - a.numero);
    },

    async buscarVenda(numero) {
      await preparar();
      exigirOperador();
      const venda = vendasDaLoja().find((v) => v.numero === numero);
      if (!venda) throw new ErroApi(404, 'Venda não encontrada.');
      return venda;
    },

    async criarVenda(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigirOperador();
        // só vende com o caixa de hoje aberto, com o responsável identificado (DaniPets PDV-12)
        const caixa = exigirOk(conferirCaixaParaVender(situacaoCaixa()), 409, 'caixa');

        const validacao = validarNovaVenda(dados);
        if (!validacao.ok) throw new ErroApi(400, 'Dados da venda inválidos.', validacao.erros);

        // cashback e cupom de retorno do cliente identificado (módulo 7): o servidor decide, nunca a tela
        const hoje = hojeNaLoja();
        const lotes = lotesDaLoja();
        const clientePedido = validacao.valor.clienteId ? (clientesDaLoja().find((c) => c.id === validacao.valor.clienteId) ?? null) : null;
        const cupom = clientePedido ? cupomAtivo(cuponsDaLoja(), clientePedido, hoje, regras().retorno) : null;
        const catalogo = new Map<string, ProdutoParaVenda>(produtosDaLoja().map((p) => [p.id, p]));
        const calculo = calcularVenda(validacao.valor, catalogo, {
          operador: quem,
          autorizacoes: autorizacoesDaLoja(),
          agora: agora(),
          estoque: saldosDeEstoque(movimentosDaLoja()),
          clientes: new Map(clientesDaLoja().map((c) => [c.id, c])),
          limiteDescontoPct: regras().venda.descontoSemSenhaPct,
          custos: custosMedios(movimentosDaLoja()),
          cashbackDisponivelCentavos: clientePedido ? saldoCashback(lotes, clientePedido, hoje) : 0,
          cupom: cupom ? { id: cupom.id, clienteId: cupom.clienteId, pct: cupom.pct } : null,
          // o vale-troca vale para quem está com o código, com ou sem cliente (módulo 8)
          vales: new Map(valesDaLoja().map((v) => [v.id, { id: v.id, codigo: v.codigo, saldoCentavos: v.saldoCentavos, aberto: v.situacao === 'aberto' }])),
        });
        if (!calculo.ok) throw new ErroApi(409, calculo.erros[0]?.mensagem ?? 'Não foi possível registrar a venda.', calculo.erros);
        // fiado acima do limite ou com fiado vencido: só com a liberação de um Dono, com motivo (DaniPets PDV-10)
        const noFiado = calculo.valor.pagamentos.filter((p) => p.forma === 'fiado').reduce((t, p) => t + p.valorCentavos, 0);
        let fiadoLiberado: Venda['fiadoLiberado'] = null;
        let liberacaoUsada: string | null = null;
        if (noFiado > 0 && calculo.valor.cliente) {
          const cli = clientesDaLoja().find((c) => c.id === calculo.valor.cliente!.id);
          if (!cli || !cadastroCompleto(cli)) throw new ErroApi(409, 'Fiado só com o cadastro completo do cliente (nome, telefone e CPF).');
          const f = fiadoDoCliente(recebiveisDaLoja(), cli.id, hojeNaLoja());
          const motivos = motivosDoFiado(cli.limiteFiadoCentavos ?? 0, f, noFiado, regras().fiado.vencidoPedeDono);
          if (motivos.length) {
            const lf = validacao.valor.liberacaoFiado;
            const a = lf ? (autorizacoesDaLoja().get(lf.autorizacao) ?? null) : null;
            if (!lf || !liberacaoDoFiadoServe(a, cli.id, noFiado, agora())) {
              throw new ErroApi(409, mensagemFiadoPrecisaDono(cli.nome, motivos), [{ campo: 'liberacaoFiado', mensagem: motivos.join('; ') }], 'fiado_liberacao');
            }
            fiadoLiberado = { por: { id: a.autorizador.id, nome: a.autorizador.nome }, motivo: lf.motivo, motivos };
            liberacaoUsada = a.id;
          }
        }
        calculo.valor.autorizacoesUsadas.forEach((id) => autorizacoes.delete(id)); // uso único
        if (liberacaoUsada) autorizacoes.delete(liberacaoUsada);

        const daLoja = vendasDaLoja();
        const venda: Venda = {
          id: novoId(),
          numero: daLoja.reduce((maior, v) => Math.max(maior, v.numero), 0) + 1,
          criadaEm: agora().toISOString(),
          vendedor: pessoa(quem),
          cliente: calculo.valor.cliente,
          itens: calculo.valor.itens,
          totalCentavos: calculo.valor.totalCentavos,
          descontoCentavos: calculo.valor.descontoCentavos,
          pagamentos: calculo.valor.pagamentos,
          recebidoDinheiroCentavos: calculo.valor.recebidoDinheiroCentavos,
          trocoCentavos: calculo.valor.trocoCentavos,
          status: 'finalizada',
          cancelamento: null,
          devolucoes: [],
          caixaId: caixa.id,
          ...(fiadoLiberado ? { fiadoLiberado } : {}),
        };
        // cashback (módulo 7): o usado sai dos lotes (primeiro o que vence antes); a compra gera o dela
        const cliVenda = calculo.valor.cliente ? (clientesDaLoja().find((c) => c.id === calculo.valor.cliente!.id) ?? null) : null;
        let lotesDepois = lotes;
        let usoCashback: Omit<UsoCashback, 'id'> | null = null;
        const usadoCashback = venda.pagamentos.filter((p) => p.forma === 'cashback').reduce((t, p) => t + p.valorCentavos, 0);
        if (usadoCashback > 0 && cliVenda) {
          const r = exigirOk(consumirCashback(lotes, cliVenda, usadoCashback, hoje));
          lotesDepois = r.lotes;
          usoCashback = { clienteId: cliVenda.id, tipo: 'venda', dia: hoje, valorCentavos: usadoCashback, vendaId: venda.id, vendaNumero: venda.numero, lotes: r.usados, rotulo: null, criadoEm: venda.criadaEm, por: venda.vendedor };
        }
        const ganho = gerarCashback(venda, cliVenda, regras().cashback, { dia: hoje, em: venda.criadaEm, por: venda.vendedor, novoId });
        if (ganho) {
          lotesDepois = [...lotesDepois, ganho];
          venda.cashbackGeradoCentavos = ganho.valorCentavos;
        }
        if (calculo.valor.cupomUsado) venda.cupomId = calculo.valor.cupomUsado;
        // vale-troca: o saldo de cada vale usado diminui (zerado, o vale fica "usado")
        let valesDepois: ValeTroca[] | null = null;
        if (venda.pagamentos.some((p) => p.forma === 'vale')) {
          valesDepois = valesDaLoja();
          for (const p of venda.pagamentos) {
            if (p.forma !== 'vale') continue;
            const j = valesDepois.findIndex((v) => v.id === p.valeId);
            valesDepois[j] = exigirOk(usarVale(valesDepois[j]!, p.valorCentavos, { vendaId: venda.id, vendaNumero: venda.numero, dia: hoje, em: venda.criadaEm, por: venda.vendedor }));
          }
        }
        const financeiro = efeitosFinanceirosDaVenda(venda, { taxas: taxasDaLoja(), fuso, prazoFiadoDias: regras().fiado.prazoDias });
        gravarVendas([...daLoja, venda]);
        if (lotesDepois !== lotes) gravarLotes(lotesDepois);
        if (usoCashback) juntarUso(usoCashback);
        if (valesDepois) gravarVales(valesDepois);
        if (cupom && calculo.valor.cupomUsado === cupom.id) {
          gravarCupons(cuponsDaLoja().map((k) => (k.id === cupom.id ? { ...k, uso: { dia: hoje, vendaId: venda.id, vendaNumero: venda.numero } } : k)));
          auditar('cliente.cupom_usado', { tipo: 'cliente', id: cupom.clienteId }, { pct: cupom.pct, numero: venda.numero });
        }
        juntarMovimentos(movimentosDaVenda(venda));
        juntarLancamentos(financeiro.lancamentos);
        gravarDaLoja(CHAVES.recebiveis, lojaId, [...recebiveisDaLoja(), ...financeiro.recebiveis.map(comId)]);
        if (fiadoLiberado) auditar('venda.fiado_liberado', null, { numero: venda.numero, valorCentavos: noFiado, autorizadoPor: fiadoLiberado.por.id });
        if (venda.descontoCentavos > 0) {
          const comSenha = venda.itens.find((i) => i.desconto?.autorizadoComSenha);
          auditar('venda.desconto', null, {
            numero: venda.numero,
            descontoCentavos: venda.descontoCentavos,
            brinde: venda.itens.some((i) => i.desconto && i.precoCentavos === 0),
            autorizadoPor: comSenha?.desconto?.responsavel.id ?? null,
          });
        }
        return venda;
      });
    },

    async listarAutorizadores() {
      await preparar();
      exigirOperador();
      return autorizadoresDemo(lojaId);
    },

    async autorizar({ usuarioId, senha, acao }) {
      await preparar(atrasoMs * 2);
      return comTrava(async () => {
        exigirOperador();
        // mesma proteção do login (e a mesma contagem): 5 senhas erradas seguidas bloqueiam por 5 minutos
        const g = await conferirAutorizadorDemo(lojaId, usuarioId, senha, agora);
        if (acao.tipo === 'desconto' && acao.precoFinalCentavos === 0 && !pode(g.papel, 'brinde')) {
          throw new ErroApi(403, 'Brinde só com a autorização de um Dono.');
        }
        if (acao.tipo === 'dia_fechado' && !pode(g.papel, 'dia_fechado.liberar')) {
          throw new ErroApi(403, 'Lançamento em dia com o caixa já fechado: só com a liberação de um Dono.');
        }
        if (acao.tipo === 'fiado' && !pode(g.papel, 'fiado.liberar')) throw new ErroApi(403, 'Fiado acima do limite ou vencido: só com a liberação de um Dono.');
        if (acao.tipo === 'excluir_dados_cliente' && !pode(g.papel, 'clientes.excluir_dados')) throw new ErroApi(403, 'Excluir os dados de um cliente: só com a liberação de um Dono.');
        const id = novoId();
        autorizacoes.set(id, { id, autorizador: g, acao: { ...acao } as AcaoAutorizada, criadaEm: agora().toISOString(), lojaId });
        return { autorizacao: id, autorizador: g };
      });
    },

    async cancelarVenda(vendaId, pedido) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigirOperador();
        const validacao = validarPedidoCancelamento(pedido);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Pedido inválido.', validacao.erros);
        const vendas = vendasDaLoja();
        const i = acharVenda(vendas, vendaId);
        const venda = vendas[i]!;
        const a = validacao.valor.autorizacao ? (autorizacoesDaLoja().get(validacao.valor.autorizacao) ?? null) : null;
        const s = situacaoCaixa();
        // cancelar a venda inteira só com o caixa daquela venda aberto (DaniPets canCancelSale)
        const caixaAberto = s.estado === 'aberto' && s.caixa ? { id: s.caixa.id } : null;
        const r = calcularCancelamento(venda, validacao.valor, { operador: quem, autorizacao: a, agora: agora(), fuso, caixaAberto });
        if (!r.ok) throw new ErroApi(409, r.erros[0]?.mensagem ?? 'Não foi possível cancelar.', r.erros);
        const em = agora().toISOString();
        const gravarFinanceiro = prepararEstornoFinanceiro(venda, r.valor.estornos, 'Cancelamento', em, pessoa(quem));
        const fidelidade = prepararFidelidadeDoEstorno(venda, r.valor.estornos, { tipo: 'cancelamento' }, em, pessoa(quem));
        // o que foi pago com vale-troca volta para o mesmo vale (módulo 8)
        const valesDoEstorno = prepararValesDoEstorno(venda, r.valor.estornos, 'Cancelamento', em, pessoa(quem));
        if (r.valor.autorizacaoUsada) autorizacoes.delete(r.valor.autorizacaoUsada);
        const cancelada: Venda = {
          ...fidelidade.venda,
          status: 'cancelada',
          cancelamento: { em, por: pessoa(quem), autorizadoPor: r.valor.autorizadoPor, motivo: validacao.valor.motivo, estornos: valesDoEstorno.estornos },
        };
        vendas[i] = cancelada;
        gravarVendas(vendas);
        juntarMovimentos(movimentosDoCancelamento(cancelada, { motivo: validacao.valor.motivo, em, por: pessoa(quem) }));
        gravarFinanceiro();
        fidelidade.gravar();
        valesDoEstorno.gravar();
        auditar('venda.cancelada', null, { numero: venda.numero, valorCentavos: venda.totalCentavos, autorizadoPor: r.valor.autorizadoPor?.id ?? null });
        return cancelada;
      });
    },

    async devolverItens(vendaId, pedido) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigirOperador();
        const validacao = validarPedidoDevolucao(pedido);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Pedido inválido.', validacao.erros);
        const vendas = vendasDaLoja();
        const i = acharVenda(vendas, vendaId);
        const venda = vendas[i]!;
        const a = validacao.valor.autorizacao ? (autorizacoesDaLoja().get(validacao.valor.autorizacao) ?? null) : null;
        exigirHojeNaoFechado();
        // como vale-troca: o fiado desta venda que o cliente ainda não pagou é abatido antes (DaniPets planRefund)
        const fiadoEmAbertoCentavos = recebiveisDaLoja()
          .filter((x) => x.vendaId === venda.id && x.forma === 'fiado')
          .reduce((t, x) => t + liquidoAReceber(x), 0);
        const r = calcularDevolucao(venda, validacao.valor, { operador: quem, autorizacao: a, agora: agora(), fuso, fiadoEmAbertoCentavos });
        if (!r.ok) throw new ErroApi(409, r.erros[0]?.mensagem ?? 'Não foi possível registrar a devolução.', r.erros);
        // de quem é o vale: o cliente escolhido ou o da venda (sem cliente, o vale vale para quem tiver o código)
        let clienteDoVale: { id: string; nome: string } | null = null;
        if (r.valor.valeCentavos > 0) {
          const id = validacao.valor.clienteDoVale ?? venda.cliente?.id ?? null;
          const c = id ? clientesDaLoja().find((x) => x.id === id && !x.dadosExcluidos && x.nome !== NOME_CLIENTE_REMOVIDO) : undefined;
          if (validacao.valor.clienteDoVale && (!c || !c.ativo)) throw new ErroApi(404, 'Cliente do vale não encontrado. Escolha outro ou deixe o da venda.');
          clienteDoVale = c ? { id: c.id, nome: c.nome } : null;
        }
        // devolver em dinheiro: com o caixa de hoje aberto, e sem passar do que há na gaveta (DaniPets DEV-05)
        if (r.valor.estornos.some((e) => e.forma === 'dinheiro' && e.valorCentavos > 0)) exigirOk(conferirCaixaAberto(situacaoCaixa(), 'Devolução em dinheiro'), 409, 'caixa');
        const numero = vendas.reduce((maior, v) => Math.max(maior, ...v.devolucoes.map((d) => d.numero)), 0) + 1;
        const em = agora().toISOString();
        const gravarFinanceiro = prepararEstornoFinanceiro(venda, r.valor.estornos, `Devolução nº ${numero}`, em, pessoa(quem));
        const antes = venda.devolucoes.reduce((t, d) => t + d.totalCentavos, 0);
        const fidelidade = prepararFidelidadeDoEstorno(venda, r.valor.estornos, { tipo: 'devolucao', numero, antesCentavos: antes, agoraCentavos: r.valor.totalCentavos }, em, pessoa(quem));
        // compra paga com vale-troca: a parte do vale volta para o mesmo vale (módulo 8)
        const valesDoEstorno = prepararValesDoEstorno(venda, r.valor.estornos, `Devolução nº ${numero}`, em, pessoa(quem));
        if (r.valor.autorizacaoUsada) autorizacoes.delete(r.valor.autorizacaoUsada);
        // devolução como vale-troca: o vale novo com o que sobrou depois do fiado em aberto (DaniPets issueVoucher)
        const valeNovo =
          r.valor.valeCentavos > 0
            ? emitirVale(r.valor.valeCentavos, {
                id: novoId(),
                numero: proximoNumeroDoVale(valesDaLoja()),
                sorteio: sortearCodigo(),
                cliente: clienteDoVale,
                origem: { vendaId: venda.id, vendaNumero: venda.numero, devolucaoNumero: numero },
                dia: hojeNaLoja(),
                em,
                por: pessoa(quem),
              })
            : null;
        const devolucao: Devolucao = {
          id: novoId(),
          numero,
          criadaEm: em,
          itens: r.valor.itens,
          totalCentavos: r.valor.totalCentavos,
          estornos: valesDoEstorno.estornos,
          ...(valeNovo ? { vale: { id: valeNovo.id, codigo: valeNovo.codigo, valorCentavos: valeNovo.valorCentavos } } : {}),
          motivo: validacao.valor.motivo,
          feitaPor: pessoa(quem),
          autorizadaPor: r.valor.autorizadoPor,
        };
        vendas[i] = { ...fidelidade.venda, devolucoes: [...venda.devolucoes, devolucao] };
        gravarVendas(vendas);
        juntarMovimentos(movimentosDaDevolucao(venda, devolucao));
        gravarFinanceiro();
        fidelidade.gravar();
        valesDoEstorno.gravar();
        if (valeNovo) gravarVales([...valesDaLoja(), valeNovo]);
        auditar('venda.devolucao', null, { numero: venda.numero, devolucao: numero, valorCentavos: devolucao.totalCentavos, autorizadoPor: r.valor.autorizadoPor?.id ?? null });
        if (valeNovo) auditar('vale.emitido', valeNovo.cliente ? { tipo: 'cliente', id: valeNovo.cliente.id } : null, { codigo: valeNovo.codigo, valorCentavos: valeNovo.valorCentavos, numero: venda.numero });
        return { venda: vendas[i]!, devolucao, vale: valeNovo };
      });
    },

    async listarDevolucoes(filtro = {}) {
      await preparar();
      exigirPeriodoPermitido(filtro);
      return vendasNoPeriodo(devolucoesComVenda(vendasDaLoja()), filtro, fuso).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
    },

    // ---------------------------------------------------------------- estoque
    async listarEstoque() {
      await preparar();
      const quem = exigirOperador();
      const movimentos = movimentosDaLoja();
      const saldos = saldosDeEstoque(movimentos);
      const minimos = minimosDaLoja();
      // custo é só do Dono e do Administrador (DaniPets: o Vendedor não vê custo)
      const custos = pode(quem.papel, 'compras') ? custosMedios(movimentos) : null;
      return produtosDaLoja().map((p) => {
        const saldo = saldos.get(p.id) ?? 0;
        const minimo = minimos[p.id] ?? null;
        const custo = custos?.get(p.id);
        return {
          produtoId: p.id,
          saldo,
          minimo,
          situacao: situacaoEstoque(saldo, minimo),
          ...(custos ? { custoMedioCentavos: custo == null ? null : Math.round(custo) } : {}),
        };
      });
    },

    async listarMovimentosEstoque(filtro = {}) {
      await preparar();
      exigirOperador();
      return maisNovosPrimeiro(movimentosDaLoja().filter((m) => (!filtro.produtoId || m.produtoId === filtro.produtoId) && diaNoPeriodo(m.dia ?? diaNoFuso(m.criadoEm, fuso), filtro)));
    },

    async lancarMovimentoEstoque(dados, opcoes = {}) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('estoque.lancar');
        const hoje = hojeNaLoja();
        const validacao = validarMovimentoManual(dados, { hoje });
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Movimento inválido.', validacao.erros);
        const p = exigirProduto(validacao.valor.produtoId);
        // data de um dia com o caixa já fechado: só com a liberação de um Dono (DaniPets assertRetro)
        const tipoMov = validacao.valor.tipo;
        const lib = exigirLiberacao(validacao.valor.dia ?? hoje, `${tipoMov === 'ajuste' ? 'ajuste' : 'entrada'} de estoque de ${p.nome}`, tipoMov, opcoes.liberacao);
        const unidade = unidadeDe(p.unidade);
        if (validacao.valor.tipo === 'ajuste' && !regras().estoque.motivosAjuste.includes(validacao.valor.motivo)) {
          throw new ErroApi(400, `Escolha o motivo do ajuste: ${regras().estoque.motivosAjuste.join(', ')}.`, [{ campo: 'motivo', mensagem: 'Motivo fora da lista da loja.' }]);
        }
        const antes = saldoDoProduto(p.id).saldo;
        if (antes + validacao.valor.quantidade < 0) {
          throw new ErroApi(409, `O ajuste deixaria o saldo de ${p.nome} negativo (saldo atual ${formatarQuantidade(antes, unidade)}).`, [{ campo: 'quantidade', mensagem: 'Saldo negativo.' }]);
        }
        juntarMovimentos([{ ...movimentoManual(validacao.valor, { em: agora().toISOString(), por: pessoa(quem), hoje }), ...(lib.liberacao ? { liberacao: lib.liberacao } : {}) }]);
        auditar(validacao.valor.tipo === 'entrada' ? 'estoque.entrada' : 'estoque.ajuste', { tipo: 'produto', id: p.id }, {
          quantidade: validacao.valor.quantidade,
          unidade,
          motivo: validacao.valor.motivo,
          ...(validacao.valor.observacao ? { observacao: validacao.valor.observacao } : {}),
          ...(validacao.valor.dia && validacao.valor.dia !== hoje ? { dia: validacao.valor.dia } : {}),
        });
        lib.confirmar();
        return saldoDoProduto(p.id);
      });
    },

    async definirEstoqueMinimo(produtoId, minimo) {
      await preparar();
      return gravarOperacao(() => {
        exigir('estoque.lancar');
        const p = exigirProduto(produtoId);
        const validacao = validarEstoqueMinimo(minimo);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]!.mensagem, validacao.erros);
        const { [p.id]: _antigo, ...outros } = minimosDaLoja();
        const novos = validacao.valor === null ? outros : { ...outros, [p.id]: validacao.valor };
        gravar(CHAVES.minimos, { ...ler<Record<string, Record<string, number>>>(CHAVES.minimos, {}), [lojaId]: novos });
        auditar('estoque.minimo', { tipo: 'produto', id: p.id }, { minimo: validacao.valor, unidade: unidadeDe(p.unidade) });
        return saldoDoProduto(p.id);
      });
    },

    // ---------------------------------------------------------------- clientes
    async buscarClientesParaVenda(termo) {
      await preparar();
      exigirOperador();
      if (!String(termo ?? '').trim()) return [];
      const recebiveis = recebiveisDaLoja();
      const hoje = hojeNaLoja();
      const lotes = lotesDaLoja();
      const cupons = cuponsDaLoja();
      const vales = valesDaLoja();
      const r = regras();
      return buscarClientes(clientesDaLoja(), termo, LIMITES_CLIENTE.resultadosBusca).map((c) => {
        const f = fiadoDoCliente(recebiveis, c.id, hoje);
        return {
          id: c.id,
          nome: c.nome,
          cpfMascarado: mascararCpf(c.cpf),
          telefone: c.telefone,
          fiadoEmAbertoCentavos: f.devendoCentavos,
          limiteFiadoCentavos: c.limiteFiadoCentavos ?? 0,
          fiadoVencidoCentavos: f.vencidoCentavos,
          diasVencido: f.diasVencido,
          // fidelidade (módulo 7): a faixa do cliente mostra o cashback e o cupom (DaniPets PDV-11)
          cashbackCentavos: saldoCashback(lotes, c, hoje),
          cashbackVencimento: proximoVencimento(lotes, c, hoje),
          cupom: cupomResumido(cupomAtivo(cupons, c, hoje, r.retorno)),
          completo: cadastroCompleto(c),
          // vale-troca do cliente (módulo 8): a faixa mostra "Vale R$ X"
          valeCentavos: valesDoCliente(vales, c.id).saldoCentavos,
        };
      });
    },

    async listarClientes(termo = '') {
      await preparar();
      exigirOperador();
      return buscarClientes(clientesDaLoja(), termo);
    },

    async cadastrarCliente(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigirOperador();
        const validacao = validarNovoCliente(dados, { hoje: hojeNaLoja() });
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do cliente inválidos.', validacao.erros);
        const v = validacao.valor;
        // o limite de fiado é do Dono e do Administrador (DaniPets customerLimit)
        if ((v.limiteFiadoCentavos ?? 0) > 0) exigir('clientes.limite');
        const daLoja = clientesDaLoja();
        const unico = conferirCpfUnico(v.cpf, daLoja);
        if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
        const quando = agora().toISOString();
        const { autorizaMensagens, ...resto } = v;
        const cliente: Cliente = {
          id: novoId(),
          ...resto,
          whatsapp: v.whatsapp ?? temWhatsapp({ telefone: v.telefone }),
          limiteFiadoCentavos: v.limiteFiadoCentavos ?? 0,
          autorizaMensagens: autorizaMensagens ? { em: quando, por: pessoa(quem) } : null,
          naoIncomodar: v.naoIncomodar ?? false,
          ativo: true,
          criadoEm: quando,
          atualizadoEm: quando,
        };
        gravarDaLoja(CHAVES.clientes, lojaId, [...daLoja, cliente]);
        auditar('cliente.cadastrado', { tipo: 'cliente', id: cliente.id });
        if (cliente.autorizaMensagens) auditar('cliente.mensagens', { tipo: 'cliente', id: cliente.id }, { autorizou: true });
        if ((cliente.limiteFiadoCentavos ?? 0) > 0) auditar('cliente.limite', { tipo: 'cliente', id: cliente.id }, { de: 0, para: cliente.limiteFiadoCentavos });
        return cliente;
      });
    },

    async atualizarCliente(id, dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigirOperador();
        const daLoja = clientesDaLoja();
        const i = daLoja.findIndex((c) => c.id === id);
        if (i < 0) throw new ErroApi(404, 'Cliente não encontrado.');
        const antes = daLoja[i]!;
        // a tela não tem o CPF inteiro (LGPD): sem CPF no pedido, fica o do cadastro
        const pedido = dados && typeof dados === 'object' && !String((dados as { cpf?: unknown }).cpf ?? '').trim() ? { ...dados, cpf: antes.cpf } : dados;
        const validacao = validarNovoCliente(pedido, { hoje: hojeNaLoja() });
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do cliente inválidos.', validacao.erros);
        const v = validacao.valor;
        const unico = conferirCpfUnico(v.cpf, daLoja, id);
        if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
        const limiteAntes = antes.limiteFiadoCentavos ?? 0;
        const limite = v.limiteFiadoCentavos ?? limiteAntes;
        if (limite !== limiteAntes) exigir('clientes.limite');
        const quando = agora().toISOString();
        const { autorizaMensagens, ...resto } = v;
        const atualizado: Cliente = {
          ...antes,
          ...resto,
          limiteFiadoCentavos: limite,
          autorizaMensagens: autorizaMensagens === undefined ? (antes.autorizaMensagens ?? null) : autorizaMensagens ? (antes.autorizaMensagens ?? { em: quando, por: pessoa(quem) }) : null,
          atualizadoEm: quando,
        };
        const simples = ['nome', 'telefone', 'cpf', 'extra', 'nascimento', 'endereco', 'observacoes', 'whatsapp'] as const;
        const campos = simples.filter((k) => k in resto && (antes[k] ?? null) !== (atualizado[k] ?? null));
        const mudouMensagens = Boolean(antes.autorizaMensagens) !== Boolean(atualizado.autorizaMensagens);
        const mudouNaoIncomodar = Boolean(antes.naoIncomodar) !== Boolean(atualizado.naoIncomodar);
        if (!campos.length && limite === limiteAntes && !mudouMensagens && !mudouNaoIncomodar) return antes;
        daLoja[i] = atualizado;
        gravarDaLoja(CHAVES.clientes, lojaId, daLoja);
        const alvo = { tipo: 'cliente', id };
        if (campos.length) auditar('cliente.alterado', alvo, { campos });
        if (limite !== limiteAntes) auditar('cliente.limite', alvo, { de: limiteAntes, para: limite });
        if (mudouMensagens) auditar('cliente.mensagens', alvo, { autorizou: Boolean(atualizado.autorizaMensagens) });
        if (mudouNaoIncomodar) auditar('cliente.nao_incomodar', alvo, { ativo: Boolean(atualizado.naoIncomodar) });
        return atualizado;
      });
    },

    async definirClienteAtivo(id, ativo) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('clientes.desativar');
        const daLoja = clientesDaLoja();
        const i = daLoja.findIndex((c) => c.id === id);
        if (i < 0) throw new ErroApi(404, 'Cliente não encontrado.');
        if (ativo) {
          const unico = conferirCpfUnico(daLoja[i]!.cpf, daLoja, id);
          if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
        }
        if (daLoja[i]!.ativo === (ativo === true)) return daLoja[i]!;
        const atualizado: Cliente = { ...daLoja[i]!, ativo: ativo === true, atualizadoEm: agora().toISOString() };
        daLoja[i] = atualizado;
        gravarDaLoja(CHAVES.clientes, lojaId, daLoja);
        auditar(atualizado.ativo ? 'cliente.reativado' : 'cliente.desativado', { tipo: 'cliente', id });
        return atualizado;
      });
    },

    async historicoDoCliente(id) {
      await preparar();
      exigirOperador();
      const cliente = clientesDaLoja().find((c) => c.id === id);
      if (!cliente) throw new ErroApi(404, 'Cliente não encontrado.');
      const vendas = vendasDaLoja()
        .filter((v) => v.cliente?.id === id)
        .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
      return { cliente, resumo: resumirCliente(vendas, id), vendas, fiadoEmAbertoCentavos: fiadoEmAberto(recebiveisDaLoja(), id) };
    },

    async listarContasDeClientes(pedido = {}) {
      await preparar();
      const quem = exigirOperador();
      const veFiado = pode(quem.papel, 'clientes.fiado');
      const filtro = pedido.filtro ?? 'todos';
      if ((filtro === 'fiado' || filtro === 'vencido' || filtro === 'desativados') && !pode(quem.papel, filtro === 'desativados' ? 'clientes.desativar' : 'clientes.fiado')) {
        throw new ErroApi(403, mensagemSemPermissao(filtro === 'desativados' ? 'clientes.desativar' : 'clientes.fiado'));
      }
      const termo = semAcento(String(pedido.termo ?? '').trim().slice(0, LIMITES_CLIENTE.buscaMax));
      const digitos = termo.replace(/\D/g, '');
      const hoje = hojeNaLoja();
      const recebiveis = recebiveisDaLoja();
      const vendas = vendasDaLoja();
      const lotes = lotesDaLoja();
      const vales = valesDaLoja();
      const ultimas = ultimasCompras(vendas);
      const diasRetorno = regras().retorno.diasSemComprar;
      const linhas = clientesDaLoja()
        .filter((c) => !c.dadosExcluidos && c.nome !== NOME_CLIENTE_REMOVIDO && (filtro === 'desativados' ? !c.ativo : c.ativo))
        .filter(
          (c) =>
            !termo ||
            semAcento(c.nome).includes(termo) ||
            semAcento(c.extra ?? '').includes(termo) ||
            (digitos.length >= 3 && (c.cpf.includes(digitos) || c.telefone.includes(digitos))),
        )
        .map((c) => {
          const f = fiadoDoCliente(recebiveis, c.id, hoje);
          const r = resumirCliente(vendas, c.id);
          return {
            c,
            f,
            linha: {
              id: c.id,
              nome: c.nome,
              extra: c.extra ?? null,
              telefone: c.telefone,
              whatsapp: temWhatsapp(c),
              aceitaMensagens: Boolean(c.autorizaMensagens),
              cpfMascarado: mascararCpf(c.cpf),
              ativo: c.ativo,
              naoIncomodar: Boolean(c.naoIncomodar),
              completo: cadastroCompleto(c),
              compras: r.compras,
              ultimaCompraEm: r.ultimaCompraEm,
              cashbackCentavos: saldoCashback(lotes, c, hoje),
              valeCentavos: valesDoCliente(vales, c.id).saldoCentavos,
              fiado: veFiado ? { devendoCentavos: f.devendoCentavos, vencidoCentavos: f.vencidoCentavos, diasVencido: f.diasVencido, limiteCentavos: c.limiteFiadoCentavos ?? 0 } : null,
            },
          };
        })
        .filter(({ c, f, linha }) => {
          if (filtro === 'fiado') return f.devendoCentavos > 0;
          if (filtro === 'vencido') return f.vencidoCentavos > 0;
          if (filtro === 'incompleto') return !cadastroCompleto(c);
          if (filtro === 'nao_incomodar') return Boolean(c.naoIncomodar);
          // fidelidade (módulo 7): com cashback para usar; sem comprar há "dias sem comprar" ou mais
          if (filtro === 'cashback') return linha.cashbackCentavos > 0;
          if (filtro === 'vale') return linha.valeCentavos > 0;
          if (filtro === 'sumidos') {
            const u = ultimas.get(c.id);
            return u !== undefined && Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${u}T12:00:00Z`)) / 86_400_000) >= diasRetorno;
          }
          return true;
        })
        .map((x) => x.linha)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return { clientes: linhas.slice(0, LIMITES_CLIENTE.listaMax), total: linhas.length };
    },

    async contaDoCliente(id) {
      await preparar();
      exigirOperador();
      const c = clientesDaLoja().find((x) => x.id === id);
      if (!c || c.dadosExcluidos) throw new ErroApi(404, 'Cliente não encontrado.');
      const vendas = vendasDaLoja();
      const recebiveis = recebiveisDaLoja();
      const hoje = hojeNaLoja();
      const f = fiadoDoCliente(recebiveis, id, hoje);
      const lotes = lotesDaLoja();
      const r = regras();
      const ultima = ultimasCompras(vendas).get(id);
      const { cpf, ...semCpf } = c;
      return {
        cliente: { ...semCpf, cpfMascarado: mascararCpf(cpf) },
        resumo: resumirCliente(vendas, id),
        // compras, fiado, cashback, cupons e lembretes (módulo 7), do mais novo para o mais antigo
        extrato: extratoCompletoDoCliente(id, vendas, recebiveis, fuso, { lotes, usos: usosDaLoja(), cupons: cuponsDaLoja(), contatos: contatosDaLoja(), vales: valesDaLoja() }, hoje),
        fidelidade: {
          saldoCentavos: saldoCashback(lotes, c, hoje),
          vencendoCentavos: cashbackVencendo(lotes, c, hoje, r.cashback.avisoDias),
          proximoVencimento: proximoVencimento(lotes, c, hoje),
          vencidoCentavos: cashbackVencido(lotes, id, hoje),
          cupom: cupomResumido(cupomAtivo(cuponsDaLoja(), c, hoje, r.retorno)),
          sumido: ultima !== undefined && Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${ultima}T12:00:00Z`)) / 86_400_000) >= r.retorno.diasSemComprar,
        },
        fiado: {
          devendoCentavos: f.devendoCentavos,
          vencidoCentavos: f.vencidoCentavos,
          diasVencido: f.diasVencido,
          abertos: f.abertos.map((r) => ({ vendaNumero: r.vendaNumero, criadoEm: r.criadoEm, venceEm: r.venceEm, abertoCentavos: r.brutoCentavos - r.estornadoBrutoCentavos })),
        },
        limiteFiadoCentavos: c.limiteFiadoCentavos ?? 0,
        temHistorico: clienteTemHistorico(id, vendas, recebiveis, valesDaLoja()),
        // vale-troca do cliente (módulo 8): o saldo e os códigos dos vales com saldo
        vale: (() => {
          const v = valesDoCliente(valesDaLoja(), id);
          return { saldoCentavos: v.saldoCentavos, abertos: v.abertos.map((x) => ({ codigo: x.codigo, saldoCentavos: x.saldoCentavos })) };
        })(),
      };
    },

    async verCpfDoCliente(id) {
      await preparar();
      return gravarOperacao(() => {
        exigir('clientes.cpf');
        const c = clientesDaLoja().find((x) => x.id === id);
        if (!c || c.dadosExcluidos) throw new ErroApi(404, 'Cliente não encontrado.');
        auditar('cliente.cpf_visto', { tipo: 'cliente', id });
        return { cpf: c.cpf };
      });
    },

    async excluirCliente(id, motivo) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('clientes');
        const texto = typeof motivo === 'string' ? motivo.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
        if (!texto) throw new ErroApi(400, 'Informe o motivo da exclusão.', [{ campo: 'motivo', mensagem: 'Informe o motivo.' }]);
        if (texto.length > LIMITES_CLIENTE.motivoMax) throw new ErroApi(400, `O motivo pode ter até ${LIMITES_CLIENTE.motivoMax} caracteres.`);
        const daLoja = clientesDaLoja();
        const c = daLoja.find((x) => x.id === id);
        if (!c) throw new ErroApi(404, 'Cliente não encontrado.');
        if (clienteTemHistorico(id, vendasDaLoja(), recebiveisDaLoja(), valesDaLoja())) {
          throw new ErroApi(409, 'Cliente com compras, fiado ou vale-troca não pode ser excluído. Um Dono pode excluir os dados (LGPD) na conta do cliente.');
        }
        gravarDaLoja(CHAVES.clientes, lojaId, daLoja.filter((x) => x.id !== id));
        auditar('cliente.excluido', { tipo: 'cliente', id });
        // feito pelo Vendedor: o Dono e o Administrador ficam sabendo (DaniPets avisosClientes)
        if (!pode(quem.papel, 'clientes.desativar')) {
          const aviso = { id: novoId(), clienteNome: c.nome, telefone: c.telefone, motivo: texto, por: pessoa(quem), em: agora().toISOString(), ciente: null };
          gravarDaLoja(CHAVES.avisosClientes, lojaId, [...lerDaLoja<AvisoDeCliente>(CHAVES.avisosClientes, lojaId), aviso]);
        }
      });
    },

    async listarAvisosDeClientes() {
      await preparar();
      exigir('clientes.desativar');
      return maisNovosPrimeiro(lerDaLoja<AvisoDeCliente>(CHAVES.avisosClientes, lojaId).map((a) => ({ ...a, criadoEm: a.em }))).map(({ criadoEm: _c, ...a }) => a);
    },

    async conferirAvisoDeCliente(id) {
      await preparar();
      return gravarOperacao(() => {
        const quem = exigir('clientes.desativar');
        const avisos = lerDaLoja<AvisoDeCliente>(CHAVES.avisosClientes, lojaId);
        const i = avisos.findIndex((a) => a.id === id);
        if (i < 0) throw new ErroApi(404, 'Aviso não encontrado.');
        if (avisos[i]!.ciente) throw new ErroApi(409, 'Este aviso já foi conferido.');
        avisos[i] = { ...avisos[i]!, ciente: { por: pessoa(quem), em: agora().toISOString() } };
        gravarDaLoja(CHAVES.avisosClientes, lojaId, avisos);
        auditar('cliente.aviso_conferido');
        return avisos[i]!;
      });
    },

    async receberFiadoDoCliente(id, dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('vender');
        exigirHojeNaoFechado();
        const c = clientesDaLoja().find((x) => x.id === id);
        if (!c || c.dadosExcluidos) throw new ErroApi(404, 'Cliente não encontrado.');
        // dinheiro entra na gaveta: só com o caixa de hoje aberto (DaniPets: "Para receber em dinheiro, abra o caixa de hoje")
        if (dados?.forma === 'dinheiro') exigirOk(conferirCaixaAberto(situacaoCaixa(), 'Receber em dinheiro'), 409, 'caixa');
        const hoje = hojeNaLoja();
        const todos = recebiveisDaLoja();
        const f = fiadoDoCliente(todos, id, hoje);
        const r = receberFiado(f, dados?.valorCentavos, dados?.forma, { cliente: { id: c.id, nome: c.nome }, em: agora().toISOString(), hoje, por: pessoa(quem), novoId, taxas: taxasDaLoja() });
        if (!r.ok) throw new ErroApi(r.erros[0]!.campo === '_' ? 409 : 400, r.erros[0]!.mensagem, r.erros);
        const novos = new Map(r.valor.atualizados.map((x) => [x.id, x]));
        const cartao = r.valor.cartao ? [comId(r.valor.cartao)] : [];
        gravarDaLoja(CHAVES.recebiveis, lojaId, [...todos.map((x) => novos.get(x.id) ?? x), ...r.valor.partesPagas, ...cartao]);
        if (r.valor.lancamento) juntarLancamentos([r.valor.lancamento]);
        auditar('cliente.fiado_recebido', { tipo: 'cliente', id }, { valorCentavos: dados.valorCentavos, forma: dados.forma });
        return { abatidas: r.valor.abatidas, ficaDevendoCentavos: f.devendoCentavos - (dados.valorCentavos as number) };
      });
    },

    async listarFiado() {
      await preparar();
      exigir('clientes.fiado');
      const hoje = hojeNaLoja();
      const recebiveis = recebiveisDaLoja();
      const clientes = clientesDaLoja().filter((c) => !c.dadosExcluidos);
      const linhas = clientes
        .map((c) => ({ c, f: fiadoDoCliente(recebiveis, c.id, hoje) }))
        .filter(({ f }) => f.devendoCentavos > 0)
        .sort((a, b) => b.f.diasVencido - a.f.diasVencido || b.f.devendoCentavos - a.f.devendoCentavos)
        .map(({ c, f }) => ({
          clienteId: c.id,
          nome: c.nome,
          telefone: c.telefone,
          whatsapp: temWhatsapp(c),
          ativo: c.ativo,
          devendoCentavos: f.devendoCentavos,
          vencidoCentavos: f.vencidoCentavos,
          diasVencido: f.diasVencido,
          limiteCentavos: c.limiteFiadoCentavos ?? 0,
          maisAntiga: { vendaNumero: f.abertos[0]!.vendaNumero, venceEm: f.abertos[0]!.venceEm },
        }));
      return { linhas, limitesCentavos: clientes.filter((c) => c.ativo).reduce((s, c) => s + (c.limiteFiadoCentavos ?? 0), 0) };
    },

    async excluirDadosDoCliente(id, opcoes = {}) {
      await preparar();
      return gravarOperacao(() => {
        const quem = exigirOperador();
        const daLoja = clientesDaLoja();
        const cliente = daLoja.find((c) => c.id === id) ?? null;
        const recebiveis = recebiveisDaLoja();
        const permitido = conferirExclusaoDeCliente(quem.papel, cliente, fiadoEmAberto(recebiveis, id));
        if (!permitido.ok) throw new ErroApi(cliente ? 403 : 404, permitido.erros[0]!.mensagem, permitido.erros);
        // a exclusão precisa da liberação de um Dono, com motivo (DaniPets cliAnonimizar)
        const lib = exigirOk(validarLiberacao(opcoes.liberacao), 400);
        const a = lib ? (autorizacoesDaLoja().get(lib.autorizacao) ?? null) : null;
        if (!lib || !autorizacaoServe(a, 'clientes.excluir_dados', (x) => x.tipo === 'excluir_dados_cliente' && x.clienteId === id, agora())) {
          throw new ErroApi(403, 'A exclusão precisa da liberação de um Dono.', [{ campo: 'liberacao', mensagem: 'Falta a liberação de um Dono.' }], 'precisa_liberacao');
        }
        const anonimo = anonimizarCliente(cliente!, agora(), { por: { id: a.autorizador.id, nome: a.autorizador.nome }, motivo: lib.motivo });
        autorizacoes.delete(a.id);
        gravarDaLoja(CHAVES.clientes, lojaId, daLoja.map((c) => (c.id === id ? anonimo : c)));
        // o cliente perde o cashback que sobrou (DaniPets cliAnonimizar); fica registrado como "retirado"
        const zerado = zerarCashbackDoCliente(lotesDaLoja(), id);
        if (zerado.valorCentavos > 0) {
          gravarLotes(zerado.lotes);
          juntarUso({ clienteId: id, tipo: 'retirada', dia: hojeNaLoja(), valorCentavos: zerado.valorCentavos, vendaId: null, vendaNumero: null, lotes: zerado.usados, rotulo: 'Exclusão dos dados', criadoEm: agora().toISOString(), por: pessoa(quem) });
        }
        // o nome sai também das vendas, dos recebimentos de fiado, dos vales-troca (que continuam valendo para quem
        // tem o código) e da descrição dos lançamentos
        gravarVendas(tirarNomeDoCliente(vendasDaLoja(), id));
        gravarVales(tirarNomeDoCliente(valesDaLoja(), id));
        const doCliente = new Set(recebiveis.filter((r) => r.cliente?.id === id).map((r) => r.id));
        gravarDaLoja(CHAVES.recebiveis, lojaId, tirarNomeDoCliente(recebiveis, id));
        gravarDaLoja(
          CHAVES.lancamentos,
          lojaId,
          lancamentosDaLoja().map((l) =>
            (l.recebivelId && doCliente.has(l.recebivelId)) || (l.tipo === 'recebimento_fiado' && l.descricao.includes(` • ${cliente!.nome} • `))
              ? { ...l, descricao: l.descricao.split(` • ${cliente!.nome}`).join(` • ${NOME_CLIENTE_REMOVIDO}`) }
              : l,
          ),
        );
        auditar('cliente.dados_excluidos', { tipo: 'cliente', id }, { autorizadoPor: a.autorizador.id });
        return anonimo;
      });
    },

    // ---------------------------------------------------------------- vale-troca (módulo 8)
    async listarVales(filtro = {}) {
      await preparar();
      exigirOperador();
      const vales = valesDaLoja();
      // todos: do mais novo para o mais antigo; em aberto (padrão): só os com saldo
      return filtro.situacao === 'todos' ? [...vales].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) : valesEmAberto(vales);
    },

    async buscarValePorCodigo(codigo) {
      await preparar();
      exigirOperador();
      const c = normalizarCodigoVale(String(codigo ?? ''));
      const v = c ? valesDaLoja().find((x) => x.codigo === c) : undefined;
      if (!v) throw new ErroApi(404, 'Vale não encontrado. Confira o código.');
      return v;
    },

    // ---------------------------------------------------------------- fidelidade (módulo 7)
    async listarRetorno() {
      await preparar();
      exigirOperador();
      const hoje = hojeNaLoja();
      const r = regras();
      const vendas = vendasDaLoja();
      const lotes = lotesDaLoja();
      const contatos = contatosDaLoja();
      const clientes = clientesDaLoja().filter((c) => c.ativo && !c.dadosExcluidos && c.nome !== NOME_CLIENTE_REMOVIDO);
      const porId = new Map(clientesDaLoja().map((c) => [c.id, c]));
      const analise = analisarRetorno({ clientes, ultimaCompra: ultimasCompras(vendas), lotes, contatos, cupons: cuponsDaLoja(), regras: r, hoje });
      const base = (id: string) => {
        const c = porId.get(id)!;
        return { clienteId: id, nome: c.nome, telefone: c.telefone, bloqueio: motivoSemMensagem(c, 'retorno') };
      };
      /** O que levou na última compra (DaniPets: "Última compra em 10/10: Ração, Areia"). */
      const itensDaUltima = (id: string) => {
        const u = vendas.filter((v) => v.cliente?.id === id && v.status !== 'cancelada').sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))[0];
        return u ? u.itens.map((i) => i.nome).join(', ') : '';
      };
      const compras = vendas.filter((v) => v.cliente && v.status !== 'cancelada').map((v) => ({ clienteId: v.cliente!.id, dia: diaNoFuso(v.criadaEm, fuso), vendaNumero: v.numero }));
      const resultado = resultadoDosLembretes(contatos, compras, hoje);
      return {
        hoje,
        regras: { cashback: r.cashback, retorno: r.retorno },
        retorno: analise.retorno.map((x) => ({ ...base(x.clienteId), diasSemComprar: x.diasSemComprar, ultimaCompraDia: x.ultimaCompraDia, ultimaCompraItens: itensDaUltima(x.clienteId), cashbackCentavos: saldoCashback(lotes, porId.get(x.clienteId), hoje) })),
        cashback: analise.cashback.map((x) => ({ ...base(x.clienteId), bloqueio: motivoSemMensagem(porId.get(x.clienteId)!, 'cashback'), venceEm: x.venceEm, valorCentavos: x.valorCentavos })),
        fora: analise.fora.map((x) => ({ clienteId: x.clienteId, nome: porId.get(x.clienteId)?.nome ?? NOME_CLIENTE_REMOVIDO, motivo: x.motivo })),
        resultado: {
          linhas: resultado.linhas.slice(0, 100).map((l) => ({
            contatoId: l.contato.id,
            dia: l.contato.dia,
            clienteNome: porId.get(l.contato.clienteId)?.nome ?? NOME_CLIENTE_REMOVIDO,
            canal: l.contato.canal,
            situacao: l.situacao,
            voltou: l.voltou,
          })),
          enviados: resultado.enviados,
          voltaram: resultado.voltaram,
          taxaPct: resultado.taxaPct,
        },
      };
    },

    async resumoDoCashback() {
      await preparar();
      exigirOperador();
      const hoje = hojeNaLoja();
      const r = regras();
      const lotes = lotesDaLoja();
      const usos = usosDaLoja();
      const clientes = clientesDaLoja().filter((c) => c.ativo && !c.dadosExcluidos);
      const porId = new Map(clientesDaLoja().map((c) => [c.id, c]));
      const soma = (xs: readonly { valorCentavos: number }[]) => xs.reduce((t, x) => t + x.valorCentavos, 0);
      const linhas = clientes
        .map((c) => {
          const dele = lotes.filter((l) => l.clienteId === c.id);
          const usosDele = usos.filter((u) => u.clienteId === c.id);
          return {
            clienteId: c.id,
            nome: c.nome,
            gerado: soma(dele.filter((l) => l.tipo === 'compra')),
            devolvido: soma(dele.filter((l) => l.tipo === 'estorno')),
            usado: soma(usosDele.filter((u) => u.tipo === 'venda')),
            retirado: soma(usosDele.filter((u) => u.tipo === 'retirada')),
            vencido: cashbackVencido(lotes, c.id, hoje),
            aberto: saldoCashback(lotes, c, hoje),
            proximo: proximoVencimento(lotes, c, hoje),
          };
        })
        .filter((x) => x.gerado > 0 || x.devolvido > 0)
        .sort((a, b) => b.aberto - a.aberto || a.nome.localeCompare(b.nome, 'pt-BR'));
      const total = (k: 'gerado' | 'devolvido' | 'usado' | 'retirado' | 'vencido' | 'aberto') => linhas.reduce((t, x) => t + x[k], 0);
      const limite = somarDias(hoje, r.cashback.avisoDias);
      const vencendo = clientes.flatMap((c) =>
        lotesValidos(lotes, c.id, hoje)
          .filter((l) => l.venceEm <= limite)
          .map((l) => ({ clienteId: c.id, nome: c.nome, dia: l.dia, origem: l.origem, valorCentavos: l.restanteCentavos, venceEm: l.venceEm })),
      );
      return {
        hoje,
        regras: r.cashback,
        abertoCentavos: total('aberto'),
        clientesComSaldo: linhas.filter((x) => x.aberto > 0).length,
        vencendoCentavos: vencendo.reduce((t, x) => t + x.valorCentavos, 0),
        geradoCentavos: total('gerado'),
        devolvidoCentavos: total('devolvido'),
        usadoCentavos: total('usado'),
        retiradoCentavos: total('retirado'),
        vencidoCentavos: total('vencido'),
        linhas: linhas.map((x) => ({
          clienteId: x.clienteId,
          nome: porId.get(x.clienteId)?.nome ?? x.nome,
          geradoCentavos: x.gerado + x.devolvido,
          usadoCentavos: x.usado + x.retirado,
          vencidoCentavos: x.vencido,
          abertoCentavos: x.aberto,
          proximoVencimento: x.proximo,
        })),
        vencendo: vencendo.sort((a, b) => a.venceEm.localeCompare(b.venceEm) || a.nome.localeCompare(b.nome, 'pt-BR')),
      };
    },

    async mensagemParaCliente(clienteId, tipo) {
      await preparar();
      const quem = exigirOperador();
      if (!(TIPOS_CONTATO as readonly string[]).includes(tipo)) throw new ErroApi(400, 'Escolha o tipo de lembrete.');
      // o lembrete de pagamento é sobre o fiado: só quem vê o fiado de todos (DaniPets: aba Fiado)
      if (tipo === 'cobranca' && !pode(quem.papel, 'clientes.fiado')) throw new ErroApi(403, mensagemSemPermissao('clientes.fiado'));
      const c = exigirClienteDaFidelidade(clienteId);
      const hoje = hojeNaLoja();
      const r = regras();
      const f = fiadoDoCliente(recebiveisDaLoja(), c.id, hoje);
      const existente = tipo === 'retorno' ? cupomAtivo(cuponsDaLoja(), c, hoje, r.retorno) : null;
      const cupom = tipo === 'retorno' && cadastroCompleto(c) && r.retorno.cupomPct > 0 ? (existente ? { pct: existente.pct, venceEm: existente.venceEm } : { pct: r.retorno.cupomPct, venceEm: somarDias(hoje, r.retorno.cupomValidadeDias) }) : null;
      const texto = mensagemDoCliente(tipo, {
        nomeLoja: config().dados.nome,
        cliente: c,
        hoje,
        regras: r,
        ultimaCompraDia: ultimasCompras(vendasDaLoja()).get(c.id) ?? null,
        proximoVencimento: proximoVencimento(lotesDaLoja(), c, hoje),
        devendoCentavos: f.devendoCentavos,
        vencimentoFiado: f.abertos[0]?.venceEm ?? null,
        cupom,
      });
      return { tipo, clienteId: c.id, nome: c.nome, telefone: c.telefone, texto, cupom, bloqueio: motivoSemMensagem(c, tipo) };
    },

    async registrarContato(clienteId, dados) {
      await preparar();
      return gravarOperacao(() => {
        const quem = exigirOperador();
        const tipo = dados?.tipo as TipoContato;
        const canal = dados?.canal as CanalContato;
        if (!(TIPOS_CONTATO as readonly string[]).includes(tipo) || (canal !== 'whatsapp' && canal !== 'outro')) throw new ErroApi(400, 'Lembrete inválido.');
        if (tipo === 'cobranca' && !pode(quem.papel, 'clientes.fiado')) throw new ErroApi(403, mensagemSemPermissao('clientes.fiado'));
        const c = exigirClienteDaFidelidade(clienteId);
        // pelo WhatsApp, só para quem tem WhatsApp e autorizou (o lembrete de pagamento só pede o WhatsApp)
        const bloqueio = canal === 'whatsapp' ? motivoSemMensagem(c, tipo) : null;
        if (bloqueio) throw new ErroApi(409, bloqueio);
        const r = registrarContato(c, tipo, canal, { dia: hojeNaLoja(), em: agora().toISOString(), por: pessoa(quem), novoId, cupons: cuponsDaLoja(), regras: regras().retorno });
        gravarDaLoja(CHAVES.contatos, lojaId, [...contatosDaLoja(), r.contato]);
        if (r.cupom && r.cupomNovo) gravarCupons([...cuponsDaLoja(), r.cupom]);
        auditar(ACAO_DO_CONTATO[tipo], { tipo: 'cliente', id: c.id }, { canal, ...(r.cupom ? { cupomPct: r.cupom.pct, cupomVenceEm: r.cupom.venceEm } : {}) });
        return { contato: r.contato, cupom: r.cupom };
      });
    },

    async adiarLembrete(clienteId) {
      await preparar();
      return gravarOperacao(() => {
        exigirOperador();
        const c = exigirClienteDaFidelidade(clienteId);
        const ate = somarDias(hojeNaLoja(), DIAS_ADIAR_LEMBRETE);
        gravarDaLoja(CHAVES.clientes, lojaId, clientesDaLoja().map((x) => (x.id === c.id ? { ...x, lembreteAdiadoAte: ate, atualizadoEm: agora().toISOString() } : x)));
        auditar('cliente.lembrete_adiado', { tipo: 'cliente', id: c.id }, { ate });
        return { ate };
      });
    },

    async marcarNaoIncomodar(clienteId) {
      await preparar();
      return gravarOperacao(() => {
        exigirOperador();
        const c = exigirClienteDaFidelidade(clienteId);
        if (c.naoIncomodar) return;
        gravarDaLoja(CHAVES.clientes, lojaId, clientesDaLoja().map((x) => (x.id === c.id ? { ...x, naoIncomodar: true, atualizadoEm: agora().toISOString() } : x)));
        auditar('cliente.nao_incomodar', { tipo: 'cliente', id: c.id }, { ativo: true });
      });
    },

    // ---------------------------------------------------------------- financeiro
    async resumoFinanceiro() {
      await preparar();
      exigir('financeiro');
      const saldos = saldosDasContas(lancamentosDaLoja());
      return {
        contas: CONTAS.map((id) => ({ id, nome: NOME_CONTA[id], saldoCentavos: saldos.porConta[id] })),
        totalCentavos: saldos.totalCentavos,
        aReceber: resumirAReceber(recebiveisDeCartao(recebiveisDaLoja()), diaNoFuso(agora(), fuso)),
        // fiado vencido = passou do prazo (no dia do vencimento ainda não está atrasado)
        fiado: resumirAReceber(recebiveisDeFiado(recebiveisDaLoja()), somarDias(diaNoFuso(agora(), fuso), -1)),
      };
    },

    async listarLancamentos(filtro = {}) {
      await preparar();
      exigir('financeiro');
      return maisNovosPrimeiro(lancamentosDaLoja().filter((l) => (!filtro.conta || l.conta === filtro.conta) && diaNoPeriodo(diaDoLancamento(l, fuso), filtro)));
    },

    async listarRecebiveis(filtro = {}) {
      await preparar();
      exigir('financeiro');
      return recebiveisDaLoja()
        .filter((r) => !filtro.situacao || r.situacao === filtro.situacao)
        .sort((a, b) => a.venceEm.localeCompare(b.venceEm) || a.criadoEm.localeCompare(b.criadoEm));
    },

    async receberRecebivel(id, conta) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('financeiro');
        exigirHojeNaoFechado();
        // dinheiro entrando na gaveta: com o caixa de hoje aberto (senão não entra na conta da gaveta)
        if (conta === 'caixa') exigirOk(conferirCaixaAberto(situacaoCaixa(), 'Receber em dinheiro'), 409, 'caixa');
        const todos = recebiveisDaLoja();
        const atual = todos.find((r) => r.id === id);
        if (!atual) throw new ErroApi(404, 'Recebimento não encontrado.');
        const r = receberRecebivel(atual, { conta, em: agora().toISOString(), por: pessoa(quem) });
        if (!r.ok) throw new ErroApi(409, r.erros[0]!.mensagem, r.erros);
        gravarDaLoja(CHAVES.recebiveis, lojaId, todos.map((x) => (x.id === id ? r.valor.recebivel : x)));
        juntarLancamentos([r.valor.lancamento]);
        auditar('financeiro.recebimento', null, { valorCentavos: r.valor.lancamento.valorCentavos, conta: r.valor.lancamento.conta });
        return r.valor.recebivel;
      });
    },

    async lancarNoFinanceiro(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('financeiro');
        const validacao = validarLancamentoManual(dados);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Lançamento inválido.', validacao.erros);
        exigirHojeNaoFechado();
        const novos = lancamentosManuais(validacao.valor, { em: agora().toISOString(), por: pessoa(quem) });
        const saida = conferirSaida(novos, saldosDasContas(lancamentosDaLoja()), gavetaDeHoje());
        if (!saida.ok) throw new ErroApi(409, saida.erros[0]!.mensagem, saida.erros);
        const v = validacao.valor;
        auditar(
          `financeiro.${v.tipo}` as AcaoAuditoria,
          null,
          v.tipo === 'transferencia' ? { valorCentavos: v.valorCentavos, de: v.conta, para: v.contaDestino } : { valorCentavos: v.valorCentavos, conta: v.conta, categoria: v.categoria },
        );
        return juntarLancamentos(novos);
      });
    },

    async definirSaldoInicial(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('financeiro');
        exigirHojeNaoFechado();
        const validacao = validarSaldoInicial(dados, lancamentosDaLoja());
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]!.mensagem, validacao.erros);
        const [lancamento] = juntarLancamentos([
          {
            conta: validacao.valor.conta,
            tipo: 'saldo_inicial',
            valorCentavos: validacao.valor.valorCentavos,
            descricao: 'Saldo inicial (implantação)',
            criadoEm: agora().toISOString(),
            vendaId: null,
            vendaNumero: null,
            recebivelId: null,
            categoria: null,
            por: pessoa(quem),
          },
        ]);
        auditar('financeiro.saldo_inicial', null, { valorCentavos: validacao.valor.valorCentavos, conta: validacao.valor.conta });
        return lancamento!;
      });
    },

    async lerTaxasCartao() {
      await preparar();
      exigir('financeiro');
      return taxasDaLoja();
    },

    async salvarTaxasCartao(taxas) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('financeiro');
        const validacao = validarTaxasCartao(taxas);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]!.mensagem, validacao.erros);
        gravar(CHAVES.taxas, { ...ler<Record<string, TaxasCartao>>(CHAVES.taxas, {}), [lojaId]: validacao.valor });
        auditar('financeiro.taxas');
        return validacao.valor;
      });
    },

    // ---------------------------------------------------------------- caixa do dia (módulo 5)
    async lerCaixa() {
      await preparar();
      const quem = exigir('caixa');
      if (temCaixaPassadoAberto()) await gravarOperacao(() => undefined); // fecha sozinho o que passou da meia-noite
      const caixas = caixasDaLoja();
      const hoje = hojeNaLoja();
      const s = situacaoDoCaixa(caixas, hoje);
      const lancamentos = lancamentosDaLoja();
      const primeiro = caixas.filter((c) => !c.fechamento).sort((a, b) => a.dia.localeCompare(b.dia))[0] ?? null;
      const movimentos =
        s.estado === 'aberto' && s.caixa
          ? movimentosDaGaveta(s.caixa, lancamentos, fuso)
          : lancamentos.filter((l) => l.conta === 'caixa' && diaDoLancamento(l, fuso) === hoje);
      return {
        hoje,
        estado: s.estado,
        caixa: s.caixa,
        atrasado: s.atrasado,
        aFechar: primeiro ? { caixa: primeiro, gaveta: gavetaDoCaixa(primeiro, lancamentos, fuso) } : null,
        vendasDeHoje: vendasDoDia(hoje),
        movimentos: [...movimentos].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
        historico: [...caixas].sort((a, b) => b.dia.localeCompare(a.dia)),
        // o saldo das contas é do Financeiro (Dono e Administrador)
        saldoCaixaFisicoCentavos: pode(quem.papel, 'financeiro') ? saldosDasContas(lancamentos).porConta.caixa : null,
        toleranciaCentavos: regras().caixa.toleranciaCentavos,
        ultimoDiaFechado: s.ultimoDiaFechado,
      };
    },

    async lerSituacaoDoCaixa() {
      await preparar();
      const quem = exigirOperador();
      if (temCaixaPassadoAberto()) await gravarOperacao(() => undefined);
      const s = situacaoCaixa();
      return {
        hoje: s.hoje,
        estado: s.estado,
        abertoEm: s.caixa?.abertura.em ?? null,
        fechadoEm: s.caixa?.fechamento?.em ?? null,
        responsavel: s.caixa?.abertura.por.nome ?? null,
        atrasado: s.atrasado?.dia ?? null,
        // a pendência "Deseja verificar?" é de quem confere o caixa (Dono e Administrador)
        aVerificar: pode(quem.papel, 'caixa.desfazer')
          ? fechamentosAVerificar(caixasDaLoja()).map((c) => ({ caixaId: c.id, dia: c.dia, esperadoCentavos: c.fechamento!.esperadoCentavos }))
          : null,
      };
    },

    async abrirCaixa(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('caixa');
        const caixas = caixasDaLoja();
        const hoje = hojeNaLoja();
        const v = validarAbertura(dados, { hoje, caixas });
        if (!v.ok) throw new ErroApi(v.erros[0]?.campo === '_' ? 409 : 400, v.erros[0]!.mensagem, v.erros);
        const caixa = abrirCaixa(v.valor, { id: novoId(), hoje, em: agora().toISOString(), por: pessoa(quem) });
        gravarCaixas([...caixas, caixa]);
        auditar('caixa.aberto', null, { dia: hoje, fundoCentavos: caixa.abertura.fundoCentavos });
        return caixa;
      });
    },

    async operarCaixa(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('caixa');
        const s = situacaoCaixa();
        exigirHojeNaoFechado();
        if (s.estado !== 'aberto' || !s.caixa) throw new ErroApi(409, 'Abra o caixa de hoje primeiro.', [], 'caixa');
        const op = exigirOk(validarOperacaoCaixa(dados), 400);
        // retirada do dono: o Vendedor precisa da senha do Dono ou do Administrador (DaniPets V9.3.3)
        let autorizadoPor: Operador | null = null;
        let usada: string | null = null;
        if (op.tipo === 'retirada' && !pode(quem.papel, 'caixa.retirada')) {
          const a = op.autorizacao ? (autorizacoesDaLoja().get(op.autorizacao) ?? null) : null;
          if (!autorizacaoServe(a, 'caixa.retirada', (x) => x.tipo === 'retirada' && x.valorCentavos === op.valorCentavos, agora())) {
            throw new ErroApi(403, 'Retirada do dono: precisa da senha do Dono ou do Administrador.', [], 'precisa_autorizacao');
          }
          autorizadoPor = { id: a.autorizador.id, nome: a.autorizador.nome };
          usada = a.id;
        }
        const novos = lancamentosDaOperacao(op, { caixa: s.caixa, em: agora().toISOString(), por: pessoa(quem), autorizadoPor });
        // ninguém tira da gaveta mais do que o esperado nela (DaniPets CX-07)
        exigirOk(conferirSaida(novos, saldosDasContas(lancamentosDaLoja()), gavetaDeHoje()));
        const gravados = juntarLancamentos(novos);
        if (usada) autorizacoes.delete(usada);
        if (op.tipo === 'sangria') auditar('caixa.sangria', null, { valorCentavos: op.valorCentavos });
        else if (op.tipo === 'retirada') auditar('caixa.retirada', null, { valorCentavos: op.valorCentavos, autorizadoPor: autorizadoPor?.id ?? null });
        else auditar('caixa.suprimento', null, { valorCentavos: op.valorCentavos });
        return gravados;
      });
    },

    async fecharCaixa(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('caixa');
        const pedido = exigirOk(validarPedidoFechamento(dados), 400);
        const caixas = caixasDaLoja();
        const lancamentos = lancamentosDaLoja();
        const tolerancia = regras().caixa.toleranciaCentavos;
        const c = conferirFechamento(pedido, {
          caixas,
          hoje: hojeNaLoja(),
          lancamentos,
          fuso,
          toleranciaCentavos: tolerancia,
          podeQualquerDiferenca: pode(quem.papel, 'caixa.diferenca'),
        });
        if (!c.ok) throw new ErroApi(c.erros[0]?.campo === 'justificativa' ? 400 : 409, c.erros[0]!.mensagem, c.erros);
        // diferença acima da tolerância: o Vendedor precisa da senha do Dono ou do Administrador (DaniPets CX-04)
        let autorizadoPor: Operador | null = null;
        let usada: string | null = null;
        if (c.valor.precisaAutorizacao) {
          const a = pedido.autorizacao ? (autorizacoesDaLoja().get(pedido.autorizacao) ?? null) : null;
          const serve = autorizacaoServe(a, 'caixa.diferenca', (x) => x.tipo === 'fechamento' && x.dia === pedido.dia && x.contadoCentavos === pedido.contadoCentavos, agora());
          if (!serve) {
            throw new ErroApi(403, `Diferença acima de ${formatarCentavos(tolerancia)}: o fechamento precisa da autorização do Dono ou do Administrador.`, [], 'precisa_autorizacao');
          }
          autorizadoPor = { id: a.autorizador.id, nome: a.autorizador.nome };
          usada = a.id;
        }
        const r = fecharCaixa(c.valor, { em: agora().toISOString(), por: pessoa(quem), autorizadoPor, vendas: vendasDaLoja(), lancamentos, fuso });
        gravarCaixas(caixas.map((x) => (x.id === r.caixa.id ? r.caixa : x)));
        if (r.ajuste) juntarLancamentos([r.ajuste]);
        if (usada) autorizacoes.delete(usada);
        const f = r.caixa.fechamento!;
        auditar('caixa.fechado', null, {
          dia: r.caixa.dia,
          esperadoCentavos: f.esperadoCentavos,
          contadoCentavos: f.contadoCentavos,
          diferencaCentavos: f.diferencaCentavos,
          autorizadoPor: autorizadoPor?.id ?? null,
        });
        return r.caixa;
      });
    },

    async verificarFechamentoAutomatico(caixaId, dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('caixa.desfazer');
        const pedido = exigirOk(validarPedidoVerificacao(dados), 400);
        const caixas = caixasDaLoja();
        const c = conferirVerificacao(caixas, caixaId);
        if (!c.ok) throw new ErroApi(c.erros[0]!.mensagem === 'Caixa não encontrado.' ? 404 : 409, c.erros[0]!.mensagem, c.erros);
        const caixa = verificarFechamento(c.valor, { em: agora().toISOString(), por: pessoa(quem), observacao: pedido.observacao });
        gravarCaixas(caixas.map((x) => (x.id === caixa.id ? caixa : x)));
        auditar('caixa.fechamento_verificado', null, { dia: caixa.dia, esperadoCentavos: caixa.fechamento!.esperadoCentavos, comObservacao: pedido.observacao !== null });
        return caixa;
      });
    },

    async desfazerFechamento(caixaId, dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('caixa.desfazer');
        const pedido = exigirOk(validarPedidoDesfazer(dados), 400);
        const caixas = caixasDaLoja();
        const c = conferirDesfazer(caixas, caixaId, pedido);
        if (!c.ok) throw new ErroApi(c.erros[0]!.mensagem === 'Caixa não encontrado.' ? 404 : c.erros[0]!.campo === 'explicacao' ? 400 : 409, c.erros[0]!.mensagem, c.erros);
        const automatico = c.valor.fechamento!.automatico;
        const r = desfazerFechamento(c.valor, { em: agora().toISOString(), por: pessoa(quem), motivo: pedido.motivo, explicacao: pedido.explicacao });
        gravarCaixas(caixas.map((x) => (x.id === r.caixa.id ? r.caixa : x)));
        if (r.estorno) juntarLancamentos([r.estorno]);
        auditar('caixa.fechamento_desfeito', null, { dia: r.caixa.dia, automatico });
        return r.caixa;
      });
    },

    // ---------------------------------------------------------------- compras e contas a pagar (módulo 4)
    async listarCompras(filtro = {}) {
      await preparar();
      exigir('compras');
      return comprasDaLoja()
        .filter((c) => (!filtro.de || c.data >= filtro.de) && (!filtro.ate || c.data <= filtro.ate))
        .sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero);
    },

    async registrarCompra(dados, opcoes = {}) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('compras');
        const v = validarNovaCompra(dados, { hoje: diaNoFuso(agora(), fuso) });
        if (!v.ok) throw new ErroApi(400, v.erros[0]?.mensagem ?? 'Compra inválida.', v.erros);
        const pedido = v.valor;
        let fornecedor: Compra['fornecedor'] = null;
        if (pedido.fornecedorId) {
          const f = fornecedoresDaLoja().find((x) => x.id === pedido.fornecedorId && x.ativo);
          if (!f) throw new ErroApi(400, 'Fornecedor não encontrado ou desativado. Escolha outro na lista.', [{ campo: 'fornecedorId', mensagem: 'Fornecedor inválido.' }]);
          fornecedor = { id: f.id, nome: f.nome };
        }
        const produtos = produtosDaLoja();
        const montados = montarItensDaCompra(pedido.itens, new Map(produtos.map((p) => [p.id, p])));
        if (!montados.ok) throw new ErroApi(400, montados.erros[0]?.mensagem ?? 'Itens inválidos.', montados.erros);
        // data de um dia com o caixa já fechado: só com a liberação de um Dono; à vista hoje: o caixa de hoje não pode estar fechado
        const hoje = hojeNaLoja();
        const n = montados.valor.itens.length;
        const lib = exigirLiberacao(pedido.data, n === 1 ? `compra de ${montados.valor.itens[0]!.nome}` : `compra de ${n} itens`, 'compra', opcoes.liberacao);
        if (pedido.pagamento.tipo === 'avista' && pedido.data === hoje) exigirHojeNaoFechado();
        const daLoja = comprasDaLoja();
        const repetida = notaRepetida(daLoja, fornecedor?.id ?? null, pedido.notaFiscal ?? null);
        if (repetida && !opcoes.mesmoAssim) {
          throw new ErroApi(409, `Já existe a NF ${pedido.notaFiscal}${fornecedor ? ` de ${fornecedor.nome}` : ''} (compra nº ${repetida.numero}).`, [], 'nf_repetida');
        }
        const compra: Compra = {
          id: novoId(),
          numero: daLoja.reduce((m, c) => Math.max(m, c.numero), 0) + 1,
          data: pedido.data,
          criadaEm: agora().toISOString(),
          fornecedor,
          notaFiscal: pedido.notaFiscal ?? null,
          itens: montados.valor.itens,
          totalCentavos: montados.valor.totalCentavos,
          pagamento: pedido.pagamento,
          por: pessoa(quem),
          ...(lib.liberacao ? { liberacao: lib.liberacao } : {}),
        };
        const efeitos = efeitosDaCompra(compra);
        if (efeitos.lancamentos.length) {
          // à vista hoje pelo Caixa físico, com o caixa aberto: não passa do esperado na gaveta
          const saida = conferirSaida(efeitos.lancamentos, saldosDasContas(lancamentosDaLoja()), pedido.data === hoje ? gavetaDeHoje() : null);
          if (!saida.ok) throw new ErroApi(409, saida.erros[0]!.mensagem, saida.erros);
          juntarLancamentos(efeitos.lancamentos);
        }
        if (efeitos.contaPagar) gravarDaLoja(CHAVES.contasPagar, lojaId, [...contasPagarDaLoja(), { id: novoId(), ...efeitos.contaPagar }]);
        juntarMovimentos(efeitos.movimentos);
        gravarDaLoja(CHAVES.compras, lojaId, [...daLoja, compra]);
        // o custo mudou e a pessoa escolheu mudar o preço de venda junto (DaniPets CMP-04)
        const precos = Object.entries(pedido.precos ?? {});
        if (precos.length) {
          exigir('produtos.alterar');
          const guardados = lerDaLoja<Produto>(CHAVES.produtos, lojaId);
          for (const [pid, novo] of precos) {
            const i = guardados.findIndex((p) => p.id === pid);
            if (i < 0 || guardados[i]!.precoCentavos === novo) continue;
            const de = guardados[i]!.precoCentavos;
            guardados[i] = { ...guardados[i]!, precoCentavos: novo, atualizadoEm: compra.criadaEm };
            auditar('produto.preco_alterado', { tipo: 'produto', id: pid }, { de, para: novo, compra: compra.numero });
          }
          gravarDaLoja(CHAVES.produtos, lojaId, guardados);
        }
        auditar('compra.registrada', null, {
          numero: compra.numero,
          notaFiscal: compra.notaFiscal,
          totalCentavos: compra.totalCentavos,
          pagamento: compra.pagamento.tipo,
          ...(compra.data !== hoje ? { dia: compra.data } : {}),
        });
        lib.confirmar();
        return compra;
      });
    },

    async estornarItemDaCompra(compraId, linha, motivo) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('compras');
        const daLoja = comprasDaLoja();
        const i = daLoja.findIndex((c) => c.id === compraId);
        if (i < 0) throw new ErroApi(404, 'Compra não encontrada.');
        const compra = daLoja[i]!;
        const item = compra.itens[linha];
        const contas = contasPagarDaLoja();
        const cp = contas.find((x) => x.compraId === compra.id) ?? null;
        const r = calcularEstornoDoItem(compra, linha, {
          motivo,
          em: agora().toISOString(),
          por: pessoa(quem),
          saldoEstoque: item ? saldoDoProduto(item.produtoId).saldo : 0,
          contaPagar: cp,
        });
        if (!r.ok) throw new ErroApi(409, r.erros[0]!.mensagem, r.erros);
        // o dinheiro volta hoje para a conta: o caixa de hoje não pode estar fechado (DaniPets assertOpen)
        if (r.valor.lancamento) exigirHojeNaoFechado();
        const atualizada: Compra = { ...compra, itens: compra.itens.map((x, j) => (j === linha ? r.valor.item : x)) };
        daLoja[i] = atualizada;
        gravarDaLoja(CHAVES.compras, lojaId, daLoja);
        juntarMovimentos([r.valor.movimento]);
        if (r.valor.lancamento) juntarLancamentos([r.valor.lancamento]);
        if (r.valor.contaPagar && cp) gravarDaLoja(CHAVES.contasPagar, lojaId, contas.map((x) => (x.id === cp.id ? r.valor.contaPagar! : x)));
        auditar('compra.estornada', { tipo: 'produto', id: r.valor.item.produtoId }, { numero: compra.numero, valorCentavos: r.valor.item.totalCentavos });
        return atualizada;
      });
    },

    async listarContasAPagar(filtro = {}) {
      await preparar();
      exigir('financeiro');
      return contasPagarDaLoja()
        .filter((c) => !filtro.situacao || c.situacao === filtro.situacao)
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.criadoEm.localeCompare(b.criadoEm));
    },

    async pagarContaAPagar(id, conta) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('financeiro');
        exigirHojeNaoFechado();
        const contas = contasPagarDaLoja();
        const cp = contas.find((x) => x.id === id);
        if (!cp) throw new ErroApi(404, 'Conta a pagar não encontrada.');
        const r = pagarConta(cp, {
          conta,
          em: agora().toISOString(),
          por: pessoa(quem),
          saldoCaixaCentavos: saldosDasContas(lancamentosDaLoja()).porConta.caixa,
          gavetaCentavos: gavetaDeHoje()?.esperadoCentavos ?? null,
        });
        if (!r.ok) throw new ErroApi(409, r.erros[0]!.mensagem, r.erros);
        gravarDaLoja(CHAVES.contasPagar, lojaId, contas.map((x) => (x.id === id ? r.valor.contaPagar : x)));
        juntarLancamentos([r.valor.lancamento]);
        auditar('conta_pagar.paga', null, { valorCentavos: cp.valorCentavos, conta: r.valor.lancamento.conta });
        return r.valor.contaPagar;
      });
    },

    async listarLotesVencendo() {
      await preparar();
      exigir('compras');
      const hoje = diaNoFuso(agora(), fuso);
      return lotesVencendo(comprasDaLoja(), saldosDeEstoque(movimentosDaLoja()), hoje, somarDias(hoje, DIAS_AVISO_VALIDADE));
    },

    async darBaixaNoLote(compraId, linha, dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('compras');
        const daLoja = comprasDaLoja();
        const i = daLoja.findIndex((c) => c.id === compraId);
        if (i < 0) throw new ErroApi(404, 'Compra não encontrada.');
        const compra = daLoja[i]!;
        const item = compra.itens[linha];
        const r = calcularBaixaDoLote(compra, linha, {
          quantidade: dados?.quantidade,
          observacao: dados?.observacao,
          em: agora().toISOString(),
          por: pessoa(quem),
          saldoEstoque: item ? saldoDoProduto(item.produtoId).saldo : 0,
        });
        if (!r.ok) throw new ErroApi(409, r.erros[0]!.mensagem, r.erros);
        const atualizada: Compra = { ...compra, itens: compra.itens.map((x, j) => (j === linha ? r.valor.item : x)) };
        daLoja[i] = atualizada;
        gravarDaLoja(CHAVES.compras, lojaId, daLoja);
        if (r.valor.movimento) juntarMovimentos([r.valor.movimento]);
        auditar('compra.lote_baixado', { tipo: 'produto', id: r.valor.item.produtoId }, { quantidade: r.valor.item.loteBaixado!.quantidade, unidade: r.valor.item.unidade });
        return atualizada;
      });
    },

    // ---------------------------------------------------------------- fornecedores (módulo 3)
    async listarFornecedores() {
      await preparar();
      exigir('compras');
      return [...fornecedoresDaLoja()].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
    },

    async cadastrarFornecedor(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('compras');
        const v = validarFornecedor(dados);
        if (!v.ok) throw new ErroApi(400, v.erros[0]?.mensagem ?? 'Dados do fornecedor inválidos.', v.erros);
        const daLoja = fornecedoresDaLoja();
        const unico = conferirDocumentoUnico(v.valor.documento, daLoja);
        if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
        const quando = agora().toISOString();
        const f: Fornecedor = { id: novoId(), ...v.valor, ativo: true, criadoEm: quando, atualizadoEm: quando };
        gravarDaLoja(CHAVES.fornecedores, lojaId, [...daLoja, f]);
        auditar('fornecedor.cadastrado', { tipo: 'fornecedor', id: f.id });
        return f;
      });
    },

    async alterarFornecedor(id, dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('compras');
        const v = validarFornecedor(dados);
        if (!v.ok) throw new ErroApi(400, v.erros[0]?.mensagem ?? 'Dados do fornecedor inválidos.', v.erros);
        const daLoja = fornecedoresDaLoja();
        const i = daLoja.findIndex((f) => f.id === id);
        if (i < 0) throw new ErroApi(404, 'Fornecedor não encontrado.');
        const unico = conferirDocumentoUnico(v.valor.documento, daLoja, id);
        if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
        const antes = daLoja[i]!;
        const campos = (Object.keys(v.valor) as (keyof typeof v.valor)[]).filter((k) => antes[k] !== v.valor[k]);
        if (campos.length === 0) return antes;
        const salvo: Fornecedor = { ...antes, ...v.valor, atualizadoEm: agora().toISOString() };
        daLoja[i] = salvo;
        gravarDaLoja(CHAVES.fornecedores, lojaId, daLoja);
        auditar('fornecedor.alterado', { tipo: 'fornecedor', id }, { campos });
        return salvo;
      });
    },

    async definirFornecedorAtivo(id, ativo) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('compras');
        const daLoja = fornecedoresDaLoja();
        const i = daLoja.findIndex((f) => f.id === id);
        if (i < 0) throw new ErroApi(404, 'Fornecedor não encontrado.');
        if (daLoja[i]!.ativo === (ativo === true)) return daLoja[i]!;
        const salvo: Fornecedor = { ...daLoja[i]!, ativo: ativo === true, atualizadoEm: agora().toISOString() };
        daLoja[i] = salvo;
        gravarDaLoja(CHAVES.fornecedores, lojaId, daLoja);
        auditar(salvo.ativo ? 'fornecedor.reativado' : 'fornecedor.desativado', { tipo: 'fornecedor', id });
        return salvo;
      });
    },

    // ---------------------------------------------------------------- dados e regras da loja
    async lerConfiguracao() {
      await preparar();
      exigirOperador();
      return config();
    },

    async salvarDadosDaLoja(mudanca) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('loja.configurar');
        const atual = config();
        const r = aplicarMudancaNosDados(atual.dados, mudanca);
        if (!r.ok) throw new ErroApi(400, r.erros[0]?.mensagem ?? 'Dados da loja inválidos.', r.erros);
        if (r.valor.campos.length > 0) {
          gravarConfiguracao(lojaId, { ...atual, dados: r.valor.dados });
          auditar('loja.dados_alterados', null, { campos: r.valor.campos });
        }
        return r.valor.dados;
      });
    },

    async salvarRegrasDaLoja(mudanca) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigir('loja.configurar');
        const atual = config();
        const r = aplicarMudancaNasRegras(atual.regras, mudanca);
        if (!r.ok) throw new ErroApi(400, r.erros[0]?.mensagem ?? 'Regras inválidas.', r.erros);
        if (r.valor.secoes.length > 0) {
          gravarConfiguracao(lojaId, { ...atual, regras: r.valor.regras });
          auditar('loja.regras_alteradas', null, { secoes: r.valor.secoes });
        }
        return r.valor.regras;
      });
    },
  };
}
