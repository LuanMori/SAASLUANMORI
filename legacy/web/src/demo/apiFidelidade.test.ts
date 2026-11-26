// apps/web/src/demo/apiFidelidade.test.ts — fidelidade na demonstração (Fase 2, módulo 7), regras do DaniPets V9.3.3:
// cashback em lotes, uso na venda, devolução e cancelamento, cupom de retorno, lista de retorno, lembretes e LGPD.
import { MENSAGEM_CASHBACK_SEM_CLIENTE } from '@saas/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { criarApiLocal } from './apiLocal';

const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const txt = (t: string) => t.replace(/\u00a0/g, ' ');
const MARIA = { nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', autorizaMensagens: true };
const JOAO = { nome: 'João Pereira', telefone: '41988887777', cpf: '11144477735' };

beforeEach(() => localStorage.clear());

async function erro(p: Promise<unknown>): Promise<ErroApi> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroApi) return e;
    throw e;
  }
  throw new Error('Era para dar erro.');
}

async function loja() {
  let relogio = new Date('2026-11-20T15:00:00Z');
  const opcoes = { lojaId: 'fid', exemplos: false, atrasoMs: 0, agora: () => relogio };
  const ana = comCaixaAberto(criarApiLocal({ ...opcoes, operador: ANA }));
  const bruno = comCaixaAberto(criarApiLocal({ ...opcoes, operador: BRUNO }));
  const petisco = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('fid', 50);
  const maria = await ana.cadastrarCliente(MARIA);
  /** Venda de `n` petiscos (R$ 10,00 cada) com cliente; `pagamentos` padrão: tudo no Pix. */
  const vender = (api: typeof ana, n: number, extra: Record<string, unknown> = {}) =>
    api.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: n }], pagamentos: [{ forma: 'pix', valorCentavos: n * 1000 }], clienteId: maria.id, ...extra });
  const historico = async () => (await ana.listarAuditoria()).map((h) => [h.texto, txt(h.resumo ?? '')]);
  return { ana, bruno, petisco, maria, vender, historico, mudar: (iso: string) => (relogio = new Date(iso)) };
}

describe('cashback na venda (CLI-10, PDV-08, PDV-11)', () => {
  it('a compra gera 3,5% do que foi pago; o F6 e a conta mostram; o cashback abate do total e sai do lote que vence antes', async () => {
    const { ana, bruno, maria, petisco, vender, mudar } = await loja();
    const v1 = await vender(bruno, 10);
    expect(v1.cashbackGeradoCentavos).toBe(350);
    const [f6] = await bruno.buscarClientesParaVenda('maria');
    expect(f6).toMatchObject({ cashbackCentavos: 350, cashbackVencimento: { venceEm: '2026-12-21', valorCentavos: 350 }, cupom: null, completo: true });

    // usa o cashback: abate R$ 3,50 e o Pix paga o resto; a parte paga com cashback não gera cashback
    mudar('2026-11-20T15:05:00Z');
    const v2 = await vender(bruno, 1, { pagamentos: [{ forma: 'cashback', valorCentavos: 350 }, { forma: 'pix', valorCentavos: 650 }] });
    expect(v2.pagamentos).toEqual([
      { forma: 'pix', valorCentavos: 650 },
      { forma: 'cashback', valorCentavos: 350 },
    ]);
    expect(v2.cashbackGeradoCentavos).toBe(23); // 3,5% de R$ 6,50
    const conta = await bruno.contaDoCliente(maria.id);
    expect(conta.fidelidade).toMatchObject({ saldoCentavos: 23, vencendoCentavos: 0, vencidoCentavos: 0, cupom: null, sumido: false });
    const linhas = conta.extrato.filter((l) => l.tipo === 'cashback').map((l) => `${l.movimento} ${l.detalhe} ${l.sinal}${l.valorCentavos}`);
    expect(linhas).toEqual(['Cashback ganho Compra #00002 • usar até 21/12/2026 +23', 'Cashback usado Na compra #00002 −350', 'Cashback ganho Compra #00001 • usar até 21/12/2026 +350']);
    // o cashback não entra em conta nenhuma do financeiro (é desconto da loja)
    expect((await ana.listarLancamentos()).filter((l) => l.vendaId === v2.id).map((l) => [l.conta, l.valorCentavos])).toEqual([['banco', 650]]);

    // o servidor confere o saldo e o cliente
    expect(txt((await erro(vender(bruno, 1, { pagamentos: [{ forma: 'cashback', valorCentavos: 100 }, { forma: 'pix', valorCentavos: 900 }] }))).message)).toBe(
      'O cashback disponível de Maria Souza é R$ 0,23.',
    );
    const sem = await erro(bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 1 }], pagamentos: [{ forma: 'cashback', valorCentavos: 23 }, { forma: 'pix', valorCentavos: 977 }] }));
    expect(sem.message).toBe(MENSAGEM_CASHBACK_SEM_CLIENTE);
  });

  it('fiado não gera cashback; cadastro com cashback aparece no filtro "Com cashback"', async () => {
    const { ana, bruno, maria, vender } = await loja();
    await ana.atualizarCliente(maria.id, { ...MARIA, cpf: '', limiteFiadoCentavos: 50_000 });
    const v = await vender(bruno, 2, { pagamentos: [{ forma: 'fiado', valorCentavos: 2000 }] });
    expect(v.cashbackGeradoCentavos).toBeUndefined();
    expect((await bruno.listarContasDeClientes({ filtro: 'cashback' })).total).toBe(0);
    await vender(bruno, 1);
    expect((await bruno.listarContasDeClientes({ filtro: 'cashback' })).clientes.map((c) => [c.nome, c.cashbackCentavos])).toEqual([['Maria Souza', 35]]);
  });
});

