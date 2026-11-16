// packages/core/test/estoque.test.ts
import { describe, expect, it } from 'vitest';
import {
  calcularVenda,
  conferirEstoque,
  type Devolucao,
  movimentoManual,
  movimentosDaDevolucao,
  movimentosDaVenda,
  movimentosDoCancelamento,
  type ProdutoParaVenda,
  saldosDeEstoque,
  situacaoEstoque,
  validarEstoqueMinimo,
  validarMovimentoManual,
  type Venda,
} from '../src';

const ANA = { id: 'ana', nome: 'Ana' };
const venda: Venda = {
  id: 'v1',
  numero: 3,
  criadaEm: '2026-11-16T13:00:00Z',
  vendedor: { id: 'bruno', nome: 'Bruno' },
  cliente: null,
  itens: [
    { produtoId: 'p1', codigoInterno: '0001', nome: 'Ração', precoListaCentavos: 2000, precoCentavos: 2000, quantidade: 2, subtotalCentavos: 4000, desconto: null },
    { produtoId: 'p2', codigoInterno: '0002', nome: 'Petisco', precoListaCentavos: 500, precoCentavos: 500, quantidade: 1, subtotalCentavos: 500, desconto: null },
  ],
  totalCentavos: 4500,
  descontoCentavos: 0,
  pagamentos: [{ forma: 'pix', valorCentavos: 4500 }],
  recebidoDinheiroCentavos: null,
  trocoCentavos: 0,
  status: 'finalizada',
  cancelamento: null,
  devolucoes: [],
};

describe('saldo e situação', () => {
  it('saldo = soma dos movimentos de cada produto', () => {
    const s = saldosDeEstoque([
      { produtoId: 'p1', quantidade: 10 },
      { produtoId: 'p1', quantidade: -3 },
      { produtoId: 'p2', quantidade: 1 },
    ]);
    expect([s.get('p1'), s.get('p2'), s.get('p3')]).toEqual([7, 1, undefined]);
  });

  it('negativo, zerado, baixo (no mínimo ou abaixo) e ok', () => {
    expect(situacaoEstoque(-1, 5)).toBe('negativo');
    expect(situacaoEstoque(0, null)).toBe('zerado');
    expect(situacaoEstoque(5, 5)).toBe('baixo');
    expect(situacaoEstoque(6, 5)).toBe('ok');
    expect(situacaoEstoque(1, null)).toBe('ok'); // sem mínimo, não avisa estoque baixo
  });
});

describe('conferirEstoque (bloqueio da venda)', () => {
  const saldos = new Map([
    ['p1', 2],
    ['p2', -1],
  ]);
  it('passa com saldo suficiente', () => expect(conferirEstoque([{ produtoId: 'p1', nome: 'Ração', quantidade: 2 }], saldos).ok).toBe(true));
  it('soma o mesmo produto em linhas diferentes e mostra o disponível (nunca negativo)', () => {
    const r = conferirEstoque(
      [
        { produtoId: 'p1', nome: 'Ração', quantidade: 1 },
        { produtoId: 'p1', nome: 'Ração', quantidade: 2 },
        { produtoId: 'p2', nome: 'Petisco', quantidade: 1 },
        { produtoId: 'p9', nome: 'Novo', quantidade: 1 },
      ],
      saldos,
    );
    expect(!r.ok && r.erros.map((e) => e.mensagem)).toEqual([
      'Estoque insuficiente para Ração. Disponível: 2 un.',
      'Estoque insuficiente para Petisco. Disponível: 0 un.',
      'Estoque insuficiente para Novo. Disponível: 0 un.',
    ]);
  });

  it('calcularVenda recusa a venda sem estoque quando recebe os saldos', () => {
    const catalogo = new Map<string, ProdutoParaVenda>([['p1', { id: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 2000, ativo: true }]]);
    const pedido = { itens: [{ produtoId: 'p1', quantidade: 3 }], pagamentos: [{ forma: 'pix' as const, valorCentavos: 6000 }] };
    const ctx = { operador: { ...ANA, papel: 'dono' as const } };
    expect(calcularVenda(pedido, catalogo, ctx).ok).toBe(true); // sem saldos, não confere (compatível)
    const r = calcularVenda(pedido, catalogo, { ...ctx, estoque: saldos });
    expect(!r.ok && r.erros[0]!.mensagem).toBe('Estoque insuficiente para Ração. Disponível: 2 un.');
  });
});

