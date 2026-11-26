// apps/web/src/painel/caixa/carrinho.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Produto } from '../../api';
import {
  acharPorCodigo,
  autorizacaoNecessaria,
  centavosParaTexto,
  contaDoPagamento,
  cupomNaLinha,
  disponivelParaVenda,
  lerCarrinhoSalvo,
  sugestoesDeDinheiro,
  lerEntrada,
  quantidadeDaEntrada,
  type LinhaCarrinho,
  montarPedido,
  pagamentoInicial,
  precoDaLinha,
  proximaForma,
  salvarCarrinho,
  semCreditoDoCliente,
  totaisDoCarrinho,
} from './carrinho';

const produto = (p: Partial<Produto>): Produto => ({
  id: 'x',
  codigoInterno: '0001',
  codigoBarras: null,
  nome: 'X',
  precoCentavos: 1000,
  ativo: true,
  criadoEm: '2026-11-01T00:00:00Z',
  atualizadoEm: '2026-11-01T00:00:00Z',
  ...p,
});
const racao = produto({ id: 'r', codigoInterno: '0001', codigoBarras: '7891000100103', nome: 'Ração', precoCentavos: 18990 });
const petisco = produto({ id: 'p', codigoInterno: '0002', codigoBarras: '0001', nome: 'Petisco', precoCentavos: 750 });
const inativo = produto({ id: 'i', codigoInterno: '0003', codigoBarras: '555', nome: 'Antigo', ativo: false });
const porId = new Map([racao, petisco].map((p) => [p.id, p]));

beforeEach(() => localStorage.clear());

describe('lerEntrada (leitor)', () => {
  it.each([
    ['7891000100103', { multiplicador: null, codigo: '7891000100103' }],
    ['  0002 ', { multiplicador: null, codigo: '0002' }],
    ['3*7891000100103', { multiplicador: '3', codigo: '7891000100103' }],
    ['3x 0002', { multiplicador: '3', codigo: '0002' }],
    ['12 X 0002', { multiplicador: '12', codigo: '0002' }],
    ['1,5*0003', { multiplicador: '1,5', codigo: '0003' }],
  ])('"%s"', (texto, esperado) => expect(lerEntrada(texto)).toEqual(esperado));

  it('a quantidade sai com a unidade do produto: unidades ou gramas', () => {
    expect(quantidadeDaEntrada(null, 'un')).toBe(1);
    expect(quantidadeDaEntrada(null, 'kg')).toBe(1000); // sem multiplicador: 1 kg
    expect(quantidadeDaEntrada('3', 'un')).toBe(3);
    expect(quantidadeDaEntrada('1,5', 'kg')).toBe(1500);
    expect(quantidadeDaEntrada('0,25', 'kg')).toBe(250);
  });

  it('quantidade quebrada (na unidade), zero ou grande demais é recusada', () => {
    expect(quantidadeDaEntrada('0,5', 'un')).toEqual({ erro: expect.stringMatching(/quantidade inteira/) });
    expect(quantidadeDaEntrada('0', 'un')).toEqual({ erro: expect.stringMatching(/quantidade inteira/) });
    expect(quantidadeDaEntrada('10000', 'un')).toEqual({ erro: expect.stringMatching(/No máximo 9999/) });
    expect(quantidadeDaEntrada('1,2345', 'kg')).toEqual({ erro: expect.stringMatching(/até 3 casas/) });
    expect(quantidadeDaEntrada('1000', 'kg')).toEqual({ erro: expect.stringMatching(/No máximo 999,999 kg/) });
  });
});

describe('acharPorCodigo', () => {
  const lista = [racao, petisco, inativo];
  it('código de barras tem prioridade sobre o código interno', () => {
    // "0001" é o código de barras do Petisco e o código interno da Ração
    expect(acharPorCodigo(lista, '0001')?.nome).toBe('Petisco');
    expect(acharPorCodigo(lista, '7891000100103')?.nome).toBe('Ração');
    expect(acharPorCodigo(lista, '0002')?.nome).toBe('Petisco');
  });
  it('produto inativo e código vazio não acham nada', () => {
    expect(acharPorCodigo(lista, '555')).toBeNull();
    expect(acharPorCodigo(lista, '0003')).toBeNull();
    expect(acharPorCodigo(lista, '  ')).toBeNull();
  });
});

