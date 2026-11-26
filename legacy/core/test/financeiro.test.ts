// packages/core/test/financeiro.test.ts
import { describe, expect, it } from 'vitest';
import {
  taxaDoCartao,
  taxasDasVendas,
  baixaAutomaticaDoCartao,
  baixarCartaoNaHora,
  conferirSaida,
  contaNaFrase,
  extratoDaConta,
  type Lancamento,
  nomeDaConta,
  efeitosFinanceirosDaVenda,
  efeitosFinanceirosDoEstorno,
  fiadoEmAberto,
  lancamentosManuais,
  liquidoAReceber,
  type NovoLancamento,
  receberRecebivel,
  recebiveisDeCartao,
  recebiveisDeFiado,
  recebiveisVencidos,
  type Recebivel,
  resumirAReceber,
  saldosDasContas,
  somarDias,
  TAXAS_CARTAO_PADRAO,
  validarLancamentoManual,
  validarSaldoInicial,
  validarTaxasCartao,
  type Venda,
} from '../src';

const ANA = { id: 'ana', nome: 'Ana' };
const campos = (r: { ok: boolean; erros?: { campo: string }[] }) => (!r.ok && r.erros ? r.erros.map((e) => e.campo) : []);
const txt = (s: string) => s.replace(/ /g, ' ');

// venda de R$ 200,00: R$ 30 em dinheiro, R$ 50 no Pix, R$ 100 no crédito e R$ 20 no débito
const venda: Venda = {
  id: 'v1',
  numero: 12,
  criadaEm: '2026-11-16T23:30:00Z', // 20:30 do dia 16 em Brasília (dia 17 em UTC)
  vendedor: { id: 'bruno', nome: 'Bruno' },
  cliente: null,
  itens: [],
  totalCentavos: 20000,
  descontoCentavos: 0,
  pagamentos: [
    { forma: 'dinheiro', valorCentavos: 3000 },
    { forma: 'pix', valorCentavos: 5000 },
    { forma: 'debito', valorCentavos: 2000 },
    { forma: 'credito', valorCentavos: 10000 },
  ],
  recebidoDinheiroCentavos: 5000,
  trocoCentavos: 2000,
  status: 'finalizada',
  cancelamento: null,
  devolucoes: [],
};

const comId = (r: Omit<Recebivel, 'id'>, id: string): Recebivel => ({ ...r, id });

describe('cálculos básicos', () => {
  it('taxa da operadora arredondada ao centavo, sem erro de ponto flutuante', () => {
    expect(taxaDoCartao(10000, 3)).toBe(300);
    expect(taxaDoCartao(3240, 1.5)).toBe(49); // 48,6 centavos
    expect(taxaDoCartao(1000, 1.15)).toBe(12); // 11,5 -> 12
    expect(taxaDoCartao(1000, 0)).toBe(0);
  });
  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-11-16', 30)).toBe('2026-12-16');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-11-16', 0)).toBe('2026-11-16');
  });
});

