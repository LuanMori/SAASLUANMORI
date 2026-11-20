// apps/web/src/painel/TelaProdutosEstoque.test.tsx
// Aba Produtos e estoque (Fase 2, módulo 2), ligada à API da demonstração.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import { TelaProdutosEstoque } from './TelaProdutosEstoque';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
// abre o caixa do dia sozinha antes de vender (o próprio caixa tem os testes dele)
const api = (operador: OperadorComPapel) => comCaixaAberto(criarApiLocal({ lojaId: 'pe', operador, exemplos: false, atrasoMs: 0 }));

/** Abre a tela; `antes` prepara os dados pela API (antes de a tela carregar). */
async function abrir(operador: OperadorComPapel, confirmar: (t: string) => boolean = () => true, antes?: (a: ReturnType<typeof api>) => Promise<unknown>) {
  const a = api(operador);
  if (antes) await antes(a);
  render(<TelaProdutosEstoque api={a} papel={operador.papel} fuso={FUSO} intervaloMs={60_000} confirmar={confirmar} />);
  await screen.findByRole('button', { name: '+ Cadastrar produto' });
  return a;
}
const tabelaProdutos = () => within(screen.getByRole('region', { name: 'Produtos' })).getByRole('table');
const linhaDe = (nome: string) => within(tabelaProdutos()).getByText(nome).closest('tr') as HTMLTableRowElement;
const janela = () => screen.getByRole('dialog');
const celula = (linha: HTMLElement, rotulo: string) => txt(linha.querySelector(`td[data-rotulo="${rotulo}"]`)?.textContent);
/** As células de uma linha, separadas por " | ". */
const textoDaLinha = (linha: HTMLElement) => [...linha.querySelectorAll('td')].map((td) => txt(td.textContent)).join(' | ');

async function cadastrar(campos: Record<string, string>, unidade?: 'un' | 'kg') {
  await userEvent.click(await screen.findByRole('button', { name: '+ Cadastrar produto' }));
  const j = janela();
  if (unidade) await userEvent.selectOptions(within(j).getByLabelText('Vendido por'), unidade);
  for (const [rotulo, valor] of Object.entries(campos)) await userEvent.type(within(j).getByLabelText(rotulo), valor);
  await userEvent.click(within(j).getByRole('button', { name: 'Cadastrar produto' }));
}

