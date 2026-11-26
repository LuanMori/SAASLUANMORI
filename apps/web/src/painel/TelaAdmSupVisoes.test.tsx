// apps/web/src/painel/TelaAdmSupVisoes.test.tsx — Adm. Sup: visões sob medida (módulo 13g). Montar pela tela de Dados e
// backup (com a prévia), editar, excluir, e ver e exportar em Relatórios → Visões.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { carregarRelatorios } from '../relatorios/planilhas';
import { colunasDaBase, planilhaDaVisao } from '../relatorios/visoes';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaDadosBackup } from './TelaDadosBackup';
import { TelaRelatorios } from './TelaRelatorios';
import { LISTA_BASES_DAS_VISOES, NOME_CONTA } from '@saas/core';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const AGORA = new Date('2026-11-25T15:00:00Z');
const agora = () => AGORA;
const SUPORTE: OperadorComPapel = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' };
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const api = (o: OperadorComPapel) => criarApiLocal({ lojaId: 'loja-a', operador: o, exemplos: false, atrasoMs: 0, agora });
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');
const POR_FORMA = {
  nome: 'Pagamentos por forma',
  base: 'pagamentos' as const,
  colunas: ['Forma', 'Valor'],
  filtros: [{ coluna: 'Situação', operador: 'igual' as const, valor: 'Finalizada' }],
  agruparPor: 'Forma',
  ordem: { coluna: 'Valor', sentido: 'desc' as const },
};

/** Três vendas: R$ 30,00 no Pix (duas) e R$ 10,00 em dinheiro. */
async function vendas() {
  const ana = comCaixaAberto(api(ANA));
  const petisco = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('loja-a', 50);
  const vender = (n: number, forma: 'pix' | 'dinheiro') =>
    ana.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: n }], pagamentos: [{ forma, valorCentavos: n * 1000 }], ...(forma === 'dinheiro' ? { recebidoDinheiroCentavos: n * 1000 } : {}) });
  await vender(1, 'pix');
  await vender(2, 'pix');
  await vender(1, 'dinheiro');
  return ana;
}

describe('as bases das visões', () => {
  it('toda base do núcleo tem a tabela dos Relatórios, com as colunas', () => {
    for (const b of LISTA_BASES_DAS_VISOES) expect(colunasDaBase(b, FUSO).length, b).toBeGreaterThan(0);
    expect(colunasDaBase('pagamentos', FUSO).map((c) => c.titulo)).toEqual(['Venda', 'Data', 'Situação', 'Forma', 'Valor', 'Vale-troca']);
  });

  it('monta a visão com os dados da loja; sem a parte da base, não monta', async () => {
    const ana = await vendas();
    const dados = await carregarRelatorios(ana, { de: null, ate: null });
    const r = planilhaDaVisao(POR_FORMA, dados, { de: null, ate: null }, NOME_CONTA, FUSO);
    expect(r).toEqual({
      planilha: {
        nome: 'Pagamentos por forma',
        colunas: [{ titulo: 'Forma' }, { titulo: 'Quantidade', tipo: 'inteiro' }, { titulo: 'Valor', tipo: 'dinheiro' }],
        linhas: [
          ['Pix', 2, 3000],
          ['Dinheiro', 1, 1000],
        ],
      },
      avisos: [],
    });
    expect(planilhaDaVisao({ ...POR_FORMA, base: 'compras' }, { ...dados, compras: null }, { de: null, ate: null }, NOME_CONTA, FUSO)).toBeNull();
  });
});

async function cartaoDasVisoes() {
  const aoMudar = vi.fn();
  render(<TelaDadosBackup api={api(SUPORTE)} papel="super_admin" fuso={FUSO} agora={agora} aoMudar={aoMudar} />);
  await screen.findByLabelText('Nome da loja');
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Partes de Dados e backup' })).getByRole('button', { name: 'Adm. Sup' }));
  return { cartao: screen.getByRole('region', { name: 'Visões sob medida' }), aoMudar };
}

