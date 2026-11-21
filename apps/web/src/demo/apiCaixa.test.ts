// apps/web/src/demo/apiCaixa.test.ts — Caixa do dia na demonstração (Fase 2, módulo 5), com as regras do DaniPets.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { darEstoque } from '../testes/estoque';
import { criarApiLocal } from './apiLocal';

const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const CAIO = { id: 'caio', nome: 'Caio', papel: 'administrador' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const HOJE = '2026-11-19';
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

/** Loja com um produto de R$ 10,00 com estoque; o relógio começa em 19/11/2026 às 09:00 (Brasília). */
async function loja() {
  let relogio = new Date(`${HOJE}T12:00:00Z`);
  const opcoes = { lojaId: 'caixa-api', exemplos: false, atrasoMs: 0, agora: () => relogio };
  const ana = criarApiLocal({ ...opcoes, operador: ANA });
  const caio = criarApiLocal({ ...opcoes, operador: CAIO });
  const bruno = criarApiLocal({ ...opcoes, operador: BRUNO });
  const produto = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('caixa-api', 50);
  const vender = (api: typeof ana, forma: 'dinheiro' | 'pix' = 'dinheiro', quantidade = 1) =>
    api.criarVenda({
      itens: [{ produtoId: produto.id, quantidade }],
      pagamentos: [{ forma, valorCentavos: 1000 * quantidade }],
      ...(forma === 'dinheiro' ? { recebidoDinheiroCentavos: 1000 * quantidade } : {}),
    });
  const historico = async () => (await ana.listarAuditoria()).filter((h) => h.acao.startsWith('caixa.') || h.acao === 'dia_fechado.liberado');
  return { ana, caio, bruno, produto, vender, historico, mudar: (iso: string) => (relogio = new Date(iso)) };
}

describe('abrir o caixa e vender', () => {
  it('sem caixa aberto não vende; o Vendedor abre (é o responsável) e a venda fica ligada ao caixa', async () => {
    const { ana, bruno, vender, historico } = await loja();
    expect(await bruno.lerSituacaoDoCaixa()).toEqual({ hoje: HOJE, estado: 'nao_aberto', abertoEm: null, fechadoEm: null, responsavel: null, atrasado: null, aVerificar: null });
    const semCaixa = await erro(vender(bruno));
    expect([semCaixa.status, semCaixa.codigo, semCaixa.message]).toEqual([409, 'caixa', 'Abra o caixa de hoje (Caixa do dia) antes de vender.']);

    const caixa = await bruno.abrirCaixa({ fundoCentavos: 15000, observacao: 'troco conferido' });
    expect(caixa).toMatchObject({ dia: HOJE, abertura: { fundoCentavos: 15000, observacao: 'troco conferido', por: { id: 'bruno', nome: 'Bruno' } }, fechamento: null });
    expect((await erro(ana.abrirCaixa({ fundoCentavos: 0 }))).message).toBe('O caixa de hoje já está aberto.');
    expect((await erro(ana.abrirCaixa({ fundoCentavos: -1 }))).status).toBe(409); // já aberto vem antes do valor
    expect(await bruno.lerSituacaoDoCaixa()).toMatchObject({ estado: 'aberto', responsavel: 'Bruno', abertoEm: caixa.abertura.em });

    const v = await vender(bruno);
    expect(v.caixaId).toBe(caixa.id);
    expect((await historico()).map((h) => [h.texto, h.quem, txt(h.resumo ?? '')])).toEqual([['Abertura de caixa', 'Bruno', '19/11/2026 • fundo de troco R$ 150,00']]);
  });

  it('a aba mostra o esperado na gaveta, as vendas de hoje por forma e o saldo do Caixa físico', async () => {
    const { ana, bruno, vender } = await loja();
    await ana.definirSaldoInicial({ conta: 'caixa', valorCentavos: 15000 });
    await bruno.abrirCaixa({ fundoCentavos: 15000 });
    await vender(bruno, 'dinheiro', 2);
    await vender(bruno, 'pix');
    const p = await bruno.lerCaixa();
    // o saldo das contas é do Financeiro: o Vendedor não recebe
    expect(p).toMatchObject({ estado: 'aberto', toleranciaCentavos: 1000, saldoCaixaFisicoCentavos: null, ultimoDiaFechado: null });
    expect((await ana.lerCaixa()).saldoCaixaFisicoCentavos).toBe(17000);
    expect(p.aFechar?.gaveta).toEqual({ fundoCentavos: 15000, entradasCentavos: 2000, saidasCentavos: 0, esperadoCentavos: 17000 });
    expect(p.vendasDeHoje).toMatchObject({ dinheiro: 2000, pix: 1000, debito: 0 });
    expect(p.movimentos.map((m) => [m.tipo, m.valorCentavos])).toEqual([['venda', 2000]]); // só o dinheiro, depois da abertura
  });
});

describe('sangria, retirada do dono e suprimento', () => {
  it('sangria vai para o banco; não tira mais do que o esperado na gaveta; suprimento põe', async () => {
    const { ana, bruno, vender, historico } = await loja();
    await bruno.abrirCaixa({ fundoCentavos: 5000 });
    await vender(bruno, 'dinheiro', 3); // gaveta: 50 + 30 = 80
    const demais = await erro(bruno.operarCaixa({ tipo: 'sangria', valorCentavos: 8001, descricao: 'banco' }));
    expect([demais.status, txt(demais.message)]).toEqual([
      409,
      'O valor (R$ 80,01) é maior que o dinheiro esperado na gaveta (R$ 80,00). Confira o valor digitado. Se entrou dinheiro sem registro, lance um suprimento antes.',
    ]);
    const sangria = await bruno.operarCaixa({ tipo: 'sangria', valorCentavos: 6000, descricao: 'levou ao banco' });
    expect(sangria.map((l) => [l.conta, l.tipo, l.valorCentavos])).toEqual([
      ['caixa', 'sangria', -6000],
      ['banco', 'deposito_sangria', 6000],
    ]);
    await bruno.operarCaixa({ tipo: 'suprimento', valorCentavos: 1000, descricao: 'troco' });
    expect((await bruno.lerCaixa()).aFechar?.gaveta.esperadoCentavos).toBe(3000);
    expect((await ana.resumoFinanceiro()).contas.map((c) => [c.id, c.saldoCentavos])).toEqual([
      ['caixa', 3000 - 5000], // o fundo de troco não é lançamento: sem saldo inicial, o Caixa físico fica abaixo da gaveta
      ['banco', 6000],
    ]);
    expect((await erro(bruno.operarCaixa({ tipo: 'sangria', valorCentavos: 0, descricao: 'x' }))).message).toBe('Informe o valor.');
    expect((await historico()).map((h) => [h.texto, txt(h.resumo ?? '')])).toEqual([
      ['Suprimento', 'R$ 10,00 na gaveta'],
      ['Sangria', 'R$ 60,00 da gaveta para a Conta bancária'],
      ['Abertura de caixa', '19/11/2026 • fundo de troco R$ 50,00'],
    ]);
  });

  it('retirada do dono: o Vendedor precisa da senha do Dono ou do Administrador; o gestor faz direto', async () => {
    const { ana, bruno, historico } = await loja();
    await bruno.abrirCaixa({ fundoCentavos: 10000 });
    const sem = await erro(bruno.operarCaixa({ tipo: 'retirada', valorCentavos: 3000, descricao: 'levou para casa' }));
    expect([sem.status, sem.codigo, sem.message]).toEqual([403, 'precisa_autorizacao', 'Retirada do dono: precisa da senha do Dono ou do Administrador.']);
    // a autorização vale para o mesmo valor
    const outra = await bruno.autorizar({ usuarioId: 'caio', senha: 'demo1234', acao: { tipo: 'retirada', valorCentavos: 2000 } });
    expect((await erro(bruno.operarCaixa({ tipo: 'retirada', valorCentavos: 3000, descricao: 'x', autorizacao: outra.autorizacao }))).status).toBe(403);
    const { autorizacao } = await bruno.autorizar({ usuarioId: 'caio', senha: 'demo1234', acao: { tipo: 'retirada', valorCentavos: 3000 } });
    const [l] = await bruno.operarCaixa({ tipo: 'retirada', valorCentavos: 3000, descricao: 'levou para casa', autorizacao });
    expect(l).toMatchObject({ conta: 'caixa', tipo: 'retirada', valorCentavos: -3000, por: { id: 'bruno' }, autorizadoPor: { id: 'caio', nome: 'Caio' } });
    // uso único
    expect((await erro(bruno.operarCaixa({ tipo: 'retirada', valorCentavos: 3000, descricao: 'de novo', autorizacao }))).status).toBe(403);
    await ana.operarCaixa({ tipo: 'retirada', valorCentavos: 1000, descricao: 'Dono levou' });
    expect((await historico()).slice(0, 2).map((h) => [h.texto, h.quem, txt(h.resumo ?? '')])).toEqual([
      ['Retirada do dono (gaveta)', 'Ana', 'R$ 10,00 da gaveta'],
      ['Retirada do dono (gaveta)', 'Bruno', 'R$ 30,00 da gaveta • autorizado por Caio'],
    ]);
  });

  it('sem caixa aberto não há operação de caixa', async () => {
    const { bruno } = await loja();
    expect((await erro(bruno.operarCaixa({ tipo: 'suprimento', valorCentavos: 100, descricao: 'x' }))).message).toBe('Abra o caixa de hoje primeiro.');
  });
});

describe('fechar e desfazer', () => {
  it('diferença pede justificativa; acima da tolerância o Vendedor precisa de senha; a diferença vira ajuste', async () => {
    const { ana, bruno, vender, historico } = await loja();
    await ana.definirSaldoInicial({ conta: 'caixa', valorCentavos: 10000 });
    await bruno.abrirCaixa({ fundoCentavos: 10000 });
    await vender(bruno, 'dinheiro', 2); // esperado: 120
    expect(txt((await erro(bruno.fecharCaixa({ dia: HOJE, contadoCentavos: 10500 }))).message)).toBe(
      'Há falta de R$ 15,00 na gaveta. Escreva a justificativa (por exemplo: troco errado, pagamento sem registro).',
    );
    const acima = await erro(bruno.fecharCaixa({ dia: HOJE, contadoCentavos: 10500, justificativa: 'troco errado' }));
    expect([acima.status, acima.codigo, txt(acima.message)]).toEqual([403, 'precisa_autorizacao', 'Diferença acima de R$ 10,00: o fechamento precisa da autorização do Dono ou do Administrador.']);
    const { autorizacao } = await bruno.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'fechamento', dia: HOJE, contadoCentavos: 10500 } });
    const fechado = await bruno.fecharCaixa({ dia: HOJE, contadoCentavos: 10500, justificativa: 'troco errado', autorizacao });
    expect(fechado.fechamento).toMatchObject({
      por: { id: 'bruno' },
      esperadoCentavos: 12000,
      contadoCentavos: 10500,
      diferencaCentavos: -1500,
      autorizadoPor: { id: 'ana', nome: 'Ana' },
      resumo: { vendas: { dinheiro: 2000 } },
    });
    // o Caixa físico passa a bater com o contado: 100 + 20 − 15
    expect((await ana.resumoFinanceiro()).contas[0]!.saldoCentavos).toBe(10500);
    expect((await bruno.lerSituacaoDoCaixa()).estado).toBe('fechado');
    expect((await historico())[0]).toMatchObject({ texto: 'Fechamento de caixa', quem: 'Bruno' });
    expect(txt((await historico())[0]!.resumo ?? '')).toBe('19/11/2026 • esperado R$ 120,00 • contado R$ 105,00 • falta de R$ 15,00 (ajuste no Caixa físico) • autorizado por Ana');

    // com o dia fechado: não vende, não devolve, não paga conta e não abre de novo
    expect((await erro(vender(bruno))).message).toMatch(/^O caixa de hoje já foi fechado\. Para vender hoje/);
    expect((await erro(ana.abrirCaixa({ fundoCentavos: 0 }))).message).toMatch(/^O caixa de hoje já foi fechado/);
    const v = (await ana.listarVendas())[0]!;
    expect((await erro(ana.devolverItens(v.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' }))).message).toMatch(/não é possível lançar hoje/);
    expect((await erro(ana.cancelarVenda(v.id, { motivo: 'x' }))).message).toBe('Cancelar a venda inteira só com o caixa daquela venda aberto. Use "Devolver itens".');
    expect((await erro(ana.lancarNoFinanceiro({ tipo: 'entrada', conta: 'banco', valorCentavos: 100, descricao: 'x', categoria: null }))).message).toMatch(/não é possível lançar hoje/);
  });

  it('o gestor fecha com qualquer diferença; só ele desfaz o último fechamento, e o ajuste é estornado', async () => {
    const { ana, bruno, vender, historico } = await loja();
    await ana.abrirCaixa({ fundoCentavos: 0 });
    await vender(ana, 'dinheiro', 1);
    const fechado = await ana.fecharCaixa({ dia: HOJE, contadoCentavos: 5000, justificativa: 'sobrou dinheiro sem registro' });
    expect(fechado.fechamento).toMatchObject({ diferencaCentavos: 4000, autorizadoPor: null });
    expect((await ana.resumoFinanceiro()).contas[0]!.saldoCentavos).toBe(5000);
    expect((await erro(bruno.desfazerFechamento(fechado.id, { motivo: 'errei' }))).status).toBe(403);
    expect((await erro(ana.desfazerFechamento(fechado.id, { motivo: ' ' }))).message).toBe('Informe o motivo.');
    const reaberto = await ana.desfazerFechamento(fechado.id, { motivo: 'contei errado' });
    expect(reaberto).toMatchObject({ fechamento: null, desfeitos: [{ diferencaCentavos: 4000, motivo: 'contei errado', desfeitoPor: { id: 'ana' } }] });
    expect((await ana.resumoFinanceiro()).contas[0]!.saldoCentavos).toBe(1000); // o ajuste de R$ 40,00 foi estornado
    // o dia está aberto de novo: vende e cancela
    const v = await vender(bruno);
    await ana.cancelarVenda(v.id, { motivo: 'desistiu' });
    expect((await historico()).map((h) => h.texto).slice(0, 2)).toEqual(['Fechamento desfeito', 'Fechamento de caixa']);
  });

  it('o caixa que passou da meia-noite aberto fecha sozinho (sem contagem); depois, o de hoje abre', async () => {
    const { ana, bruno, vender, mudar, historico } = await loja();
    await bruno.abrirCaixa({ fundoCentavos: 2000 });
    await vender(bruno);
    mudar('2026-11-20T11:30:00Z'); // dia seguinte, 08:30
    const s = await bruno.lerSituacaoDoCaixa();
    expect(s).toMatchObject({ hoje: '2026-11-20', estado: 'nao_aberto', atrasado: null });
    const p = await bruno.lerCaixa();
    expect(p.historico[0]!.fechamento).toMatchObject({ automatico: true, por: null, esperadoCentavos: 3000, contadoCentavos: null, ajusteCentavos: 0 });
    expect((await historico())[0]).toMatchObject({ texto: 'Fechamento automático', quem: null, resumo: '19/11/2026 • sem contagem e sem ajuste' });
    // o Dono pode desfazer o automático (com explicação) enquanto o caixa de hoje não abriu
    expect((await erro(ana.desfazerFechamento(p.historico[0]!.id, { motivo: 'conferir' }))).message).toBe('Explique por que o fechamento automático precisa ser ajustado.');
    await bruno.abrirCaixa({ fundoCentavos: 3000 });
    expect((await erro(ana.desfazerFechamento(p.historico[0]!.id, { motivo: 'conferir', explicacao: 'faltou contar' }))).message).toBe(
      'Há caixa aberto depois deste dia. Não é possível desfazer.',
    );
  });

  it('o fechamento automático fica "a verificar" para o Dono e o Administrador até alguém conferir (pedido do Luan)', async () => {
    const { ana, caio, bruno, vender, mudar, historico } = await loja();
    await bruno.abrirCaixa({ fundoCentavos: 2000 });
    await vender(bruno);
    mudar('2026-11-20T03:00:30Z'); // 00:00:30 do dia seguinte (Brasília)
    const fechou = await ana.lerSituacaoDoCaixa();
    const caixaId = (await ana.lerCaixa()).historico[0]!.id;
    expect(fechou).toMatchObject({ hoje: '2026-11-20', estado: 'nao_aberto', atrasado: null, aVerificar: [{ caixaId, dia: HOJE, esperadoCentavos: 3000 }] });
    expect((await caio.lerSituacaoDoCaixa()).aVerificar).toEqual([{ caixaId, dia: HOJE, esperadoCentavos: 3000 }]);
    expect((await bruno.lerSituacaoDoCaixa()).aVerificar).toBeNull(); // o Vendedor não confere o caixa
    expect((await erro(bruno.verificarFechamentoAutomatico(caixaId))).status).toBe(403);
    expect((await erro(ana.verificarFechamentoAutomatico(caixaId, { observacao: 'x'.repeat(301) }))).message).toBe('A observação pode ter até 300 caracteres.');
    expect((await erro(ana.verificarFechamentoAutomatico('nenhum'))).status).toBe(404);

    mudar('2026-11-20T11:15:00Z'); // 08:15
    const verificado = await caio.verificarFechamentoAutomatico(caixaId, { observacao: 'contei a gaveta: R$ 30,00, bateu' });
    expect(verificado.fechamento).toMatchObject({
      automatico: true,
      ajusteCentavos: 0,
      verificacao: { em: '2026-11-20T11:15:00.000Z', por: { id: 'caio', nome: 'Caio' }, observacao: 'contei a gaveta: R$ 30,00, bateu' },
    });
    expect((await ana.lerSituacaoDoCaixa()).aVerificar).toEqual([]);
    expect((await erro(ana.verificarFechamentoAutomatico(caixaId))).message).toBe('Este fechamento já foi verificado por Caio.');
    expect((await historico()).map((h) => [h.texto, h.quem, txt(h.resumo ?? '')]).slice(0, 2)).toEqual([
      ['Fechamento automático verificado', 'Caio', '19/11/2026 • esperado R$ 30,00 • com observação'],
      ['Fechamento automático', null, '19/11/2026 • sem contagem e sem ajuste'],
    ]);
    // o fechamento manual não se verifica
    await ana.abrirCaixa({ fundoCentavos: 3000 });
    const manual = await ana.fecharCaixa({ dia: '2026-11-20', contadoCentavos: 3000 });
    expect((await erro(ana.verificarFechamentoAutomatico(manual.id))).message).toBe('Só o fechamento automático precisa ser verificado.');
  });

  it('desfeito o automático para contar a gaveta, o dia fica aberto (não fecha sozinho de novo) e fecha com a contagem', async () => {
    const { ana, bruno, vender, mudar } = await loja();
    await bruno.abrirCaixa({ fundoCentavos: 2000 });
    await vender(bruno);
    mudar('2026-11-20T11:30:00Z'); // dia seguinte, 08:30
    const caixaId = (await ana.lerCaixa()).historico[0]!.id;
    const reaberto = await ana.desfazerFechamento(caixaId, { motivo: 'conferir a gaveta', explicacao: 'ninguém contou ontem' });
    expect(reaberto.fechamento).toBeNull();
    // ler de novo (a tela recarrega) não fecha sozinho: o dia espera a contagem
    const p = await ana.lerCaixa();
    expect(p).toMatchObject({ estado: 'nao_aberto', atrasado: { id: caixaId }, aFechar: { caixa: { id: caixaId }, gaveta: { esperadoCentavos: 3000 } } });
    expect((await ana.lerSituacaoDoCaixa()).aVerificar).toEqual([]);
    expect((await erro(bruno.abrirCaixa({ fundoCentavos: 0 }))).message).toMatch(/^Feche o caixa de 19\/11\/2026/);
    // contou R$ 25,00: falta de R$ 5,00 vira ajuste e o de hoje já pode abrir
    const fechado = await ana.fecharCaixa({ dia: HOJE, contadoCentavos: 2500, justificativa: 'troco errado' });
    expect(fechado.fechamento).toMatchObject({ automatico: false, diferencaCentavos: -500, ajusteCentavos: -500 });
    await bruno.abrirCaixa({ fundoCentavos: 2500 });
    expect((await bruno.lerSituacaoDoCaixa()).estado).toBe('aberto');
  });
});

describe('dias fechados: lançar com data de um dia já conferido só com a liberação de um Dono', () => {
  async function comOntemFechado() {
    const l = await loja();
    l.mudar('2026-11-18T12:00:00Z');
    await l.ana.abrirCaixa({ fundoCentavos: 0 });
    await l.ana.fecharCaixa({ dia: '2026-11-18', contadoCentavos: 0 });
    l.mudar(`${HOJE}T12:00:00Z`);
    await l.ana.definirSaldoInicial({ conta: 'banco', valorCentavos: 100000 });
    return l;
  }
  const compra = (produtoId: string, data: string) => ({ data, itens: [{ produtoId, quantidade: 2, custoCentavos: 500 }], pagamento: { tipo: 'avista' as const, conta: 'banco' as const } });

  it('compra com data de ontem: pede a liberação; o Administrador não libera; o Dono libera com motivo', async () => {
    const { ana, caio, produto, historico } = await comOntemFechado();
    const trava = await erro(caio.registrarCompra(compra(produto.id, '2026-11-18')));
    expect([trava.status, trava.codigo, trava.message]).toEqual([409, 'dia_fechado', 'O caixa de 18/11/2026 já foi fechado: compra de Petisco nesse dia precisa da liberação de um Dono.']);
    expect((await erro(caio.autorizar({ usuarioId: 'caio', senha: 'demo1234', acao: { tipo: 'dia_fechado', dia: '2026-11-18' } }))).message).toBe(
      'Lançamento em dia com o caixa já fechado: só com a liberação de um Dono.',
    );
    const { autorizacao } = await caio.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'dia_fechado', dia: '2026-11-18' } });
    expect((await erro(caio.registrarCompra(compra(produto.id, '2026-11-18'), { liberacao: { autorizacao, motivo: '' } }))).message).toBe('Informe o motivo da liberação.');
    const c = await caio.registrarCompra(compra(produto.id, '2026-11-18'), { liberacao: { autorizacao, motivo: 'NF chegou atrasada' } });
    expect(c.liberacao).toMatchObject({ por: { id: 'ana', nome: 'Ana' }, motivo: 'NF chegou atrasada' });
    expect((await historico())[0]).toMatchObject({ texto: 'Lançamento retroativo liberado', quem: 'Caio', resumo: 'compra • data 18/11/2026 • liberado por Ana' });
    // hoje e dias antes de qualquer fechamento não pedem nada
    await ana.registrarCompra(compra(produto.id, HOJE));
    // uso único: a mesma liberação não serve de novo
    expect((await erro(caio.registrarCompra(compra(produto.id, '2026-11-18'), { liberacao: { autorizacao, motivo: 'de novo' } }))).codigo).toBe('dia_fechado');
  });

  it('ajuste de estoque com data de ontem também pede a liberação', async () => {
    const { ana, produto } = await comOntemFechado();
    const ajuste = { produtoId: produto.id, tipo: 'ajuste' as const, quantidade: -1, motivo: 'Produto vencido', dia: '2026-11-18' };
    expect((await erro(ana.lancarMovimentoEstoque(ajuste))).message).toBe('O caixa de 18/11/2026 já foi fechado: ajuste de estoque de Petisco nesse dia precisa da liberação de um Dono.');
    const { autorizacao } = await ana.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'dia_fechado', dia: '2026-11-18' } });
    expect(await ana.lancarMovimentoEstoque(ajuste, { liberacao: { autorizacao, motivo: 'esqueci de lançar ontem' } })).toMatchObject({ saldo: 49 });
    const [m] = await ana.listarMovimentosEstoque({ produtoId: produto.id, de: '2026-11-18', ate: '2026-11-18' });
    expect(m).toMatchObject({ tipo: 'ajuste', dia: '2026-11-18', liberacao: { por: { id: 'ana' }, motivo: 'esqueci de lançar ontem' } });
    expect((await erro(ana.lancarMovimentoEstoque({ ...ajuste, dia: '2026-11-20' }))).message).toBe('Data no futuro não é permitida.');
  });
});