describe('Produtos e estoque · cadastro completo e kg', () => {
  it('Dono cadastra a granel com estoque inicial e custo; entrada, ajuste com motivo e observação, mínimo e a conta do saldo', async () => {
    const a = await abrir(ANA);
    await cadastrar(
      {
        'Nome do produto': 'Ração a granel',
        'Marca (opcional)': 'Golden',
        'Peso da embalagem em kg (opcional)': '15',
        'Preço do quilo (R$)': '19,90',
        'Estoque inicial em kg (opcional)': '25',
        'Custo do kg do estoque inicial (R$, opcional)': '12,00',
      },
      'kg',
    );
    expect(txt((await screen.findByRole('status')).textContent)).toBe('Ração a granel cadastrado com o código 0001 (R$ 19,90 o kg).');
    // a mensagem chega antes da lista recarregar: espera a linha do produto
    const linha = await waitFor(() => linhaDe('Ração a granel'));
    expect(celula(linha, 'Produto')).toContain('a granel (kg)');
    expect(celula(linha, 'Produto')).toContain('Golden · 15 kg');
    expect(celula(linha, 'Preço')).toBe('R$ 19,90 /kg');
    expect(celula(linha, 'Estoque')).toBe('25 kg');
    const [ini] = await a.listarMovimentosEstoque();
    expect(ini).toMatchObject({ tipo: 'inicial', quantidade: 25000, custoUnitarioCentavos: 1200 });

    // entrada de 2,5 kg
    await userEvent.click(within(linha).getByRole('button', { name: 'Entrada de Ração a granel' }));
    await userEvent.type(within(janela()).getByLabelText('Quantidade em kg'), '2,5');
    expect(txt(janela().querySelector('.modal-sub')?.textContent)).toBe('Saldo atual: 25 kg → depois: 27,5 kg');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar entrada' }));
    expect(txt((await screen.findByText(/Entrada lançada/)).textContent)).toBe('Entrada lançada: Ração a granel +2,5 kg. Saldo agora: 27,5 kg.');

    // ajuste: motivo da lista da loja (padrão do DaniPets) + observação
    await userEvent.click(within(linhaDe('Ração a granel')).getByRole('button', { name: 'Ajuste de Ração a granel' }));
    await userEvent.type(within(janela()).getByLabelText('Quantidade em kg'), '0,5');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar ajuste' }));
    expect(within(janela()).getByRole('alert').textContent).toBe('Escolha o motivo do ajuste.');
    expect(within(janela()).getAllByRole('option').map((o) => o.textContent)).toEqual(['Escolha…', 'Perda ou avaria', 'Produto vencido', 'Correção de contagem', 'Outro']);
    await userEvent.selectOptions(within(janela()).getByLabelText('Motivo'), 'Perda ou avaria');
    await userEvent.type(within(janela()).getByLabelText('Observação (opcional)'), 'saco rasgado');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar ajuste' }));
    expect(txt((await screen.findByText(/Ajuste lançado/)).textContent)).toBe('Ajuste lançado: Ração a granel -0,5 kg. Saldo agora: 27 kg.');
    const movimentos = within(screen.getByRole('region', { name: 'Últimos movimentos do estoque' }));
    await waitFor(() => expect(textoDaLinha(movimentos.getAllByRole('row')[1]!)).toMatch(/\| Ração a granel \| Ajuste \| -0,5 kg \| Perda ou avaria — saco rasgado \| Ana$/));

    // mínimo em kg
    await userEvent.click(within(linhaDe('Ração a granel')).getByRole('button', { name: 'Estoque mínimo de Ração a granel' }));
    await userEvent.type(within(janela()).getByLabelText(/Estoque mínimo em kg/), '30');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar mínimo' }));
    await screen.findByText('Estoque mínimo de Ração a granel: 30 kg.');
    await waitFor(() => expect(celula(linhaDe('Ração a granel'), 'Estoque')).toBe('27 kgbaixo'));

    // como o saldo é calculado
    await userEvent.click(within(linhaDe('Ração a granel')).getByRole('button', { name: 'Como o saldo de Ração a granel é calculado' }));
    await within(janela()).findByText('= Saldo');
    const conta = within(janela())
      .getAllByRole('row')
      .map((r) => txt(r.textContent));
    expect(conta).toEqual([
      'Estoque inicial25 kg',
      '+ Compras (menos as estornadas)0 kg',
      '+ Entradas2,5 kg',
      '− Vendas0 kg',
      '+ Vendas canceladas0 kg',
      '+ Devoluções que voltaram para a prateleira0 kg',
      '± Ajustes-0,5 kg',
      '= Saldo27 kg',
    ]);
  });

  it('produto parecido (mesmo nome, marca e peso): pergunta antes; cancelar não cadastra', async () => {
    const pergunta = vi.fn(() => false);
    const a = await abrir(ANA, pergunta, (x) => x.criarProduto({ nome: 'Coleira M', codigoBarras: null, precoCentavos: 2990, marca: 'Pet', pesoGramas: null }));
    await cadastrar({ 'Nome do produto': 'coleira  m', 'Marca (opcional)': 'pet', 'Preço de venda (R$)': '31,90' });
    await waitFor(() => expect(pergunta).toHaveBeenCalledWith(expect.stringMatching(/^Já existe produto com o mesmo nome, marca e peso: "Coleira M" \(código 0001\)\. Salvar mesmo assim\?$/)));
    expect((await a.listarProdutos()).length).toBe(1);
    pergunta.mockReturnValue(true);
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar produto' }));
    await screen.findByText(/cadastrado com o código 0002/);
    expect((await a.listarProdutos()).length).toBe(2);
  });

  it('alterar: preço e nome (com história, pergunta antes); a unidade não muda com história', async () => {
    const pergunta = vi.fn(() => true);
    let id = '';
    const a = await abrir(ANA, pergunta, async (x) => {
      const p = await x.criarProduto({ nome: 'Areia 4 kg', codigoBarras: '7896000300306', precoCentavos: 2490 });
      id = p.id;
      await x.lancarMovimentoEstoque({ produtoId: p.id, tipo: 'entrada', quantidade: 5, motivo: '' });
    });
    await userEvent.click(within(await waitFor(() => linhaDe('Areia 4 kg'))).getByRole('button', { name: 'Alterar Areia 4 kg' }));
    expect((within(janela()).getByLabelText('Vendido por') as HTMLSelectElement).disabled).toBe(true);
    expect(within(janela()).getByText('Já tem vendas ou movimentos: a unidade não muda.')).toBeTruthy();
    const preco = within(janela()).getByLabelText('Preço de venda (R$)');
    await userEvent.clear(preco);
    await userEvent.type(preco, '26,90');
    const nome = within(janela()).getByLabelText('Nome do produto');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Areia Sanitária 4 kg');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Areia Sanitária 4 kg: alterações salvas.');
    expect(pergunta).toHaveBeenCalledWith(expect.stringMatching(/já tem vendas ou movimentos de estoque\. Mudar o nome ou o código de barras/));
    const hist = await a.listarAuditoria();
    expect(hist.slice(0, 2).map((h) => [h.texto, h.resumo])).toEqual([
      ['Produto alterado', 'nome'],
      ['Preço alterado', 'R$ 24,90 → R$ 26,90'.replace(/ /g, ' ').replace(' → ', ' → ')],
    ]);
    await expect(a.alterarProduto(id, { unidade: 'kg' })).rejects.toMatchObject({ status: 409 });
  });

  it('inativar e reativar; excluir só sem história (com história, o botão nem aparece)', async () => {
    let comId = '';
    const a = await abrir(ANA, () => true, async (x) => {
      await x.criarProduto({ nome: 'Brinquedo bolinha', codigoBarras: null, precoCentavos: 990 });
      const com = await x.criarProduto({ nome: 'Shampoo 500 ml', codigoBarras: null, precoCentavos: 3200 });
      comId = com.id;
      await x.lancarMovimentoEstoque({ produtoId: com.id, tipo: 'entrada', quantidade: 2, motivo: '' });
    });
    await waitFor(() => linhaDe('Shampoo 500 ml'));
    expect(within(linhaDe('Shampoo 500 ml')).queryByRole('button', { name: 'Excluir Shampoo 500 ml' })).toBeNull();

    await userEvent.click(within(linhaDe('Shampoo 500 ml')).getByRole('button', { name: 'Inativar Shampoo 500 ml' }));
    await screen.findByText('Shampoo 500 ml foi inativado: não aparece mais na Frente de caixa.');
    await waitFor(() => expect(celula(linhaDe('Shampoo 500 ml'), 'Produto')).toMatch(/inativo/));
    await userEvent.click(within(linhaDe('Shampoo 500 ml')).getByRole('button', { name: 'Reativar Shampoo 500 ml' }));
    await screen.findByText('Shampoo 500 ml foi reativado.');

    await userEvent.click(within(linhaDe('Brinquedo bolinha')).getByRole('button', { name: 'Excluir Brinquedo bolinha' }));
    await screen.findByText('Brinquedo bolinha foi excluído.');
    expect((await a.listarProdutos()).map((p) => p.id)).toEqual([comId]);
    expect((await a.listarAuditoria())[0]).toMatchObject({ texto: 'Produto excluído', resumo: 'Brinquedo bolinha • código 0001' });
  });

  it('busca por nome, marca ou código (sem acento e sem maiúscula)', async () => {
    await abrir(ANA, () => true, async (x) => {
      await x.criarProduto({ nome: 'Ração Gatos 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990, marca: 'Whiskas' });
      await x.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: null, precoCentavos: 750 });
    });
    await screen.findByText('Ração Gatos 3 kg');
    const busca = screen.getByLabelText('Buscar produto');
    await userEvent.clear(busca);
    await userEvent.type(busca, 'racao');
    expect(within(tabelaProdutos()).queryByText('Petisco Bifinho')).toBeNull();
    await userEvent.clear(busca);
    await userEvent.type(busca, 'whisk');
    expect(within(tabelaProdutos()).getByText('Ração Gatos 3 kg')).toBeTruthy();
    await userEvent.clear(busca);
    await userEvent.type(busca, '0002');
    expect(within(tabelaProdutos()).getByText('Petisco Bifinho')).toBeTruthy();
    await userEvent.clear(busca);
    await userEvent.type(busca, 'nada disso');
    expect(screen.getByText('Nenhum produto com “nada disso”.')).toBeTruthy();
  });
});

