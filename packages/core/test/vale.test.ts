// packages/core/test/vale.test.ts — vale-troca (Fase 2, módulo 8), com as regras do DaniPets V9.3.3.
import { describe, expect, it } from 'vitest';
import {
  ALFABETO_CODIGO_VALE,
  calcularDevolucao,
  calcularVenda,
  clienteTemHistorico,
  codigoDoVale,
  descreverPagamentos,
  descreverVale,
  devolverNoVale,
  efeitosFinanceirosDaVenda,
  efeitosFinanceirosDoEstorno,
  emitirVale,
  estornavelPorForma,
  extratoCompletoDoCliente,
  extratoDosVales,
  FORMAS_DA_TELA,
  formaPrecisaDeCliente,
  normalizarCodigoVale,
  type Operador,
  type OperadorComPapel,
  type ProdutoParaVenda,
  proximoNumeroDoVale,
  repartirNosVales,
  resumirAuditoria,
  usadoNaVenda,
  usarVale,
  type ValeTroca,
  valesDoCliente,
  valesEmAberto,
  validarNovaVenda,
  validarPedidoDevolucao,
  type Venda,
} from '../src';

const ANA: Operador = { id: 'ana', nome: 'Ana' };
const DONA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const HOJE = '2026-11-20';
const EM = `${HOJE}T15:00:00.000Z`;
const MARIA = { id: 'maria', nome: 'Maria Souza' };
const limpo = (t: string) => t.replace(/ /g, ' ');
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? limpo(r.erros[0]!.mensagem) : '');

function vale(id: string, extra: Partial<ValeTroca> = {}): ValeTroca {
  return emitirVale(extra.valorCentavos ?? 3000, {
    id,
    numero: extra.numero ?? 1,
    sorteio: [0, 1, 2],
    cliente: extra.cliente === undefined ? MARIA : extra.cliente,
    origem: { vendaId: 'v0', vendaNumero: 7, devolucaoNumero: 2 },
    dia: extra.dia ?? HOJE,
    em: extra.criadoEm ?? EM,
    por: ANA,
  });
}

function venda(extra: Partial<Venda> = {}): Venda {
  return {
    id: 'v1',
    numero: 12,
    criadaEm: EM,
    vendedor: ANA,
    cliente: MARIA,
    itens: [
      { produtoId: 'p1', codigoInterno: '0001', nome: 'Ração', precoListaCentavos: 2500, precoCentavos: 2500, quantidade: 4, unidade: 'un', subtotalCentavos: 10000, desconto: null },
    ],
    totalCentavos: 10000,
    descontoCentavos: 0,
    pagamentos: [{ forma: 'pix', valorCentavos: 10000 }],
    recebidoDinheiroCentavos: null,
    trocoCentavos: 0,
    status: 'finalizada',
    cancelamento: null,
    devolucoes: [],
    ...extra,
  };
}

describe('código e emissão (DEV-03)', () => {
  it('VT-0001-ABC: o número do vale e 3 letras sorteadas, sem as que se confundem', () => {
    expect(ALFABETO_CODIGO_VALE).toHaveLength(32);
    expect(ALFABETO_CODIGO_VALE).not.toMatch(/[01IO]/);
    expect(codigoDoVale(1, [0, 1, 31])).toBe('VT-0001-AB9');
    expect(codigoDoVale(12_345, [255, 32, 7])).toBe('VT-12345-9AH');
    expect(normalizarCodigoVale('  vt-0001-ab9 ')).toBe('VT-0001-AB9');
    expect([proximoNumeroDoVale([]), proximoNumeroDoVale([{ numero: 1 }, { numero: 3 }])]).toEqual([1, 4]);
  });

  it('o vale novo tem o valor como saldo, o cliente e a devolução de origem', () => {
    expect(vale('a', { valorCentavos: 4200 })).toMatchObject({
      codigo: 'VT-0001-ABC',
      valorCentavos: 4200,
      saldoCentavos: 4200,
      situacao: 'aberto',
      cliente: MARIA,
      origem: { vendaId: 'v0', vendaNumero: 7, devolucaoNumero: 2 },
      usos: [],
    });
  });
});

