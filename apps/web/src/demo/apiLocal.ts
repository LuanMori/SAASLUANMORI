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
// NÃO é segurança: aqui não há Auth0, RLS nem servidor.
import {
  type AcaoAutorizada,
  type Autorizacao,
  buscarClientes,
  calcularCancelamento,
  calcularDevolucao,
  calcularVenda,
  type Cliente,
  conferirCpfUnico,
  conferirSaida,
  CONTAS,
  diaNoFuso,
  type Devolucao,
  devolucoesComVenda,
  efeitosFinanceirosDaVenda,
  efeitosFinanceirosDoEstorno,
  ehGestor,
  fiadoEmAberto,
  formatarCodigoInterno,
  FUSO_PADRAO,
  type Lancamento,
  lancamentosManuais,
  LIMITES_CLIENTE,
  mascararCpf,
  type MovimentoEstoque,
  movimentoManual,
  movimentosDaDevolucao,
  movimentosDaVenda,
  movimentosDoCancelamento,
  NOME_CONTA,
  type NovoCliente,
  type Operador,
  type OperadorComPapel,
  type Pagamento,
  PRAZO_FIADO_PADRAO_DIAS,
  type ProdutoParaVenda,
  type Recebivel,
  receberRecebivel,
  recebiveisDeCartao,
  recebiveisDeFiado,
  resumirAReceber,
  resumirCliente,
  saldosDasContas,
  saldosDeEstoque,
  situacaoEstoque,
  somarDias,
  TAXAS_CARTAO_PADRAO,
  type TaxasCartao,
  validarEstoqueMinimo,
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
import { type ApiPainel, ErroApi, type FiltroVendas, type Produto, type SaldoEstoque } from '../api';
import { BLOQUEIO_MS, conferirSenhaDemo, gestoresDemo, TENTATIVAS_MAX } from './contasDemo';

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
} as const;

type PorLoja<T> = Record<string, T[]>;
const memoria: Record<string, unknown> = {};

function ler<T>(chave: string, vazio: T): T {
  try {
    const texto = localStorage.getItem(chave);
    return texto ? (JSON.parse(texto) as T) : vazio;
  } catch {
    // Sem localStorage (ou dado corrompido): usa a cópia em memória desta aba.
    return (memoria[chave] as T | undefined) ?? vazio;
  }
}

function gravar(chave: string, valor: unknown): void {
  memoria[chave] = valor;
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Navegador sem localStorage (ex.: aba anônima restrita): fica só na memória.
  }
}

const lerDaLoja = <T,>(chave: string, lojaId: string): T[] => ler<PorLoja<T>>(chave, {})[lojaId] ?? [];
const gravarDaLoja = <T,>(chave: string, lojaId: string, lista: T[]) => gravar(chave, { ...ler<PorLoja<T>>(chave, {}), [lojaId]: lista });