describe('Produtos e estoque · quem pode', () => {
  it('Vendedor cadastra (sem o custo) e consulta, mas não altera nem lança estoque', async () => {
    await api(ANA).criarProduto({ nome: 'Coleira M', codigoBarras: null, precoCentavos: 2990 });
    await abrir(BRUNO);
    await screen.findByText('Coleira M');
    expect(screen.queryByRole('button', { name: /Entrada de|Ajuste de|Estoque mínimo de|Alterar |Inativar |Excluir / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Regras do estoque' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '+ Cadastrar produto' }));
    expect(within(janela()).queryByLabelText(/Custo/)).toBeNull();
    await userEvent.type(within(janela()).getByLabelText('Nome do produto'), 'Petisco');
    await userEvent.type(within(janela()).getByLabelText('Preço de venda (R$)'), '7,50');
    await userEvent.type(within(janela()).getByLabelText('Estoque inicial em unidades (opcional)'), '10');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar produto' }));
    await screen.findByText(/Petisco cadastrado/);
    await waitFor(() => expect(celula(linhaDe('Petisco'), 'Estoque')).toBe('10 un'));
    // a API recusa o custo mesmo se a tela fosse forçada
    await expect(api(BRUNO).criarProduto({ nome: 'Outro', codigoBarras: null, precoCentavos: 100, estoqueInicial: 1, custoInicialCentavos: 50 })).rejects.toMatchObject({ status: 403 });
    await expect(api(BRUNO).alterarProduto('qualquer', { precoCentavos: 1 })).rejects.toMatchObject({ status: 403 });
  });
});

describe('Produtos e estoque · regras do estoque', () => {
  it('o Dono muda os motivos de ajuste e desliga o kg', async () => {
    let id = '';
    const a = await abrir(ANA, () => true, async (x) => {
      id = (await x.criarProduto({ nome: 'Coleira M', codigoBarras: null, precoCentavos: 2990, estoqueInicial: 5 })).id;
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Regras do estoque' }));
    await userEvent.click(within(janela()).getByLabelText('Quilo (kg, a granel)'));
    const motivos = within(janela()).getByLabelText('Motivos de ajuste (um por linha)');
    await userEvent.clear(motivos);
    await userEvent.type(motivos, 'Furto{Enter}Perda ou avaria');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar as regras' }));
    await screen.findByText('Regras do estoque salvas.');
    const regras = (await a.lerConfiguracao()).regras;
    expect([regras.produtos.unidades, regras.estoque.motivosAjuste]).toEqual([['un'], ['Furto', 'Perda ou avaria']]);

    await userEvent.click(screen.getByRole('button', { name: '+ Cadastrar produto' }));
    expect(within(within(janela()).getByLabelText('Vendido por')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Unidade (un)']);
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cancelar' }));
    await expect(a.lancarMovimentoEstoque({ produtoId: id, tipo: 'ajuste', quantidade: -1, motivo: 'Outro' })).rejects.toMatchObject({ status: 400 });
    await expect(a.lancarMovimentoEstoque({ produtoId: id, tipo: 'ajuste', quantidade: -1, motivo: 'Furto' })).resolves.toMatchObject({ saldo: 4 });
    await expect(a.criarProduto({ nome: 'Granel', codigoBarras: null, precoCentavos: 100, unidade: 'kg' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('Produtos e estoque · ligado à venda', () => {
  it('a venda por kg da Frente de caixa baixa o saldo e aparece nos movimentos', async () => {
    await abrir(ANA, () => true, async (x) => {
      const p = await x.criarProduto({ nome: 'Ração a granel', codigoBarras: null, precoCentavos: 1990, unidade: 'kg', estoqueInicial: 10_000 });
      await api(BRUNO).criarVenda({ itens: [{ produtoId: p.id, quantidade: 1250 }], pagamentos: [{ forma: 'pix', valorCentavos: 2488 }] });
    });
    await waitFor(() => linhaDe('Ração a granel'));
    expect(celula(linhaDe('Ração a granel'), 'Estoque')).toBe('8,75 kg');
    const linhaVenda = within(screen.getByRole('region', { name: 'Últimos movimentos do estoque' })).getAllByRole('row')[1]!;
    expect(textoDaLinha(linhaVenda)).toMatch(/\| Ração a granel \| Venda #00001 \| -1,25 kg \| — \| Bruno$/);
  });
});
