// apps/web/src/painel/TelaUsuarios.test.tsx
// Aba Usuários, ligada à API da demonstração (as mesmas regras do servidor).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemAuditoria } from '../api';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo, entrarDemo } from '../demo/usuariosDemo';
import { TelaPainel } from './TelaPainel';
import { descreverAuditoria, sortearSenhaProvisoria, TelaUsuarios } from './TelaUsuarios';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const AGORA = () => new Date('2026-11-18T15:00:00Z');
const api = (id: string, papel: 'dono' | 'administrador' | 'vendedor') =>
  criarApiLocal({ lojaId: 'loja-a', operador: { id, nome: id, papel }, exemplos: false, atrasoMs: 0, agora: AGORA });

function montar(id = 'ana', papel: 'dono' | 'administrador' | 'vendedor' = 'dono') {
  render(<TelaUsuarios api={api(id, papel)} eu={{ id, papel }} fuso="America/Sao_Paulo" agora={AGORA} />);
}

const linha = async (nome: string) => (await screen.findByRole('cell', { name: new RegExp(`^${nome}`) })).closest('tr') as HTMLElement;

describe('TelaUsuarios', () => {
  it('lista a equipe com papel e situação; a própria linha não tem Desativar nem Nova senha', async () => {
    montar();
    const ana = await linha('Ana');
    expect(within(ana).getByText('(você)')).toBeTruthy();
    expect(within(ana).queryByRole('button', { name: /Desativar/ })).toBeNull();
    expect(within(ana).queryByRole('button', { name: /Nova senha/ })).toBeNull();
    const carla = await linha('Carla');
    expect(within(carla).getByText('Desativado')).toBeTruthy();
    expect(within(carla).getByRole('button', { name: 'Excluir os dados de Carla' })).toBeTruthy();
    expect(within(await linha('Bruno')).getByText('Vendedor')).toBeTruthy();
  });

  it('cadastra com senha provisória, mostra a senha para entregar, e a pessoa entra com ela', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: '+ Novo usuário' }));
    const janela = screen.getByRole('dialog', { name: 'Novo usuário' });
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Joana Lima');
    await userEvent.type(within(janela).getByLabelText('Usuário (login)'), 'Joana');
    const senha = within(janela).getByLabelText('Senha provisória') as HTMLInputElement;
    expect(senha.value).toMatch(/^[a-z2-9]{10}$/);
    await userEvent.clear(senha);
    await userEvent.type(senha, 'senha-inicial-77');
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar' }));

    const pronto = await screen.findByRole('dialog', { name: 'Usuário criado' });
    expect(within(pronto).getByLabelText('Senha provisória').textContent).toBe('senha-inicial-77');
    await userEvent.click(within(pronto).getByRole('button', { name: 'Pronto' }));
    expect(within(await linha('Joana Lima')).getByText('Senha provisória')).toBeTruthy();
    expect(await entrarDemo('lojaa', 'joana', 'senha-inicial-77', { atrasoMs: 0 })).toMatchObject({ ok: true, usuario: { senhaProvisoria: true } });
  });

  it('mostra os erros de cada campo e a recusa do servidor (login repetido)', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: '+ Novo usuário' }));
    const janela = screen.getByRole('dialog', { name: 'Novo usuário' });
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar' }));
    expect(within(janela).getByText('Informe o nome da pessoa.')).toBeTruthy();
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Bruno Dois');
    await userEvent.type(within(janela).getByLabelText('Usuário (login)'), 'bruno');
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(janela).findByText('Já existe o usuário "bruno" nesta loja. Escolha outro login.')).toBeTruthy();
  });

  it('o Administrador não tem a opção Dono nem mexe na linha do Dono', async () => {
    montar('caio', 'administrador');
    const ana = await linha('Ana');
    expect(within(ana).queryByRole('button')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '+ Novo usuário' }));
    const papeis = within(screen.getByRole('dialog', { name: 'Novo usuário' })).getAllByRole('option').map((o) => o.textContent);
    expect(papeis).toEqual(['Administrador', 'Vendedor']);
  });

  it('desativa (com aviso), cria nova senha provisória e exclui os dados do desativado', async () => {
    montar();
    await userEvent.click(within(await linha('Bruno')).getByRole('button', { name: 'Desativar Bruno' }));
    expect(await screen.findByText('Bruno foi desativado. As sessões abertas dele terminaram.')).toBeTruthy();

    await userEvent.click(within(await linha('Caio')).getByRole('button', { name: 'Nova senha para Caio' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Nova senha para Caio' })).getByRole('button', { name: 'Criar senha provisória' }));
    expect(await screen.findByRole('dialog', { name: 'Senha provisória criada' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Pronto' }));

    await userEvent.click(within(await linha('Bruno')).getByRole('button', { name: 'Excluir os dados de Bruno' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Excluir os dados de Bruno' })).getByRole('button', { name: 'Excluir os dados' }));
    expect(await screen.findByText(/Dados pessoais excluídos/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('cell', { name: /^Bruno/ })).toBeNull());
    expect(screen.getAllByRole('cell', { name: 'Usuário removido' }).length).toBeGreaterThan(0);
  });

  it('o histórico mostra quem fez o quê', async () => {
    await entrarDemo('lojaa', 'ana', 'demo1234', { atrasoMs: 0 });
    montar();
    expect(await screen.findByRole('cell', { name: 'Entrou no sistema' })).toBeTruthy();
  });

  it('a tabela de permissões é a mesma matriz do servidor', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver' }));
    const brinde = screen.getByRole('cell', { name: 'Dar brinde (preço R$ 0,00) sem pedir senha' }).closest('tr') as HTMLElement;
    expect(within(brinde).getAllByLabelText('pode')).toHaveLength(1);
    const vender = screen.getByRole('cell', { name: 'Vender na Frente de caixa' }).closest('tr') as HTMLElement;
    expect(within(vender).getAllByLabelText('pode')).toHaveLength(3);
  });
});

describe('descreverAuditoria e senha sorteada', () => {
  const base: ItemAuditoria = { id: '1', acao: 'usuario.criado', texto: 'Usuário criado', quem: 'Ana', alvo: { tipo: 'usuario', id: 'x', nome: 'Joana' }, detalhes: { papel: 'vendedor' }, criadoEm: '' };
  it('junta o texto, o alvo e o papel', () => {
    expect(descreverAuditoria(base)).toBe('Usuário criado: Joana (Vendedor)');
    expect(descreverAuditoria({ ...base, acao: 'usuario.alterado', texto: 'Usuário alterado', detalhes: { papelAntes: 'vendedor', papelDepois: 'administrador' } })).toBe(
      'Usuário alterado: Joana (papel: Vendedor → Administrador)',
    );
    expect(descreverAuditoria({ ...base, acao: 'sessao.entrou', texto: 'Entrou no sistema', alvo: null, detalhes: {} })).toBe('Entrou no sistema');
    // o resumo vem pronto da API quando ela manda (servidor e demonstração usam o mesmo @saas/core)
    expect(descreverAuditoria({ ...base, acao: 'venda.cancelada', texto: 'Venda cancelada', alvo: null, detalhes: {}, resumo: 'venda nº 00012 • autorizado por Ana' })).toBe(
      'Venda cancelada (venda nº 00012 • autorizado por Ana)',
    );
  });

  it('a senha sorteada não tem letras que confundem', () => {
    for (let i = 0; i < 30; i += 1) expect(sortearSenhaProvisoria()).toMatch(/^[a-km-np-z2-9]{10}$/);
  });
});

describe('na barra lateral', () => {
  it('Usuários abre a tela; "Trocar senha" abre a janela e troca de verdade', async () => {
    render(
      <TelaPainel
        loja={{ nome: 'Loja A' }}
        pessoa={{ id: 'ana', nome: 'Ana', usuario: 'ana', papel: 'dono' }}
        aoSair={vi.fn()}
        api={api('ana', 'dono')}
        agora={AGORA}
        secaoInicial="usuarios"
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    const janela = screen.getByRole('dialog', { name: 'Trocar minha senha' });
    await userEvent.type(within(janela).getByLabelText('Senha atual'), 'demo1234');
    await userEvent.type(within(janela).getByLabelText('Senha nova'), 'uma-frase-facil-de-lembrar');
    await userEvent.type(within(janela).getByLabelText('Repita a senha nova'), 'uma-frase-facil-de-lembrar');
    await userEvent.click(within(janela).getByRole('button', { name: 'Trocar a senha' }));
    expect(await screen.findByText(/Senha trocada/)).toBeTruthy();
    expect((await entrarDemo('lojaa', 'ana', 'uma-frase-facil-de-lembrar', { atrasoMs: 0 })).ok).toBe(true);
  });
});