describe('usar e devolver no vale (PDV-09)', () => {
  const ctx = { vendaId: 'v9', vendaNumero: 9, dia: HOJE, em: EM, por: ANA };

  it('o uso diminui o saldo; zerado, o vale fica "usado"; não passa do saldo', () => {
    const r = usarVale(vale('a'), 1200, ctx);
    expect(r.ok && [r.valor.saldoCentavos, r.valor.situacao, r.valor.usos]).toEqual([1800, 'aberto', [{ tipo: 'venda', ...ctx, valorCentavos: 1200, rotulo: null }]]);
    const tudo = r.ok ? usarVale(r.valor, 1800, ctx) : r;
    expect(tudo.ok && [tudo.valor.saldoCentavos, tudo.valor.situacao]).toEqual([0, 'usado']);
    expect(mensagem(usarVale(vale('a'), 3001, ctx))).toBe('O vale VT-0001-ABC tem saldo de R$ 30,00.');
    expect(mensagem(tudo.ok ? usarVale(tudo.valor, 1, ctx) : tudo)).toBe('Vale-troca inválido ou já usado. Remova o vale do pagamento.');
  });

  it('o valor de uma compra paga com o vale volta para o mesmo vale, que reabre', () => {
    const usado = usarVale(vale('a'), 3000, ctx);
    const devolvido = usado.ok ? devolverNoVale(usado.valor, 1000, { ...ctx, rotulo: 'Devolução nº 4' }) : null;
    expect(devolvido && [devolvido.saldoCentavos, devolvido.situacao, devolvido.usos.at(-1)]).toEqual([
      1000,
      'aberto',
      { tipo: 'estorno', vendaId: 'v9', vendaNumero: 9, valorCentavos: -1000, dia: HOJE, em: EM, por: ANA, rotulo: 'Devolução nº 4' },
    ]);
    expect(devolvido && usadoNaVenda(devolvido, 'v9')).toBe(2000);
  });

  it('o que volta pela forma vale-troca vai para os vales da venda, sem passar do que cada um pagou', () => {
    const a = usarVale(vale('a'), 3000, ctx);
    const b = usarVale(vale('b', { numero: 2, valorCentavos: 2000 }), 2000, ctx);
    if (!a.ok || !b.ok) throw new Error('uso');
    const pagamentos = [
      { forma: 'vale' as const, valorCentavos: 3000, valeId: 'a' },
      { forma: 'vale' as const, valorCentavos: 2000, valeId: 'b' },
    ];
    const r1 = repartirNosVales([a.valor, b.valor], pagamentos, 'v9', 2500);
    expect(r1.ok && r1.valor).toEqual([{ valeId: 'a', codigo: 'VT-0001-ABC', valorCentavos: 2500 }]);
    const a2 = devolverNoVale(a.valor, 2500, { ...ctx, rotulo: 'Devolução nº 1' });
    const r2 = repartirNosVales([a2, b.valor], pagamentos, 'v9', 2500);
    expect(r2.ok && r2.valor).toEqual([
      { valeId: 'a', codigo: 'VT-0001-ABC', valorCentavos: 500 },
      { valeId: 'b', codigo: 'VT-0002-ABC', valorCentavos: 2000 },
    ]);
    expect(mensagem(repartirNosVales([a2, b.valor], pagamentos, 'v9', 2501))).toBe('O vale-troca usado nesta venda não foi encontrado.');
  });

  it('em aberto: do mais novo para o mais antigo; os do cliente e quanto somam', () => {
    const usado = usarVale(vale('c', { numero: 3 }), 3000, ctx);
    const lista = [vale('a', { criadoEm: '2026-11-18T10:00:00.000Z' }), vale('b', { numero: 2, cliente: null, criadoEm: '2026-11-19T10:00:00.000Z' }), usado.ok ? usado.valor : vale('x')];
    expect(valesEmAberto(lista).map((v) => v.id)).toEqual(['b', 'a']);
    expect(valesDoCliente(lista, 'maria')).toMatchObject({ saldoCentavos: 3000, abertos: [{ id: 'a' }] });
    expect(limpo(descreverVale(lista[0]!))).toBe('VT-0001-ABC • R$ 30,00 • Maria Souza • 20/11/2026');
    expect(limpo(descreverVale(lista[1]!))).toBe('VT-0002-ABC • R$ 30,00 • 20/11/2026');
  });
});

