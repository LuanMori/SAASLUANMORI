// apps/web/src/painel/TelaRelatorios.test.tsx
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaRelatorios } from './TelaRelatorios';

/** formatarCentavos usa espaço não separável depois de "R$"; nos testes comparamos com espaço comum. */
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';

async function preparar() {
  let relogio = new Date();
  const agora = () => relogio;
  // abre o caixa do dia sozinha antes de vender (o próprio caixa tem os testes dele)
  const ana = comCaixaAberto(criarApiLocal({ lojaId: 'r', operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0, agora }));
  const bruno = comCaixaAberto(criarApiLocal({ lojaId: 'r', operador: { id: 'bruno', nome: 'Bruno', papel: 'vendedor' }, exemplos: false, atrasoMs: 0, agora }));
  const p = await ana.criarProduto({ nome: 'Coleira M', codigoBarras: null, precoCentavos: 2990 });
  await darEstoque('r', 50); // produto novo começa sem estoque
  relogio = new Date('2026-10-20T15:00:00Z');
  await ana.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 2990 }] });
  relogio = new Date('2026-11-11T18:00:00Z');
  await bruno.criarVenda({ itens: [{ produtoId: p.id, quantidade: 2 }], pagamentos: [{ forma: 'dinheiro', valorCentavos: 5980 }], recebidoDinheiroCentavos: 6000 });
  relogio = new Date('2026-11-12T13:00:00Z');
  await ana.criarVenda({ itens: [{ produtoId: p.id, quantidade: 3 }], pagamentos: [{ forma: 'credito', valorCentavos: 8970 }] });
  relogio = new Date('2026-11-12T15:00:00Z');
  return { api: ana, agora };
}

/** A tela abre na aba Tudo (pedido do Luan, 25/11/2026); estes testes são da aba Vendas. */
async function abrirEmVendas(api: Parameters<typeof TelaRelatorios>[0]['api'], agora: () => Date) {
  render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} />);
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Assuntos dos relatórios' })).getByRole('button', { name: 'Vendas' }));
}

const linhas = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((l) => [txt((l as HTMLTableRowElement).cells[0]?.textContent), txt((l as HTMLTableRowElement).cells[3]?.textContent), txt((l as HTMLTableRowElement).cells[7]?.textContent)]);