describe('devolução e cancelamento (DEV-07)', () => {
  it('a devolução tira o cashback na proporção; a que completa a venda leva o resto', async () => {
    const { ana, maria, vender, historico, mudar } = await loja();
    const v = await vender(ana, 10);
    const r1 = await ana.devolverItens(v.id, { itens: [{ linha: 0, quantidade: 4 }], motivo: 'troca' });
    expect(r1.venda.cashbackRetiradoCentavos).toBe(140);
    expect((await ana.contaDoCliente(maria.id)).fidelidade.saldoCentavos).toBe(210);
    mudar('2026-11-20T15:10:00Z');
    const r2 = await ana.devolverItens(v.id, { itens: [{ linha: 0, quantidade: 6 }], motivo: 'troca' });
    expect(r2.venda.cashbackRetiradoCentavos).toBe(350);
    const conta = await ana.contaDoCliente(maria.id);
    expect(conta.fidelidade.saldoCentavos).toBe(0);
    expect(conta.extrato.filter((l) => l.movimento === 'Cashback retirado').map((l) => `${l.detalhe} ${l.valorCentavos}`)).toEqual([
      'Devolução nº 2 da compra #00001 210',
      'Devolução nº 1 da compra #00001 140',
    ]);
    expect((await historico()).some(([t]) => t === 'Cashback não recuperado')).toBe(false);
  });

  it('cancelamento: o cashback usado volta como lote novo e o gerado sai; o que já foi usado fica "não recuperado"', async () => {
    const { ana, maria, vender, historico } = await loja();
    await vender(ana, 2); // gera R$ 0,70
    const v = await vender(ana, 1, { pagamentos: [{ forma: 'cashback', valorCentavos: 70 }, { forma: 'pix', valorCentavos: 930 }] }); // gera R$ 0,33
    expect((await ana.contaDoCliente(maria.id)).fidelidade.saldoCentavos).toBe(33);
    const cancelada = await ana.cancelarVenda(v.id, { motivo: 'desistiu' });
    expect(cancelada.cashbackRetiradoCentavos).toBe(33);
    const conta = await ana.contaDoCliente(maria.id);
    expect(conta.fidelidade.saldoCentavos).toBe(70);
    expect(conta.extrato.find((l) => l.movimento === 'Cashback devolvido')).toMatchObject({ detalhe: 'Cancelamento • venda #00002 • usar até 21/12/2026', valorCentavos: 70 });

    // a cliente usou o cashback de uma compra e depois devolveu essa compra: o que já tinha sido usado não volta
    const v3 = await vender(ana, 4); // gera R$ 1,40 (saldo R$ 2,10)
    await vender(ana, 1, { pagamentos: [{ forma: 'cashback', valorCentavos: 210 }, { forma: 'pix', valorCentavos: 790 }] }); // gera R$ 0,28
    await ana.devolverItens(v3.id, { itens: [{ linha: 0, quantidade: 4 }], motivo: 'defeito' });
    expect((await ana.contaDoCliente(maria.id)).fidelidade.saldoCentavos).toBe(0); // tirou R$ 0,28 do outro lote
    expect((await historico()).find(([t]) => t === 'Cashback não recuperado')).toEqual([
      'Cashback não recuperado',
      'Devolução • venda nº 00003 • R$ 1,12 do cashback desta compra já tinham sido usados ou venceram',
    ]);
  });
});

