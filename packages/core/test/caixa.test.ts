// packages/core/test/caixa.test.ts — Caixa do dia (Fase 2, módulo 5), com as regras do DaniPets V9.3.3.
import { describe, expect, it } from 'vitest';
import {
  abrirCaixa,
  type Autorizacao,
  autorizacaoServe,
  type CaixaDoDia,
  calcularCancelamento,
  conferirCaixaAberto,
  conferirCaixaParaVender,
  conferirDesfazer,
  conferirFechamento,
  conferirHojeNaoFechado,
  conferirLiberacao,
  conferirSaida,
  desfazerFechamento,
  diaTravado,
  efeitosDaCompra,
  efeitosFinanceirosDoEstorno,
  fecharCaixa,
  fecharDiasPassados,
  gavetaDoCaixa,
  type Lancamento,
  lancamentosDaOperacao,
  montarItensDaCompra,
  movimentoManual,
  movimentosDaGaveta,
  type Operador,
  pagarConta,
  podeCancelarVenda,
  resumirAuditoria,
  resumoDoCaixa,
  saldosDasContas,
  situacaoDoCaixa,
  TEXTO_FECHAMENTO_AUTOMATICO,
  validarAbertura,
  validarLiberacao,
  validarMovimentoManual,
  validarOperacaoCaixa,
  validarPedidoDesfazer,
  validarPedidoFechamento,
  type Venda,
} from '../src';

const ANA: Operador = { id: 'ana', nome: 'Ana' };
const BRUNO: Operador = { id: 'bruno', nome: 'Bruno' };
const FUSO = 'America/Sao_Paulo';
const HOJE = '2026-11-19';
const ONTEM = '2026-11-18';
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? r.erros[0]!.mensagem.replace(/ /g, ' ') : '');
const limpo = (t: string) => t.replace(/ /g, ' ');

/** Caixa aberto às 08:00 (11:00 UTC) do dia, com o fundo informado. */
function caixa(dia: string, fundoCentavos = 10000, extra: Partial<CaixaDoDia> = {}): CaixaDoDia {
  return { ...abrirCaixa({ fundoCentavos, observacao: null }, { id: `cx-${dia}`, hoje: dia, em: `${dia}T11:00:00.000Z`, por: ANA }), ...extra };
}

let seq = 0;
function lanc(extra: Partial<Lancamento> & Pick<Lancamento, 'conta' | 'tipo' | 'valorCentavos' | 'criadoEm'>): Lancamento {
  seq += 1;
  return { id: `l${seq}`, descricao: 'x', vendaId: null, vendaNumero: null, recebivelId: null, categoria: null, por: ANA, ...extra };
}

function fechado(c: CaixaDoDia, automatico = false): CaixaDoDia {
  return {
    ...c,
    fechamento: {
      em: `${c.dia}T21:30:00.000Z`,
      por: automatico ? null : ANA,
      automatico,
      fundoCentavos: c.abertura.fundoCentavos,
      esperadoCentavos: c.abertura.fundoCentavos,
      contadoCentavos: automatico ? null : c.abertura.fundoCentavos,
      diferencaCentavos: automatico ? null : 0,
      ajusteCentavos: 0,
      justificativa: null,
      autorizadoPor: null,
      resumo: { vendas: { dinheiro: 0, pix: 0, debito: 0, credito: 0, vale: 0, cashback: 0, fiado: 0 }, entradasCentavos: 0, saidasCentavos: 0, sangriasCentavos: 0, retiradasCentavos: 0, suprimentosCentavos: 0, estornosCentavos: 0 },
    },
  };
}

function autorizacao(papel: 'dono' | 'administrador' | 'vendedor', acao: Autorizacao['acao'], criadaEm = `${HOJE}T12:00:00.000Z`): Autorizacao {
  return { id: `aut-${papel}`, autorizador: { id: papel, nome: papel === 'dono' ? 'Ana' : 'Carla', papel }, acao, criadaEm };
}