describe('totais e desconto', () => {
  const linhas: LinhaCarrinho[] = [
    { produtoId: 'r', quantidade: 1, desconto: { precoFinalCentavos: 17000, motivo: 'avaria', responsavelNome: 'Ana', autorizacao: 'a1' } },
    { produtoId: 'p', quantidade: 4, desconto: null },
  ];
  it('soma itens, produtos, desconto e total com o preço com desconto', () => {
    expect(totaisDoCarrinho(linhas, porId)).toEqual({ itens: 5, produtos: 2, totalCentavos: 17000 + 3000, descontoCentavos: 1990 });
  });

  it('produto por kg: ao preço do quilo, e conta como um item', () => {
    const granel = produto({ id: 'g', nome: 'Ração a granel', precoCentavos: 1990, unidade: 'kg' });
    const r = totaisDoCarrinho(
      [
        { produtoId: 'g', quantidade: 1250, desconto: null },
        { produtoId: 'g2', quantidade: 2000, desconto: { precoFinalCentavos: 1800, motivo: 'x', responsavelNome: 'Ana', autorizacao: null } },
      ],
      new Map([
        ['g', granel],
        ['g2', { ...granel, id: 'g2' }],
      ]),
    );
    expect(r).toEqual({ itens: 2, produtos: 2, totalCentavos: 2488 + 3600, descontoCentavos: 380 });
  });
  it('quem precisa autorizar depende do papel de quem opera', () => {
    expect(autorizacaoNecessaria(linhas[0]!, racao, 'vendedor')).toBe('gestor'); // 10,5% de desconto
    expect(autorizacaoNecessaria(linhas[0]!, racao, 'administrador')).toBeNull();
    expect(autorizacaoNecessaria(linhas[1]!, petisco, 'vendedor')).toBeNull();
  });
});

describe('pagamento', () => {
  it('uma forma só: paga o total; venda de brinde (total zero) fica sem pagamento', () => {
    expect(contaDoPagamento(pagamentoInicial('pix'), 2000)).toMatchObject({ pagamentos: [{ forma: 'pix', valorCentavos: 2000 }], faltaCentavos: 0 });
    expect(contaDoPagamento(pagamentoInicial('pix'), 0).pagamentos).toEqual([]);
  });

  it('dinheiro: recebido e troco', () => {
    const c = contaDoPagamento({ ...pagamentoInicial('dinheiro'), recebidoTexto: '50,00' }, 3240);
    expect([c.dinheiroCentavos, c.recebidoCentavos]).toEqual([3240, 5000]);
    expect(contaDoPagamento({ ...pagamentoInicial('dinheiro'), recebidoTexto: 'abc' }, 3240).recebidoCentavos).toBeNull();
  });

  it('dividido: soma as partes, mostra o que falta e acusa valor inválido', () => {
    const base = { ...pagamentoInicial(), dividido: true };
    const c = contaDoPagamento({ ...base, partes: [{ forma: 'dinheiro', valorTexto: '30' }, { forma: 'pix', valorTexto: '' }] }, 10000);
    expect(c).toMatchObject({ pagamentos: [{ forma: 'dinheiro', valorCentavos: 3000 }], faltaCentavos: 7000, dinheiroCentavos: 3000, invalido: false });
    expect(contaDoPagamento({ ...base, partes: [{ forma: 'pix', valorTexto: '12,3,4' }] }, 100).invalido).toBe(true);
    expect(contaDoPagamento({ ...base, partes: [{ forma: 'pix', valorTexto: '120' }] }, 10000).faltaCentavos).toBe(-2000);
  });

  it('montarPedido manda só produto, quantidade, desconto pedido e pagamento', () => {
    const linhas: LinhaCarrinho[] = [{ produtoId: 'p', quantidade: 2, desconto: { precoFinalCentavos: 700, motivo: 'leve 2', responsavelNome: 'Bruno', autorizacao: null } }];
    const conta = contaDoPagamento({ ...pagamentoInicial('dinheiro'), recebidoTexto: '20' }, 1400);
    expect(montarPedido(linhas, conta)).toEqual({
      itens: [{ produtoId: 'p', quantidade: 2, desconto: { precoFinalCentavos: 700, motivo: 'leve 2', autorizacao: null } }],
      pagamentos: [{ forma: 'dinheiro', valorCentavos: 1400 }],
      recebidoDinheiroCentavos: 2000,
    });
    expect(montarPedido(linhas, contaDoPagamento({ ...pagamentoInicial('pix'), recebidoTexto: '20' }, 1400)).recebidoDinheiroCentavos).toBeNull();
    // com cliente identificado (F6): vai só o id
    expect(montarPedido(linhas, conta, { id: 'c1', nome: 'Maria', cpfMascarado: '***' }).clienteId).toBe('c1');
  });

  it('disponível para venda: estoque menos o que já está no carrinho (nunca negativo)', () => {
    const saldos = new Map([
      ['r', 5],
      ['p', 1],
    ]);
    const noCarrinho: LinhaCarrinho[] = [{ produtoId: 'r', quantidade: 2, desconto: null }];
    expect(disponivelParaVenda(saldos, noCarrinho, 'r')).toBe(3);
    expect(disponivelParaVenda(saldos, noCarrinho, 'p')).toBe(1);
    expect(disponivelParaVenda(saldos, [{ produtoId: 'p', quantidade: 3, desconto: null }], 'p')).toBe(0);
    expect(disponivelParaVenda(saldos, noCarrinho, 'x')).toBe(0);
  });

  it('atalhos do valor recebido: próximas quantias redondas acima do valor (até 3)', () => {
    expect(sugestoesDeDinheiro(3240)).toEqual([3500, 4000, 5000]);
    expect(sugestoesDeDinheiro(7990)).toEqual([8000, 10_000]);
    expect(sugestoesDeDinheiro(37_160)).toEqual([37_500, 38_000, 40_000]);
    expect(sugestoesDeDinheiro(5000)).toEqual([5500, 6000, 10_000]); // valor redondo: a nota exata já é o "Exato"
    expect(sugestoesDeDinheiro(0)).toEqual([]);
  });

  it('proximaForma e centavosParaTexto', () => {
    expect(proximaForma(['pix'])).toBe('dinheiro');
    expect(proximaForma(['dinheiro', 'pix', 'debito', 'credito'])).toBe('dinheiro');
    expect(centavosParaTexto(18990)).toBe('189,90');
    expect(centavosParaTexto(5)).toBe('0,05');
  });
});