describe('devolução e pagamento com o caixa', () => {
  it('devolver em dinheiro só com o caixa de hoje aberto; em Pix basta o dia não estar fechado', async () => {
    const { ana, bruno, vender, mudar } = await loja();
    await bruno.abrirCaixa({ fundoCentavos: 0 });
    const emDinheiro = await vender(bruno, 'dinheiro');
    const emPix = await vender(bruno, 'pix');
    mudar('2026-11-20T12:00:00Z'); // o de ontem fecha sozinho; o de hoje ainda não abriu
    const e = await erro(ana.devolverItens(emDinheiro.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' }));
    expect([e.codigo, e.message]).toEqual(['caixa', 'Devolução em dinheiro: abra o caixa de hoje (Caixa do dia) primeiro.']);
    await ana.devolverItens(emPix.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' });
    await ana.abrirCaixa({ fundoCentavos: 500 });
    // a gaveta de hoje só tem R$ 5,00
    expect(txt((await erro(ana.devolverItens(emDinheiro.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' }))).message)).toMatch(/esperado na gaveta \(R\$ 5,00\)/);
  });

  it('pagar conta pelo Caixa físico com o caixa aberto: não passa do esperado na gaveta', async () => {
    const { ana, produto } = await loja();
    await ana.definirSaldoInicial({ conta: 'caixa', valorCentavos: 100000 });
    await ana.registrarCompra({ data: HOJE, itens: [{ produtoId: produto.id, quantidade: 10, custoCentavos: 500 }], pagamento: { tipo: 'aprazo', vencimento: '2026-12-19' } });
    const [conta] = await ana.listarContasAPagar();
    await ana.abrirCaixa({ fundoCentavos: 2000 });
    expect(txt((await erro(ana.pagarContaAPagar(conta!.id, 'caixa'))).message)).toMatch(/^O valor \(R\$ 50,00\) é maior que o dinheiro esperado na gaveta \(R\$ 20,00\)/);
    await ana.operarCaixa({ tipo: 'suprimento', valorCentavos: 3000, descricao: 'trouxe do cofre' });
    expect(await ana.pagarContaAPagar(conta!.id, 'caixa')).toMatchObject({ situacao: 'paga' });
  });
});