describe('situação do caixa e dias travados', () => {
  it('não aberto, aberto e fechado; o dia mais antigo aberto antes de hoje fica "atrasado"', () => {
    expect(situacaoDoCaixa([], HOJE)).toMatchObject({ estado: 'nao_aberto', caixa: null, atrasado: null, ultimoDiaFechado: null });
    expect(situacaoDoCaixa([caixa(HOJE)], HOJE)).toMatchObject({ estado: 'aberto', caixa: { dia: HOJE } });
    expect(situacaoDoCaixa([fechado(caixa(HOJE))], HOJE)).toMatchObject({ estado: 'fechado', ultimoDiaFechado: HOJE });
    const s = situacaoDoCaixa([caixa('2026-11-16'), fechado(caixa('2026-11-15')), caixa(ONTEM)], HOJE);
    expect(s).toMatchObject({ estado: 'nao_aberto', atrasado: { dia: '2026-11-16' }, ultimoDiaFechado: '2026-11-15' });
  });

  it('dia travado: antes de hoje e até o último caixa fechado (DaniPets lockedDay)', () => {
    const caixas = [fechado(caixa('2026-11-15')), fechado(caixa('2026-11-17')), caixa(ONTEM)];
    expect(diaTravado('2026-11-17', HOJE, caixas)).toBe(true);
    expect(diaTravado('2026-11-16', HOJE, caixas)).toBe(true); // sem caixa, mas antes do último fechado
    expect(diaTravado(ONTEM, HOJE, caixas)).toBe(false); // ainda aberto
    expect(diaTravado(HOJE, HOJE, [fechado(caixa(HOJE))])).toBe(false); // hoje nunca é "retroativo"
    expect(diaTravado('2026-11-10', HOJE, [])).toBe(false);
  });

  it('a Frente de caixa só vende com o caixa de hoje aberto; o dia fechado não aceita lançamento', () => {
    expect(mensagem(conferirCaixaParaVender(situacaoDoCaixa([], HOJE)))).toBe('Abra o caixa de hoje (Caixa do dia) antes de vender.');
    expect(mensagem(conferirCaixaParaVender(situacaoDoCaixa([fechado(caixa(HOJE))], HOJE)))).toMatch(/^O caixa de hoje já foi fechado\. Para vender hoje/);
    expect(conferirCaixaParaVender(situacaoDoCaixa([caixa(HOJE)], HOJE))).toMatchObject({ ok: true, valor: { dia: HOJE } });
    expect(conferirHojeNaoFechado(situacaoDoCaixa([], HOJE)).ok).toBe(true);
    expect(mensagem(conferirHojeNaoFechado(situacaoDoCaixa([fechado(caixa(HOJE))], HOJE)))).toMatch(/não é possível lançar hoje/);
    expect(mensagem(conferirCaixaAberto(situacaoDoCaixa([], HOJE), 'Devolução em dinheiro'))).toBe('Devolução em dinheiro: abra o caixa de hoje (Caixa do dia) primeiro.');
    expect(conferirCaixaAberto(situacaoDoCaixa([caixa(HOJE)], HOJE), 'x').ok).toBe(true);
  });
});

describe('abrir o caixa (CX-01)', () => {
  it('só o de hoje, uma vez, e depois de fechar os dias anteriores', () => {
    expect(validarAbertura({ fundoCentavos: 15000, observacao: '  troco  conferido ' }, { hoje: HOJE, caixas: [] })).toEqual({
      ok: true,
      valor: { fundoCentavos: 15000, observacao: 'troco conferido' },
    });
    expect(validarAbertura({ fundoCentavos: 0 }, { hoje: HOJE, caixas: [] })).toEqual({ ok: true, valor: { fundoCentavos: 0, observacao: null } });
    expect(mensagem(validarAbertura({ fundoCentavos: 1 }, { hoje: HOJE, caixas: [caixa(HOJE)] }))).toBe('O caixa de hoje já está aberto.');
    expect(mensagem(validarAbertura({ fundoCentavos: 1 }, { hoje: HOJE, caixas: [fechado(caixa(HOJE))] }))).toMatch(/^O caixa de hoje já foi fechado/);
    expect(mensagem(validarAbertura({ fundoCentavos: 1 }, { hoje: HOJE, caixas: [caixa(ONTEM)] }))).toBe('Feche o caixa de 18/11/2026 antes de abrir o de hoje.');
  });

  it('fundo de troco: centavos inteiros, zero ou mais; sem campos estranhos', () => {
    for (const fundo of [-1, 1.5, '100', null, undefined, Number.MAX_SAFE_INTEGER]) {
      expect(mensagem(validarAbertura({ fundoCentavos: fundo }, { hoje: HOJE, caixas: [] }))).toBe('Informe o fundo de troco (todo o dinheiro que está na gaveta agora).');
    }
    const r = validarAbertura({ fundoCentavos: 1, operador: 'Bruno' }, { hoje: HOJE, caixas: [] });
    expect(!r.ok && r.erros).toEqual([{ campo: 'operador', mensagem: 'Campo não permitido.' }]);
    expect(mensagem(validarAbertura({ fundoCentavos: 1, observacao: 'x'.repeat(201) }, { hoje: HOJE, caixas: [] }))).toMatch(/até 200/);
    expect(mensagem(validarAbertura('abrir', { hoje: HOJE, caixas: [] }))).toBe('Envie um objeto com a abertura.');
  });

  it('quem está logado é o responsável', () => {
    expect(abrirCaixa({ fundoCentavos: 5000, observacao: null }, { id: 'c1', hoje: HOJE, em: 'agora', por: BRUNO })).toEqual({
      id: 'c1',
      dia: HOJE,
      abertura: { fundoCentavos: 5000, observacao: null, em: 'agora', por: BRUNO },
      fechamento: null,
      desfeitos: [],
    });
  });
});