describe('carrinho salvo', () => {
  it('guarda e devolve o carrinho, mas sem as autorizações dadas com senha', () => {
    const linhas: LinhaCarrinho[] = [{ produtoId: 'r', quantidade: 1, desconto: { precoFinalCentavos: 15000, motivo: 'x', responsavelNome: 'Ana', autorizacao: 'segredo' } }];
    salvarCarrinho('k', linhas, { dividido: false, forma: 'debito', partes: [], recebidoTexto: '' });
    expect(localStorage.getItem('k')).not.toContain('segredo');
    expect(lerCarrinhoSalvo('k')).toEqual({
      linhas: [{ produtoId: 'r', quantidade: 1, desconto: { precoFinalCentavos: 15000, motivo: 'x', responsavelNome: 'Ana', autorizacao: null } }],
      pagamento: { dividido: false, forma: 'debito', partes: [], recebidoTexto: '', usarCashback: false, vales: [] },
      cliente: null,
    });
  });

  it('guarda o cliente identificado (só id, nome e CPF mascarado); cliente estranho é ignorado', () => {
    const cliente = { id: 'c1', nome: 'Maria Oliveira', cpfMascarado: '***.000.001-**' };
    salvarCarrinho('k', [], pagamentoInicial(), cliente);
    expect(lerCarrinhoSalvo('k')?.cliente).toEqual(cliente);
    localStorage.setItem('k', JSON.stringify({ v: 1, linhas: [], pagamento: {}, cliente: { id: '', nome: 'X' } }));
    expect(lerCarrinhoSalvo('k')?.cliente).toBeNull();
  });
  it('dado estranho ou ausente não quebra a tela', () => {
    expect(lerCarrinhoSalvo('nada')).toBeNull();
    localStorage.setItem('k', '{quebrado');
    expect(lerCarrinhoSalvo('k')).toBeNull();
    localStorage.setItem('k', JSON.stringify({ v: 1, linhas: [{ produtoId: 'r', quantidade: -1 }, { produtoId: 'p', quantidade: 2 }], pagamento: { forma: 'cheque' } }));
    expect(lerCarrinhoSalvo('k')).toEqual({ linhas: [{ produtoId: 'p', quantidade: 2, desconto: null }], pagamento: pagamentoInicial('pix'), cliente: null });
  });
});

