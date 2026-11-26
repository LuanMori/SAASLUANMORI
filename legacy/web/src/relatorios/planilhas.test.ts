// apps/web/src/relatorios/planilhas.test.ts — os dados de cada aba dos Relatórios, com uma loja de verdade da
// demonstração: lucro estimado com o custo da hora da venda, posição de estoque no período, clientes e o "tudo".
import type { OperadorComPapel } from '@saas/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import {
  carregarRelatorios,
  indicadoresDeProdutos,
  linhasDeClientes,
  linhasDeProdutos,
  nomeDoArquivo,
  planilhaCaixas,
  planilhaClientes,
  planilhaHistorico,
  planilhaItensVendidos,
  planilhasDeTudo,
  planilhaVendas,
  posicaoDeEstoque,
  situacaoDoEstoque,
} from './planilhas';

beforeEach(() => localStorage.clear());

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const NOMES = { caixa: 'Caixa físico', banco: 'Banco Itaú' };

/** 20/11: compra (10 rações a R$ 60 e 5 kg a granel a R$ 12/kg) e venda de 2 rações no Pix; 21/11: 1,5 kg para a Maria
 * em dinheiro, 1 ração dela no fiado e a devolução de 1 ração da venda do dia 20. */
async function loja() {
  let relogio = new Date('2026-11-20T15:00:00Z');
  const api = comCaixaAberto(criarApiLocal({ lojaId: 'rel-pl', operador: ANA, exemplos: false, atrasoMs: 0, agora: () => relogio }));
  await api.definirSaldoInicial({ conta: 'banco', valorCentavos: 200000 });
  const racao = await api.criarProduto({ nome: 'Ração 3 kg', codigoBarras: null, precoCentavos: 10000 });
  const granel = await api.criarProduto({ nome: 'Ração a granel', codigoBarras: null, precoCentavos: 2000, unidade: 'kg' });
  await api.registrarCompra({
    data: '2026-11-20',
    itens: [
      { produtoId: racao.id, quantidade: 10, custoCentavos: 6000 },
      { produtoId: granel.id, quantidade: 5000, custoCentavos: 1200 },
    ],
    pagamento: { tipo: 'avista', conta: 'banco' },
  });
  const v1 = await api.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 20000 }] });
  relogio = new Date('2026-11-21T15:00:00Z');
  const maria = await api.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', limiteFiadoCentavos: 100000 });
  await api.criarVenda({ itens: [{ produtoId: granel.id, quantidade: 1500 }], pagamentos: [{ forma: 'dinheiro', valorCentavos: 3000 }], clienteId: maria.id, recebidoDinheiroCentavos: 3000 });
  await api.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 10000 }], clienteId: maria.id });
  await api.devolverItens(v1.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'trocou de ideia' });
  return { api, racao, granel, maria, mudar: (iso: string) => (relogio = new Date(iso)) };
}