describe('venda no financeiro', () => {
  const { lancamentos, recebiveis } = efeitosFinanceirosDaVenda(venda);

  it('dinheiro entra no Caixa (sem o troco) e Pix no Banco, por quem vendeu', () => {
    expect(lancamentos.map((l) => [l.conta, l.tipo, l.valorCentavos, txt(l.descricao), l.por.nome])).toEqual([
      ['caixa', 'venda', 3000, 'Venda #00012 • Dinheiro', 'Bruno'],
      ['banco', 'venda', 5000, 'Venda #00012 • Pix', 'Bruno'],
    ]);
    expect(lancamentos[0]).toMatchObject({ vendaId: 'v1', vendaNumero: 12, criadoEm: venda.criadaEm, recebivelId: null, categoria: null });
  });

  it('cartão vira "a receber" com a taxa e o prazo padrão (contados do dia da venda no fuso da loja)', () => {
    expect(recebiveis.map((r) => [r.forma, r.brutoCentavos, r.taxaCentavos, r.venceEm, r.situacao])).toEqual([
      ['debito', 2000, 30, '2026-11-17', 'pendente'],
      ['credito', 10000, 300, '2026-12-16', 'pendente'],
    ]);
  });

  it('taxas e prazos da loja', () => {
    const r = efeitosFinanceirosDaVenda(venda, { taxas: { taxaPct: { debito: 0, credito: 4.99 }, dias: { debito: 0, credito: 2 } } }).recebiveis;
    expect(r.map((x) => [x.taxaCentavos, x.venceEm])).toEqual([
      [0, '2026-11-16'],
      [499, '2026-11-18'],
    ]);
  });

  it('saldo das contas e "a receber"', () => {
    expect(saldosDasContas(lancamentos)).toEqual({ porConta: { caixa: 3000, banco: 5000 }, totalCentavos: 8000 });
    const rs = recebiveis.map((r, i) => comId(r, `r${i}`));
    expect(resumirAReceber(rs, '2026-11-16')).toEqual({ totalCentavos: 1970 + 9700, quantidade: 2, vencidosCentavos: 0, vencidos: 0 });
    expect(resumirAReceber(rs, '2026-11-17')).toMatchObject({ vencidosCentavos: 1970, vencidos: 1 });
    expect(recebiveisVencidos(rs, '2026-12-20').map((r) => r.forma)).toEqual(['debito', 'credito']);
    expect(taxasDasVendas(rs, new Set(['v1']))).toBe(330);
    expect(taxasDasVendas(rs, new Set(['outra']))).toBe(0);
  });
});

describe('fiado no financeiro', () => {
  const vendaFiado: Venda = {
    ...venda,
    id: 'v9',
    numero: 9,
    cliente: { id: 'c1', nome: 'Maria Souza' },
    totalCentavos: 8000,
    pagamentos: [
      { forma: 'dinheiro', valorCentavos: 3000 },
      { forma: 'fiado', valorCentavos: 5000 },
    ],
  };
  const [fiado] = efeitosFinanceirosDaVenda(vendaFiado).recebiveis.map((r, i) => comId(r, `f${i}`));

  it('vira "a receber" na conta do cliente, sem taxa, com prazo de 30 dias; não entra no caixa nem no banco', () => {
    const efeitos = efeitosFinanceirosDaVenda(vendaFiado);
    expect(efeitos.lancamentos.map((l) => [l.conta, l.valorCentavos])).toEqual([['caixa', 3000]]);
    expect(fiado).toMatchObject({ forma: 'fiado', cliente: { id: 'c1', nome: 'Maria Souza' }, brutoCentavos: 5000, taxaCentavos: 0, venceEm: '2026-12-16' });
    expect(efeitosFinanceirosDaVenda(vendaFiado, { prazoFiadoDias: 7 }).recebiveis[0]!.venceEm).toBe('2026-11-23');
    expect(fiadoEmAberto([fiado!], 'c1')).toBe(5000);
    expect(fiadoEmAberto([fiado!], 'outro')).toBe(0);
    // fiado não é "a receber do cartão" e não tem taxa
    expect(recebiveisDeCartao([fiado!])).toEqual([]);
    expect(recebiveisDeFiado([fiado!])).toHaveLength(1);
    expect(taxasDasVendas([fiado!], new Set(['v9']))).toBe(0);
  });

  it('devolução abate do que o cliente deve; se ele já pagou, sai da conta onde o pagamento entrou', () => {
    const r = efeitosFinanceirosDoEstorno(vendaFiado, [{ forma: 'fiado', valorCentavos: 2000 }], [fiado!], { rotulo: 'Devolução nº 1', em: 'x', por: ANA });
    expect(r.ok && r.valor.lancamentos).toEqual([]);
    expect(r.ok && fiadoEmAberto(r.valor.recebiveis, 'c1')).toBe(3000);
    const pago = receberRecebivel(fiado!, { conta: 'caixa', em: 'x', por: ANA });
    if (!pago.ok) throw new Error('falhou');
    expect(pago.valor.lancamento).toMatchObject({ conta: 'caixa', tipo: 'recebimento_fiado', valorCentavos: 5000 });
    expect(txt(pago.valor.lancamento.descricao)).toBe('Fiado • Maria Souza • venda #00009');
    const depois = efeitosFinanceirosDoEstorno(vendaFiado, [{ forma: 'fiado', valorCentavos: 2000 }], [pago.valor.recebivel], { rotulo: 'Devolução nº 1', em: 'x', por: ANA });
    expect(depois.ok && depois.valor.lancamentos.map((l) => [l.conta, l.valorCentavos])).toEqual([['caixa', -2000]]);
  });
});

