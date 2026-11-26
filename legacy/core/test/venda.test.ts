// packages/core/test/venda.test.ts
import { describe, expect, it } from 'vitest';
import {
  type Autorizacao,
  CENTAVOS_MAX,
  calcularCancelamento,
  calcularDevolucao,
  calcularVenda,
  classificarDesconto,
  descreverPagamentos,
  devolucoesComVenda,
  diaNoFuso,
  ehGestor,
  estornavelPorForma,
  formatarNumeroVenda,
  LIMITES_VENDA,
  QUANTIDADE_MAX,
  NOME_FORMA_PAGAMENTO,
  NOME_PAPEL,
  type NovaVenda,
  type OperadorComPapel,
  podeCancelarVenda,
  type ProdutoParaVenda,
  quemAutorizaDesconto,
  quemAutorizaEstorno,
  repartirEstorno,
  restanteParaDevolver,
  resumirDevolucoes,
  resumirVendas,
  semAcento,
  validarNovaVenda,
  validarPedidoCancelamento,
  validarPedidoDevolucao,
  type Venda,
  vendasNoPeriodo,
} from '../src';

const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const CAIO: OperadorComPapel = { id: 'caio', nome: 'Caio', papel: 'administrador' };
const AGORA = new Date('2026-11-16T15:00:00Z'); // 12:00 em Brasília

const campos = (r: { ok: boolean; erros?: { campo: string }[] }) => (!r.ok && 'erros' in r ? r.erros!.map((e) => e.campo) : []);
const mensagens = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && 'erros' in r ? r.erros!.map((e) => e.mensagem).join(' | ') : '');

