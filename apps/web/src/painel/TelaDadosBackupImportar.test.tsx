// apps/web/src/painel/TelaDadosBackupImportar.test.tsx
// Dados e backup → Importar e exportar → "Importar uma planilha" (módulo 13; DaniPets DAT-07): o modelo para baixar, a
// prévia linha por linha e a importação; quem vê o cartão.
import { colunasClientes } from '@saas/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { lerArquivoDePlanilha } from '../relatorios/lerPlanilha';
import { TelaDadosBackup } from './TelaDadosBackup';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const AGORA = new Date('2026-11-25T15:00:00Z');
const api = (operador: { id: string; nome: string; papel: string; permissoes?: string[] } = { id: 'ana', nome: 'Ana', papel: 'dono' }) =>
  criarApiLocal({ lojaId: 'loja-a', operador: operador as { id: string; nome: string; papel: 'dono' }, exemplos: false, atrasoMs: 0, agora: () => AGORA });
const csv = (texto: string, nome = 'produtos.csv') => new File([texto], nome, { type: 'text/csv' });

async function abrir(props: Partial<Parameters<typeof TelaDadosBackup>[0]> & { api: ReturnType<typeof api> }) {
  render(<TelaDadosBackup papel="dono" fuso="America/Sao_Paulo" agora={() => AGORA} {...props} />);
  await screen.findByLabelText('Nome da loja');
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Partes de Dados e backup' })).getByRole('button', { name: 'Importar e exportar' }));
  return screen.getByRole('region', { name: 'Importar uma planilha' });
}

describe('Importar uma planilha', () => {
  it('a prévia mostra cada linha que não entra (ou entra com aviso); importa só as certas', async () => {
    const a = api();
    await a.criarProduto({ nome: 'Areia 4 kg', codigoBarras: '7896000300306', precoCentavos: 2490 });
    const cartao = await abrir({ api: a });
    expect(within(cartao).getByRole('radio', { name: 'Produtos' })).toHaveProperty('checked', true);

    const arquivo = csv('Nome;Código de barras;Preço de venda;Estoque;Fornecedor\nRação 3 kg;;79,90;10;\nAreia;7896000300306;24,90;;\nSem preço;;;;\nBifinho;;7,50;60;Fornecedor X\n');
    await userEvent.upload(within(cartao).getByLabelText('Escolher a planilha de produtos para importar'), arquivo);
    const previa = await within(cartao).findByRole('group', { name: 'O que a planilha traz' });
    expect(previa.textContent).toContain('produtos.csv: 2 linhas entram, 1 já cadastrada e 1 com erro.');
    expect(previa.textContent).toContain('Colunas usadas: Nome, Código de barras, Preço de venda, Estoque, Fornecedor.');
    const linhas = within(previa).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(linhas).toEqual([
      ['3', 'Areia', 'Já cadastrado', 'Já cadastrado com o código de barras 7896000300306: "Areia 4 kg".'],
      ['4', 'Sem preço', 'Com erro', 'Informe o preço de venda.'],
      ['5', 'Bifinho', 'Entra', 'O fornecedor "Fornecedor X" não está cadastrado: o produto entra sem fornecedor.'],
    ]);
    expect(previa.textContent).toContain('1 outra linha entra sem observação.');
    expect((await a.listarProdutos()).length).toBe(1); // a prévia não grava

    await userEvent.click(within(previa).getByRole('button', { name: 'Importar só as linhas certas (2)' }));
    expect(await within(cartao).findByText('2 produtos importados. 1 já existia e ficou como estava. 1 linha com erro ficou de fora.')).toBeTruthy();
    expect((await a.listarProdutos()).map((p) => p.nome)).toEqual(['Areia 4 kg', 'Bifinho', 'Ração 3 kg']);
    expect(within(cartao).queryByRole('group', { name: 'O que a planilha traz' })).toBeNull();
  });

  it('o modelo para baixar: os títulos do cadastro (com o campo extra da loja) e a aba "Como preencher"', async () => {
    const a = api();
    await a.salvarRegrasDaLoja({ clientes: { campoExtra: { ativo: true, rotulo: 'Pet' } } });
    const baixar = vi.fn();
    const cartao = await abrir({ api: a, baixar });
    await userEvent.click(within(cartao).getByRole('radio', { name: 'Clientes' }));
    await userEvent.click(within(cartao).getByRole('button', { name: 'Baixar o modelo' }));
    await vi.waitFor(() => expect(baixar).toHaveBeenCalled());
    const [nome, bytes] = baixar.mock.calls[0]!;
    expect(nome).toBe('modelo-clientes.xlsx');
    const tabela = await lerArquivoDePlanilha(new Blob([bytes as BlobPart]));
    expect(tabela).toEqual([colunasClientes('Pet').map((c) => c.titulo)]); // só os títulos: nenhuma linha de exemplo
    expect(new TextDecoder().decode(bytes)).toContain('Como preencher');
  });

  it('planilha sem as colunas do modelo: avisa e não mostra prévia; "Cancelar" volta para escolher', async () => {
    const cartao = await abrir({ api: api() });
    await userEvent.upload(within(cartao).getByLabelText('Escolher a planilha de produtos para importar'), csv('Produto;Valor\nRação;10\n'));
    expect((await within(cartao).findByRole('alert')).textContent).toBe('A planilha não tem as colunas "Nome" e "Preço de venda". Baixe o modelo para conferir os títulos.');
    await userEvent.upload(within(cartao).getByLabelText('Escolher a planilha de produtos para importar'), csv('Nome;Preço de venda\nRação;10\n'));
    const previa = await within(cartao).findByRole('group', { name: 'O que a planilha traz' });
    await userEvent.click(within(previa).getByRole('button', { name: 'Cancelar' }));
    expect(within(cartao).getByLabelText('Escolher a planilha de produtos para importar')).toBeTruthy();
  });

  it('cada cadastro aparece para quem tem o acesso da aba dele; sem nenhum, o cartão não aparece', async () => {
    const soDados = { id: 'paula', nome: 'Paula', papel: 'personalizado', permissoes: ['dados'] };
    await abrir({ api: api(soDados), papel: soDados }).catch(() => undefined);
    expect(screen.queryByRole('region', { name: 'Importar uma planilha' })).toBeNull();
    cleanup();
    const comClientes = { ...soDados, permissoes: ['dados', 'clientes'] };
    const cartao = await abrir({ api: api(comClientes), papel: comClientes });
    expect(within(cartao).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['Clientes']);
  });
});
