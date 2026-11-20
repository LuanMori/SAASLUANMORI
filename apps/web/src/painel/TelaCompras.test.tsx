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

describe('Compras · registrar, estornar, pagar e dar baixa (módulo 4)', () => {
  const AGORA = () => new Date('2026-11-19T15:00:00Z');
  const apiCom = (o: OperadorComPapel) => criarApiLocal({ lojaId: 'compras-ui', operador: o, exemplos: false, atrasoMs: 0, agora: AGORA });
  const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');

  async function preparar() {
    const a = apiCom(ANA);
    const racao = await a.criarProduto({ nome: 'Ração 15 kg', codigoBarras: null, precoCentavos: 18990 });
    const granel = await a.criarProduto({ nome: 'Ração a granel', codigoBarras: null, precoCentavos: 1990, unidade: 'kg' });
    const sul = await a.cadastrarFornecedor({ nome: 'Pet Sul', documento: null, telefone: null, contato: null, observacao: null });
    await a.definirSaldoInicial({ conta: 'banco', valorCentavos: 1_000_000 });
    return { a, racao, granel, sul };
  }

  it('registra a nota com dois itens (un e kg), à vista, e mostra no histórico', async () => {
    const { a } = await preparar();
    render(<TelaCompras api={a} agora={AGORA} confirmar={() => true} />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Registrar compra' }));
    await userEvent.selectOptions(within(janela()).getByLabelText('Fornecedor'), 'Pet Sul');
    await userEvent.type(within(janela()).getByLabelText('Número da nota fiscal (opcional)'), '1234');
    await userEvent.selectOptions(within(janela()).getByLabelText('Produto do item 1'), within(janela()).getByRole('option', { name: /Ração 15 kg/ }));
    await userEvent.type(within(janela()).getByLabelText('Quantidade do item 1'), '10');
    await userEvent.type(within(janela()).getByLabelText('Custo do item 1'), '120,00');
    await userEvent.click(within(janela()).getByRole('button', { name: '+ Adicionar item' }));
    await userEvent.selectOptions(within(janela()).getByLabelText('Produto do item 2'), within(janela()).getAllByRole('option', { name: /Ração a granel/ })[1]!);
    await userEvent.type(within(janela()).getByLabelText('Quantidade do item 2'), '25');
    await userEvent.type(within(janela()).getByLabelText('Custo do item 2 (do kg)'), '12,00');
    expect(txt(within(janela()).getByTestId('compra-total').textContent)).toBe('R$ 1.500,00');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Registrar compra' }));
    expect(txt((await screen.findByRole('status')).textContent)).toBe('Compra nº 1 registrada: R$ 1.500,00. Estoque atualizado.');
    const linha = (await screen.findByText(/nº 1 •/)).closest('tr')!;
    expect(txt(textoDaLinha(linha))).toMatch(/^nº 1 • 19\/11\/2026NF 1234 \| Pet Sul \| 2 itens.* \| R\$ 1\.500,00 \| À vista • Conta bancária$/);
    expect((await a.listarEstoque()).map((s) => s.saldo).sort((x, y) => x - y)).toEqual([10, 25000]);
  });

  it('custo diferente da última compra: mostra a margem e muda o preço junto, se marcado', async () => {
    const { a, racao } = await preparar();
    await a.registrarCompra({ data: '2026-11-19', itens: [{ produtoId: racao.id, quantidade: 1, custoCentavos: 12000 }], pagamento: { tipo: 'avista', conta: 'banco' } });
    render(<TelaCompras api={a} agora={AGORA} confirmar={() => true} />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Registrar compra' }));
    await userEvent.selectOptions(within(janela()).getByLabelText('Produto do item 1'), within(janela()).getByRole('option', { name: /Ração 15 kg/ }));
    expect((within(janela()).getByLabelText('Custo do item 1') as HTMLInputElement).value).toBe('120,00'); // sugere o último custo
    const custo = within(janela()).getByLabelText('Custo do item 1');
    await userEvent.clear(custo);
    await userEvent.type(custo, '130,00');
    await userEvent.type(within(janela()).getByLabelText('Quantidade do item 1'), '2');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Registrar compra' }));
    expect(await within(janela()).findByRole('heading', { name: 'O custo de compra subiu' })).toBeTruthy();
    expect(txt(within(janela()).getByText(/margem 36,8% → 31,5%/).closest('td')!.textContent)).toBe('R$ 189,90 margem 36,8% → 31,5%');
    expect((within(janela()).getByLabelText('Novo preço de venda de Ração 15 kg') as HTMLInputElement).value).toBe('205,73');
    await userEvent.click(within(janela()).getByLabelText('Mudar o preço de venda de Ração 15 kg'));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Registrar compra' }));
    await screen.findByText(/Compra nº 2 registrada/);
    expect((await a.listarProdutos()).find((p) => p.id === racao.id)!.precoCentavos).toBe(20573);
  });

  it('a prazo vira conta a pagar e é paga pela tela; estornar um item corrige estoque e conta', async () => {
    const { a, racao, granel } = await preparar();
    await a.registrarCompra({
      data: '2026-11-19',
      notaFiscal: '55',
      itens: [
        { produtoId: racao.id, quantidade: 2, custoCentavos: 12000 },
        { produtoId: granel.id, quantidade: 1000, custoCentavos: 1200 },
      ],
      pagamento: { tipo: 'aprazo', vencimento: '2026-12-19' },
    });
    render(<TelaCompras api={a} agora={AGORA} confirmar={() => true} />);
    const contas = within(await screen.findByRole('region', { name: 'Contas a pagar' }));
    // a região aparece antes dos dados: espera o valor chegar
    expect(txt((await contas.findByText('R$ 252,00')).textContent)).toBe('R$ 252,00');

    // estorna a ração: a conta a pagar cai para R$ 12,00
    await userEvent.click(screen.getByText('2 itens'));
    await userEvent.click(screen.getByRole('button', { name: 'Estornar Ração 15 kg da compra 1' }));
    expect(txt(within(janela()).getByText(/A conta a pagar diminui/).textContent)).toBe('A conta a pagar diminui R$ 240,00 (de R$ 252,00 para R$ 12,00).');
    await userEvent.type(within(janela()).getByLabelText('Motivo do estorno'), 'lançada errada');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Estornar' }));
    await screen.findByText('Compra estornada: Ração 15 kg. Estoque e financeiro corrigidos.');
    expect((await a.listarContasAPagar())[0]!.valorCentavos).toBe(1200);

    // paga o restante pela tela
    await userEvent.click(await screen.findByRole('button', { name: /^Pagar Compra NF 55/ }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Pagar' }));
    await screen.findByText('Conta paga: R$ 12,00 saíram de Conta bancária.');
    expect(screen.getByText('Nenhuma conta a pagar em aberto. As compras a prazo aparecem aqui.')).toBeTruthy();
  });

  it('lote vencendo aparece e a baixa é feita pela tela', async () => {
    const { a, racao } = await preparar();
    await a.registrarCompra({ data: '2026-11-01', itens: [{ produtoId: racao.id, quantidade: 4, custoCentavos: 12000, validade: '2026-11-25' }], pagamento: { tipo: 'avista', conta: 'banco' } });
    render(<TelaCompras api={a} agora={AGORA} confirmar={() => true} />);
    const lotes = within(await screen.findByRole('region', { name: 'Validade: lotes vencidos ou vencendo em 30 dias' }));
    expect(txt((await lotes.findByText('vence em 6 dias')).textContent)).toBe('vence em 6 dias');
    await userEvent.click(lotes.getByRole('button', { name: 'Dar baixa no lote de Ração 15 kg' }));
    const qtd = within(janela()).getByLabelText('Vencidos que ainda estão na prateleira (unidades)');
    expect((qtd as HTMLInputElement).value).toBe('4');
    await userEvent.clear(qtd);
    await userEvent.type(qtd, '1');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Dar baixa' }));
    await screen.findByText('Baixa do lote registrada: 1 un de Ração 15 kg saíram do estoque como vencidos.');
    expect(screen.queryByRole('region', { name: 'Validade: lotes vencidos ou vencendo em 30 dias' })).toBeNull();
    expect((await a.listarEstoque()).find((s) => s.produtoId === racao.id)!.saldo).toBe(3);
  });
});
