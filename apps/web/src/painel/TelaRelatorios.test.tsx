// apps/web/src/painel/TelaRelatorios.test.tsx
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { TelaRelatorios } from './TelaRelatorios';

/** formatarCentavos usa espaço não separável depois de "R$"; nos testes comparamos com espaço comum. */
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';

async function preparar() {
  let relogio = new Date();
  const agora = () => relogio;
  const ana = criarApiLocal({ lojaId: 'r', operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0, agora });
  const bruno = criarApiLocal({ lojaId: 'r', operador: { id: 'bruno', nome: 'Bruno', papel: 'vendedor' }, exemplos: false, atrasoMs: 0, agora });
  const p = await ana.criarProduto({ nome: 'Coleira M', codigoBarras: null, precoCentavos: 2990 });
  relogio = new Date('2026-10-20T15:00:00Z');
  await ana.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 2990 }] });
  relogio = new Date('2026-11-11T18:00:00Z');
  await bruno.criarVenda({ itens: [{ produtoId: p.id, quantidade: 2 }], pagamentos: [{ forma: 'dinheiro', valorCentavos: 5980 }], recebidoDinheiroCentavos: 6000 });
  relogio = new Date('2026-11-12T13:00:00Z');
  await ana.criarVenda({ itens: [{ produtoId: p.id, quantidade: 3 }], pagamentos: [{ forma: 'credito', valorCentavos: 8970 }] });
  relogio = new Date('2026-11-12T15:00:00Z');
  return { api: ana, agora };
}

const linhas = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((l) => [txt((l as HTMLTableRowElement).cells[0]?.textContent), txt((l as HTMLTableRowElement).cells[3]?.textContent), txt((l as HTMLTableRowElement).cells[6]?.textContent)]);

describe('TelaRelatorios', () => {
  it('mostra TODAS as vendas, de todos os dias, com quem vendeu', async () => {
    const { api, agora } = await preparar();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} />);
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
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Vendido por'), 'Bruno');
    expect(linhas()).toEqual([['11/11/2026', 'Bruno', 'R$ 59,80']]);
    await userEvent.selectOptions(screen.getByLabelText('Vendido por'), 'Todos');
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Pix');
    expect(linhas()).toEqual([['20/10/2026', 'Ana', 'R$ 29,90']]);
  });

  it('atalhos de período: Hoje, Ontem e Este mês', async () => {
    const { api, agora } = await preparar();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} />);
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
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} />);
    await screen.findByRole('table');
    expect(screen.getByText('3× Coleira M', { exact: false }).closest('details')).toBeTruthy();
  });
});

describe('TelaRelatorios · canceladas, devoluções e pagamento dividido', () => {
  it('cancelada aparece riscada com a etiqueta e fica fora dos totais', async () => {
    const { api, agora } = await preparar();
    const deHoje = (await api.listarVendas()).find((v) => v.numero === 3)!;
    await api.cancelarVenda(deHoje.id, { motivo: 'errou o produto' });
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} />);
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
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Pix');
    await waitFor(() => expect(linhas().map((l) => l[0])).toEqual(['12/11/2026', '20/10/2026']));
    expect(txt(screen.getByText('#00004').closest('tr')!.textContent)).toMatch(/Dinheiro R\$ 10,00 \+ Pix R\$ 19,90/);
    expect(txt(screen.getByText('#00004').closest('tr')!.textContent)).toMatch(/com devolução/);
    await userEvent.selectOptions(screen.getByLabelText('Pagamento'), 'Dinheiro');
    expect(linhas()).toHaveLength(2);
    expect(txt(screen.getByTestId('rel-extra').textContent)).toBe('Devoluções no período: R$ 29,90 (1 devolução)');
  });
});
