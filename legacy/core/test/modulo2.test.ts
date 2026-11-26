// packages/core/test/modulo2.test.ts — Fase 2, módulo 2 (Produtos e estoque): kg em gramas, cadastro completo,
// alteração, produto parecido, venda e devolução por kg, composição do saldo e história do produto.
import { describe, expect, it } from 'vitest';
import {
  calcularDevolucao,
  calcularVenda,
  composicaoDoSaldo,
  conferirEstoque,
  formatarQuantidade,
  lerQuantidade,
  movimentoInicial,
  type OperadorComPapel,
  PASSO_QUANTIDADE,
  type ProdutoParaVenda,
  produtoParecido,
  produtoTemHistorico,
  QUANTIDADE_MAX,
  quantidadeParaTexto,
  quantidadeValida,
  resumirVendas,
  unidadeDe,
  validarAlteracaoProduto,
  validarMovimentoManual,
  validarNovoProduto,
  valorDaQuantidade,
  type Venda,
} from '../src';

const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const AGORA = new Date('2026-11-16T15:00:00Z');
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? r.erros[0]!.mensagem : '');
const limpo = (t: string) => t.replace(/ /g, ' ');

describe('quantidade: un em unidades, kg em gramas (sempre inteiro)', () => {
  it('formata como o DaniPets (fmtQty)', () => {
    expect(formatarQuantidade(3)).toBe('3 un');
    expect(formatarQuantidade(1250, 'kg')).toBe('1,25 kg');
    expect(formatarQuantidade(500, 'kg')).toBe('0,5 kg');
    expect(formatarQuantidade(2000, 'kg')).toBe('2 kg');
    expect(formatarQuantidade(1, 'kg')).toBe('0,001 kg');
    expect(formatarQuantidade(-2500, 'kg')).toBe('-2,5 kg');
    expect(quantidadeParaTexto(1250, 'kg')).toBe('1,25');
    expect(quantidadeParaTexto(7)).toBe('7');
  });

  it('lê o que a pessoa digita', () => {
    expect(lerQuantidade('1,25', 'kg')).toBe(1250);
    expect(lerQuantidade('1.5', 'kg')).toBe(1500);
    expect(lerQuantidade('0,005 kg', 'kg')).toBe(5);
    expect(lerQuantidade('3', 'kg')).toBe(3000);
    expect(lerQuantidade('1,2345', 'kg')).toBeNull();
    expect(lerQuantidade('2', 'un')).toBe(2);
    expect(lerQuantidade('2,5', 'un')).toBeNull();
    expect(lerQuantidade('-1', 'un')).toBeNull();
    expect(lerQuantidade('', 'kg')).toBeNull();
    expect(lerQuantidade('abc')).toBeNull();
  });

  it('valor ao preço do quilo, arredondado ao centavo; passos e limites', () => {
    expect(valorDaQuantidade(1990, 1250, 'kg')).toBe(2488); // R$ 19,90/kg × 1,25 kg = R$ 24,875
    expect(valorDaQuantidade(1990, 3)).toBe(5970);
    expect(PASSO_QUANTIDADE).toEqual({ un: 1, kg: 500 });
    expect(quantidadeValida(QUANTIDADE_MAX.kg, 'kg')).toBe(true);
    expect(quantidadeValida(QUANTIDADE_MAX.un + 1, 'un')).toBe(false);
    expect(quantidadeValida(1.5, 'kg')).toBe(false);
    expect(unidadeDe(undefined)).toBe('un');
    expect(unidadeDe('kg')).toBe('kg');
  });
});