describe('produtos: mais vendidos e lucro estimado', () => {
  it('quantidade e vendas sem o devolvido; custo da hora da venda; lucro = vendas − custo − taxas − cashback', async () => {
    const { api } = await loja();
    const d = await carregarRelatorios(api, { de: '2026-11-20', ate: '2026-11-21' });
    const linhas = linhasDeProdutos(d.vendas!);
    expect(linhas.map((l) => [l.nome, l.quantidade, l.vendasCentavos, l.custoCentavos])).toEqual([
      ['Ração 3 kg', 2, 20000, 12000], // 2 + 1 − 1 devolvida
      ['Ração a granel', 1500, 3000, 1800], // 1,5 kg × R$ 12,00
    ]);
    expect(indicadoresDeProdutos(linhas, d.vendas!, d.recebiveis)).toEqual({
      vendasCentavos: 23000,
      custoCentavos: 13800,
      lucroCentavos: 9200,
      semCustoCentavos: 0,
      semCusto: 0,
      comCusto: 2,
      taxasCentavos: 0,
      cashbackUsadoCentavos: 0,
    });
    const itens = planilhaItensVendidos(d.vendas!, FUSO);
    const primeira = itens.linhas.find((l) => l[0] === '#00001')!;
    expect([primeira[5], primeira[11], primeira[12], primeira[13]]).toEqual([2, 1, 6000, 4000]); // vendeu 2, devolveu 1: custo e lucro de 1
  });

  it('produto vendido sem custo fica fora do lucro (e é contado à parte)', async () => {
    const { api } = await loja();
    const brinde = await api.criarProduto({ nome: 'Bolinha', codigoBarras: null, precoCentavos: 500 });
    await api.lancarMovimentoEstoque({ produtoId: brinde.id, tipo: 'entrada', quantidade: 5, motivo: '' });
    await api.criarVenda({ itens: [{ produtoId: brinde.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 1000 }] });
    const d = await carregarRelatorios(api, { de: null, ate: null });
    const ind = indicadoresDeProdutos(linhasDeProdutos(d.vendas!), d.vendas!, d.recebiveis);
    expect([ind.semCusto, ind.semCustoCentavos, ind.lucroCentavos]).toEqual([1, 1000, 9200]);
    // loja sem custo nenhum: o resumo do Excel não inventa lucro
    const soBrinde = d.vendas!.filter((v) => v.itens.every((i) => i.produtoId === brinde.id));
    const semNada = indicadoresDeProdutos(linhasDeProdutos(soBrinde), soBrinde, d.recebiveis);
    expect([semNada.comCusto, semNada.semCusto]).toEqual([0, 1]);
    const resumo = planilhasDeTudo({ ...d, vendas: soBrinde }, { de: null, ate: null }, NOMES, FUSO, new Date())[0]!;
    expect(resumo.linhas.find((l) => l[0] === 'Lucro estimado')).toEqual(['Lucro estimado', null, 'sem custo registrado (registre as compras para ter o custo)']);
  });
});

describe('estoque no período', () => {
  it('no início, entradas, vendido, devolvido e no fim; situação pelo mínimo', async () => {
    const { api, racao } = await loja();
    await api.definirEstoqueMinimo(racao.id, 8);
    const d = await carregarRelatorios(api, { de: '2026-11-21', ate: '2026-11-21' });
    const pos = posicaoDeEstoque(d.produtos!, d.estoque, d.movimentos!, { de: '2026-11-21', ate: '2026-11-21' }, FUSO);
    const r = pos.find((x) => x.produto.id === racao.id)!;
    expect([r.inicio, r.entradas, r.vendido, r.devolvido, r.fim, r.minimo]).toEqual([8, 0, 1, 1, 8, 8]); // 10 − 2 no dia 20
    expect(situacaoDoEstoque(r)).toBe('Baixo');
    const todo = posicaoDeEstoque(d.produtos!, d.estoque, d.movimentos!, { de: null, ate: null }, FUSO).find((x) => x.produto.id === racao.id)!;
    expect([todo.inicio, todo.entradas, todo.vendido, todo.devolvido, todo.fim]).toEqual([0, 10, 3, 1, 8]);
  });
});

describe('clientes', () => {
  it('compras e total no período (sem o devolvido), última compra e fiado; o CPF sai mascarado', async () => {
    const { api } = await loja();
    const d = await carregarRelatorios(api, { de: '2026-11-21', ate: '2026-11-21' });
    const [maria] = linhasDeClientes(d.clientes!, d.vendas!, d.fiado, FUSO);
    expect([maria!.compras, maria!.totalCentavos, maria!.ultimaCompra, maria!.fiado?.devendoCentavos]).toEqual([2, 13000, '2026-11-21', 10000]);
    const linha = planilhaClientes([maria!]).linhas[0]!;
    expect(linha[0]).toBe('Maria Souza');
    expect(String(linha[2])).not.toContain('52998224725');
    expect(String(linha[2])).toMatch(/\*/);
  });
});