describe('Adm. Sup → visões sob medida', () => {
  it('monta a visão no formulário, com a prévia dos dados da loja, e cria', async () => {
    await vendas();
    const { cartao, aoMudar } = await cartaoDasVisoes();
    expect(await within(cartao).findByText('Nenhuma visão nesta loja ainda.')).toBeTruthy();
    await userEvent.click(within(cartao).getByRole('button', { name: 'Nova visão' }));
    const form = within(cartao).getByRole('form', { name: 'Nova visão' });
    await userEvent.type(within(form).getByLabelText('Nome da visão'), 'Pagamentos por forma');
    await userEvent.selectOptions(within(form).getByLabelText('Base (tabela dos Relatórios)'), 'pagamentos');
    for (const c of ['Venda', 'Data', 'Situação', 'Vale-troca']) await userEvent.click(within(form).getByRole('checkbox', { name: c }));
    expect(within(form).getByText('Colunas (2 de 6)')).toBeTruthy();
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar filtro' }));
    await userEvent.selectOptions(within(form).getByLabelText('Coluna do filtro 1'), 'Situação');
    await userEvent.selectOptions(within(form).getByLabelText('Condição do filtro 1'), 'igual');
    await userEvent.type(within(form).getByLabelText('Valor do filtro 1'), 'Finalizada');
    await userEvent.selectOptions(within(form).getByLabelText('Agrupar e somar por'), 'Forma');
    await userEvent.selectOptions(within(form).getByLabelText('Ordenar por'), 'Valor');
    expect((within(form).getByLabelText('Sentido') as HTMLSelectElement).value).toBe('desc');

    const previa = await within(form).findByRole('region', { name: 'Prévia (todo o período)' });
    await waitFor(() => expect(within(previa).getAllByRole('row').map((r) => txt(r.textContent))).toEqual(['FormaQuantidadeValor', 'Pix2R$ 30,00', 'Dinheiro1R$ 10,00']));
    await userEvent.click(within(form).getByRole('button', { name: 'Criar a visão' }));

    expect(await within(cartao).findByText('Visão "Pagamentos por forma" criada: aparece em Relatórios → Visões.')).toBeTruthy();
    const lista = within(cartao).getByRole('list', { name: 'Visões desta loja' });
    expect(txt(lista.textContent)).toContain('Pagamentos · 2 colunas · Situação é igual a "Finalizada" · agrupada por Forma · ordem: Valor (decrescente)');
    expect(within(cartao).queryByRole('form')).toBeNull();
    expect(aoMudar).toHaveBeenCalled();
    expect(await api(ANA).listarVisoes()).toMatchObject([POR_FORMA]);
  });

  it('nome repetido mostra o erro; edita e exclui (com confirmação)', async () => {
    await api(SUPORTE).salvarVisao(POR_FORMA);
    const { cartao } = await cartaoDasVisoes();
    await userEvent.click(await within(cartao).findByRole('button', { name: 'Nova visão' }));
    let form = within(cartao).getByRole('form', { name: 'Nova visão' });
    await userEvent.type(within(form).getByLabelText('Nome da visão'), 'pagamentos por forma');
    await userEvent.click(within(form).getByRole('button', { name: 'Criar a visão' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('Já existe a visão "pagamentos por forma" nesta loja. Escolha outro nome.');
    await userEvent.click(within(form).getByRole('button', { name: 'Cancelar' }));

    await userEvent.click(within(cartao).getByRole('button', { name: 'Editar a visão Pagamentos por forma' }));
    form = within(cartao).getByRole('form', { name: 'Editar a visão Pagamentos por forma' });
    expect((within(form).getByLabelText('Agrupar e somar por') as HTMLSelectElement).value).toBe('Forma');
    expect((within(form).getByLabelText('Valor do filtro 1') as HTMLInputElement).value).toBe('Finalizada');
    await userEvent.clear(within(form).getByLabelText('Nome da visão'));
    await userEvent.type(within(form).getByLabelText('Nome da visão'), 'Recebido por forma');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar a visão' }));
    expect(await within(cartao).findByText('Visão "Recebido por forma" salva.')).toBeTruthy();

    await userEvent.click(within(cartao).getByRole('button', { name: 'Excluir a visão Recebido por forma' }));
    const confirmar = within(cartao).getByRole('group', { name: 'Excluir a visão Recebido por forma?' });
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Sim, excluir' }));
    expect(await within(cartao).findByText('Visão "Recebido por forma" excluída: ela sai de Relatórios → Visões.')).toBeTruthy();
    expect(within(cartao).getByText('Nenhuma visão nesta loja ainda.')).toBeTruthy();
  });
});

describe('Relatórios → Visões', () => {
  const abas = () => screen.getByRole('navigation', { name: 'Assuntos dos relatórios' });

  it('sem visão, a aba não aparece; com elas, mostra cada uma no período e exporta', async () => {
    const ana = await vendas();
    const { unmount } = render(<TelaRelatorios api={ana} fuso={FUSO} agora={agora} baixar={vi.fn()} />);
    await screen.findByRole('region', { name: 'Resumo de tudo' }).catch(() => undefined);
    expect(within(abas()).queryByRole('button', { name: 'Visões' })).toBeNull();
    unmount();

    await api(SUPORTE).salvarVisao(POR_FORMA);
    await api(SUPORTE).salvarVisao({ nome: 'Vendas no dinheiro', base: 'vendas', colunas: ['Venda', 'Total'], filtros: [{ coluna: 'Pagamento', operador: 'contem', valor: 'dinheiro' }], agruparPor: null, ordem: null });
    const baixar = vi.fn();
    render(<TelaRelatorios api={ana} fuso={FUSO} agora={agora} baixar={baixar} />);
    await userEvent.click(await within(abas()).findByRole('button', { name: 'Visões' }));
    const tabela = await screen.findByRole('region', { name: 'Pagamentos por forma' });
    expect(within(tabela).getAllByRole('row').map((r) => txt(r.textContent))).toEqual(['FormaQuantidadeValor', 'Pix2R$ 30,00', 'Dinheiro1R$ 10,00']);
    expect(txt(within(tabela).getByText(/^Pagamentos · /).textContent)).toBe('Pagamentos · 2 colunas · Situação é igual a "Finalizada" · agrupada por Forma · ordem: Valor (decrescente)');
    const dinheiro = screen.getByRole('region', { name: 'Vendas no dinheiro' });
    expect(within(dinheiro).getAllByRole('row').map((r) => txt(r.textContent))).toEqual(['VendaTotal', '#00003R$ 10,00']);

    await userEvent.click(within(tabela).getByRole('button', { name: /Exportar esta aba/ }));
    expect(baixar).toHaveBeenLastCalledWith('relatorio-pagamentos-por-forma-ate-2026-11-25.xlsx', expect.any(Uint8Array));
    await userEvent.click(screen.getByRole('button', { name: /Exportar as visões/ }));
    expect(baixar).toHaveBeenLastCalledWith('relatorio-visoes-ate-2026-11-25.xlsx', expect.any(Uint8Array));
    expect(await screen.findByText(/^Arquivo do Excel pronto: relatorio-visoes-ate-2026-11-25\.xlsx \(2 abas\)\.$/)).toBeTruthy();
  });
});
