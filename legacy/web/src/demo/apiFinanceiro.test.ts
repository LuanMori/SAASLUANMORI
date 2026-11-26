// apps/web/src/demo/apiFinanceiro.test.ts — aba Financeiro (Fase 2, módulo 9; pedido do Luan de 23/11/2026):
// nomes das contas, extrato como o do banco, confirmar vários recebimentos de cartão e conta a pagar avulsa.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { criarApiLocal } from './apiLocal';

const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const CAIO = { id: 'caio', nome: 'Caio', papel: 'administrador' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const txt = (t: string | undefined) => (t ?? '').replace(/ /g, ' ');

beforeEach(() => localStorage.clear());

async function erro(p: Promise<unknown>): Promise<ErroApi> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroApi) return e;
    throw e;
  }
  throw new Error('esperava um erro');
}

/** Loja com o relógio na mão: começa em 01/11/2026, 12:00 em Brasília. */
async function loja() {
  let relogio = new Date('2026-11-01T15:00:00Z');
  const opcoes = { lojaId: 'fin', exemplos: false, atrasoMs: 0, agora: () => relogio };
  const ana = comCaixaAberto(criarApiLocal({ ...opcoes, operador: ANA }));
  const caio = comCaixaAberto(criarApiLocal({ ...opcoes, operador: CAIO }));
  const bruno = comCaixaAberto(criarApiLocal({ ...opcoes, operador: BRUNO }));
  const petisco = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 10000 });
  await darEstoque('fin', 50);
  return { ana, caio, bruno, petisco, mudar: (iso: string) => (relogio = new Date(iso)) };
}

const conta = async (api: { resumoFinanceiro(): Promise<{ contas: { id: string; saldoCentavos: number }[] }> }, id: 'caixa' | 'banco') =>
  (await api.resumoFinanceiro()).contas.find((c) => c.id === id)!.saldoCentavos;

describe('nomes das contas', () => {
  it('o Dono e o Administrador dão nome às contas; vale no resumo, no extrato, nas mensagens e no histórico', async () => {
    const { ana, caio, bruno } = await loja();
    await caio.salvarRegrasDaLoja({ financeiro: { nomesContas: { caixa: 'Gaveta', banco: 'Banco Itaú' } } });
    expect((await ana.lerConfiguracao()).regras.financeiro.nomesContas).toEqual({ caixa: 'Gaveta', banco: 'Banco Itaú' });
    expect((await ana.resumoFinanceiro()).contas.map((c) => c.nome)).toEqual(['Gaveta', 'Banco Itaú']);
    expect((await ana.extratoDaConta({ conta: 'banco', de: '2026-11-01', ate: '2026-11-30' })).nome).toBe('Banco Itaú');
    // a mensagem fala da conta pelo nome da loja (entre aspas, sem errar o artigo)
    const e = await erro(ana.lancarNoFinanceiro({ tipo: 'despesa', conta: 'caixa', valorCentavos: 5000, descricao: 'Lanche', categoria: 'Outras despesas' }));
    expect(txt(e.message)).toBe('O valor (R$ 50,00) é maior que o saldo de “Gaveta” (R$ 0,00). Confira o valor digitado.'); // sem caixa aberto: o saldo da conta
    await ana.definirSaldoInicial({ conta: 'banco', valorCentavos: 10000 });
    await ana.lancarNoFinanceiro({ tipo: 'transferencia', conta: 'banco', contaDestino: 'caixa', valorCentavos: 2000, descricao: 'Troco' });
    const linhas = await ana.listarAuditoria(5);
    expect(txt(linhas.find((l) => l.acao === 'financeiro.transferencia')!.resumo)).toBe('R$ 20,00 • Banco Itaú → Gaveta');
    expect(txt(linhas.find((l) => l.acao === 'financeiro.saldo_inicial')!.resumo)).toBe('R$ 100,00 • Banco Itaú');
    expect(linhas.find((l) => l.acao === 'loja.regras_alteradas')!.resumo).toBe('categorias de despesa e nomes das contas');
    // o Vendedor não muda
    expect((await erro(bruno.salvarRegrasDaLoja({ financeiro: { nomesContas: { caixa: 'X1', banco: 'X2' } } }))).status).toBe(403);
    // nomes iguais são recusados
    expect((await erro(ana.salvarRegrasDaLoja({ financeiro: { nomesContas: { caixa: 'Banco Itaú', banco: 'banco itaú' } } }))).message).toBe('As duas contas precisam de nomes diferentes.');
  });

  it('caixa com nome da loja: a conta paga pelo caixa fechado fala do nome na mensagem', async () => {
    const { ana } = await loja();
    await ana.salvarRegrasDaLoja({ financeiro: { nomesContas: { caixa: 'Gaveta', banco: 'Conta bancária' } } });
    const cp = await ana.cadastrarContaAPagar({ descricao: 'Energia', valorCentavos: 9000, vencimento: '2026-11-10', categoria: 'Energia e água' });
    // sem caixa aberto, o limite é o saldo da conta (zero)
    expect(txt((await erro(ana.pagarContaAPagar(cp.id, 'caixa'))).message)).toBe('O valor (R$ 90,00) é maior que o saldo de “Gaveta” (R$ 0,00).');
  });
});

