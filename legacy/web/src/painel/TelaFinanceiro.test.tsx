// apps/web/src/painel/TelaFinanceiro.test.tsx — aba Financeiro (Fase 2, módulo 9; pedido do Luan de 23/11/2026):
// cards de saldo, extrato como o do banco, nome das contas, lançamentos, a receber (confirmar) e a pagar.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaFinanceiro } from './TelaFinanceiro';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const CAIO: OperadorComPapel = { id: 'caio', nome: 'Caio', papel: 'administrador' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const janela = () => screen.getByRole('dialog');

/** Loja em 23/11/2026: saldo inicial de R$ 500,00 no banco (01/11), uma venda em Pix e uma no crédito (baixa manual). */
async function loja({ manual = true } = {}) {
  let relogio = new Date('2026-11-01T15:00:00Z');
  const api = (o: OperadorComPapel) => comCaixaAberto(criarApiLocal({ lojaId: 'fin-tela', operador: o, exemplos: false, atrasoMs: 0, agora: () => relogio }));
  const dono = api(ANA);
  await dono.definirSaldoInicial({ conta: 'banco', valorCentavos: 50000 });
  if (manual) await dono.salvarTaxasCartao({ ...(await dono.lerTaxasCartao()), baixaAutomatica: false });
  const p = await dono.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 10000 });
  await darEstoque('fin-tela', 20);
  relogio = new Date('2026-11-20T15:00:00Z');
  await api(BRUNO).criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 10000 }] });
  await api(BRUNO).criarVenda({ itens: [{ produtoId: p.id, quantidade: 2 }], pagamentos: [{ forma: 'credito', valorCentavos: 20000 }] });
  relogio = new Date('2026-11-23T15:00:00Z');
  return { api, agora: () => relogio, mudar: (iso: string) => (relogio = new Date(iso)) };
}

function abrir(api: ReturnType<typeof criarApiLocal>, papel: OperadorComPapel['papel'], agora: () => Date, aoMudarRegras = vi.fn()) {
  render(<TelaFinanceiro api={api} papel={papel} fuso={FUSO} agora={agora} aoMudarRegras={aoMudarRegras} />);
  return { aoMudarRegras };
}
const cards = () => screen.getByRole('group', { name: 'Saldos e totais' });

describe('Financeiro: cards e extrato', () => {
  it('cards com o saldo total, cada conta, a receber e a pagar; o extrato do banco já vem aberto, como o do banco', async () => {
    const { api, agora } = await loja();
    abrir(api(ANA), 'dono', agora);
    expect(txt((await screen.findByTestId('fin-total')).textContent)).toBe('R$ 600,00');
    expect(txt(within(cards()).getByRole('button', { name: /^Conta bancária/ }).textContent)).toBe('Conta bancáriaR$ 600,00extrato aberto abaixo');
    expect(txt(within(cards()).getByRole('button', { name: /^A receber/ }).textContent)).toBe('A receberR$ 194,00cartão R$ 194,00 • fiado R$ 0,00');
    expect(txt(within(cards()).getByRole('button', { name: /^A pagar/ }).textContent)).toBe('A pagarR$ 0,00nenhuma conta em aberto');
    expect(screen.getByRole('heading', { name: 'Extrato da Conta bancária' })).toBeTruthy();
    const linhas = within(await screen.findByRole('table')).getAllByRole('row').slice(1).map((r) => txt(r.textContent));
    expect(linhas[0]).toBe('01/11/2026Saldo anteriorR$ 0,00');
    expect(linhas[1]).toMatch(/^01\/11\/2026\d\d:\d\dSaldo inicialSaldo inicial \(implantação\) • por Ana\+ R\$ 500,00R\$ 500,00$/);
    expect(linhas[2]).toMatch(/^20\/11\/2026\d\d:\d\dVenda recebida.* • por Bruno\+ R\$ 100,00R\$ 600,00$/);
    expect(linhas[3]).toBe('23/11/2026Saldo em 23/11/2026R$ 600,00');
    expect(txt(screen.getByLabelText('Totais do período').textContent)).toBe('Entradas R$ 600,00Saídas R$ 0,00Saldo final R$ 600,00');
  });

  it('período, só saídas e busca; o Caixa físico tem o extrato dele', async () => {
    const { api, agora } = await loja();
    const dono = api(ANA);
    await dono.lancarNoFinanceiro({ tipo: 'despesa', conta: 'banco', valorCentavos: 4000, descricao: 'Internet', categoria: 'Energia e água' });
    abrir(dono, 'dono', agora);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Período'), 'personalizado');
    const de = screen.getByLabelText('De');
    await userEvent.clear(de);
    await userEvent.type(de, '2026-11-20');
    await waitFor(() => expect(txt(within(screen.getByRole('table')).getAllByRole('row')[1]!.textContent)).toBe('20/11/2026Saldo anteriorR$ 500,00'));
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'saidas');
    const linhas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => txt(r.textContent));
    expect(linhas()).toHaveLength(3);
    expect(linhas()[1]).toMatch(/^23\/11\/2026\d\d:\d\dDespesaInternet • Energia e água • por Ana− R\$ 40,00R\$ 560,00$/);
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'tudo');
    await userEvent.type(screen.getByLabelText('Buscar'), 'bruno');
    expect(linhas().filter((l) => /Venda recebida/.test(l))).toHaveLength(1);
    await userEvent.type(screen.getByLabelText('Buscar'), 'zzz');
    expect(screen.getByText('Nenhum lançamento com esse filtro no período.')).toBeTruthy();

    await userEvent.click(within(cards()).getByRole('button', { name: /^Caixa físico/ }));
    expect(screen.getByRole('heading', { name: 'Extrato do Caixa físico' })).toBeTruthy();
    expect(await screen.findByText('Nenhum lançamento no período.')).toBeTruthy();
  });
});

