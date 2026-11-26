// apps/web/src/painel/TelaPainel.test.tsx
import type { PapelDeLoja } from '@saas/core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { darEstoque } from '../testes/estoque';
import { iniciais } from './BarraLateral';
import { TelaPainel } from './TelaPainel';

/** formatarCentavos usa espaço não separável depois de "R$"; nos testes comparamos com espaço comum. */
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// Igual ao DaniPets V9.3.3, mais "Meu usuário" no fim de Sistema (pedido do Luan, 25/11/2026: para todos).
const GRUPOS_V933 = {
  Operação: ['Visão geral', 'Caixa do dia'],
  Cadastros: ['Produtos e estoque', 'Compras', 'Clientes'],
  Gestão: ['Financeiro', 'Relatórios'],
  Sistema: ['Usuários', 'Dados e backup', 'Suporte', 'Meu usuário'],
};

function montar(papel: PapelDeLoja = 'dono', aoSair = vi.fn(), permissoes: string[] | null = null) {
  render(
    <TelaPainel
      loja={{ nome: 'Loja A', descricao: 'Rações, petiscos e acessórios' }}
      pessoa={{ nome: 'Ana', papel, permissoes }}
      aoSair={aoSair}
      api={criarApiLocal({ lojaId: 'loja-teste', operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0 })}
      agora={() => new Date('2026-11-12T12:00:00Z')}
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

  it('Vendedor não vê Compras, Financeiro, Relatórios, Usuários nem Dados e backup (e o grupo Gestão some)', () => {
    expect(montar('vendedor').grupos()).toEqual({
      Operação: ['Visão geral', 'Caixa do dia'],
      Cadastros: ['Produtos e estoque', 'Clientes'],
      Sistema: ['Suporte', 'Meu usuário'],
    });
    expect(screen.getByRole('button', { name: 'Frente de caixa' })).toBeTruthy();
  });

  it('Personalizado vê só as funções marcadas: sem "Vender", nem a Frente de caixa; sem "Clientes", nem Clientes', () => {
    expect(montar('personalizado', vi.fn(), ['relatorios', 'produtos.alterar']).grupos()).toEqual({
      Operação: ['Visão geral'],
      Cadastros: ['Produtos e estoque'],
      Gestão: ['Relatórios'],
      Sistema: ['Suporte', 'Meu usuário'],
    });
    expect(screen.queryByRole('button', { name: 'Frente de caixa' })).toBeNull();
    cleanup();
    expect(montar('personalizado', vi.fn(), ['vender', 'clientes', 'caixa']).grupos()).toEqual({
      Operação: ['Visão geral', 'Caixa do dia'],
      Cadastros: ['Produtos e estoque', 'Clientes'],
      Sistema: ['Suporte', 'Meu usuário'],
    });
    expect(screen.getByRole('button', { name: 'Frente de caixa' })).toBeTruthy();
  });

  it('abre na Visão geral, marcada como página atual', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Visão geral', current: 'page' }).className).toContain('active');
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeTruthy();
    expect(screen.getByText(/Bom dia, Ana/)).toBeTruthy();
  });

  it('itens ainda sem tela só marcam a seleção: conteúdo em branco', async () => {
    const { barra } = montar();
    const itens = within(barra)
      .getAllByRole('button')
      .filter((b) => b.classList.contains('nav'));
    expect(itens).toHaveLength(12);
    const comTela = ['Visão geral', 'Frente de caixa', 'Caixa do dia', 'Produtos e estoque', 'Compras', 'Clientes', 'Financeiro', 'Relatórios', 'Usuários', 'Dados e backup', 'Meu usuário'];
    for (const item of itens.filter((b) => !comTela.includes(b.textContent ?? ''))) {
      await userEvent.click(item);
      expect(item.getAttribute('aria-current')).toBe('page');
      expect(itens.filter((b) => b.getAttribute('aria-current') === 'page')).toHaveLength(1);
      expect(screen.getByRole('main').textContent).toBe('');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeTruthy();
  });

  it('bloco da pessoa: inicial, nome, papel, tema e Sair; "Trocar senha" foi para a aba Meu usuário', async () => {
    const { barra, aoSair } = montar('administrador');
    expect(within(barra).getByText('Ana')).toBeTruthy();
    expect(within(barra).getByText('Administrador')).toBeTruthy();
    expect(within(barra).getByText('A').closest('.sideuser-avatar')).toBeTruthy();
    expect(within(barra).getByRole('button', { name: /^Usar o tema (claro|escuro)$/ })).toBeTruthy();
    expect(within(barra).queryByRole('button', { name: 'Trocar senha' })).toBeNull();
    await userEvent.click(within(barra).getByRole('button', { name: 'Sair' }));
    expect(aoSair).toHaveBeenCalledOnce();
  });

  it('clicar no nome, no canto de baixo, abre a aba Meu usuário (pedido do Luan, 25/11/2026)', async () => {
    const { barra } = montar('vendedor');
    await userEvent.click(within(barra).getByRole('button', { name: 'Meu usuário: Ana, Vendedor' }));
    expect(await screen.findByRole('heading', { name: 'Meu usuário', level: 1 })).toBeTruthy();
    expect(within(barra).getByRole('button', { name: 'Meu usuário', current: 'page' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Trocar a senha' })).toBeTruthy();
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

describe('TelaPainel · vendas ligadas: Frente de caixa → Visão geral → Relatórios', () => {
  it('a venda feita na Frente de caixa aparece na Visão geral e nos Relatórios com quem vendeu', async () => {
    // Dono: vende no caixa e também vê os Relatórios (o Vendedor só vê as vendas de hoje)
    const api = criarApiLocal({ lojaId: 'loja-x', operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0 });
    await api.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: '7897000400403', precoCentavos: 750 });
    await darEstoque('loja-x', 10); // produto novo começa sem estoque
    await api.abrirCaixa({ fundoCentavos: 0 }); // só vende com o caixa de hoje aberto
    render(
      <TelaPainel
        api={api}
        loja={{ nome: 'Loja X' }}
        pessoa={{ nome: 'Ana', papel: 'dono' }}
        aoSair={vi.fn()}
        agora={() => new Date()}
      />,
    );
    // Visão geral começa zerada
    await waitFor(() => expect(txt(screen.getByTestId('vendido-hoje').textContent)).toBe('R$ 0,00'));

    // Frente de caixa abre em tela cheia, sem a barra lateral (como no DaniPets)
    await userEvent.click(screen.getByRole('button', { name: 'Frente de caixa' }));
    await screen.findByPlaceholderText('Bipe o código ou digite o nome (3*código = 3 un.)');
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).toBeNull();
    const leitor = screen.getByLabelText('Código ou nome do produto');
    await userEvent.type(leitor, '2*7897000400403{Enter}');
    await userEvent.keyboard('{F2}');
    expect(txt((await screen.findByText(/Venda #00001 finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 15,00 em Pix.');

    await userEvent.click(screen.getByRole('button', { name: '← Painel' }));
    await screen.findByText('R$ 15,00', { selector: '[data-testid="vendido-hoje"]' });
    await userEvent.click(screen.getByRole('button', { name: /VENDAS DE HOJE/ }));
    const tabela = within(document.getElementById('vg-detalhe')!).getAllByRole('table').at(-1)!;
    expect(within(tabela).getByText('Ana')).toBeTruthy();
    expect(txt(tabela.textContent)).toMatch(/2× Petisco Bifinho/);

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Menu principal' })).getByRole('button', { name: 'Relatórios' }));
    // os Relatórios abrem na aba Tudo; a lista das vendas fica na aba Vendas
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Assuntos dos relatórios' })).getByRole('button', { name: 'Vendas' }));
    const linha = (await screen.findByText('#00001')).closest('tr')!;
    expect(within(linha).getByText('Ana')).toBeTruthy();
    expect(within(linha).getByText('R$ 15,00')).toBeTruthy();
  });

  it('a aba Produtos e estoque abre a tela de cadastro e saldo (para todos os papéis)', async () => {
    render(
      <TelaPainel
        api={criarApiLocal({ lojaId: 'loja-pe', operador: { id: 'b', nome: 'Bruno', papel: 'vendedor' }, exemplos: false, atrasoMs: 0 })}
        loja={{ nome: 'Loja PE' }}
        pessoa={{ nome: 'Bruno', papel: 'vendedor' }}
        aoSair={vi.fn()}
      />,
    );
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Menu principal' })).getByRole('button', { name: 'Produtos e estoque' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Produtos e estoque' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: '+ Cadastrar produto' })).toBeTruthy();
    expect(await screen.findByText(/Nenhum produto cadastrado ainda/)).toBeTruthy();
  });

  it('Visão geral: Produtos ativos leva para Produtos e estoque; Saldo das contas leva para o Financeiro', async () => {
    render(
      <TelaPainel
        api={criarApiLocal({ lojaId: 'loja-z', operador: { id: 'a', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0 })}
        loja={{ nome: 'Loja Z' }}
        pessoa={{ nome: 'Ana', papel: 'dono' }}
        aoSair={vi.fn()}
      />,
    );
    const menu = screen.getByRole('navigation', { name: 'Menu principal' });
    await userEvent.click(await screen.findByRole('button', { name: /Produtos ativos/ }));
    expect(within(menu).getByRole('button', { name: 'Produtos e estoque' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).toBeNull();

    await userEvent.click(within(menu).getByRole('button', { name: 'Visão geral' }));
    await userEvent.click(await screen.findByRole('button', { name: /Saldo das contas/ }));
    expect(within(menu).getByRole('button', { name: 'Financeiro' }).getAttribute('aria-current')).toBe('page');
    expect(await screen.findByRole('heading', { name: 'Financeiro' })).toBeTruthy();
  });

  it('o nome que a loja dá à conta no Financeiro vale nas outras abas (Compras: "Sai de")', async () => {
    const api = criarApiLocal({ lojaId: 'loja-nomes', operador: { id: 'a', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0 });
    await api.cadastrarContaAPagar({ descricao: 'Energia', valorCentavos: 9000, vencimento: '2026-12-10', categoria: null });
    render(<TelaPainel api={api} loja={{ nome: 'Loja N' }} pessoa={{ nome: 'Ana', papel: 'dono' }} aoSair={vi.fn()} />);
    const menu = screen.getByRole('navigation', { name: 'Menu principal' });
    await userEvent.click(within(menu).getByRole('button', { name: 'Financeiro' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Trocar o nome de Conta bancária' }));
    const campo = within(screen.getByRole('dialog')).getByLabelText('Nome da conta (Conta bancária)');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Banco Itaú');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Conta renomeada: “Conta bancária” agora é “Banco Itaú”.')).toBeTruthy();
    await userEvent.click(within(menu).getByRole('button', { name: 'Compras' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar Energia' }));
    const opcoes = within(within(screen.getByRole('dialog')).getByLabelText('Sai de')).getAllByRole('option');
    await waitFor(() => expect(opcoes.map((o) => o.textContent)).toEqual(['Banco Itaú', 'Caixa físico']));
  });

  it('Pendências: botão leva para a aba; Vendedor não vê as "só gestor" e as "só Dono" nem botão para aba sem acesso', async () => {
    const pendencias = [
      { id: 'validade', gravidade: 'media' as const, texto: 'Lote vencendo.', acao: { rotulo: 'Ver produto', secao: 'produtos-e-estoque' as const } },
      { id: 'estoque', gravidade: 'media' as const, texto: 'Estoque baixo.', acao: { rotulo: 'Fazer pedido', secao: 'compras' as const } },
      { id: 'conta', gravidade: 'alta' as const, texto: 'Conta vencida.', acao: { rotulo: 'Ver contas', secao: 'financeiro' as const }, soGestor: true },
      { id: 'dono', gravidade: 'alta' as const, texto: 'Só o Dono vê.', soDono: true },
    ];
    const api = criarApiLocal({ lojaId: 'loja-p', operador: { id: 'b', nome: 'Bruno', papel: 'vendedor' }, exemplos: false, atrasoMs: 0 });
    const textos = (card: HTMLElement) => within(card).getAllByRole('listitem').map((li) => li.querySelector('.pend-texto')?.textContent);
    const { unmount } = render(
      <TelaPainel api={api} loja={{ nome: 'Loja P' }} pessoa={{ nome: 'Bruno', papel: 'vendedor' }} aoSair={vi.fn()} pendencias={pendencias} />,
    );
    const card = (await screen.findByRole('heading', { name: /Pendências/ })).closest('section')!;
    // a pendência 1 (caixa de hoje não aberto) vem da situação do caixa, para todos
    await within(card).findByText(/O caixa de hoje não foi aberto/);
    expect(textos(card)).toEqual(['Atenção: O caixa de hoje não foi aberto: vendas ficam bloqueadas.', 'Atenção: Lote vencendo.', 'Atenção: Estoque baixo.']);
    expect(within(card).queryByRole('button', { name: 'Fazer pedido' })).toBeNull(); // Vendedor não abre Compras
    await userEvent.click(within(card).getByRole('button', { name: 'Abrir caixa' }));
    const menu = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(menu).getByRole('button', { name: 'Caixa do dia' }).getAttribute('aria-current')).toBe('page');
    unmount();

    // o Administrador vê as "só gestor", mas não as "só Dono"
    const adm = render(<TelaPainel api={api} loja={{ nome: 'Loja P' }} pessoa={{ nome: 'Caio', papel: 'administrador' }} aoSair={vi.fn()} pendencias={pendencias} />);
    const cardAdm = (await screen.findByRole('heading', { name: /Pendências/ })).closest('section')!;
    await within(cardAdm).findByText(/O caixa de hoje não foi aberto/);
    expect(textos(cardAdm)).not.toContain('Urgente: Só o Dono vê.');
    expect(textos(cardAdm)).toContain('Urgente: Conta vencida.');
    adm.unmount();

    render(<TelaPainel api={api} loja={{ nome: 'Loja P' }} pessoa={{ nome: 'Ana', papel: 'dono' }} aoSair={vi.fn()} pendencias={pendencias} />);
    const cardDono = (await screen.findByRole('heading', { name: /Pendências/ })).closest('section')!;
    await within(cardDono).findByText(/O caixa de hoje não foi aberto/);
    expect(within(cardDono).getAllByRole('listitem')).toHaveLength(5);
    expect(textos(cardDono).slice(0, 2)).toEqual(['Urgente: Conta vencida.', 'Urgente: Só o Dono vê.']); // urgentes primeiro
    expect(within(cardDono).getByRole('button', { name: 'Fazer pedido' })).toBeTruthy();
  });

  it('Vendedor não chega aos Relatórios nem pelo link da Visão geral', async () => {
    render(
      <TelaPainel
        api={criarApiLocal({ lojaId: 'loja-y', operador: { id: 'b', nome: 'Bruno', papel: 'vendedor' }, exemplos: false, atrasoMs: 0 })}
        loja={{ nome: 'Loja Y' }}
        pessoa={{ nome: 'Bruno', papel: 'vendedor' }}
        aoSair={vi.fn()}
      />,
    );
    await screen.findByTestId('vendido-hoje');
    expect(screen.queryByRole('button', { name: 'Relatórios' })).toBeNull();
    expect(await screen.findByRole('button', { name: /Produtos ativos/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Saldo das contas/ })).toBeNull(); // sem acesso ao Financeiro
    await userEvent.click(screen.getByRole('button', { name: /VENDAS DE HOJE/ }));
    expect(screen.getByText(/Todas as vendas ficam guardadas em/).querySelector('button')).toBeNull();
  });
});

describe('TelaPainel · dados da loja e tema (Fase 2, módulo 1)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('a barra lateral usa o nome, a descrição e o logo salvos em Dados e backup', async () => {
    const api = criarApiLocal({ lojaId: 'loja-dados', operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0 });
    await api.salvarDadosDaLoja({ nome: 'Pet Center', descricao: 'Banho e tosa', logo: PNG });
    render(<TelaPainel api={api} loja={{ nome: 'Loja A' }} pessoa={{ nome: 'Ana', papel: 'dono' }} aoSair={vi.fn()} />);
    const barra = screen.getByRole('complementary', { name: 'Barra lateral' });
    expect(await within(barra).findByText('Pet Center')).toBeTruthy();
    expect(within(barra).getByText('Banho e tosa')).toBeTruthy();
    expect(barra.querySelector('.brandmark img')?.getAttribute('src')).toBe(PNG);
  });

  it('o botão de tema troca entre claro e escuro e guarda a escolha neste navegador', async () => {
    const { barra } = montar();
    await userEvent.click(within(barra).getByRole('button', { name: 'Usar o tema escuro' }));
    expect(document.documentElement.dataset.tema).toBe('escuro');
    expect(localStorage.getItem('saas:tema')).toBe('escuro');
    await userEvent.click(within(barra).getByRole('button', { name: 'Usar o tema claro' }));
    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(localStorage.getItem('saas:tema')).toBe('claro');
  });
});

describe('TelaPainel · virada do dia com o sistema aberto (pedido do Luan, 21/11/2026)', () => {
  it('à meia-noite o caixa que ficou aberto fecha sozinho: aviso de novo dia, pendência do Dono e Frente de caixa sem vender', async () => {
    let relogio = new Date('2026-11-20T23:00:00Z'); // 20:00 de 20/11 (Brasília)
    const api = criarApiLocal({ lojaId: 'virada', operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0, agora: () => relogio });
    await api.abrirCaixa({ fundoCentavos: 5000 });
    render(<TelaPainel loja={{ nome: 'Loja A' }} pessoa={{ nome: 'Ana', papel: 'dono' }} aoSair={vi.fn()} api={api} agora={() => relogio} intervaloMs={60_000} />);
    expect(await screen.findByRole('button', { name: /^Caixa aberto às/ })).toBeTruthy();

    relogio = new Date('2026-11-21T03:00:20Z'); // 00:00:20 de 21/11
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(txt((await screen.findByText(/^Novo dia:/)).textContent)).toBe(
      'Novo dia: o caixa de 20/11/2026 fechou sozinho à meia-noite, sem contagem da gaveta. Abra o caixa de hoje para voltar a vender.',
    );
    // a Visão geral leu de novo: caixa de hoje não aberto e a pendência para conferir
    expect(await screen.findByRole('button', { name: 'Caixa de hoje não aberto' })).toBeTruthy();
    expect(txt((await screen.findByText(/^O caixa de 20\/11\/2026 fechou sozinho/)).textContent)).toBe(
      'Atenção: O caixa de 20/11/2026 fechou sozinho à meia-noite, sem contagem da gaveta (esperado R$ 50,00). Deseja verificar?',
    );
    // a Frente de caixa mostra o aviso junto com "sem caixa aberto não há vendas"
    await userEvent.click(screen.getByRole('button', { name: 'Frente de caixa' }));
    expect(await screen.findByText('CAIXA DE HOJE NÃO ABERTO')).toBeTruthy();
    expect(txt(screen.getByText(/^Novo dia:/).closest('p')?.textContent)).toBe(
      'Caixa de hoje não aberto. Novo dia: o caixa de 20/11/2026 fechou sozinho à meia-noite, sem contagem da gaveta. Sem caixa aberto não há vendas: abra o caixa para começar.',
    );
    // de volta ao painel: "Ir para Caixa do dia" e "Entendi"
    await userEvent.click(screen.getByRole('button', { name: '← Painel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ir para Caixa do dia' }));
    expect(await screen.findByRole('heading', { name: 'Abrir caixa de hoje' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ir para Caixa do dia' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByText(/^Novo dia:/)).toBeNull();
  });
});
