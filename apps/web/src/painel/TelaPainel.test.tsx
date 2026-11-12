// apps/web/src/painel/TelaPainel.test.tsx
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { iniciais } from './BarraLateral';
import { ITENS_MENU } from './menu';
import { TelaPainel } from './TelaPainel';

afterEach(cleanup);

const ORDEM_DANIPETS = [
  'Visão geral',
  'Frente de caixa',
  'Caixa do dia',
  'Produtos e estoque',
  'Compras',
  'Clientes',
  'Financeiro',
  'Relatórios',
  'Dados e backup',
  'Usuários',
  'Suporte',
];

function montar(aoSair = vi.fn()) {
  render(
    <TelaPainel
      loja={{ nome: 'Loja A', descricao: 'Rações, petiscos e acessórios' }}
      pessoa={{ nome: 'Ana', papel: 'Dono' }}
      aoSair={aoSair}
      hoje={new Date(2026, 10, 12, 9, 0)}
    />,
  );
  const menu = screen.getByRole('navigation', { name: 'Menu principal' });
  return { aoSair, menu, itens: within(menu).getAllByRole('button') };
}

describe('TelaPainel', () => {
  it('barra lateral com os itens do DaniPets, na mesma ordem', () => {
    const { itens } = montar();
    expect(itens.map((b) => b.textContent)).toEqual(ORDEM_DANIPETS);
    expect(ITENS_MENU).toHaveLength(ORDEM_DANIPETS.length);
  });

  it('abre na Visão geral, marcada como página atual', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Visão geral', current: 'page' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeTruthy();
    expect(screen.getByText(/Bom dia, Ana/)).toBeTruthy();
  });

  it('escolher outro item só marca a seleção: conteúdo em branco por enquanto', async () => {
    const { itens } = montar();
    for (const item of itens.slice(1)) {
      await userEvent.click(item);
      expect(item.getAttribute('aria-current')).toBe('page');
      expect(itens.filter((b) => b.getAttribute('aria-current') === 'page')).toHaveLength(1);
      expect(screen.getByRole('main').textContent).toBe('');
    }
    await userEvent.click(itens[0]!);
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeTruthy();
  });

  it('mostra loja, pessoa e papel; Sair chama aoSair', async () => {
    const { aoSair } = montar();
    const barra = screen.getByRole('complementary', { name: 'Menu' });
    expect(within(barra).getByText('Loja A')).toBeTruthy();
    expect(within(barra).getByText('Rações, petiscos e acessórios')).toBeTruthy();
    expect(within(barra).getByText('Ana')).toBeTruthy();
    expect(within(barra).getByText('Dono')).toBeTruthy();
    await userEvent.click(within(barra).getByRole('button', { name: 'Sair' }));
    expect(aoSair).toHaveBeenCalledOnce();
  });

  it('botão Menu (celular) abre e fecha a gaveta; Esc fecha', async () => {
    montar();
    const botao = screen.getByRole('button', { name: 'Menu' });
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(botao);
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
