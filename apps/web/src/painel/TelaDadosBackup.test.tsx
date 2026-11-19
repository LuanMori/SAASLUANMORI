// apps/web/src/painel/TelaDadosBackup.test.tsx
// Dados e backup → Dados da loja e Regras gerais, ligados à API da demonstração.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { lerPercentual, prepararLogo, TelaDadosBackup } from './TelaDadosBackup';
import { descreverAuditoria } from './TelaUsuarios';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const arquivoPng = (nome = 'logo.png') => new File([Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0))], nome, { type: 'image/png' });

const api = (papel: 'dono' | 'administrador' | 'vendedor' = 'dono') =>
  criarApiLocal({ lojaId: 'loja-a', operador: { id: papel === 'dono' ? 'ana' : papel === 'administrador' ? 'caio' : 'bruno', nome: 'Pessoa', papel }, exemplos: false, atrasoMs: 0 });

describe('TelaDadosBackup · Dados da loja', () => {
  it('mostra o nome e a descrição da loja e salva só o que mudou (com histórico)', async () => {
    const aoMudar = vi.fn();
    const a = api();
    render(<TelaDadosBackup api={a} papel="dono" aoMudar={aoMudar} />);
    const nome = await screen.findByLabelText('Nome da loja');
    expect((nome as HTMLInputElement).value).toBe('Loja A');
    expect((screen.getByLabelText(/^Descrição/) as HTMLInputElement).value).toBe('Rações, petiscos e acessórios');
    const salvar = screen.getByRole('button', { name: 'Salvar os dados da loja' });
    expect((salvar as HTMLButtonElement).disabled).toBe(true); // nada mudou ainda

    await userEvent.clear(nome);
    await userEvent.type(nome, 'Pet Center');
    await userEvent.click(salvar);
    expect(await screen.findByText('Dados da loja salvos.')).toBeTruthy();
    expect(aoMudar).toHaveBeenCalled();
    expect((await a.lerConfiguracao()).dados.nome).toBe('Pet Center');

    const hist = await a.listarAuditoria();
    expect(hist[0]!.acao).toBe('loja.dados_alterados');
    expect(descreverAuditoria(hist[0]!)).toBe('Dados da loja alterados (nome)');
  });

  it('nome vazio é recusado com a mensagem da regra', async () => {
    render(<TelaDadosBackup api={api()} papel="dono" />);
    const nome = await screen.findByLabelText('Nome da loja');
    await userEvent.clear(nome);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar os dados da loja' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Informe o nome da loja.');
  });

  it('logo: escolhe a imagem, mostra a prévia, salva e tira', async () => {
    const a = api();
    render(<TelaDadosBackup api={a} papel="dono" />);
    await screen.findByLabelText('Nome da loja');
    await userEvent.upload(screen.getByLabelText('Escolher a imagem do logo'), arquivoPng());
    await waitFor(() => expect(document.querySelector('.db-logo-previa img')?.getAttribute('src')).toBe(`data:image/png;base64,${PNG_BASE64}`));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar os dados da loja' }));
    await screen.findByText('Dados da loja salvos.');
    expect((await a.lerConfiguracao()).dados.logo).toBe(`data:image/png;base64,${PNG_BASE64}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Tirar o logo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar os dados da loja' }));
    await waitFor(async () => expect((await a.lerConfiguracao()).dados.logo).toBeNull());
  });

  it('arquivo que não é imagem aceita é recusado antes de enviar', async () => {
    await expect(prepararLogo(new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' }))).rejects.toThrow('Escolha uma imagem PNG, JPEG ou WebP.');
    const grande = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' });
    await expect(prepararLogo(grande)).rejects.toThrow('A imagem passa de 5 MB. Escolha uma menor.');
    await expect(prepararLogo(arquivoPng())).resolves.toBe(`data:image/png;base64,${PNG_BASE64}`);
  });
});

describe('TelaDadosBackup · Regras gerais', () => {
  it('o desconto sem senha muda e passa a valer na Frente de caixa', async () => {
    const a = api();
    render(<TelaDadosBackup api={a} papel="dono" />);
    const campo = await screen.findByLabelText('Desconto que o Vendedor dá sem senha (%)');
    expect((campo as HTMLInputElement).value).toBe('10');
    await userEvent.clear(campo);
    await userEvent.type(campo, '12,5');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar a regra' }));
    expect(await screen.findByText(/Regra salva/)).toBeTruthy();
    expect((await a.lerConfiguracao()).regras.venda.descontoSemSenhaPct).toBe(12.5);
    expect(descreverAuditoria((await a.listarAuditoria())[0]!)).toBe('Regras da loja alteradas (desconto sem senha)');
  });

  it('fora dos limites do DaniPets: a mensagem da regra aparece e nada muda', async () => {
    const a = api();
    render(<TelaDadosBackup api={a} papel="dono" />);
    const campo = await screen.findByLabelText('Desconto que o Vendedor dá sem senha (%)');
    await userEvent.clear(campo);
    await userEvent.type(campo, '60');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar a regra' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Desconto que o Vendedor dá sem senha (%): de 0 a 50, com até 2 casas.');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'dez');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar a regra' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Informe um número de 0 a 50/);
    expect((await a.lerConfiguracao()).regras.venda.descontoSemSenhaPct).toBe(10);
  });

  it('lerPercentual aceita vírgula ou ponto e recusa texto', () => {
    expect(lerPercentual('12,5')).toBe(12.5);
    expect(lerPercentual(' 7.25 % ')).toBe(7.25);
    expect(lerPercentual('0')).toBe(0);
    expect(lerPercentual('')).toBeNull();
    expect(lerPercentual('-3')).toBeNull();
    expect(lerPercentual('dez')).toBeNull();
  });
});

describe('TelaDadosBackup · quem pode', () => {
  it('o Vendedor não altera (a API recusa mesmo se a tela fosse forçada)', async () => {
    const b = api('vendedor');
    await expect(b.salvarDadosDaLoja({ nome: 'Outra' })).rejects.toMatchObject({ status: 403, message: 'Alterar os dados e as regras da loja: só o Dono ou o Administrador.' });
    await expect(b.salvarRegrasDaLoja({ venda: { descontoSemSenhaPct: 50 } })).rejects.toMatchObject({ status: 403 });
    render(<TelaDadosBackup api={b} papel="vendedor" />);
    await screen.findByLabelText('Nome da loja');
    expect(screen.queryByRole('button', { name: 'Salvar os dados da loja' })).toBeNull();
    expect((screen.getByLabelText('Nome da loja') as HTMLInputElement).disabled).toBe(true);
  });

  it('o Administrador altera', async () => {
    const c = api('administrador');
    await expect(c.salvarDadosDaLoja({ descricao: 'Banho e tosa' })).resolves.toMatchObject({ descricao: 'Banho e tosa' });
  });
});
