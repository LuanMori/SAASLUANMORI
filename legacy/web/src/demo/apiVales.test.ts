// apps/web/src/demo/apiVales.test.ts — vale-troca na demonstração (Fase 2, módulo 8), regras do DaniPets V9.3.3:
// devolução como vale (com o fiado em aberto abatido antes), uso na venda (com ou sem cliente), volta no
// cancelamento e na devolução, cliente do vale, busca pelo código, conta, extrato e LGPD.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { criarApiLocal } from './apiLocal';

const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const txt = (t: string) => t.replace(/ /g, ' ');
const MARIA = { nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' };
const JOAO = { nome: 'João Pereira', telefone: '41988887777', cpf: '11144477735' };
const CODIGO = /^VT-\d{4}-[A-HJ-NP-Z2-9]{3}$/;

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
  const opcoes = { lojaId: 'vale', exemplos: false, atrasoMs: 0, agora: () => new Date('2026-11-20T15:00:00Z') };
  const ana = comCaixaAberto(criarApiLocal({ ...opcoes, operador: ANA }));
  const bruno = comCaixaAberto(criarApiLocal({ ...opcoes, operador: BRUNO }));
  const petisco = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('vale', 50);
  const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 50_000 });
  /** Venda de `n` petiscos (R$ 10,00 cada); `pagamentos` padrão: tudo no Pix. */
  const vender = (api: typeof ana, n: number, extra: Record<string, unknown> = {}) =>
    api.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: n }], pagamentos: [{ forma: 'pix', valorCentavos: n * 1000 }], ...extra });
  /** Devolve `n` petiscos da venda como vale-troca (a Dona não precisa de autorização). */
  const valeDe = async (vendaId: string, n: number, extra: Record<string, unknown> = {}) => {
    const r = await ana.devolverItens(vendaId, { itens: [{ linha: 0, quantidade: n }], motivo: 'troca', modo: 'vale', ...extra });
    return r;
  };
  const historico = async () => (await ana.listarAuditoria()).map((h) => [h.texto, txt(h.resumo ?? '')]);
  return { ana, bruno, petisco, maria, vender, valeDe, historico };
}