// ------------------------------------------------------------------ pedido
describe('validarNovaVenda', () => {
  const pix = [{ forma: 'pix', valorCentavos: 100 }];

  it('aceita pedido simples', () => {
    expect(validarNovaVenda({ itens: [{ produtoId: 'p1', quantidade: 2 }], pagamentos: pix })).toEqual({
      ok: true,
      valor: { clienteId: null, itens: [{ produtoId: 'p1', quantidade: 2, desconto: null }], pagamentos: [{ forma: 'pix', valorCentavos: 100 }], recebidoDinheiroCentavos: null },
    });
  });

  it('soma o mesmo produto bipado várias vezes (sem desconto)', () => {
    const r = validarNovaVenda({
      itens: [
        { produtoId: 'p1', quantidade: 1 },
        { produtoId: 'p2', quantidade: 3 },
        { produtoId: ' p1 ', quantidade: 2 },
      ],
      pagamentos: pix,
    });
    expect(r.ok && r.valor.itens.map((i) => [i.produtoId, i.quantidade])).toEqual([
      ['p1', 3],
      ['p2', 3],
    ]);
  });

  it('recusa o mesmo produto repetido quando uma das linhas tem desconto', () => {
    const r = validarNovaVenda({
      itens: [
        { produtoId: 'p1', quantidade: 1, desconto: { precoFinalCentavos: 90, motivo: 'avaria' } },
        { produtoId: 'p1', quantidade: 1 },
      ],
      pagamentos: pix,
    });
    expect(mensagens(r)).toMatch(/Produto repetido/);
  });

  it('pagamento dividido: soma partes da mesma forma e põe na ordem das formas', () => {
    const r = validarNovaVenda({
      itens: [{ produtoId: 'p', quantidade: 1 }],
      pagamentos: [
        { forma: 'pix', valorCentavos: 500 },
        { forma: 'dinheiro', valorCentavos: 300 },
        { forma: 'pix', valorCentavos: 200 },
      ],
      recebidoDinheiroCentavos: 500,
    });
    expect(r.ok && r.valor.pagamentos).toEqual([
      { forma: 'dinheiro', valorCentavos: 300 },
      { forma: 'pix', valorCentavos: 700 },
    ]);
    expect(r.ok && r.valor.recebidoDinheiroCentavos).toBe(500);
  });

  it('aceita desconto com motivo e autorização', () => {
    const r = validarNovaVenda({
      itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 0, motivo: '  brinde de aniversário ', autorizacao: 'tok' } }],
      pagamentos: [],
    });
    expect(r.ok && r.valor.itens[0]!.desconto).toEqual({ precoFinalCentavos: 0, motivo: 'brinde de aniversário', autorizacao: 'tok' });
  });

  it('recusa quem vendeu, total, loja, preço e o formato antigo de forma única vindos da tela', () => {
    const r = validarNovaVenda({
      itens: [{ produtoId: 'p1', quantidade: 1, precoCentavos: 1 }],
      pagamentos: pix,
      vendedor: { id: 'outra-pessoa' },
      totalCentavos: 1,
      lojaId: 'x',
      formaPagamento: 'pix',
    });
    expect(campos(r)).toEqual(expect.arrayContaining(['vendedor', 'totalCentavos', 'lojaId', 'formaPagamento', 'itens.0.precoCentavos']));
    expect(!r.ok && r.erros.find((e) => e.campo === 'vendedor')?.mensagem).toMatch(/quem está logado/);
    expect(!r.ok && r.erros.find((e) => e.campo === 'itens.0.precoCentavos')?.mensagem).toMatch(/cadastro do produto/);
  });

  it.each([
    [null, '_'],
    [[], '_'],
    [{ pagamentos: [] }, 'itens'],
    [{ itens: [], pagamentos: [] }, 'itens'],
    [{ itens: ['x'], pagamentos: [] }, 'itens.0'],
    [{ itens: [{ produtoId: '', quantidade: 1 }], pagamentos: [] }, 'itens.0.produtoId'],
    [{ itens: [{ produtoId: 'x'.repeat(65), quantidade: 1 }], pagamentos: [] }, 'itens.0.produtoId'],
    [{ itens: [{ produtoId: 'p', quantidade: 0 }], pagamentos: [] }, 'itens.0.quantidade'],
    [{ itens: [{ produtoId: 'p', quantidade: 1.5 }], pagamentos: [] }, 'itens.0.quantidade'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, extra: 1 }], pagamentos: [] }, 'itens.0.extra'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: 'x' }], pagamentos: [] }, 'itens.0.desconto'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: -1, motivo: 'a' } }], pagamentos: [] }, 'itens.0.desconto.precoFinalCentavos'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 1.5, motivo: 'a' } }], pagamentos: [] }, 'itens.0.desconto.precoFinalCentavos'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 1 } }], pagamentos: [] }, 'itens.0.desconto.motivo'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 1, motivo: '   ' } }], pagamentos: [] }, 'itens.0.desconto.motivo'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 1, motivo: 'a\nb' } }], pagamentos: [] }, 'itens.0.desconto.motivo'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 1, motivo: 'x'.repeat(201) } }], pagamentos: [] }, 'itens.0.desconto.motivo'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 1, motivo: 'a', autorizacao: 5 } }], pagamentos: [] }, 'itens.0.desconto.autorizacao'],
    [{ itens: [{ produtoId: 'p', quantidade: 1, desconto: { precoFinalCentavos: 1, motivo: 'a', quem: 'Ana' } }], pagamentos: [] }, 'itens.0.desconto.quem'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }] }, 'pagamentos'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: ['x'] }, 'pagamentos.0'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: [{ forma: 'cheque', valorCentavos: 1 }] }, 'pagamentos.0.forma'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 0 }] }, 'pagamentos.0.valorCentavos'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 1, taxa: 1 }] }, 'pagamentos.0.taxa'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: [], recebidoDinheiroCentavos: -1 }, 'recebidoDinheiroCentavos'],
    [{ itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: [], recebidoDinheiroCentavos: '10' }, 'recebidoDinheiroCentavos'],
  ])('recusa %j (campo %s)', (entrada, campo) => {
    expect(campos(validarNovaVenda(entrada))).toContain(campo);
  });

  it('limita a quantidade por produto (somada), produtos diferentes e partes do pagamento', () => {
    // o limite de cada unidade (9999 un ou 999,999 kg) vem no cálculo; aqui, o maior de todos
    expect(
      validarNovaVenda({
        itens: [
          { produtoId: 'p', quantidade: QUANTIDADE_MAX.kg },
          { produtoId: 'p', quantidade: 1 },
        ],
        pagamentos: pix,
      }).ok,
    ).toBe(false);
    expect(validarNovaVenda({ itens: [{ produtoId: 'p', quantidade: LIMITES_VENDA.quantidadeMax + 1 }], pagamentos: pix }).ok).toBe(true);
    const itens = Array.from({ length: LIMITES_VENDA.itensMax + 1 }, (_, i) => ({ produtoId: `p${i}`, quantidade: 1 }));
    expect(validarNovaVenda({ itens, pagamentos: pix }).ok).toBe(false);
    expect(validarNovaVenda({ itens: itens.slice(1), pagamentos: pix }).ok).toBe(true);
    const partes = Array.from({ length: LIMITES_VENDA.pagamentosMax + 1 }, () => ({ forma: 'pix', valorCentavos: 1 }));
    expect(campos(validarNovaVenda({ itens: [{ produtoId: 'p', quantidade: 1 }], pagamentos: partes }))).toContain('pagamentos');
  });

  it('nomes das formas de pagamento iguais aos do DaniPets', () => {
    expect(Object.values(NOME_FORMA_PAGAMENTO)).toEqual(['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito', 'Vale-troca', 'Cashback', 'Fiado']);
  });
});