describe('esperado na gaveta (CX-03)', () => {
  const c = caixa(HOJE, 10000);
  const lancamentos = [
    lanc({ conta: 'caixa', tipo: 'venda', valorCentavos: 3000, criadoEm: `${HOJE}T10:59:59.000Z` }), // antes da abertura
    lanc({ conta: 'caixa', tipo: 'saldo_inicial', valorCentavos: 50000, criadoEm: `${HOJE}T12:00:00.000Z` }),
    lanc({ conta: 'caixa', tipo: 'venda', valorCentavos: 4550, criadoEm: `${HOJE}T13:00:00.000Z` }),
    lanc({ conta: 'banco', tipo: 'venda', valorCentavos: 9999, criadoEm: `${HOJE}T13:10:00.000Z` }),
    lanc({ conta: 'caixa', tipo: 'estorno_venda', valorCentavos: -550, criadoEm: `${HOJE}T14:00:00.000Z` }),
    lanc({ conta: 'caixa', tipo: 'sangria', valorCentavos: -2000, criadoEm: `${HOJE}T15:00:00.000Z` }),
    lanc({ conta: 'caixa', tipo: 'suprimento', valorCentavos: 1000, criadoEm: `${HOJE}T15:30:00.000Z` }),
    lanc({ conta: 'caixa', tipo: 'ajuste_caixa', valorCentavos: -100, criadoEm: `${HOJE}T16:00:00.000Z` }),
    // compra de um dia anterior lançada hoje: é do dia dela, não desta gaveta
    lanc({ conta: 'caixa', tipo: 'pagamento_compra', valorCentavos: -700, criadoEm: `${HOJE}T16:30:00.000Z`, dia: ONTEM }),
    lanc({ conta: 'caixa', tipo: 'venda', valorCentavos: 800, criadoEm: '2026-11-20T03:30:00.000Z' }), // 00:30 do dia seguinte
  ];

  it('fundo + dinheiro movimentado depois da abertura, sem saldo inicial nem ajuste do fechamento', () => {
    expect(movimentosDaGaveta(c, lancamentos, FUSO).map((l) => l.valorCentavos)).toEqual([4550, -550, -2000, 1000]);
    expect(gavetaDoCaixa(c, lancamentos, FUSO)).toEqual({ fundoCentavos: 10000, entradasCentavos: 5550, saidasCentavos: 2550, esperadoCentavos: 13000 });
  });

  it('o resumo do dia: vendas por forma (sem as canceladas) e o que passou pela gaveta', () => {
    const vendas: Pick<Venda, 'criadaEm' | 'status' | 'pagamentos'>[] = [
      { criadaEm: `${HOJE}T13:00:00.000Z`, status: 'finalizada', pagamentos: [{ forma: 'dinheiro', valorCentavos: 4550 }, { forma: 'pix', valorCentavos: 1000 }] },
      { criadaEm: `${HOJE}T13:20:00.000Z`, status: 'cancelada', pagamentos: [{ forma: 'credito', valorCentavos: 9000 }] },
      { criadaEm: `${ONTEM}T13:20:00.000Z`, status: 'finalizada', pagamentos: [{ forma: 'debito', valorCentavos: 7000 }] },
      { criadaEm: `${HOJE}T18:00:00.000Z`, status: 'finalizada', pagamentos: [{ forma: 'fiado', valorCentavos: 2500 }] },
    ];
    expect(resumoDoCaixa(c, vendas, lancamentos, FUSO)).toEqual({
      vendas: { dinheiro: 4550, pix: 1000, debito: 0, credito: 0, vale: 0, cashback: 0, fiado: 2500 },
      entradasCentavos: 5550,
      saidasCentavos: 2550,
      sangriasCentavos: 2000,
      retiradasCentavos: 0,
      suprimentosCentavos: 1000,
      estornosCentavos: 550,
    });
  });
});