describe('recebimento do cartão', () => {
  const credito = comId(efeitosFinanceirosDaVenda(venda).recebiveis[1]!, 'r1');

  it('o líquido entra na conta escolhida, com quem confirmou', () => {
    const r = receberRecebivel(credito, { conta: 'banco', em: '2026-12-16T12:00:00Z', por: ANA });
    expect(r.ok && r.valor.lancamento).toMatchObject({ conta: 'banco', tipo: 'recebimento_cartao', valorCentavos: 9700, recebivelId: 'r1', vendaNumero: 12, por: ANA });
    expect(r.ok && r.valor.recebivel).toMatchObject({ situacao: 'recebido', recebimento: { conta: 'banco', valorCentavos: 9700, por: ANA } });
    expect(r.ok && liquidoAReceber(r.valor.recebivel)).toBe(0);
  });

  it('não confirma duas vezes, nem cancelado, nem sem conta', () => {
    const ok = receberRecebivel(credito, { conta: 'banco', em: 'x', por: ANA });
    expect(ok.ok && receberRecebivel(ok.valor.recebivel, { conta: 'banco', em: 'x', por: ANA })).toMatchObject({ ok: false, erros: [{ mensagem: 'Este recebimento já foi confirmado.' }] });
    expect(receberRecebivel({ ...credito, situacao: 'cancelado' }, { conta: 'banco', em: 'x', por: ANA }).ok).toBe(false);
    expect(campos(receberRecebivel(credito, { conta: 'cofre', em: 'x', por: ANA }))).toEqual(['conta']);
  });
});