describe('cadastro completo (DaniPets PRD-01)', () => {
  it('o servidor continua com o cadastro básico; a demonstração aceita marca, peso, unidade e estoque inicial', () => {
    const completo = { nome: 'Ração a granel', precoCentavos: 1990, marca: ' Golden ', pesoGramas: 15000, unidade: 'kg', estoqueInicial: 25000, custoInicialCentavos: 1200 };
    expect(validarNovoProduto(completo).ok).toBe(false); // básico: campos novos recusados
    const r = validarNovoProduto(completo, { completo: true });
    expect(r.ok && r.valor).toEqual({
      nome: 'Ração a granel',
      codigoBarras: null,
      precoCentavos: 1990,
      marca: 'Golden',
      pesoGramas: 15000,
      unidade: 'kg',
      estoqueInicial: 25000,
      custoInicialCentavos: 1200,
      fornecedorId: null,
    });
    const minimo = validarNovoProduto({ nome: 'Coleira', precoCentavos: 2990 }, { completo: true });
    expect(minimo.ok && minimo.valor).toMatchObject({ unidade: 'un', estoqueInicial: 0, marca: null, pesoGramas: null, custoInicialCentavos: null });
  });

  it('confere cada campo novo', () => {
    const base = { nome: 'X', precoCentavos: 100 };
    const c = (extra: object) => mensagem(validarNovoProduto({ ...base, ...extra }, { completo: true }));
    expect(c({ unidade: 'lt' })).toMatch(/por unidade \(un\) ou por quilo \(kg\)/);
    expect(c({ estoqueInicial: 1.5 })).toMatch(/número inteiro de unidades/);
    expect(c({ unidade: 'kg', estoqueInicial: -1 })).toMatch(/peso de 0 em diante/);
    expect(c({ pesoGramas: 2_000_000 })).toMatch(/de 0 a 1\.000 kg/);
    expect(c({ marca: 'x'.repeat(61) })).toMatch(/até 60/);
    expect(c({ custoInicialCentavos: -5, estoqueInicial: 1 })).toMatch(/não pode ser negativo/);
    expect(c({ custoInicialCentavos: 500 })).toMatch(/só quando houver estoque inicial/);
    expect(c({ codigoInterno: '0001' })).toBe('O código interno é gerado pelo sistema.');
  });

  it('alteração: só o que veio, com as mesmas regras; nada para alterar é recusado', () => {
    const r = validarAlteracaoProduto({ precoCentavos: 1690, marca: '' });
    expect(r.ok && r.valor).toEqual({ precoCentavos: 1690, marca: null });
    expect(mensagem(validarAlteracaoProduto({ precoCentavos: 0 }))).toMatch(/maior que zero/);
    expect(mensagem(validarAlteracaoProduto({ estoqueInicial: 5 }))).toBe('Campo não permitido.');
    expect(mensagem(validarAlteracaoProduto({}))).toBe('Nada para alterar.');
    expect(mensagem(validarAlteracaoProduto(null))).toMatch(/objeto/);
  });

  it('produto parecido: mesmo nome (sem diferença de maiúscula e espaço), marca e peso', () => {
    const existentes = [
      { id: 'a', nome: 'Ração Premium', marca: 'Golden', pesoGramas: 15000 },
      { id: 'b', nome: 'Petisco', marca: null, pesoGramas: null },
    ];
    expect(produtoParecido({ nome: ' ração  premium ', marca: 'golden', pesoGramas: 15000 }, existentes)?.id).toBe('a');
    expect(produtoParecido({ nome: 'Ração Premium', marca: 'Golden', pesoGramas: 3000 }, existentes)).toBeNull();
    expect(produtoParecido({ nome: 'Petisco' }, existentes)?.id).toBe('b');
    expect(produtoParecido({ nome: 'Petisco' }, existentes, 'b')).toBeNull(); // na edição, ele mesmo não conta
  });
});