describe('movimentos gerados pela venda', () => {
  it('venda: sai cada item, na hora da venda e por quem vendeu', () => {
    expect(movimentosDaVenda(venda)).toEqual([
      { produtoId: 'p1', tipo: 'venda', quantidade: -2, criadoEm: venda.criadaEm, motivo: null, vendaId: 'v1', vendaNumero: 3, por: venda.vendedor },
      { produtoId: 'p2', tipo: 'venda', quantidade: -1, criadoEm: venda.criadaEm, motivo: null, vendaId: 'v1', vendaNumero: 3, por: venda.vendedor },
    ]);
  });

  it('cancelamento: tudo volta, com o motivo', () => {
    const m = movimentosDoCancelamento(venda, { motivo: 'desistiu', em: '2026-11-16T14:00:00Z', por: ANA });
    expect(m.map((x) => [x.produtoId, x.tipo, x.quantidade, x.motivo, x.por.nome])).toEqual([
      ['p1', 'cancelamento', 2, 'desistiu', 'Ana'],
      ['p2', 'cancelamento', 1, 'desistiu', 'Ana'],
    ]);
  });

  it('devolução: só volta o que foi marcado para a prateleira (sem marcação, volta)', () => {
    const dev: Devolucao = {
      id: 'd1',
      numero: 1,
      criadaEm: '2026-11-16T15:00:00Z',
      itens: [
        { linha: 0, produtoId: 'p1', nome: 'Ração', quantidade: 1, valorCentavos: 2000, voltaAoEstoque: false },
        { linha: 1, produtoId: 'p2', nome: 'Petisco', quantidade: 1, valorCentavos: 500, voltaAoEstoque: true },
      ],
      totalCentavos: 2500,
      estornos: [{ forma: 'pix', valorCentavos: 2500 }],
      motivo: 'embalagem rasgada',
      feitaPor: ANA,
      autorizadaPor: null,
    };
    expect(movimentosDaDevolucao(venda, dev)).toEqual([
      { produtoId: 'p2', tipo: 'devolucao', quantidade: 1, criadoEm: dev.criadaEm, motivo: 'embalagem rasgada', vendaId: 'v1', vendaNumero: 3, por: ANA },
    ]);
    // devolução antiga, de antes da marcação: volta
    const antiga = { ...dev, itens: dev.itens.map(({ voltaAoEstoque: _v, ...i }) => i) } as unknown as Devolucao;
    expect(movimentosDaDevolucao(venda, antiga)).toHaveLength(2);
  });
});

describe('entrada e ajuste à mão', () => {
  const campos = (r: { ok: boolean; erros?: { campo: string }[] }) => (!r.ok && r.erros ? r.erros.map((e) => e.campo) : []);

  it('entrada positiva; ajuste diferente de zero com motivo', () => {
    expect(validarMovimentoManual({ produtoId: 'p1', tipo: 'entrada', quantidade: 12, motivo: '' })).toEqual({
      ok: true,
      valor: { produtoId: 'p1', tipo: 'entrada', quantidade: 12, motivo: '' },
    });
    expect(validarMovimentoManual({ produtoId: 'p1', tipo: 'ajuste', quantidade: -2, motivo: ' avaria ' }).ok).toBe(true);
    expect(campos(validarMovimentoManual({ produtoId: 'p1', tipo: 'ajuste', quantidade: -2, motivo: '' }))).toEqual(['motivo']);
    expect(campos(validarMovimentoManual({ produtoId: 'p1', tipo: 'entrada', quantidade: -2 }))).toEqual(['quantidade']);
    expect(campos(validarMovimentoManual({ produtoId: 'p1', tipo: 'entrada', quantidade: 1.5 }))).toEqual(['quantidade']);
    expect(campos(validarMovimentoManual({ produtoId: 'p1', tipo: 'entrada', quantidade: 0 }))).toEqual(['quantidade']);
    expect(campos(validarMovimentoManual({ produtoId: 'p1', tipo: 'venda', quantidade: 1, motivo: 'x' }))).toEqual(['tipo']);
    expect(campos(validarMovimentoManual({ produtoId: ' ', tipo: 'entrada', quantidade: 1, motivo: 'x'.repeat(201) }))).toEqual(['produtoId', 'motivo']);
    expect(campos(validarMovimentoManual({ produtoId: 'p1', tipo: 'entrada', quantidade: 1, saldo: 99 }))).toEqual(['saldo']);
    expect(campos(validarMovimentoManual([]))).toEqual(['_']);
  });

  it('movimentoManual vira movimento sem venda', () => {
    expect(movimentoManual({ produtoId: 'p1', tipo: 'ajuste', quantidade: -1, motivo: 'perda' }, { em: 'agora', por: ANA })).toEqual({
      produtoId: 'p1',
      tipo: 'ajuste',
      quantidade: -1,
      criadoEm: 'agora',
      motivo: 'perda',
      vendaId: null,
      vendaNumero: null,
      por: ANA,
    });
    expect(movimentoManual({ produtoId: 'p1', tipo: 'entrada', quantidade: 5, motivo: '' }, { em: 'agora', por: ANA }).motivo).toBeNull();
  });

  it('estoque mínimo: inteiro de 0 em diante; 0 ou vazio = sem aviso', () => {
    expect(validarEstoqueMinimo(5)).toEqual({ ok: true, valor: 5 });
    expect(validarEstoqueMinimo(0)).toEqual({ ok: true, valor: null });
    expect(validarEstoqueMinimo(null)).toEqual({ ok: true, valor: null });
    expect(validarEstoqueMinimo(-1).ok).toBe(false);
    expect(validarEstoqueMinimo(2.5).ok).toBe(false);
    expect(validarEstoqueMinimo('3').ok).toBe(false);
  });
});