describe('vendas, caixa, histórico e exportar tudo', () => {
  it('vendas com situação e devolvido; caixa de cada dia; histórico no período', async () => {
    const { api } = await loja();
    const d = await carregarRelatorios(api, { de: null, ate: null });
    const vendas = planilhaVendas(d.vendas!, FUSO);
    expect(vendas.linhas.map((l) => [l[0], l[3], l[8], l[9]])).toEqual([
      ['#00003', 'Finalizada', 10000, null],
      ['#00002', 'Finalizada', 3000, null],
      ['#00001', 'Com devolução', 20000, 10000],
    ]);
    const caixas = planilhaCaixas(d.caixas!, { de: null, ate: null }, FUSO);
    expect(caixas.linhas.map((l) => [l[0], l[10]])).toEqual([
      ['2026-11-20', 'Fechado sozinho (a verificar)'],
      ['2026-11-21', 'Aberto'],
    ]);
    const hist = planilhaHistorico(d.auditoria!, { de: '2026-11-21', ate: '2026-11-21' }, FUSO);
    expect(hist.linhas.length).toBeGreaterThan(0);
    expect(hist.linhas.every((l) => l[0] === '2026-11-21')).toBe(true);
  });

  it('"Exportar tudo": um resumo e uma aba para cada assunto; o nome do arquivo diz o período', async () => {
    const { api } = await loja();
    const d = await carregarRelatorios(api, { de: '2026-11-20', ate: '2026-11-21' });
    const abas = planilhasDeTudo(d, { de: '2026-11-20', ate: '2026-11-21' }, NOMES, FUSO, new Date('2026-11-21T18:00:00Z'));
    expect(abas.map((a) => a.nome)).toEqual([
      'Resumo',
      'Vendas',
      'Itens vendidos',
      'Pagamentos',
      'Devoluções',
      'Produtos vendidos',
      'Posição de estoque',
      'Movimentos de estoque',
      'Clientes',
      'Vales-troca',
      'Lançamentos',
      'A receber',
      'A pagar',
      'Caixa do dia',
      'Compras',
      'Itens comprados',
      'Histórico',
    ]);
    const resumo = new Map(abas[0]!.linhas.map((l) => [l[0], l[1]]));
    expect([resumo.get('Total vendido'), resumo.get('Devoluções'), resumo.get('Vendas líquidas'), resumo.get('Lucro estimado')]).toEqual([33000, 10000, 23000, 9200]);
    expect(abas[0]!.linhas[0]).toEqual(['Período', null, '20/11/2026 a 21/11/2026']);
    // o banco com o nome da loja nos lançamentos
    expect(abas.find((a) => a.nome === 'Lançamentos')!.linhas.some((l) => l[2] === 'Banco Itaú')).toBe(true);
    expect(nomeDoArquivo('Caixa do dia', { de: '2026-11-01', ate: '2026-11-23' }, '2026-11-23')).toBe('relatorio-caixa-do-dia-2026-11-01-a-2026-11-23.xlsx');
    expect(nomeDoArquivo('Tudo', { de: null, ate: null }, '2026-11-23')).toBe('relatorio-tudo-ate-2026-11-23.xlsx');
    expect(nomeDoArquivo('Histórico', { de: '2026-11-01', ate: null }, '2026-11-23')).toBe('relatorio-historico-2026-11-01-a-2026-11-23.xlsx');
  });

  it('parte que o servidor ainda não tem fica de fora, sem travar o resto', async () => {
    const { api } = await loja();
    const semCaixa = { ...api, lerCaixa: () => Promise.reject(new Error('501')), listarAuditoria: () => Promise.reject(new Error('501')) };
    const d = await carregarRelatorios(semCaixa, { de: null, ate: null });
    expect([d.caixas, d.auditoria, d.vendas?.length]).toEqual([null, null, 3]);
    const abas = planilhasDeTudo(d, { de: null, ate: null }, NOMES, FUSO, new Date());
    expect(abas.some((a) => a.nome === 'Caixa do dia' || a.nome === 'Histórico')).toBe(false);
  });
});
