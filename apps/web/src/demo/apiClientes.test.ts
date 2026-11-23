// apps/web/src/demo/apiClientes.test.ts — clientes e fiado na demonstração (Fase 2, módulo 6), regras do DaniPets.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { criarApiLocal } from './apiLocal';

const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const CAIO = { id: 'caio', nome: 'Caio', papel: 'administrador' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const txt = (t: string) => t.replace(/ /g, ' ');
const MARIA = { nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' };

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
  const opcoes = { lojaId: 'cli', exemplos: false, atrasoMs: 0, agora: () => relogio };
  const ana = comCaixaAberto(criarApiLocal({ ...opcoes, operador: ANA }));
  const caio = comCaixaAberto(criarApiLocal({ ...opcoes, operador: CAIO }));
  const bruno = comCaixaAberto(criarApiLocal({ ...opcoes, operador: BRUNO }));
  const petisco = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('cli', 50);
  const fiado = (api: typeof ana, clienteId: string, valor: number, extra = {}) =>
    api.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: valor / 1000 }], pagamentos: [{ forma: 'fiado', valorCentavos: valor }], clienteId, ...extra });
  const historico = async () => (await ana.listarAuditoria()).map((h) => [h.texto, h.quem, txt(h.resumo ?? '')]);
  return { ana, caio, bruno, petisco, fiado, historico, opcoes, mudar: (iso: string) => (relogio = new Date(iso)) };
}

describe('cadastro completo (CLI-01)', () => {
  it('campos novos, autorização de mensagens com a data e o limite só pelo Dono ou o Administrador', async () => {
    const { ana, bruno, historico } = await loja();
    expect((await erro(bruno.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 5000 }))).message).toBe('Definir o limite de fiado do cliente: só o Dono ou o Administrador.');
    const maria = await bruno.cadastrarCliente({ ...MARIA, extra: 'Thor, cão', nascimento: '1990-05-17', endereco: 'Rua A, 10', autorizaMensagens: true });
    expect(maria).toMatchObject({ extra: 'Thor, cão', nascimento: '1990-05-17', endereco: 'Rua A, 10', whatsapp: true, limiteFiadoCentavos: 0, naoIncomodar: false, autorizaMensagens: { por: { id: 'bruno' } } });
    // sem o CPF no pedido (a tela não tem o número inteiro), fica o do cadastro
    const alterada = await bruno.atualizarCliente(maria.id, { nome: maria.nome, telefone: maria.telefone, cpf: '', observacoes: 'prefere ração light', naoIncomodar: true });
    expect(alterada).toMatchObject({ cpf: '52998224725', observacoes: 'prefere ração light', naoIncomodar: true });
    expect((await erro(bruno.atualizarCliente(maria.id, { ...MARIA, limiteFiadoCentavos: 1 }))).status).toBe(403);
    await ana.atualizarCliente(maria.id, { ...MARIA, limiteFiadoCentavos: 20000, autorizaMensagens: false });
    expect((await historico()).slice(0, 5)).toEqual([
      ['Autorização de mensagens', 'Ana', 'cancelou a autorização de mensagens'],
      ['Limite de fiado alterado', 'Ana', 'R$ 0,00 → R$ 200,00'],
      ['Não incomodar', 'Bruno', 'saiu das listas de lembrete'],
      ['Cadastro do cliente alterado', 'Bruno', 'observações'],
      ['Autorização de mensagens', 'Bruno', 'autorizou mensagens da loja'],
    ]);
  });

  it('lista da aba Clientes: sem o CPF inteiro; busca no campo extra e nos números; filtros', async () => {
    const { ana, bruno, fiado } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, extra: 'Thor, cão', limiteFiadoCentavos: 10000 });
    await ana.cadastrarCliente({ nome: 'João Pereira', telefone: '4133334444', cpf: '11144477735', naoIncomodar: true });
    await fiado(bruno, maria.id, 3000);
    const lista = await bruno.listarContasDeClientes();
    expect(lista.total).toBe(2);
    expect(JSON.stringify(lista)).not.toContain('52998224725');
    expect(lista.clientes.map((c) => [c.nome, c.extra, c.cpfMascarado, c.whatsapp, c.compras, c.fiado])).toEqual([
      ['João Pereira', null, '***.444.777-**', false, 0, null],
      ['Maria Souza', 'Thor, cão', '***.982.247-**', true, 1, null], // o Vendedor não vê o fiado de todos
    ]);
    expect((await ana.listarContasDeClientes({ termo: 'thor' })).clientes.map((c) => c.nome)).toEqual(['Maria Souza']);
    expect((await ana.listarContasDeClientes({ termo: '3333' })).clientes.map((c) => c.nome)).toEqual(['João Pereira']);
    expect((await ana.listarContasDeClientes({ filtro: 'fiado' })).clientes.map((c) => [c.nome, c.fiado?.devendoCentavos, c.fiado?.limiteCentavos])).toEqual([['Maria Souza', 3000, 10000]]);
    expect((await ana.listarContasDeClientes({ filtro: 'nao_incomodar' })).clientes.map((c) => c.nome)).toEqual(['João Pereira']);
    expect((await erro(bruno.listarContasDeClientes({ filtro: 'fiado' }))).status).toBe(403);
  });
});