describe('venda e devolução por kg', () => {
  const catalogo = new Map<string, ProdutoParaVenda>([
    ['granel', { id: 'granel', codigoInterno: '0001', nome: 'Ração a granel', precoCentavos: 1990, ativo: true, unidade: 'kg' }],
    ['coleira', { id: 'coleira', codigoInterno: '0002', nome: 'Coleira', precoCentavos: 2990, ativo: true }],
  ]);

  it('subtotal ao preço do quilo; estoque e limite na unidade do produto', () => {
    const r = calcularVenda({ itens: [{ produtoId: 'granel', quantidade: 1250 }, { produtoId: 'coleira', quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 5478 }] }, catalogo, {
      operador: BRUNO,
      agora: AGORA,
      estoque: new Map([
        ['granel', 5000],
        ['coleira', 3],
      ]),
    });
    expect(r.ok && r.valor.itens.map((i) => [i.unidade, i.quantidade, i.subtotalCentavos])).toEqual([
      ['kg', 1250, 2488],
      ['un', 1, 2990],
    ]);
    const semEstoque = calcularVenda({ itens: [{ produtoId: 'granel', quantidade: 6000 }], pagamentos: [{ forma: 'pix', valorCentavos: 11940 }] }, catalogo, {
      operador: BRUNO,
      agora: AGORA,
      estoque: new Map([['granel', 5000]]),
    });
    expect(mensagem(semEstoque)).toBe('Estoque insuficiente para Ração a granel. Disponível: 5 kg.');
    const demais = calcularVenda({ itens: [{ produtoId: 'coleira', quantidade: 10_000 }], pagamentos: [{ forma: 'pix', valorCentavos: 1 }] }, catalogo, { operador: BRUNO, agora: AGORA });
    expect(mensagem(demais)).toBe('Quantidade acima de 9999 unidades num mesmo produto (Coleira).');
  });

  it('desconto no kg: o desconto é a diferença dos subtotais', () => {
    const r = calcularVenda(
      { itens: [{ produtoId: 'granel', quantidade: 2000, desconto: { precoFinalCentavos: 1800, motivo: 'saco aberto' } }], pagamentos: [{ forma: 'pix', valorCentavos: 3600 }] },
      catalogo,
      { operador: BRUNO, agora: AGORA },
    );
    expect(r.ok && [r.valor.totalCentavos, r.valor.descontoCentavos]).toEqual([3600, 380]);
  });

  it('devolver o kg aos poucos dá exatamente o subtotal (sem sobra de arredondamento)', () => {
    const venda: Venda = {
      id: 'v1',
      numero: 1,
      criadaEm: AGORA.toISOString(),
      vendedor: BRUNO,
      cliente: null,
      itens: [{ produtoId: 'granel', codigoInterno: '0001', nome: 'Ração a granel', precoListaCentavos: 1990, precoCentavos: 1990, quantidade: 1250, unidade: 'kg', subtotalCentavos: 2488, desconto: null }],
      totalCentavos: 2488,
      descontoCentavos: 0,
      pagamentos: [{ forma: 'pix', valorCentavos: 2488 }],
      recebidoDinheiroCentavos: null,
      trocoCentavos: 0,
      status: 'finalizada',
      cancelamento: null,
      devolucoes: [],
    };
    const ctx = { operador: { id: 'ana', nome: 'Ana', papel: 'dono' as const }, agora: AGORA, autorizacao: null };
    const primeira = calcularDevolucao(venda, { itens: [{ linha: 0, quantidade: 625, voltaAoEstoque: true }], motivo: 'x' }, ctx);
    expect(primeira.ok && primeira.valor.itens[0]!).toMatchObject({ quantidade: 625, unidade: 'kg', valorCentavos: 1244 });
    const depois: Venda = { ...venda, devolucoes: [{ id: 'd1', numero: 1, criadaEm: AGORA.toISOString(), itens: primeira.ok ? primeira.valor.itens : [], totalCentavos: 1244, estornos: [], motivo: 'x', feitaPor: BRUNO, autorizadaPor: null }] };
    const segunda = calcularDevolucao(depois, { itens: [{ linha: 0, quantidade: 625, voltaAoEstoque: true }], motivo: 'x' }, ctx);
    expect(segunda.ok && segunda.valor.itens[0]!.valorCentavos).toBe(1244); // 1244 + 1244 = 2488
    const demais = calcularDevolucao(depois, { itens: [{ linha: 0, quantidade: 700, voltaAoEstoque: true }], motivo: 'x' }, ctx);
    expect(mensagem(demais)).toBe('De Ração a granel ainda dá para devolver no máximo 0,625 kg.');
  });

  it('o resumo separa unidades de quilos', () => {
    const v = (itens: Venda['itens']): Venda => ({
      id: Math.random().toString(),
      numero: 1,
      criadaEm: AGORA.toISOString(),
      vendedor: BRUNO,
      cliente: null,
      itens,
      totalCentavos: 0,
      descontoCentavos: 0,
      pagamentos: [],
      recebidoDinheiroCentavos: null,
      trocoCentavos: 0,
      status: 'finalizada',
      cancelamento: null,
      devolucoes: [],
    });
    const item = (quantidade: number, unidade?: 'kg') => ({ produtoId: 'x', codigoInterno: '1', nome: 'x', precoListaCentavos: 1, precoCentavos: 1, quantidade, subtotalCentavos: 1, desconto: null, ...(unidade ? { unidade } : {}) });
    const r = resumirVendas([v([item(2), item(1500, 'kg')]), v([item(3)])]);
    expect([r.itensVendidos, r.gramasVendidas]).toEqual([5, 1500]);
  });
});

