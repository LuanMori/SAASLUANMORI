// apps/web/src/relatorios/visoes.ts
// As BASES das visões sob medida (Adm. Sup, módulo 13g): cada uma é uma das tabelas que os Relatórios já mostram e
// exportam, montada com os dados do período escolhido. A visão (@saas/core visoes.ts) filtra, agrupa, ordena e escolhe
// as colunas dessa tabela; o resultado é uma `Planilha` como as outras (tela e Excel).
import { aplicarVisao, type BaseDaVisao, type DefinicaoDaVisao, type NomesDasContas, NOME_CONTA } from '@saas/core';
import {
  type DadosDosRelatorios,
  linhasDeClientes,
  linhasDeProdutos,
  noPeriodo,
  type Periodo,
  planilhaAPagar,
  planilhaAReceber,
  planilhaCaixas,
  planilhaClientes,
  planilhaCompras,
  planilhaDevolucoes,
  planilhaEstoque,
  planilhaHistorico,
  planilhaItensComprados,
  planilhaItensVendasAntigas,
  planilhaItensVendidos,
  planilhaLancamentos,
  planilhaMovimentos,
  planilhaPagamentos,
  planilhaProdutos,
  planilhaVales,
  planilhaVendas,
  planilhaVendasAntigas,
  posicaoDeEstoque,
} from './planilhas';
import type { Coluna, Planilha } from './xlsx';

type Montar = (d: DadosDosRelatorios, p: Periodo, nomes: NomesDasContas, fuso: string) => Planilha | null;

/** Como cada base é montada; null = a loja não tem essa parte (servidor sem ela ou sem permissão). */
const MONTAR_BASE: Record<BaseDaVisao, Montar> = {
  vendas: (d, _p, _n, fuso) => (d.vendas ? planilhaVendas(d.vendas, fuso) : null),
  itensVendidos: (d, _p, _n, fuso) => (d.vendas ? planilhaItensVendidos(d.vendas, fuso) : null),
  pagamentos: (d, _p, _n, fuso) => (d.vendas ? planilhaPagamentos(d.vendas, fuso) : null),
  devolucoes: (d, _p, _n, fuso) => (d.devolucoes ? planilhaDevolucoes(d.devolucoes, fuso) : null),
  produtos: (d) => (d.vendas ? planilhaProdutos(linhasDeProdutos(d.vendas)) : null),
  estoque: (d, p, _n, fuso) => (d.produtos && d.movimentos ? planilhaEstoque(posicaoDeEstoque(d.produtos, d.estoque, d.movimentos, p, fuso)) : null),
  movimentos: (d, p, _n, fuso) => (d.produtos && d.movimentos ? planilhaMovimentos(d.movimentos, d.produtos, p, fuso) : null),
  clientes: (d, _p, _n, fuso) => (d.clientes ? planilhaClientes(linhasDeClientes(d.clientes, d.vendas ?? [], d.fiado, fuso)) : null),
  vales: (d, p) => (d.vales ? planilhaVales(d.vales, p) : null),
  lancamentos: (d, _p, nomes, fuso) => (d.lancamentos ? planilhaLancamentos(d.lancamentos, nomes, fuso) : null),
  aReceber: (d, _p, nomes, fuso) => (d.recebiveis ? planilhaAReceber(d.recebiveis, nomes, fuso) : null),
  aPagar: (d, _p, nomes, fuso) => (d.contasPagar ? planilhaAPagar(d.contasPagar, nomes, fuso) : null),
  caixas: (d, p, _n, fuso) => (d.caixas ? planilhaCaixas(d.caixas, p, fuso) : null),
  compras: (d, _p, nomes) => (d.compras ? planilhaCompras(d.compras, nomes) : null),
  itensComprados: (d) => (d.compras ? planilhaItensComprados(d.compras) : null),
  historico: (d, p, _n, fuso) => (d.auditoria ? planilhaHistorico(d.auditoria, p, fuso) : null),
  vendasAntigas: (d, p) => (d.vendasAntigas ? planilhaVendasAntigas(d.vendasAntigas.filter((v) => noPeriodo(v.dia, p))) : null),
  itensVendasAntigas: (d, p) => (d.vendasAntigas ? planilhaItensVendasAntigas(d.vendasAntigas.filter((v) => noPeriodo(v.dia, p))) : null),
};

/** Sem nenhum registro: para saber as colunas de cada base sem ler os dados da loja. */
const SEM_DADOS: DadosDosRelatorios = {
  vendas: [],
  devolucoes: [],
  recebiveis: [],
  produtos: [],
  estoque: [],
  movimentos: [],
  clientes: [],
  fiado: [],
  vales: [],
  lancamentos: [],
  contasPagar: [],
  caixas: [],
  compras: [],
  auditoria: [],
  vendasAntigas: [],
};
const TODO_O_PERIODO: Periodo = { de: null, ate: null };

/** A tabela da base, com os dados do período (null = a loja não tem essa parte). */
export const planilhaDaBase = (base: BaseDaVisao, d: DadosDosRelatorios, p: Periodo, nomes: NomesDasContas, fuso: string): Planilha | null => MONTAR_BASE[base](d, p, nomes, fuso);

/** As colunas de cada base (o formulário do Adm. Sup oferece estas). */
export const colunasDaBase = (base: BaseDaVisao, fuso: string): Coluna[] => MONTAR_BASE[base](SEM_DADOS, TODO_O_PERIODO, NOME_CONTA, fuso)?.colunas ?? [];

/**
 * A visão montada com os dados do período: a tabela (com o nome da visão, para a aba do Excel) e os avisos do que
 * ficou de fora. null = a loja não tem a parte da base.
 */
export function planilhaDaVisao(
  visao: DefinicaoDaVisao,
  d: DadosDosRelatorios,
  p: Periodo,
  nomes: NomesDasContas,
  fuso: string,
): { planilha: Planilha; avisos: string[] } | null {
  const base = planilhaDaBase(visao.base, d, p, nomes, fuso);
  if (!base) return null;
  const r = aplicarVisao(base, visao);
  return { planilha: { nome: visao.nome, colunas: r.tabela.colunas, linhas: r.tabela.linhas }, avisos: r.avisos };
}