/** Apaga produtos, vendas, estoque, clientes e financeiro de todas as lojas (os exemplos não voltam). */
export function apagarDadosDemo(): void {
  const lojas = Object.keys(ler<PorLoja<Produto>>(CHAVES.produtos, {}));
  for (const chave of [CHAVES.produtos, CHAVES.vendas, CHAVES.estoque, CHAVES.minimos, CHAVES.clientes, CHAVES.lancamentos, CHAVES.recebiveis, CHAVES.taxas]) gravar(chave, {});
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

// ------------------------------------------------------------------ autorizações dadas com senha
// Ficam só na memória desta aba (como no DaniPets): recarregar a página não cria autorização.
const autorizacoes = new Map<string, Autorizacao & { lojaId: string }>();
// Senhas erradas na autorização, por loja e autorizador: mesma regra do login (5 erradas = 1 minuto bloqueado).
const falhasDeAutorizacao = new Map<string, { quantidade: number; bloqueadoAte: number }>();

// ------------------------------------------------------------------ exemplos
/** estoque = quanto o produto tem depois das vendas de exemplo; minimo = aviso de estoque baixo. */
const PRODUTOS_EXEMPLO: { nome: string; codigoBarras: string | null; precoCentavos: number; estoque: number; minimo: number }[] = [
  { nome: 'Ração Premium Cães Adultos 15 kg', codigoBarras: '7891000100103', precoCentavos: 18990, estoque: 12, minimo: 4 },
  { nome: 'Ração Gatos Castrados 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990, estoque: 18, minimo: 5 },
  { nome: 'Areia Sanitária 4 kg', codigoBarras: '7896000300306', precoCentavos: 2490, estoque: 25, minimo: 6 },
  { nome: 'Petisco Bifinho Carne 65 g', codigoBarras: '7897000400403', precoCentavos: 750, estoque: 60, minimo: 12 },
  { nome: 'Shampoo Neutro 500 ml', codigoBarras: null, precoCentavos: 3200, estoque: 8, minimo: 3 },
  { nome: 'Coleira Ajustável M', codigoBarras: null, precoCentavos: 2990, estoque: 3, minimo: 5 },
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
    const f = efeitosFinanceirosDaVenda(v, { taxas, fuso: opcoes.fuso, prazoFiadoDias: PRAZO_FIADO_PADRAO_DIAS });
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
}

export function criarApiLocal({
  lojaId,
  operador = null,
  bloqueio = null,
  fuso = FUSO_PADRAO,
  agora = () => new Date(),
  exemplos = true,
  atrasoMs = 120,
}: OpcoesApiLocal): ApiPainel {
  const preparar = async (ms = atrasoMs) => {
    await esperar(ms);
    if (bloqueio) throw new ErroApi(403, bloqueio);
    if (exemplos) criarExemplos(lojaId, agora(), fuso);
    prepararEcossistema(lojaId, { fuso, exemplos });
  };
  const exigirOperador = (): OperadorComPapel => {
    if (!operador) throw new ErroApi(401, 'Faça login para continuar.');
    return operador;
  };
  const exigirGestor = (acao: string): OperadorComPapel => {
    const quem = exigirOperador();
    if (!ehGestor(quem.papel)) throw new ErroApi(403, `${acao}: só o Dono ou o Administrador.`);
    return quem;
  };
  const pessoa = (o: OperadorComPapel): Operador => ({ id: o.id, nome: o.nome });
  /** O Vendedor só consulta o dia de hoje; outros períodos são dos Relatórios (Dono e Administrador). */
  const exigirPeriodoPermitido = (filtro: FiltroVendas) => {
    const quem = exigirOperador();
    const hoje = diaNoFuso(agora(), fuso);
    if (!ehGestor(quem.papel) && (filtro.de !== hoje || filtro.ate !== hoje)) {
      throw new ErroApi(403, 'Vendas de outros dias: só o Dono ou o Administrador (Relatórios).');
    }
  };

  const produtosDaLoja = () => lerDaLoja<Produto>(CHAVES.produtos, lojaId);
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

  return {
    // ---------------------------------------------------------------- produtos
    async listarProdutos() {
      await preparar();
      return [...produtosDaLoja()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
    },

    async criarProduto(dados) {
      await preparar(atrasoMs * 2);
      const validacao = validarNovoProduto(dados);
      if (!validacao.ok) throw new ErroApi(400, 'Dados do produto inválidos.', validacao.erros);
      const novo = validacao.valor;

      const daLoja = produtosDaLoja();
      const comCodigo = (codigo: string) =>
        daLoja.find((p) => p.codigoInterno === codigo || p.codigoBarras === codigo) ?? null;

      if (novo.codigoBarras) {
        const dono = comCodigo(novo.codigoBarras);
        if (dono) {
          throw new ErroApi(
            409,
            `Código de barras repetido: ${novo.codigoBarras} já está vinculado ao produto "${dono.nome}".`,
            [{ campo: 'codigoBarras', mensagem: `Já usado em "${dono.nome}".` }],
          );
        }
      }

      // Maior código interno da loja + 1, pulando números já usados como código de barras.
      let numero = daLoja.reduce((maior, p) => Math.max(maior, Number(p.codigoInterno)), 0) + 1;
      let codigoInterno = formatarCodigoInterno(numero);
      while (codigoInterno === novo.codigoBarras || comCodigo(codigoInterno)) {
        numero += 1;
        codigoInterno = formatarCodigoInterno(numero);
      }

      const quando = agora().toISOString();
      const produto: Produto = { id: novoId(), codigoInterno, ...novo, ativo: true, criadoEm: quando, atualizadoEm: quando };
      gravarDaLoja(CHAVES.produtos, lojaId, [...daLoja, produto]);
      return produto;
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
      const financeiro = efeitosFinanceirosDaVenda(venda, { taxas: taxasDaLoja(), fuso, prazoFiadoDias: PRAZO_FIADO_PADRAO_DIAS });
      gravarVendas([...daLoja, venda]);
      juntarMovimentos(movimentosDaVenda(venda));
      juntarLancamentos(financeiro.lancamentos);
      gravarDaLoja(CHAVES.recebiveis, lojaId, [...recebiveisDaLoja(), ...financeiro.recebiveis.map(comId)]);
      return venda;
    },

    async listarAutorizadores() {
      await preparar();
      exigirOperador();
      return gestoresDemo();
    },

    async autorizar({ usuarioId, senha, acao }) {
      await preparar(atrasoMs * 2);
      exigirOperador();
      // mesma proteção do login: 5 senhas erradas seguidas bloqueiam o autorizador por 1 minuto
      const chave = `${lojaId}:${usuarioId}`;
      const falhas = falhasDeAutorizacao.get(chave);
      const instante = agora().getTime();
      if (falhas && falhas.bloqueadoAte > instante) {
        throw new ErroApi(429, `Muitas senhas erradas. Tente de novo em ${Math.ceil((falhas.bloqueadoAte - instante) / 1000)} s.`);
      }
      const g = conferirSenhaDemo(usuarioId, senha);
      if (!g) {
        const quantidade = (falhas?.quantidade ?? 0) + 1;
        const bloqueia = quantidade >= TENTATIVAS_MAX;
        falhasDeAutorizacao.set(chave, { quantidade: bloqueia ? 0 : quantidade, bloqueadoAte: bloqueia ? instante + BLOQUEIO_MS : 0 });
        if (bloqueia) throw new ErroApi(429, 'Muitas senhas erradas. As autorizações desta pessoa ficaram bloqueadas por 1 minuto.');
        throw new ErroApi(403, 'Senha incorreta.');
      }
      falhasDeAutorizacao.delete(chave);
      if (acao.tipo === 'desconto' && acao.precoFinalCentavos === 0 && g.papel !== 'dono') {
        throw new ErroApi(403, 'Brinde só com a autorização de um Dono.');
      }
      const id = novoId();
      autorizacoes.set(id, { id, autorizador: g, acao: { ...acao } as AcaoAutorizada, criadaEm: agora().toISOString(), lojaId });
      return { autorizacao: id, autorizador: g };
    },

    async cancelarVenda(vendaId, pedido) {
      await preparar(atrasoMs * 2);
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
      return cancelada;
    },

    async devolverItens(vendaId, pedido) {
      await preparar(atrasoMs * 2);
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
      return { venda: vendas[i]!, devolucao };
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
      const quem = exigirGestor('Entrada e ajuste de estoque');
      const validacao = validarMovimentoManual(dados);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Movimento inválido.', validacao.erros);
      const p = exigirProduto(validacao.valor.produtoId);
      const antes = saldoDoProduto(p.id).saldo;
      if (antes + validacao.valor.quantidade < 0) {
        throw new ErroApi(409, `O ajuste deixaria o saldo de ${p.nome} negativo (saldo atual ${antes} un.).`, [{ campo: 'quantidade', mensagem: 'Saldo negativo.' }]);
      }
      juntarMovimentos([movimentoManual(validacao.valor, { em: agora().toISOString(), por: pessoa(quem) })]);
      return saldoDoProduto(p.id);
    },

    async definirEstoqueMinimo(produtoId, minimo) {
      await preparar();
      exigirGestor('Estoque mínimo');
      const p = exigirProduto(produtoId);
      const validacao = validarEstoqueMinimo(minimo);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]!.mensagem, validacao.erros);
      const { [p.id]: _antigo, ...outros } = minimosDaLoja();
      const novos = validacao.valor === null ? outros : { ...outros, [p.id]: validacao.valor };
      gravar(CHAVES.minimos, { ...ler<Record<string, Record<string, number>>>(CHAVES.minimos, {}), [lojaId]: novos });
      return saldoDoProduto(p.id);
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
      exigirOperador();
      const validacao = validarNovoCliente(dados);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do cliente inválidos.', validacao.erros);
      const daLoja = clientesDaLoja();
      const unico = conferirCpfUnico(validacao.valor.cpf, daLoja);
      if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
      const quando = agora().toISOString();
      const cliente: Cliente = { id: novoId(), ...validacao.valor, ativo: true, criadoEm: quando, atualizadoEm: quando };
      gravarDaLoja(CHAVES.clientes, lojaId, [...daLoja, cliente]);
      return cliente;
    },

    async atualizarCliente(id, dados) {
      await preparar(atrasoMs * 2);
      exigirOperador();
      const validacao = validarNovoCliente(dados);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Dados do cliente inválidos.', validacao.erros);
      const daLoja = clientesDaLoja();
      const i = daLoja.findIndex((c) => c.id === id);
      if (i < 0) throw new ErroApi(404, 'Cliente não encontrado.');
      const unico = conferirCpfUnico(validacao.valor.cpf, daLoja, id);
      if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
      const atualizado: Cliente = { ...daLoja[i]!, ...validacao.valor, atualizadoEm: agora().toISOString() };
      daLoja[i] = atualizado;
      gravarDaLoja(CHAVES.clientes, lojaId, daLoja);
      return atualizado;
    },

    async definirClienteAtivo(id, ativo) {
      await preparar(atrasoMs * 2);
      exigirGestor('Desativar ou reativar cliente');
      const daLoja = clientesDaLoja();
      const i = daLoja.findIndex((c) => c.id === id);
      if (i < 0) throw new ErroApi(404, 'Cliente não encontrado.');
      if (ativo) {
        const unico = conferirCpfUnico(daLoja[i]!.cpf, daLoja, id);
        if (!unico.ok) throw new ErroApi(409, unico.erros[0]!.mensagem, unico.erros);
      }
      const atualizado: Cliente = { ...daLoja[i]!, ativo: ativo === true, atualizadoEm: agora().toISOString() };
      daLoja[i] = atualizado;
      gravarDaLoja(CHAVES.clientes, lojaId, daLoja);
      return atualizado;
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

    // ---------------------------------------------------------------- financeiro
    async resumoFinanceiro() {
      await preparar();
      exigirGestor('Financeiro');
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
      exigirGestor('Financeiro');
      return lancamentosDaLoja()
        .filter((l) => (!filtro.conta || l.conta === filtro.conta) && noPeriodo(l.criadoEm, filtro))
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    },

    async listarRecebiveis(filtro = {}) {
      await preparar();
      exigirGestor('Financeiro');
      return recebiveisDaLoja()
        .filter((r) => !filtro.situacao || r.situacao === filtro.situacao)
        .sort((a, b) => a.venceEm.localeCompare(b.venceEm) || a.criadoEm.localeCompare(b.criadoEm));
    },

    async receberRecebivel(id, conta) {
      await preparar(atrasoMs * 2);
      const quem = exigirGestor('Confirmar recebimento');
      const todos = recebiveisDaLoja();
      const atual = todos.find((r) => r.id === id);
      if (!atual) throw new ErroApi(404, 'Recebimento não encontrado.');
      const r = receberRecebivel(atual, { conta, em: agora().toISOString(), por: pessoa(quem) });
      if (!r.ok) throw new ErroApi(409, r.erros[0]!.mensagem, r.erros);
      gravarDaLoja(CHAVES.recebiveis, lojaId, todos.map((x) => (x.id === id ? r.valor.recebivel : x)));
      juntarLancamentos([r.valor.lancamento]);
      return r.valor.recebivel;
    },

    async lancarNoFinanceiro(dados) {
      await preparar(atrasoMs * 2);
      const quem = exigirGestor('Lançamento financeiro');
      const validacao = validarLancamentoManual(dados);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Lançamento inválido.', validacao.erros);
      const novos = lancamentosManuais(validacao.valor, { em: agora().toISOString(), por: pessoa(quem) });
      const saida = conferirSaida(novos, saldosDasContas(lancamentosDaLoja()));
      if (!saida.ok) throw new ErroApi(409, saida.erros[0]!.mensagem, saida.erros);
      return juntarLancamentos(novos);
    },

    async definirSaldoInicial(dados) {
      await preparar(atrasoMs * 2);
      const quem = exigirGestor('Saldo inicial');
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
      return lancamento!;
    },

    async lerTaxasCartao() {
      await preparar();
      exigirGestor('Taxas de cartão');
      return taxasDaLoja();
    },

    async salvarTaxasCartao(taxas) {
      await preparar(atrasoMs * 2);
      exigirGestor('Taxas de cartão');
      const validacao = validarTaxasCartao(taxas);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]!.mensagem, validacao.erros);
      gravar(CHAVES.taxas, { ...ler<Record<string, TaxasCartao>>(CHAVES.taxas, {}), [lojaId]: validacao.valor });
      return validacao.valor;
    },
  };
}
