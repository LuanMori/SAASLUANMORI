// packages/core/test/compra.test.ts — compras e contas a pagar (Fase 2, módulo 4), com as regras do DaniPets.
import { describe, expect, it } from 'vitest';
import {
  calcularBaixaDoLote,
  calcularEstornoDoItem,
  calcularVenda,
  type Compra,
  type ContaPagar,
  custosMedios,
  dataBr,
  dataValida,
  efeitosDaCompra,
  lotesComSaldo,
  lotesVencendo,
  margemPct,
  montarItensDaCompra,
  type MovimentoEstoque,
  notaRepetida,
  type Operador,
  pagarConta,
  precoSugerido,
  resumirAuditoria,
  resumirContasAPagar,
  totalValendo,
  ultimoCusto,
  validarNovaCompra,
} from '../src';

const ANA: Operador = { id: 'ana', nome: 'Ana' };
const HOJE = '2026-11-19';
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? r.erros[0]!.mensagem : '');
const limpo = (t: string) => t.replace(/ /g, ' ');
const catalogo = new Map([
  ['racao', { id: 'racao', nome: 'Ração 15 kg', ativo: true }],
  ['granel', { id: 'granel', nome: 'Ração a granel', ativo: true, unidade: 'kg' as const }],
  ['velho', { id: 'velho', nome: 'Antigo', ativo: false }],
]);

function compra(extra: Partial<Compra> = {}): Compra {
  const itens = montarItensDaCompra(
    [
      { produtoId: 'racao', quantidade: 10, custoCentavos: 12000, validade: '2026-12-10' },
      { produtoId: 'granel', quantidade: 25000, custoCentavos: 1200, validade: null },
    ],
    catalogo,
  );
  if (!itens.ok) throw new Error('itens');
  return {
    id: 'c1',
    numero: 1,
    data: HOJE,
    criadaEm: '2026-11-19T13:00:00.000Z',
    fornecedor: { id: 'f1', nome: 'Pet Sul' },
    notaFiscal: '1234',
    itens: itens.valor.itens,
    totalCentavos: itens.valor.totalCentavos,
    pagamento: { tipo: 'avista', conta: 'banco' },
    por: ANA,
    ...extra,
  };
}

describe('validarNovaCompra', () => {
  const base = { data: HOJE, itens: [{ produtoId: 'racao', quantidade: 10, custoCentavos: 12000 }], pagamento: { tipo: 'avista', conta: 'banco' } };
  it('aceita a nota com vários itens, à vista ou a prazo', () => {
    const r = validarNovaCompra({ ...base, fornecedorId: 'f1', notaFiscal: '  1234 ' }, { hoje: HOJE });
    expect(r.ok && r.valor).toEqual({ fornecedorId: 'f1', notaFiscal: '1234', data: HOJE, itens: [{ produtoId: 'racao', quantidade: 10, custoCentavos: 12000, validade: null }], pagamento: { tipo: 'avista', conta: 'banco' } });
    const prazo = validarNovaCompra({ ...base, pagamento: { tipo: 'aprazo', vencimento: '2026-12-19' }, precos: { racao: 18990 } }, { hoje: HOJE });
    expect(prazo.ok && [prazo.valor.pagamento, prazo.valor.precos]).toEqual([{ tipo: 'aprazo', vencimento: '2026-12-19' }, { racao: 18990 }]);
  });

  it('recusa o que o DaniPets recusa', () => {
    const c = (extra: object) => mensagem(validarNovaCompra({ ...base, ...extra }, { hoje: HOJE }));
    expect(c({ itens: [] })).toBe('Inclua pelo menos um produto na compra.');
    expect(c({ itens: [{ produtoId: 'racao', quantidade: 1, custoCentavos: 0 }] })).toMatch(/custo unitário \(maior que zero\)\. Mercadoria de bonificação/);
    expect(c({ itens: [{ produtoId: '', quantidade: 1, custoCentavos: 1 }] })).toBe('Item 1: escolha o produto.');
    expect(c({ itens: [{ produtoId: 'racao', quantidade: 1.5, custoCentavos: 1 }] })).toBe('Item 1: informe a quantidade.');
    expect(c({ itens: [{ produtoId: 'racao', quantidade: 1, custoCentavos: 1, validade: '2026-02-30' }] })).toBe('Item 1: validade inválida.');
    expect(c({ data: '2026-11-20' })).toBe('A data da compra não pode ser depois de hoje.');
    expect(c({ data: 'ontem' })).toBe('Informe a data da compra.');
    expect(c({ pagamento: { tipo: 'aprazo' } })).toBe('Informe o vencimento da compra a prazo.');
    expect(c({ pagamento: { tipo: 'avista', conta: 'cofre' } })).toBe('Escolha a conta de pagamento.');
    expect(c({ pagamento: 'pix' })).toBe('Escolha à vista ou a prazo.');
    expect(c({ precos: { outro: 100 } })).toBe('Só muda o preço de produto que está na compra.');
    expect(c({ precos: { racao: 0 } })).toMatch(/novo preço de venda/);
    expect(c({ notaFiscal: 'x'.repeat(61) })).toMatch(/até 60/);
    expect(c({ lojaId: 'outra' })).toBe('Campo não permitido.');
    expect(mensagem(validarNovaCompra(null, { hoje: HOJE }))).toMatch(/objeto/);
  });

  it('datas', () => {
    expect(dataValida('2024-02-29')).toBe(true);
    expect(dataValida('2026-02-29')).toBe(false);
    expect(dataBr('2026-11-19')).toBe('19/11/2026');
  });
});