describe('estorno no financeiro (cancelamento e devolução)', () => {
  const recebiveis = efeitosFinanceirosDaVenda(venda).recebiveis.map((r, i) => comId(r, `r${i}`));
  const ctx = { rotulo: 'Cancelamento', em: '2026-11-16T23:50:00Z', por: ANA };

  it('cancelamento: dinheiro sai do Caixa, Pix do Banco e o cartão pendente é cancelado', () => {
    const r = efeitosFinanceirosDoEstorno(venda, venda.pagamentos, recebiveis, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.lancamentos.map((l) => [l.conta, l.tipo, l.valorCentavos, txt(l.descricao)])).toEqual([
      ['caixa', 'estorno_venda', -3000, 'Cancelamento • venda #00012 • Dinheiro'],
      ['banco', 'estorno_venda', -5000, 'Cancelamento • venda #00012 • Pix'],
    ]);
    expect(r.valor.recebiveis.map((x) => [x.situacao, liquidoAReceber(x), x.estornadoTaxaCentavos])).toEqual([
      ['cancelado', 0, 30],
      ['cancelado', 0, 300],
    ]);
    // não mexe nos objetos recebidos
    expect(recebiveis[0]!.situacao).toBe('pendente');
  });

  it('devolução parcial no crédito ainda pendente: abate do "a receber" com a taxa proporcional', () => {
    const r = efeitosFinanceirosDoEstorno(venda, [{ forma: 'credito', valorCentavos: 3333 }], recebiveis, { ...ctx, rotulo: 'Devolução #00001' });
    expect(r.ok && r.valor.lancamentos).toEqual([]);
    const c = r.ok ? r.valor.recebiveis[1]! : null;
    expect(c && [c.estornadoBrutoCentavos, c.estornadoTaxaCentavos, liquidoAReceber(c), c.situacao]).toEqual([3333, 100, 6667 - 200, 'pendente']);
    // o resto do crédito leva o resto da taxa (sem centavo perdido)
    const r2 = c && efeitosFinanceirosDoEstorno(venda, [{ forma: 'credito', valorCentavos: 6667 }], [c], ctx);
    expect(r2 && r2.ok && [r2.valor.recebiveis[0]!.estornadoTaxaCentavos, r2.valor.recebiveis[0]!.situacao]).toEqual([300, 'cancelado']);
  });

  it('cartão já depositado: o líquido sai da conta onde o dinheiro entrou', () => {
    const recebido = receberRecebivel(recebiveis[1]!, { conta: 'caixa', em: '2026-12-16T12:00:00Z', por: ANA });
    if (!recebido.ok) throw new Error('falhou');
    const r = efeitosFinanceirosDoEstorno(venda, [{ forma: 'credito', valorCentavos: 5000 }], [recebiveis[0]!, recebido.valor.recebivel], ctx);
    expect(r.ok && r.valor.lancamentos.map((l) => [l.conta, l.valorCentavos, l.recebivelId])).toEqual([['caixa', -4850, 'r1']]);
    expect(r.ok && r.valor.recebiveis[1]!.situacao).toBe('recebido');
  });

  it('não estorna mais do que a venda teve naquele cartão', () => {
    const r = efeitosFinanceirosDoEstorno(venda, [{ forma: 'debito', valorCentavos: 2001 }], recebiveis, ctx);
    expect(r).toMatchObject({ ok: false, erros: [{ mensagem: 'Não há valor em Cartão de débito suficiente nesta venda para estornar.' }] });
  });

  it('devolução em dinheiro não pode passar do que há no Caixa', () => {
    const r = efeitosFinanceirosDoEstorno(venda, [{ forma: 'dinheiro', valorCentavos: 3000 }], recebiveis, { ...ctx, saldoCaixaCentavos: 2500 });
    expect(r.ok).toBe(false);
    expect(!r.ok && txt(r.erros[0]!.mensagem)).toMatch(/A devolução em dinheiro \(R\$ 30,00\) é maior que o saldo do Caixa físico \(R\$ 25,00\)/);
    expect(efeitosFinanceirosDoEstorno(venda, [{ forma: 'dinheiro', valorCentavos: 3000 }], recebiveis, { ...ctx, saldoCaixaCentavos: 3000 }).ok).toBe(true);
  });
});