describe('Financeiro: nome das contas', () => {
  it('o Dono troca "Conta bancária" por "Banco Itaú": vale no card, no extrato e no aviso; dá para voltar ao padrão', async () => {
    const { api, agora } = await loja();
    const { aoMudarRegras } = abrir(api(ANA), 'dono', agora);
    await userEvent.click(await screen.findByRole('button', { name: 'Trocar o nome de Conta bancária' }));
    const campo = within(janela()).getByLabelText('Nome da conta (Conta bancária)');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'B');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar nome' }));
    expect(within(janela()).getByRole('alert').textContent).toBe('O nome da conta tem de 2 a 30 caracteres.');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Banco Itaú');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Conta renomeada: “Conta bancária” agora é “Banco Itaú”.')).toBeTruthy();
    expect(aoMudarRegras).toHaveBeenCalledOnce();
    expect(await within(cards()).findByRole('button', { name: /^Banco Itaú/ })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Extrato de “Banco Itaú”' })).toBeTruthy();
    expect(txt(screen.getByTestId('fin-total').nextElementSibling?.textContent)).toBe('Caixa físico + Banco Itaú');
    // na baixa automática do cartão, o aviso fala do nome novo
    await userEvent.click(within(cards()).getByRole('button', { name: /^A receber/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Taxas da maquininha' })[0]!);
    expect(txt(within(janela()).getByText(/^Automática: entra/).textContent)).toBe('Automática: entra em “Banco Itaú” na hora, já sem a taxa');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cancelar' }));
    // voltar ao padrão
    await userEvent.click(screen.getByRole('button', { name: 'Trocar o nome de Banco Itaú' }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Voltar para “Conta bancária”' }));
    expect(await screen.findByText('Conta renomeada: “Banco Itaú” agora é “Conta bancária”.')).toBeTruthy();
  });

  it('o Administrador também troca o nome', async () => {
    const { api, agora } = await loja();
    abrir(api(CAIO), 'administrador', agora);
    expect(await screen.findByRole('button', { name: 'Trocar o nome de Caixa físico' })).toBeTruthy();
  });
});

describe('Financeiro: lançamentos e saldo inicial', () => {
  it('despesa com categoria; transferência; banco que ficaria negativo pede para confirmar', async () => {
    const { api, agora } = await loja();
    abrir(api(ANA), 'dono', agora);
    await userEvent.click(await screen.findByRole('button', { name: '+ Novo lançamento' }));
    expect(within(janela()).getByRole('button', { name: 'Despesa' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.type(within(janela()).getByLabelText('Valor (R$)'), '700');
    await userEvent.type(within(janela()).getByLabelText('Descrição'), 'Reforma');
    await userEvent.selectOptions(within(janela()).getByLabelText('Categoria'), 'Outras despesas');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar' }));
    expect(txt(within(janela()).getByRole('alert').textContent)).toBe(
      'Conta bancária vai ficar negativa em R$ 100,00 (saldo de R$ 600,00). Confira o valor; se estiver certo, clique em “Lançar mesmo assim”.',
    );
    await userEvent.clear(within(janela()).getByLabelText('Valor (R$)'));
    await userEvent.type(within(janela()).getByLabelText('Valor (R$)'), '70');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar' }));
    expect(txt((await screen.findByText(/^Despesa de/)).textContent)).toBe('Despesa de R$ 70,00 lançada na Conta bancária.');
    await waitFor(() => expect(txt(screen.getByTestId('fin-total').textContent)).toBe('R$ 530,00'));

    await userEvent.click(screen.getByRole('button', { name: '+ Novo lançamento' }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Transferência' }));
    expect((within(janela()).getByLabelText('Vai para') as HTMLInputElement).value).toBe('Caixa físico');
    await userEvent.type(within(janela()).getByLabelText('Valor (R$)'), '30');
    await userEvent.type(within(janela()).getByLabelText('Descrição'), 'Troco para a gaveta');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar' }));
    expect(txt((await screen.findByText(/^Transferência de/)).textContent)).toBe('Transferência de R$ 30,00: da Conta bancária para o Caixa físico.');
    await waitFor(() => expect(txt(within(cards()).getByRole('button', { name: /^Caixa físico/ }).textContent)).toMatch(/^Caixa físicoR\$ 30,00/));
  });

  it('saldo inicial só das contas que ainda não têm; some quando as duas têm', async () => {
    const { api, agora } = await loja();
    abrir(api(ANA), 'dono', agora);
    await userEvent.click(await screen.findByRole('button', { name: 'Saldo inicial' }));
    expect(within(within(janela()).getByLabelText('Conta')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Caixa físico']);
    await userEvent.type(within(janela()).getByLabelText('Valor (R$)'), '150');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Definir saldo inicial' }));
    expect(txt((await screen.findByText(/^Saldo inicial do Caixa/)).textContent)).toBe('Saldo inicial do Caixa físico: R$ 150,00.');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saldo inicial' })).toBeNull());
  });
});

describe('Financeiro: a receber e a pagar', () => {
  it('baixa manual: confirma um recebimento de cartão escolhendo a conta; depois, os vencidos de uma vez', async () => {
    const { api, agora, mudar } = await loja();
    const dono = api(ANA);
    abrir(dono, 'dono', agora);
    await screen.findByTestId('fin-total');
    await userEvent.click(within(cards()).getByRole('button', { name: /^A receber/ }));
    expect(txt(screen.getByText(/^Baixa manual:/).textContent)).toMatch(/fica a receber até alguém confirmar o depósito/);
    const tabela = await screen.findByRole('table');
    expect(txt(within(tabela).getAllByRole('row')[1]!.textContent)).toBe('#00002 20/11/2026Cartão de créditoR$ 200,00R$ 6,00R$ 194,0020/12/2026Confirmar');
    expect(screen.queryByRole('button', { name: /^Confirmar os vencidos/ })).toBeNull(); // ainda não caiu
    await userEvent.click(within(tabela).getByRole('button', { name: 'Confirmar o recebimento da venda #00002' }));
    expect(txt(within(janela()).getByText(/^Venda #00002/).textContent)).toBe('Venda #00002 • cai em 20/12/2026 • líquido R$ 194,00');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar' }));
    expect(txt((await screen.findByText(/^Recebimento confirmado/)).textContent)).toBe('Recebimento confirmado: R$ 194,00 na Conta bancária.');
    expect(await screen.findByText('Nenhum recebimento de cartão a confirmar.')).toBeTruthy();
    await waitFor(() => expect(txt(screen.getByTestId('fin-total').textContent)).toBe('R$ 794,00'));

    // mais duas vendas no débito, que caem no dia seguinte: no dia 25, as duas estão vencidas
    const p = (await dono.listarProdutos())[0]!;
    await api(BRUNO).criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'debito', valorCentavos: 10000 }] });
    await api(BRUNO).criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'debito', valorCentavos: 10000 }] });
    mudar('2026-11-25T15:00:00Z');
    cleanup();
    abrir(dono, 'dono', agora);
    await screen.findByTestId('fin-total');
    await userEvent.click(within(cards()).getByRole('button', { name: /^A receber/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar os vencidos (2)' }));
    expect(txt(within(janela()).getByText(/recebimentos de cartão/).textContent)).toBe('2 recebimentos de cartão • líquido R$ 197,00');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar' }));
    expect(txt((await screen.findByText(/^2 recebimentos confirmados/)).textContent)).toBe('2 recebimentos confirmados: R$ 197,00 na Conta bancária.');
  });

  it('baixa automática: o aviso diz que o cartão já entra na conta na hora', async () => {
    const { api, agora } = await loja({ manual: false });
    abrir(api(ANA), 'dono', agora);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Saldos e totais' })).getByRole('button', { name: /^A receber/ }));
    expect(txt(screen.getByText(/^Baixa automática:/).textContent)).toBe('Baixa automática: as vendas no cartão entram na Conta bancária na hora, já sem a taxa. Não há o que confirmar aqui.');
    expect(await screen.findByText('Nenhum recebimento de cartão a confirmar.')).toBeTruthy();
  });

  it('a pagar: lança uma conta avulsa, paga pelo banco e ela vai para "Pagas"', async () => {
    const { api, agora } = await loja();
    abrir(api(CAIO), 'administrador', agora);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Saldos e totais' })).getByRole('button', { name: /^A pagar/ }));
    expect(await screen.findByText(/^Nenhuma conta a pagar em aberto/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '+ Nova conta a pagar' }));
    await userEvent.type(within(janela()).getByLabelText('Descrição'), 'Aluguel de dezembro');
    await userEvent.type(within(janela()).getByLabelText('Valor (R$)'), '1800');
    const venc = within(janela()).getByLabelText('Vencimento');
    await userEvent.clear(venc);
    await userEvent.type(venc, '2026-12-10');
    await userEvent.selectOptions(within(janela()).getByLabelText('Categoria'), 'Aluguel');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar conta' }));
    expect(txt((await screen.findByText(/^Conta a pagar lançada/)).textContent)).toBe('Conta a pagar lançada: Aluguel de dezembro • R$ 1.800,00 • vence 10/12/2026.');
    const linha = (await screen.findByText('Aluguel de dezembro')).closest('tr')!;
    expect(txt(linha.textContent)).toBe('Aluguel de dezembroconta avulsa • Aluguel10/12/2026R$ 1.800,00Pagar');
    await waitFor(() => expect(txt(within(cards()).getByRole('button', { name: /^A pagar/ }).textContent)).toBe('A pagarR$ 1.800,001 conta'));
    // sem saldo no caixa: pelo banco, que pode ficar negativo
    await userEvent.click(within(linha).getByRole('button', { name: 'Pagar Aluguel de dezembro' }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Pagar' }));
    expect(txt((await screen.findByText(/^Conta paga/)).textContent)).toBe('Conta paga: R$ 1.800,00 saíram de Conta bancária.');
    expect(await screen.findByText(/^Nenhuma conta a pagar em aberto/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Pagas' }));
    expect(txt((await screen.findByText('Aluguel de dezembro')).closest('tr')!.textContent)).toBe('Aluguel de dezembroconta avulsa • Aluguel10/12/2026R$ 1.800,00paga em 23/11/2026 • Conta bancária');
  });
});