describe('itens, efeitos e regras da compra', () => {
  it('total na unidade de cada produto (kg ao custo do quilo); produto inativo é recusado', () => {
    const c = compra();
    expect(c.itens.map((i) => [i.unidade, i.totalCentavos])).toEqual([
      ['un', 120000],
      ['kg', 30000],
    ]);
    expect(c.totalCentavos).toBe(150000);
    expect(mensagem(montarItensDaCompra([{ produtoId: 'velho', quantidade: 1, custoCentavos: 1 }], catalogo))).toBe('Item 1: produto não encontrado ou inativo.');
  });

  it('à vista sai da conta na hora; a prazo vira conta a pagar', () => {
    const av = efeitosDaCompra(compra());
    expect(av.movimentos.map((m) => [m.tipo, m.quantidade, m.custoUnitarioCentavos, m.compraLinha])).toEqual([
      ['compra', 10, 12000, 0],
      ['compra', 25000, 1200, 1],
    ]);
    expect(av.lancamentos).toMatchObject([{ conta: 'banco', tipo: 'pagamento_compra', valorCentavos: -150000, compraId: 'c1' }]);
    expect(av.contaPagar).toBeNull();
    const ap = efeitosDaCompra(compra({ pagamento: { tipo: 'aprazo', vencimento: '2026-12-19' } }));
    expect(ap.lancamentos).toEqual([]);
    expect(ap.contaPagar).toMatchObject({ valorCentavos: 150000, vencimento: '2026-12-19', situacao: 'aberta', descricao: 'Compra NF 1234 • 2 itens • Pet Sul' });
  });

  it('nota repetida do mesmo fornecedor (valendo); último custo; margem e preço sugerido', () => {
    const c = compra();
    expect(notaRepetida([c], 'f1', '1234')?.id).toBe('c1');
    expect(notaRepetida([c], 'f2', '1234')).toBeNull();
    expect(notaRepetida([c], 'f1', null)).toBeNull();
    const toda = { ...c, itens: c.itens.map((i) => ({ ...i, estorno: { em: 'x', por: ANA, motivo: 'x' } })) };
    expect(notaRepetida([toda], 'f1', '1234')).toBeNull();
    expect(ultimoCusto([c, { ...c, id: 'c2', criadaEm: '2026-11-19T14:00:00.000Z', itens: [{ ...c.itens[0]!, custoCentavos: 13000 }] }], 'racao')).toBe(13000);
    expect(ultimoCusto([c], 'outro')).toBeNull();
    expect(margemPct(18990, 12000)!.toFixed(1)).toBe('36.8');
    expect(precoSugerido(18990, 12000, 13000)).toBe(20573); // mesma margem
    expect(totalValendo(toda)).toBe(0);
  });
});

