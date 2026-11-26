// apps/web/src/relatorios/planilhas.ts
// Os dados de cada assunto dos Relatórios (Fase 2, módulo 10; pedido do Luan de 23/11/2026) viram `Planilha`: a mesma
// tabela aparece na aba da tela e vai para o Excel (xlsx.ts). Funções puras (testáveis sem tela):
//   - carregarRelatorios: lê tudo o que a loja tem para o período (cada parte que o servidor ainda não tiver fica
//     null, e o resto continua);
//   - planilha*: vendas, itens vendidos, pagamentos, devoluções, produtos (mais vendidos e lucro estimado),
//     posição de estoque, movimentos de estoque, clientes, vales-troca, lançamentos, a receber, a pagar, caixa do dia,
//     compras, itens comprados e histórico (quem fez o quê);
//   - planilhasDeTudo: o "Exportar tudo", com um resumo na primeira aba;
//   - vendas antigas (importadas de outro sistema, só como histórico; módulo 13): ficam à parte, na aba e nas planilhas
//     delas, e não entram nos números das outras abas.
// LGPD: o CPF sai mascarado (como na tela); o resto é o que o Dono e o Administrador já veem em cada aba.
import {
  type CaixaDoDia,
  type Cliente,
  type Compra,
  type ContaPagar,
  descreverPagamentos,
  type DevolucaoComVenda,
  diaDoLancamento,
  diaNoFuso,
  formatarNumeroVenda,
  formatarTelefone,
  type Lancamento,
  liquidoAReceber,
  mascararCpf,
  type MovimentoEstoque,
  NOME_FORMA_PAGAMENTO,
  NOME_LANCAMENTO,
  NOME_MOVIMENTO_ESTOQUE,
  type NomesDasContas,
  type Recebivel,
  taxasDasVendas,
  unidadeDe,
  type UnidadeVenda,
  type ValeTroca,
  valorDaQuantidade,
  type Venda,
  type VendaAntiga,
} from '@saas/core';
import type { ApiSistema, ItemAuditoria, LinhaFiado, Produto, SaldoEstoque } from '../api';
import type { Celula, Planilha } from './xlsx';

/** Período dos relatórios (AAAA-MM-DD, inclusive); null = sem limite daquele lado ("Todas"). */
export interface Periodo {
  de: string | null;
  ate: string | null;
}
export const noPeriodo = (dia: string, p: Periodo) => (!p.de || dia >= p.de) && (!p.ate || dia <= p.ate);

export type ApiRelatorios = Pick<
  ApiSistema,
  | 'listarVendas'
  | 'listarDevolucoes'
  | 'listarRecebiveis'
  | 'listarProdutos'
  | 'listarEstoque'
  | 'listarMovimentosEstoque'
  | 'listarClientes'
  | 'listarFiado'
  | 'listarVales'
  | 'listarLancamentos'
  | 'listarContasAPagar'
  | 'lerCaixa'
  | 'listarCompras'
  | 'listarAuditoria'
  | 'listarVendasAntigas'
>;

/** Tudo o que os relatórios usam. null = parte que o servidor ainda não tem (ou sem permissão). */
export interface DadosDosRelatorios {
  vendas: Venda[] | null;
  devolucoes: DevolucaoComVenda[] | null;
  recebiveis: Recebivel[] | null;
  produtos: Produto[] | null;
  estoque: SaldoEstoque[] | null;
  /** Todos os movimentos (o saldo no início do período sai deles). */
  movimentos: MovimentoEstoque[] | null;
  clientes: Cliente[] | null;
  fiado: LinhaFiado[] | null;
  vales: ValeTroca[] | null;
  lancamentos: Lancamento[] | null;
  contasPagar: ContaPagar[] | null;
  caixas: CaixaDoDia[] | null;
  compras: Compra[] | null;
  auditoria: ItemAuditoria[] | null;
  /** As vendas antigas importadas (todas, de qualquer período: a aba filtra). Fora dos outros números. */
  vendasAntigas?: VendaAntiga[] | null;
}

/** Quantos registros do histórico os relatórios leem (o máximo que a loja guarda na demonstração). */
export const HISTORICO_MAX = 2000;