describe('fiado (F7)', () => {
  const catalogo = new Map<string, ProdutoParaVenda>([['p1', { id: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 5000, ativo: true }]]);
  const clientes = new Map([['c1', { id: 'c1', nome: 'Maria Souza', ativo: true }]]);
  const pedido = (p: Partial<NovaVenda>): NovaVenda => ({ itens: [{ produtoId: 'p1', quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 5000 }], ...p });

  it('só com cliente identificado: sem cliente, a venda é recusada', () => {
    expect(calcularVenda(pedido({}), catalogo, { operador: BRUNO, clientes })).toEqual({
      ok: false,
      erros: [{ campo: 'pagamentos', mensagem: 'Venda no fiado precisa de cliente identificado. Identifique o cliente (F6).' }],
    });
    const r = calcularVenda(pedido({ clienteId: 'c1' }), catalogo, { operador: BRUNO, clientes });
    expect(r.ok && [r.valor.cliente, r.valor.pagamentos]).toEqual([{ id: 'c1', nome: 'Maria Souza' }, [{ forma: 'fiado', valorCentavos: 5000 }]]);
  });

  it('pode ser parte de um pagamento dividido (o resto no dinheiro, com troco)', () => {
    const v = validarNovaVenda({
      itens: [{ produtoId: 'p1', quantidade: 1 }],
      pagamentos: [
        { forma: 'fiado', valorCentavos: 3000 },
        { forma: 'dinheiro', valorCentavos: 2000 },
      ],
      recebidoDinheiroCentavos: 5000,
      clienteId: 'c1',
    });
    expect(v.ok && v.valor.pagamentos.map((p) => p.forma)).toEqual(['dinheiro', 'fiado']);
    const r = v.ok ? calcularVenda(v.valor, catalogo, { operador: BRUNO, clientes }) : null;
    expect(r?.ok && r.valor.trocoCentavos).toBe(3000);
    expect(descreverPagamentos([{ forma: 'dinheiro', valorCentavos: 2000 }, { forma: 'fiado', valorCentavos: 3000 }]).replace(/\u00a0/g, ' ')).toBe(
      'Dinheiro R$ 20,00 + Fiado R$ 30,00',
    );
  });
});

// ------------------------------------------------------------------ desconto
describe('classificarDesconto e quem autoriza', () => {
  it.each([
    [1000, 1000, 'nenhum'],
    [1000, 1100, 'invalido'],
    [1000, -1, 'invalido'],
    [1000, 950, 'dentro-do-limite'],
    [1000, 900, 'dentro-do-limite'], // 10% exatos: o vendedor ainda pode
    [1000, 899, 'acima-do-limite'],
    [1000, 0, 'brinde'],
  ])('lista %i, final %i → %s', (lista, final, tipo) => {
    expect(classificarDesconto(lista, final).tipo).toBe(tipo);
  });

  it('Vendedor: acima de 10% precisa de gestor; brinde precisa de Dono', () => {
    expect(quemAutorizaDesconto('dentro-do-limite', 'vendedor')).toBeNull();
    expect(quemAutorizaDesconto('acima-do-limite', 'vendedor')).toBe('gestor');
    expect(quemAutorizaDesconto('brinde', 'vendedor')).toBe('dono');
  });

  it('Administrador dá qualquer desconto, mas brinde precisa de Dono; Dono não precisa de ninguém', () => {
    expect(quemAutorizaDesconto('acima-do-limite', 'administrador')).toBeNull();
    expect(quemAutorizaDesconto('brinde', 'administrador')).toBe('dono');
    expect(quemAutorizaDesconto('brinde', 'dono')).toBeNull();
    expect(quemAutorizaDesconto('acima-do-limite', 'dono')).toBeNull();
  });

  it('cancelar e devolver: só o Vendedor precisa de autorização', () => {
    expect(quemAutorizaEstorno('vendedor')).toBe('gestor');
    expect(quemAutorizaEstorno('administrador')).toBeNull();
    expect(quemAutorizaEstorno('dono')).toBeNull();
  });
});

