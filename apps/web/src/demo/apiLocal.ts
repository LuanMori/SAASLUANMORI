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
  type AcaoAuditoria,
  type AcaoAutorizada,
  anonimizarCliente,
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
const CLIENTES_EXEMPLO: NovoCliente[] = [
  { nome: 'Maria Oliveira', telefone: '41999990001', cpf: '00000000191' },
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

function criarExemplos(lojaId: string, agora: Date, fuso: string): void {
  const feitos = ler<string[]>(CHAVES.exemplos, []);
  if (feitos.includes(lojaId)) return;

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
}

const IMPLANTACAO: Operador = { id: 'implantacao', nome: 'Implantação do sistema' };

/**
 * Uma vez por loja: monta o estoque e o financeiro a partir das vendas que já existem (exemplos ou
 * vendas feitas em versões anteriores da demonstração). O estoque inicial de cada produto é lançado
 * de forma que, depois das vendas, sobre a quantidade do exemplo (nunca fica negativo).
 */
function prepararEcossistema(lojaId: string, opcoes: { fuso: string; exemplos: boolean }): void {
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
          if (exemplos) criarExemplos(lojaId, agora(), fuso);
          prepararEcossistema(lojaId, { fuso, exemplos });
        }),
      );
    }
  };
  /** Toda operação que grava: trava entre abas + tudo ou nada. */
  const gravarOperacao = <T,>(fn: () => T): Promise<T> => gravando(fn);
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
  const noPeriodo = (iso: string, filtro: FiltroVendas) => {
    const dia = diaNoFuso(iso, fuso);
    return (!filtro.de || dia >= filtro.de) && (!filtro.ate || dia <= filtro.ate);
  };
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

  /**
   * Desfaz no financeiro o que voltou para o cliente. Confere antes de gravar qualquer coisa
   * (devolução em dinheiro não passa do que há no Caixa) e devolve a função que grava.
   */
  const prepararEstornoFinanceiro = (venda: Venda, estornos: Pagamento[], rotulo: string, em: string, por: Operador) => {
    const todos = recebiveisDaLoja();
    const r = efeitosFinanceirosDoEstorno(
      venda,
      estornos,
      todos.filter((x) => x.vendaId === venda.id),
      { rotulo, em, por, saldoCaixaCentavos: saldosDasContas(lancamentosDaLoja()).porConta.caixa },
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

        const validacao = validarNovaVenda(dados);
        if (!validacao.ok) throw new ErroApi(400, 'Dados da venda inválidos.', validacao.erros);

        const catalogo = new Map<string, ProdutoParaVenda>(produtosDaLoja().map((p) => [p.id, p]));
        const calculo = calcularVenda(validacao.valor, catalogo, {
          operador: quem,
          autorizacoes: autorizacoesDaLoja(),
          agora: agora(),
          estoque: saldosDeEstoque(movimentosDaLoja()),
          clientes: new Map(clientesDaLoja().map((c) => [c.id, c])),
          limiteDescontoPct: regras().venda.descontoSemSenhaPct,
        });
        if (!calculo.ok) throw new ErroApi(409, calculo.erros[0]?.mensagem ?? 'Não foi possível registrar a venda.', calculo.erros);
        calculo.valor.autorizacoesUsadas.forEach((id) => autorizacoes.delete(id)); // uso único

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
        };
        const financeiro = efeitosFinanceirosDaVenda(venda, { taxas: taxasDaLoja(), fuso, prazoFiadoDias: regras().fiado.prazoDias });
        gravarVendas([...daLoja, venda]);
        juntarMovimentos(movimentosDaVenda(venda));
        juntarLancamentos(financeiro.lancamentos);
        gravarDaLoja(CHAVES.recebiveis, lojaId, [...recebiveisDaLoja(), ...financeiro.recebiveis.map(comId)]);
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
        const r = calcularCancelamento(venda, validacao.valor, { operador: quem, autorizacao: a, agora: agora(), fuso });
        if (!r.ok) throw new ErroApi(409, r.erros[0]?.mensagem ?? 'Não foi possível cancelar.', r.erros);
        const em = agora().toISOString();
        const gravarFinanceiro = prepararEstornoFinanceiro(venda, r.valor.estornos, 'Cancelamento', em, pessoa(quem));
        if (r.valor.autorizacaoUsada) autorizacoes.delete(r.valor.autorizacaoUsada);
        const cancelada: Venda = {
          ...venda,
          status: 'cancelada',
          cancelamento: { em, por: pessoa(quem), autorizadoPor: r.valor.autorizadoPor, motivo: validacao.valor.motivo, estornos: r.valor.estornos },
        };
        vendas[i] = cancelada;
        gravarVendas(vendas);
        juntarMovimentos(movimentosDoCancelamento(cancelada, { motivo: validacao.valor.motivo, em, por: pessoa(quem) }));
        gravarFinanceiro();
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
        const r = calcularDevolucao(venda, validacao.valor, { operador: quem, autorizacao: a, agora: agora(), fuso });
        if (!r.ok) throw new ErroApi(409, r.erros[0]?.mensagem ?? 'Não foi possível registrar a devolução.', r.erros);
        const numero = vendas.reduce((maior, v) => Math.max(maior, ...v.devolucoes.map((d) => d.numero)), 0) + 1;
        const em = agora().toISOString();
        const gravarFinanceiro = prepararEstornoFinanceiro(venda, r.valor.estornos, `Devolução nº ${numero}`, em, pessoa(quem));
        if (r.valor.autorizacaoUsada) autorizacoes.delete(r.valor.autorizacaoUsada);
        const devolucao: Devolucao = {
          id: novoId(),
          numero,
          criadaEm: em,
          itens: r.valor.itens,
          totalCentavos: r.valor.totalCentavos,
          estornos: r.valor.estornos,
          motivo: validacao.valor.motivo,
          feitaPor: pessoa(quem),
          autorizadaPor: r.valor.autorizadoPor,
        };
        vendas[i] = { ...venda, devolucoes: [...venda.devolucoes, devolucao] };
        gravarVendas(vendas);
        juntarMovimentos(movimentosDaDevolucao(venda, devolucao));
        gravarFinanceiro();
        auditar('venda.devolucao', null, { numero: venda.numero, devolucao: numero, valorCentavos: devolucao.totalCentavos, autorizadoPor: r.valor.autorizadoPor?.id ?? null });
        return { venda: vendas[i]!, devolucao };
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
      exigirOperador();
      const saldos = saldosDeEstoque(movimentosDaLoja());
      const minimos = minimosDaLoja();
      return produtosDaLoja().map((p) => {
        const saldo = saldos.get(p.id) ?? 0;
        const minimo = minimos[p.id] ?? null;
        return { produtoId: p.id, saldo, minimo, situacao: situacaoEstoque(saldo, minimo) };
      });
    },

    async listarMovimentosEstoque(filtro = {}) {
      await preparar();
      exigirOperador();
      return movimentosDaLoja()
        .filter((m) => (!filtro.produtoId || m.produtoId === filtro.produtoId) && noPeriodo(m.criadoEm, filtro))
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    },

    async lancarMovimentoEstoque(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        const quem = exigir('estoque.lancar');
        const validacao = validarMovimentoManual(dados);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Movimento inválido.', validacao.erros);
        const p = exigirProduto(validacao.valor.produtoId);
        const unidade = unidadeDe(p.unidade);
        if (validacao.valor.tipo === 'ajuste' && !regras().estoque.motivosAjuste.includes(validacao.valor.motivo)) {
          throw new ErroApi(400, `Escolha o motivo do ajuste: ${regras().estoque.motivosAjuste.join(', ')}.`, [{ campo: 'motivo', mensagem: 'Motivo fora da lista da loja.' }]);
        }
        const antes = saldoDoProduto(p.id).saldo;
        if (antes + validacao.valor.quantidade < 0) {
          throw new ErroApi(409, `O ajuste deixaria o saldo de ${p.nome} negativo (saldo atual ${formatarQuantidade(antes, unidade)}).`, [{ campo: 'quantidade', mensagem: 'Saldo negativo.' }]);
        }
        juntarMovimentos([movimentoManual(validacao.valor, { em: agora().toISOString(), por: pessoa(quem) })]);
        auditar(validacao.valor.tipo === 'entrada' ? 'estoque.entrada' : 'estoque.ajuste', { tipo: 'produto', id: p.id }, {
          quantidade: validacao.valor.quantidade,
          unidade,
          motivo: validacao.valor.motivo,
          ...(validacao.valor.observacao ? { observacao: validacao.valor.observacao } : {}),
        });
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
      return buscarClientes(clientesDaLoja(), termo, LIMITES_CLIENTE.resultadosBusca).map((c) => ({
        id: c.id,
        nome: c.nome,
        cpfMascarado: mascararCpf(c.cpf),
        telefone: c.telefone,
        fiadoEmAbertoCentavos: fiadoEmAberto(recebiveis, c.id),
      }));
    },

    async listarClientes(termo = '') {
      await preparar();
      exigirOperador();
      return buscarClientes(clientesDaLoja(), termo);
    },

    async cadastrarCliente(dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigirOperador();
        const validacao = validarNovoCliente(dados);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do cliente inválidos.', validacao.erros);
        const daLoja = clientesDaLoja();
        const unico = conferirCpfUnico(validacao.valor.cpf, daLoja);
        if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
        const quando = agora().toISOString();
        const cliente: Cliente = { id: novoId(), ...validacao.valor, ativo: true, criadoEm: quando, atualizadoEm: quando };
        gravarDaLoja(CHAVES.clientes, lojaId, [...daLoja, cliente]);
        auditar('cliente.cadastrado', { tipo: 'cliente', id: cliente.id });
        return cliente;
      });
    },

    async atualizarCliente(id, dados) {
      await preparar(atrasoMs * 2);
      return gravarOperacao(() => {
        exigirOperador();
        const validacao = validarNovoCliente(dados);
        if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do cliente inválidos.', validacao.erros);
        const daLoja = clientesDaLoja();
        const i = daLoja.findIndex((c) => c.id === id);
        if (i < 0) throw new ErroApi(404, 'Cliente não encontrado.');
        const unico = conferirCpfUnico(validacao.valor.cpf, daLoja, id);
        if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
        const antes = daLoja[i]!;
        const atualizado: Cliente = { ...antes, ...validacao.valor, atualizadoEm: agora().toISOString() };
        const campos = (Object.keys(validacao.valor) as (keyof NovoCliente)[]).filter((k) => antes[k] !== atualizado[k]);
        if (campos.length === 0) return antes;
        daLoja[i] = atualizado;
        gravarDaLoja(CHAVES.clientes, lojaId, daLoja);
        auditar('cliente.alterado', { tipo: 'cliente', id }, { campos });
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

    async excluirDadosDoCliente(id) {
      await preparar();
      return gravarOperacao(() => {
        const quem = exigirOperador();
        const daLoja = clientesDaLoja();
        const cliente = daLoja.find((c) => c.id === id) ?? null;
        const recebiveis = recebiveisDaLoja();
        const permitido = conferirExclusaoDeCliente(quem.papel, cliente, fiadoEmAberto(recebiveis, id));
        if (!permitido.ok) throw new ErroApi(cliente ? 403 : 404, permitido.erros[0]!.mensagem, permitido.erros);
        const anonimo = anonimizarCliente(cliente!, agora());
        gravarDaLoja(CHAVES.clientes, lojaId, daLoja.map((c) => (c.id === id ? anonimo : c)));
        // o nome sai também das vendas, dos recebimentos de fiado e da descrição dos lançamentos
        gravarVendas(tirarNomeDoCliente(vendasDaLoja(), id));
        const doCliente = new Set(recebiveis.filter((r) => r.cliente?.id === id).map((r) => r.id));
        gravarDaLoja(CHAVES.recebiveis, lojaId, tirarNomeDoCliente(recebiveis, id));
        gravarDaLoja(
          CHAVES.lancamentos,
          lojaId,
          lancamentosDaLoja().map((l) =>
            l.recebivelId && doCliente.has(l.recebivelId) ? { ...l, descricao: l.descricao.split(` • ${cliente!.nome}`).join(` • ${NOME_CLIENTE_REMOVIDO}`) } : l,
          ),
        );
        auditar('cliente.dados_excluidos', { tipo: 'cliente', id });
        return anonimo;
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
      return lancamentosDaLoja()
        .filter((l) => (!filtro.conta || l.conta === filtro.conta) && noPeriodo(l.criadoEm, filtro))
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
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
        const novos = lancamentosManuais(validacao.valor, { em: agora().toISOString(), por: pessoa(quem) });
        const saida = conferirSaida(novos, saldosDasContas(lancamentosDaLoja()));
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