// ------------------------------------------------------------------ fidelidade (módulo 7)
describe('cashback e cupom de retorno no carrinho (PDV-04, PDV-08)', () => {
  const CUPOM = { id: 'k1', pct: 5, venceEm: '2026-11-27' };

  it('o cashback abate do total até o saldo; a forma escolhida paga o resto', () => {
    const p = { ...pagamentoInicial('pix'), usarCashback: true };
    expect(contaDoPagamento(p, 1500, 559)).toMatchObject({
      pagamentos: [
        { forma: 'cashback', valorCentavos: 559 },
        { forma: 'pix', valorCentavos: 941 },
      ],
      cashbackCentavos: 559,
      aPagarCentavos: 941,
      faltaCentavos: 0,
    });
    // o cashback cobre tudo: nada a receber
    expect(contaDoPagamento(p, 400, 559)).toMatchObject({ pagamentos: [{ forma: 'cashback', valorCentavos: 400 }], aPagarCentavos: 0, faltaCentavos: 0, dinheiroCentavos: 0 });
    // sem "Usar cashback" ou sem saldo, nada muda
    expect(contaDoPagamento(pagamentoInicial('pix'), 1500, 559).pagamentos).toEqual([{ forma: 'pix', valorCentavos: 1500 }]);
    expect(contaDoPagamento(p, 1500, 0).pagamentos).toEqual([{ forma: 'pix', valorCentavos: 1500 }]);
  });

  it('no pagamento dividido, as partes pagam o que sobra depois do cashback', () => {
    const p = { ...pagamentoInicial('pix'), usarCashback: true, dividido: true, partes: [{ forma: 'dinheiro' as const, valorTexto: '5' }, { forma: 'pix' as const, valorTexto: '4,41' }] };
    const c = contaDoPagamento(p, 1500, 559);
    expect([c.faltaCentavos, c.dinheiroCentavos, c.pagamentos.map((x) => x.forma)]).toEqual([0, 500, ['cashback', 'dinheiro', 'pix']]);
    expect(contaDoPagamento({ ...p, partes: [{ forma: 'pix', valorTexto: '15' }] }, 1500, 559).faltaCentavos).toBe(-559);
    // o cashback cobre tudo: as partes digitadas antes não vão para o pedido
    expect(contaDoPagamento(p, 400, 559)).toMatchObject({ pagamentos: [{ forma: 'cashback', valorCentavos: 400 }], faltaCentavos: 0, dinheiroCentavos: 0 });
  });

  it('o cupom vale nos itens sem desconto manual e que ficam mais baratos', () => {
    const semDesconto: LinhaCarrinho = { produtoId: 'r', quantidade: 2, desconto: null };
    const comDesconto: LinhaCarrinho = { produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 700, motivo: 'x', responsavelNome: 'Ana', autorizacao: null } };
    const bala: Produto = produto({ id: 'b', precoCentavos: 1 });
    expect([cupomNaLinha(semDesconto, racao, CUPOM), cupomNaLinha(comDesconto, petisco, CUPOM), cupomNaLinha({ produtoId: 'b', quantidade: 1, desconto: null }, bala, CUPOM)]).toEqual([true, false, false]);
    expect([precoDaLinha(semDesconto, racao, CUPOM), precoDaLinha(semDesconto, racao), precoDaLinha(comDesconto, petisco, CUPOM)]).toEqual([18041, 18990, 700]);
    expect(totaisDoCarrinho([semDesconto, comDesconto], porId, CUPOM)).toMatchObject({ totalCentavos: 2 * 18041 + 700, descontoCentavos: 2 * 949 + 50 });
    const cliente = { id: 'c1', nome: 'Maria', cpfMascarado: '***.982.247-**', cupom: CUPOM };
    const pedido = montarPedido([semDesconto, comDesconto], contaDoPagamento(pagamentoInicial('pix'), 36782), cliente, porId);
    expect(pedido.itens).toEqual([
      { produtoId: 'r', quantidade: 2, desconto: null, cupom: 'k1' },
      { produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 700, motivo: 'x', autorizacao: null } },
    ]);
    // sem o catálogo (ou sem cupom), o pedido não leva cupom
    expect(montarPedido([semDesconto], contaDoPagamento(pagamentoInicial('pix'), 36082), cliente).itens[0]).not.toHaveProperty('cupom');
  });

  it('o carrinho guardado lembra o cashback e o cupom do cliente; sem cliente, o cashback sai', () => {
    const cliente = { id: 'c1', nome: 'Maria', cpfMascarado: '***.982.247-**', cashbackCentavos: 559, cashbackVencimento: { venceEm: '2026-12-21', valorCentavos: 559 }, cupom: CUPOM, completo: true };
    salvarCarrinho('k', [], { ...pagamentoInicial('pix'), usarCashback: true }, cliente);
    expect(lerCarrinhoSalvo('k')).toMatchObject({ pagamento: { usarCashback: true }, cliente });
    salvarCarrinho('k', [], { ...pagamentoInicial('pix'), usarCashback: true }, null);
    expect(lerCarrinhoSalvo('k')?.pagamento.usarCashback).toBe(false);
    localStorage.setItem('k', JSON.stringify({ v: 1, linhas: [], pagamento: { forma: 'cashback', partes: [{ forma: 'cashback', valorTexto: '1' }] }, cliente: { ...cliente, cupom: { id: 'k', pct: 99, venceEm: 'x' } } }));
    const lido = lerCarrinhoSalvo('k');
    expect([lido?.pagamento.forma, lido?.pagamento.partes, lido?.cliente?.cupom]).toEqual(['pix', [], undefined]); // cashback não é forma da tela; cupom estranho é ignorado
    expect(semCreditoDoCliente({ ...pagamentoInicial('fiado'), usarCashback: true })).toMatchObject({ forma: 'pix', usarCashback: false });
  });
});