// ------------------------------------------------------------------ cálculo da venda
describe('calcularVenda', () => {
  const catalogo = new Map<string, ProdutoParaVenda>([
    ['p1', { id: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 18990, ativo: true }],
    ['p2', { id: 'p2', codigoInterno: '0002', nome: 'Petisco', precoCentavos: 750, ativo: true }],
    ['p3', { id: 'p3', codigoInterno: '0003', nome: 'Antigo', precoCentavos: 100, ativo: false }],
  ]);
  const autorizacao = (id: string, autorizador: OperadorComPapel, acao: Autorizacao['acao'], criadaEm = AGORA.toISOString()): Autorizacao => ({
    id,
    autorizador,
    acao,
    criadaEm,
  });
  const pedido = (p: Partial<NovaVenda>): NovaVenda => ({ itens: [{ produtoId: 'p2', quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 750 }], ...p });
  const calc = (p: Partial<NovaVenda>, operador = BRUNO, autorizacoes: Autorizacao[] = []) =>
    calcularVenda(pedido(p), catalogo, { operador, autorizacoes: new Map(autorizacoes.map((a) => [a.id, a])), agora: AGORA });

  it('usa nome e preço do cadastro e soma o total', () => {
    const r = calc({
      itens: [
        { produtoId: 'p1', quantidade: 1 },
        { produtoId: 'p2', quantidade: 4 },
      ],
      pagamentos: [{ forma: 'pix', valorCentavos: 21990 }],
    });
    expect(r.ok && r.valor).toEqual({
      totalCentavos: 21990,
      descontoCentavos: 0,
      pagamentos: [{ forma: 'pix', valorCentavos: 21990 }],
      recebidoDinheiroCentavos: null,
      trocoCentavos: 0,
      cliente: null,
      autorizacoesUsadas: [],
      cupomUsado: null,
      itens: [
        { produtoId: 'p1', codigoInterno: '0001', nome: 'Ração', precoListaCentavos: 18990, precoCentavos: 18990, quantidade: 1, unidade: 'un', subtotalCentavos: 18990, desconto: null },
        { produtoId: 'p2', codigoInterno: '0002', nome: 'Petisco', precoListaCentavos: 750, precoCentavos: 750, quantidade: 4, unidade: 'un', subtotalCentavos: 3000, desconto: null },
      ],
    });
  });

  it('recusa produto inexistente ou desativado', () => {
    for (const produtoId of ['nao-existe', 'p3']) {
      expect(mensagens(calc({ itens: [{ produtoId, quantidade: 1 }] }))).toMatch(/não encontrado ou desativado/);
    }
  });

  it('desconto até 10% pelo Vendedor: ele mesmo é o responsável', () => {
    const r = calc({
      itens: [{ produtoId: 'p1', quantidade: 2, desconto: { precoFinalCentavos: 17091, motivo: 'embalagem amassada' } }],
      pagamentos: [{ forma: 'pix', valorCentavos: 34182 }],
    });
    expect(r.ok && r.valor.itens[0]!.desconto).toEqual({ motivo: 'embalagem amassada', responsavel: { id: 'bruno', nome: 'Bruno' }, autorizadoComSenha: false });
    expect(r.ok && r.valor.descontoCentavos).toBe(2 * (18990 - 17091));
  });

  it('desconto acima de 10% pelo Vendedor sem autorização: recusado', () => {
    const r = calc({ itens: [{ produtoId: 'p2', quantidade: 1, desconto: { precoFinalCentavos: 600, motivo: 'x' } }], pagamentos: [{ forma: 'pix', valorCentavos: 600 }] });
    expect(mensagens(r)).toMatch(/passa de 10% e precisa da autorização do Dono ou do Administrador/);
  });

  it('o limite vem da regra da loja: com 25%, o Vendedor dá 20% sozinho; com 5%, 10% já pede senha', () => {
    const pedidoVinte = pedido({ itens: [{ produtoId: 'p2', quantidade: 1, desconto: { precoFinalCentavos: 600, motivo: 'x' } }], pagamentos: [{ forma: 'pix', valorCentavos: 600 }] });
    const livre = calcularVenda(pedidoVinte, catalogo, { operador: BRUNO, agora: AGORA, limiteDescontoPct: 25 });
    expect(livre.ok && livre.valor.itens[0]!.desconto?.autorizadoComSenha).toBe(false);
    const pedidoDez = pedido({ itens: [{ produtoId: 'p1', quantidade: 1, desconto: { precoFinalCentavos: 17091, motivo: 'x' } }], pagamentos: [{ forma: 'pix', valorCentavos: 17091 }] });
    expect(mensagens(calcularVenda(pedidoDez, catalogo, { operador: BRUNO, agora: AGORA, limiteDescontoPct: 5.5 }))).toMatch(/passa de 5,5% e precisa da autorização/);
  });

  it('desconto acima de 10% com autorização do Administrador: quem autorizou vira o responsável', () => {
    const a = autorizacao('tok', CAIO, { tipo: 'desconto', produtoId: 'p2', precoFinalCentavos: 600 });
    const r = calc(
      { itens: [{ produtoId: 'p2', quantidade: 1, desconto: { precoFinalCentavos: 600, motivo: 'cliente antigo', autorizacao: 'tok' } }], pagamentos: [{ forma: 'pix', valorCentavos: 600 }] },
      BRUNO,
      [a],
    );
    expect(r.ok && r.valor.itens[0]!.desconto).toEqual({ motivo: 'cliente antigo', responsavel: { id: 'caio', nome: 'Caio' }, autorizadoComSenha: true });
    expect(r.ok && r.valor.autorizacoesUsadas).toEqual(['tok']);
  });

  it.each([
    ['de outro produto', autorizacao('tok', ANA, { tipo: 'desconto', produtoId: 'p1', precoFinalCentavos: 600 })],
    ['para um preço maior (pediu mais desconto do que autorizado)', autorizacao('tok', ANA, { tipo: 'desconto', produtoId: 'p2', precoFinalCentavos: 650 })],
    ['vencida (mais de 4 horas)', autorizacao('tok', ANA, { tipo: 'desconto', produtoId: 'p2', precoFinalCentavos: 600 }, '2026-11-16T10:59:00Z')],
    ['de um Vendedor', autorizacao('tok', { id: 'x', nome: 'X', papel: 'vendedor' }, { tipo: 'desconto', produtoId: 'p2', precoFinalCentavos: 600 })],
    ['de outro tipo', autorizacao('tok', ANA, { tipo: 'cancelamento', vendaId: 'v' })],
  ])('autorização %s não vale', (_, a) => {
    const r = calc(
      { itens: [{ produtoId: 'p2', quantidade: 1, desconto: { precoFinalCentavos: 600, motivo: 'x', autorizacao: 'tok' } }], pagamentos: [{ forma: 'pix', valorCentavos: 600 }] },
      BRUNO,
      [a],
    );
    expect(r.ok).toBe(false);
  });

  it('brinde: Administrador não autoriza; Dono autoriza; Dono operando não precisa de senha', () => {
    const brinde = { itens: [{ produtoId: 'p2', quantidade: 1, desconto: { precoFinalCentavos: 0, motivo: 'brinde', autorizacao: 'tok' } }], pagamentos: [] };
    expect(mensagens(calc(brinde, BRUNO, [autorizacao('tok', CAIO, { tipo: 'desconto', produtoId: 'p2', precoFinalCentavos: 0 })]))).toMatch(
      /brinde de Petisco precisa da autorização de um Dono/,
    );
    const comDono = calc(brinde, BRUNO, [autorizacao('tok', ANA, { tipo: 'desconto', produtoId: 'p2', precoFinalCentavos: 0 })]);
    expect(comDono.ok && comDono.valor.totalCentavos).toBe(0);
    expect(comDono.ok && comDono.valor.pagamentos).toEqual([]);
    expect(calc({ ...brinde, itens: [{ produtoId: 'p2', quantidade: 1, desconto: { precoFinalCentavos: 0, motivo: 'brinde' } }] }, ANA).ok).toBe(true);
  });

  it('preço final igual ou maior que o de tabela não é desconto', () => {
    expect(mensagens(calc({ itens: [{ produtoId: 'p2', quantidade: 1, desconto: { precoFinalCentavos: 750, motivo: 'x' } }] }))).toMatch(/deve ser menor que o preço de tabela/);
  });

  it('pagamentos precisam fechar com o total', () => {
    expect(mensagens(calc({ pagamentos: [{ forma: 'pix', valorCentavos: 700 }] }))).toMatch(/Os pagamentos somam R\$\s7,00, e a venda é R\$\s7,50/);
    expect(mensagens(calc({ pagamentos: [] }))).toMatch(/Informe a forma de pagamento/);
  });

  it('dinheiro: pede o valor recebido e calcula o troco', () => {
    const dinheiro = [{ forma: 'dinheiro' as const, valorCentavos: 750 }];
    expect(mensagens(calc({ pagamentos: dinheiro }))).toMatch(/Informe o valor recebido em dinheiro \(igual ou maior que R\$\s7,50\)/);
    expect(calc({ pagamentos: dinheiro, recebidoDinheiroCentavos: 700 }).ok).toBe(false);
    const r = calc({ pagamentos: dinheiro, recebidoDinheiroCentavos: 1000 });
    expect(r.ok && [r.valor.recebidoDinheiroCentavos, r.valor.trocoCentavos]).toEqual([1000, 250]);
  });

  it('pagamento dividido: o troco é sobre a parte em dinheiro; sem dinheiro, o recebido é ignorado', () => {
    const r = calc({
      itens: [{ produtoId: 'p1', quantidade: 1 }],
      pagamentos: [
        { forma: 'dinheiro', valorCentavos: 5000 },
        { forma: 'pix', valorCentavos: 13990 },
      ],
      recebidoDinheiroCentavos: 10000,
    });
    expect(r.ok && r.valor.trocoCentavos).toBe(5000);
    const semDinheiro = calc({ recebidoDinheiroCentavos: 5000 });
    expect(semDinheiro.ok && [semDinheiro.valor.recebidoDinheiroCentavos, semDinheiro.valor.trocoCentavos]).toEqual([null, 0]);
  });

  it('recusa total acima do limite', () => {
    const caro = new Map([['c', { id: 'c', codigoInterno: '0009', nome: 'Caro', precoCentavos: CENTAVOS_MAX, ativo: true }]]);
    const r = calcularVenda({ itens: [{ produtoId: 'c', quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 1 }] }, caro, { operador: ANA });
    expect(mensagens(r)).toMatch(/acima do limite/);
  });
});