describe('conta do cliente, CPF e exclusão (CLI-04, 05, 07)', () => {
  it('a conta traz o resumo, o fiado e o extrato, sem o CPF inteiro; o CPF completo só para o gestor, com histórico', async () => {
    const { ana, bruno, fiado, historico } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 10000 });
    await fiado(bruno, maria.id, 2000);
    const conta = await bruno.contaDoCliente(maria.id);
    expect(conta.cliente).not.toHaveProperty('cpf');
    expect(conta).toMatchObject({
      cliente: { cpfMascarado: '***.982.247-**' },
      resumo: { compras: 1, totalCentavos: 2000 },
      fiado: { devendoCentavos: 2000, vencidoCentavos: 0, abertos: [{ vendaNumero: 1, venceEm: '2026-12-20', abertoCentavos: 2000 }] },
      limiteFiadoCentavos: 10000,
      temHistorico: true,
    });
    expect(conta.extrato.map((l) => l.movimento)).toEqual(['Compra no fiado', 'Compra #00001']);
    expect((await erro(bruno.verCpfDoCliente(maria.id))).status).toBe(403);
    expect(await ana.verCpfDoCliente(maria.id)).toEqual({ cpf: '52998224725' });
    expect((await historico())[0]).toEqual(['CPF completo visto', 'Ana', '']);
  });

  it('só cliente sem histórico é excluído, com motivo; se foi o Vendedor, o gestor vê o aviso até "Ciente"', async () => {
    const { ana, bruno, fiado } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 10000 });
    await fiado(bruno, maria.id, 1000);
    expect((await erro(bruno.excluirCliente(maria.id, 'duplicado'))).message).toMatch(/^Cliente com compras, fiado ou vale-troca não pode ser excluído/);
    const joao = await bruno.cadastrarCliente({ nome: 'João Pereira', telefone: '4133334444', cpf: '11144477735' });
    expect((await erro(bruno.excluirCliente(joao.id, ' '))).message).toBe('Informe o motivo da exclusão.');
    await bruno.excluirCliente(joao.id, 'cadastro em duplicidade');
    expect((await ana.listarContasDeClientes()).clientes.map((c) => c.nome)).toEqual(['Maria Souza']);
    expect((await erro(bruno.listarAvisosDeClientes())).status).toBe(403);
    const [aviso] = await ana.listarAvisosDeClientes();
    expect(aviso).toMatchObject({ clienteNome: 'João Pereira', motivo: 'cadastro em duplicidade', por: { id: 'bruno' }, ciente: null });
    expect((await ana.conferirAvisoDeCliente(aviso!.id)).ciente).toMatchObject({ por: { id: 'ana' } });
    expect((await erro(ana.conferirAvisoDeCliente(aviso!.id))).message).toBe('Este aviso já foi conferido.');
  });

  it('LGPD: só o Dono, sem fiado em aberto e com a liberação de um Dono; apaga também os campos novos', async () => {
    const { ana, caio, bruno } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, extra: 'Thor', endereco: 'Rua A', limiteFiadoCentavos: 10000, autorizaMensagens: true });
    expect((await erro(caio.excluirDadosDoCliente(maria.id))).status).toBe(403);
    expect((await erro(ana.excluirDadosDoCliente(maria.id))).codigo).toBe('precisa_liberacao');
    expect((await erro(bruno.autorizar({ usuarioId: 'caio', senha: 'demo1234', acao: { tipo: 'excluir_dados_cliente', clienteId: maria.id } }))).message).toBe(
      'Excluir os dados de um cliente: só com a liberação de um Dono.',
    );
    const { autorizacao } = await ana.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'excluir_dados_cliente', clienteId: maria.id } });
    const anonimo = await ana.excluirDadosDoCliente(maria.id, { liberacao: { autorizacao, motivo: 'pedido do cliente' } });
    expect(anonimo).toMatchObject({ nome: 'Cliente removido', cpf: '', extra: null, endereco: null, limiteFiadoCentavos: 0, autorizaMensagens: null, naoIncomodar: true, dadosExcluidos: { por: { id: 'ana' }, motivo: 'pedido do cliente' } });
    expect(Object.values(localStorage).join('\n')).not.toContain('Thor');
    expect((await ana.listarContasDeClientes()).total).toBe(0);
  });
});