export async function carregarRelatorios(api: ApiRelatorios, p: Periodo): Promise<DadosDosRelatorios> {
  const talvez = <T>(f: () => Promise<T>): Promise<T | null> => {
    try {
      return f().catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  };
  const filtro = { de: p.de, ate: p.ate };
  const [vendas, devolucoes, recebiveis, produtos, estoque, movimentos, clientes, fiado, vales, lancamentos, contasPagar, caixa, compras, auditoria] = await Promise.all([
    talvez(() => api.listarVendas(filtro)),
    talvez(() => api.listarDevolucoes(filtro)),
    talvez(() => api.listarRecebiveis()),
    talvez(() => api.listarProdutos()),
    talvez(() => api.listarEstoque()),
    talvez(() => api.listarMovimentosEstoque()),
    talvez(() => api.listarClientes()),
    talvez(() => api.listarFiado()),
    talvez(() => api.listarVales({ situacao: 'todos' })),
    talvez(() => api.listarLancamentos(filtro)),
    talvez(() => api.listarContasAPagar()),
    talvez(() => api.lerCaixa()),
    talvez(() => api.listarCompras(filtro)),
    talvez(() => api.listarAuditoria(HISTORICO_MAX)),
  ]);
  const vendasAntigas = await talvez(() => api.listarVendasAntigas());
  return {
    vendas,
    devolucoes,
    recebiveis,
    produtos,
    estoque,
    movimentos,
    clientes,
    fiado: fiado?.linhas ?? null,
    vales,
    lancamentos,
    contasPagar,
    caixas: caixa?.historico ?? null,
    compras,
    auditoria,
    vendasAntigas,
  };
}

// ------------------------------------------------------------------ ajudas
const GRAMAS_NO_KG = 1000;
const hora = (iso: string, fuso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
/** Quantidade na unidade do produto: unidades, ou kg (o estoque e a venda guardam gramas). */
export const naUnidade = (q: number, u: UnidadeVenda | undefined): number => (unidadeDe(u) === 'kg' ? q / GRAMAS_NO_KG : q);
const nomeUnidade = (u: UnidadeVenda | undefined) => (unidadeDe(u) === 'kg' ? 'kg' : 'un');
const SITUACAO_VENDA = (v: Venda) => (v.status === 'cancelada' ? 'Cancelada' : v.devolucoes.length > 0 ? 'Com devolução' : 'Finalizada');
const devolvidoDaVenda = (v: Venda) => v.devolucoes.reduce((s, d) => s + d.totalCentavos, 0);

// ------------------------------------------------------------------ vendas
export function planilhaVendas(vendas: readonly Venda[], fuso: string): Planilha {
  return {
    nome: 'Vendas',
    colunas: [
      { titulo: 'Venda' },
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Hora' },
      { titulo: 'Situação' },
      { titulo: 'Vendido por' },
      { titulo: 'Cliente' },
      { titulo: 'Pagamento' },
      { titulo: 'Desconto', tipo: 'dinheiro' },
      { titulo: 'Total', tipo: 'dinheiro' },
      { titulo: 'Devolvido', tipo: 'dinheiro' },
      { titulo: 'Cashback gerado', tipo: 'dinheiro' },
    ],
    linhas: vendas.map((v) => [
      formatarNumeroVenda(v.numero),
      diaNoFuso(v.criadaEm, fuso),
      hora(v.criadaEm, fuso),
      SITUACAO_VENDA(v),
      v.vendedor.nome,
      v.cliente?.nome ?? null,
      descreverPagamentos(v.pagamentos),
      v.descontoCentavos,
      v.totalCentavos,
      devolvidoDaVenda(v) || null,
      v.cashbackGeradoCentavos ?? null,
    ]),
  };
}

export function planilhaItensVendidos(vendas: readonly Venda[], fuso: string): Planilha {
  const linhas: Celula[][] = [];
  for (const v of vendas) {
    v.itens.forEach((i, n) => {
      const devolvido = v.devolucoes.flatMap((d) => d.itens).filter((x) => x.linha === n);
      const qtd = i.quantidade - devolvido.reduce((s, x) => s + x.quantidade, 0);
      const valor = i.subtotalCentavos - devolvido.reduce((s, x) => s + x.valorCentavos, 0);
      const custo = i.custoCentavos == null ? null : valorDaQuantidade(i.custoCentavos, qtd, unidadeDe(i.unidade));
      linhas.push([
        formatarNumeroVenda(v.numero),
        diaNoFuso(v.criadaEm, fuso),
        SITUACAO_VENDA(v),
        i.codigoInterno,
        i.nome,
        naUnidade(i.quantidade, i.unidade),
        nomeUnidade(i.unidade),
        i.precoListaCentavos,
        i.precoCentavos,
        i.desconto ? `${i.desconto.motivo} • ${i.desconto.responsavel.nome}` : null,
        i.subtotalCentavos,
        devolvido.length ? naUnidade(i.quantidade - qtd, i.unidade) : null,
        v.status === 'cancelada' ? null : custo,
        v.status === 'cancelada' || custo === null ? null : valor - custo,
      ]);
    });
  }
  return {
    nome: 'Itens vendidos',
    colunas: [
      { titulo: 'Venda' },
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Situação' },
      { titulo: 'Código' },
      { titulo: 'Produto' },
      { titulo: 'Quantidade', tipo: 'numero' },
      { titulo: 'Unidade' },
      { titulo: 'Preço de tabela', tipo: 'dinheiro' },
      { titulo: 'Preço cobrado', tipo: 'dinheiro' },
      { titulo: 'Desconto (motivo • quem)' },
      { titulo: 'Total do item', tipo: 'dinheiro' },
      { titulo: 'Devolvido (qtd.)', tipo: 'numero' },
      { titulo: 'Custo (médio)', tipo: 'dinheiro' },
      { titulo: 'Lucro estimado', tipo: 'dinheiro' },
    ],
    linhas,
  };
}

export function planilhaPagamentos(vendas: readonly Venda[], fuso: string): Planilha {
  return {
    nome: 'Pagamentos',
    colunas: [{ titulo: 'Venda' }, { titulo: 'Data', tipo: 'data' }, { titulo: 'Situação' }, { titulo: 'Forma' }, { titulo: 'Valor', tipo: 'dinheiro' }, { titulo: 'Vale-troca' }],
    linhas: vendas.flatMap((v) =>
      v.pagamentos.map((p) => [formatarNumeroVenda(v.numero), diaNoFuso(v.criadaEm, fuso), SITUACAO_VENDA(v), NOME_FORMA_PAGAMENTO[p.forma], p.valorCentavos, p.valeCodigo ?? null]),
    ),
  };
}

export function planilhaDevolucoes(devolucoes: readonly DevolucaoComVenda[], fuso: string): Planilha {
  return {
    nome: 'Devoluções',
    colunas: [
      { titulo: 'Devolução' },
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Hora' },
      { titulo: 'Venda' },
      { titulo: 'Vendido por' },
      { titulo: 'Cliente' },
      { titulo: 'Itens' },
      { titulo: 'Valor', tipo: 'dinheiro' },
      { titulo: 'Como voltou' },
      { titulo: 'Motivo' },
      { titulo: 'Feita por' },
      { titulo: 'Autorizada por' },
    ],
    linhas: devolucoes.map((d) => [
      `nº ${d.numero}`,
      diaNoFuso(d.criadaEm, fuso),
      hora(d.criadaEm, fuso),
      formatarNumeroVenda(d.vendaNumero),
      d.vendaVendedor.nome,
      d.vendaCliente?.nome ?? null,
      d.itens.map((i) => `${unidadeDe(i.unidade) === 'kg' ? `${naUnidade(i.quantidade, i.unidade)} kg` : `${i.quantidade}×`} ${i.nome}`).join(', '),
      d.totalCentavos,
      [d.estornos.length ? descreverPagamentos(d.estornos) : null, d.vale ? `vale-troca ${d.vale.codigo}` : null].filter(Boolean).join(' • ') || null,
      d.motivo || null,
      d.feitaPor.nome,
      d.autorizadaPor?.nome ?? null,
    ]),
  };
}

// ------------------------------------------------------------------ produtos: mais vendidos e lucro estimado
export interface LinhaProduto {
  produtoId: string;
  codigo: string;
  nome: string;
  unidade: UnidadeVenda;
  /** Na unidade guardada (unidades ou gramas), já sem o devolvido. */
  quantidade: number;
  vendasCentavos: number;
  /** null = algum item vendido sem custo (o lucro desse produto fica de fora). */
  custoCentavos: number | null;
}

/** Por produto, nas vendas finalizadas: quanto saiu (sem o devolvido), quanto rendeu e o custo (médio, da hora da venda). */
export function linhasDeProdutos(vendas: readonly Venda[]): LinhaProduto[] {
  const m = new Map<string, LinhaProduto>();
  for (const v of vendas) {
    if (v.status !== 'finalizada') continue;
    v.itens.forEach((i, n) => {
      const devolvido = v.devolucoes.flatMap((d) => d.itens).filter((x) => x.linha === n);
      const qtd = i.quantidade - devolvido.reduce((s, x) => s + x.quantidade, 0);
      const valor = i.subtotalCentavos - devolvido.reduce((s, x) => s + x.valorCentavos, 0);
      const u = unidadeDe(i.unidade);
      const atual = m.get(i.produtoId) ?? { produtoId: i.produtoId, codigo: i.codigoInterno, nome: i.nome, unidade: u, quantidade: 0, vendasCentavos: 0, custoCentavos: 0 };
      atual.quantidade += qtd;
      atual.vendasCentavos += valor;
      atual.custoCentavos = atual.custoCentavos === null || i.custoCentavos == null ? (qtd > 0 ? null : atual.custoCentavos) : atual.custoCentavos + valorDaQuantidade(i.custoCentavos, qtd, u);
      m.set(i.produtoId, atual);
    });
  }
  return [...m.values()].filter((l) => l.quantidade > 0 || l.vendasCentavos > 0).sort((a, b) => b.vendasCentavos - a.vendasCentavos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface IndicadoresDeProdutos {
  vendasCentavos: number;
  custoCentavos: number;
  /** Vendas dos produtos com custo, menos o custo, as taxas de cartão e o cashback usado. */
  lucroCentavos: number;
  /** Vendas dos produtos sem custo (ficam fora do lucro). */
  semCustoCentavos: number;
  semCusto: number;
  /** Quantos produtos vendidos têm custo (0 = não dá para estimar o lucro). */
  comCusto: number;
  taxasCentavos: number;
  cashbackUsadoCentavos: number;
}

export function indicadoresDeProdutos(linhas: readonly LinhaProduto[], vendas: readonly Venda[], recebiveis: readonly Recebivel[] | null): IndicadoresDeProdutos {
  const comCusto = linhas.filter((l) => l.custoCentavos !== null);
  const semCusto = linhas.filter((l) => l.custoCentavos === null);
  const finalizadas = vendas.filter((v) => v.status === 'finalizada');
  const taxas = recebiveis ? taxasDasVendas(recebiveis, new Set(finalizadas.map((v) => v.id))) : 0;
  const cashback = finalizadas.reduce((s, v) => s + v.pagamentos.filter((p) => p.forma === 'cashback').reduce((t, p) => t + p.valorCentavos, 0), 0);
  const vendasComCusto = comCusto.reduce((s, l) => s + l.vendasCentavos, 0);
  const custo = comCusto.reduce((s, l) => s + (l.custoCentavos ?? 0), 0);
  return {
    vendasCentavos: linhas.reduce((s, l) => s + l.vendasCentavos, 0),
    custoCentavos: custo,
    lucroCentavos: vendasComCusto - custo - taxas - cashback,
    semCustoCentavos: semCusto.reduce((s, l) => s + l.vendasCentavos, 0),
    semCusto: semCusto.length,
    comCusto: comCusto.length,
    taxasCentavos: taxas,
    cashbackUsadoCentavos: cashback,
  };
}

export function planilhaProdutos(linhas: readonly LinhaProduto[]): Planilha {
  return {
    nome: 'Produtos vendidos',
    colunas: [
      { titulo: 'Posição', tipo: 'inteiro' },
      { titulo: 'Código' },
      { titulo: 'Produto' },
      { titulo: 'Quantidade', tipo: 'numero' },
      { titulo: 'Unidade' },
      { titulo: 'Vendas', tipo: 'dinheiro' },
      { titulo: 'Custo', tipo: 'dinheiro' },
      { titulo: 'Lucro bruto', tipo: 'dinheiro' },
      { titulo: 'Margem', tipo: 'pct' },
    ],
    linhas: linhas.map((l, i) => {
      const lucro = l.custoCentavos === null ? null : l.vendasCentavos - l.custoCentavos;
      return [
        i + 1,
        l.codigo,
        l.nome,
        naUnidade(l.quantidade, l.unidade),
        nomeUnidade(l.unidade),
        l.vendasCentavos,
        l.custoCentavos,
        lucro,
        lucro === null || l.vendasCentavos <= 0 ? null : Math.round((lucro / l.vendasCentavos) * 1000) / 10,
      ];
    }),
  };
}

// ------------------------------------------------------------------ estoque
export interface PosicaoEstoque {
  produto: Produto;
  inicio: number;
  entradas: number;
  ajustes: number;
  vendido: number;
  devolvido: number;
  fim: number;
  minimo: number | null;
  custoMedioCentavos: number | null;
}

const diaDoMovimento = (m: MovimentoEstoque, fuso: string) => m.dia ?? diaNoFuso(m.criadoEm, fuso);

/** Posição de estoque no período (DaniPets REL-08): no início, entradas, ajustes, vendido, devolvido e no fim. */
export function posicaoDeEstoque(produtos: readonly Produto[], estoque: readonly SaldoEstoque[] | null, movimentos: readonly MovimentoEstoque[], p: Periodo, fuso: string): PosicaoEstoque[] {
  const porId = new Map(produtos.map((x) => [x.id, x]));
  const saldo = new Map((estoque ?? []).map((s) => [s.produtoId, s]));
  const pos = new Map<string, PosicaoEstoque>();
  for (const prod of produtos) {
    const s = saldo.get(prod.id);
    pos.set(prod.id, { produto: prod, inicio: 0, entradas: 0, ajustes: 0, vendido: 0, devolvido: 0, fim: 0, minimo: s?.minimo ?? null, custoMedioCentavos: s?.custoMedioCentavos ?? null });
  }
  for (const m of movimentos) {
    const x = pos.get(m.produtoId);
    if (!x || !porId.has(m.produtoId)) continue;
    const dia = diaDoMovimento(m, fuso);
    if (p.ate && dia > p.ate) continue;
    x.fim += m.quantidade;
    if (p.de && dia < p.de) {
      x.inicio += m.quantidade;
      continue;
    }
    if (m.tipo === 'inicial' || m.tipo === 'entrada' || m.tipo === 'compra') x.entradas += m.quantidade;
    else if (m.tipo === 'venda') x.vendido -= m.quantidade;
    else if (m.tipo === 'devolucao' || m.tipo === 'cancelamento') x.devolvido += m.quantidade;
    else x.ajustes += m.quantidade; // ajuste e estorno de compra
  }
  return [...pos.values()].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'));
}

export const situacaoDoEstoque = (x: PosicaoEstoque) => (x.fim < 0 ? 'Negativo' : x.fim === 0 ? 'Zerado' : x.minimo !== null && x.fim <= x.minimo ? 'Baixo' : 'Normal');

export function planilhaEstoque(pos: readonly PosicaoEstoque[]): Planilha {
  return {
    nome: 'Posição de estoque',
    colunas: [
      { titulo: 'Código' },
      { titulo: 'Produto' },
      { titulo: 'Unidade' },
      { titulo: 'Ativo' },
      { titulo: 'No início', tipo: 'numero' },
      { titulo: 'Entradas', tipo: 'numero' },
      { titulo: 'Ajustes', tipo: 'numero' },
      { titulo: 'Vendido', tipo: 'numero' },
      { titulo: 'Devolvido', tipo: 'numero' },
      { titulo: 'No fim', tipo: 'numero' },
      { titulo: 'Mínimo', tipo: 'numero' },
      { titulo: 'Situação' },
      { titulo: 'Custo médio', tipo: 'dinheiro' },
      { titulo: 'Valor em estoque', tipo: 'dinheiro' },
    ],
    linhas: pos.map((x) => {
      const u = x.produto.unidade;
      return [
        x.produto.codigoInterno,
        x.produto.nome,
        nomeUnidade(u),
        x.produto.ativo ? 'Sim' : 'Não',
        naUnidade(x.inicio, u),
        naUnidade(x.entradas, u),
        naUnidade(x.ajustes, u),
        naUnidade(x.vendido, u),
        naUnidade(x.devolvido, u),
        naUnidade(x.fim, u),
        x.minimo === null ? null : naUnidade(x.minimo, u),
        situacaoDoEstoque(x),
        x.custoMedioCentavos === null ? null : Math.round(x.custoMedioCentavos),
        x.custoMedioCentavos === null || x.fim <= 0 ? null : valorDaQuantidade(Math.round(x.custoMedioCentavos), x.fim, unidadeDe(u)),
      ];
    }),
  };
}

export function planilhaMovimentos(movimentos: readonly MovimentoEstoque[], produtos: readonly Produto[], p: Periodo, fuso: string): Planilha {
  const porId = new Map(produtos.map((x) => [x.id, x]));
  const doPeriodo = movimentos.filter((m) => noPeriodo(diaDoMovimento(m, fuso), p));
  return {
    nome: 'Movimentos de estoque',
    colunas: [
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Hora' },
      { titulo: 'Código' },
      { titulo: 'Produto' },
      { titulo: 'Movimento' },
      { titulo: 'Quantidade', tipo: 'numero' },
      { titulo: 'Unidade' },
      { titulo: 'Motivo' },
      { titulo: 'Venda' },
      { titulo: 'Quem' },
    ],
    linhas: doPeriodo.map((m) => {
      const prod = porId.get(m.produtoId);
      return [
        diaDoMovimento(m, fuso),
        hora(m.criadoEm, fuso),
        prod?.codigoInterno ?? null,
        prod?.nome ?? '(produto excluído)',
        NOME_MOVIMENTO_ESTOQUE[m.tipo],
        naUnidade(m.quantidade, prod?.unidade),
        nomeUnidade(prod?.unidade),
        m.motivo || null,
        m.vendaNumero ? formatarNumeroVenda(m.vendaNumero) : null,
        m.por?.nome ?? null,
      ];
    }),
  };
}

// ------------------------------------------------------------------ clientes
export interface LinhaCliente {
  cliente: Cliente;
  compras: number;
  totalCentavos: number;
  ultimaCompra: string | null;
  fiado: LinhaFiado | null;
}

export function linhasDeClientes(clientes: readonly Cliente[], vendas: readonly Venda[], fiado: readonly LinhaFiado[] | null, fuso: string): LinhaCliente[] {
  const porFiado = new Map((fiado ?? []).map((f) => [f.clienteId, f]));
  const m = new Map<string, LinhaCliente>(clientes.map((c) => [c.id, { cliente: c, compras: 0, totalCentavos: 0, ultimaCompra: null, fiado: porFiado.get(c.id) ?? null }]));
  for (const v of vendas) {
    if (v.status !== 'finalizada' || !v.cliente) continue;
    const l = m.get(v.cliente.id);
    if (!l) continue;
    l.compras += 1;
    l.totalCentavos += v.totalCentavos - devolvidoDaVenda(v);
    const dia = diaNoFuso(v.criadaEm, fuso);
    if (!l.ultimaCompra || dia > l.ultimaCompra) l.ultimaCompra = dia;
  }
  return [...m.values()].sort((a, b) => b.totalCentavos - a.totalCentavos || a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'));
}

export function planilhaClientes(linhas: readonly LinhaCliente[]): Planilha {
  return {
    nome: 'Clientes',
    colunas: [
      { titulo: 'Cliente' },
      { titulo: 'Telefone' },
      { titulo: 'CPF (mascarado)' },
      { titulo: 'Situação' },
      { titulo: 'Compras no período', tipo: 'inteiro' },
      { titulo: 'Total no período', tipo: 'dinheiro' },
      { titulo: 'Ticket médio', tipo: 'dinheiro' },
      { titulo: 'Última compra no período', tipo: 'data' },
      { titulo: 'Fiado em aberto', tipo: 'dinheiro' },
      { titulo: 'Fiado vencido', tipo: 'dinheiro' },
      { titulo: 'Limite do fiado', tipo: 'dinheiro' },
    ],
    linhas: linhas.map((l) => [
      l.cliente.nome,
      l.cliente.telefone ? formatarTelefone(l.cliente.telefone) : null,
      l.cliente.cpf ? mascararCpf(l.cliente.cpf) : null,
      l.cliente.ativo ? 'Ativo' : 'Inativo',
      l.compras,
      l.totalCentavos,
      l.compras ? Math.round(l.totalCentavos / l.compras) : null,
      l.ultimaCompra,
      l.fiado?.devendoCentavos || null,
      l.fiado?.vencidoCentavos || null,
      l.cliente.limiteFiadoCentavos ?? l.fiado?.limiteCentavos ?? null,
    ]),
  };
}

export function planilhaVales(vales: readonly ValeTroca[], p: Periodo): Planilha {
  return {
    nome: 'Vales-troca',
    colunas: [
      { titulo: 'Código' },
      { titulo: 'Emitido em', tipo: 'data' },
      { titulo: 'Valor', tipo: 'dinheiro' },
      { titulo: 'Saldo', tipo: 'dinheiro' },
      { titulo: 'Situação' },
      { titulo: 'Cliente' },
      { titulo: 'Venda de origem' },
      { titulo: 'Emitido por' },
    ],
    linhas: vales
      .filter((v) => noPeriodo(v.dia, p))
      .map((v) => [v.codigo, v.dia, v.valorCentavos, v.saldoCentavos, v.situacao === 'aberto' ? 'Em aberto' : 'Usado', v.cliente?.nome ?? null, formatarNumeroVenda(v.origem.vendaNumero), v.por.nome]),
  };
}

// ------------------------------------------------------------------ financeiro
export function planilhaLancamentos(lancamentos: readonly Lancamento[], nomes: NomesDasContas, fuso: string): Planilha {
  const ordem = [...lancamentos].sort((a, b) => diaDoLancamento(a, fuso).localeCompare(diaDoLancamento(b, fuso)) || a.criadoEm.localeCompare(b.criadoEm));
  return {
    nome: 'Lançamentos',
    colunas: [
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Hora' },
      { titulo: 'Conta' },
      { titulo: 'Lançamento' },
      { titulo: 'Descrição' },
      { titulo: 'Categoria' },
      { titulo: 'Venda' },
      { titulo: 'Quem' },
      { titulo: 'Entrada', tipo: 'dinheiro' },
      { titulo: 'Saída', tipo: 'dinheiro' },
    ],
    linhas: ordem.map((l) => [
      diaDoLancamento(l, fuso),
      hora(l.criadoEm, fuso),
      nomes[l.conta],
      NOME_LANCAMENTO[l.tipo],
      l.descricao || null,
      l.categoria,
      l.vendaNumero ? formatarNumeroVenda(l.vendaNumero) : null,
      l.por.nome,
      l.valorCentavos >= 0 ? l.valorCentavos : null,
      l.valorCentavos < 0 ? -l.valorCentavos : null,
    ]),
  };
}

const SITUACAO_RECEBIVEL: Record<Recebivel['situacao'], string> = { pendente: 'A receber', recebido: 'Recebido', cancelado: 'Cancelado' };

export function planilhaAReceber(recebiveis: readonly Recebivel[], nomes: NomesDasContas, fuso: string): Planilha {
  return {
    nome: 'A receber',
    colunas: [
      { titulo: 'Venda' },
      { titulo: 'Data da venda', tipo: 'data' },
      { titulo: 'Forma' },
      { titulo: 'Cliente' },
      { titulo: 'Bruto', tipo: 'dinheiro' },
      { titulo: 'Taxa', tipo: 'dinheiro' },
      { titulo: 'A receber (líquido)', tipo: 'dinheiro' },
      { titulo: 'Vence em', tipo: 'data' },
      { titulo: 'Situação' },
      { titulo: 'Recebido em', tipo: 'data' },
      { titulo: 'Conta' },
    ],
    linhas: recebiveis.map((r) => [
      formatarNumeroVenda(r.vendaNumero),
      diaNoFuso(r.criadoEm, fuso),
      NOME_FORMA_PAGAMENTO[r.forma],
      r.cliente?.nome ?? null,
      r.brutoCentavos - r.estornadoBrutoCentavos,
      r.taxaCentavos - r.estornadoTaxaCentavos,
      r.situacao === 'pendente' ? liquidoAReceber(r) : null,
      r.venceEm,
      SITUACAO_RECEBIVEL[r.situacao],
      r.recebimento ? diaNoFuso(r.recebimento.em, fuso) : null,
      r.recebimento?.conta ? nomes[r.recebimento.conta] : null,
    ]),
  };
}

export function planilhaAPagar(contas: readonly ContaPagar[], nomes: NomesDasContas, fuso: string): Planilha {
  const SITUACAO = { aberta: 'Em aberto', paga: 'Paga', cancelada: 'Cancelada' } as const;
  return {
    nome: 'A pagar',
    colunas: [
      { titulo: 'Conta' },
      { titulo: 'Origem' },
      { titulo: 'Categoria' },
      { titulo: 'Vencimento', tipo: 'data' },
      { titulo: 'Valor', tipo: 'dinheiro' },
      { titulo: 'Situação' },
      { titulo: 'Paga em', tipo: 'data' },
      { titulo: 'Saiu de' },
    ],
    linhas: contas.map((c) => [
      c.descricao,
      c.compraId ? 'Compra a prazo' : 'Conta avulsa',
      c.categoria ?? null,
      c.vencimento,
      c.situacao === 'cancelada' ? c.valorOriginalCentavos : c.valorCentavos,
      SITUACAO[c.situacao],
      c.pagamento ? diaNoFuso(c.pagamento.em, fuso) : null,
      c.pagamento ? nomes[c.pagamento.conta] : null,
    ]),
  };
}

// ------------------------------------------------------------------ caixa do dia
export function planilhaCaixas(caixas: readonly CaixaDoDia[], p: Periodo, fuso: string): Planilha {
  return {
    nome: 'Caixa do dia',
    colunas: [
      { titulo: 'Dia', tipo: 'data' },
      { titulo: 'Abriu às' },
      { titulo: 'Abriu' },
      { titulo: 'Fundo de troco', tipo: 'dinheiro' },
      { titulo: 'Fechou às' },
      { titulo: 'Fechou' },
      { titulo: 'Esperado', tipo: 'dinheiro' },
      { titulo: 'Contado', tipo: 'dinheiro' },
      { titulo: 'Diferença', tipo: 'dinheiro' },
      { titulo: 'Justificativa' },
      { titulo: 'Situação' },
    ],
    linhas: [...caixas]
      .filter((c) => noPeriodo(c.dia, p))
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((c) => {
        const f = c.fechamento;
        return [
          c.dia,
          hora(c.abertura.em, fuso),
          c.abertura.por.nome,
          c.abertura.fundoCentavos,
          f ? hora(f.em, fuso) : null,
          f ? (f.automatico ? 'Sistema (meia-noite)' : (f.por?.nome ?? null)) : null,
          f ? f.esperadoCentavos : null,
          f?.contadoCentavos ?? null,
          f?.diferencaCentavos ?? null,
          f?.justificativa ?? null,
          !f ? 'Aberto' : f.automatico ? (f.verificacao ? 'Fechado sozinho (verificado)' : 'Fechado sozinho (a verificar)') : 'Fechado',
        ];
      }),
  };
}

// ------------------------------------------------------------------ compras
export function planilhaCompras(compras: readonly Compra[], nomes: NomesDasContas): Planilha {
  return {
    nome: 'Compras',
    colunas: [
      { titulo: 'Compra', tipo: 'inteiro' },
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Nota fiscal' },
      { titulo: 'Fornecedor' },
      { titulo: 'Itens', tipo: 'inteiro' },
      { titulo: 'Total', tipo: 'dinheiro' },
      { titulo: 'Pagamento' },
      { titulo: 'Vencimento', tipo: 'data' },
      { titulo: 'Itens estornados', tipo: 'inteiro' },
      { titulo: 'Lançada por' },
    ],
    linhas: compras.map((c) => [
      c.numero,
      c.data,
      c.notaFiscal,
      c.fornecedor?.nome ?? null,
      c.itens.length,
      c.totalCentavos,
      c.pagamento.tipo === 'avista' ? `À vista • ${nomes[c.pagamento.conta]}` : 'A prazo',
      c.pagamento.tipo === 'aprazo' ? c.pagamento.vencimento : null,
      c.itens.filter((i) => i.estorno).length || null,
      c.por.nome,
    ]),
  };
}

export function planilhaItensComprados(compras: readonly Compra[]): Planilha {
  return {
    nome: 'Itens comprados',
    colunas: [
      { titulo: 'Compra', tipo: 'inteiro' },
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Fornecedor' },
      { titulo: 'Produto' },
      { titulo: 'Quantidade', tipo: 'numero' },
      { titulo: 'Unidade' },
      { titulo: 'Custo', tipo: 'dinheiro' },
      { titulo: 'Total', tipo: 'dinheiro' },
      { titulo: 'Validade', tipo: 'data' },
      { titulo: 'Estornado' },
    ],
    linhas: compras.flatMap((c) =>
      c.itens.map((i) => [c.numero, c.data, c.fornecedor?.nome ?? null, i.nome, naUnidade(i.quantidade, i.unidade), nomeUnidade(i.unidade), i.custoCentavos, i.totalCentavos, i.validade, i.estorno ? 'Sim' : null]),
    ),
  };
}

// ------------------------------------------------------------------ histórico (quem fez o quê)
export function planilhaHistorico(itens: readonly ItemAuditoria[], p: Periodo, fuso: string): Planilha {
  return {
    nome: 'Histórico',
    colunas: [{ titulo: 'Data', tipo: 'data' }, { titulo: 'Hora' }, { titulo: 'Quem' }, { titulo: 'O que' }, { titulo: 'Sobre' }, { titulo: 'Detalhe' }],
    linhas: [...itens]
      .filter((i) => noPeriodo(diaNoFuso(i.criadoEm, fuso), p))
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
      .map((i) => [diaNoFuso(i.criadoEm, fuso), hora(i.criadoEm, fuso), i.quem ?? 'Sistema', i.texto, i.alvo?.nome ?? null, i.resumo || null]),
  };
}

// ------------------------------------------------------------------ vendas antigas (módulo 13)
const NUMERO_VENDA_ANTIGA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** As vendas antigas, uma por linha. */
export function planilhaVendasAntigas(vendas: readonly VendaAntiga[]): Planilha {
  return {
    nome: 'Vendas antigas',
    colunas: [
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Número' },
      { titulo: 'Cliente' },
      { titulo: 'Itens' },
      { titulo: 'Forma de pagamento' },
      { titulo: 'Vendedor' },
      { titulo: 'Total', tipo: 'dinheiro' },
    ],
    linhas: vendas.map((v) => [
      v.dia,
      v.numeroAntigo,
      v.cliente,
      v.itens
        .filter((i) => i.produto)
        .map((i) => (i.quantidade !== null && i.quantidade !== 1 ? `${NUMERO_VENDA_ANTIGA.format(i.quantidade)} ${i.produto}` : i.produto))
        .join(', ') || null,
      v.pagamento,
      v.vendedor,
      v.totalCentavos,
    ]),
  };
}

/** Um item por linha, nas colunas do modelo de importação (dá para importar de volta em outra loja). */
export function planilhaItensVendasAntigas(vendas: readonly VendaAntiga[]): Planilha {
  return {
    nome: 'Itens das vendas antigas',
    colunas: [
      { titulo: 'Data', tipo: 'data' },
      { titulo: 'Número' },
      { titulo: 'Cliente' },
      { titulo: 'Produto' },
      { titulo: 'Quantidade', tipo: 'numero' },
      { titulo: 'Preço unitário', tipo: 'dinheiro' },
      { titulo: 'Total', tipo: 'dinheiro' },
      { titulo: 'Forma de pagamento' },
      { titulo: 'Vendedor' },
    ],
    linhas: vendas.flatMap((v) => v.itens.map((i): Celula[] => [v.dia, v.numeroAntigo, v.cliente, i.produto, i.quantidade, i.precoCentavos, i.totalCentavos, v.pagamento, v.vendedor])),
  };
}

// ------------------------------------------------------------------ exportar tudo
/** "Exportar tudo": um resumo e uma aba para cada assunto (as partes que o servidor ainda não tem ficam de fora). */
export function planilhasDeTudo(d: DadosDosRelatorios, p: Periodo, nomes: NomesDasContas, fuso: string, agora: Date): Planilha[] {
  const abas: Planilha[] = [];
  const vendas = d.vendas ?? [];
  const finalizadas = vendas.filter((v) => v.status === 'finalizada');
  const prods = linhasDeProdutos(vendas);
  const ind = indicadoresDeProdutos(prods, vendas, d.recebiveis);
  const devolvido = (d.devolucoes ?? []).reduce((s, x) => s + x.totalCentavos, 0);
  const total = finalizadas.reduce((s, v) => s + v.totalCentavos, 0);
  const entradas = (d.lancamentos ?? []).filter((l) => l.valorCentavos > 0).reduce((s, l) => s + l.valorCentavos, 0);
  const saidas = (d.lancamentos ?? []).filter((l) => l.valorCentavos < 0).reduce((s, l) => s - l.valorCentavos, 0);
  const periodoTexto = p.de || p.ate ? `${p.de ? p.de.split('-').reverse().join('/') : 'início'} a ${p.ate ? p.ate.split('-').reverse().join('/') : 'hoje'}` : 'todo o período';
  abas.push({
    nome: 'Resumo',
    colunas: [{ titulo: 'Indicador' }, { titulo: 'Valor', tipo: 'dinheiro' }, { titulo: 'Observação' }],
    linhas: [
      ['Período', null, periodoTexto],
      ['Gerado em', null, `${diaNoFuso(agora.toISOString(), fuso).split('-').reverse().join('/')} às ${hora(agora.toISOString(), fuso)}`],
      ['Total vendido', total, `${finalizadas.length} vendas finalizadas`],
      ['Devoluções', devolvido || null, `${(d.devolucoes ?? []).length} devoluções`],
      ['Vendas líquidas', total - devolvido, null],
      ['Ticket médio', finalizadas.length ? Math.round(total / finalizadas.length) : null, null],
      ['Custo das mercadorias', ind.custoCentavos, 'custo médio guardado em cada venda'],
      ['Taxas de cartão', ind.taxasCentavos || null, null],
      ['Cashback usado', ind.cashbackUsadoCentavos || null, null],
      ind.comCusto === 0
        ? ['Lucro estimado', null, 'sem custo registrado (registre as compras para ter o custo)']
        : ['Lucro estimado', ind.lucroCentavos, ind.semCusto ? `${ind.semCusto} produto(s) sem custo ficam de fora` : null],
      ['Entradas no financeiro', entradas || null, `${nomes.caixa} e ${nomes.banco}`],
      ['Saídas no financeiro', saidas || null, null],
    ],
  });
  if (d.vendas) abas.push(planilhaVendas(vendas, fuso), planilhaItensVendidos(vendas, fuso), planilhaPagamentos(vendas, fuso));
  if (d.devolucoes) abas.push(planilhaDevolucoes(d.devolucoes, fuso));
  if (d.vendas) abas.push(planilhaProdutos(prods));
  if (d.produtos && d.movimentos) {
    abas.push(planilhaEstoque(posicaoDeEstoque(d.produtos, d.estoque, d.movimentos, p, fuso)), planilhaMovimentos(d.movimentos, d.produtos, p, fuso));
  }
  if (d.clientes) abas.push(planilhaClientes(linhasDeClientes(d.clientes, vendas, d.fiado, fuso)));
  if (d.vales) abas.push(planilhaVales(d.vales, p));
  if (d.lancamentos) abas.push(planilhaLancamentos(d.lancamentos, nomes, fuso));
  if (d.recebiveis) abas.push(planilhaAReceber(d.recebiveis, nomes, fuso));
  if (d.contasPagar) abas.push(planilhaAPagar(d.contasPagar, nomes, fuso));
  if (d.caixas) abas.push(planilhaCaixas(d.caixas, p, fuso));
  if (d.compras) abas.push(planilhaCompras(d.compras, nomes), planilhaItensComprados(d.compras));
  if (d.auditoria) abas.push(planilhaHistorico(d.auditoria, p, fuso));
  const antigas = (d.vendasAntigas ?? []).filter((v) => noPeriodo(v.dia, p));
  if (antigas.length > 0) abas.push(planilhaVendasAntigas(antigas), planilhaItensVendasAntigas(antigas));
  return abas;
}

/** "relatorio-vendas-2026-11-01-a-2026-11-23.xlsx"; sem período: "relatorio-vendas-ate-2026-11-23.xlsx". */
export function nomeDoArquivo(assunto: string, p: Periodo, hoje: string): string {
  const base = assunto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `relatorio-${base}-${p.de ? `${p.de}-a-${p.ate ?? hoje}` : `ate-${p.ate ?? hoje}`}.xlsx`;
}
