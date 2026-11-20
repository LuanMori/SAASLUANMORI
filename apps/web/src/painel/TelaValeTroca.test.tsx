// apps/web/src/painel/TelaValeTroca.test.tsx — vale-troca nas telas (Fase 2, módulo 8), como no DaniPets V9.3.3:
// devolução como vale na Frente de caixa (e a troca na hora), "Usar vale-troca" pela lista ou pelo código, e o
// vale no resumo, na lista, na conta e no extrato da aba Clientes.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaClientes } from './TelaClientes';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const janela = () => screen.getByRole('dialog');
const api = (o: OperadorComPapel) => comCaixaAberto(criarApiLocal({ lojaId: 'vt', operador: o, exemplos: false, atrasoMs: 0 }));
const CODIGO = 'VT-\\d{4}-[A-HJ-NP-Z2-9]{3}';

async function preparar() {
  const dono = api(ANA);
  const petisco = await dono.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: '7897000400403', precoCentavos: 1000 });
  const racao = await dono.criarProduto({ nome: 'Ração Gatos 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990 });
  await darEstoque('vt', 100);
  const maria = await dono.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
  const venda = await dono.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 3 }], pagamentos: [{ forma: 'pix', valorCentavos: 3000 }], clienteId: maria.id });
  return { dono, petisco, racao, maria, venda };
}

async function pdv(o: OperadorComPapel) {
  const base = api(o);
  if ((await base.lerSituacaoDoCaixa()).estado === 'nao_aberto') await base.abrirCaixa({ fundoCentavos: 10000 });
  const a = { ...base, criarVenda: vi.fn(base.criarVenda) };
  render(<TelaFrenteCaixa api={a} operador={{ nome: o.nome, papel: o.papel }} loja={{ nome: 'Loja T' }} fuso={FUSO} aoSair={vi.fn()} />);
  await screen.findByPlaceholderText('Bipe o código (3*código = 3 unidades)');
  return a;
}
const bipar = (codigo: string) => userEvent.type(screen.getByLabelText('Leitor de código de barras'), `${codigo}{Enter}`);
const total = () => txt(screen.getByTestId('pdv-total').textContent);