describe('fiado na Frente de caixa: limite e liberação do Dono (PDV-10)', () => {
  it('dentro do limite passa; acima, só com a liberação de um Dono (o Administrador não libera)', async () => {
    const { ana, caio, bruno, fiado, historico } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 5000 });
    await fiado(bruno, maria.id, 3000);
    const acima = await erro(fiado(bruno, maria.id, 3000));
    expect([acima.status, acima.codigo, txt(acima.message)]).toEqual([409, 'fiado_liberacao', 'Venda no fiado para Maria Souza: passa do limite de R$ 50,00 em R$ 10,00. Precisa da liberação de um Dono.']);
    expect((await erro(bruno.autorizar({ usuarioId: 'caio', senha: 'demo1234', acao: { tipo: 'fiado', clienteId: maria.id, valorCentavos: 3000 } }))).status).toBe(403);
    const { autorizacao } = await bruno.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'fiado', clienteId: maria.id, valorCentavos: 3000 } });
    // a liberação vale para o mesmo valor
    expect((await erro(fiado(bruno, maria.id, 4000, { liberacaoFiado: { autorizacao, motivo: 'cliente antigo' } }))).codigo).toBe('fiado_liberacao');
    const v = await fiado(bruno, maria.id, 3000, { liberacaoFiado: { autorizacao, motivo: 'cliente antigo' } });
    expect(v.fiadoLiberado).toMatchObject({ por: { id: 'ana', nome: 'Ana' }, motivo: 'cliente antigo', motivos: [expect.stringMatching(/passa do limite/)] });
    expect((await historico())[0]).toEqual(['Fiado liberado pelo Dono', 'Bruno', 'venda nº 00002 • R$ 30,00 no fiado • liberado por Ana']);
    void caio;
  });

  it('cliente sem limite e cliente com fiado vencido (regra da loja) também pedem a liberação', async () => {
    const { ana, bruno, fiado, mudar } = await loja();
    const joao = await ana.cadastrarCliente({ nome: 'João Pereira', telefone: '4133334444', cpf: '11144477735' });
    expect(txt((await erro(fiado(bruno, joao.id, 1000))).message)).toBe('Venda no fiado para João Pereira: o cliente não tem limite de fiado no cadastro. Precisa da liberação de um Dono.');
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 100000 });
    await fiado(bruno, maria.id, 1000);
    mudar('2026-12-25T15:00:00Z'); // venceu em 20/12
    expect(txt((await erro(fiado(bruno, maria.id, 1000))).message)).toBe('Venda no fiado para Maria Souza: tem R$ 10,00 vencido há 5 dias. Precisa da liberação de um Dono.');
    await ana.salvarRegrasDaLoja({ fiado: { vencidoPedeDono: false } });
    expect((await fiado(bruno, maria.id, 1000)).pagamentos).toEqual([{ forma: 'fiado', valorCentavos: 1000 }]);
  });
});