describe('extrato da conta', () => {
  it('saldo anterior, cada lançamento com o saldo depois dele e o saldo final, do mais antigo para o mais novo', async () => {
    const { ana, mudar } = await loja();
    await ana.definirSaldoInicial({ conta: 'banco', valorCentavos: 100000 }); // 01/11
    mudar('2026-11-05T15:00:00Z');
    await ana.lancarNoFinanceiro({ tipo: 'entrada', conta: 'banco', valorCentavos: 5000, descricao: 'Aporte' });
    mudar('2026-11-10T15:00:00Z');
    await ana.lancarNoFinanceiro({ tipo: 'despesa', conta: 'banco', valorCentavos: 3000, descricao: 'Internet', categoria: 'Energia e água' });
    mudar('2026-11-12T15:00:00Z');
    await ana.lancarNoFinanceiro({ tipo: 'retirada', conta: 'banco', valorCentavos: 1000, descricao: 'pró-labore' });
    const x = await ana.extratoDaConta({ conta: 'banco', de: '2026-11-05', ate: '2026-11-10' });
    expect(x.saldoAnteriorCentavos).toBe(100000);
    expect(x.linhas.map((l) => [l.dia, l.lancamento.tipo, l.lancamento.valorCentavos, l.saldoCentavos])).toEqual([
      ['2026-11-05', 'entrada', 5000, 105000],
      ['2026-11-10', 'despesa', -3000, 102000],
    ]);
    expect([x.entradasCentavos, x.saidasCentavos, x.saldoFinalCentavos]).toEqual([5000, 3000, 102000]);
    expect(x.linhas[1]!.lancamento.categoria).toBe('Energia e água');
    // o mês inteiro termina no saldo de hoje
    expect((await ana.extratoDaConta({ conta: 'banco', de: '2026-11-01', ate: '2026-11-30' })).saldoFinalCentavos).toBe(await conta(ana, 'banco'));
  });

  it('período e conta conferidos; só quem vê o Financeiro', async () => {
    const { ana, bruno } = await loja();
    expect((await erro(ana.extratoDaConta({ conta: 'banco', de: '2026-11-10', ate: '2026-11-01' }))).message).toBe('A data inicial é depois da final.');
    expect((await erro(ana.extratoDaConta({ conta: 'banco', de: '2026-02-30', ate: '2026-03-01' }))).status).toBe(400);
    expect((await erro(ana.extratoDaConta({ conta: 'banco', de: '2025-01-01', ate: '2026-11-01' }))).message).toBe('Escolha um período de até um ano.');
    expect((await ana.extratoDaConta({ conta: 'banco', de: '2025-11-01', ate: '2026-11-01' })).linhas).toEqual([]); // um ano cabe
    expect((await erro(ana.extratoDaConta({ conta: 'poupanca' as 'banco', de: '2026-11-01', ate: '2026-11-01' }))).message).toBe('Escolha a conta do extrato.');
    expect((await erro(bruno.extratoDaConta({ conta: 'caixa', de: '2026-11-01', ate: '2026-11-01' }))).status).toBe(403);
  });
});

