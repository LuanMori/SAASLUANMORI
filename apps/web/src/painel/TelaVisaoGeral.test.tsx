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

describe('TelaVisaoGeral', () => {
  it('conta só as vendas de HOJE (a de ontem fica de fora)', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} />);
    expect((await screen.findByText('R$ 74,70')).getAttribute('data-testid')).toBe('vendido-hoje'); // 3 × 24,90
    expect(screen.getByText('2 vendas até agora')).toBeTruthy();
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

describe('TelaVisaoGeral · cards clicáveis (relatório "de onde vem")', () => {
  const montar = async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} aoVerRelatorios={() => {}} />);
    await screen.findByText('R$ 74,70');
    return { relatorio: () => screen.queryByRole('region', { name: /hoje/ }) };
  };
  const detalhe = () => document.getElementById('vg-detalhe');

  it('sem "Abrir a Frente de caixa" e sem card de Ticket médio', async () => {
    await montar();
    expect(screen.queryByRole('button', { name: /Abrir a Frente de caixa/ })).toBeNull();
    expect(screen.queryByText('Ticket médio')).toBeNull();
  });

  it('VENDIDO HOJE abre o relatório com a conta, por forma e por quem vendeu; clicar de novo fecha', async () => {
    await montar();
    const visor = screen.getByRole('button', { name: /VENDIDO HOJE/ });
    expect(visor.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(visor);
    expect(visor.getAttribute('aria-expanded')).toBe('true');
    const painel = detalhe()!;
    expect(within(painel).getByRole('heading', { name: 'Vendido hoje' })).toBeTruthy();
    expect(txt(painel.querySelector('.vg-formula')?.textContent)).toBe('venda nº 2 R$ 24,90 + venda nº 3 R$ 49,80 = R$ 74,70');
    const [porForma, porQuem] = within(painel).getAllByRole('table');
    expect(within(porForma!).getAllByRole('row').slice(1).map((r) => txt(r.textContent))).toEqual(['Dinheiro1R$ 49,8067%', 'Pix1R$ 24,9033%']);
    expect(within(porQuem!).getAllByRole('row').slice(1).map((r) => txt(r.textContent))).toEqual(['Bruno1R$ 49,8067%', 'Ana1R$ 24,9033%']);
    await userEvent.click(visor);
    expect(detalhe()).toBeNull();
  });

  it('"Vendas hoje" abre cada venda com os produtos e quem vendeu', async () => {
    await montar();
    await userEvent.click(screen.getByRole('button', { name: /Vendas hoje/ }));
    const painel = detalhe()!;
    expect(within(painel).getByRole('heading', { name: 'Vendas de hoje' })).toBeTruthy();
    const linhas = within(within(painel).getByRole('table')).getAllByRole('row').slice(1);
    expect(linhas.map((l) => [txt((l as HTMLTableRowElement).cells[0]?.textContent), txt((l as HTMLTableRowElement).cells[3]?.textContent)])).toEqual([
      ['nº 3', 'Bruno'],
      ['nº 2', 'Ana'],
    ]);
    expect(txt(linhas[0]!.textContent)).toMatch(/2× Areia 4 kg R\$ 24,90 cada · R\$ 49,80/);
    expect(txt(painel.querySelector('.vg-soma')?.textContent)).toBe('Total: R$ 74,70 em 2 vendas · 3 itens');
  });

  it('"Itens vendidos" soma a quantidade de cada produto em todas as vendas', async () => {
    await montar();
    await userEvent.click(screen.getByRole('button', { name: /Itens vendidos/ }));
    const painel = detalhe()!;
    expect(within(painel).getByRole('heading', { name: 'Itens vendidos hoje' })).toBeTruthy();
    const linhas = within(within(painel).getByRole('table')).getAllByRole('row').slice(1);
    expect(linhas.map((l) => txt(l.textContent))).toEqual(['Areia 4 kg00013 unR$ 74,70']);
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

  it('clicar numa forma de pagamento mostra só as vendas pagas nela; trocar de card troca o relatório', async () => {
    await montar();
    const porForma = screen.getByRole('heading', { name: 'Por forma de pagamento' }).closest('section')!;
    await userEvent.click(within(porForma).getByRole('button', { name: /Pix/ }));
    expect(within(detalhe()!).getByRole('heading', { name: 'Pago em Pix hoje' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Itens vendidos/ }));
    expect(within(detalhe()!).getByRole('heading', { name: 'Itens vendidos hoje' })).toBeTruthy();
    expect(within(porForma).getByRole('button', { name: /Pix/ }).getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(within(detalhe()!).getByRole('button', { name: 'Fechar' }));
    expect(detalhe()).toBeNull();
  });
});
