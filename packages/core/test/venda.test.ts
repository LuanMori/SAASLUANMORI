// packages/core/test/venda.test.ts
import { describe, expect, it } from 'vitest';
import {
  CENTAVOS_MAX,
  calcularVenda,
  diaNoFuso,
  LIMITES_VENDA,
  NOME_FORMA_PAGAMENTO,
  type ProdutoParaVenda,
  resumirVendas,
  type Venda,
  validarNovaVenda,
  vendasNoPeriodo,
} from '../src';

describe('validarNovaVenda', () => {
  it('aceita pedido simples', () => {
    expect(validarNovaVenda({ itens: [{ produtoId: 'p1', quantidade: 2 }], formaPagamento: 'pix' })).toEqual({
      ok: true,
      valor: { itens: [{ produtoId: 'p1', quantidade: 2 }], formaPagamento: 'pix' },
    });
  });

  it('soma o mesmo produto bipado várias vezes', () => {
    const r = validarNovaVenda({
      itens: [
        { produtoId: 'p1', quantidade: 1 },
        { produtoId: 'p2', quantidade: 3 },
        { produtoId: ' p1 ', quantidade: 2 },
      ],
      formaPagamento: 'dinheiro',
    });
    expect(r.ok && r.valor.itens).toEqual([
      { produtoId: 'p1', quantidade: 3 },
      { produtoId: 'p2', quantidade: 3 },
    ]);
  });

  it('recusa quem vendeu, total, loja e preço vindos do cliente', () => {
    const r = validarNovaVenda({
      itens: [{ produtoId: 'p1', quantidade: 1, precoCentavos: 1 }],
      formaPagamento: 'pix',
      vendedor: { id: 'outra-pessoa' },
      totalCentavos: 1,
      lojaId: 'x',
    });
    expect(r.ok).toBe(false);
    const campos = !r.ok ? r.erros.map((e) => e.campo) : [];
    expect(campos).toEqual(expect.arrayContaining(['vendedor', 'totalCentavos', 'lojaId', 'itens.0.precoCentavos']));
    expect(!r.ok && r.erros.find((e) => e.campo === 'vendedor')?.mensagem).toMatch(/quem está logado/);
    expect(!r.ok && r.erros.find((e) => e.campo === 'itens.0.precoCentavos')?.mensagem).toMatch(/cadastro do produto/);
  });

  it.each([
    [null, '_'],
    [[], '_'],
    ['x', '_'],
    [{ formaPagamento: 'pix' }, 'itens'],
    [{ itens: [], formaPagamento: 'pix' }, 'itens'],
    [{ itens: ['x'], formaPagamento: 'pix' }, 'itens.0'],
    [{ itens: [{ produtoId: '', quantidade: 1 }], formaPagamento: 'pix' }, 'itens.0.produtoId'],
    [{ itens: [{ produtoId: 'x'.repeat(65), quantidade: 1 }], formaPagamento: 'pix' }, 'itens.0.produtoId'],
    [{ itens: [{ produtoId: 'p', quantidade: 0 }], formaPagamento: 'pix' }, 'itens.0.quantidade'],
    [{ itens: [{ produtoId: 'p', quantidade: 1.5 }], formaPagamento: 'pix' }, 'itens.0.quantidade'],
    [{ itens: [{ produtoId: 'p', quantidade: '2' }], formaPagamento: 'pix' }, 'itens.0.quantidade'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, extra: 1 }], formaPagamento: 'pix' }, 'itens.0.extra'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }] }, 'formaPagamento'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }], formaPagamento: 'cheque' }, 'formaPagamento'],
  ])('recusa %j (campo %s)', (entrada, campo) => {
    const r = validarNovaVenda(entrada);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erros.map((e) => e.campo)).toContain(campo);
  });

  it('limita unidades por produto (somadas) e produtos diferentes por venda', () => {
    const muitas = validarNovaVenda({
      itens: [
        { produtoId: 'p', quantidade: LIMITES_VENDA.quantidadeMax },
        { produtoId: 'p', quantidade: 1 },
      ],
      formaPagamento: 'pix',
    });
    expect(muitas.ok).toBe(false);
    const itens = Array.from({ length: LIMITES_VENDA.itensMax + 1 }, (_, i) => ({ produtoId: `p${i}`, quantidade: 1 }));
    expect(validarNovaVenda({ itens, formaPagamento: 'pix' }).ok).toBe(false);
    expect(validarNovaVenda({ itens: itens.slice(1), formaPagamento: 'pix' }).ok).toBe(true);
  });

  it('nomes das formas de pagamento iguais aos do DaniPets', () => {
    expect(Object.values(NOME_FORMA_PAGAMENTO)).toEqual(['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito']);
  });
});