describe('vale-troca na venda (PDV-09)', () => {
  const catalogo = new Map<string, ProdutoParaVenda>([['p1', { id: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 2500, ativo: true }]]);
  const vales = new Map([
    ['a', { id: 'a', codigo: 'VT-0001-ABC', saldoCentavos: 3000, aberto: true }],
    ['u', { id: 'u', codigo: 'VT-0002-ABC', saldoCentavos: 0, aberto: false }],
  ]);

  it('é crédito da tela (botão próprio), não precisa de cliente e cada vale é uma parte do pagamento', () => {
    expect(FORMAS_DA_TELA).not.toContain('vale');
    expect(formaPrecisaDeCliente('vale')).toBe(false);
    const v = validarNovaVenda({
      itens: [{ produtoId: 'p1', quantidade: 4 }],
      pagamentos: [
        { forma: 'pix', valorCentavos: 5000 },
        { forma: 'vale', valorCentavos: 1000, valeId: 'a' },
        { forma: 'vale', valorCentavos: 2000, valeId: 'b' },
        { forma: 'vale', valorCentavos: 2000, valeId: 'a' },
      ],
    });
    expect(v.ok && v.valor.pagamentos).toEqual([
      { forma: 'pix', valorCentavos: 5000 },
      { forma: 'vale', valorCentavos: 3000, valeId: 'a' },
      { forma: 'vale', valorCentavos: 2000, valeId: 'b' },
    ]);
    expect(mensagem(validarNovaVenda({ itens: [{ produtoId: 'p1', quantidade: 1 }], pagamentos: [{ forma: 'vale', valorCentavos: 2500 }] }))).toBe('Escolha o vale-troca.');
    expect(mensagem(validarNovaVenda({ itens: [{ produtoId: 'p1', quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 2500, valeId: 'a' }] }))).toBe('Só o vale-troca leva o vale.');
  });

  it('o servidor confere o vale (em aberto, com saldo) e grava o código', () => {
    const calc = (valeId: string, valor: number) =>
      calcularVenda(
        { itens: [{ produtoId: 'p1', quantidade: 2 }], pagamentos: [{ forma: 'vale', valorCentavos: valor, valeId }, { forma: 'pix', valorCentavos: 5000 - valor }] },
        catalogo,
        { operador: DONA, vales },
      );
    const r = calc('a', 3000);
    expect(r.ok && r.valor.pagamentos).toEqual([
      { forma: 'vale', valorCentavos: 3000, valeId: 'a', valeCodigo: 'VT-0001-ABC' },
      { forma: 'pix', valorCentavos: 2000 },
    ]);
    expect(mensagem(calc('a', 3001))).toBe('O vale VT-0001-ABC tem saldo de R$ 30,00.');
    expect(mensagem(calc('u', 100))).toBe('Vale-troca inválido ou já usado. Remova o vale do pagamento.');
    expect(mensagem(calc('x', 100))).toBe('Vale-troca inválido ou já usado. Remova o vale do pagamento.');
    expect(limpo(descreverPagamentos(r.ok ? r.valor.pagamentos : []))).toBe('Vale-troca VT-0001-ABC R$ 30,00 + Pix R$ 20,00');
  });

  it('no financeiro o vale não entra em conta nenhuma, nem na venda nem quando volta', () => {
    const v = venda({ pagamentos: [{ forma: 'vale', valorCentavos: 3000, valeId: 'a', valeCodigo: 'VT-0001-ABC' }, { forma: 'pix', valorCentavos: 7000 }] });
    expect(efeitosFinanceirosDaVenda(v).lancamentos.map((l) => [l.conta, l.valorCentavos])).toEqual([['banco', 7000]]);
    const f = efeitosFinanceirosDoEstorno(v, [{ forma: 'vale', valorCentavos: 1500, valeId: 'a' }, { forma: 'pix', valorCentavos: 3500 }], [], { rotulo: 'Devolução nº 1', em: EM, por: ANA });
    expect(f.ok && f.valor.lancamentos.map((l) => [l.conta, l.valorCentavos])).toEqual([['banco', -3500]]);
  });
});

