// apps/web/src/painel/caixa/carrinho.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Produto } from '../../api';
import {
  acharPorCodigo,
  autorizacaoNecessaria,
  centavosParaTexto,
  contaDoPagamento,
  disponivelParaVenda,
  lerCarrinhoSalvo,
  sugestoesDeDinheiro,
  lerEntrada,
  type LinhaCarrinho,
  montarPedido,
  pagamentoInicial,
  proximaForma,
  salvarCarrinho,
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
    ['7891000100103', { quantidade: 1, codigo: '7891000100103' }],
    ['  0002 ', { quantidade: 1, codigo: '0002' }],
    ['3*7891000100103', { quantidade: 3, codigo: '7891000100103' }],
    ['3x 0002', { quantidade: 3, codigo: '0002' }],
    ['12 X 0002', { quantidade: 12, codigo: '0002' }],
  ])('"%s"', (texto, esperado) => expect(lerEntrada(texto)).toEqual(esperado));

  it('quantidade quebrada ou grande demais é recusada', () => {
    expect(lerEntrada('0,5*0002')).toEqual({ erro: expect.stringMatching(/quantidade inteira/) });
    expect(lerEntrada('0*0002')).toEqual({ erro: expect.stringMatching(/quantidade inteira/) });
    expect(lerEntrada('10000*0002')).toEqual({ erro: expect.stringMatching(/No máximo 9999/) });
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
      pagamento: { dividido: false, forma: 'debito', partes: [], recebidoTexto: '' },
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
