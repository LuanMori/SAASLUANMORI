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
const api = (id: string, papel: 'dono' | 'administrador' | 'vendedor' | 'super_admin') =>
  criarApiLocal({ lojaId: 'loja-a', operador: { id, nome: id, papel }, exemplos: false, atrasoMs: 0, agora: AGORA });

function montar(id = 'ana', papel: 'dono' | 'administrador' | 'vendedor' | 'super_admin' = 'dono') {
  render(<TelaUsuarios api={api(id, papel)} eu={{ id, papel }} fuso="America/Sao_Paulo" agora={AGORA} />);
}

const linha = async (nome: string) => (await screen.findByRole('cell', { name: new RegExp(`^${nome}`) })).closest('tr') as HTMLElement;
/** Os papéis que a janela oferece (cartões), na ordem em que aparecem. */
const papeisDa = (janela: HTMLElement) => within(janela).getAllByRole('radio').map((r) => (r as HTMLInputElement).value);

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
    expect(papeisDa(screen.getByRole('dialog', { name: 'Novo usuário' }))).toEqual(['vendedor', 'personalizado']); // Dono e Administrador, só o Adm. Sup
    expect(within(screen.getByRole('dialog', { name: 'Novo usuário' })).getByText(/são cadastrados pelo suporte \(Adm\. Sup\)/)).toBeTruthy();
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
  it('Usuários abre a tela; o nome no canto abre Meu usuário, que troca a senha de verdade', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Meu usuário: Ana, Dono' }));
    const cartao = await screen.findByRole('region', { name: 'Trocar a senha' });
    await userEvent.type(within(cartao).getByLabelText('Senha atual'), 'demo1234');
    await userEvent.type(within(cartao).getByLabelText('Senha nova'), 'uma-frase-facil-de-lembrar');
    await userEvent.type(within(cartao).getByLabelText('Repita a senha nova'), 'uma-frase-facil-de-lembrar');
    await userEvent.click(within(cartao).getByRole('button', { name: 'Trocar a senha' }));
    expect(await within(cartao).findByText(/Senha trocada/)).toBeTruthy();
    expect((within(cartao).getByLabelText('Senha atual') as HTMLInputElement).value).toBe(''); // o formulário volta vazio
    expect((await entrarDemo('lojaa', 'ana', 'uma-frase-facil-de-lembrar', { atrasoMs: 0 })).ok).toBe(true);
  });
});

