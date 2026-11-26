// apps/web/src/demo/apiCompras.test.ts — compras e contas a pagar na API da demonstração (Fase 2, módulo 4).
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { criarApiLocal } from './apiLocal';
import { comCaixaAberto } from '../testes/caixa';

const AGORA = new Date('2026-11-19T15:00:00Z'); // 12:00 em Brasília
const HOJE = '2026-11-19';
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const txt = (t: string) => t.replace(/ /g, ' ');

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
  const opcoes = { lojaId: 'compras-api', exemplos: false, atrasoMs: 0, agora: () => AGORA };
  // abre o caixa do dia sozinha antes de vender (o próprio caixa tem os testes dele)
  const ana = comCaixaAberto(criarApiLocal({ ...opcoes, operador: ANA }));
  const bruno = comCaixaAberto(criarApiLocal({ ...opcoes, operador: BRUNO }));
  const racao = await ana.criarProduto({ nome: 'Ração 15 kg', codigoBarras: null, precoCentavos: 18990 });
  const granel = await ana.criarProduto({ nome: 'Ração a granel', codigoBarras: null, precoCentavos: 1990, unidade: 'kg' });
  const sul = await ana.cadastrarFornecedor({ nome: 'Pet Sul', documento: null, telefone: null, contato: null, observacao: null });
  await ana.definirSaldoInicial({ conta: 'banco', valorCentavos: 1_000_000 });
  const saldo = async (id: string) => (await ana.listarEstoque()).find((s) => s.produtoId === id)!;
  const conta = async (c: 'caixa' | 'banco') => (await ana.resumoFinanceiro()).contas.find((x) => x.id === c)!.saldoCentavos;
  return { ana, bruno, racao, granel, sul, saldo, conta };
}

