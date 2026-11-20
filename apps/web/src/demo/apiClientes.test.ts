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
  return { ana, caio, bruno, petisco, fiado, historico, mudar: (iso: string) => (relogio = new Date(iso)) };
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
    expect((await erro(bruno.excluirCliente(maria.id, 'duplicado'))).message).toMatch(/^Cliente com compras ou fiado não pode ser excluído/);
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
  it('abate a mais antiga; dinheiro só com o caixa aberto; Pix no banco; cartão a receber', async () => {
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
    });
    expect((await ana.resumoFinanceiro()).contas.find((c) => c.id === 'banco')!.saldoCentavos).toBe(4000);
    expect((await erro(bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 1001, forma: 'pix' }))).message).toMatch(/deve R\$\s10,00/);
    await bruno.receberFiadoDoCliente(maria.id, { valorCentavos: 1000, forma: 'debito' });
    expect((await ana.contaDoCliente(maria.id)).fiado.devendoCentavos).toBe(0);
    const cartao = (await ana.listarRecebiveis({ situacao: 'pendente' })).find((r) => r.forma === 'debito')!;
    expect(cartao).toMatchObject({ origem: 'fiado', brutoCentavos: 1000, taxaCentavos: 15, cliente: { nome: 'Maria Souza' } });
    expect((await historico())[0]).toEqual(['Fiado recebido', 'Bruno', 'R$ 10,00 • em Cartão de débito']);
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