describe('sangria, retirada do dono e suprimento (CX-02)', () => {
  it('valor maior que zero e descrição obrigatória', () => {
    expect(validarOperacaoCaixa({ tipo: 'sangria', valorCentavos: 2000, descricao: ' levou ao banco ' })).toEqual({
      ok: true,
      valor: { tipo: 'sangria', valorCentavos: 2000, descricao: 'levou ao banco', autorizacao: null },
    });
    expect(mensagem(validarOperacaoCaixa({ tipo: 'sangria', valorCentavos: 0, descricao: 'x' }))).toBe('Informe o valor.');
    expect(mensagem(validarOperacaoCaixa({ tipo: 'sangria', valorCentavos: 10, descricao: '  ' }))).toBe('Descreva a operação (ex.: levou ao banco).');
    expect(mensagem(validarOperacaoCaixa({ tipo: 'deposito', valorCentavos: 10, descricao: 'x' }))).toBe('Escolha sangria, retirada do dono ou suprimento.');
    expect(mensagem(validarOperacaoCaixa({ tipo: 'retirada', valorCentavos: 10, descricao: 'x', autorizacao: 5 }))).toBe('Autorização inválida.');
    expect(mensagem(validarOperacaoCaixa({ tipo: 'retirada', valorCentavos: 10, descricao: 'x', conta: 'banco' }))).toBe('Campo não permitido.');
  });

  it('sangria tira da gaveta e põe na Conta bancária; retirada só tira; suprimento põe', () => {
    const c = caixa(HOJE);
    const ctx = { caixa: c, em: `${HOJE}T15:00:00.000Z`, por: BRUNO };
    const sangria = lancamentosDaOperacao({ tipo: 'sangria', valorCentavos: 2000, descricao: 'banco', autorizacao: null }, ctx);
    expect(sangria.map((l) => [l.conta, l.tipo, l.valorCentavos, l.descricao, l.caixaId, l.dia])).toEqual([
      ['caixa', 'sangria', -2000, 'Sangria • banco', c.id, HOJE],
      ['banco', 'deposito_sangria', 2000, 'Sangria do caixa • banco', c.id, HOJE],
    ]);
    const retirada = lancamentosDaOperacao({ tipo: 'retirada', valorCentavos: 5000, descricao: 'casa', autorizacao: 'a1' }, { ...ctx, autorizadoPor: ANA });
    expect(retirada).toMatchObject([{ conta: 'caixa', tipo: 'retirada', valorCentavos: -5000, descricao: 'Retirada do dono (gaveta) • casa', autorizadoPor: ANA, por: BRUNO }]);
    expect(lancamentosDaOperacao({ tipo: 'suprimento', valorCentavos: 1000, descricao: 'troco', autorizacao: null }, ctx)).toMatchObject([
      { conta: 'caixa', tipo: 'suprimento', valorCentavos: 1000, descricao: 'Suprimento • troco' },
    ]);
  });

  it('não tira da gaveta mais do que o esperado nela (com o caixa aberto) nem do Caixa físico (sem caixa)', () => {
    const saida = lancamentosDaOperacao({ tipo: 'retirada', valorCentavos: 5000, descricao: 'casa', autorizacao: null }, { caixa: caixa(HOJE), em: 'x', por: ANA });
    const saldos = saldosDasContas([{ conta: 'caixa', valorCentavos: 100000 }]);
    expect(mensagem(conferirSaida(saida, saldos, { esperadoCentavos: 4999 }))).toBe(
      'O valor (R$ 50,00) é maior que o dinheiro esperado na gaveta (R$ 49,99). Confira o valor digitado. Se entrou dinheiro sem registro, lance um suprimento antes.',
    );
    expect(conferirSaida(saida, saldos, { esperadoCentavos: 5000 }).ok).toBe(true);
    expect(mensagem(conferirSaida(saida, saldosDasContas([{ conta: 'caixa', valorCentavos: 100 }])))).toMatch(/maior que o saldo do Caixa físico \(R\$ 1,00\)/);
  });
});

