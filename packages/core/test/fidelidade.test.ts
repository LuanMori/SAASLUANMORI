// packages/core/test/fidelidade.test.ts — programa de fidelidade (Fase 2, módulo 7), com as regras do DaniPets V9.3.3.
import { describe, expect, it } from 'vitest';
import {
  analisarRetorno,
  baseDoCashback,
  calcularVenda,
  cashbackARetirar,
  cashbackVencendo,
  cashbackVencido,
  type ClienteDaFidelidade,
  consumirCashback,
  type ContatoCliente,
  creditarCashback,
  type CupomRetorno,
  cupomAtivo,
  efeitosFinanceirosDaVenda,
  efeitosFinanceirosDoEstorno,
  emDias,
  extratoCompletoDoCliente,
  extratoDaFidelidade,
  FORMAS_DA_TELA,
  formaPrecisaDeCliente,
  gerarCashback,
  linkWhatsapp,
  type LoteCashback,
  lotesValidos,
  MENSAGEM_CASHBACK_SEM_CLIENTE,
  mensagemDoCliente,
  motivoSemMensagem,
  type NovaVenda,
  type Operador,
  type OperadorComPapel,
  podeReceberCobranca,
  podeReceberMensagem,
  precoComCupom,
  primeiroNome,
  type ProdutoParaVenda,
  proximoVencimento,
  regrasPadrao,
  registrarContato,
  regulamentoDoPrograma,
  repartirEstorno,
  resultadoDosLembretes,
  resumirAuditoria,
  retirarCashbackDaVenda,
  saldoCashback,
  validarNovaVenda,
  valorDoCashback,
  type Venda,
  zerarCashbackDoCliente,
} from '../src';

const ANA: Operador = { id: 'ana', nome: 'Ana' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const HOJE = '2026-11-20';
const CPF = '52998224725';
const MARIA = { id: 'maria', nome: 'Maria Oliveira', telefone: '41999998888', cpf: CPF };
const REGRAS = regrasPadrao();
const limpo = (t: string) => t.replace(/ /g, ' ');
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? limpo(r.erros[0]!.mensagem) : '');
let seq = 0;
const novoId = () => `id${++seq}`;
const CTX = { dia: HOJE, em: `${HOJE}T15:00:00.000Z`, por: ANA, novoId };

function lote(id: string, extra: Partial<LoteCashback> = {}): LoteCashback {
  return {
    id,
    clienteId: 'maria',
    tipo: 'compra',
    dia: '2026-11-01',
    valorCentavos: 1000,
    restanteCentavos: 1000,
    venceEm: '2026-12-02',
    percentual: 3.5,
    origem: 'Compra #00001',
    vendaId: 'v1',
    vendaNumero: 1,
    criadoEm: '2026-11-01T15:00:00.000Z',
    por: ANA,
    ...extra,
  };
}