// ------------------------------------------------------------------ apresentação
describe('formatarNumeroVenda e descreverPagamentos', () => {
  it('número com 5 dígitos, como no DaniPets', () => {
    expect(formatarNumeroVenda(12)).toBe('#00012');
    expect(formatarNumeroVenda(123456)).toBe('#123456');
  });
  it('forma única pelo nome; dividido com os valores', () => {
    expect(descreverPagamentos([{ forma: 'pix', valorCentavos: 100 }])).toBe('Pix');
    expect(
      descreverPagamentos([
        { forma: 'dinheiro', valorCentavos: 1000 },
        { forma: 'pix', valorCentavos: 2240 },
      ]).replace(/ /g, ' '),
    ).toBe('Dinheiro R$ 10,00 + Pix R$ 22,40');
    expect(descreverPagamentos([])).toBe('Sem pagamento (brinde)');
  });
});

// ------------------------------------------------------------------ cancelamento e devolução
const vendaBase = (p: Partial<Venda> = {}): Venda => ({
  id: 'v1',
  numero: 7,
  criadaEm: '2026-11-16T13:00:00Z', // 10:00 em Brasília, mesmo dia de AGORA
  vendedor: { id: 'bruno', nome: 'Bruno' },
  cliente: null,
  itens: [
    { produtoId: 'p1', codigoInterno: '0001', nome: 'Ração', precoListaCentavos: 2000, precoCentavos: 1800, quantidade: 1, subtotalCentavos: 1800, desconto: null },
    { produtoId: 'p2', codigoInterno: '0002', nome: 'Petisco', precoListaCentavos: 600, precoCentavos: 600, quantidade: 2, subtotalCentavos: 1200, desconto: null },
  ],
  totalCentavos: 3000,
  descontoCentavos: 200,
  pagamentos: [
    { forma: 'dinheiro', valorCentavos: 1000 },
    { forma: 'pix', valorCentavos: 2000 },
  ],
  recebidoDinheiroCentavos: 1000,
  trocoCentavos: 0,
  status: 'finalizada',
  cancelamento: null,
  devolucoes: [],
  ...p,
});
const devolucaoFeita = {
  id: 'd1',
  numero: 1,
  criadaEm: AGORA.toISOString(),
  itens: [{ linha: 1, produtoId: 'p2', nome: 'Petisco', quantidade: 1, valorCentavos: 600, voltaAoEstoque: true }],
  totalCentavos: 600,
  estornos: [{ forma: 'pix' as const, valorCentavos: 600 }],
  motivo: 'x',
  feitaPor: { id: 'ana', nome: 'Ana' },
  autorizadaPor: null,
};

