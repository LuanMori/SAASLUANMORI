// apps/web/src/painel/TelaProdutosEstoque.test.tsx
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { TelaProdutosEstoque } from './TelaProdutosEstoque';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const api = (operador: OperadorComPapel) => criarApiLocal({ lojaId: 'pe', operador, exemplos: false, atrasoMs: 0 });

const abrir = (operador: OperadorComPapel) => render(<TelaProdutosEstoque api={api(operador)} papel={operador.papel} fuso={FUSO} intervaloMs={60_000} />);
const tabelaProdutos = () => within(screen.getByRole('region', { name: 'Produtos' })).getByRole('table');
const linhaDe = (nome: string) => within(tabelaProdutos()).getByText(nome).closest('tr') as HTMLTableRowElement;
const janela = () => screen.getByRole('dialog');

describe('Produtos e estoque', () => {
  it('Dono cadastra o produto (começa zerado), dá entrada, ajusta com motivo e define o mínimo', async () => {
    abrir(ANA);
    expect(await screen.findByText(/Nenhum produto cadastrado ainda/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Nome'), 'Coleira M');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '29,90');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(linhaDe('Coleira M').cells[3]!.textContent).toBe('0 unzerado'));

    // entrada
    await userEvent.click(screen.getByRole('button', { name: 'Entrada de Coleira M' }));
    expect(within(janela()).getByRole('heading').textContent).toBe('Entrada de estoque: Coleira M');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar entrada' }));
    expect(within(janela()).getByRole('alert').textContent).toBe('Informe uma quantidade inteira maior que zero.');
    await userEvent.type(within(janela()).getByLabelText('Quantidade (unidades)'), '10');
    expect(janela().querySelector('.modal-sub')?.textContent).toBe('Saldo atual: 0 un → depois: 10 un');
    await userEvent.type(within(janela()).getByLabelText('Observação (opcional)'), 'nota 123');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar entrada' }));
    expect((await screen.findByText(/Entrada lançada/)).textContent).toBe('Entrada lançada: Coleira M +10 un. Saldo agora: 10 un.');
    await waitFor(() => expect(linhaDe('Coleira M').cells[3]!.textContent).toBe('10 un'));

    // ajuste: precisa de motivo e não deixa o saldo negativo
    await userEvent.click(screen.getByRole('button', { name: 'Ajuste de Coleira M' }));
    await userEvent.type(within(janela()).getByLabelText('Quantidade (unidades)'), '11');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar ajuste' }));
    expect(within(janela()).getByRole('alert').textContent).toMatch(/Informe o motivo do ajuste/);
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'avaria');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar ajuste' }));
    expect((await within(janela()).findByRole('alert')).textContent).toBe('O ajuste deixaria o saldo de Coleira M negativo (saldo atual 10 un.).');
    await userEvent.clear(within(janela()).getByLabelText('Quantidade (unidades)'));
    await userEvent.type(within(janela()).getByLabelText('Quantidade (unidades)'), '4');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar ajuste' }));
    expect((await screen.findByText(/Ajuste lançado/)).textContent).toBe('Ajuste lançado: Coleira M -4 un. Saldo agora: 6 un.');

    // mínimo: no mínimo ou abaixo aparece "baixo"
    await userEvent.click(screen.getByRole('button', { name: 'Estoque mínimo de Coleira M' }));
    await userEvent.type(within(janela()).getByLabelText('Estoque mínimo (0 = sem aviso)'), '6');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar mínimo' }));
    await waitFor(() => expect(linhaDe('Coleira M').cells[3]!.textContent).toBe('6 unbaixo'));
    expect(linhaDe('Coleira M').cells[4]!.textContent).toBe('6');

    // os movimentos aparecem com quantidade, motivo e quem lançou
    const movimentos = within(screen.getByRole('region', { name: 'Últimos movimentos do estoque' })).getAllByRole('row').slice(1);
    expect(movimentos.map((l) => [2, 3, 4, 5, 6].map((i) => (l as HTMLTableRowElement).cells[i]!.textContent))).toEqual(
      expect.arrayContaining([
        ['Coleira M', 'Ajuste', '-4', 'avaria', 'Ana'],
        ['Coleira M', 'Entrada', '+10', 'nota 123', 'Ana'],
      ]),
    );
  });

  it('a venda da Frente de caixa aparece nos movimentos e baixa o saldo', async () => {
    const dono = api(ANA);
    const p = await dono.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 750 });
    await dono.lancarMovimentoEstoque({ produtoId: p.id, tipo: 'entrada', quantidade: 5, motivo: '' });
    await api(BRUNO).criarVenda({ itens: [{ produtoId: p.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 1500 }] });
    abrir(ANA);
    await waitFor(() => expect(linhaDe('Petisco').cells[3]!.textContent).toBe('3 un'));
    const venda = within(screen.getByRole('region', { name: 'Últimos movimentos do estoque' })).getByText('Venda', { exact: false }).closest('tr') as HTMLTableRowElement;
    expect([3, 4, 6].map((i) => venda.cells[i]!.textContent)).toEqual(['Venda #00001', '-2', 'Bruno']);
  });

  it('Vendedor cadastra produto e consulta o saldo, mas não lança entrada, ajuste nem mínimo', async () => {
    abrir(BRUNO);
    await screen.findByText(/Nenhum produto cadastrado ainda/);
    expect(screen.getByText(/A entrada é lançada pelo Dono ou pelo Administrador/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Nome'), 'Shampoo');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '32');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(linhaDe('Shampoo').cells[3]!.textContent).toBe('0 unzerado'));
    expect(screen.queryByRole('button', { name: /Entrada de|Ajuste de|Estoque mínimo de/ })).toBeNull();
    expect(within(tabelaProdutos()).queryByText('Estoque: lançar')).toBeNull();
  });
});
