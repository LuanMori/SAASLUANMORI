// apps/web/src/painel/TelaVisaoGeral.test.tsx
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const detalhe = () => document.getElementById('vg-detalhe');
const celulas = (linha: HTMLElement, ...indices: number[]) => indices.map((n) => txt((linha as HTMLTableRowElement).cells[n]?.textContent));

describe('TelaVisaoGeral', () => {
  it('card grande: só as vendas de HOJE, com vendas, hora da última e itens vendidos', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} />);
    expect((await screen.findByText('R$ 74,70')).getAttribute('data-testid')).toBe('vendido-hoje'); // a de ontem fica de fora
    expect(txt(screen.getByTestId('vendido-hoje-nota').textContent)).toBe('2 vendas·a última às 11:30·3 itens vendidos');
  });

  it('sem os cards pequenos, sem Ticket médio, sem botão de caixa e sem lista fixa de vendas', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} />);
    await screen.findByText('R$ 74,70');
    expect(screen.queryByRole('button', { name: /Vendas hoje/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Itens vendidos/ })).toBeNull();
    expect(screen.queryByText('Ticket médio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Abrir a Frente de caixa/ })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull(); // a lista só aparece no relatório do card
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
    expect(txt(screen.getByTestId('vendido-hoje-nota').textContent)).toBe('Nenhuma venda ainda hoje');
    expect(await api.listarVendas()).toHaveLength(3); // continuam guardadas para os Relatórios
  });
});

describe('TelaVisaoGeral · relatórios ao clicar', () => {
  const montar = async (comRelatorios = true) => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} aoVerRelatorios={comRelatorios ? () => {} : undefined} />);
    await screen.findByText('R$ 74,70');
  };

  it('card grande: a conta, por forma, por quem vendeu e, no fim, cada venda de hoje; clicar de novo fecha', async () => {
    await montar();
    const visor = screen.getByRole('button', { name: /VENDIDO HOJE/ });
    expect(visor.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(visor);
    expect(visor.getAttribute('aria-expanded')).toBe('true');
    const painel = detalhe()!;
    expect(within(painel).getByRole('heading', { name: 'Vendido hoje' })).toBeTruthy();
    expect(txt(painel.querySelector('.vg-formula')?.textContent)).toBe('venda nº 2 R$ 24,90 + venda nº 3 R$ 49,80 = R$ 74,70');
    expect(within(painel).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Por forma de pagamento',
      'Por quem vendeu',
      'Vendas de hoje',
    ]);
    const [porForma, porQuem, vendasHoje] = within(painel).getAllByRole('table');
    expect(within(porForma!).getAllByRole('row').slice(1).map((r) => txt(r.textContent))).toEqual(['Dinheiro1R$ 49,8067%', 'Pix1R$ 24,9033%']);
    expect(within(porQuem!).getAllByRole('row').slice(1).map((r) => txt(r.textContent))).toEqual(['Bruno1R$ 49,8067%', 'Ana1R$ 24,9033%']);
    const linhas = within(vendasHoje!).getAllByRole('row').slice(1);
    expect(linhas.map((l) => celulas(l, 0, 1, 3, 5))).toEqual([
      ['nº 3', '11:30', 'Bruno', 'R$ 49,80'],
      ['nº 2', '10:05', 'Ana', 'R$ 24,90'],
    ]);
    expect(txt(linhas[0]!.textContent)).toMatch(/2× Areia 4 kg R\$ 24,90 cada · R\$ 49,80/);
    expect(txt(painel.querySelector('.vg-soma')?.textContent)).toBe('Total: R$ 74,70 em 2 vendas · 3 itens vendidos');
    expect(txt(painel.querySelector('.vg-detalhe-rodape')?.textContent)).toMatch(/À meia-noite esta tela volta a zero/);
    await userEvent.click(visor);
    expect(detalhe()).toBeNull();
  });

  it('clicar numa pessoa em "Por quem vendeu" mostra só as vendas dela', async () => {
    await montar();
    const porQuem = screen.getByRole('heading', { name: 'Por quem vendeu' }).closest('section')!;
    await userEvent.click(within(porQuem).getByRole('button', { name: /Bruno/ }));
    const painel = detalhe()!;
    expect(within(painel).getByRole('heading', { name: 'Vendas de Bruno hoje' })).toBeTruthy();
    expect(within(within(painel).getByRole('table')).getAllByRole('row')).toHaveLength(2); // cabeçalho + 1 venda
    expect(txt(painel.querySelector('.vg-soma')?.textContent)).toBe('Total: R$ 49,80 em 1 venda · 2 itens');
  });

  it('forma de pagamento mostra só as vendas pagas nela; trocar de card troca o relatório; Fechar recolhe', async () => {
    await montar();
    const porForma = screen.getByRole('heading', { name: 'Por forma de pagamento' }).closest('section')!;
    await userEvent.click(within(porForma).getByRole('button', { name: /Pix/ }));
    expect(within(detalhe()!).getByRole('heading', { name: 'Pago em Pix hoje' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /VENDIDO HOJE/ }));
    expect(within(detalhe()!).getByRole('heading', { name: 'Vendido hoje' })).toBeTruthy();
    expect(within(porForma).getByRole('button', { name: /Pix/ }).getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(within(detalhe()!).getByRole('button', { name: 'Fechar' }));
    expect(detalhe()).toBeNull();
  });

  it('sem acesso a Relatórios (Vendedor): o aviso aparece sem link', async () => {
    await montar(false);
    await userEvent.click(screen.getByRole('button', { name: /VENDIDO HOJE/ }));
    const rodape = detalhe()!.querySelector('.vg-detalhe-rodape')!;
    expect(txt(rodape.textContent)).toBe('À meia-noite esta tela volta a zero. Todas as vendas ficam guardadas em Relatórios.');
    expect(rodape.querySelector('button')).toBeNull();
  });
});
