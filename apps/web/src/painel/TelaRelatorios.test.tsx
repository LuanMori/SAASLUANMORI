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
  const ana = criarApiLocal({ lojaId: 'r', operador: { id: 'ana', nome: 'Ana' }, exemplos: false, atrasoMs: 0, agora });
  const bruno = criarApiLocal({ lojaId: 'r', operador: { id: 'bruno', nome: 'Bruno' }, exemplos: false, atrasoMs: 0, agora });
  const p = await ana.criarProduto({ nome: 'Coleira M', codigoBarras: null, precoCentavos: 2990 });
  relogio = new Date('2026-10-20T15:00:00Z');
  await ana.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], formaPagamento: 'pix' });
  relogio = new Date('2026-11-11T18:00:00Z');
  await bruno.criarVenda({ itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'dinheiro' });
  relogio = new Date('2026-11-12T13:00:00Z');
  await ana.criarVenda({ itens: [{ produtoId: p.id, quantidade: 3 }], formaPagamento: 'credito' });
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