describe('cancelamento', () => {
  it('só no mesmo dia, sem devolução e não cancelada', () => {
    expect(podeCancelarVenda(vendaBase(), AGORA)).toBe(true);
    expect(podeCancelarVenda(vendaBase(), new Date('2026-11-17T03:30:00Z'))).toBe(false); // já é dia 17 em Brasília
    expect(podeCancelarVenda(vendaBase({ devolucoes: [devolucaoFeita] }), AGORA)).toBe(false);
    expect(podeCancelarVenda(vendaBase({ status: 'cancelada' }), AGORA)).toBe(false);
  });

  it('Dono cancela sem autorização; o dinheiro volta pelas mesmas formas', () => {
    const r = calcularCancelamento(vendaBase(), { motivo: 'cliente desistiu' }, { operador: ANA, agora: AGORA });
    expect(r.ok && r.valor).toEqual({ estornos: vendaBase().pagamentos, autorizadoPor: null, autorizacaoUsada: null });
  });

  it('Vendedor precisa de autorização do Dono ou do Administrador para ESTA venda', () => {
    expect(mensagens(calcularCancelamento(vendaBase(), { motivo: 'x' }, { operador: BRUNO, agora: AGORA }))).toMatch(/precisa da autorização/);
    const certa: Autorizacao = { id: 'a1', autorizador: CAIO, acao: { tipo: 'cancelamento', vendaId: 'v1' }, criadaEm: AGORA.toISOString() };
    const r = calcularCancelamento(vendaBase(), { motivo: 'x' }, { operador: BRUNO, autorizacao: certa, agora: AGORA });
    expect(r.ok && r.valor.autorizadoPor).toEqual({ id: 'caio', nome: 'Caio' });
    for (const errada of [
      { ...certa, acao: { tipo: 'cancelamento' as const, vendaId: 'outra' } },
      { ...certa, acao: { tipo: 'devolucao' as const, vendaId: 'v1' } },
    ]) {
      expect(calcularCancelamento(vendaBase(), { motivo: 'x' }, { operador: BRUNO, autorizacao: errada, agora: AGORA }).ok).toBe(false);
    }
  });

  it('recusa venda já cancelada ou de outro dia', () => {
    expect(mensagens(calcularCancelamento(vendaBase({ status: 'cancelada' }), { motivo: 'x' }, { operador: ANA, agora: AGORA }))).toMatch(/já foi cancelada/);
    expect(mensagens(calcularCancelamento(vendaBase(), { motivo: 'x' }, { operador: ANA, agora: new Date('2026-11-18T12:00:00Z') }))).toMatch(/mesmo dia/);
  });

  it('validarPedidoCancelamento', () => {
    expect(campos(validarPedidoCancelamento({}))).toContain('motivo');
    expect(campos(validarPedidoCancelamento({ motivo: 'x', estorno: 'tudo' }))).toContain('estorno');
    expect(campos(validarPedidoCancelamento('x'))).toContain('_');
    expect(validarPedidoCancelamento({ motivo: ' errei ', autorizacao: 'a1' })).toEqual({ ok: true, valor: { motivo: 'errei', autorizacao: 'a1' } });
  });
});