describe('lançamentos à mão (Dono e Administrador)', () => {
  it('valida tipo, conta, valor e descrição; recusa campo desconhecido', () => {
    expect(validarLancamentoManual({ tipo: 'despesa', conta: 'caixa', valorCentavos: 1500, descricao: ' Café  ', categoria: '' })).toEqual({
      ok: true,
      valor: { tipo: 'despesa', conta: 'caixa', contaDestino: null, valorCentavos: 1500, descricao: 'Café', categoria: 'Outras despesas' },
    });
    expect(campos(validarLancamentoManual({ tipo: 'sangria', conta: 'cofre', valorCentavos: 0, descricao: '' }))).toEqual(['tipo', 'conta', 'valorCentavos', 'descricao']);
    expect(campos(validarLancamentoManual({ tipo: 'transferencia', conta: 'caixa', contaDestino: 'caixa', valorCentavos: 1, descricao: 'x' }))).toEqual(['contaDestino']);
    expect(campos(validarLancamentoManual({ tipo: 'entrada', conta: 'caixa', contaDestino: 'banco', valorCentavos: 1, descricao: 'x' }))).toEqual(['contaDestino']);
    expect(campos(validarLancamentoManual({ tipo: 'entrada', conta: 'caixa', valorCentavos: 1, descricao: 'x', vendaId: 'v1' }))).toEqual(['vendaId']);
    expect(campos(validarLancamentoManual({ tipo: 'entrada', conta: 'caixa', valorCentavos: 1, descricao: 'x'.repeat(121) }))).toEqual(['descricao']);
    expect(campos(validarLancamentoManual({ tipo: 'entrada', conta: 'caixa', valorCentavos: 1, descricao: 'a\u0000b' }))).toEqual(['descricao']);
    expect(campos(validarLancamentoManual(null))).toEqual(['_']);
  });

  it('cada tipo vira o lançamento certo; transferência sai de uma conta e entra na outra', () => {
    const ctx = { em: 'agora', por: ANA };
    const um = (tipo: 'entrada' | 'despesa' | 'retirada') => lancamentosManuais({ tipo, conta: 'banco', contaDestino: null, valorCentavos: 100, descricao: 'x', categoria: tipo === 'despesa' ? 'Aluguel' : null }, ctx);
    expect(um('entrada').map((l) => [l.tipo, l.valorCentavos])).toEqual([['entrada', 100]]);
    expect(um('despesa').map((l) => [l.tipo, l.valorCentavos, l.categoria])).toEqual([['despesa', -100, 'Aluguel']]);
    expect(um('retirada').map((l) => [l.tipo, l.valorCentavos, l.descricao])).toEqual([['retirada', -100, 'Retirada do dono • x']]);
    const t = lancamentosManuais({ tipo: 'transferencia', conta: 'caixa', contaDestino: 'banco', valorCentavos: 700, descricao: 'depósito', categoria: null }, ctx);
    expect(t.map((l) => [l.conta, l.tipo, l.valorCentavos])).toEqual([
      ['caixa', 'transferencia_saida', -700],
      ['banco', 'transferencia_entrada', 700],
    ]);
    expect(saldosDasContas(t).totalCentavos).toBe(0);
  });

  it('saída do Caixa não passa do dinheiro que há nele; o Banco pode ficar negativo', () => {
    const saldos = saldosDasContas([{ conta: 'caixa', valorCentavos: 500 }]);
    const sai = (conta: 'caixa' | 'banco', v: number): NovoLancamento[] => [{ conta, valorCentavos: -v } as NovoLancamento];
    expect(conferirSaida(sai('caixa', 500), saldos).ok).toBe(true);
    expect(!conferirSaida(sai('caixa', 501), saldos).ok && txt((conferirSaida(sai('caixa', 501), saldos) as { erros: { mensagem: string }[] }).erros[0]!.mensagem)).toMatch(
      /R\$ 5,01.*maior que o saldo do Caixa físico \(R\$ 5,00\)/,
    );
    expect(conferirSaida(sai('banco', 99999), saldos).ok).toBe(true);
  });

  it('saldo inicial: uma vez por conta; Caixa não começa negativo', () => {
    expect(validarSaldoInicial({ conta: 'banco', valorCentavos: -5000 }, [])).toEqual({ ok: true, valor: { conta: 'banco', valorCentavos: -5000 } });
    expect(campos(validarSaldoInicial({ conta: 'caixa', valorCentavos: -1 }, []))).toEqual(['valorCentavos']);
    expect(campos(validarSaldoInicial({ conta: 'caixa', valorCentavos: 100 }, [{ conta: 'caixa', tipo: 'saldo_inicial' }]))).toEqual(['conta']);
    expect(campos(validarSaldoInicial({ conta: 'x', valorCentavos: 1.5, extra: 1 }, []))).toEqual(['extra', 'conta', 'valorCentavos']);
    expect(campos(validarSaldoInicial(7, []))).toEqual(['_']);
  });

  it('taxas do cartão: 0 a 99,99% com até 2 casas e 0 a 365 dias', () => {
    expect(validarTaxasCartao({ taxaPct: { debito: 1.15, credito: 3 }, dias: { debito: 1, credito: 30 } })).toEqual({
      ok: true,
      valor: { taxaPct: { debito: 1.15, credito: 3 }, dias: { debito: 1, credito: 30 }, baixaAutomatica: true }, // sem dizer: automática
    });
    expect(validarTaxasCartao({ taxaPct: { debito: 1, credito: 3 }, dias: { debito: 1, credito: 30 }, baixaAutomatica: false })).toMatchObject({ ok: true, valor: { baixaAutomatica: false } });
    expect(campos(validarTaxasCartao({ taxaPct: { debito: 1, credito: 3 }, dias: { debito: 1, credito: 30 }, baixaAutomatica: 'sim' }))).toEqual(['baixaAutomatica']);
    expect(campos(validarTaxasCartao({ taxaPct: { debito: 100, credito: 1.234 }, dias: { debito: -1, credito: 366 } }))).toEqual([
      'taxaPct.debito',
      'dias.debito',
      'taxaPct.credito',
      'dias.credito',
    ]);
    expect(campos(validarTaxasCartao({ taxaPct: {}, dias: {}, extra: true }))).toContain('extra');
    expect(campos(validarTaxasCartao({ taxaPct: 3 }))).toEqual(['_']);
  });
});