describe('a receber: confirmar vários recebimentos de cartão', () => {
  it('baixa manual: confirma os escolhidos de uma vez (tudo ou nada) e o líquido entra na conta', async () => {
    const { ana, bruno, petisco } = await loja();
    await ana.salvarTaxasCartao({ ...(await ana.lerTaxasCartao()), baixaAutomatica: false });
    expect((await ana.resumoFinanceiro()).baixaAutomatica).toBe(false);
    await bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 1 }], pagamentos: [{ forma: 'debito', valorCentavos: 10000 }] });
    await bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 2 }], pagamentos: [{ forma: 'credito', valorCentavos: 20000 }] });
    const pendentes = await ana.listarRecebiveis({ situacao: 'pendente' });
    expect(pendentes.map((r) => [r.forma, r.brutoCentavos - r.taxaCentavos])).toEqual([
      ['debito', 9850],
      ['credito', 19400],
    ]);
    const antes = await conta(ana, 'banco');
    const feitos = await ana.receberRecebiveis(
      pendentes.map((r) => r.id),
      'banco',
    );
    expect(feitos.map((r) => r.situacao)).toEqual(['recebido', 'recebido']);
    expect((await conta(ana, 'banco')) - antes).toBe(9850 + 19400);
    expect((await ana.listarAuditoria(5)).filter((l) => l.acao === 'financeiro.recebimento')).toHaveLength(2);
    // de novo: recusado, e nada muda
    expect((await erro(ana.receberRecebiveis([pendentes[0]!.id], 'banco'))).status).toBe(409);
    expect(await conta(ana, 'banco')).toBe(antes + 9850 + 19400);
    expect((await erro(ana.receberRecebiveis([], 'banco'))).status).toBe(400);
    expect((await erro(bruno.receberRecebiveis([pendentes[0]!.id], 'banco'))).status).toBe(403);
  });

  it('o fiado não entra: é recebido na conta do cliente', async () => {
    const { ana, bruno, petisco } = await loja();
    const maria = await ana.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', limiteFiadoCentavos: 100000 });
    await bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 10000 }], clienteId: maria.id });
    const [fiado] = await ana.listarRecebiveis({ situacao: 'pendente' });
    expect((await erro(ana.receberRecebiveis([fiado!.id], 'banco'))).message).toBe('O fiado é recebido na conta do cliente (Clientes → Fiado).');
  });
});

describe('conta a pagar avulsa', () => {
  it('lança, aparece no "a pagar" e, paga, vira saída com a categoria no extrato', async () => {
    const { ana, caio, mudar } = await loja();
    await ana.definirSaldoInicial({ conta: 'banco', valorCentavos: 500000 });
    const cp = await caio.cadastrarContaAPagar({ descricao: 'Aluguel de dezembro', valorCentavos: 180000, vencimento: '2026-12-10', categoria: 'Aluguel' });
    expect(cp).toMatchObject({ compraId: null, situacao: 'aberta', categoria: 'Aluguel', por: { id: 'caio' } });
    expect((await ana.resumoFinanceiro()).aPagar).toEqual({ totalCentavos: 180000, quantidade: 1, vencidasCentavos: 0, vencidas: 0 });
    expect((await ana.listarContasAPagar({ situacao: 'aberta' })).map((c) => c.descricao)).toEqual(['Aluguel de dezembro']);
    expect(txt((await ana.listarAuditoria(3)).find((l) => l.acao === 'conta_pagar.criada')!.resumo)).toBe('R$ 1.800,00 • vence 10/12/2026 • Aluguel');
    // venceu e ninguém pagou: conta como vencida
    mudar('2026-12-11T15:00:00Z');
    expect((await ana.resumoFinanceiro()).aPagar).toMatchObject({ vencidas: 1, vencidasCentavos: 180000 });
    await ana.pagarContaAPagar(cp.id, 'banco');
    const x = await ana.extratoDaConta({ conta: 'banco', de: '2026-12-11', ate: '2026-12-11' });
    expect(x.linhas.map((l) => [l.lancamento.tipo, l.lancamento.descricao, l.lancamento.categoria, l.lancamento.valorCentavos, l.saldoCentavos])).toEqual([
      ['pagamento_conta', 'Aluguel de dezembro', 'Aluguel', -180000, 320000],
    ]);
    expect((await ana.resumoFinanceiro()).aPagar.quantidade).toBe(0);
  });

  it('dados conferidos; o Vendedor não lança', async () => {
    const { ana, bruno } = await loja();
    expect((await erro(ana.cadastrarContaAPagar({ descricao: '', valorCentavos: 100, vencimento: '2026-12-10', categoria: null }))).status).toBe(400);
    expect((await erro(ana.cadastrarContaAPagar({ descricao: 'Água', valorCentavos: 0, vencimento: '2026-12-10', categoria: null }))).message).toBe('Informe um valor maior que zero.');
    expect((await erro(bruno.cadastrarContaAPagar({ descricao: 'Água', valorCentavos: 100, vencimento: '2026-12-10', categoria: null }))).status).toBe(403);
    expect(await ana.listarContasAPagar()).toEqual([]);
  });
});

describe('resumo do Financeiro', () => {
  it('diz se cada conta já tem saldo inicial e se a baixa do cartão é automática (o padrão)', async () => {
    const { ana } = await loja();
    let r = await ana.resumoFinanceiro();
    expect([r.contas.map((c) => c.temSaldoInicial), r.baixaAutomatica]).toEqual([[false, false], true]);
    await ana.definirSaldoInicial({ conta: 'caixa', valorCentavos: 5000 });
    r = await ana.resumoFinanceiro();
    expect(r.contas.map((c) => c.temSaldoInicial)).toEqual([true, false]);
  });
});
