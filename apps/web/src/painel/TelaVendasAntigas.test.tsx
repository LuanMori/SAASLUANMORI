// apps/web/src/painel/TelaVendasAntigas.test.tsx — vendas antigas (módulo 13): importar pela tela de Dados e backup e ver
// nos Relatórios, na aba delas, sem mexer nos números das outras abas.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { TelaDadosBackup } from './TelaDadosBackup';
import { TelaRelatorios } from './TelaRelatorios';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const AGORA = new Date('2026-11-25T15:00:00Z');
const agora = () => AGORA;
const FUSO = 'America/Sao_Paulo';
const api = () => criarApiLocal({ lojaId: 'loja-a', operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0, agora });
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');
const CSV =
  'Data;Número;Cliente;Produto;Quantidade;Preço unitário;Total;Forma de pagamento;Vendedor\n' +
  '10/03/2025;123;Maria Souza;Ração 15 kg;1;189,90;;crédito;Ana\n' +
  '10/03/2025;123;;Petisco;3;7,50;;;\n' +
  '15/04/2025;;João;;;;R$ 50,00;pix;\n';

describe('importar vendas antigas', () => {
  it('a opção Vendas antigas explica que é só histórico, mostra as vendas juntadas e importa', async () => {
    const a = api();
    render(<TelaDadosBackup api={a} papel="dono" fuso={FUSO} agora={agora} />);
    await screen.findByLabelText('Nome da loja');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Partes de Dados e backup' })).getByRole('button', { name: 'Importar e exportar' }));
    const cartao = screen.getByRole('region', { name: 'Importar uma planilha' });
    await userEvent.click(within(cartao).getByRole('radio', { name: 'Vendas antigas' }));
    expect(within(cartao).getByText(/entram só como histórico: não mexem em estoque, caixa nem financeiro/)).toBeTruthy();

    await userEvent.upload(within(cartao).getByLabelText('Escolher a planilha de vendas antigas para importar'), new File([CSV], 'vendas.csv', { type: 'text/csv' }));
    const previa = await within(cartao).findByRole('group', { name: 'O que a planilha traz' });
    expect(txt(previa.textContent)).toContain('vendas.csv: 2 vendas (R$ 262,40, de 10/03/2025 a 15/04/2025). 3 linhas entram.');
    await userEvent.click(within(previa).getByRole('button', { name: 'Importar 2 vendas antigas' }));
    expect(txt((await within(cartao).findByRole('status')).textContent)).toBe('2 vendas antigas importadas (R$ 262,40): estão em Relatórios → Vendas antigas.');
    expect(await a.listarVendasAntigas()).toHaveLength(2);
    expect(await a.listarVendas({})).toEqual([]);
  });
});

describe('Relatórios → Vendas antigas', () => {
  const abas = () => screen.getByRole('navigation', { name: 'Assuntos dos relatórios' });
  const nomesDasAbas = () => within(abas()).getAllByRole('button').map((b) => b.textContent);

  it('sem vendas antigas importadas, a aba não aparece', async () => {
    render(<TelaRelatorios api={api()} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    await screen.findByRole('region', { name: 'Vendas' });
    expect(nomesDasAbas()).not.toContain('Vendas antigas');
  });

  it('com elas: a aba mostra o resumo, a lista e os filtros, e exporta no formato do modelo; as outras abas não mudam', async () => {
    const a = api();
    await a.importarVendasAntigas([
      ['Data', 'Número', 'Cliente', 'Produto', 'Quantidade', 'Preço unitário', 'Total', 'Forma de pagamento'],
      ['10/03/2025', '123', 'Maria Souza', 'Ração 15 kg', 1, 189.9, null, 'crédito'],
      ['10/03/2025', '123', null, 'Petisco', 3, 7.5, null, null],
      ['15/04/2025', null, 'João', null, null, null, 50, 'pix'],
    ]);
    const baixar = vi.fn();
    render(<TelaRelatorios api={a} fuso={FUSO} agora={agora} baixar={baixar} />);
    await within(abas()).findByRole('button', { name: 'Vendas antigas' });
    expect(nomesDasAbas().at(-1)).toBe('Vendas antigas');
    // a aba Tudo não conta as vendas antigas
    const vendasDoTudo = await screen.findByRole('region', { name: 'Vendas' });
    expect(txt(vendasDoTudo.textContent)).toContain('R$ 0,00');

    await userEvent.click(within(abas()).getByRole('button', { name: 'Vendas antigas' }));
    const resumo = await screen.findByRole('region', { name: 'Resumo das vendas antigas' });
    const cartoes = Object.fromEntries([...resumo.querySelectorAll('.rel-cartao')].map((c) => [c.querySelector('span')?.textContent, txt(c.querySelector('strong')?.textContent)]));
    expect(cartoes).toEqual({ 'Total vendido': 'R$ 262,40', Vendas: '2', 'Ticket médio': 'R$ 131,20', Itens: '2' });
    expect(screen.getByRole('note').textContent).toMatch(/só como histórico/);

    await userEvent.type(screen.getByLabelText('Buscar'), 'joão');
    const filtrado = Object.fromEntries(
      [...screen.getByRole('region', { name: 'Resumo das vendas antigas' }).querySelectorAll('.rel-cartao')].map((c) => [c.querySelector('span')?.textContent, txt(c.querySelector('strong')?.textContent)]),
    );
    expect(filtrado).toMatchObject({ 'Total vendido': 'R$ 50,00', Vendas: '1' });

    await userEvent.clear(screen.getByLabelText('Buscar'));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar esta aba (Excel)' }));
    const [nome, bytes] = baixar.mock.calls[0]!;
    expect(nome).toBe('relatorio-vendas-antigas-ate-2026-11-25.xlsx');
    const conteudo = new TextDecoder().decode(bytes);
    for (const t of ['Vendas antigas', 'Itens das vendas antigas', 'Preço unitário', 'Ração 15 kg', 'Crédito']) expect(conteudo).toContain(t);
  });
});