describe('devolução como vale-troca (DEV-03)', () => {
  it('o valor vira vale com código, no nome do cliente da venda; nada sai do caixa nem do banco', async () => {
    const { ana, maria, vender, valeDe, historico } = await loja();
    const v = await vender(ana, 10, { clienteId: maria.id });
    const antes = await ana.listarLancamentos();
    const r = await valeDe(v.id, 4);
    expect(r.vale).toMatchObject({ numero: 1, valorCentavos: 4000, saldoCentavos: 4000, situacao: 'aberto', cliente: { id: maria.id, nome: 'Maria Souza' }, origem: { vendaId: v.id, vendaNumero: 1, devolucaoNumero: 1 } });
    expect(r.vale!.codigo).toMatch(CODIGO);
    expect(r.devolucao).toMatchObject({ totalCentavos: 4000, estornos: [], vale: { id: r.vale!.id, codigo: r.vale!.codigo, valorCentavos: 4000 } });
    expect((await ana.listarLancamentos()).length).toBe(antes.length); // nenhum estorno no Pix
    expect(r.venda.cashbackRetiradoCentavos).toBe(140); // o cashback da compra sai na proporção, como na devolução comum
    expect((await historico()).find(([t]) => t === 'Vale-troca emitido')).toEqual(['Vale-troca emitido', `${r.vale!.codigo} • R$ 40,00 • devolução da venda nº 00001`]);

    // a busca do F6, a conta e o extrato mostram o vale
    expect((await ana.buscarClientesParaVenda('maria'))[0]!.valeCentavos).toBe(4000);
    const conta = await ana.contaDoCliente(maria.id);
    expect(conta.vale).toEqual({ saldoCentavos: 4000, abertos: [{ codigo: r.vale!.codigo, saldoCentavos: 4000 }] });
    expect(conta.extrato.find((l) => l.tipo === 'vale')).toMatchObject({ movimento: `Vale-troca ${r.vale!.codigo}`, detalhe: 'Devolução nº 1 • compra #00001', valorCentavos: 4000, sinal: '+' });
    expect((await ana.listarContasDeClientes({ filtro: 'vale' })).clientes.map((c) => [c.nome, c.valeCentavos])).toEqual([['Maria Souza', 4000]]);
  });

  it('o fiado em aberto da venda é abatido antes; só o resto vira vale', async () => {
    const { ana, maria, vender, valeDe } = await loja();
    const v = await vender(ana, 5, { clienteId: maria.id, pagamentos: [{ forma: 'pix', valorCentavos: 2000 }, { forma: 'fiado', valorCentavos: 3000 }] });
    const r = await valeDe(v.id, 4);
    expect(r.devolucao.estornos).toEqual([{ forma: 'fiado', valorCentavos: 3000 }]);
    expect(r.vale?.valorCentavos).toBe(1000);
    expect((await ana.contaDoCliente(maria.id)).fiado.devendoCentavos).toBe(0);
    // tudo coberto pelo fiado em aberto: não emite vale
    const v2 = await vender(ana, 3, { clienteId: maria.id, pagamentos: [{ forma: 'fiado', valorCentavos: 3000 }] });
    const r2 = await valeDe(v2.id, 2);
    expect([r2.vale, r2.devolucao.estornos, r2.devolucao.vale]).toEqual([null, [{ forma: 'fiado', valorCentavos: 2000 }], undefined]);
  });

  it('o vale pode ficar com outro cliente ou sem cliente; cliente que não existe é recusado', async () => {
    const { ana, maria, vender, valeDe } = await loja();
    const joao = await ana.cadastrarCliente(JOAO);
    const v = await vender(ana, 4, { clienteId: maria.id });
    expect((await valeDe(v.id, 1, { clienteDoVale: joao.id })).vale!.cliente).toEqual({ id: joao.id, nome: 'João Pereira' });
    expect((await erro(valeDe(v.id, 1, { clienteDoVale: 'nao-existe' }))).message).toBe('Cliente do vale não encontrado. Escolha outro ou deixe o da venda.');
    const semCliente = await vender(ana, 2);
    expect((await valeDe(semCliente.id, 1)).vale!.cliente).toBeNull();
    // o João, que nunca comprou, tem um vale: o cadastro não pode ser excluído
    expect((await erro(ana.excluirCliente(joao.id, 'duplicado'))).message).toMatch(/^Cliente com compras, fiado ou vale-troca não pode ser excluído/);
  });
});