describe('calcularVenda', () => {
  const catalogo = new Map<string, ProdutoParaVenda>([
    ['p1', { id: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 18990, ativo: true }],
    ['p2', { id: 'p2', codigoInterno: '0002', nome: 'Petisco', precoCentavos: 750, ativo: true }],
    ['p3', { id: 'p3', codigoInterno: '0003', nome: 'Antigo', precoCentavos: 100, ativo: false }],
  ]);

  it('usa nome e preço do cadastro e soma o total', () => {
    const r = calcularVenda({ itens: [{ produtoId: 'p1', quantidade: 1 }, { produtoId: 'p2', quantidade: 4 }], formaPagamento: 'pix' }, catalogo);
    expect(r).toEqual({
      ok: true,
      valor: {
        totalCentavos: 18990 + 3000,
        itens: [
          { produtoId: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 18990, quantidade: 1, subtotalCentavos: 18990 },
          { produtoId: 'p2', codigoInterno: '0002', nome: 'Petisco', precoCentavos: 750, quantidade: 4, subtotalCentavos: 3000 },
        ],
      },
    });
  });

  it('recusa produto inexistente ou desativado', () => {
    for (const produtoId of ['nao-existe', 'p3']) {
      const r = calcularVenda({ itens: [{ produtoId, quantidade: 1 }], formaPagamento: 'pix' }, catalogo);
      expect(!r.ok && r.erros[0]?.mensagem).toMatch(/não encontrado ou desativado/);
    }
  });

  it('recusa total acima do limite', () => {
    const caro = new Map([['c', { id: 'c', codigoInterno: '0009', nome: 'Caro', precoCentavos: CENTAVOS_MAX, ativo: true }]]);
    expect(calcularVenda({ itens: [{ produtoId: 'c', quantidade: 2 }], formaPagamento: 'pix' }, caro).ok).toBe(false);
  });
});

describe('diaNoFuso e vendasNoPeriodo', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    // 02:30 UTC do dia 13 ainda é 23:30 do dia 12 em São Paulo.
    expect(diaNoFuso('2026-11-13T02:30:00Z')).toBe('2026-11-12');
    expect(diaNoFuso('2026-11-13T03:00:00Z')).toBe('2026-11-13');
    expect(diaNoFuso(new Date('2026-11-13T02:30:00Z'), 'UTC')).toBe('2026-11-13');
  });

  it('data inválida lança erro', () => {
    expect(() => diaNoFuso('ontem')).toThrow(RangeError);
  });

  it('filtra por dia, inclusive, no fuso da loja', () => {
    const vendas = [
      { criadaEm: '2026-11-11T15:00:00Z' },
      { criadaEm: '2026-11-13T02:59:00Z' }, // 12/11 23:59 em SP
      { criadaEm: '2026-11-13T12:00:00Z' },
    ];
    expect(vendasNoPeriodo(vendas, { de: '2026-11-12', ate: '2026-11-12' })).toEqual([vendas[1]]);
    expect(vendasNoPeriodo(vendas, { de: '2026-11-12' })).toEqual([vendas[1], vendas[2]]);
    expect(vendasNoPeriodo(vendas, { ate: '2026-11-12' })).toEqual([vendas[0], vendas[1]]);
    expect(vendasNoPeriodo(vendas, {})).toEqual(vendas);
  });
});

describe('resumirVendas', () => {
  const venda = (p: Partial<Venda>): Venda => ({
    id: 'v',
    numero: 1,
    criadaEm: '2026-11-13T12:00:00Z',
    vendedor: { id: 'ana', nome: 'Ana' },
    itens: [{ produtoId: 'p', codigoInterno: '0001', nome: 'X', precoCentavos: 1000, quantidade: 1, subtotalCentavos: 1000 }],
    totalCentavos: 1000,
    formaPagamento: 'pix',
    ...p,
  });

  it('sem vendas: tudo zero', () => {
    expect(resumirVendas([])).toEqual({
      totalCentavos: 0,
      quantidadeVendas: 0,
      itensVendidos: 0,
      ticketMedioCentavos: 0,
      porForma: [],
      porVendedor: [],
    });
  });

  it('soma total, itens, ticket médio, por forma e por quem vendeu', () => {
    const r = resumirVendas([
      venda({ totalCentavos: 1000 }),
      venda({ totalCentavos: 2001, formaPagamento: 'dinheiro', vendedor: { id: 'bruno', nome: 'Bruno' } }),
      venda({
        totalCentavos: 500,
        formaPagamento: 'pix',
        vendedor: { id: 'bruno', nome: 'Bruno' },
        itens: [{ produtoId: 'p', codigoInterno: '0001', nome: 'X', precoCentavos: 250, quantidade: 2, subtotalCentavos: 500 }],
      }),
    ]);
    expect(r.totalCentavos).toBe(3501);
    expect(r.quantidadeVendas).toBe(3);
    expect(r.itensVendidos).toBe(4);
    expect(r.ticketMedioCentavos).toBe(1167);
    expect(r.porForma).toEqual([
      { forma: 'dinheiro', totalCentavos: 2001, quantidade: 1 },
      { forma: 'pix', totalCentavos: 1500, quantidade: 2 },
    ]);
    expect(r.porVendedor).toEqual([
      { id: 'bruno', nome: 'Bruno', totalCentavos: 2501, quantidade: 2 },
      { id: 'ana', nome: 'Ana', totalCentavos: 1000, quantidade: 1 },
    ]);
  });
});
