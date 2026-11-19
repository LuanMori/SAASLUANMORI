// apps/web/src/painel/TelaCompras.test.tsx — aba Compras, fornecedores (Fase 2, módulo 3), ligada à API da demonstração.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { TelaCompras } from './TelaCompras';
import { TelaProdutosEstoque } from './TelaProdutosEstoque';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const api = (o: OperadorComPapel) => criarApiLocal({ lojaId: 'compras', operador: o, exemplos: false, atrasoMs: 0 });
const janela = () => screen.getByRole('dialog');
const textoDaLinha = (tr: HTMLElement) => [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' | ');

describe('Compras · fornecedores', () => {
  it('cadastra com CNPJ e telefone (conferidos), altera, desativa e reativa, com histórico', async () => {
    const a = api(ANA);
    render(<TelaCompras api={a} />);
    await screen.findByText(/Nenhum fornecedor cadastrado ainda/);
    await userEvent.click(screen.getByRole('button', { name: '+ Cadastrar fornecedor' }));
    await userEvent.type(within(janela()).getByLabelText('Nome do fornecedor'), 'Distribuidora Pet Sul');
    await userEvent.type(within(janela()).getByLabelText('CNPJ ou CPF (opcional)'), '11222333000182');
    await userEvent.type(within(janela()).getByLabelText('Telefone com DDD (opcional)'), '4133334444');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar fornecedor' }));
    expect(within(janela()).getByText(/Documento inválido/)).toBeTruthy();
    const doc = within(janela()).getByLabelText('CNPJ ou CPF (opcional)');
    await userEvent.clear(doc);
    await userEvent.type(doc, '11.222.333/0001-81');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar fornecedor' }));
    await screen.findByText('Distribuidora Pet Sul cadastrado.');
    const linha = (await screen.findByText('Distribuidora Pet Sul')).closest('tr')!;
    expect(textoDaLinha(linha)).toBe('Distribuidora Pet Sul | 11.222.333/0001-81 | (41) 3333-4444 | — | AlterarDesativar');

    await userEvent.click(within(linha).getByRole('button', { name: 'Alterar Distribuidora Pet Sul' }));
    await userEvent.type(within(janela()).getByLabelText('Contato (opcional)'), 'Marcos');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Distribuidora Pet Sul: alterações salvas.');

    await userEvent.click(screen.getByRole('button', { name: 'Desativar Distribuidora Pet Sul' }));
    await screen.findByText(/foi desativado: não aparece mais na lista de escolha/);
    await userEvent.click(screen.getByRole('button', { name: 'Reativar Distribuidora Pet Sul' }));
    await screen.findByText('Distribuidora Pet Sul foi reativado.');

    const hist = (await a.listarAuditoria()).slice(0, 4).map((h) => [h.texto, h.alvo?.nome, h.resumo]);
    expect(hist).toEqual([
      ['Fornecedor reativado', 'Distribuidora Pet Sul', ''],
      ['Fornecedor desativado', 'Distribuidora Pet Sul', ''],
      ['Fornecedor alterado', 'Distribuidora Pet Sul', 'contato'],
      ['Fornecedor cadastrado', 'Distribuidora Pet Sul', ''],
    ]);
  });

  it('o mesmo CNPJ não se repete na loja; outra loja pode ter', async () => {
    const a = api(ANA);
    await a.cadastrarFornecedor({ nome: 'Pet Sul', documento: '11222333000181', telefone: null, contato: null, observacao: null });
    await expect(a.cadastrarFornecedor({ nome: 'Outro nome', documento: '11222333000181', telefone: null, contato: null, observacao: null })).rejects.toMatchObject({
      status: 409,
      message: 'Este documento já é do fornecedor "Pet Sul".',
    });
    const outraLoja = criarApiLocal({ lojaId: 'outra', operador: ANA, exemplos: false, atrasoMs: 0 });
    await expect(outraLoja.cadastrarFornecedor({ nome: 'Pet Sul', documento: '11222333000181', telefone: null, contato: null, observacao: null })).resolves.toMatchObject({ nome: 'Pet Sul' });
    expect((await outraLoja.listarFornecedores()).length).toBe(1);
  });

  it('o Vendedor não vê nem mexe nos fornecedores (como a aba Compras do DaniPets)', async () => {
    await expect(api(BRUNO).listarFornecedores()).rejects.toMatchObject({ status: 403 });
    await expect(api(BRUNO).cadastrarFornecedor({ nome: 'X', documento: null, telefone: null, contato: null, observacao: null })).rejects.toMatchObject({ status: 403 });
  });
});

describe('Produtos · fornecedor principal', () => {
  it('o Dono escolhe o fornecedor no cadastro; desativado sai da lista; a API recusa fornecedor desativado', async () => {
    const a = api(ANA);
    const sul = await a.cadastrarFornecedor({ nome: 'Pet Sul', documento: null, telefone: null, contato: null, observacao: null });
    const norte = await a.cadastrarFornecedor({ nome: 'Pet Norte', documento: null, telefone: null, contato: null, observacao: null });
    await a.definirFornecedorAtivo(norte.id, false);
    render(<TelaProdutosEstoque api={a} papel="dono" fuso="America/Sao_Paulo" intervaloMs={60_000} confirmar={() => true} />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Cadastrar produto' }));
    const select = within(janela()).getByLabelText('Fornecedor principal (opcional)');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nenhum', 'Pet Sul']);
    await userEvent.type(within(janela()).getByLabelText('Nome do produto'), 'Areia 4 kg');
    await userEvent.type(within(janela()).getByLabelText('Preço de venda (R$)'), '24,90');
    await userEvent.selectOptions(select, 'Pet Sul');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar produto' }));
    await screen.findByText(/Areia 4 kg cadastrado/);
    expect((await a.listarProdutos())[0]!.fornecedorId).toBe(sul.id);
    await waitFor(() => expect(screen.getByText(/fornecedor: Pet Sul/)).toBeTruthy());
    await expect(a.criarProduto({ nome: 'Outro', codigoBarras: null, precoCentavos: 100, fornecedorId: norte.id })).rejects.toMatchObject({ status: 400 });
  });

  it('o Vendedor cadastra produto sem a lista de fornecedores', async () => {
    render(<TelaProdutosEstoque api={api(BRUNO)} papel="vendedor" fuso="America/Sao_Paulo" intervaloMs={60_000} />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Cadastrar produto' }));
    expect(within(janela()).queryByLabelText('Fornecedor principal (opcional)')).toBeNull();
  });
});