describe('devolução', () => {
  it('valor pelo preço cobrado (com desconto) e estorno repartido pelas formas da venda', () => {
    const r = calcularDevolucao(vendaBase(), { itens: [{ linha: 0, quantidade: 1 }], motivo: 'produto errado' }, { operador: ANA, agora: AGORA });
    expect(r.ok && r.valor.totalCentavos).toBe(1800);
    // disponível: dinheiro 10,00 e Pix 20,00 → 1/3 e 2/3 de 18,00
    expect(r.ok && r.valor.estornos).toEqual([
      { forma: 'dinheiro', valorCentavos: 600 },
      { forma: 'pix', valorCentavos: 1200 },
    ]);
  });

  it('não devolve mais do que foi vendido (descontando o que já voltou)', () => {
    const venda = vendaBase({ devolucoes: [devolucaoFeita] });
    expect(restanteParaDevolver(venda)).toEqual([1, 1]);
    expect(mensagens(calcularDevolucao(venda, { itens: [{ linha: 1, quantidade: 2 }], motivo: 'x' }, { operador: ANA }))).toMatch(/no máximo 1 un/);
    expect(mensagens(calcularDevolucao(venda, { itens: [{ linha: 5, quantidade: 1 }], motivo: 'x' }, { operador: ANA }))).toMatch(/não encontrado/);
    expect(
      mensagens(
        calcularDevolucao(
          venda,
          {
            itens: [
              { linha: 0, quantidade: 1 },
              { linha: 0, quantidade: 1 },
            ],
            motivo: 'x',
          },
          { operador: ANA },
        ),
      ),
    ).toMatch(/repetido/);
  });

  it('o que já voltou sai do que cada forma ainda pode devolver', () => {
    const venda = vendaBase({ devolucoes: [devolucaoFeita] });
    expect(estornavelPorForma(venda)).toEqual([
      { forma: 'dinheiro', valorCentavos: 1000 },
      { forma: 'pix', valorCentavos: 1400 },
    ]);
  });

  it('Vendedor precisa de autorização; venda cancelada não tem devolução', () => {
    expect(mensagens(calcularDevolucao(vendaBase(), { itens: [{ linha: 1, quantidade: 1 }], motivo: 'x' }, { operador: BRUNO, agora: AGORA }))).toMatch(
      /A devolução precisa da autorização/,
    );
    const a: Autorizacao = { id: 'a2', autorizador: ANA, acao: { tipo: 'devolucao', vendaId: 'v1' }, criadaEm: AGORA.toISOString() };
    const r = calcularDevolucao(vendaBase(), { itens: [{ linha: 1, quantidade: 1 }], motivo: 'x' }, { operador: BRUNO, autorizacao: a, agora: AGORA });
    expect(r.ok && [r.valor.autorizadoPor, r.valor.autorizacaoUsada]).toEqual([{ id: 'ana', nome: 'Ana' }, 'a2']);
    expect(mensagens(calcularDevolucao(vendaBase({ status: 'cancelada' }), { itens: [{ linha: 1, quantidade: 1 }], motivo: 'x' }, { operador: ANA }))).toMatch(/cancelada/);
  });

  it('repartirEstorno: arredonda para baixo e completa pela forma maior; recusa valor acima do disponível', () => {
    const venda = vendaBase({
      pagamentos: [
        { forma: 'dinheiro', valorCentavos: 1000 },
        { forma: 'pix', valorCentavos: 2001 },
      ],
    });
    expect(repartirEstorno(venda, 1001)).toEqual({
      ok: true,
      valor: [
        { forma: 'dinheiro', valorCentavos: 333 },
        { forma: 'pix', valorCentavos: 668 },
      ],
    });
    expect(repartirEstorno(venda, 0)).toEqual({ ok: true, valor: [] });
    expect(mensagens(repartirEstorno(venda, 3002))).toMatch(/Só R\$\s30,01/);
  });

  it('validarPedidoDevolucao', () => {
    expect(campos(validarPedidoDevolucao({ itens: [{ linha: 0, quantidade: 0 }], motivo: 'x' }))).toContain('itens');
    expect(campos(validarPedidoDevolucao({ itens: [{ linha: -1, quantidade: 1 }], motivo: 'x' }))).toContain('itens.0');
    expect(campos(validarPedidoDevolucao({ itens: [{ linha: 0, quantidade: 1, valor: 9 }], motivo: 'x' }))).toContain('itens.0.valor');
    expect(campos(validarPedidoDevolucao({ itens: 'x', motivo: 'x' }))).toContain('itens');
    expect(campos(validarPedidoDevolucao({ itens: [{ linha: 0, quantidade: 1 }] }))).toContain('motivo');
    expect(campos(validarPedidoDevolucao(null))).toContain('_');
    expect(
      validarPedidoDevolucao({
        itens: [
          { linha: 0, quantidade: 0 },
          { linha: 1, quantidade: 2 },
        ],
        motivo: 'embalagem furada',
      }),
    ).toEqual({ ok: true, valor: { itens: [{ linha: 1, quantidade: 2, voltaAoEstoque: true }], motivo: 'embalagem furada', autorizacao: null } });
    // avaria ou vencido: não volta para a prateleira
    const avaria = validarPedidoDevolucao({ itens: [{ linha: 0, quantidade: 1, voltaAoEstoque: false }], motivo: 'avaria' });
    expect(avaria.ok && avaria.valor.itens).toEqual([{ linha: 0, quantidade: 1, voltaAoEstoque: false }]);
    expect(campos(validarPedidoDevolucao({ itens: [{ linha: 0, quantidade: 1, voltaAoEstoque: 'sim' }], motivo: 'x' }))).toContain('itens.0.voltaAoEstoque');
  });
});