describe('fechar o caixa (CX-04)', () => {
  const ctxBase = { hoje: HOJE, fuso: FUSO, toleranciaCentavos: 1000, podeQualquerDiferenca: false };
  const c = caixa(HOJE, 10000);
  const lancamentos = [lanc({ conta: 'caixa', tipo: 'venda', valorCentavos: 5000, criadoEm: `${HOJE}T13:00:00.000Z` })];

  it('pedido: dia, contado em centavos, justificativa e autorização', () => {
    expect(validarPedidoFechamento({ dia: HOJE, contadoCentavos: 15000 })).toEqual({ ok: true, valor: { dia: HOJE, contadoCentavos: 15000, justificativa: null, autorizacao: null } });
    expect(mensagem(validarPedidoFechamento({ dia: HOJE }))).toBe('Informe o dinheiro contado na gaveta.');
    expect(mensagem(validarPedidoFechamento({ dia: '2026-02-30', contadoCentavos: 1 }))).toBe('Dia do caixa inválido.');
    expect(mensagem(validarPedidoFechamento({ dia: HOJE, contadoCentavos: 1, justificativa: 'x'.repeat(301) }))).toMatch(/até 300/);
  });

  it('sem diferença fecha direto; com diferença pede justificativa; acima da tolerância o Vendedor precisa de senha', () => {
    const certo = conferirFechamento({ dia: HOJE, contadoCentavos: 15000, justificativa: null, autorizacao: null }, { ...ctxBase, caixas: [c], lancamentos });
    expect(certo).toMatchObject({ ok: true, valor: { diferencaCentavos: 0, precisaAutorizacao: false, gaveta: { esperadoCentavos: 15000 } } });
    expect(mensagem(conferirFechamento({ dia: HOJE, contadoCentavos: 14000, justificativa: null, autorizacao: null }, { ...ctxBase, caixas: [c], lancamentos }))).toBe(
      'Há falta de R$ 10,00 na gaveta. Escreva a justificativa (por exemplo: troco errado, pagamento sem registro).',
    );
    const dez = conferirFechamento({ dia: HOJE, contadoCentavos: 14000, justificativa: 'troco', autorizacao: null }, { ...ctxBase, caixas: [c], lancamentos });
    expect(dez).toMatchObject({ ok: true, valor: { diferencaCentavos: -1000, precisaAutorizacao: false } }); // R$ 10,00 é a tolerância: passa
    const onze = conferirFechamento({ dia: HOJE, contadoCentavos: 16100, justificativa: 'sobrou', autorizacao: null }, { ...ctxBase, caixas: [c], lancamentos });
    expect(onze).toMatchObject({ ok: true, valor: { diferencaCentavos: 1100, precisaAutorizacao: true } });
    const gestor = conferirFechamento({ dia: HOJE, contadoCentavos: 16100, justificativa: 'sobrou', autorizacao: null }, { ...ctxBase, podeQualquerDiferenca: true, caixas: [c], lancamentos });
    expect(gestor).toMatchObject({ ok: true, valor: { precisaAutorizacao: false } });
  });

  it('fecha sempre o dia mais antigo em aberto, uma vez só', () => {
    const pedido = { dia: HOJE, contadoCentavos: 1, justificativa: 'x', autorizacao: null };
    expect(mensagem(conferirFechamento(pedido, { ...ctxBase, caixas: [], lancamentos }))).toBe('Este dia não tem caixa aberto.');
    expect(mensagem(conferirFechamento(pedido, { ...ctxBase, caixas: [fechado(c)], lancamentos }))).toBe('Este dia já foi fechado.');
    expect(mensagem(conferirFechamento(pedido, { ...ctxBase, caixas: [caixa(ONTEM), c], lancamentos }))).toBe('Feche primeiro o caixa de 18/11/2026.');
    expect(mensagem(conferirFechamento({ ...pedido, dia: '2026-11-20' }, { ...ctxBase, caixas: [caixa('2026-11-20')], lancamentos }))).toBe('Data no futuro não é permitida.');
  });

  it('a falta ou a sobra vira ajuste no Caixa físico, com quem fechou e quem autorizou', () => {
    const conferido = conferirFechamento({ dia: HOJE, contadoCentavos: 13500, justificativa: 'troco errado', autorizacao: 'a1' }, { ...ctxBase, caixas: [c], lancamentos });
    if (!conferido.ok) throw new Error('não conferiu');
    const r = fecharCaixa(conferido.valor, { em: `${HOJE}T21:00:00.000Z`, por: BRUNO, autorizadoPor: ANA, vendas: [], lancamentos, fuso: FUSO });
    expect(r.caixa.fechamento).toMatchObject({
      por: BRUNO,
      automatico: false,
      fundoCentavos: 10000,
      esperadoCentavos: 15000,
      contadoCentavos: 13500,
      diferencaCentavos: -1500,
      ajusteCentavos: -1500,
      justificativa: 'troco errado',
      autorizadoPor: ANA,
    });
    expect(r.ajuste).toMatchObject({ conta: 'caixa', tipo: 'ajuste_caixa', valorCentavos: -1500, descricao: 'Falta no fechamento de 19/11/2026 • troco errado', dia: HOJE, caixaId: c.id });
    const certo = conferirFechamento({ dia: HOJE, contadoCentavos: 15000, justificativa: null, autorizacao: null }, { ...ctxBase, caixas: [c], lancamentos });
    if (!certo.ok) throw new Error('não conferiu');
    expect(fecharCaixa(certo.valor, { em: 'x', por: ANA, autorizadoPor: null, vendas: [], lancamentos, fuso: FUSO }).ajuste).toBeNull();
  });
});

describe('fechamento automático (CX-06)', () => {
  it('o caixa que passou da meia-noite aberto fecha sozinho, sem contagem e sem ajuste', () => {
    const lancamentos = [lanc({ conta: 'caixa', tipo: 'venda', valorCentavos: 2500, criadoEm: `${ONTEM}T15:00:00.000Z` })];
    const r = fecharDiasPassados([caixa('2026-11-17'), fechado(caixa('2026-11-16')), caixa(ONTEM, 5000), caixa(HOJE)].filter((x) => x.dia !== '2026-11-17'), {
      hoje: HOJE,
      em: `${HOJE}T11:05:00.000Z`,
      vendas: [],
      lancamentos,
      fuso: FUSO,
    });
    expect(r.fechados.map((c) => c.dia)).toEqual([ONTEM]);
    expect(r.fechados[0]!.fechamento).toMatchObject({
      por: null,
      automatico: true,
      esperadoCentavos: 7500,
      contadoCentavos: null,
      diferencaCentavos: null,
      ajusteCentavos: 0,
      justificativa: TEXTO_FECHAMENTO_AUTOMATICO,
    });
    expect(r.caixas.find((c) => c.dia === HOJE)!.fechamento).toBeNull();
    expect(fecharDiasPassados([caixa(HOJE)], { hoje: HOJE, em: 'x', vendas: [], lancamentos: [], fuso: FUSO }).fechados).toEqual([]);
  });
});

