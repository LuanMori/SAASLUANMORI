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

const visor = () => screen.getByRole('button', { name: /VENDAS DE HOJE/ });

describe('TelaVisaoGeral · formato', () => {
  it('card grande: valor de hoje, produtos vendidos e número de vendas (a de ontem fica de fora)', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} />);
    expect((await screen.findByText('R$ 74,70')).getAttribute('data-testid')).toBe('vendido-hoje'); // 3 × 24,90
    expect(txt(screen.getByTestId('vendido-hoje-nota').textContent)).toBe('3 produtos vendidos·2 vendas');
  });

  it('nenhuma informação a mais na tela: sem listas, tabelas nem resumos por pessoa ou forma', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} aoVerProdutos={vi.fn()} aoVerFinanceiro={vi.fn()} />);
    await screen.findByText('R$ 74,70');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Por quem vendeu' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Por forma de pagamento' })).toBeNull();
    expect(screen.queryByText('Ticket médio')).toBeNull();
    expect(screen.queryByText(/Ver de onde vem/)).toBeNull();
    // Só três botões na área: o card grande e os dois do lado.
    expect(within(screen.getByRole('region', { name: 'Resumo de hoje' })).getAllByRole('button')).toHaveLength(3);
  });

  it('do lado: Produtos ativos e Saldo das contas; clicar leva para a aba de cada um', async () => {
    const { api, agora } = await preparar();
    const aoVerProdutos = vi.fn();
    const aoVerFinanceiro = vi.fn();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} aoVerProdutos={aoVerProdutos} aoVerFinanceiro={aoVerFinanceiro} />);
    const produtos = await screen.findByRole('button', { name: /Produtos ativos/ });
    await waitFor(() => expect(produtos.querySelector('.vg-atalho-valor')?.textContent).toBe('1'));
    expect(produtos.getAttribute('title')).toBe('Abrir Produtos e estoque');
    const saldo = screen.getByRole('button', { name: /Saldo das contas/ });
    expect(saldo.getAttribute('title')).toBe('Abrir Financeiro');
    expect(saldo.textContent).toMatch(/Financeiro ainda não configurado/);

    await userEvent.click(produtos);
    expect(aoVerProdutos).toHaveBeenCalledOnce();
    await userEvent.click(saldo);
    expect(aoVerFinanceiro).toHaveBeenCalledOnce();
    expect(detalhe()).toBeNull(); // os do lado não abrem relatório: mudam de aba
  });

  it('Produtos ativos conta só os ativos e mostra os inativos ao lado', async () => {
    const produto = (id: string, ativo: boolean) => ({
      id,
      codigoInterno: id,
      codigoBarras: null,
      nome: id,
      precoCentavos: 100,
      ativo,
      criadoEm: '2026-11-01T00:00:00Z',
      atualizadoEm: '2026-11-01T00:00:00Z',
    });
    const api = {
      listarVendas: vi.fn(async () => []),
      listarProdutos: vi.fn(async () => [produto('0001', true), produto('0002', true), produto('0003', false)]),
    };
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} aoVerProdutos={vi.fn()} />);
    const produtos = await screen.findByRole('button', { name: /Produtos ativos/ });
    await waitFor(() => expect(produtos.querySelector('.vg-atalho-valor')?.textContent).toBe('2 · 1 inativo'));
  });

  it('sem permissão de Financeiro (Vendedor): o card Saldo das contas não aparece', async () => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Bruno" fuso={FUSO} agora={agora} aoVerProdutos={vi.fn()} />);
    await screen.findByRole('button', { name: /Produtos ativos/ });
    expect(screen.queryByRole('button', { name: /Saldo das contas/ })).toBeNull();
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

describe('TelaVisaoGeral · relatório do card grande', () => {
  const montar = async (comRelatorios = true) => {
    const { api, agora } = await preparar();
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} agora={agora} aoVerRelatorios={comRelatorios ? () => {} : undefined} />);
    await screen.findByText('R$ 74,70');
  };

  it('abre com a conta, por forma, por quem vendeu e venda por venda; clicar de novo fecha', async () => {
    await montar();
    expect(visor().getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(visor());
    expect(visor().getAttribute('aria-expanded')).toBe('true');
    const painel = detalhe()!;
    expect(within(painel).getByRole('heading', { level: 2, name: 'Vendas de hoje' })).toBeTruthy();
    expect(txt(painel.querySelector('.vg-formula')?.textContent)).toBe('venda nº 2 R$ 24,90 + venda nº 3 R$ 49,80 = R$ 74,70');
    expect(within(painel).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Por forma de pagamento',
      'Por quem vendeu',
      'Venda por venda',
    ]);
    const [porForma, porQuem, vendaPorVenda] = within(painel).getAllByRole('table');
    expect(within(porForma!).getAllByRole('row').slice(1).map((r) => txt(r.textContent))).toEqual(['Dinheiro1R$ 49,8067%', 'Pix1R$ 24,9033%']);
    expect(within(porQuem!).getAllByRole('row').slice(1).map((r) => txt(r.textContent))).toEqual(['Bruno1R$ 49,8067%', 'Ana1R$ 24,9033%']);
    const linhas = within(vendaPorVenda!).getAllByRole('row').slice(1);
    expect(linhas.map((l) => celulas(l, 0, 1, 3, 4, 5))).toEqual([
      ['nº 3', '11:30', 'Bruno', 'Dinheiro', 'R$ 49,80'],
      ['nº 2', '10:05', 'Ana', 'Pix', 'R$ 24,90'],
    ]);
    expect(txt(linhas[0]!.textContent)).toMatch(/2× Areia 4 kg R\$ 24,90 cada · R\$ 49,80/);
    expect(txt(painel.querySelector('.vg-soma')?.textContent)).toBe('Total: R$ 74,70 em 2 vendas · 3 produtos vendidos');
    expect(txt(painel.querySelector('.vg-detalhe-rodape')?.textContent)).toMatch(/À meia-noite esta tela volta a zero/);
    await userEvent.click(visor());
    expect(detalhe()).toBeNull();
  });

  it('Fechar recolhe o relatório', async () => {
    await montar();
    await userEvent.click(visor());
    await userEvent.click(within(detalhe()!).getByRole('button', { name: 'Fechar' }));
    expect(detalhe()).toBeNull();
    expect(visor().getAttribute('aria-expanded')).toBe('false');
  });

  it('dia sem vendas: o relatório avisa', async () => {
    const api = { listarVendas: vi.fn(async () => []), listarProdutos: vi.fn(async () => []) };
    render(<TelaVisaoGeral api={api} nome="Ana" fuso={FUSO} />);
    await waitFor(() => expect(txt(screen.getByTestId('vendido-hoje').textContent)).toBe('R$ 0,00'));
    await userEvent.click(visor());
    expect(within(detalhe()!).getByText(/Nenhuma venda hoje ainda/)).toBeTruthy();
    expect(within(detalhe()!).queryByRole('table')).toBeNull();
  });

  it('sem acesso a Relatórios (Vendedor): o aviso aparece sem link', async () => {
    await montar(false);
    await userEvent.click(visor());
    const rodape = detalhe()!.querySelector('.vg-detalhe-rodape')!;
    expect(txt(rodape.textContent)).toBe('À meia-noite esta tela volta a zero. Todas as vendas ficam guardadas em Relatórios.');
    expect(rodape.querySelector('button')).toBeNull();
  });
});
