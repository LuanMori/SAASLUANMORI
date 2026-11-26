// packages/core/test/vendasAntigas.test.ts — vendas antigas importadas só como histórico (módulo 13).
import { describe, expect, it } from 'vitest';
import { assinaturaDaVendaAntiga, conferirVendasAntigas, pagamentoDaVendaAntiga, resumirAuditoria, resumirVendasAntigas } from '../src';

const HOJE = '2026-11-25';
const T = ['Data', 'Número', 'Cliente', 'Produto', 'Quantidade', 'Preço unitário', 'Total', 'Forma de pagamento', 'Vendedor'];
const ok = <T>(r: { ok: true; valor: T } | { ok: false }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.valor;
};

describe('conferirVendasAntigas', () => {
  it('uma linha por item: o mesmo número no mesmo dia é uma venda só; o total vem da coluna ou de quantidade × preço', () => {
    const c = ok(
      conferirVendasAntigas(
        [
          T,
          ['10/03/2025', '123', 'Maria Souza', 'Ração 15 kg', 1, 189.9, null, 'Cartão de crédito', 'Ana'],
          ['10/03/2025', '123', null, 'Petisco', 3, 7.5, 22.5, null, null],
          ['11/03/2025', '123', 'Outra pessoa', 'Areia', 2, null, 49.8, 'pix', null],
        ],
        { hoje: HOJE, existentes: [] },
      ),
    );
    expect(c.contagem).toEqual({ nova: 3, existe: 0, repetida: 0, erro: 0 });
    expect(c.vendas).toEqual([
      {
        dia: '2025-03-10',
        numeroAntigo: '123',
        cliente: 'Maria Souza',
        vendedor: 'Ana',
        pagamento: 'Crédito',
        itens: [
          { produto: 'Ração 15 kg', quantidade: 1, precoCentavos: 18990, totalCentavos: 18990 },
          { produto: 'Petisco', quantidade: 3, precoCentavos: 750, totalCentavos: 2250 },
        ],
        totalCentavos: 21240,
        linhas: [2, 3],
      },
      // o mesmo número em outro dia é outra venda
      { dia: '2025-03-11', numeroAntigo: '123', cliente: 'Outra pessoa', vendedor: null, pagamento: 'Pix', itens: [{ produto: 'Areia', quantidade: 2, precoCentavos: null, totalCentavos: 4980 }], totalCentavos: 4980, linhas: [4] },
    ]);
  });

  it('uma linha por venda (sem o produto): cada linha é uma venda inteira', () => {
    const c = ok(conferirVendasAntigas([['Data', 'Total', 'Cliente'], [45000, 'R$ 120,00', 'João'], ['2024-12-31', 35, null]], { hoje: HOJE, existentes: [] }));
    expect(c.vendas.map((v) => [v.dia, v.totalCentavos, v.cliente, v.itens])).toEqual([
      ['2023-03-15', 12000, 'João', [{ produto: null, quantidade: null, precoCentavos: null, totalCentavos: 12000 }]],
      ['2024-12-31', 3500, null, [{ produto: null, quantidade: null, precoCentavos: null, totalCentavos: 3500 }]],
    ]);
  });

  it('venda com uma linha com erro fica de fora inteira; datas e valores errados têm o motivo', () => {
    const c = ok(
      conferirVendasAntigas(
        [
          T,
          ['10/03/2025', '9', null, 'Ração', 1, 10, null],
          ['10/03/2025', '9', null, 'Petisco', 0, 5, null],
          ['30/12/2026', null, null, null, null, null, 10],
          ['15/05/1999', null, null, null, null, null, 10],
          [null, null, null, null, null, null, 10],
          ['01/02/2025', null, null, null, null, null, null],
          ['01/02/2025', null, null, 'Brinde', 1, null, 0],
        ],
        { hoje: HOJE, existentes: [] },
      ),
    );
    expect(c.vendas).toEqual([]);
    expect(c.linhas.map((l) => [l.numero, l.situacao, l.motivos[0]])).toEqual([
      [2, 'erro', 'A venda tem uma linha com erro (linha 3): fica de fora inteira.'],
      [3, 'erro', 'Quantidade: use um número maior que zero.'],
      [4, 'erro', 'A data é depois de hoje.'],
      [5, 'erro', 'A data é de antes de 2000.'],
      [6, 'erro', 'Informe a data da venda.'],
      [7, 'erro', 'Informe o total da venda.'],
      [8, 'erro', 'O total da venda precisa ser maior que zero.'],
    ]);
  });

  it('a venda já importada fica de fora: pelo dia e número, ou (sem número) pelo dia, total, cliente e itens', () => {
    const existentes = [
      { dia: '2025-03-10', numeroAntigo: '123', totalCentavos: 1, cliente: null, itens: [] },
      { dia: '2025-02-01', numeroAntigo: null, totalCentavos: 3500, cliente: 'João', itens: [{ produto: null, quantidade: null, precoCentavos: null, totalCentavos: 3500 }] },
    ];
    const c = ok(
      conferirVendasAntigas(
        [
          ['Data', 'Número', 'Cliente', 'Total'],
          ['10/03/2025', ' 123 ', null, 50],
          ['01/02/2025', null, 'joão', 35],
          ['01/02/2025', null, 'Maria', 35],
        ],
        { hoje: HOJE, existentes },
      ),
    );
    expect(c.linhas.map((l) => [l.situacao, l.motivos[0] ?? ''])).toEqual([
      ['existe', 'Já importada: a venda 123 de 10/03/2025.'],
      ['existe', 'Já importada: uma venda igual (mesmo dia, total, cliente e itens).'],
      ['nova', ''],
    ]);
    expect(c.vendasExistentes).toBe(2);
    expect(assinaturaDaVendaAntiga({ dia: '2025-03-10', numeroAntigo: 'A-1', totalCentavos: 0, cliente: null, itens: [] })).toBe('n|2025-03-10|a-1');
  });

  it('sem a coluna Data, o arquivo é recusado', () => {
    expect(conferirVendasAntigas([['Total'], [10]], { hoje: HOJE, existentes: [] })).toMatchObject({ ok: false });
  });
});

describe('ajudas', () => {
  it('forma de pagamento conhecida vira o nome do sistema; outra fica como veio', () => {
    expect(['dinheiro', 'PIX', 'cartão de débito', 'Crédito', 'crediário', 'Boleto', ''].map(pagamentoDaVendaAntiga)).toEqual(['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Fiado', 'Boleto', null]);
  });

  it('o resumo da aba e do histórico', () => {
    expect(
      resumirVendasAntigas([
        { totalCentavos: 21240, itens: [{ produto: 'Ração', quantidade: 1, precoCentavos: null, totalCentavos: 18990 }, { produto: 'Petisco', quantidade: 3, precoCentavos: 750, totalCentavos: 2250 }] },
        { totalCentavos: 3500, itens: [{ produto: null, quantidade: null, precoCentavos: null, totalCentavos: 3500 }] },
      ]),
    ).toEqual({ vendas: 2, totalCentavos: 24740, ticketMedioCentavos: 12370, itens: 2 });
    expect(resumirAuditoria('dados.vendas_importadas', { vendas: 12, totalCentavos: 123400, de: '2025-01-01', ate: '2025-03-31' })).toBe('12 vendas • R$ 1.234,00 • 01/01/2025 a 31/03/2025');
    expect(resumirAuditoria('dados.vendas_importadas', { vendas: 1, totalCentavos: 1000, de: '2025-01-01', ate: '2025-01-01' })).toBe('1 venda • R$ 10,00 • 01/01/2025');
  });
});