describe('receber o fiado e a aba Fiado (CLI-15, 16)', () => {
  it('abate a mais antiga; dinheiro só com o caixa aberto; Pix no banco; cartão com a taxa repassada, no banco na hora', async () => {
    const { ana, bruno, fiado, mudar, historico } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 100000 });
    await fiado(bruno, maria.id, 3000);
    mudar('2026-11-21T15:00:00Z');
    await fiado(bruno, maria.id, 2000);
    mudar('2026-11-22T15:00:00Z'); // dia novo: o caixa ainda não foi aberto
    const semCaixa = await erro(bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 4000, forma: 'dinheiro' }));
    expect([semCaixa.codigo, semCaixa.message]).toEqual(['caixa', 'Receber em dinheiro: abra o caixa de hoje (Caixa do dia) primeiro.']);
    expect(await bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 4000, forma: 'pix' })).toEqual({
      abatidas: [
        { vendaNumero: 1, valorCentavos: 3000 },
        { vendaNumero: 2, valorCentavos: 1000 },
      ],
      ficaDevendoCentavos: 1000,
      cotacao: { principalCentavos: 4000, forma: 'pix', percentual: 0, brutoCentavos: 4000, taxaCentavos: 0, liquidoCentavos: 4000, entregueCentavos: null, trocoCentavos: 0 },
    });
    expect((await ana.resumoFinanceiro()).contas.find((c) => c.id === 'banco')!.saldoCentavos).toBe(4000);
    expect((await erro(bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 1001, forma: 'pix' }))).message).toMatch(/deve R\$\s10,00/);
    // débito (1,5%): o cliente paga R$ 10,15 na maquininha e a loja recebe os R$ 10,00 no banco na hora (baixa automática)
    const pago = await bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 1000, forma: 'debito' });
    expect(pago.cotacao).toMatchObject({ brutoCentavos: 1015, taxaCentavos: 15, liquidoCentavos: 1000 });
    expect((await ana.contaDoCliente(maria.id)).fiado.devendoCentavos).toBe(0);
    const cartao = (await ana.listarRecebiveis({ situacao: 'recebido' })).find((r) => r.forma === 'debito')!;
    expect(cartao).toMatchObject({ origem: 'fiado', brutoCentavos: 1015, taxaCentavos: 15, cliente: { nome: 'Maria Souza' }, recebimento: { conta: 'banco', valorCentavos: 1000 } });
    expect((await ana.resumoFinanceiro()).contas.find((c) => c.id === 'banco')!.saldoCentavos).toBe(5000);
    expect((await ana.listarLancamentos({ conta: 'banco' })).map((l) => txt(l.descricao))).toContain('Cartão de débito • fiado de Maria Souza • cobrado R$ 10,15 • taxa R$ 0,15');
    expect((await historico())[0]).toEqual(['Fiado recebido', 'Bruno', 'R$ 10,00 • em Cartão de débito • cobrado R$ 10,15 (taxa R$ 0,15)']);
  });

  it('a aba Fiado (só gestor) lista quem deve, da conta mais vencida; soma os limites', async () => {
    const { ana, bruno, fiado, mudar } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 10000 });
    const joao = await ana.cadastrarCliente({ nome: 'João Pereira', telefone: '4133334444', cpf: '11144477735', limiteFiadoCentavos: 20000 });
    await fiado(bruno, maria.id, 1000);
    mudar('2026-11-30T15:00:00Z');
    await fiado(bruno, joao.id, 5000);
    mudar('2026-12-25T15:00:00Z');
    expect((await erro(bruno.listarFiado())).status).toBe(403);
    const r = await ana.listarFiado();
    expect(r.limitesCentavos).toBe(30000);
    expect(r.linhas.map((l) => [l.nome, l.devendoCentavos, l.vencidoCentavos, l.diasVencido, l.maisAntiga.vendaNumero])).toEqual([
      ['Maria Souza', 1000, 1000, 5, 1],
      ['João Pereira', 5000, 0, 0, 2],
    ]);
  });
});

