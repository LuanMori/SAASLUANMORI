// apps/web/src/telas/TelaProdutos.test.tsx
import { MENSAGEM_PRECO_ZERO } from '@saas/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ApiProdutos, ErroApi, type Produto } from '../api';
import { TelaProdutos } from './TelaProdutos';

let proximo = 1;
const produto = (p: Partial<Produto>): Produto => ({
  id: crypto.randomUUID(),
  codigoInterno: String(proximo++).padStart(4, '0'),
  codigoBarras: null,
  nome: 'X',
  precoCentavos: 100,
  ativo: true,
  criadoEm: '2026-11-11T00:00:00Z',
  atualizadoEm: '2026-11-11T00:00:00Z',
  ...p,
});

function apiFalsa(inicial: Produto[] = []) {
  return {
    listarProdutos: vi.fn<ApiProdutos['listarProdutos']>().mockResolvedValue(inicial),
    criarProduto: vi.fn<ApiProdutos['criarProduto']>(async (d) => produto({ ...d, codigoInterno: '0007' })),
  };
}

const sessao = { nome: 'Maria Vendedora', loja: 'Loja Centro' };

function montar(api: ApiProdutos, aoSair = vi.fn()) {
  render(<TelaProdutos api={api} sessao={sessao} aoSair={aoSair} intervaloMs={60_000} />);
  return { aoSair };
}

afterEach(cleanup);

describe('TelaProdutos', () => {
  it('mostra loja, usuário e a lista com código interno, código de barras e preço', async () => {
    montar(
      apiFalsa([
        produto({ nome: 'Ração 15kg', codigoInterno: '0001', codigoBarras: '7891000100103', precoCentavos: 18990 }),
        produto({ nome: 'Petisco', codigoInterno: '0002', codigoBarras: null }),
      ]),
    );
    expect(screen.getByText('Loja Centro')).toBeTruthy();
    expect(screen.getByText('Maria Vendedora')).toBeTruthy();
    expect(await screen.findByText('Ração 15kg')).toBeTruthy();
    expect(screen.getByText(/^R\$\s189,90$/)).toBeTruthy();
    expect(screen.getByText('0001')).toBeTruthy();
    expect(screen.getByText('7891000100103')).toBeTruthy();
    expect(screen.getByText('sem código de barras')).toBeTruthy();
  });

  it('lista vazia mostra mensagem', async () => {
    montar(apiFalsa());
    expect(await screen.findByText('Nenhum produto cadastrado ainda.')).toBeTruthy();
  });

  it('não tem campo de código interno: ele vem do sistema e aparece na confirmação', async () => {
    const api = apiFalsa();
    montar(api);
    await screen.findByText('Nenhum produto cadastrado ainda.');
    expect(screen.queryByLabelText(/código interno/i)).toBeNull();

    await userEvent.type(screen.getByLabelText('Nome'), '  Areia 4kg ');
    await userEvent.type(screen.getByLabelText('Código de barras (opcional)'), '0078912345678');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '1.234,56');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(api.criarProduto).toHaveBeenCalledWith({ nome: 'Areia 4kg', codigoBarras: '0078912345678', precoCentavos: 123456 });
    expect(await screen.findByText(/^R\$\s1\.234,56$/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('“Areia 4kg” cadastrado com o código 0007.');
  });

  it('Enter do leitor no código de barras vai para o preço, sem enviar', async () => {
    const api = apiFalsa();
    montar(api);
    await userEvent.type(screen.getByLabelText('Nome'), 'Coleira');
    await userEvent.type(screen.getByLabelText('Código de barras (opcional)'), '7891234567895{Enter}');
    expect(api.criarProduto).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('Preço (R$)'));
  });

  it('valida no navegador com a mesma regra do core, sem chamar a API', async () => {
    const api = apiFalsa();
    montar(api);
    const preco = screen.getByLabelText('Preço (R$)');

    await userEvent.type(preco, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o nome do produto.')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Nome'), 'Petisco');
    await userEvent.type(screen.getByLabelText('Código de barras (opcional)'), 'ABC-1');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('O código de barras deve ter só números.')).toBeTruthy();

    await userEvent.clear(screen.getByLabelText('Código de barras (opcional)'));
    await userEvent.clear(preco);
    await userEvent.type(preco, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(MENSAGEM_PRECO_ZERO)).toBeTruthy();

    await userEvent.clear(preco);
    await userEvent.type(preco, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe um preço válido (ex.: 12,90).')).toBeTruthy();

    expect(api.criarProduto).not.toHaveBeenCalled();
  });

  it('mostra erro de campo vindo da API (código de barras repetido)', async () => {
    const api = apiFalsa();
    api.criarProduto.mockRejectedValue(
      new ErroApi(409, 'Código de barras repetido: 789 já está vinculado ao produto "Coleira".', [
        { campo: 'codigoBarras', mensagem: 'Já usado em "Coleira".' },
      ]),
    );
    montar(api);
    await userEvent.type(screen.getByLabelText('Nome'), 'Coleira azul');
    await userEvent.type(screen.getByLabelText('Código de barras (opcional)'), '789');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '35');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já usado em "Coleira".')).toBeTruthy();
  });

  it('403 (pessoa não cadastrada pelo dono) bloqueia a tela e oferece entrar com outra conta', async () => {
    const api = apiFalsa();
    api.listarProdutos.mockRejectedValue(
      new ErroApi(403, 'Seu acesso a esta loja ainda não foi liberado. Peça ao dono da loja para cadastrar você.'),
    );
    const { aoSair } = montar(api);
    expect(await screen.findByText(/ainda não foi liberado/)).toBeTruthy();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com outra conta' }));
    expect(aoSair).toHaveBeenCalled();
  });

  it('queda de rede mantém a lista e avisa', async () => {
    const api = apiFalsa([produto({ nome: 'Brinquedo' })]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<TelaProdutos api={api} sessao={sessao} aoSair={vi.fn()} intervaloMs={1000} />);
      expect(await screen.findByText('Brinquedo')).toBeTruthy();
      api.listarProdutos.mockRejectedValue(new ErroApi(0, 'Sem conexão'));
      await vi.advanceTimersByTimeAsync(1100);
      await waitFor(() => expect(screen.getByText('Sem conexão com o servidor. Tentando de novo…')).toBeTruthy());
      expect(screen.getByText('Brinquedo')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