// ------------------------------------------------------------------ vale-troca (módulo 8)
describe('vale-troca no carrinho (PDV-09)', () => {
  const A = { id: 'a', codigo: 'VT-0001-ABC', saldoCentavos: 3000 };
  const B = { id: 'b', codigo: 'VT-0002-ABD', saldoCentavos: 2000 };

  it('primeiro o cashback, depois cada vale na ordem em que entrou; a forma escolhida paga o resto', () => {
    const p = { ...pagamentoInicial('pix'), usarCashback: true, vales: [A, B] };
    expect(contaDoPagamento(p, 7000, 1000)).toMatchObject({
      pagamentos: [
        { forma: 'cashback', valorCentavos: 1000 },
        { forma: 'vale', valorCentavos: 3000, valeId: 'a' },
        { forma: 'vale', valorCentavos: 2000, valeId: 'b' },
        { forma: 'pix', valorCentavos: 1000 },
      ],
      valesAplicados: [
        { id: 'a', codigo: 'VT-0001-ABC', valorCentavos: 3000 },
        { id: 'b', codigo: 'VT-0002-ABD', valorCentavos: 2000 },
      ],
      creditosCentavos: 6000,
      aPagarCentavos: 1000,
    });
    // o crédito cobre tudo: o vale que sobra não entra (e a sobra fica nele)
    const c = contaDoPagamento(p, 3500, 1000);
    expect([c.pagamentos.map((x) => [x.forma, x.valorCentavos]), c.aPagarCentavos]).toEqual([
      [
        ['cashback', 1000],
        ['vale', 2500],
      ],
      0,
    ]);
    // o pedido leva só o id do vale (o código o servidor sabe)
    expect(montarPedido([], contaDoPagamento({ ...pagamentoInicial('pix'), vales: [A] }, 2000)).pagamentos).toEqual([{ forma: 'vale', valorCentavos: 2000, valeId: 'a' }]);
  });

  it('o carrinho guardado lembra os vales (código no formato certo, cada um uma vez); sem cliente, o vale fica', () => {
    salvarCarrinho('k', [], { ...pagamentoInicial('pix'), vales: [A, A, { id: 'x', codigo: '<b>', saldoCentavos: 1 }, B] });
    expect(lerCarrinhoSalvo('k')?.pagamento.vales).toEqual([A, B]);
    expect(semCreditoDoCliente({ ...pagamentoInicial('pix'), usarCashback: true, vales: [A] }).vales).toEqual([A]);
  });
});