describe('desfazer o fechamento (CX-05)', () => {
  it('só o último, sem caixa aberto depois dele; o automático pede explicação', () => {
    const caixas = [fechado(caixa('2026-11-17')), fechado(caixa(ONTEM))];
    const motivo = { motivo: 'contei errado', explicacao: null };
    expect(mensagem(conferirDesfazer(caixas, 'cx-2026-11-17', motivo))).toBe('Só é possível desfazer o último fechamento.');
    expect(conferirDesfazer(caixas, `cx-${ONTEM}`, motivo).ok).toBe(true);
    expect(mensagem(conferirDesfazer([...caixas, caixa(HOJE)], `cx-${ONTEM}`, motivo))).toBe('Há caixa aberto depois deste dia. Não é possível desfazer.');
    expect(mensagem(conferirDesfazer([caixa(HOJE)], `cx-${HOJE}`, motivo))).toBe('Este caixa não está fechado.');
    expect(mensagem(conferirDesfazer(caixas, 'nenhum', motivo))).toBe('Caixa não encontrado.');
    expect(mensagem(conferirDesfazer([fechado(caixa(ONTEM), true)], `cx-${ONTEM}`, motivo))).toBe('Explique por que o fechamento automático precisa ser ajustado.');
    expect(conferirDesfazer([fechado(caixa(ONTEM), true)], `cx-${ONTEM}`, { motivo: 'x', explicacao: 'faltou contar' }).ok).toBe(true);
    expect(mensagem(validarPedidoDesfazer({ motivo: ' ' }))).toBe('Informe o motivo.');
    expect(validarPedidoDesfazer({ motivo: ' errei ', explicacao: '' })).toEqual({ ok: true, valor: { motivo: 'errei', explicacao: null } });
  });

  it('o dia volta a ficar aberto, o fechamento fica guardado e o ajuste é estornado', () => {
    const c = fechado(caixa(HOJE));
    const comAjuste: CaixaDoDia = { ...c, fechamento: { ...c.fechamento!, contadoCentavos: 9000, diferencaCentavos: -1000, ajusteCentavos: -1000 } };
    const r = desfazerFechamento(comAjuste, { em: `${HOJE}T22:00:00.000Z`, por: ANA, motivo: 'contei errado', explicacao: null });
    expect(r.caixa.fechamento).toBeNull();
    expect(r.caixa.desfeitos).toMatchObject([{ diferencaCentavos: -1000, desfeitoPor: ANA, motivo: 'contei errado' }]);
    expect(r.estorno).toMatchObject({ conta: 'caixa', tipo: 'ajuste_caixa', valorCentavos: 1000, descricao: 'Estorno do ajuste do fechamento de 19/11/2026 (fechamento desfeito)' });
    expect(desfazerFechamento(c, { em: 'x', por: ANA, motivo: 'x', explicacao: null }).estorno).toBeNull();
  });
});