describe('registrar compra', () => {
  it('à vista: entra no estoque (un e kg), sai do banco, fica no histórico', async () => {
    const { ana, racao, granel, sul, saldo, conta } = await loja();
    const c = await ana.registrarCompra({
      fornecedorId: sul.id,
      notaFiscal: '1234',
      data: HOJE,
      itens: [
        { produtoId: racao.id, quantidade: 10, custoCentavos: 12000, validade: '2027-05-01' },
        { produtoId: granel.id, quantidade: 25000, custoCentavos: 1200 },
      ],
      pagamento: { tipo: 'avista', conta: 'banco' },
    });
    expect([c.numero, c.totalCentavos, c.fornecedor?.nome]).toEqual([1, 150000, 'Pet Sul']);
    expect((await saldo(racao.id)).saldo).toBe(10);
    expect((await saldo(granel.id)).saldo).toBe(25000);
    expect(await conta('banco')).toBe(1_000_000 - 150000);
    const [lanc] = await ana.listarLancamentos({ conta: 'banco' });
    expect(lanc).toMatchObject({ tipo: 'pagamento_compra', valorCentavos: -150000, descricao: 'Compra NF 1234 • 2 itens • Pet Sul' });
    const [h] = await ana.listarAuditoria();
    expect([h!.texto, txt(h!.resumo!)]).toEqual(['Compra registrada', 'compra nº 1 • NF 1234 • R$ 1.500,00 • à vista']);
    expect((await ana.listarCompras())[0]!.id).toBe(c.id);
  });

  it('à vista pelo Caixa físico não deixa o caixa negativo', async () => {
    const { ana, racao } = await loja();
    const e = await erro(ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 1, custoCentavos: 12000 }], pagamento: { tipo: 'avista', conta: 'caixa' } }));
    expect([e.status, txt(e.message)]).toEqual([409, 'O valor (R$ 120,00) é maior que o saldo do Caixa físico (R$ 0,00). Confira o valor digitado.']);
    expect(await ana.listarCompras()).toEqual([]);
  });

  it('a prazo vira conta a pagar; pagar sai da conta escolhida', async () => {
    const { ana, racao, conta } = await loja();
    await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 5, custoCentavos: 12000 }], pagamento: { tipo: 'aprazo', vencimento: '2026-12-19' } });
    const [cp] = await ana.listarContasAPagar();
    expect(cp).toMatchObject({ valorCentavos: 60000, vencimento: '2026-12-19', situacao: 'aberta' });
    expect(await conta('banco')).toBe(1_000_000);
    const paga = await ana.pagarContaAPagar(cp!.id, 'banco');
    expect(paga.situacao).toBe('paga');
    expect(await conta('banco')).toBe(1_000_000 - 60000);
    expect((await erro(ana.pagarContaAPagar(cp!.id, 'banco'))).message).toBe('Esta conta já foi paga.');
    expect(txt((await ana.listarAuditoria())[0]!.resumo!)).toBe('R$ 600,00 • Conta bancária');
  });

  it('nota repetida do mesmo fornecedor pergunta antes; mesmo assim registra', async () => {
    const { ana, racao, sul } = await loja();
    const pedido = { fornecedorId: sul.id, notaFiscal: '777', data: HOJE, itens: [{ produtoId: racao.id, quantidade: 1, custoCentavos: 12000 }], pagamento: { tipo: 'avista' as const, conta: 'banco' as const } };
    await ana.registrarCompra(pedido);
    const e = await erro(ana.registrarCompra(pedido));
    expect([e.status, e.codigo, e.message]).toEqual([409, 'nf_repetida', 'Já existe a NF 777 de Pet Sul (compra nº 1).']);
    await expect(ana.registrarCompra(pedido, { mesmoAssim: true })).resolves.toMatchObject({ numero: 2 });
  });

  it('custo mudou e a pessoa escolheu mudar o preço de venda na mesma gravação', async () => {
    const { ana, racao } = await loja();
    await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 1, custoCentavos: 12000 }], pagamento: { tipo: 'avista', conta: 'banco' } });
    await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 1, custoCentavos: 13000 }], pagamento: { tipo: 'avista', conta: 'banco' }, precos: { [racao.id]: 20573 } });
    expect((await ana.listarProdutos()).find((p) => p.id === racao.id)!.precoCentavos).toBe(20573);
    const preco = (await ana.listarAuditoria()).find((h) => h.acao === 'produto.preco_alterado')!;
    expect(txt(preco.resumo!)).toBe('R$ 189,90 → R$ 205,73');
  });

  it('fornecedor desativado, produto inativo e o Vendedor são recusados', async () => {
    const { ana, bruno, racao, sul } = await loja();
    await ana.definirFornecedorAtivo(sul.id, false);
    expect((await erro(ana.registrarCompra({ fornecedorId: sul.id, data: HOJE, itens: [{ produtoId: racao.id, quantidade: 1, custoCentavos: 1 }], pagamento: { tipo: 'avista', conta: 'banco' } }))).status).toBe(400);
    await ana.definirProdutoAtivo(racao.id, false);
    expect((await erro(ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 1, custoCentavos: 1 }], pagamento: { tipo: 'avista', conta: 'banco' } }))).message).toBe(
      'Item 1: produto não encontrado ou inativo.',
    );
    expect((await erro(bruno.listarCompras())).status).toBe(403);
    expect((await erro(bruno.listarContasAPagar())).status).toBe(403);
    expect((await erro(bruno.listarLotesVencendo())).status).toBe(403);
  });
});

