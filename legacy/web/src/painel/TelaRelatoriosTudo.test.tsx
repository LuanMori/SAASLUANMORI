// apps/web/src/painel/TelaRelatoriosTudo.test.tsx — aba "Tudo" dos Relatórios (pedido do Luan, 25/11/2026): o resumo de
// cada assunto no período, com os MESMOS números de cada aba (sem os filtros dela), e o ícone do Excel nos botões.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import type { DadosDosRelatorios } from '../relatorios/planilhas';
import { comCaixaAberto } from '../testes/caixa';
import { AbaTudo } from './relatorios/AbaTudo';
import { TelaRelatorios } from './TelaRelatorios';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

async function loja() {
  let relogio = new Date('2026-11-20T15:00:00Z');
  const api = comCaixaAberto(criarApiLocal({ lojaId: 'rel-tudo', operador: ANA, exemplos: false, atrasoMs: 0, agora: () => relogio }));
  await api.definirSaldoInicial({ conta: 'banco', valorCentavos: 200000 });
  const racao = await api.criarProduto({ nome: 'Ração 3 kg', codigoBarras: null, precoCentavos: 10000 });
  await api.registrarCompra({ data: '2026-11-20', itens: [{ produtoId: racao.id, quantidade: 10, custoCentavos: 6000 }], pagamento: { tipo: 'avista', conta: 'banco' } });
  await api.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 20000 }] });
  relogio = new Date('2026-11-21T15:00:00Z');
  const maria = await api.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', limiteFiadoCentavos: 100000 });
  await api.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 10000 }], clienteId: maria.id });
  return { api, agora: () => relogio };
}

const abas = () => screen.getByRole('navigation', { name: 'Assuntos dos relatórios' });
const irPara = (nome: string) => userEvent.click(within(abas()).getByRole('button', { name: nome }));

/** Os números de um assunto na aba Tudo: rótulo → valor. */
function numerosDoTudo(assunto: string): Record<string, string> {
  const secao = screen.getByRole('region', { name: assunto });
  return Object.fromEntries([...secao.querySelectorAll('.rel-tudo-numero')].map((n) => [txt(n.querySelector('span')?.textContent), txt(n.querySelector('strong')?.textContent)]));
}
/** Os cartões do topo de uma aba: rótulo → valor. */
function cartoesDaAba(regiao: string): Record<string, string> {
  const secao = screen.getByRole('region', { name: regiao });
  return Object.fromEntries([...secao.querySelectorAll('.rel-cartao')].map((n) => [txt(n.querySelector('span')?.textContent), txt(n.querySelector('strong')?.textContent)]));
}