describe('autorização com senha e liberação do Dono (CX-08)', () => {
  const agora = new Date(`${HOJE}T13:00:00.000Z`);

  it('serve só dentro de 4 horas, de quem tem a permissão e para a mesma ação', () => {
    const a = autorizacao('administrador', { tipo: 'retirada', valorCentavos: 5000 });
    const mesma = (x: Autorizacao['acao']) => x.tipo === 'retirada' && x.valorCentavos === 5000;
    expect(autorizacaoServe(a, 'caixa.retirada', mesma, agora)).toBe(true);
    expect(autorizacaoServe(a, 'caixa.retirada', (x) => x.tipo === 'retirada' && x.valorCentavos === 6000, agora)).toBe(false);
    expect(autorizacaoServe(autorizacao('vendedor', a.acao), 'caixa.retirada', mesma, agora)).toBe(false);
    expect(autorizacaoServe({ ...a, criadaEm: `${HOJE}T08:59:00.000Z` }, 'caixa.retirada', mesma, agora)).toBe(false);
    expect(autorizacaoServe(null, 'caixa.retirada', mesma, agora)).toBe(false);
  });

  it('dia travado precisa da liberação de um Dono, com motivo; fora dele nada é pedido', () => {
    const caixas = [fechado(caixa('2026-11-17')), caixa(ONTEM)];
    const ctx = { hoje: HOJE, caixas, oque: 'compra', agora };
    expect(conferirLiberacao(ONTEM, { ...ctx, liberacao: null, autorizacao: null })).toEqual({ ok: true, valor: { liberacao: null, autorizacaoUsada: null } });
    expect(mensagem(conferirLiberacao('2026-11-17', { ...ctx, liberacao: null, autorizacao: null }))).toBe('O caixa de 17/11/2026 já foi fechado: compra nesse dia precisa da liberação de um Dono.');
    expect(mensagem(conferirLiberacao('2026-11-10', { ...ctx, liberacao: null, autorizacao: null }))).toBe(
      '10/11/2026 fica antes do último caixa fechado (17/11/2026): compra nesse dia precisa da liberação de um Dono.',
    );
    const pedido = { autorizacao: 'aut-dono', motivo: 'NF chegou atrasada' };
    const dono = autorizacao('dono', { tipo: 'dia_fechado', dia: '2026-11-17' });
    expect(conferirLiberacao('2026-11-17', { ...ctx, liberacao: pedido, autorizacao: dono })).toEqual({
      ok: true,
      valor: { liberacao: { por: { id: 'dono', nome: 'Ana' }, motivo: 'NF chegou atrasada', em: agora.toISOString() }, autorizacaoUsada: 'aut-dono' },
    });
    // o Administrador não libera; a liberação de outro dia não serve
    expect(conferirLiberacao('2026-11-17', { ...ctx, liberacao: pedido, autorizacao: autorizacao('administrador', dono.acao) }).ok).toBe(false);
    expect(conferirLiberacao('2026-11-17', { ...ctx, liberacao: pedido, autorizacao: autorizacao('dono', { tipo: 'dia_fechado', dia: '2026-11-16' }) }).ok).toBe(false);
  });

  it('pedido de liberação: autorização e motivo', () => {
    expect(validarLiberacao(undefined)).toEqual({ ok: true, valor: null });
    expect(validarLiberacao({ autorizacao: 'a1', motivo: ' nota atrasada ' })).toEqual({ ok: true, valor: { autorizacao: 'a1', motivo: 'nota atrasada' } });
    expect(mensagem(validarLiberacao({ autorizacao: 'a1', motivo: '' }))).toBe('Informe o motivo da liberação.');
    expect(mensagem(validarLiberacao({ motivo: 'x' }))).toBe('Liberação inválida.');
    expect(mensagem(validarLiberacao('sim'))).toBe('Liberação inválida.');
  });
});

describe('o caixa nas outras operações', () => {
  const venda: Venda = {
    id: 'v1',
    numero: 1,
    criadaEm: `${HOJE}T13:00:00.000Z`,
    vendedor: BRUNO,
    cliente: null,
    itens: [],
    totalCentavos: 3000,
    descontoCentavos: 0,
    pagamentos: [{ forma: 'dinheiro', valorCentavos: 3000 }],
    recebidoDinheiroCentavos: 3000,
    trocoCentavos: 0,
    status: 'finalizada',
    cancelamento: null,
    devolucoes: [],
    caixaId: 'cx-hoje',
  };
  const agora = new Date(`${HOJE}T15:00:00.000Z`);

  it('cancelar a venda inteira só com o caixa daquela venda aberto (DaniPets canCancelSale)', () => {
    expect(podeCancelarVenda(venda, agora, FUSO)).toBe(true); // sem informar o caixa: regra antiga
    expect(podeCancelarVenda(venda, agora, FUSO, { id: 'cx-hoje' })).toBe(true);
    expect(podeCancelarVenda(venda, agora, FUSO, null)).toBe(false);
    expect(podeCancelarVenda(venda, agora, FUSO, { id: 'outro' })).toBe(false);
    expect(podeCancelarVenda({ ...venda, caixaId: null }, agora, FUSO, { id: 'outro' })).toBe(true); // venda de antes do Caixa do dia
    const r = calcularCancelamento(venda, { motivo: 'x', autorizacao: null }, { operador: { ...ANA, papel: 'dono' }, agora, fuso: FUSO, caixaAberto: null });
    expect(mensagem(r)).toBe('Cancelar a venda inteira só com o caixa daquela venda aberto. Use "Devolver itens".');
  });

  it('devolução em dinheiro não passa do esperado na gaveta (DEV-05)', () => {
    const r = efeitosFinanceirosDoEstorno(venda, [{ forma: 'dinheiro', valorCentavos: 3000 }], [], { rotulo: 'Devolução nº 1', em: 'x', por: ANA, saldoCaixaCentavos: 999999, gavetaCentavos: 2000 });
    expect(mensagem(r)).toBe(
      'O valor (R$ 30,00) é maior que o dinheiro esperado na gaveta (R$ 20,00). Confira o valor digitado. Se entrou dinheiro sem registro, lance um suprimento antes.',
    );
    expect(efeitosFinanceirosDoEstorno(venda, [{ forma: 'dinheiro', valorCentavos: 3000 }], [], { rotulo: 'x', em: 'x', por: ANA, gavetaCentavos: 3000 }).ok).toBe(true);
  });

  it('pagar conta pelo Caixa físico com o caixa aberto: o limite é a gaveta', () => {
    const cp = {
      id: 'cp1',
      compraId: 'c1',
      descricao: 'Compra',
      valorCentavos: 5000,
      valorOriginalCentavos: 5000,
      vencimento: HOJE,
      situacao: 'aberta' as const,
      criadoEm: 'x',
      por: ANA,
      ajustes: [],
      pagamento: null,
    };
    expect(mensagem(pagarConta(cp, { conta: 'caixa', em: 'x', por: ANA, saldoCaixaCentavos: 999999, gavetaCentavos: 4000 }))).toMatch(/esperado na gaveta \(R\$ 40,00\)/);
    expect(pagarConta(cp, { conta: 'caixa', em: 'x', por: ANA, saldoCaixaCentavos: 0, gavetaCentavos: 5000 }).ok).toBe(true);
  });

  it('a compra à vista sai no dia da compra; o estoque também guarda o dia', () => {
    const itens = montarItensDaCompra([{ produtoId: 'p1', quantidade: 2, custoCentavos: 1000 }], new Map([['p1', { id: 'p1', nome: 'Ração', ativo: true }]]));
    if (!itens.ok) throw new Error('itens');
    const e = efeitosDaCompra({
      id: 'c1',
      numero: 1,
      data: ONTEM,
      criadaEm: `${HOJE}T12:00:00.000Z`,
      fornecedor: null,
      notaFiscal: null,
      itens: itens.valor.itens,
      totalCentavos: 2000,
      pagamento: { tipo: 'avista', conta: 'caixa' },
      por: ANA,
    });
    expect(e.lancamentos[0]).toMatchObject({ dia: ONTEM, valorCentavos: -2000 });
    expect(e.movimentos[0]).toMatchObject({ dia: ONTEM });
  });

  it('ajuste e entrada de estoque com data: hoje ou antes', () => {
    const base = { produtoId: 'p1', tipo: 'ajuste', quantidade: -1, motivo: 'Produto vencido' };
    expect(validarMovimentoManual({ ...base, dia: ONTEM }, { hoje: HOJE })).toMatchObject({ ok: true, valor: { dia: ONTEM } });
    expect(mensagem(validarMovimentoManual({ ...base, dia: '2026-11-20' }, { hoje: HOJE }))).toBe('Data no futuro não é permitida.');
    expect(mensagem(validarMovimentoManual({ ...base, dia: '2026-13-01' }, { hoje: HOJE }))).toBe('Data inválida.');
    const v = validarMovimentoManual({ ...base, dia: ONTEM }, { hoje: HOJE });
    if (!v.ok) throw new Error('movimento');
    expect(movimentoManual(v.valor, { em: 'x', por: ANA, hoje: HOJE })).toMatchObject({ dia: ONTEM });
    expect(movimentoManual({ ...v.valor, dia: HOJE }, { em: 'x', por: ANA, hoje: HOJE })).not.toHaveProperty('dia');
  });
});