// ------------------------------------------------------------------ datas e resumos
describe('diaNoFuso e vendasNoPeriodo', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    expect(diaNoFuso('2026-11-13T02:30:00Z')).toBe('2026-11-12');
    expect(diaNoFuso('2026-11-13T03:00:00Z')).toBe('2026-11-13');
    expect(diaNoFuso(new Date('2026-11-13T02:30:00Z'), 'UTC')).toBe('2026-11-13');
  });

  it('data inválida lança erro', () => {
    expect(() => diaNoFuso('ontem')).toThrow(RangeError);
  });

  it('filtra por dia, inclusive, no fuso da loja', () => {
    const vendas = [{ criadaEm: '2026-11-11T15:00:00Z' }, { criadaEm: '2026-11-13T02:59:00Z' }, { criadaEm: '2026-11-13T12:00:00Z' }];
    expect(vendasNoPeriodo(vendas, { de: '2026-11-12', ate: '2026-11-12' })).toEqual([vendas[1]]);
    expect(vendasNoPeriodo(vendas, { de: '2026-11-12' })).toEqual([vendas[1], vendas[2]]);
    expect(vendasNoPeriodo(vendas, { ate: '2026-11-12' })).toEqual([vendas[0], vendas[1]]);
    expect(vendasNoPeriodo(vendas, {})).toEqual(vendas);
  });
});

describe('resumirVendas e resumirDevolucoes', () => {
  it('sem vendas: tudo zero', () => {
    expect(resumirVendas([])).toEqual({
      totalCentavos: 0,
      quantidadeVendas: 0,
      itensVendidos: 0,
      gramasVendidas: 0,
      descontoCentavos: 0,
      ticketMedioCentavos: 0,
      canceladas: 0,
      porForma: [],
      porVendedor: [],
    });
  });

  it('canceladas ficam fora; pagamento dividido entra em cada forma; quantidade conta a venda uma vez por forma', () => {
    const r = resumirVendas([
      vendaBase(), // 30,00: dinheiro 10 + pix 20, desconto 2,00
      vendaBase({ id: 'v2', vendedor: { id: 'ana', nome: 'Ana' }, totalCentavos: 1000, descontoCentavos: 0, pagamentos: [{ forma: 'pix', valorCentavos: 1000 }] }),
      vendaBase({ id: 'v3', status: 'cancelada', totalCentavos: 99999 }),
    ]);
    expect(r.totalCentavos).toBe(4000);
    expect(r.quantidadeVendas).toBe(2);
    expect(r.canceladas).toBe(1);
    expect(r.descontoCentavos).toBe(200);
    expect(r.itensVendidos).toBe(6);
    expect(r.ticketMedioCentavos).toBe(2000);
    expect(r.porForma).toEqual([
      { forma: 'dinheiro', totalCentavos: 1000, quantidade: 1 },
      { forma: 'pix', totalCentavos: 3000, quantidade: 2 },
    ]);
    expect(r.porVendedor).toEqual([
      { id: 'bruno', nome: 'Bruno', totalCentavos: 3000, quantidade: 1 },
      { id: 'ana', nome: 'Ana', totalCentavos: 1000, quantidade: 1 },
    ]);
  });

  it('devoluções: soma e conta', () => {
    expect(resumirDevolucoes([devolucaoFeita, { ...devolucaoFeita, id: 'd2', totalCentavos: 150 }])).toEqual({ totalCentavos: 750, quantidade: 2 });
  });
});

describe('devoluções com a venda de origem', () => {
  it('levam quem vendeu, o cliente e as formas de pagamento da venda (para filtrar nos Relatórios)', () => {
    const venda = vendaBase({ cliente: { id: 'c1', nome: 'Maria' }, devolucoes: [devolucaoFeita] });
    expect(devolucoesComVenda([venda, vendaBase({ id: 'v2' })])).toEqual([
      { ...devolucaoFeita, vendaId: 'v1', vendaNumero: 7, vendaVendedor: { id: 'bruno', nome: 'Bruno' }, vendaCliente: { id: 'c1', nome: 'Maria' }, vendaFormas: ['dinheiro', 'pix'] },
    ]);
  });
});

describe('papéis e texto', () => {
  it('Dono e Administrador são gestores; nomes como a tela mostra', () => {
    expect([ehGestor('dono'), ehGestor('administrador'), ehGestor('vendedor'), ehGestor('personalizado'), ehGestor('super_admin')]).toEqual([true, true, false, false, true]);
    expect(NOME_PAPEL).toEqual({ dono: 'Dono', administrador: 'Administrador', vendedor: 'Vendedor', personalizado: 'Personalizado' });
  });
  it('semAcento: para buscar "racao" e achar "Ração"', () => {
    expect(semAcento('  Ração Prêmium ÇÃES ')).toBe('racao premium caes');
  });
});