describe('receber o fiado: vencimento, troco, taxa repassada e o mesmo pedido uma vez só (arquivo do Luan, 23/11/2026)', () => {
  async function comFiado() {
    const l = await loja();
    const maria = await l.ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 100000 });
    await l.fiado(l.bruno, maria.id, 3000); // vence 20/12
    l.mudar('2026-11-25T15:00:00Z');
    await l.fiado(l.bruno, maria.id, 2000); // vence 25/12
    return { ...l, maria };
  }

  it('dinheiro com troco: entra na gaveta só o valor da baixa; recebe só um vencimento', async () => {
    const { ana, bruno, maria } = await comFiado();
    const r = await bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 2000, forma: 'dinheiro', entregueCentavos: 5000, vencimento: '2026-12-25' });
    expect(r).toMatchObject({ abatidas: [{ vendaNumero: 2, valorCentavos: 2000 }], ficaDevendoCentavos: 3000, cotacao: { entregueCentavos: 5000, trocoCentavos: 3000 } });
    expect((await ana.contaDoCliente(maria.id)).fiado.abertos.map((a) => a.vendaNumero)).toEqual([1]); // a mais antiga ficou
    const gaveta = (await ana.lerCaixa()).aFechar!.gaveta;
    expect(gaveta.entradasCentavos).toBe(2000); // o troco não entra
    expect(txt((await erro(bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 1000, forma: 'dinheiro', entregueCentavos: 500 }))).message)).toBe('O dinheiro entregue é menor que o valor da baixa.');
    expect(txt((await erro(bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 1000, forma: 'pix', vencimento: '2026-12-25' }))).message)).toBe('Maria Souza não tem fiado em aberto com vencimento em 25/12/2026.');
    expect((await erro(bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 1000, forma: 'pix', vencimento: '2026-02-30' }))).status).toBe(400);
  });

  it('o mesmo pedido (a mesma chave) não recebe duas vezes; a chave de outro pagamento é recusada', async () => {
    const { ana, bruno, maria } = await comFiado();
    const pedido = { valorCentavos: 1000, forma: 'pix' as const, chave: 'pedido-0001' };
    const primeiro = await bruno.receberFiadoDoCliente(maria.id, pedido);
    const repetido = await bruno.receberFiadoDoCliente(maria.id, pedido);
    expect(repetido).toEqual(primeiro);
    expect((await ana.contaDoCliente(maria.id)).fiado.devendoCentavos).toBe(4000); // abateu uma vez só
    expect((await ana.resumoFinanceiro()).contas.find((c) => c.id === 'banco')!.saldoCentavos).toBe(1000);
    expect((await erro(bruno.receberFiadoDoCliente(maria.id, { ...pedido, valorCentavos: 2000 }))).message).toBe('Este pedido de recebimento já foi usado para outro pagamento.');
    expect((await erro(bruno.receberFiadoDoCliente(maria.id, { ...pedido, chave: 'x' }))).status).toBe(400);
  });

  it('a taxa mudou depois da cotação: recusa para a pessoa conferir o valor novo', async () => {
    const { ana, bruno, maria } = await comFiado();
    const taxas = await bruno.taxasParaReceberFiado();
    expect(taxas).toMatchObject({ taxaPct: { credito: 3 }, baixaAutomatica: true });
    await ana.salvarTaxasCartao({ ...(await ana.lerTaxasCartao()), taxaPct: { debito: 1.5, credito: 3.99 } });
    const e = await erro(bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 500, forma: 'credito', brutoPrevistoCentavos: 515, taxaPrevistaPct: 3 }));
    expect([e.status, e.codigo, e.message]).toEqual([409, 'taxa_mudou', 'A taxa da maquininha mudou. Confira o novo valor antes de confirmar.']);
    const ok = await bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 500, forma: 'credito', brutoPrevistoCentavos: 521, taxaPrevistaPct: 3.99 });
    expect(ok.cotacao).toMatchObject({ brutoCentavos: 521, taxaCentavos: 21, liquidoCentavos: 500 });
  });

  it('baixa manual (escolha do Dono): o cartão do fiado fica a receber da operadora, com a taxa repassada', async () => {
    const { ana, bruno, maria } = await comFiado();
    await ana.salvarTaxasCartao({ ...(await ana.lerTaxasCartao()), baixaAutomatica: false });
    await bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 3000, forma: 'credito' });
    const pendente = (await ana.listarRecebiveis({ situacao: 'pendente' })).find((r) => r.forma === 'credito')!;
    expect(pendente).toMatchObject({ origem: 'fiado', brutoCentavos: 3093, taxaCentavos: 93, venceEm: '2026-12-25' });
    expect((await ana.resumoFinanceiro()).contas.find((c) => c.id === 'banco')!.saldoCentavos).toBe(0);
  });
});