describe('Relatórios: aba Tudo', () => {
  it('abre primeiro, com um cartão para cada assunto', async () => {
    const { api, agora } = await loja();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    expect(within(abas()).getByRole('button', { name: 'Tudo' }).getAttribute('aria-current')).toBe('page');
    await screen.findByRole('region', { name: 'Vendas' });
    for (const assunto of ['Vendas', 'Produtos', 'Estoque', 'Clientes', 'Financeiro', 'Caixa', 'Compras', 'Histórico']) {
      expect(screen.getByRole('region', { name: assunto })).toBeTruthy();
      expect(screen.getByRole('button', { name: `Ver detalhes de ${assunto}` })).toBeTruthy();
    }
    expect(numerosDoTudo('Vendas')).toMatchObject({ 'Total vendido': 'R$ 300,00', Vendas: '2', 'Ticket médio': 'R$ 150,00' });
    expect(numerosDoTudo('Produtos')).toMatchObject({ 'Mais vendido': 'Ração 3 kg', 'Custo das mercadorias': 'R$ 180,00', 'Lucro estimado': 'R$ 120,00' });
    expect(numerosDoTudo('Estoque')).toMatchObject({ 'Produtos ativos': '1', 'Valor em estoque': 'R$ 420,00' });
    expect(numerosDoTudo('Clientes')).toMatchObject({ 'Clientes ativos': '1', 'Compraram no período': '1', 'Fiado em aberto': 'R$ 100,00' });
    expect(numerosDoTudo('Compras')).toMatchObject({ Compras: '1', 'Total comprado': 'R$ 600,00' });
  });

  it('os números são os mesmos de cada aba; "Ver detalhes" abre a aba do assunto', async () => {
    const { api, agora } = await loja();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    await screen.findByRole('region', { name: 'Vendas' });
    const regiaoDaAba: Record<string, string> = {
      Vendas: 'Resumo do período',
      Produtos: 'Resumo dos produtos',
      Estoque: 'Resumo do estoque',
      Clientes: 'Resumo dos clientes',
      Financeiro: 'Resumo do financeiro',
      Caixa: 'Resumo do caixa',
      Compras: 'Resumo das compras',
      Histórico: 'Resumo do histórico',
    };
    for (const [assunto, regiao] of Object.entries(regiaoDaAba)) {
      const doTudo = numerosDoTudo(assunto);
      await userEvent.click(screen.getByRole('button', { name: `Ver detalhes de ${assunto}` }));
      expect(within(abas()).getByRole('button', { name: assunto }).getAttribute('aria-current')).toBe('page');
      await screen.findByRole('region', { name: regiao });
      await waitFor(() => {
        const daAba = cartoesDaAba(regiao);
        const comuns = Object.keys(doTudo).filter((r) => r in daAba);
        expect(comuns.length).toBeGreaterThanOrEqual(2);
        for (const r of comuns) expect({ [r]: doTudo[r] }).toEqual({ [r]: daAba[r] });
      });
      await irPara('Tudo');
      await screen.findByRole('region', { name: 'Vendas' });
    }
  });

  it('o período do topo vale para o Tudo', async () => {
    const { api, agora } = await loja();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    await screen.findByRole('region', { name: 'Vendas' });
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    await waitFor(() => expect(numerosDoTudo('Vendas')).toMatchObject({ 'Total vendido': 'R$ 100,00', Vendas: '1' }));
    expect(numerosDoTudo('Compras')).toMatchObject({ Compras: '0' });
  });

  it('parte que o sistema da loja ainda não tem: o cartão avisa e o resto continua', () => {
    const vazio: DadosDosRelatorios = {
      vendas: [], devolucoes: [], recebiveis: [], produtos: null, estoque: null, movimentos: null, clientes: [], fiado: [], vales: [],
      lancamentos: null, contasPagar: null, caixas: [], compras: [], auditoria: [],
    };
    render(<AbaTudo dados={vazio} periodo={{ de: null, ate: null }} fuso={FUSO} aoVer={vi.fn()} />);
    expect(within(screen.getByRole('region', { name: 'Estoque' })).getByText('Esta parte ainda não está disponível no sistema da loja.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Financeiro' })).getByText('Esta parte ainda não está disponível no sistema da loja.')).toBeTruthy();
    expect(numerosDoTudo('Vendas')).toMatchObject({ 'Total vendido': 'R$ 0,00', Vendas: '0' });
    expect(numerosDoTudo('Produtos')).toMatchObject({ 'Mais vendido': '—', 'Lucro estimado': '—' });
    expect(numerosDoTudo('Histórico')).toMatchObject({ 'Último registro': '—' });
    // sem faltas: "R$ 0,00", sem o "-" do zero negativo
    expect(numerosDoTudo('Caixa')).toMatchObject({ Faltas: 'R$ 0,00', Sobras: 'R$ 0,00' });
  });

  it('"Exportar tudo" e "Exportar esta aba" levam o ícone do Excel', async () => {
    const { api, agora } = await loja();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Exportar tudo (Excel)' }).querySelector('svg.icone-excel')).toBeTruthy();
    await irPara('Compras');
    await screen.findByRole('region', { name: 'Resumo das compras' });
    expect(screen.getByRole('button', { name: 'Exportar esta aba (Excel)' }).querySelector('svg.icone-excel')).toBeTruthy();
  });
});
