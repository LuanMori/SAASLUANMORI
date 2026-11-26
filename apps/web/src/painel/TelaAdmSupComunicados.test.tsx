// apps/web/src/painel/TelaAdmSupComunicados.test.tsx — Adm. Sup: atualizações e avisos (módulo 13) na tela de Dados e
// backup, e o que a equipe da loja vê no alto da tela e no rodapé da barra.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { proximaVersao } from './dados/ParteAdmSup';
import { TelaDadosBackup } from './TelaDadosBackup';
import { TelaPainel } from './TelaPainel';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const AGORA = new Date('2026-11-25T15:00:00Z');
const agora = () => AGORA;
const SUPORTE = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const api = (operador: { id: string; nome: string; papel: string }) =>
  criarApiLocal({ lojaId: 'loja-a', operador: operador as typeof BRUNO, exemplos: false, atrasoMs: 0, agora });

async function parteDoAdmSup() {
  const aoMudar = vi.fn();
  render(<TelaDadosBackup api={api(SUPORTE)} papel="super_admin" fuso="America/Sao_Paulo" agora={agora} aoMudar={aoMudar} />);
  await screen.findByLabelText('Nome da loja');
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Partes de Dados e backup' })).getByRole('button', { name: 'Adm. Sup' }));
  return aoMudar;
}

describe('Adm. Sup → atualizações e avisos', () => {
  it('publica a versão nova com as novidades; ela aparece na lista e a versão de agora muda', async () => {
    const aoMudar = await parteDoAdmSup();
    const cartao = screen.getByRole('region', { name: 'Atualizações do sistema' });
    expect(within(cartao).getByText('V0.1')).toBeTruthy();
    expect((within(cartao).getByLabelText('Versão nova') as HTMLInputElement).placeholder).toBe('Ex.: V0.2');
    await userEvent.type(within(cartao).getByLabelText('Versão nova'), '0.2');
    await userEvent.type(within(cartao).getByLabelText('Novidades (uma por linha)'), 'Aba Meu usuário{enter}Importar planilhas');
    await userEvent.click(within(cartao).getByRole('button', { name: 'Publicar a atualização' }));
    expect(await within(cartao).findByText('Versão V0.2 publicada. A equipe de todas as lojas vê as novidades no alto da tela.')).toBeTruthy();
    const lista = within(cartao).getByRole('list', { name: 'Atualizações publicadas' });
    expect(lista.textContent).toContain('V0.2');
    expect(within(lista).getAllByRole('listitem').map((li) => li.textContent)).toEqual(expect.arrayContaining(['Aba Meu usuário', 'Importar planilhas']));
    expect(aoMudar).toHaveBeenCalled();
    expect(proximaVersao('V0.9')).toBe('V0.10');
  });

  it('publica um aviso para a equipe desta loja e encerra', async () => {
    await parteDoAdmSup();
    const cartao = screen.getByRole('region', { name: 'Avisos para a equipe desta loja' });
    await userEvent.type(within(cartao).getByLabelText('Aviso'), 'Manutenção amanhã às 22h');
    await userEvent.click(within(cartao).getByRole('radio', { name: 'Atenção' }));
    await userEvent.click(within(cartao).getByRole('button', { name: 'Publicar o aviso' }));
    expect(await within(cartao).findByText(/^Aviso publicado/)).toBeTruthy();
    const lista = within(cartao).getByRole('list', { name: 'Avisos publicados' });
    expect(lista.textContent).toContain('Ativo · Atenção · publicado em 25/11/2026');
    await userEvent.click(within(lista).getByRole('button', { name: 'Encerrar o aviso: Manutenção amanhã às 22h' }));
    expect(await within(cartao).findByText('Aviso encerrado: ele sai da tela da equipe.')).toBeTruthy();
    await waitFor(() => expect(within(cartao).getByRole('list', { name: 'Avisos publicados' }).textContent).toContain('Encerrado'));
  });
});

describe('a equipe da loja', () => {
  it('vê as novidades e o aviso no alto da tela, até clicar em "Entendi"; a versão vai para o rodapé', async () => {
    const sup = api(SUPORTE);
    await sup.publicarAtualizacao({ versao: 'V0.2', novidades: 'Aba Meu usuário\nImportar planilhas' });
    await sup.criarAvisoDaEquipe({ texto: 'Manutenção amanhã às 22h', importancia: 'atencao' });
    render(<TelaPainel loja={{ nome: 'Loja A' }} pessoa={{ ...BRUNO, usuario: 'bruno' }} aoSair={vi.fn()} api={api(BRUNO)} agora={agora} />);

    expect(await screen.findByText(/^Aba Meu usuário • Importar planilhas$/)).toBeTruthy();
    expect(screen.getByText('Novidades da versão V0.2:')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Aviso do suporte: Manutenção amanhã às 22h');
    expect(within(screen.getByRole('complementary', { name: 'Barra lateral' })).getByText(/V0\.2 • Nome da empresa/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Entendi: Manutenção amanhã às 22h' }));
    expect(screen.queryByText(/Aviso do suporte/)).toBeNull();
    // e não volta ao abrir de novo
    cleanup();
    render(<TelaPainel loja={{ nome: 'Loja A' }} pessoa={{ ...BRUNO, usuario: 'bruno' }} aoSair={vi.fn()} api={api(BRUNO)} agora={agora} />);
    await screen.findByText('Novidades da versão V0.2:');
    await waitFor(() => expect(screen.queryByText(/Aviso do suporte/)).toBeNull());
  });
});