describe('pendências de clientes do card e o lembrete de um vencimento (arquivo do Luan, 23/11/2026)', () => {
  it('fiado a vencer em 7 dias (só quem vê o fiado), cashback a vencer e promoções; "não incomodar" sai das listas', async () => {
    const { ana, caio, bruno, fiado, mudar, opcoes } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 100000, autorizaMensagens: true });
    const joao = await ana.cadastrarCliente({ nome: 'João Pereira', telefone: '41988887777', cpf: '11144477735', limiteFiadoCentavos: 100000 });
    await fiado(bruno, maria.id, 3000);
    await fiado(bruno, joao.id, 2000);
    mudar('2026-12-15T15:00:00Z'); // os dois vencem em 20/12: daqui a 5 dias
    const p = await ana.pendenciasDeClientes();
    expect(p.fiado!.map((i) => [i.nome, i.venceEm, i.valorCentavos, i.referencia, i.avisado])).toEqual([
      ['João Pereira', '2026-12-20', 2000, 'fiado:2026-12-20', false],
      ['Maria Souza', '2026-12-20', 3000, 'fiado:2026-12-20', false],
    ]);
    expect((await caio.pendenciasDeClientes()).fiado).toHaveLength(2);
    expect((await bruno.pendenciasDeClientes()).fiado).toBeNull(); // o Vendedor não vê o fiado de todos
    // "não incomodar": sai da lista; a mensagem pela conta continua
    await ana.marcarNaoIncomodar(joao.id);
    expect((await ana.pendenciasDeClientes()).fiado!.map((i) => i.nome)).toEqual(['Maria Souza']);
    expect((await ana.mensagemParaCliente(joao.id, 'cobranca')).bloqueio).toBeNull();
    // o Personalizado sem a função Clientes não vê nome de cliente nenhum no card
    mudar('2026-12-31T15:00:00Z'); // mais de 30 dias sem comprar: a Maria entra nas promoções (o João pediu para não incomodar)
    expect((await ana.pendenciasDeClientes()).promocao.map((i) => i.nome)).toEqual(['Maria Souza']);
    const gil = criarApiLocal({ ...opcoes, operador: { id: 'gil', nome: 'Gil', papel: 'personalizado', permissoes: ['relatorios'] } });
    expect(await gil.pendenciasDeClientes()).toMatchObject({ fiado: null, cashback: [], promocao: [] });
    // promoções: só com o cupom de retorno ligado
    const regras = (await ana.lerConfiguracao()).regras;
    await ana.salvarRegrasDaLoja({ retorno: { ...regras.retorno, cupomPct: 0 } });
    expect((await ana.pendenciasDeClientes()).promocao).toEqual([]);
  });

  it('o lembrete de um vencimento usa a mensagem da loja com o valor e a data dele, e vale uma vez', async () => {
    const { ana, bruno, fiado, mudar } = await loja();
    const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 100000 });
    await fiado(bruno, maria.id, 3000); // vence 20/12
    mudar('2026-11-25T15:00:00Z');
    await fiado(bruno, maria.id, 2000); // vence 25/12
    mudar('2026-12-19T15:00:00Z');
    const m = await ana.mensagemParaCliente(maria.id, 'cobranca', 'fiado:2026-12-25');
    expect(txt(m.texto)).toBe(
      'Olá, Maria, tudo bem? Aqui é da Minha loja. Passando para lembrar que há R$ 20,00 em aberto na sua conta, com vencimento em 25/12/2026. Se já pagou, por favor desconsidere. Qualquer dúvida, estamos à disposição.',
    );
    expect((await erro(ana.mensagemParaCliente(maria.id, 'cobranca', 'fiado:2026-12-01'))).message).toBe('Este fiado já foi recebido ou mudou. Atualize a lista.');
    await ana.registrarContato(maria.id, { tipo: 'cobranca', canal: 'whatsapp', referencia: 'fiado:2026-12-25' });
    expect((await erro(ana.registrarContato(maria.id, { tipo: 'cobranca', canal: 'whatsapp', referencia: 'fiado:2026-12-25' }))).message).toBe('O lembrete deste vencimento já foi registrado.');
    const lista = (await ana.pendenciasDeClientes()).fiado!;
    expect(lista.map((i) => [i.venceEm, i.avisado])).toEqual([
      ['2026-12-20', false],
      ['2026-12-25', true],
    ]);
  });
});