describe('estorno de item', () => {
  it('à vista: sai do estoque e o dinheiro volta para a conta', () => {
    const r = calcularEstornoDoItem(compra(), 0, { motivo: 'lançada errada', em: 'agora', por: ANA, saldoEstoque: 10, contaPagar: null });
    expect(r.ok && r.valor.movimento).toMatchObject({ tipo: 'estorno_compra', quantidade: -10, compraLinha: 0 });
    expect(r.ok && r.valor.lancamento).toMatchObject({ conta: 'banco', tipo: 'estorno_compra', valorCentavos: 120000 });
    expect(r.ok && r.valor.item.estorno).toEqual({ em: 'agora', por: ANA, motivo: 'lançada errada' });
  });

  it('não deixa o estoque negativo; pede motivo; item já estornado', () => {
    expect(mensagem(calcularEstornoDoItem(compra(), 0, { motivo: 'x', em: 'agora', por: ANA, saldoEstoque: 4, contaPagar: null }))).toMatch(
      /O estorno deixaria o estoque de Ração 15 kg negativo \(saldo atual 4 un\)/,
    );
    expect(mensagem(calcularEstornoDoItem(compra(), 0, { motivo: ' ', em: 'agora', por: ANA, saldoEstoque: 10, contaPagar: null }))).toBe('Informe o motivo do estorno.');
    const ja = compra();
    ja.itens[0] = { ...ja.itens[0]!, estorno: { em: 'x', por: ANA, motivo: 'x' } };
    expect(mensagem(calcularEstornoDoItem(ja, 0, { motivo: 'x', em: 'agora', por: ANA, saldoEstoque: 10, contaPagar: null }))).toBe('Este item já foi estornado.');
    expect(mensagem(calcularEstornoDoItem(ja, 9, { motivo: 'x', em: 'agora', por: ANA, saldoEstoque: 10, contaPagar: null }))).toBe('Item da compra não encontrado.');
  });

  it('a prazo: a conta aberta diminui (cancelada ao zerar); a já paga devolve o dinheiro', () => {
    const c = compra({ pagamento: { tipo: 'aprazo', vencimento: '2026-12-19' } });
    const cp: ContaPagar = { id: 'cp1', ...efeitosDaCompra(c).contaPagar! };
    const um = calcularEstornoDoItem(c, 0, { motivo: 'errada', em: 'agora', por: ANA, saldoEstoque: 10, contaPagar: cp });
    expect(um.ok && [um.valor.lancamento, um.valor.contaPagar?.valorCentavos, um.valor.contaPagar?.situacao]).toEqual([null, 30000, 'aberta']);
    const dois = calcularEstornoDoItem(c, 1, { motivo: 'errada', em: 'agora', por: ANA, saldoEstoque: 25000, contaPagar: um.ok ? um.valor.contaPagar : null });
    expect(dois.ok && [dois.valor.contaPagar?.valorCentavos, dois.valor.contaPagar?.situacao, dois.valor.contaPagar?.ajustes.length]).toEqual([0, 'cancelada', 2]);
    const paga: ContaPagar = { ...cp, situacao: 'paga', pagamento: { em: 'x', conta: 'caixa', por: ANA } };
    const r = calcularEstornoDoItem(c, 0, { motivo: 'errada', em: 'agora', por: ANA, saldoEstoque: 10, contaPagar: paga });
    expect(r.ok && r.valor.lancamento).toMatchObject({ conta: 'caixa', valorCentavos: 120000 });
  });
});