describe('TelaRelatorios', () => {
  it('mostra TODAS as vendas, de todos os dias, com quem vendeu', async () => {
    const { api, agora } = await preparar();
    await abrirEmVendas(api, agora);
    await screen.findByRole('table');
    expect(linhas()).toEqual([
      ['12/11/2026', 'Ana', 'R$ 89,70'],
      ['11/11/2026', 'Bruno', 'R$ 59,80'],
      ['20/10/2026', 'Ana', 'R$ 29,90'],
    ]);
    expect(txt(screen.getByText('Total vendido').nextElementSibling?.textContent)).toBe('R$ 179,40');
  });

  it('filtra por quem vendeu e por forma de pagamento', async () => {
    const { api, agora } = await preparar();
    await abrirEmVendas(api, agora);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Vendido por'), 'Bruno');
    expect(linhas()).toEqual([['11/11/2026', 'Bruno', 'R$ 59,80']]);
    await userEvent.selectOptions(screen.getByLabelText('Vendido por'), 'Todos');
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Pix');
    expect(linhas()).toEqual([['20/10/2026', 'Ana', 'R$ 29,90']]);
  });

  it('atalhos de período: Hoje, Ontem e Este mês', async () => {
    const { api, agora } = await preparar();
    await abrirEmVendas(api, agora);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    await waitFor(() => expect(linhas()).toEqual([['12/11/2026', 'Ana', 'R$ 89,70']]));
    await userEvent.click(screen.getByRole('button', { name: 'Ontem' }));
    await waitFor(() => expect(linhas()).toEqual([['11/11/2026', 'Bruno', 'R$ 59,80']]));
    await userEvent.click(screen.getByRole('button', { name: 'Este mês' }));
    await waitFor(() => expect(linhas()).toHaveLength(2));
    expect((screen.getByLabelText('De') as HTMLInputElement).value).toBe('2026-11-01');
    expect(screen.getByRole('button', { name: 'Este mês' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('itens de cada venda abrem no "N itens"', async () => {
    const { api, agora } = await preparar();
    await abrirEmVendas(api, agora);
    await screen.findByRole('table');
    expect(screen.getByText('3× Coleira M', { exact: false }).closest('details')).toBeTruthy();
  });
});

describe('TelaRelatorios · canceladas, devoluções e pagamento dividido', () => {
  it('cancelada aparece riscada com a etiqueta e fica fora dos totais', async () => {
    const { api, agora } = await preparar();
    const deHoje = (await api.listarVendas()).find((v) => v.numero === 3)!;
    await api.cancelarVenda(deHoje.id, { motivo: 'errou o produto' });
    await abrirEmVendas(api, agora);
    await screen.findByRole('table');
    await waitFor(() => expect(txt(screen.getByText('Total vendido').nextElementSibling?.textContent)).toBe('R$ 89,70'));
    const linha = screen.getByText('#00003').closest('tr')!;
    expect(within(linha).getByText('cancelada')).toBeTruthy();
    expect(linha.className).toBe('rel-cancelada');
    expect(screen.getByTestId('rel-extra').textContent).toBe('1 venda cancelada (fora dos totais)');
  });

  it('filtro por forma acha a venda com pagamento dividido nas duas formas; devolução aparece no resumo', async () => {
    const { api, agora } = await preparar();
    const p = (await api.listarProdutos())[0]!;
    const dividida = await api.criarVenda({
      itens: [{ produtoId: p.id, quantidade: 1 }],
      pagamentos: [
        { forma: 'dinheiro', valorCentavos: 1000 },
        { forma: 'pix', valorCentavos: 1990 },
      ],
      recebidoDinheiroCentavos: 1000,
    });
    await api.devolverItens(dividida.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca de tamanho' });
    await abrirEmVendas(api, agora);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Pix');
    await waitFor(() => expect(linhas().map((l) => l[0])).toEqual(['12/11/2026', '20/10/2026']));
    expect(txt(screen.getByText('#00004').closest('tr')!.textContent)).toMatch(/Dinheiro R\$ 10,00 \+ Pix R\$ 19,90/);
    expect(txt(screen.getByText('#00004').closest('tr')!.textContent)).toMatch(/com devolução/);
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Dinheiro');
    expect(linhas()).toHaveLength(2);
    expect(txt(screen.getByTestId('rel-extra').textContent)).toBe('Devoluções no período: R$ 29,90 (1 devolução) · Vendas líquidas (total vendido menos devoluções): R$ 59,80');
    // os filtros valem também para as devoluções e para as taxas: a venda devolvida foi da Ana, sem cartão
    await userEvent.selectOptions(screen.getByLabelText('Vendido por'), 'Bruno');
    expect(screen.queryByTestId('rel-extra')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Vendido por'), 'Todos');
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Cartão de crédito');
    await waitFor(() => expect(txt(screen.getByTestId('rel-extra').textContent)).toBe('Taxas de cartão: R$ 2,69'));
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Pix');
    expect(txt(screen.getByTestId('rel-extra').textContent)).not.toMatch(/Taxas/);
  });
});

describe('TelaRelatorios · cliente e taxas', () => {
  it('coluna e filtro de cliente (com "Sem cliente identificado"); taxas de cartão do período no resumo', async () => {
    const { api, agora } = await preparar();
    const [produto] = await api.listarProdutos();
    const maria = await api.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    await api.criarVenda({ itens: [{ produtoId: produto!.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 2990 }], clienteId: maria.id });
    await abrirEmVendas(api, agora);
    await screen.findByRole('table');
    const clientes = () =>
      within(screen.getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((l) => txt((l as HTMLTableRowElement).cells[4]?.textContent));
    expect(clientes()).toEqual(['Maria Souza', '—', '—', '—']);
    await userEvent.selectOptions(screen.getByLabelText('Cliente'), 'Maria Souza');
    expect(clientes()).toEqual(['Maria Souza']);
    await userEvent.selectOptions(screen.getByLabelText('Cliente'), 'Sem cliente identificado');
    expect(clientes()).toEqual(['—', '—', '—']);
    // crédito de R$ 89,70 com a taxa padrão de 3%
    await waitFor(() => expect(txt(screen.getByTestId('rel-extra').textContent)).toMatch(/Taxas de cartão: R\$ 2,69/));
  });
});