describe('cupom de retorno e lembretes (CLI-11, 13 e 14)', () => {
  it('quem sumiu entra na lista; a mensagem do WhatsApp dá o cupom; a venda aplica; cancelar devolve o cupom', async () => {
    const { ana, bruno, maria, petisco, vender, historico, mudar } = await loja();
    mudar('2026-10-10T15:00:00Z');
    await vender(ana, 1);
    mudar('2026-11-20T15:00:00Z');
    const lista = await bruno.listarRetorno();
    expect(lista.retorno).toEqual([
      { clienteId: maria.id, nome: 'Maria Souza', telefone: '41999998888', bloqueio: null, diasSemComprar: 41, ultimaCompraDia: '2026-10-10', ultimaCompraItens: 'Petisco', cashbackCentavos: 0 },
    ]);
    const m = await bruno.mensagemParaCliente(maria.id, 'retorno');
    expect(m.texto).toBe(
      'Olá, Maria! Aqui é da Minha loja. Faz 41 dias desde a sua última compra e sentimos sua falta. Separamos 5% de desconto para você, válido até 27/11/2026. É só informar seu CPF no caixa.',
    );
    expect(m.cupom).toEqual({ pct: 5, venceEm: '2026-11-27' });

    const r = await bruno.registrarContato(maria.id, { tipo: 'retorno', canal: 'whatsapp' });
    expect(r.cupom).toMatchObject({ pct: 5, venceEm: '2026-11-27', uso: null });
    expect((await bruno.listarRetorno()).fora).toEqual([{ clienteId: maria.id, nome: 'Maria Souza', motivo: 'Já lembrado em 20/11/2026 (cupom até 27/11/2026)' }]);
    const [f6] = await bruno.buscarClientesParaVenda('maria');
    expect(f6!.cupom).toEqual({ id: r.cupom!.id, pct: 5, venceEm: '2026-11-27' });

    // a venda leva o cupom nos itens: o preço sai da regra (R$ 9,50), nunca da tela
    const v = await bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 2, cupom: r.cupom!.id }], pagamentos: [{ forma: 'pix', valorCentavos: 1900 }], clienteId: maria.id });
    expect(v.itens[0]).toMatchObject({ precoCentavos: 950, desconto: { motivo: 'Cupom de retorno 5%', responsavel: { id: 'bruno' }, cupom: { id: r.cupom!.id, pct: 5 } } });
    expect(v.cupomId).toBe(r.cupom!.id);
    expect((await bruno.buscarClientesParaVenda('maria'))[0]!.cupom).toBeNull();
    const res = (await bruno.listarRetorno()).resultado;
    expect([res.enviados, res.voltaram, res.taxaPct, res.linhas[0]!.situacao, res.linhas[0]!.voltou]).toEqual([1, 1, 100, 'voltou', { dia: '2026-11-20', vendaNumero: 2 }]);
    // cupom usado não vale de novo
    const de_novo = await erro(bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 1, cupom: r.cupom!.id }], pagamentos: [{ forma: 'pix', valorCentavos: 950 }], clienteId: maria.id }));
    expect(de_novo.message).toBe('O cupom de retorno de Petisco não vale para esta venda. Identifique o cliente de novo.');
    // cancelar a venda devolve o cupom (até a validade)
    await ana.cancelarVenda(v.id, { motivo: 'desistiu' });
    expect((await bruno.buscarClientesParaVenda('maria'))[0]!.cupom).toEqual({ id: r.cupom!.id, pct: 5, venceEm: '2026-11-27' });
    expect((await historico()).filter(([t]) => t === 'Lembrete de retorno' || t === 'Cupom de retorno usado')).toEqual([
      ['Cupom de retorno usado', '5% • na venda nº 00002'],
      ['Lembrete de retorno', 'Mensagem pelo WhatsApp • cupom de 5% até 27/11/2026'],
    ]);
  });

  it('sem autorização não vai pelo WhatsApp ("Já falei" vale); o lembrete de pagamento é do Dono e do Administrador', async () => {
    const { ana, bruno } = await loja();
    const joao = await ana.cadastrarCliente(JOAO);
    expect((await bruno.mensagemParaCliente(joao.id, 'retorno')).bloqueio).toBe('O cliente não autorizou mensagens da loja pelo WhatsApp.');
    expect((await erro(bruno.registrarContato(joao.id, { tipo: 'retorno', canal: 'whatsapp' }))).message).toBe('O cliente não autorizou mensagens da loja pelo WhatsApp.');
    const falei = await bruno.registrarContato(joao.id, { tipo: 'retorno', canal: 'outro' });
    expect([falei.contato.canal, falei.cupom]).toEqual(['outro', null]); // "Já falei" não dá cupom
    expect((await erro(bruno.mensagemParaCliente(joao.id, 'cobranca'))).status).toBe(403);
    expect((await erro(bruno.registrarContato(joao.id, { tipo: 'cobranca', canal: 'outro' }))).status).toBe(403);
    const cobranca = await ana.mensagemParaCliente(joao.id, 'cobranca');
    expect(cobranca.bloqueio).toBeNull(); // o lembrete de pagamento só pede o WhatsApp
    expect(txt(cobranca.texto)).toMatch(/^Olá, João, tudo bem\? Aqui é da Minha loja\. Passando para lembrar que há R\$ 0,00 em aberto/);
  });

  it('"Adiar 7 dias" e "Não incomodar" tiram da lista; fica no histórico', async () => {
    const { ana, bruno, maria, vender, historico, mudar } = await loja();
    mudar('2026-10-10T15:00:00Z');
    await vender(ana, 1);
    mudar('2026-11-20T15:00:00Z');
    expect(await bruno.adiarLembrete(maria.id)).toEqual({ ate: '2026-11-27' });
    let lista = await bruno.listarRetorno();
    expect([lista.retorno.length, lista.fora]).toEqual([0, [{ clienteId: maria.id, nome: 'Maria Souza', motivo: 'Adiado até 27/11/2026' }]]);
    mudar('2026-11-28T15:00:00Z');
    expect((await bruno.listarRetorno()).retorno.map((x) => x.nome)).toEqual(['Maria Souza']);
    await bruno.marcarNaoIncomodar(maria.id);
    lista = await bruno.listarRetorno();
    expect(lista.fora).toEqual([{ clienteId: maria.id, nome: 'Maria Souza', motivo: 'Pediu para não receber lembretes' }]);
    expect((await historico()).slice(0, 2)).toEqual([
      ['Não incomodar', 'saiu das listas de lembrete'],
      ['Lembrete adiado', 'volta para a lista em 27/11/2026'],
    ]);
  });

  it('cashback vencendo entra na lista e no resumo "de onde vem"', async () => {
    const { ana, bruno, maria, vender, mudar } = await loja();
    mudar('2026-10-26T15:00:00Z');
    await vender(ana, 1); // R$ 0,35, vence em 26/11
    mudar('2026-11-20T15:00:00Z');
    const lista = await bruno.listarRetorno();
    expect(lista.cashback).toEqual([{ clienteId: maria.id, nome: 'Maria Souza', telefone: '41999998888', bloqueio: null, venceEm: '2026-11-26', valorCentavos: 35 }]);
    expect(txt((await bruno.mensagemParaCliente(maria.id, 'cashback')).texto)).toBe(
      'Olá, Maria! Aqui é da Minha loja. Você tem R$ 0,35 de cashback para usar até 26/11/2026. Aproveite na sua próxima compra!',
    );
    const resumo = await bruno.resumoDoCashback();
    expect(resumo).toMatchObject({ abertoCentavos: 35, clientesComSaldo: 1, vencendoCentavos: 35, geradoCentavos: 35, usadoCentavos: 0, vencidoCentavos: 0 });
    expect(resumo.vencendo).toEqual([{ clienteId: maria.id, nome: 'Maria Souza', dia: '2026-10-26', origem: 'Compra #00001', valorCentavos: 35, venceEm: '2026-11-26' }]);
    await bruno.registrarContato(maria.id, { tipo: 'cashback', canal: 'whatsapp' });
    expect((await bruno.listarRetorno()).fora).toEqual([{ clienteId: maria.id, nome: 'Maria Souza', motivo: 'Cashback já avisado em 20/11/2026' }]);
  });
});

describe('LGPD e exemplos', () => {
  it('a exclusão dos dados zera o cashback que sobrou', async () => {
    const { ana, maria, vender } = await loja();
    await vender(ana, 10);
    const { autorizacao } = await ana.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'excluir_dados_cliente', clienteId: maria.id } });
    await ana.excluirDadosDoCliente(maria.id, { liberacao: { autorizacao, motivo: 'pedido do cliente' } });
    expect((await ana.resumoDoCashback()).abertoCentavos).toBe(0);
    expect((await ana.listarRetorno()).retorno).toEqual([]);
  });

  it('a loja de exemplo já começa com o cashback das vendas de exemplo', async () => {
    const api = criarApiLocal({ lojaId: 'loja-a', operador: ANA, atrasoMs: 0, agora: () => new Date('2026-11-20T15:00:00Z') });
    const [maria] = await api.buscarClientesParaVenda('maria');
    expect(maria!.cashbackCentavos).toBe(882); // 3,5% de R$ 189,90 (crédito) + 3,5% de R$ 61,90 (dinheiro e Pix)
    const [joao] = await api.buscarClientesParaVenda('joão');
    expect(joao!.cashbackCentavos).toBe(559); // 3,5% de R$ 159,80 (débito)
  });
});