describe('TelaUsuarios: Personalizado e Adm. Sup (pedido do Luan, 23/11/2026)', () => {
  it('o Dono cadastra um Personalizado marcando as funções; a lista mostra quantas', async () => {
    montar();
    await linha('Ana');
    await userEvent.click(screen.getByRole('button', { name: '+ Novo usuário' }));
    const janela = screen.getByRole('dialog', { name: 'Novo usuário' });
    expect(papeisDa(janela)).toEqual(['vendedor', 'personalizado']);
    expect((within(janela).getByRole('radio', { name: /^Vendedor/ }) as HTMLInputElement).checked).toBe(true); // o padrão
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Gil Souza');
    await userEvent.type(within(janela).getByLabelText('Usuário (login)'), 'gil');
    await userEvent.click(within(janela).getByRole('radio', { name: /^Personalizado/ }));
    const funcoes = within(janela).getByRole('group', { name: 'O que esta pessoa acessa' });
    expect(within(funcoes).queryByLabelText(/Cadastrar, alterar e desativar usuários/)).toBeNull(); // não se dá
    expect(within(funcoes).queryByLabelText(/Dar brinde/)).toBeNull(); // só do Dono
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar' }));
    expect(within(janela).getByText('Marque pelo menos uma função para o Personalizado.')).toBeTruthy();
    await userEvent.click(within(funcoes).getByRole('checkbox', { name: 'Frente de caixa' }));
    await userEvent.click(within(funcoes).getByRole('checkbox', { name: 'Relatórios' }));
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pronto' }));
    const gil = await linha('Gil Souza');
    expect(within(gil).getByRole('cell', { name: /^Personalizado/ }).textContent).toBe('Personalizado · 2 funções');
  });

  it('o Adm. Sup vê as opções Dono e Administrador', async () => {
    await entrarDemo('lojaa', 'suporte', 'demo1234', { agora: AGORA, atrasoMs: 0 });
    montar('adm-sup', 'super_admin');
    await linha('Ana');
    await userEvent.click(screen.getByRole('button', { name: '+ Novo usuário' }));
    const janela = screen.getByRole('dialog', { name: 'Novo usuário' });
    expect(papeisDa(janela)).toEqual(['vendedor', 'personalizado', 'dono', 'administrador']);
    expect(within(janela).getByText('Só o suporte, na implantação')).toBeTruthy();
    expect(within(janela).queryByText(/são cadastrados pelo suporte/)).toBeNull();
  });

  it('Vendedor e Personalizado em cartões, com o que cada um faz', async () => {
    montar();
    await linha('Ana');
    await userEvent.click(screen.getByRole('button', { name: '+ Novo usuário' }));
    const janela = screen.getByRole('dialog', { name: 'Novo usuário' });
    expect(within(janela).getByRole('radio', { name: /^Vendedor/ }).closest('label')?.textContent).toBe(
      'VendedorVender na Frente de caixa, abrir e fechar o caixa, cadastrar e consultar clientes e cadastrar produto novo.',
    );
    expect(within(janela).getByRole('radio', { name: /^Personalizado/ }).closest('label')?.textContent).toBe('PersonalizadoVocê escolhe o que a pessoa acessa, tela por tela.');
    expect(within(janela).queryByRole('group', { name: 'O que esta pessoa acessa' })).toBeNull(); // só no Personalizado
  });

  it('Personalizado tela por tela: o extra só com a tela marcada; tirar a tela tira os extras; editar mantém', async () => {
    montar();
    await linha('Ana');
    await userEvent.click(screen.getByRole('button', { name: '+ Novo usuário' }));
    const janela = screen.getByRole('dialog', { name: 'Novo usuário' });
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Lia Rocha');
    await userEvent.type(within(janela).getByLabelText('Usuário (login)'), 'lia');
    await userEvent.click(within(janela).getByRole('radio', { name: /^Personalizado/ }));
    const telas = within(janela).getByRole('group', { name: 'O que esta pessoa acessa' });
    expect(within(telas).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Frente de caixa',
      'Caixa do dia',
      'Produtos e estoque',
      'Compras',
      'Clientes',
      'Financeiro',
      'Relatórios',
      'Dados e backup',
      'Regras da loja',
    ]);
    const clientes = within(telas).getByRole('group', { name: 'Clientes' });
    const cpf = within(clientes).getByRole('checkbox', { name: 'Ver o CPF completo do cliente' }) as HTMLInputElement;
    expect(cpf.disabled).toBe(true); // sem a tela, o extra não vale
    await userEvent.click(within(clientes).getByRole('checkbox', { name: 'Clientes' }));
    expect(cpf.disabled).toBe(false);
    await userEvent.click(cpf);
    await userEvent.click(within(clientes).getByRole('checkbox', { name: 'Clientes' })); // tira a tela...
    expect(cpf.checked).toBe(false); // ...e o extra sai junto
    expect(cpf.disabled).toBe(true);
    await userEvent.click(within(clientes).getByRole('checkbox', { name: 'Clientes' }));
    await userEvent.click(cpf);
    // Produtos e estoque é de todos: os extras valem sem marcar a tela
    const produtos = within(telas).getByRole('group', { name: 'Produtos e estoque' });
    expect(within(produtos).queryByRole('checkbox', { name: 'Produtos e estoque' })).toBeNull();
    await userEvent.click(within(produtos).getByRole('checkbox', { name: 'Cadastrar produto novo' }));
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pronto' }));
    expect(within(await linha('Lia Rocha')).getByRole('cell', { name: /^Personalizado/ }).textContent).toBe('Personalizado · 3 funções');
    const lia = (await api('ana', 'dono').listarUsuarios()).find((u) => u.usuario === 'lia')!;
    expect(lia.permissoes).toEqual(['clientes', 'clientes.cpf', 'produtos.cadastrar']);

    // editar: as telas marcadas voltam marcadas; trocar Clientes por Financeiro
    await userEvent.click(within(await linha('Lia Rocha')).getByRole('button', { name: 'Editar Lia Rocha' }));
    const edicao = screen.getByRole('dialog', { name: 'Editar Lia Rocha' });
    const telasEd = within(edicao).getByRole('group', { name: 'O que esta pessoa acessa' });
    expect((within(telasEd).getByRole('checkbox', { name: 'Clientes' }) as HTMLInputElement).checked).toBe(true);
    expect((within(telasEd).getByRole('checkbox', { name: 'Ver o CPF completo do cliente' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(telasEd).getByRole('checkbox', { name: 'Clientes' }));
    await userEvent.click(within(telasEd).getByRole('checkbox', { name: 'Financeiro' }));
    await userEvent.click(within(edicao).getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect((await api('ana', 'dono').listarUsuarios()).find((u) => u.usuario === 'lia')!.permissoes).toEqual(['produtos.cadastrar', 'financeiro']));
  });

  it('editando o Caio (Administrador), o Dono vê o papel atual à parte e pode passá-lo a Vendedor', async () => {
    montar();
    await userEvent.click(within(await linha('Caio')).getByRole('button', { name: 'Editar Caio' }));
    const edicao = screen.getByRole('dialog', { name: 'Editar Caio' });
    expect(papeisDa(edicao)).toEqual(['vendedor', 'personalizado', 'administrador']);
    expect(within(edicao).getByText('Papel atual')).toBeTruthy();
    expect((within(edicao).getByRole('radio', { name: /^Administrador/ }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(edicao).getByRole('radio', { name: /^Vendedor/ }));
    await userEvent.click(within(edicao).getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect((await api('ana', 'dono').listarUsuarios()).find((u) => u.usuario === 'caio')!.papel).toBe('vendedor'));
  });

  it('a própria pessoa não troca o próprio papel: os cartões ficam travados', async () => {
    montar();
    await userEvent.click(within(await linha('Ana')).getByRole('button', { name: 'Editar Ana' }));
    const edicao = screen.getByRole('dialog', { name: 'Editar Ana' });
    expect(within(edicao).getAllByRole('radio').every((r) => (r as HTMLInputElement).disabled)).toBe(true);
    expect((within(edicao).getByRole('radio', { name: /^Dono/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(edicao).getByText('Ninguém muda o próprio papel nem as próprias funções. Peça a outro Dono.')).toBeTruthy();
  });
});