describe('vale-troca como pagamento (PDV-09)', () => {
  it('vale para quem tem o código, com ou sem cliente; a sobra fica no vale; zerado, sai da lista', async () => {
    const { ana, bruno, maria, vender, valeDe } = await loja();
    const { vale } = await valeDe((await vender(ana, 4, { clienteId: maria.id })).id, 4); // vale de R$ 40,00
    expect((await bruno.buscarValePorCodigo(` ${vale!.codigo.toLowerCase()} `)).id).toBe(vale!.id);
    expect((await erro(bruno.buscarValePorCodigo('VT-9999-AAA'))).message).toBe('Vale não encontrado. Confira o código.');
    const v1 = await vender(bruno, 3, { pagamentos: [{ forma: 'vale', valorCentavos: 3000, valeId: vale!.id }] });
    expect(v1.pagamentos).toEqual([{ forma: 'vale', valorCentavos: 3000, valeId: vale!.id, valeCodigo: vale!.codigo }]);
    expect(v1.cashbackGeradoCentavos).toBeUndefined(); // o vale não gera cashback
    expect((await bruno.listarVales())[0]).toMatchObject({ id: vale!.id, saldoCentavos: 1000, situacao: 'aberto' });
    expect(txt((await erro(vender(bruno, 2, { pagamentos: [{ forma: 'vale', valorCentavos: 2000, valeId: vale!.id }] }))).message)).toBe(`O vale ${vale!.codigo} tem saldo de R$ 10,00.`);
    await vender(bruno, 2, { pagamentos: [{ forma: 'vale', valorCentavos: 1000, valeId: vale!.id }, { forma: 'pix', valorCentavos: 1000 }] });
    expect(await bruno.listarVales()).toEqual([]);
    expect((await bruno.listarVales({ situacao: 'todos' }))[0]).toMatchObject({ saldoCentavos: 0, situacao: 'usado' });
    expect((await erro(vender(bruno, 1, { pagamentos: [{ forma: 'vale', valorCentavos: 1000, valeId: vale!.id }] }))).message).toBe('Vale-troca inválido ou já usado. Remova o vale do pagamento.');
    // no extrato da Maria: o vale, os dois usos
    const ext = (await ana.contaDoCliente(maria.id)).extrato.filter((l) => l.tipo === 'vale').map((l) => `${l.movimento} ${l.sinal}${l.valorCentavos}`);
    expect(ext).toHaveLength(3);
    expect(ext.filter((l) => l.startsWith('Vale-troca usado'))).toEqual(['Vale-troca usado −3000', 'Vale-troca usado −1000']);
  });

  it('o cancelamento e a devolução de uma compra paga com vale devolvem o valor no mesmo vale', async () => {
    const { ana, maria, vender, valeDe } = await loja();
    const a = (await valeDe((await vender(ana, 3, { clienteId: maria.id })).id, 3)).vale!; // R$ 30,00
    const b = (await valeDe((await vender(ana, 2, { clienteId: maria.id })).id, 2)).vale!; // R$ 20,00
    const paga = await vender(ana, 5, {
      pagamentos: [
        { forma: 'vale', valorCentavos: 3000, valeId: a.id },
        { forma: 'vale', valorCentavos: 2000, valeId: b.id },
      ],
    });
    // devolve 2 itens pelas mesmas formas: volta primeiro no primeiro vale
    const d1 = await ana.devolverItens(paga.id, { itens: [{ linha: 0, quantidade: 2 }], motivo: 'troca' });
    expect(d1.devolucao.estornos).toEqual([{ forma: 'vale', valorCentavos: 2000, valeId: a.id, valeCodigo: a.codigo }]);
    // devolve mais 2: o primeiro vale só pagou R$ 30,00 (volta R$ 10,00 nele e R$ 10,00 no segundo)
    const d2 = await ana.devolverItens(paga.id, { itens: [{ linha: 0, quantidade: 2 }], motivo: 'troca' });
    expect(d2.devolucao.estornos.map((e) => [e.valeCodigo, e.valorCentavos])).toEqual([
      [a.codigo, 1000],
      [b.codigo, 1000],
    ]);
    const saldos = Object.fromEntries((await ana.listarVales()).map((v) => [v.codigo, v.saldoCentavos]));
    expect([saldos[a.codigo], saldos[b.codigo]]).toEqual([3000, 1000]);
    expect((await ana.contaDoCliente(maria.id)).extrato.filter((l) => l.movimento === 'Vale-troca devolvido')).toHaveLength(3);

    // cancelamento: tudo volta para os vales
    const outra = await vender(ana, 4, { pagamentos: [{ forma: 'vale', valorCentavos: 3000, valeId: a.id }, { forma: 'pix', valorCentavos: 1000 }] });
    const cancelada = await ana.cancelarVenda(outra.id, { motivo: 'desistiu' });
    expect(cancelada.cancelamento!.estornos).toEqual([
      { forma: 'pix', valorCentavos: 1000 },
      { forma: 'vale', valorCentavos: 3000, valeId: a.id, valeCodigo: a.codigo },
    ]);
    expect((await ana.listarVales()).find((v) => v.id === a.id)?.saldoCentavos).toBe(3000);
  });
});

describe('LGPD (CLI-08)', () => {
  it('a exclusão dos dados tira o nome do vale, que continua valendo para quem tem o código', async () => {
    const { ana, bruno, maria, vender, valeDe } = await loja();
    const { vale } = await valeDe((await vender(ana, 2, { clienteId: maria.id })).id, 2);
    const { autorizacao } = await ana.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'excluir_dados_cliente', clienteId: maria.id } });
    await ana.excluirDadosDoCliente(maria.id, { liberacao: { autorizacao, motivo: 'pedido do cliente' } });
    const depois = await bruno.buscarValePorCodigo(vale!.codigo);
    expect([depois.cliente?.nome, depois.saldoCentavos, depois.situacao]).toEqual(['Cliente removido', 2000, 'aberto']);
    const v = await vender(bruno, 2, { pagamentos: [{ forma: 'vale', valorCentavos: 2000, valeId: vale!.id }] });
    expect(v.pagamentos[0]).toMatchObject({ forma: 'vale', valeCodigo: vale!.codigo });
  });
});