describe('estoque do módulo 2', () => {
  it('ajuste com observação; observação longa é recusada', () => {
    const r = validarMovimentoManual({ produtoId: 'p', tipo: 'ajuste', quantidade: -1500, motivo: 'Outro', observacao: '  saco  rasgado ' });
    expect(r.ok && r.valor).toEqual({ produtoId: 'p', tipo: 'ajuste', quantidade: -1500, motivo: 'Outro', observacao: 'saco rasgado' });
    expect(mensagem(validarMovimentoManual({ produtoId: 'p', tipo: 'ajuste', quantidade: -1, motivo: 'Outro', observacao: 'x'.repeat(301) }))).toMatch(/até 300/);
    expect(mensagem(validarMovimentoManual({ produtoId: 'p', tipo: 'ajuste', quantidade: -1, motivo: 'Outro', observacao: 3 }))).toMatch(/texto/);
  });

  it('estoque inicial com custo e "como o saldo é calculado"', () => {
    const ini = movimentoInicial({ produtoId: 'p', quantidade: 10, custoUnitarioCentavos: 800 }, { em: 'agora', por: BRUNO });
    expect(ini).toMatchObject({ tipo: 'inicial', quantidade: 10, motivo: 'Estoque inicial', custoUnitarioCentavos: 800 });
    const movs = [
      { produtoId: 'p', tipo: 'inicial' as const, quantidade: 10 },
      { produtoId: 'p', tipo: 'entrada' as const, quantidade: 5 },
      { produtoId: 'p', tipo: 'venda' as const, quantidade: -4 },
      { produtoId: 'p', tipo: 'cancelamento' as const, quantidade: 1 },
      { produtoId: 'p', tipo: 'devolucao' as const, quantidade: 1 },
      { produtoId: 'p', tipo: 'ajuste' as const, quantidade: -2 },
      { produtoId: 'outro', tipo: 'entrada' as const, quantidade: 99 },
    ];
    expect(composicaoDoSaldo(movs, 'p')).toEqual({ inicial: 10, compras: 0, entradas: 5, vendas: 4, cancelamentos: 1, devolucoes: 1, ajustes: -2, saldo: 11 });
  });

  it('história: só o estoque inicial não conta', () => {
    expect(produtoTemHistorico('p', [{ produtoId: 'p', tipo: 'inicial' }])).toBe(false);
    expect(produtoTemHistorico('p', [{ produtoId: 'p', tipo: 'ajuste' }])).toBe(true);
    expect(produtoTemHistorico('p', [], [{ itens: [{ produtoId: 'p' } as Venda['itens'][number]] }])).toBe(true);
  });

  it('a mensagem de estoque usa a unidade do produto', () => {
    expect(limpo(mensagem(conferirEstoque([{ produtoId: 'g', nome: 'Granel', quantidade: 600, unidade: 'kg' }], new Map([['g', 500]]))))).toBe(
      'Estoque insuficiente para Granel. Disponível: 0,5 kg.',
    );
  });
});