describe('Frente de caixa · devolução como vale-troca e a troca (DEV-03, PDV-09)', () => {
  it('a devolução vira vale com código; "Usar agora nesta venda" põe o vale no pagamento da troca', async () => {
    await preparar();
    const a = await pdv(ANA);
    await userEvent.click(screen.getByRole('button', { name: 'Devolução / cancelamento' }));
    await userEvent.type(within(janela()).getByLabelText('Número da venda'), '1');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Continuar' }));
    await userEvent.clear(await within(janela()).findByLabelText('Quantidade a devolver de Petisco Bifinho'));
    await userEvent.type(within(janela()).getByLabelText('Quantidade a devolver de Petisco Bifinho'), '2');
    await userEvent.selectOptions(within(janela()).getByLabelText('Como o valor volta'), 'vale');
    expect(within(janela()).getByLabelText('Cliente do vale (opcional)')).toBeTruthy();
    expect(txt(within(janela()).getByRole('option', { name: /\(da venda\)$/ }).textContent)).toBe('Maria Souza (da venda)');
    expect(txt(within(janela()).getByText(/^Vira vale-troca/).closest('p')?.textContent)).toBe('Vira vale-troca: R$ 20,00. O vale não mexe no caixa nem no banco: é crédito do cliente na loja.');
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'trocar por ração');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar devolução' }));

    const titulo = await screen.findByRole('heading', { name: new RegExp(`^Vale-troca ${CODIGO}$`) });
    const codigo = titulo.textContent!.replace('Vale-troca ', '');
    expect(txt(within(janela()).getByText(/^Devolução nº 1 registrada/).textContent)).toBe('Devolução nº 1 registrada. O cliente tem R$ 20,00 de crédito na loja (Maria Souza).');
    expect(screen.getByTestId('vale-codigo').textContent).toBe(codigo);
    await userEvent.click(within(janela()).getByRole('button', { name: 'Usar agora nesta venda (troca)' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(txt(screen.getByRole('status').textContent)).toBe(`Vale ${codigo} no pagamento (saldo R$ 20,00).`);

    await bipar('7891000200209');
    expect(total()).toBe('R$ 59,90');
    expect(txt(screen.getByLabelText('Conta do pagamento').textContent)).toBe(`CompraR$ 79,90Vale-troca ${codigo}− R$ 20,00×`);
    await userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe(`Venda #00002 finalizada: R$ 79,90 em Pix R$ 59,90 + Vale-troca ${codigo} R$ 20,00.`);
    expect(a.criarVenda).toHaveBeenLastCalledWith(expect.objectContaining({ pagamentos: [expect.objectContaining({ forma: 'vale', valorCentavos: 2000 }), { forma: 'pix', valorCentavos: 5990 }] }));
    // usado por inteiro: o botão some (não há outro vale com saldo)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Usar vale-troca' })).toBeNull());
  });
});

describe('Frente de caixa · "Usar vale-troca" (PDV-09)', () => {
  it('escolhe pela lista ou pelo código, sem cliente; o vale que cobre tudo dispensa receber; × tira', async () => {
    const { dono, venda } = await preparar();
    const { vale } = await dono.devolverItens(venda.id, { itens: [{ linha: 0, quantidade: 3 }], motivo: 'troca', modo: 'vale' }); // R$ 30,00
    const a = await pdv(BRUNO);
    await bipar('2*7897000400403');
    await userEvent.click(await screen.findByRole('button', { name: 'Usar vale-troca' }));
    expect(within(janela()).getByRole('heading').textContent).toBe('Usar vale-troca');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Usar' }));
    expect(within(janela()).getByRole('alert').textContent).toBe('Escolha um vale ou digite o código.');
    await userEvent.selectOptions(within(janela()).getByLabelText('Vale'), vale!.id);
    await userEvent.click(within(janela()).getByRole('button', { name: 'Usar' }));
    expect(total()).toBe('R$ 0,00');
    expect(txt(screen.getByText(/paga a compra toda/).closest('p')?.textContent)).toBe(
      `O crédito do cliente paga a compra toda. Não precisa receber nada: é só finalizar. Fica de saldo para a próxima compra: vale ${vale!.codigo} R$ 10,00.`,
    );
    await userEvent.click(screen.getByRole('button', { name: `Não usar o vale ${vale!.codigo} nesta venda` }));
    expect(total()).toBe('R$ 20,00');
    expect(txt(screen.getByRole('status').textContent)).toBe('Vale-troca fora desta venda. O cliente paga R$ 20,00.');

    // pelo código (do jeito que o cliente falar): maiúsculas ou minúsculas
    await userEvent.click(screen.getByRole('button', { name: 'Usar vale-troca' }));
    await userEvent.type(within(janela()).getByLabelText('ou código do vale'), 'vt-9999-aaa');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Usar' }));
    expect((await within(janela()).findByRole('alert')).textContent).toBe('Vale não encontrado. Confira o código.');
    await userEvent.clear(within(janela()).getByLabelText('ou código do vale'));
    await userEvent.type(within(janela()).getByLabelText('ou código do vale'), vale!.codigo.toLowerCase());
    await userEvent.click(within(janela()).getByRole('button', { name: 'Usar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe(`Venda #00002 finalizada: R$ 20,00 em Vale-troca ${vale!.codigo}.`);
    expect(a.criarVenda).toHaveBeenLastCalledWith(expect.objectContaining({ pagamentos: [{ forma: 'vale', valorCentavos: 2000, valeId: vale!.id }] }));
  });
});

describe('Clientes · vale-troca no resumo, na lista, na conta e no extrato (CLI-03, 04, DEV-10)', () => {
  it('"Vale-troca em aberto" lista os vales com saldo; a conta e o extrato do cliente mostram o vale', async () => {
    const { dono, venda } = await preparar();
    const { vale } = await dono.devolverItens(venda.id, { itens: [{ linha: 0, quantidade: 3 }], motivo: 'troca', modo: 'vale' });
    render(<TelaClientes api={api(ANA)} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} />);
    const linha = await screen.findByRole('button', { name: /Vale-troca em aberto/ });
    await waitFor(() => expect(txt(linha.textContent)).toBe('Vale-troca em abertoR$ 30,001 vale com saldo'));
    await userEvent.click(linha);
    const detalhe = await screen.findByRole('region', { name: 'Vale-troca em aberto' });
    expect(txt(within(detalhe).getAllByRole('row')[1]!.textContent)).toMatch(new RegExp(`^${vale!.codigo}Maria Souza\\d\\d/\\d\\d/\\d{4}Devolução nº 1 · compra #00001R\\$ 30,00—R\\$ 30,00$`));
    expect(txt(within(detalhe).getByText(/^Total em vales/).textContent)).toBe('Total em vales: R$ 30,00 · crédito dos clientes na loja');

    // lista: coluna e filtro "Com vale-troca"
    await userEvent.selectOptions(screen.getByLabelText('Filtrar clientes'), 'vale');
    const conta = await screen.findByRole('button', { name: 'Abrir a conta de Maria Souza' });
    expect(txt(conta.closest('tr')!.querySelector('td[data-rotulo="Vale-troca"]')?.textContent)).toBe('R$ 30,00');
    await userEvent.click(conta);
    const metrica = (await screen.findByText('Vale-troca', { selector: '.caixa-metrica-rotulo' })).parentElement!;
    expect(txt(metrica.textContent)).toBe(`Vale-trocaR$ 30,00${vale!.codigo}`);
    await userEvent.click(screen.getByRole('button', { name: 'Vale-troca' }));
    expect(txt(screen.getByRole('region', { name: 'Extrato' }).textContent)).toMatch(new RegExp(`Vale-troca ${vale!.codigo}Devolução nº 1 • compra #00001\\+ R\\$ 30,00`));
  });
});