function venda(extra: Partial<Venda> = {}): Venda {
  return {
    id: 'v1',
    numero: 1,
    criadaEm: `${HOJE}T15:00:00.000Z`,
    vendedor: BRUNO,
    cliente: { id: 'maria', nome: 'Maria Oliveira' },
    itens: [],
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

// ------------------------------------------------------------------ cashback
describe('cashback: gerar (CLI-10)', () => {
  it('3,5% do que foi pago em dinheiro, Pix ou cartão; cashback, vale-troca e fiado não geram', () => {
    expect(baseDoCashback([{ forma: 'pix', valorCentavos: 6000 }, { forma: 'credito', valorCentavos: 4000 }, { forma: 'cashback', valorCentavos: 500 }, { forma: 'fiado', valorCentavos: 2000 }])).toBe(10000);
    const l = gerarCashback(venda({ numero: 12, pagamentos: [{ forma: 'pix', valorCentavos: 10000 }, { forma: 'cashback', valorCentavos: 500 }] }), MARIA, REGRAS.cashback, CTX);
    expect(l).toMatchObject({ clienteId: 'maria', tipo: 'compra', dia: HOJE, valorCentavos: 350, restanteCentavos: 350, venceEm: '2026-12-21', percentual: 3.5, origem: 'Compra #00012', vendaId: 'v1', vendaNumero: 12 });
  });

  it('arredonda ao centavo, sem float', () => {
    expect(valorDoCashback(999, 3.5)).toBe(35); // 34,965
    expect(valorDoCashback(10_001, 2.25)).toBe(225); // 225,0225
    expect(valorDoCashback(14, 3.5)).toBe(0);
  });

  it('não gera sem cliente, com cadastro incompleto, com 0% ou abaixo de 1 centavo', () => {
    const v = venda();
    expect(gerarCashback(v, null, REGRAS.cashback, CTX)).toBeNull();
    expect(gerarCashback(v, { ...MARIA, cpf: '11111111111' }, REGRAS.cashback, CTX)).toBeNull();
    expect(gerarCashback(v, MARIA, { ...REGRAS.cashback, percentual: 0 }, CTX)).toBeNull();
    expect(gerarCashback(venda({ pagamentos: [{ forma: 'pix', valorCentavos: 14 }] }), MARIA, REGRAS.cashback, CTX)).toBeNull();
    expect(gerarCashback(venda({ pagamentos: [{ forma: 'fiado', valorCentavos: 10000 }] }), MARIA, REGRAS.cashback, CTX)).toBeNull();
  });
});

describe('cashback: saldo, vencendo e vencido (CLI-10 e 12)', () => {
  const lotes = [
    lote('a', { venceEm: '2026-12-01', restanteCentavos: 300 }),
    lote('b', { venceEm: '2026-11-25', restanteCentavos: 200 }),
    lote('c', { venceEm: '2026-11-25', restanteCentavos: 50, dia: '2026-11-02' }),
    lote('d', { venceEm: '2026-11-19', restanteCentavos: 70 }), // venceu ontem
    lote('e', { venceEm: '2026-12-10', restanteCentavos: 0 }), // já usado
    lote('f', { clienteId: 'joao', restanteCentavos: 999 }),
  ];

  it('lotes válidos do que vence antes para o que vence depois; vence no último dia', () => {
    expect(lotesValidos(lotes, 'maria', HOJE).map((l) => l.id)).toEqual(['b', 'c', 'a']);
    expect(lotesValidos(lotes, 'maria', '2026-11-19').map((l) => l.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('saldo só para cadastro completo', () => {
    expect(saldoCashback(lotes, MARIA, HOJE)).toBe(550);
    expect(saldoCashback(lotes, { ...MARIA, telefone: '123' }, HOJE)).toBe(0);
    expect(saldoCashback(lotes, null, HOJE)).toBe(0);
  });

  it('vencendo em até 7 dias, próximo vencimento e vencido', () => {
    expect(cashbackVencendo(lotes, MARIA, HOJE, 7)).toBe(250);
    expect(cashbackVencendo(lotes, MARIA, HOJE, 0)).toBe(0);
    expect(proximoVencimento(lotes, MARIA, HOJE)).toEqual({ venceEm: '2026-11-25', valorCentavos: 250 });
    expect(proximoVencimento([], MARIA, HOJE)).toBeNull();
    expect(cashbackVencido(lotes, 'maria', HOJE)).toBe(70);
  });

  it('textos de prazo', () => {
    expect([emDias(0), emDias(1), emDias(5)]).toEqual(['hoje', 'amanhã', 'em 5 dias']);
    expect(primeiroNome('  Maria   da Silva ')).toBe('Maria');
  });
});

describe('cashback: usar, devolver e retirar (PDV-08, DEV-07)', () => {
  it('usa primeiro o lote que vence antes, sem alterar a lista recebida', () => {
    const lotes = [lote('a', { venceEm: '2026-12-01', restanteCentavos: 300 }), lote('b', { venceEm: '2026-11-25', restanteCentavos: 200 })];
    const r = consumirCashback(lotes, MARIA, 250, HOJE);
    expect(r.ok && r.valor.usados).toEqual([
      { id: 'b', valorCentavos: 200 },
      { id: 'a', valorCentavos: 50 },
    ]);
    expect(r.ok && r.valor.lotes.map((l) => l.restanteCentavos)).toEqual([250, 0]);
    expect(lotes.map((l) => l.restanteCentavos)).toEqual([300, 200]);
    expect(mensagem(consumirCashback(lotes, MARIA, 600, HOJE))).toBe('O cashback disponível de Maria Oliveira é R$ 5,00.');
  });

  it('o cashback usado numa compra devolvida volta como lote novo, com prazo novo', () => {
    const l = creditarCashback(120, { ...CTX, clienteId: 'maria', validadeDias: 31, origem: 'Devolução nº 2 • venda #00012', vendaId: 'v12', vendaNumero: 12 });
    expect(l).toMatchObject({ tipo: 'estorno', valorCentavos: 120, restanteCentavos: 120, venceEm: '2026-12-21', percentual: null, origem: 'Devolução nº 2 • venda #00012' });
    expect(creditarCashback(0, { ...CTX, clienteId: 'maria', validadeDias: 31, origem: '', vendaId: null, vendaNumero: null })).toBeNull();
  });

  it('devolução tira na proporção; a que completa a venda leva o resto; cancelamento tira tudo', () => {
    const v = venda({ totalCentavos: 10000, cashbackGeradoCentavos: 350 });
    expect(cashbackARetirar(v, 0, 2000)).toBe(70);
    expect(cashbackARetirar({ ...v, cashbackRetiradoCentavos: 70 }, 2000, 3000)).toBe(105);
    expect(cashbackARetirar({ ...v, cashbackRetiradoCentavos: 175 }, 5000, 5000)).toBe(175);
    expect(cashbackARetirar({ ...v, cashbackRetiradoCentavos: 100 })).toBe(250);
    expect(cashbackARetirar(venda())).toBe(0);
    expect(cashbackARetirar({ ...v, cashbackRetiradoCentavos: 350 }, 0, 2000)).toBe(0);
  });

  it('retira primeiro do lote da própria compra (mesmo vencido), depois dos outros válidos; o resto fica "não recuperado"', () => {
    const lotes = [
      lote('proprio', { vendaId: 'v1', restanteCentavos: 100, venceEm: '2026-11-10' }),
      lote('outro', { vendaId: 'v2', restanteCentavos: 300, venceEm: '2026-12-01' }),
      lote('vencido', { vendaId: 'v3', restanteCentavos: 50, venceEm: '2026-11-15' }),
      lote('devolvido', { vendaId: 'v1', tipo: 'estorno', restanteCentavos: 80 }),
      lote('joao', { clienteId: 'joao', vendaId: 'v9', restanteCentavos: 500 }),
    ];
    const r = retirarCashbackDaVenda(lotes, { id: 'v1', clienteId: 'maria' }, 250, HOJE);
    expect(r.usados).toEqual([
      { id: 'proprio', valorCentavos: 100 },
      { id: 'outro', valorCentavos: 150 },
    ]);
    expect([r.tiradoCentavos, r.naoRecuperadoCentavos]).toEqual([250, 0]);
    const tudo = retirarCashbackDaVenda(lotes, { id: 'v1', clienteId: 'maria' }, 500, HOJE);
    expect([tudo.tiradoCentavos, tudo.naoRecuperadoCentavos]).toEqual([400, 100]);
    expect(tudo.lotes.find((l) => l.id === 'vencido')!.restanteCentavos).toBe(50);
    expect(tudo.lotes.find((l) => l.id === 'devolvido')!.restanteCentavos).toBe(80);
    expect(retirarCashbackDaVenda(lotes, { id: 'v1', clienteId: 'maria' }, 0, HOJE).usados).toEqual([]);
  });

  it('exclusão dos dados (LGPD): o cliente perde o que sobrou, válido ou vencido', () => {
    const lotes = [lote('a', { restanteCentavos: 300 }), lote('b', { restanteCentavos: 40, venceEm: '2026-10-01' }), lote('c', { restanteCentavos: 0 }), lote('j', { clienteId: 'joao' })];
    const r = zerarCashbackDoCliente(lotes, 'maria');
    expect(r.valorCentavos).toBe(340);
    expect(r.usados.map((u) => u.id)).toEqual(['a', 'b']);
    expect(r.lotes.map((l) => l.restanteCentavos)).toEqual([0, 0, 0, 1000]);
  });
});

// ------------------------------------------------------------------ cashback e cupom na venda
describe('venda com cashback e cupom de retorno (PDV-04, PDV-08)', () => {
  const catalogo = new Map<string, ProdutoParaVenda>([
    ['p1', { id: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 10000, ativo: true }],
    ['p2', { id: 'p2', codigoInterno: '0002', nome: 'Bala', precoCentavos: 1, ativo: true }],
  ]);
  const clientes = new Map([['maria', { id: 'maria', nome: 'Maria Oliveira', ativo: true }]]);
  const pedido = (p: Partial<NovaVenda>): NovaVenda => ({ itens: [{ produtoId: 'p1', quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 10000 }], clienteId: 'maria', ...p });
  const CUPOM = { id: 'k1', clienteId: 'maria', pct: 5 };

  it('cashback é forma de pagamento que precisa de cliente e fica fora dos botões da tela', () => {
    expect(formaPrecisaDeCliente('cashback')).toBe(true);
    expect(FORMAS_DA_TELA).toEqual(['dinheiro', 'pix', 'debito', 'credito', 'fiado']);
    const sem = calcularVenda(pedido({ clienteId: null, pagamentos: [{ forma: 'cashback', valorCentavos: 500 }, { forma: 'pix', valorCentavos: 9500 }] }), catalogo, { operador: BRUNO, clientes, cashbackDisponivelCentavos: 500 });
    expect(mensagem(sem)).toBe(MENSAGEM_CASHBACK_SEM_CLIENTE);
  });

  it('o cashback abate do total até o saldo; a outra forma paga o resto', () => {
    const p = pedido({ pagamentos: [{ forma: 'cashback', valorCentavos: 500 }, { forma: 'pix', valorCentavos: 9500 }] });
    expect(mensagem(calcularVenda(p, catalogo, { operador: BRUNO, clientes, cashbackDisponivelCentavos: 400 }))).toBe('O cashback disponível de Maria Oliveira é R$ 4,00.');
    expect(mensagem(calcularVenda(p, catalogo, { operador: BRUNO, clientes }))).toBe('O cashback disponível de Maria Oliveira é R$ 0,00.');
    const r = calcularVenda(p, catalogo, { operador: BRUNO, clientes, cashbackDisponivelCentavos: 500 });
    expect(r.ok && r.valor.pagamentos).toEqual([
      { forma: 'cashback', valorCentavos: 500 },
      { forma: 'pix', valorCentavos: 9500 },
    ]);
    const v = validarNovaVenda({ ...p, pagamentos: [{ forma: 'pix', valorCentavos: 9500 }, { forma: 'cashback', valorCentavos: 500 }] });
    expect(v.ok && v.valor.pagamentos.map((x) => x.forma)).toEqual(['pix', 'cashback']);
  });

  it('o cupom dá o desconto pela regra, com o motivo do cupom e quem vendeu como responsável', () => {
    expect(precoComCupom(10000, 5)).toBe(9500);
    expect(precoComCupom(1999, 7.5)).toBe(1849); // 1849,075
    const r = calcularVenda(pedido({ itens: [{ produtoId: 'p1', quantidade: 2, cupom: 'k1' }], pagamentos: [{ forma: 'pix', valorCentavos: 19000 }] }), catalogo, { operador: BRUNO, clientes, cupom: CUPOM });
    expect(r.ok && r.valor.itens[0]).toMatchObject({ precoCentavos: 9500, subtotalCentavos: 19000, desconto: { motivo: 'Cupom de retorno 5%', responsavel: { id: 'bruno', nome: 'Bruno' }, autorizadoComSenha: false, cupom: { id: 'k1', pct: 5 } } });
    expect(r.ok && [r.valor.descontoCentavos, r.valor.cupomUsado]).toEqual([1000, 'k1']);
  });

  it('cupom de outro cliente, que não vale mais ou que não dá desconto é recusado', () => {
    const p = pedido({ itens: [{ produtoId: 'p1', quantidade: 1, cupom: 'k1' }], pagamentos: [{ forma: 'pix', valorCentavos: 9500 }] });
    const recusa = 'O cupom de retorno de Ração não vale para esta venda. Identifique o cliente de novo.';
    expect(mensagem(calcularVenda(p, catalogo, { operador: BRUNO, clientes }))).toBe(recusa);
    expect(mensagem(calcularVenda(p, catalogo, { operador: BRUNO, clientes, cupom: { ...CUPOM, id: 'k2' } }))).toBe(recusa);
    expect(mensagem(calcularVenda({ ...p, clienteId: null }, catalogo, { operador: BRUNO, clientes, cupom: CUPOM }))).toBe(recusa);
    const bala = pedido({ itens: [{ produtoId: 'p2', quantidade: 1, cupom: 'k1' }], pagamentos: [{ forma: 'pix', valorCentavos: 1 }] });
    expect(mensagem(calcularVenda(bala, catalogo, { operador: BRUNO, clientes, cupom: CUPOM }))).toMatch(/cupom de retorno de Bala não vale/);
  });

  it('o pedido não leva cupom e desconto manual no mesmo item', () => {
    expect(mensagem(validarNovaVenda(pedido({ itens: [{ produtoId: 'p1', quantidade: 1, cupom: 'k1', desconto: { precoFinalCentavos: 9000, motivo: 'x' } }] })))).toBe(
      'Use o cupom de retorno ou o desconto manual, não os dois no mesmo item.',
    );
    expect(mensagem(validarNovaVenda(pedido({ itens: [{ produtoId: 'p1', quantidade: 1, cupom: 12 as unknown as string }] })))).toBe('Cupom inválido.');
    const v = validarNovaVenda(pedido({ itens: [{ produtoId: 'p1', quantidade: 1, cupom: ' k1 ' }] }));
    expect(v.ok && v.valor.itens[0]).toEqual({ produtoId: 'p1', quantidade: 1, desconto: null, cupom: 'k1' });
  });

  it('no financeiro o cashback não entra em conta nenhuma, nem na venda nem no estorno', () => {
    const v = venda({ pagamentos: [{ forma: 'cashback', valorCentavos: 500 }, { forma: 'pix', valorCentavos: 9500 }] });
    const e = efeitosFinanceirosDaVenda(v);
    expect(e.lancamentos.map((l) => [l.conta, l.valorCentavos])).toEqual([['banco', 9500]]);
    expect(e.recebiveis).toEqual([]);
    const est = repartirEstorno(v, 2000);
    expect(est.ok && est.valor).toEqual([
      { forma: 'pix', valorCentavos: 1900 },
      { forma: 'cashback', valorCentavos: 100 },
    ]);
    const f = efeitosFinanceirosDoEstorno(v, est.ok ? est.valor : [], [], { rotulo: 'Devolução nº 1', em: CTX.em, por: ANA });
    expect(f.ok && f.valor.lancamentos.map((l) => [l.conta, l.valorCentavos])).toEqual([['banco', -1900]]);
  });
});

// ------------------------------------------------------------------ cupom e contatos
describe('cupom de retorno e lembretes (CLI-11, 13 e 14)', () => {
  const cupom = (id: string, extra: Partial<CupomRetorno> = {}): CupomRetorno => ({ id, clienteId: 'maria', pct: 5, dia: '2026-11-15', venceEm: '2026-11-22', uso: null, contatoId: 'k', ...extra });

  it('cupom ativo: cadastro completo, cupom ligado, não usado e no prazo', () => {
    const cupons = [cupom('usado', { uso: { dia: '2026-11-16', vendaId: 'v', vendaNumero: 3 } }), cupom('vencido', { venceEm: '2026-11-19' }), cupom('bom')];
    expect(cupomAtivo(cupons, MARIA, HOJE, REGRAS.retorno)?.id).toBe('bom');
    expect(cupomAtivo(cupons, MARIA, '2026-11-23', REGRAS.retorno)).toBeNull();
    expect(cupomAtivo(cupons, MARIA, HOJE, { cupomPct: 0 })).toBeNull();
    expect(cupomAtivo(cupons, { ...MARIA, cpf: '' }, HOJE, REGRAS.retorno)).toBeNull();
  });

  it('só a mensagem de retorno pelo WhatsApp dá cupom; o cupom que ainda vale é o mesmo', () => {
    const novo = registrarContato(MARIA, 'retorno', 'whatsapp', { ...CTX, cupons: [], regras: REGRAS.retorno });
    expect(novo.cupomNovo).toBe(true);
    expect(novo.cupom).toMatchObject({ clienteId: 'maria', pct: 5, dia: HOJE, venceEm: '2026-11-27', uso: null, contatoId: novo.contato.id });
    expect(novo.contato).toMatchObject({ clienteId: 'maria', tipo: 'retorno', canal: 'whatsapp', dia: HOJE, cupomId: novo.cupom!.id, por: ANA });
    const mesmo = registrarContato(MARIA, 'retorno', 'whatsapp', { ...CTX, cupons: [cupom('bom')], regras: REGRAS.retorno });
    expect([mesmo.cupomNovo, mesmo.cupom?.id, mesmo.contato.cupomId]).toEqual([false, 'bom', 'bom']);
    for (const [tipo, canal] of [
      ['retorno', 'outro'],
      ['cashback', 'whatsapp'],
      ['cobranca', 'whatsapp'],
    ] as const) {
      expect(registrarContato(MARIA, tipo, canal, { ...CTX, cupons: [], regras: REGRAS.retorno }).cupom).toBeNull();
    }
    expect(registrarContato(MARIA, 'retorno', 'whatsapp', { ...CTX, cupons: [], regras: { ...REGRAS.retorno, cupomPct: 0 } }).cupom).toBeNull();
  });

  it('quem pode receber mensagem: WhatsApp e autorização; a cobrança só pede o WhatsApp', () => {
    const base = { ativo: true, telefone: '41999998888', whatsapp: true, autorizaMensagens: { em: CTX.em, por: ANA } };
    expect([podeReceberMensagem(base), podeReceberCobranca(base), motivoSemMensagem(base, 'retorno')]).toEqual([true, true, null]);
    const semAutorizar = { ...base, autorizaMensagens: null };
    expect([podeReceberMensagem(semAutorizar), podeReceberCobranca(semAutorizar)]).toEqual([false, true]);
    expect(motivoSemMensagem(semAutorizar, 'cashback')).toBe('O cliente não autorizou mensagens da loja pelo WhatsApp.');
    expect(motivoSemMensagem(semAutorizar, 'cobranca')).toBeNull();
    expect(motivoSemMensagem({ ...base, whatsapp: false }, 'cobranca')).toBe('O cliente não tem WhatsApp no cadastro.');
    expect(motivoSemMensagem({ ...base, telefone: '4133334444', whatsapp: undefined }, 'retorno')).toBe('O cliente não tem WhatsApp no cadastro.');
    expect(motivoSemMensagem({ ...base, ativo: false }, 'retorno')).toBe('Cliente desativado.');
  });

  it('mensagens com o nome da loja, o primeiro nome e os dados do cliente, com espaço comum no dinheiro', () => {
    const d = { nomeLoja: 'Loja Exemplo', cliente: MARIA, hoje: HOJE, regras: REGRAS };
    expect(mensagemDoCliente('retorno', { ...d, ultimaCompraDia: '2026-10-21' })).toBe(
      'Olá, Maria! Aqui é da Loja Exemplo. Faz 30 dias desde a sua última compra e sentimos sua falta. Separamos 5% de desconto para você, válido até 27/11/2026. É só informar seu CPF no caixa.',
    );
    expect(mensagemDoCliente('retorno', { ...d, ultimaCompraDia: '2026-10-21', cupom: { pct: 7.5, venceEm: '2026-11-24' } })).toMatch(/Separamos 7,5% de desconto para você, válido até 24\/11\/2026/);
    const cb = mensagemDoCliente('cashback', { ...d, proximoVencimento: { venceEm: '2026-11-25', valorCentavos: 1234 } });
    expect(cb).toBe('Olá, Maria! Aqui é da Loja Exemplo. Você tem R$ 12,34 de cashback para usar até 25/11/2026. Aproveite na sua próxima compra!');
    expect(cb).not.toMatch(/ /);
    expect(mensagemDoCliente('cobranca', { ...d, devendoCentavos: 5000, vencimentoFiado: '2026-11-10' })).toMatch(/há R\$ 50,00 em aberto na sua conta, com vencimento em 10\/11\/2026\./);
    const proprio = { ...d, regras: { ...REGRAS, mensagens: { ...REGRAS.mensagens, cashback: '{nome}, {valor} até {validade} ({loja})' } } };
    expect(mensagemDoCliente('cashback', { ...proprio, proximoVencimento: null })).toBe('Maria, R$ 0,00 até  (Loja Exemplo)');
  });

  it('link do WhatsApp com o 55 e a mensagem codificada', () => {
    expect(linkWhatsapp('(41) 99999-8888', 'Olá, Maria! 5% & mais')).toBe('https://wa.me/5541999998888?text=Ol%C3%A1%2C%20Maria!%205%25%20%26%20mais');
  });
});

describe('lista de retorno e resultado dos lembretes (CLI-13)', () => {
  const cli = (id: string, extra: Partial<ClienteDaFidelidade> = {}): ClienteDaFidelidade => ({ id, nome: `Cliente ${id}`, telefone: '41999998888', cpf: CPF, ativo: true, ...extra });
  const contato = (id: string, clienteId: string, tipo: ContatoCliente['tipo'], dia: string, extra: Partial<ContatoCliente> = {}): ContatoCliente => ({
    id,
    clienteId,
    tipo,
    canal: 'whatsapp',
    dia,
    criadoEm: `${dia}T15:00:00.000Z`,
    por: ANA,
    cupomId: null,
    ...extra,
  });

  it('sumidos há 30 dias, cashback vencendo em 7 dias e quem fica de fora (e por quê)', () => {
    const clientes = [
      cli('maria'),
      cli('joao'),
      cli('dnd', { naoIncomodar: true }),
      cli('adiado', { lembreteAdiadoAte: '2026-11-25' }),
      cli('adiado-ontem', { lembreteAdiadoAte: '2026-11-19' }),
      cli('lembrado'),
      cli('novo-ciclo'),
      cli('incompleto', { cpf: '' }),
      cli('inativo', { ativo: false }),
      cli('avisado'),
      cli('recente'),
    ];
    const ultimaCompra = new Map([
      ['maria', '2026-10-01'],
      ['joao', '2026-11-10'],
      ['dnd', '2026-10-01'],
      ['adiado', '2026-10-01'],
      ['adiado-ontem', '2026-10-15'],
      ['lembrado', '2026-10-01'],
      ['novo-ciclo', '2026-10-10'],
      ['incompleto', '2026-09-01'],
      ['inativo', '2026-09-01'],
      ['avisado', '2026-11-15'],
      ['recente', '2026-11-19'],
    ]);
    const lotes = [lote('j', { clienteId: 'joao', venceEm: '2026-11-25', restanteCentavos: 300 }), lote('a', { clienteId: 'avisado', venceEm: '2026-11-22', restanteCentavos: 100 }), lote('r', { clienteId: 'recente', venceEm: '2026-12-15' })];
    const contatos = [
      contato('k1', 'lembrado', 'retorno', '2026-10-31', { cupomId: 'cup1' }),
      contato('k2', 'novo-ciclo', 'retorno', '2026-10-05'),
      contato('k3', 'avisado', 'cashback', '2026-11-18'),
    ];
    const cupons: CupomRetorno[] = [{ id: 'cup1', clienteId: 'lembrado', pct: 5, dia: '2026-10-31', venceEm: '2026-11-07', uso: null, contatoId: 'k1' }];
    const r = analisarRetorno({ clientes, ultimaCompra, lotes, contatos, cupons, regras: REGRAS, hoje: HOJE });
    expect(r.retorno).toEqual([
      { clienteId: 'maria', diasSemComprar: 50, ultimaCompraDia: '2026-10-01' },
      { clienteId: 'novo-ciclo', diasSemComprar: 41, ultimaCompraDia: '2026-10-10' },
      { clienteId: 'adiado-ontem', diasSemComprar: 36, ultimaCompraDia: '2026-10-15' },
    ]);
    expect(r.cashback).toEqual([{ clienteId: 'joao', venceEm: '2026-11-25', valorCentavos: 300 }]);
    expect(r.fora).toEqual([
      { clienteId: 'dnd', motivo: 'Pediu para não receber lembretes' },
      { clienteId: 'adiado', motivo: 'Adiado até 25/11/2026' },
      { clienteId: 'lembrado', motivo: 'Já lembrado em 31/10/2026 (cupom até 07/11/2026)' },
      { clienteId: 'avisado', motivo: 'Cashback já avisado em 18/11/2026' },
    ]);
  });

  it('o mesmo cliente pode estar nas duas listas; o aviso de cashback volta depois do prazo do aviso', () => {
    const lotes = [lote('m', { venceEm: '2026-11-21', restanteCentavos: 90 })];
    const ambos = analisarRetorno({ clientes: [cli('maria')], ultimaCompra: new Map([['maria', '2026-10-01']]), lotes, contatos: [], cupons: [], regras: REGRAS, hoje: HOJE });
    expect([ambos.retorno.length, ambos.cashback.length]).toEqual([1, 1]);
    const antigo = [contato('k', 'maria', 'cashback', '2026-11-13')]; // há 7 dias: já pode avisar de novo
    expect(analisarRetorno({ clientes: [cli('maria')], ultimaCompra: new Map(), lotes, contatos: antigo, cupons: [], regras: REGRAS, hoje: HOJE }).cashback).toHaveLength(1);
  });

  it('resultado: voltou em até 15 dias, não voltou ou aguardando', () => {
    const contatos = [
      contato('k1', 'maria', 'retorno', '2026-11-01'),
      contato('k2', 'joao', 'retorno', '2026-10-01'),
      contato('k3', 'ana', 'retorno', '2026-11-15'),
      contato('k4', 'maria', 'cashback', '2026-11-02'),
    ];
    const compras = [
      { clienteId: 'maria', dia: '2026-11-09', vendaNumero: 14 },
      { clienteId: 'maria', dia: '2026-11-05', vendaNumero: 12 },
      { clienteId: 'joao', dia: '2026-10-20', vendaNumero: 8 },
      { clienteId: 'ana', dia: '2026-11-10', vendaNumero: 9 },
    ];
    const r = resultadoDosLembretes(contatos, compras, HOJE);
    expect(r.linhas.map((l) => [l.contato.id, l.situacao, l.voltou?.vendaNumero ?? null])).toEqual([
      ['k3', 'aguardando', null],
      ['k1', 'voltou', 12],
      ['k2', 'nao_voltou', null],
    ]);
    expect([r.enviados, r.voltaram, r.taxaPct]).toEqual([3, 1, 33]);
    expect(resultadoDosLembretes([], [], HOJE).taxaPct).toBe(0);
  });
});

// ------------------------------------------------------------------ regulamento, extrato e histórico
describe('regulamento, extrato e histórico (CLI-18, CLI-03)', () => {
  it('regulamento com o nome da loja e as regras dela', () => {
    const t = regulamentoDoPrograma('Loja Exemplo', REGRAS);
    expect(t.split('\n')[0]).toBe('Programa de cashback Loja Exemplo');
    expect(t).toMatch(/recebe 3,5% do valor pago como cashback/);
    expect(t).toMatch(/em até 31 dias a partir da data da compra/);
    const desligado = regulamentoDoPrograma('Loja Exemplo', { cashback: { percentual: 0, validadeDias: 1, avisoDias: 0 } });
    expect(desligado).toMatch(/No momento, as compras não geram cashback\./);
    expect(desligado).toMatch(/em até 1 dia a partir/);
  });

  it('extrato: cashback ganho, devolvido, vencido, usado e retirado; cupons e contatos sem valor', () => {
    const f = {
      lotes: [lote('a', { dia: '2026-11-01', venceEm: '2026-11-10', restanteCentavos: 40, valorCentavos: 100 }), lote('b', { tipo: 'estorno', dia: '2026-11-12', origem: 'Cancelamento • venda #00004', criadoEm: '2026-11-12T15:00:00.000Z' })],
      usos: [
        { id: 'u1', clienteId: 'maria', tipo: 'venda' as const, dia: '2026-11-05', valorCentavos: 60, vendaId: 'v3', vendaNumero: 3, lotes: [], rotulo: null, criadoEm: '2026-11-05T15:00:00.000Z', por: ANA },
        { id: 'u2', clienteId: 'maria', tipo: 'retirada' as const, dia: '2026-11-06', valorCentavos: 10, vendaId: 'v1', vendaNumero: 1, lotes: [], rotulo: 'Devolução nº 2', criadoEm: '2026-11-06T15:00:00.000Z', por: ANA },
        { id: 'u3', clienteId: 'maria', tipo: 'retirada' as const, dia: '2026-11-07', valorCentavos: 5, vendaId: null, vendaNumero: null, lotes: [], rotulo: 'Exclusão dos dados', criadoEm: '2026-11-07T15:00:00.000Z', por: ANA },
      ],
      cupons: [
        { id: 'c1', clienteId: 'maria', pct: 5, dia: '2026-11-02', venceEm: '2026-11-09', uso: { dia: '2026-11-05', vendaId: 'v3', vendaNumero: 3 }, contatoId: 'k1' },
        { id: 'c2', clienteId: 'maria', pct: 5, dia: '2026-11-11', venceEm: '2026-11-18', uso: null, contatoId: 'k2' },
        { id: 'c3', clienteId: 'maria', pct: 5, dia: '2026-11-19', venceEm: '2026-11-26', uso: null, contatoId: 'k3' },
      ],
      contatos: [{ id: 'k1', clienteId: 'maria', tipo: 'retorno' as const, canal: 'outro' as const, dia: '2026-11-02', criadoEm: '2026-11-02T15:00:00.000Z', por: ANA, cupomId: null }],
    };
    const linhas = extratoDaFidelidade('maria', f, HOJE);
    const por = (m: string) => linhas.filter((l) => l.movimento === m).map((l) => `${l.dia} ${l.detalhe} ${l.sinal}${l.valorCentavos ?? ''}`);
    expect(por('Cashback ganho')).toEqual(['2026-11-01 Compra #00001 • usar até 10/11/2026 +100']);
    expect(por('Cashback devolvido')).toEqual(['2026-11-12 Cancelamento • venda #00004 • usar até 02/12/2026 +1000']);
    expect(por('Cashback vencido')).toEqual(['2026-11-11 Ganho em 01/11/2026 e não usado até 10/11/2026 −40']);
    expect(por('Cashback usado')).toEqual(['2026-11-05 Na compra #00003 −60']);
    expect(por('Cashback retirado')).toEqual(['2026-11-06 Devolução nº 2 da compra #00001 −10', '2026-11-07 Exclusão dos dados −5']);
    expect(por('Cupom de retorno')).toEqual([
      '2026-11-02 5% até 09/11/2026 • usado na compra #00003 ',
      '2026-11-11 5% até 18/11/2026 • venceu sem uso ',
      '2026-11-19 5% até 26/11/2026 • ainda não usado ',
    ]);
    expect(por('Lembrete de retorno')).toEqual(['2026-11-02 Contato sem mensagem • Ana ']);
    expect(linhas.filter((l) => l.tipo === 'contatos')).toHaveLength(4);
    expect(extratoDaFidelidade('joao', f, HOJE)).toEqual([]);
  });

  it('extrato completo junta compras, fiado e fidelidade, do mais novo para o mais antigo', () => {
    const v = venda({ id: 'v7', numero: 7, criadaEm: '2026-11-03T15:00:00.000Z' });
    const f = { lotes: [lote('a', { dia: '2026-11-03', criadoEm: '2026-11-03T15:00:00.000Z' })], usos: [], cupons: [], contatos: [] };
    const linhas = extratoCompletoDoCliente('maria', [v], [], 'America/Sao_Paulo', f, HOJE);
    expect(linhas.map((l) => l.movimento)).toEqual(['Cashback ganho', 'Compra #00007']);
  });

  it('histórico: lembretes, adiar, cupom usado e cashback não recuperado', () => {
    expect(resumirAuditoria('cliente.lembrete_retorno', { canal: 'whatsapp', cupomPct: 5, cupomVenceEm: '2026-11-27' })).toBe('Mensagem pelo WhatsApp • cupom de 5% até 27/11/2026');
    expect(resumirAuditoria('cliente.aviso_cashback', { canal: 'outro' })).toBe('Contato registrado sem mensagem');
    expect(resumirAuditoria('cliente.lembrete_pagamento', { canal: 'whatsapp' })).toBe('Mensagem pelo WhatsApp');
    expect(resumirAuditoria('cliente.lembrete_adiado', { ate: '2026-11-27' })).toBe('volta para a lista em 27/11/2026');
    expect(resumirAuditoria('cliente.cupom_usado', { pct: 7.5, numero: 12 })).toBe('7,5% • na venda nº 00012');
    expect(limpo(resumirAuditoria('cliente.cashback_nao_recuperado', { rotulo: 'devolucao', numero: 12, valorCentavos: 50 }))).toBe(
      'Devolução • venda nº 00012 • R$ 0,50 do cashback desta compra já tinham sido usados ou venceram',
    );
  });
});