describe('contas a pagar', () => {
  const cp: ContaPagar = { id: 'cp1', ...efeitosDaCompra(compra({ pagamento: { tipo: 'aprazo', vencimento: '2026-11-10' } })).contaPagar! };
  it('pagar sai da conta escolhida; o Caixa físico não fica negativo', () => {
    const r = pagarConta(cp, { conta: 'banco', em: 'agora', por: ANA, saldoCaixaCentavos: 0 });
    expect(r.ok && r.valor.contaPagar).toMatchObject({ situacao: 'paga', pagamento: { conta: 'banco' } });
    expect(r.ok && r.valor.lancamento).toMatchObject({ tipo: 'pagamento_conta', valorCentavos: -150000, contaPagarId: 'cp1' });
    expect(limpo(mensagem(pagarConta(cp, { conta: 'caixa', em: 'agora', por: ANA, saldoCaixaCentavos: 1000 })))).toBe(
      'O valor (R$ 1.500,00) é maior que o saldo do Caixa físico (R$ 10,00).',
    );
    expect(mensagem(pagarConta({ ...cp, situacao: 'paga' }, { conta: 'banco', em: 'x', por: ANA, saldoCaixaCentavos: 0 }))).toBe('Esta conta já foi paga.');
    expect(mensagem(pagarConta({ ...cp, situacao: 'cancelada' }, { conta: 'banco', em: 'x', por: ANA, saldoCaixaCentavos: 0 }))).toMatch(/cancelada/);
    expect(mensagem(pagarConta(cp, { conta: 'x', em: 'x', por: ANA, saldoCaixaCentavos: 0 }))).toBe('Escolha a conta de pagamento.');
  });
  it('resumo: em aberto e vencidas', () => {
    expect(resumirContasAPagar([cp, { ...cp, id: 'cp2', vencimento: '2026-12-01' }, { ...cp, id: 'cp3', situacao: 'paga' }], HOJE)).toEqual({
      totalCentavos: 300000,
      quantidade: 2,
      vencidasCentavos: 150000,
      vencidas: 1,
    });
  });
});

describe('custo médio móvel (DaniPets replayCosts)', () => {
  const mov = (m: Partial<MovimentoEstoque>): MovimentoEstoque => ({
    id: Math.random().toString(),
    produtoId: 'p',
    tipo: 'compra',
    quantidade: 0,
    criadoEm: '2026-11-01T00:00:00Z',
    motivo: null,
    vendaId: null,
    vendaNumero: null,
    por: ANA,
    ...m,
  });
  it('média ponderada a cada compra; venda só tira quantidade; compra estornada sai da conta', () => {
    const movs = [
      mov({ tipo: 'inicial', quantidade: 10, custoUnitarioCentavos: 1000, criadoEm: '2026-11-01T00:00:00Z' }),
      mov({ tipo: 'venda', quantidade: -5, criadoEm: '2026-11-02T00:00:00Z' }),
      mov({ tipo: 'compra', quantidade: 5, custoUnitarioCentavos: 1400, criadoEm: '2026-11-03T00:00:00Z', compraId: 'c1', compraLinha: 0 }),
      mov({ tipo: 'compra', quantidade: 10, custoUnitarioCentavos: 9999, criadoEm: '2026-11-04T00:00:00Z', compraId: 'c2', compraLinha: 0 }),
      mov({ tipo: 'estorno_compra', quantidade: -10, criadoEm: '2026-11-05T00:00:00Z', compraId: 'c2', compraLinha: 0 }),
    ];
    expect(custosMedios(movs).get('p')).toBe(1200); // (5 × 10,00 + 5 × 14,00) ÷ 10
    expect(custosMedios([mov({ tipo: 'entrada', quantidade: 3 })]).get('p')).toBeNull(); // entrada sem custo (bonificação)
  });

  it('o custo médio fica guardado no item vendido', () => {
    const r = calcularVenda(
      { itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 2000 }] },
      new Map([['p', { id: 'p', codigoInterno: '0001', nome: 'P', precoCentavos: 2000, ativo: true }]]),
      { operador: { ...ANA, papel: 'dono' }, custos: new Map([['p', 1234.6]]) },
    );
    expect(r.ok && r.valor.itens[0]!.custoCentavos).toBe(1235);
  });
});

