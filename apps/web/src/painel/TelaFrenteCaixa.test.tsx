// apps/web/src/painel/TelaFrenteCaixa.test.tsx
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';

/** formatarCentavos usa espaço não separável depois de "R$"; nos testes comparamos com espaço comum. */
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function montar() {
  const base = criarApiLocal({ lojaId: 'pdv', operador: { id: 'ana', nome: 'Ana' }, exemplos: false, atrasoMs: 0 });
  await base.criarProduto({ nome: 'Ração Gatos 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990 });
  await base.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: '7897000400403', precoCentavos: 750 });
  await base.criarProduto({ nome: 'Petisco Ossinho', codigoBarras: null, precoCentavos: 500 });
  const api = { ...base, criarVenda: vi.fn(base.criarVenda) };
  const aoVender = vi.fn();
  render(<TelaFrenteCaixa api={api} operador={{ nome: 'Ana', papel: 'Dono' }} aoVender={aoVender} />);
  const busca = await screen.findByLabelText('Código ou nome do produto');
  await screen.findByPlaceholderText('Leia o código de barras ou digite');
  return { api, aoVender, busca };
}

const itens = () => within(screen.getByRole('list', { name: 'Itens da venda' })).getAllByRole('listitem');

describe('TelaFrenteCaixa', () => {
  it('mostra quem está operando', async () => {
    await montar();
    expect(screen.getByText('Ana').closest('p')?.textContent).toBe('Operador: Ana (Dono)');
  });

  it('leitor de código: Enter adiciona; o mesmo código de novo soma 1', async () => {
    const { busca } = await montar();
    await userEvent.type(busca, '7891000200209{Enter}');
    await userEvent.type(busca, '7891000200209{Enter}');
    expect(itens()).toHaveLength(1);
    expect((screen.getByLabelText('Quantidade') as HTMLInputElement).value).toBe('2');
    expect(txt(screen.getByTestId('pdv-total').textContent)).toBe('R$ 159,80');
    expect(document.activeElement).toBe(busca);
  });

  it('busca pelo nome, sem acento; com mais de um resultado pede para escolher', async () => {
    const { busca } = await montar();
    await userEvent.type(busca, 'racao{Enter}');
    expect(itens()[0]?.textContent).toMatch(/Ração Gatos 3 kg/);
    await userEvent.type(busca, 'petisco{Enter}');
    expect(screen.getByRole('status').textContent).toMatch(/Mais de um produto/);
    await userEvent.click(within(screen.getByRole('list', { name: 'Produtos encontrados' })).getByText('Petisco Ossinho'));
    expect(itens()).toHaveLength(2);
  });

  it('produto que não existe: avisa e não adiciona', async () => {
    const { busca } = await montar();
    await userEvent.type(busca, '000000{Enter}');
    expect(screen.getByRole('status').textContent).toMatch(/Nenhum produto encontrado/);
    expect(screen.queryByRole('list', { name: 'Itens da venda' })).toBeNull();
  });

  it('só finaliza com item e forma de pagamento; envia só produto, quantidade e forma', async () => {
    const { api, aoVender, busca } = await montar();
    const finalizar = screen.getByRole('button', { name: 'Finalizar venda' }) as HTMLButtonElement;
    expect(finalizar.disabled).toBe(true);
    await userEvent.type(busca, '7897000400403{Enter}');
    expect(finalizar.disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    await userEvent.click(screen.getByLabelText('Cartão de débito'));
    await userEvent.click(finalizar);

    const status = await screen.findByText(/Venda nº 1 registrada/);
    expect(txt(status.textContent)).toMatch(/R\$ 15,00 em Cartão de débito, por Ana/);
    const enviado = api.criarVenda.mock.calls[0]![0];
    expect(enviado).toEqual({ itens: [{ produtoId: expect.any(String), quantidade: 2 }], formaPagamento: 'debito' });
    expect(aoVender.mock.calls[0]![0].vendedor).toEqual({ id: 'ana', nome: 'Ana' });
    expect(screen.queryByRole('list', { name: 'Itens da venda' })).toBeNull();
    expect(txt(screen.getByTestId('pdv-total').textContent)).toBe('R$ 0,00');
  });

  it('remover item e cancelar venda', async () => {
    const { busca } = await montar();
    await userEvent.type(busca, '7897000400403{Enter}');
    await userEvent.type(busca, '7891000200209{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Remover Petisco Bifinho' }));
    expect(itens()).toHaveLength(1);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar venda' }));
    expect(screen.queryByRole('list', { name: 'Itens da venda' })).toBeNull();
  });

  it('sem pessoa logada a API recusa a venda', async () => {
    localStorage.clear();
    const api = criarApiLocal({ lojaId: 'pdv2', operador: null, exemplos: false, atrasoMs: 0 });
    const p = await api.criarProduto({ nome: 'X', codigoBarras: '123', precoCentavos: 100 });
    await expect(api.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], formaPagamento: 'pix' })).rejects.toMatchObject({ status: 401 });
  });
});
