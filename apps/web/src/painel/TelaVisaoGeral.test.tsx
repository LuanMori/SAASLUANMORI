// apps/web/src/painel/TelaVisaoGeral.test.tsx
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { TelaVisaoGeral } from './TelaVisaoGeral';

/** formatarCentavos usa espaço não separável depois de "R$"; nos testes comparamos com espaço comum. */
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FUSO = 'America/Sao_Paulo';

/** Loja com 1 produto e vendas em horários controlados. */
async function preparar() {
  let relogio = new Date('2026-11-12T13:00:00Z'); // 10:00 em SP
  const agora = () => relogio;
  const mudar = (iso: string) => {
    relogio = new Date(iso);
  };
  const comoAna = criarApiLocal({ lojaId: 'l', operador: { id: 'ana', nome: 'Ana' }, exemplos: false, atrasoMs: 0, agora });
  const comoBruno = criarApiLocal({ lojaId: 'l', operador: { id: 'bruno', nome: 'Bruno' }, exemplos: false, atrasoMs: 0, agora });
  const p = await comoAna.criarProduto({ nome: 'Areia 4 kg', codigoBarras: null, precoCentavos: 2490 });

  mudar('2026-11-11T20:00:00Z'); // ontem, 17:00 em SP
  await comoAna.criarVenda({ itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'credito' });
  mudar('2026-11-12T13:05:00Z'); // hoje, 10:05
  await comoAna.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], formaPagamento: 'pix' });
  mudar('2026-11-12T14:30:00Z'); // hoje, 11:30
  await comoBruno.criarVenda({ itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'dinheiro' });
  mudar('2026-11-12T15:00:00Z'); // agora: 12:00 em SP
  return { api: comoAna, agora, mudar };
}

describe('TelaVisaoGeral', () => {
  it('conta só as vendas de HOJE (a de ontem fica de fora)', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} />);
    expect((await screen.findByText('R$ 74,70')).getAttribute('data-testid')).toBe('vendido-hoje'); // 3 × 24,90
    expect(screen.getByText('2 vendas até agora')).toBeTruthy();
    expect(txt(screen.getByText('Ticket médio').nextElementSibling?.textContent)).toBe('R$ 37,35');
    expect(txt(screen.getByText('Itens vendidos').nextElementSibling?.textContent)).toBe('3');
  });

  it('cada venda mostra a hora e quem vendeu; mais recente primeiro', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} />);
    const linhas = within(await screen.findByRole('table')).getAllByRole('row').slice(1);
    expect(linhas.map((l) => [txt((l as HTMLTableRowElement).cells[0]?.textContent), txt((l as HTMLTableRowElement).cells[2]?.textContent), txt((l as HTMLTableRowElement).cells[5]?.textContent)])).toEqual([
      ['11:30', 'Bruno', 'R$ 49,80'],
      ['10:05', 'Ana', 'R$ 24,90'],
    ]);
  });

  it('cards por quem vendeu e por forma de pagamento', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} />);
    const porQuem = (await screen.findByRole('heading', { name: 'Por quem vendeu' })).closest('section')!;
    await within(porQuem).findByText('Bruno');
    expect(within(porQuem).getAllByRole('listitem').map((li) => txt(li.textContent))).toEqual(['Bruno1 vendaR$ 49,80', 'Ana1 vendaR$ 24,90']);
    const porForma = screen.getByRole('heading', { name: 'Por forma de pagamento' }).closest('section')!;
    expect(within(porForma).getAllByRole('listitem').map((li) => txt(li.textContent))).toEqual(['Dinheiro1 vendaR$ 49,80', 'Pix1 vendaR$ 24,90']);
  });

  it('à meia-noite volta a zero sozinha (sem apagar nada)', async () => {
    const { api, agora, mudar } = await preparar();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} intervaloMs={1000} />);
    await screen.findByText('R$ 74,70');
    mudar('2026-11-13T03:00:30Z'); // 00:00:30 do dia 13 em SP
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await waitFor(() => expect(txt(screen.getByTestId('vendido-hoje').textContent)).toBe('R$ 0,00'));
    expect(screen.getByText(/Nenhuma venda hoje ainda/)).toBeTruthy();
    expect(await api.listarVendas()).toHaveLength(3); // continuam guardadas para os Relatórios
  });
});