describe('lotes e validade (o mais antigo sai primeiro)', () => {
  const c1 = compra({ id: 'c1', data: '2026-10-01', criadaEm: '2026-10-01T10:00:00Z' });
  const c2 = compra({ id: 'c2', data: '2026-11-01', criadaEm: '2026-11-01T10:00:00Z', itens: [{ ...c1.itens[0]!, validade: '2027-03-01' }] });
  it('o saldo pertence às compras mais novas', () => {
    expect([...lotesComSaldo([c1, c2], 'racao', 14)]).toEqual([
      ['c2:0', 10],
      ['c1:0', 4],
    ]);
    expect([...lotesComSaldo([c1, c2], 'racao', 3)]).toEqual([
      ['c2:0', 3],
      ['c1:0', 0],
    ]);
  });

  it('lotes vencidos ou vencendo em 30 dias, com saldo e sem baixa', () => {
    const lista = lotesVencendo([c1, c2], new Map([['racao', 14]]), HOJE, '2026-12-19');
    expect(lista.map((l) => [l.compra.id, l.restante, l.vencido])).toEqual([['c1', 4, false]]);
    expect(lotesVencendo([c1, c2], new Map([['racao', 14]]), '2026-12-11', '2027-01-10').map((l) => l.vencido)).toEqual([true]);
    expect(lotesVencendo([c1, c2], new Map([['racao', 5]]), HOJE, '2026-12-19')).toEqual([]); // o lote antigo já acabou
  });

  it('dar baixa: o que está na prateleira sai como "Produto vencido"; zero só tira o aviso', () => {
    const r = calcularBaixaDoLote(c1, 0, { quantidade: 4, observacao: 'conferido', em: 'agora', por: ANA, saldoEstoque: 14 });
    expect(r.ok && r.valor.movimento).toMatchObject({ tipo: 'ajuste', quantidade: -4, motivo: 'Produto vencido', observacao: 'baixa do lote de 01/10/2026 (validade 10/12/2026) • conferido' });
    expect(r.ok && r.valor.item.loteBaixado?.quantidade).toBe(4);
    const zero = calcularBaixaDoLote(c1, 0, { quantidade: 0, em: 'agora', por: ANA, saldoEstoque: 14 });
    expect(zero.ok && zero.valor.movimento).toBeNull();
    expect(mensagem(calcularBaixaDoLote(c1, 0, { quantidade: 20, em: 'agora', por: ANA, saldoEstoque: 14 }))).toBe('O saldo de Ração 15 kg é 14 un: não dá para baixar 20 un.');
    const baixado = { ...c1, itens: [{ ...c1.itens[0]!, loteBaixado: { em: 'x', por: ANA, quantidade: 0, observacao: null } }] };
    expect(mensagem(calcularBaixaDoLote(baixado, 0, { quantidade: 0, em: 'agora', por: ANA, saldoEstoque: 14 }))).toBe('Este lote já teve baixa.');
    expect(mensagem(calcularBaixaDoLote(c1, 0, { quantidade: -1, em: 'agora', por: ANA, saldoEstoque: 14 }))).toBe('Quantidade inválida.');
  });
});

describe('histórico das compras', () => {
  it('resumos', () => {
    expect(limpo(resumirAuditoria('compra.registrada', { numero: 3, notaFiscal: '1234', totalCentavos: 150000, pagamento: 'aprazo' }))).toBe('compra nº 3 • NF 1234 • R$ 1.500,00 • a prazo');
    expect(limpo(resumirAuditoria('compra.estornada', { numero: 3, valorCentavos: 30000 }))).toBe('compra nº 3 • R$ 300,00');
    expect(resumirAuditoria('compra.lote_baixado', { quantidade: 2500, unidade: 'kg' })).toBe('-2,5 kg vencido');
    expect(resumirAuditoria('compra.lote_baixado', { quantidade: 0 })).toBe('o lote já tinha acabado');
    expect(limpo(resumirAuditoria('conta_pagar.paga', { valorCentavos: 150000, conta: 'banco' }))).toBe('R$ 1.500,00 • Conta bancária');
  });
});
