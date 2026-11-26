// apps/web/src/painel/TelaRelatoriosAbas.test.tsx — Relatórios em abas (Fase 2, módulo 10; pedido do Luan de
// 23/11/2026): cada assunto na aba dele, com filtros, "Exportar esta aba" e "Exportar tudo" para o Excel.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import { TelaRelatorios } from './TelaRelatorios';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

async function loja() {
  let relogio = new Date('2026-11-20T15:00:00Z');
  const api = comCaixaAberto(criarApiLocal({ lojaId: 'rel-abas', operador: ANA, exemplos: false, atrasoMs: 0, agora: () => relogio }));
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
/** O que o "baixar" recebeu: o nome e se o conteúdo é um ZIP (o .xlsx começa com "PK"). */
const arquivo = (baixar: ReturnType<typeof vi.fn>, i = 0) => {
  const [nome, bytes] = baixar.mock.calls[i] as [string, Uint8Array];
  return { nome, zip: bytes[0] === 0x50 && bytes[1] === 0x4b };
};

describe('Relatórios em abas', () => {
  it('Tudo abre primeiro; cada assunto tem a sua aba, com a tabela dele', async () => {
    const { api, agora } = await loja();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    expect(within(abas()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tudo', 'Vendas', 'Produtos', 'Estoque', 'Clientes', 'Financeiro', 'Caixa', 'Compras', 'Histórico']);
    // abre na aba Tudo (o resumo de todos os assuntos)
    expect(within(abas()).getByRole('button', { name: 'Tudo' }).getAttribute('aria-current')).toBe('page');
    await irPara('Vendas');
    expect(await screen.findByRole('heading', { name: 'Por quem vendeu' })).toBeTruthy();
    for (const [aba, titulo] of [
      ['Produtos', 'Produtos vendidos'],
      ['Estoque', 'Posição de estoque'],
      ['Clientes', 'Clientes'],
      ['Financeiro', 'Lançamentos'],
      ['Caixa', 'Caixa de cada dia'],
      ['Compras', 'Compras'],
      ['Histórico', 'Quem fez o quê'],
    ] as const) {
      await irPara(aba);
      expect(await screen.findByRole('heading', { name: titulo })).toBeTruthy();
    }
  });

  it('Produtos: lucro estimado com o custo da hora da venda; o período do topo vale para a aba', async () => {
    const { api, agora } = await loja();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    await irPara('Produtos');
    const resumo = await screen.findByRole('region', { name: 'Resumo dos produtos' });
    expect(txt(within(resumo).getByText('Lucro estimado').parentElement?.textContent)).toBe('Lucro estimadoR$ 120,00margem de 40%');
    const tabela = within(screen.getByRole('region', { name: 'Produtos vendidos' })).getByRole('table');
    expect(txt(within(tabela).getAllByRole('row')[1]!.textContent)).toBe('10001Ração 3 kg3unR$ 300,00R$ 180,00R$ 120,0040%');
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    await waitFor(() => expect(txt(within(within(screen.getByRole('region', { name: 'Produtos vendidos' })).getByRole('table')).getAllByRole('row')[1]!.textContent)).toMatch(/^1.*Ração 3 kg1un/));
  });

  it('Estoque e Clientes: filtros da própria aba', async () => {
    const { api, agora } = await loja();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    await irPara('Estoque');
    await screen.findByRole('heading', { name: 'Posição de estoque' });
    await userEvent.selectOptions(screen.getByLabelText('Situação no fim do período'), 'Zerado');
    expect(screen.getByText('Nenhum produto com esses filtros.')).toBeTruthy();
    await irPara('Clientes');
    await screen.findByRole('heading', { name: 'Clientes' });
    const linhaMaria = within(screen.getByRole('region', { name: 'Clientes' })).getByText('Maria Souza').closest('tr')!;
    expect(txt(linhaMaria.textContent)).toMatch(/^Maria Souza\(41\) 99999-8888.*\*.*Ativo1R\$ 100,00R\$ 100,0021\/11\/2026R\$ 100,00—R\$ 1\.000,00$/);
    await userEvent.selectOptions(screen.getByLabelText('Quais clientes'), 'fiado');
    expect(within(screen.getByRole('region', { name: 'Clientes' })).getByText('Maria Souza')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Buscar'), 'joão');
    expect(screen.getByText('Nenhum cliente com esses filtros.')).toBeTruthy();
  });

  it('"Exportar esta aba" e "Exportar tudo" geram o .xlsx com o nome do período e ficam no histórico', async () => {
    const { api, agora } = await loja();
    const baixar = vi.fn();
    render(<TelaRelatorios api={api} fuso={FUSO} agora={agora} baixar={baixar} />);
    // aba Vendas: vendas, itens, pagamentos e devoluções
    await irPara('Vendas');
    await screen.findByRole('heading', { name: 'Por quem vendeu' });
    await userEvent.click(screen.getByRole('button', { name: 'Exportar esta aba (Excel)' }));
    expect(arquivo(baixar)).toEqual({ nome: 'relatorio-vendas-ate-2026-11-21.xlsx', zip: true });
    expect(txt((await screen.findByText(/^Arquivo do Excel pronto/)).textContent)).toBe('Arquivo do Excel pronto: relatorio-vendas-ate-2026-11-21.xlsx (4 abas).');

    await userEvent.click(screen.getByRole('button', { name: 'Este mês' }));
    await irPara('Histórico');
    await screen.findByRole('heading', { name: 'Quem fez o quê' });
    await userEvent.click(screen.getByRole('button', { name: 'Exportar esta aba (Excel)' }));
    expect(arquivo(baixar, 1).nome).toBe('relatorio-historico-2026-11-01-a-2026-11-21.xlsx');

    await userEvent.click(screen.getByRole('button', { name: 'Exportar tudo (Excel)' }));
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(3));
    expect(arquivo(baixar, 2)).toEqual({ nome: 'relatorio-tudo-2026-11-01-a-2026-11-21.xlsx', zip: true });
    expect(txt((await screen.findByText(/^Arquivo do Excel pronto: relatorio-tudo/)).textContent)).toBe('Arquivo do Excel pronto: relatorio-tudo-2026-11-01-a-2026-11-21.xlsx (17 abas).');
    await waitFor(async () =>
      expect((await api.listarAuditoria(5)).filter((l) => l.acao === 'relatorios.exportado').map((l) => txt(l.resumo))).toEqual([
        'Tudo • 01/11/2026 a 21/11/2026 • 17 abas',
        'Histórico • 01/11/2026 a 21/11/2026 • 1 aba',
        'Vendas • todo o período • 4 abas',
      ]),
    );
  });
});