describe('histórico do caixa', () => {
  const nome = (id: string) => (id === 'ana' ? 'Ana' : null);
  it('resumos das ações novas', () => {
    expect(limpo(resumirAuditoria('caixa.aberto', { dia: HOJE, fundoCentavos: 10000 }))).toBe('19/11/2026 • fundo de troco R$ 100,00');
    expect(limpo(resumirAuditoria('caixa.sangria', { valorCentavos: 2000 }))).toBe('R$ 20,00 da gaveta para a Conta bancária');
    expect(limpo(resumirAuditoria('caixa.retirada', { valorCentavos: 5000, autorizadoPor: 'ana' }, nome))).toBe('R$ 50,00 da gaveta • autorizado por Ana');
    expect(limpo(resumirAuditoria('caixa.suprimento', { valorCentavos: 1000 }))).toBe('R$ 10,00 na gaveta');
    expect(limpo(resumirAuditoria('caixa.fechado', { dia: HOJE, esperadoCentavos: 15000, contadoCentavos: 13500, diferencaCentavos: -1500, autorizadoPor: 'ana' }, nome))).toBe(
      '19/11/2026 • esperado R$ 150,00 • contado R$ 135,00 • falta de R$ 15,00 (ajuste no Caixa físico) • autorizado por Ana',
    );
    expect(limpo(resumirAuditoria('caixa.fechado', { dia: HOJE, esperadoCentavos: 100, contadoCentavos: 100, diferencaCentavos: 0 }))).toBe('19/11/2026 • esperado R$ 1,00 • contado R$ 1,00 • sem diferença');
    expect(resumirAuditoria('caixa.fechamento_automatico', { dia: ONTEM })).toBe('18/11/2026 • sem contagem e sem ajuste');
    expect(resumirAuditoria('caixa.fechamento_desfeito', { dia: ONTEM, automatico: true })).toBe('18/11/2026 • era automático');
    expect(resumirAuditoria('dia_fechado.liberado', { oque: 'compra', dia: ONTEM, autorizadoPor: 'ana' }, nome)).toBe('compra • data 18/11/2026 • liberado por Ana');
  });
});