describe('baixa do cartão: automática (padrão) ou manual, escolha do Dono (pedido do Luan em 23/11/2026)', () => {
  it('a automática é o padrão; sem dizer, também', () => {
    expect([baixaAutomaticaDoCartao(TAXAS_CARTAO_PADRAO), baixaAutomaticaDoCartao({}), baixaAutomaticaDoCartao({ baixaAutomatica: false })]).toEqual([true, true, false]);
  });

  it('baixa na hora: o cartão vira "recebido" na Conta bancária, já sem a taxa; fiado e dinheiro não', () => {
    const r = { id: 'c1', forma: 'credito', cliente: null, vendaId: 'v1', vendaNumero: 7, criadoEm: '2026-11-23T13:00:00.000Z', venceEm: '2026-12-23', brutoCentavos: 7990, taxaCentavos: 319, estornadoBrutoCentavos: 0, estornadoTaxaCentavos: 0, situacao: 'pendente', recebimento: null } as const;
    const b = baixarCartaoNaHora({ ...r }, { em: r.criadoEm, por: { id: 'bruno', nome: 'Bruno' } });
    if (!b.ok) throw new Error('baixa');
    expect(b.valor.recebivel).toMatchObject({ situacao: 'recebido', recebimento: { conta: 'banco', valorCentavos: 7671, em: r.criadoEm } });
    expect(b.valor.lancamento).toMatchObject({ conta: 'banco', tipo: 'recebimento_cartao', valorCentavos: 7671, vendaNumero: 7 });
    // é a mesma confirmação da baixa manual
    expect(receberRecebivel({ ...r }, { conta: 'banco', em: r.criadoEm, por: { id: 'bruno', nome: 'Bruno' } })).toEqual(b);
    expect(baixarCartaoNaHora({ ...r, forma: 'fiado' }, { em: r.criadoEm, por: { id: 'b', nome: 'B' } }).ok).toBe(false);
  });
});