describe('estorno de item', () => {
  it('à vista: a mercadoria sai do estoque e o dinheiro volta para o banco', async () => {
    const { ana, racao, saldo, conta } = await loja();
    const c = await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 10, custoCentavos: 12000 }], pagamento: { tipo: 'avista', conta: 'banco' } });
    const r = await ana.estornarItemDaCompra(c.id, 0, 'lançada em dobro');
    expect(r.itens[0]!.estorno).toMatchObject({ motivo: 'lançada em dobro', por: { id: 'ana' } });
    expect((await saldo(racao.id)).saldo).toBe(0);
    expect(await conta('banco')).toBe(1_000_000);
    expect((await erro(ana.estornarItemDaCompra(c.id, 0, 'de novo'))).message).toBe('Este item já foi estornado.');
  });

  it('não deixa o estoque negativo (parte já foi vendida)', async () => {
    const { ana, bruno, racao } = await loja();
    const c = await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 2, custoCentavos: 12000 }], pagamento: { tipo: 'avista', conta: 'banco' } });
    await bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 18990 }] });
    expect((await erro(ana.estornarItemDaCompra(c.id, 0, 'errada'))).message).toMatch(/deixaria o estoque de Ração 15 kg negativo \(saldo atual 1 un\)/);
  });

  it('a prazo: a conta a pagar diminui e é cancelada quando zera', async () => {
    const { ana, racao, granel } = await loja();
    const c = await ana.registrarCompra({
      data: HOJE,
      itens: [
        { produtoId: racao.id, quantidade: 1, custoCentavos: 12000 },
        { produtoId: granel.id, quantidade: 1000, custoCentavos: 1200 },
      ],
      pagamento: { tipo: 'aprazo', vencimento: '2026-12-19' },
    });
    await ana.estornarItemDaCompra(c.id, 0, 'errada');
    expect((await ana.listarContasAPagar())[0]).toMatchObject({ valorCentavos: 1200, situacao: 'aberta' });
    await ana.estornarItemDaCompra(c.id, 1, 'errada');
    expect((await ana.listarContasAPagar())[0]).toMatchObject({ valorCentavos: 0, situacao: 'cancelada' });
  });
});

describe('custo médio e lotes', () => {
  it('o custo médio entra no item vendido; o Vendedor não vê custo', async () => {
    const { ana, bruno, racao, saldo } = await loja();
    await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 5, custoCentavos: 10000 }], pagamento: { tipo: 'avista', conta: 'banco' } });
    await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 5, custoCentavos: 14000 }], pagamento: { tipo: 'avista', conta: 'banco' } });
    expect((await saldo(racao.id)).custoMedioCentavos).toBe(12000);
    expect((await bruno.listarEstoque()).find((s) => s.produtoId === racao.id)!.custoMedioCentavos).toBeUndefined();
    const v = await bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 18990 }] });
    expect(v.itens[0]!.custoCentavos).toBe(12000);
  });

  it('lote vencendo aparece; dar baixa tira o vencido do estoque e o aviso some', async () => {
    const { ana, racao, saldo } = await loja();
    await ana.registrarCompra({ data: '2026-10-01', itens: [{ produtoId: racao.id, quantidade: 4, custoCentavos: 12000, validade: '2026-11-25' }], pagamento: { tipo: 'avista', conta: 'banco' } });
    await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: racao.id, quantidade: 6, custoCentavos: 12000, validade: '2027-06-01' }], pagamento: { tipo: 'avista', conta: 'banco' } });
    const lotes = await ana.listarLotesVencendo();
    expect(lotes.map((l) => [l.item.validade, l.restante, l.vencido])).toEqual([['2026-11-25', 4, false]]);
    const c = await ana.darBaixaNoLote(lotes[0]!.compra.id, 0, { quantidade: 3, observacao: 'conferido' });
    expect(c.itens[0]!.loteBaixado).toMatchObject({ quantidade: 3, observacao: 'conferido' });
    expect((await saldo(racao.id)).saldo).toBe(7);
    expect(await ana.listarLotesVencendo()).toEqual([]);
    const [mov] = await ana.listarMovimentosEstoque({ produtoId: racao.id });
    expect(mov).toMatchObject({ tipo: 'ajuste', quantidade: -3, motivo: 'Produto vencido', observacao: 'baixa do lote de 01/10/2026 (validade 25/11/2026) • conferido' });
    expect((await erro(ana.darBaixaNoLote(lotes[0]!.compra.id, 0, { quantidade: 0 }))).message).toBe('Este lote já teve baixa.');
  });
});
