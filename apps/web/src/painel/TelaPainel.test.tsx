// apps/web/src/painel/TelaPainel.test.tsx
import type { PapelDeLoja } from '@saas/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { iniciais } from './BarraLateral';
import { TelaPainel } from './TelaPainel';

afterEach(cleanup);

// Igual ao DaniPets V9.3.3.
const GRUPOS_V933 = {
  Operação: ['Visão geral', 'Caixa do dia'],
  Cadastros: ['Produtos e estoque', 'Compras', 'Clientes'],
  Gestão: ['Financeiro', 'Relatórios'],
  Sistema: ['Usuários', 'Dados e backup', 'Suporte'],
};

function montar(papel: PapelDeLoja = 'dono', aoSair = vi.fn()) {
  render(
    <TelaPainel
      loja={{ nome: 'Loja A', descricao: 'Rações, petiscos e acessórios' }}
      pessoa={{ nome: 'Ana', papel }}
      aoSair={aoSair}
      hoje={new Date(2026, 10, 12, 9, 0)}
    />,
  );
  const barra = screen.getByRole('complementary', { name: 'Barra lateral' });
  const menu = screen.getByRole('navigation', { name: 'Menu principal' });
  const grupos = () =>
    Object.fromEntries(
      within(menu)
        .getAllByRole('group')
        .map((g) => [g.getAttribute('aria-label'), within(g).getAllByRole('button').map((b) => b.textContent)]),
    );
  return { aoSair, barra, menu, grupos };
}

describe('TelaPainel · barra lateral do DaniPets V9.3.3', () => {
  it('"Frente de caixa" em destaque, fora do menu, antes dos grupos', () => {
    const { barra, menu } = montar();
    const caixa = within(barra).getByRole('button', { name: 'Frente de caixa' });
    expect(caixa.className).toContain('nav-pos');
    expect(menu.contains(caixa)).toBe(false);
    expect(caixa.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Dono vê os 4 grupos com os itens na mesma ordem do DaniPets', () => {
    expect(montar('dono').grupos()).toEqual(GRUPOS_V933);
  });

  it('Administrador vê o mesmo que o Dono', () => {
    expect(montar('administrador').grupos()).toEqual(GRUPOS_V933);
  });

  it('Vendedor não vê Compras, Financeiro, Relatórios nem Dados e backup (e o grupo Gestão some)', () => {
    expect(montar('vendedor').grupos()).toEqual({
      Operação: ['Visão geral', 'Caixa do dia'],
      Cadastros: ['Produtos e estoque', 'Clientes'],
      Sistema: ['Usuários', 'Suporte'],
    });
    expect(screen.getByRole('button', { name: 'Frente de caixa' })).toBeTruthy();
  });

  it('abre na Visão geral, marcada como página atual', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Visão geral', current: 'page' }).className).toContain('active');
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeTruthy();
    expect(screen.getByText(/Bom dia, Ana/)).toBeTruthy();
  });

  it('escolher outro item só marca a seleção: conteúdo em branco por enquanto', async () => {
    const { barra } = montar();
    const itens = within(barra)
      .getAllByRole('button')
      .filter((b) => b.classList.contains('nav'));
    expect(itens).toHaveLength(11);
    for (const item of itens.filter((b) => b.textContent !== 'Visão geral')) {
      await userEvent.click(item);
      expect(item.getAttribute('aria-current')).toBe('page');
      expect(itens.filter((b) => b.getAttribute('aria-current') === 'page')).toHaveLength(1);
      expect(screen.getByRole('main').textContent).toBe('');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeTruthy();
  });

  it('bloco da pessoa: inicial, nome, papel, tema, Trocar senha e Sair', async () => {
    const { barra, aoSair } = montar('administrador');
    expect(within(barra).getByText('Ana')).toBeTruthy();
    expect(within(barra).getByText('Administrador')).toBeTruthy();
    expect(within(barra).getByRole('button', { name: 'Trocar o tema (claro ou escuro)' })).toBeTruthy();
    expect(within(barra).getByRole('button', { name: 'Trocar senha' })).toBeTruthy();
    await userEvent.click(within(barra).getByRole('button', { name: 'Sair' }));
    expect(aoSair).toHaveBeenCalledOnce();
  });

  it('loja no topo e versão no rodapé', () => {
    const { barra } = montar();
    expect(within(barra).getByText('Loja A')).toBeTruthy();
    expect(within(barra).getByText('Rações, petiscos e acessórios')).toBeTruthy();
    expect(within(barra).getByText(/V0\.1 • Nome da empresa/)).toBeTruthy();
  });
});

describe('iniciais', () => {
  it.each([
    ['Loja A', 'LA'],
    ['Pet Shop da Ana', 'PA'],
    ['Dani Pet’s', 'DP'],
    ['Mercado', 'M'],
    ['  ', '?'],
  ])('%s -> %s', (nome, esperado) => expect(iniciais(nome)).toBe(esperado));
});