describe('devolução como vale-troca (DEV-03, DEV-04)', () => {
  it('o pedido diz como o valor volta e, no vale, de qual cliente ele é', () => {
    const base = { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' };
    expect(validarPedidoDevolucao(base)).toEqual({ ok: true, valor: { itens: [{ linha: 0, quantidade: 1, voltaAoEstoque: true }], motivo: 'troca', autorizacao: null } });
    const comVale = validarPedidoDevolucao({ ...base, modo: 'vale', clienteDoVale: 'joao' });
    expect(comVale.ok && [comVale.valor.modo, comVale.valor.clienteDoVale]).toEqual(['vale', 'joao']);
    expect(mensagem(validarPedidoDevolucao({ ...base, modo: 'dinheiro' }))).toBe('Escolha como o valor volta para o cliente.');
    expect(mensagem(validarPedidoDevolucao({ ...base, clienteDoVale: 'joao' }))).toBe('O cliente do vale só vale na devolução como vale-troca.');
  });

  it('abate primeiro o fiado em aberto da venda; só o resto vira vale', () => {
    const v = venda({ pagamentos: [{ forma: 'pix', valorCentavos: 6000 }, { forma: 'fiado', valorCentavos: 4000 }] });
    const dev = (qtd: number, fiado: number) => calcularDevolucao(v, { itens: [{ linha: 0, quantidade: qtd }], motivo: 'x', modo: 'vale' }, { operador: DONA, fiadoEmAbertoCentavos: fiado });
    const duas = dev(2, 4000);
    expect(duas.ok && [duas.valor.totalCentavos, duas.valor.estornos, duas.valor.valeCentavos]).toEqual([5000, [{ forma: 'fiado', valorCentavos: 4000 }], 1000]);
    const uma = dev(1, 4000);
    expect(uma.ok && [uma.valor.estornos, uma.valor.valeCentavos]).toEqual([[{ forma: 'fiado', valorCentavos: 2500 }], 0]);
    const paga = dev(2, 0); // o fiado já foi pago: tudo vira vale
    expect(paga.ok && [paga.valor.estornos, paga.valor.valeCentavos]).toEqual([[], 5000]);
    // pelas mesmas formas continua como antes (na proporção)
    const mesma = calcularDevolucao(v, { itens: [{ linha: 0, quantidade: 2 }], motivo: 'x' }, { operador: DONA });
    expect(mesma.ok && [mesma.valor.estornos, mesma.valor.valeCentavos]).toEqual([
      [
        { forma: 'pix', valorCentavos: 3000 },
        { forma: 'fiado', valorCentavos: 2000 },
      ],
      0,
    ]);
  });

  it('o vale emitido não diminui o que ainda pode voltar pelas formas da venda (como no DaniPets)', () => {
    const v = venda({
      devolucoes: [
        {
          id: 'd1',
          numero: 1,
          criadaEm: EM,
          itens: [{ linha: 0, produtoId: 'p1', nome: 'Ração', quantidade: 1, unidade: 'un', valorCentavos: 2500, voltaAoEstoque: true }],
          totalCentavos: 2500,
          estornos: [],
          vale: { id: 'a', codigo: 'VT-0001-ABC', valorCentavos: 2500 },
          motivo: 'troca',
          feitaPor: ANA,
          autorizadaPor: null,
        },
      ],
    });
    expect(estornavelPorForma(v)).toEqual([{ forma: 'pix', valorCentavos: 10000 }]);
    const r = calcularDevolucao(v, { itens: [{ linha: 0, quantidade: 3 }], motivo: 'x' }, { operador: DONA });
    expect(r.ok && r.valor.estornos).toEqual([{ forma: 'pix', valorCentavos: 7500 }]);
    expect(mensagem(calcularDevolucao(v, { itens: [{ linha: 0, quantidade: 4 }], motivo: 'x' }, { operador: DONA }))).toBe('De Ração ainda dá para devolver no máximo 3 un.');
  });
});

describe('cliente, extrato e histórico (CLI-03, 04, 08)', () => {
  it('vale do cliente conta como histórico (não exclui o cadastro, só os dados)', () => {
    expect(clienteTemHistorico('maria', [], [], [])).toBe(false);
    expect(clienteTemHistorico('maria', [], [], [vale('a')])).toBe(true);
  });

  it('extrato: emitido (+), usado (−) e devolvido (+), com o código e a compra', () => {
    const usado = usarVale(vale('a'), 1200, { vendaId: 'v9', vendaNumero: 9, dia: '2026-11-21', em: '2026-11-21T15:00:00.000Z', por: ANA });
    const devolvido = usado.ok ? devolverNoVale(usado.valor, 200, { vendaId: 'v9', vendaNumero: 9, dia: '2026-11-22', em: '2026-11-22T15:00:00.000Z', por: ANA, rotulo: 'Devolução nº 5' }) : vale('x');
    const linhas = extratoDosVales('maria', [devolvido, vale('b', { cliente: null })]).map((l) => `${l.dia} ${l.movimento} | ${l.detalhe} | ${l.sinal}${l.valorCentavos}`);
    expect(linhas).toEqual([
      '2026-11-20 Vale-troca VT-0001-ABC | Devolução nº 2 • compra #00007 | +3000',
      '2026-11-21 Vale-troca usado | VT-0001-ABC • compra #00009 | −1200',
      '2026-11-22 Vale-troca devolvido | VT-0001-ABC • compra #00009 • Devolução nº 5 | +200',
    ]);
    const completo = extratoCompletoDoCliente('maria', [], [], 'America/Sao_Paulo', { lotes: [], usos: [], cupons: [], contatos: [], vales: [devolvido] }, '2026-11-22');
    expect(completo.map((l) => l.movimento)).toEqual(['Vale-troca devolvido', 'Vale-troca usado', 'Vale-troca VT-0001-ABC']);
  });

  it('histórico: vale emitido com o código, o valor e a venda', () => {
    expect(limpo(resumirAuditoria('vale.emitido', { codigo: 'VT-0001-ABC', valorCentavos: 3000, numero: 12 }))).toBe('VT-0001-ABC • R$ 30,00 • devolução da venda nº 00012');
    expect(resumirAuditoria('vale.emitido', { codigo: '<script>' })).toBe('');
  });
});