describe('nomes das contas e extrato (módulo 9, pedido do Luan em 23/11/2026)', () => {
  it('nome da loja no lugar do padrão; vazio volta ao padrão', () => {
    expect(nomeDaConta('banco', { banco: 'Banco Itaú' })).toBe('Banco Itaú');
    expect(nomeDaConta('banco', { banco: '  ' })).toBe('Conta bancária');
    expect(nomeDaConta('caixa', null)).toBe('Caixa físico');
  });

  it('na frase: com o nome padrão, o artigo de sempre; com o nome da loja, entre aspas e sem artigo', () => {
    expect(['em', 'de', 'para', 'artigo'].map((f) => contaNaFrase('banco', null, f as 'em'))).toEqual(['na Conta bancária', 'da Conta bancária', 'para a Conta bancária', 'a Conta bancária']);
    expect(['em', 'de', 'para', 'artigo'].map((f) => contaNaFrase('caixa', undefined, f as 'em'))).toEqual(['no Caixa físico', 'do Caixa físico', 'para o Caixa físico', 'o Caixa físico']);
    const nomes = { banco: 'Banco Itaú', caixa: 'Gaveta' };
    expect(['em', 'de', 'para', 'artigo'].map((f) => contaNaFrase('banco', nomes, f as 'em'))).toEqual(['em “Banco Itaú”', 'de “Banco Itaú”', 'para “Banco Itaú”', '“Banco Itaú”']);
    const r = conferirSaida([{ ...base('caixa', -5000) }], saldosDasContas([{ conta: 'caixa', valorCentavos: 1000 }]), null, nomes);
    expect(r.ok ? '' : txt(r.erros[0]!.mensagem)).toBe('O valor (R$ 50,00) é maior que o saldo de “Gaveta” (R$ 10,00). Confira o valor digitado.');
  });

  const l = (id: string, conta: 'caixa' | 'banco', valorCentavos: number, criadoEm: string, dia: string | null = null) =>
    ({ ...base(conta, valorCentavos), id, criadoEm, dia }) as Lancamento;

  it('extrato: saldo anterior, cada lançamento com o saldo depois dele, entradas, saídas e saldo final', () => {
    const lancs = [
      l('a', 'banco', 10000, '2026-10-30T15:00:00Z'), // antes do período
      l('b', 'banco', -2500, '2026-11-05T13:00:00Z'),
      l('c', 'caixa', 9999, '2026-11-05T13:30:00Z'), // outra conta
      l('d', 'banco', 4000, '2026-11-10T02:00:00Z'), // 23:00 de 09/11 em Brasília
      l('e', 'banco', -1000, '2026-11-20T18:00:00Z', '2026-11-03'), // compra com a data de um dia anterior
      l('f', 'banco', 700, '2026-12-01T15:00:00Z'), // depois do período
    ];
    const x = extratoDaConta(lancs, 'banco', { de: '2026-11-01', ate: '2026-11-30' }, 'America/Sao_Paulo', { banco: 'Banco Itaú' });
    expect(x.nome).toBe('Banco Itaú');
    expect(x.saldoAnteriorCentavos).toBe(10000);
    expect(x.linhas.map((y) => [y.lancamento.id, y.dia, y.saldoCentavos])).toEqual([
      ['e', '2026-11-03', 9000],
      ['b', '2026-11-05', 6500],
      ['d', '2026-11-09', 10500],
    ]);
    expect([x.entradasCentavos, x.saidasCentavos, x.saldoFinalCentavos]).toEqual([4000, 3500, 10500]);
    // período vazio: o saldo final é o anterior
    const vazio = extratoDaConta(lancs, 'banco', { de: '2026-11-21', ate: '2026-11-25' });
    expect([vazio.saldoAnteriorCentavos, vazio.linhas.length, vazio.saldoFinalCentavos, vazio.nome]).toEqual([10500, 0, 10500, 'Conta bancária']);
  });

  it('extrato: no mesmo instante, fica a ordem em que foi gravado (a transferência e o estorno não trocam de lugar)', () => {
    const lancs = [l('1', 'caixa', 500, '2026-11-05T13:00:00Z'), l('2', 'caixa', -200, '2026-11-05T13:00:00Z'), l('3', 'caixa', 100, '2026-11-05T13:00:00Z')];
    expect(extratoDaConta(lancs, 'caixa', { de: '2026-11-05', ate: '2026-11-05' }).linhas.map((y) => [y.lancamento.id, y.saldoCentavos])).toEqual([
      ['1', 500],
      ['2', 300],
      ['3', 400],
    ]);
  });
});

function base(conta: 'caixa' | 'banco', valorCentavos: number): NovoLancamento {
  return { conta, tipo: valorCentavos >= 0 ? 'entrada' : 'despesa', valorCentavos, descricao: 'teste', criadoEm: '2026-11-05T13:00:00Z', vendaId: null, vendaNumero: null, recebivelId: null, categoria: null, por: ANA };
}
