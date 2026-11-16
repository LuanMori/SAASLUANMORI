// apps/web/src/demo/apiLocal.test.ts
// A venda da Frente de caixa alimenta o resto do sistema: estoque, clientes, financeiro.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { apagarDadosDemo, criarApiLocal, reporEstoqueDemo } from './apiLocal';

const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const AGORA = new Date('2026-11-16T15:00:00Z'); // 12:00 em Brasília
const txt = (t: string) => t.replace(/ /g, ' ');

beforeEach(() => localStorage.clear());

async function erro(promessa: Promise<unknown>): Promise<ErroApi> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroApi) return e;
    throw e;
  }
  throw new Error('Era para dar erro.');
}

async function loja(lojaId = 'eco') {
  let relogio = AGORA;
  const opcoes = { lojaId, exemplos: false, atrasoMs: 0, agora: () => relogio };
  const ana = criarApiLocal({ ...opcoes, operador: ANA });
  const bruno = criarApiLocal({ ...opcoes, operador: BRUNO });
  const racao = await ana.criarProduto({ nome: 'Ração 3 kg', codigoBarras: null, precoCentavos: 5000 });
  const petisco = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  return {
    ana,
    bruno,
    racao,
    petisco,
    mudar: (iso: string) => {
      relogio = new Date(iso);
    },
  };
}

const saldo = async (api: Awaited<ReturnType<typeof loja>>['ana'], produtoId: string) => (await api.listarEstoque()).find((s) => s.produtoId === produtoId)?.saldo;

describe('estoque', () => {
  it('produto novo começa sem estoque: a venda é recusada até entrar mercadoria', async () => {
    const { ana, bruno, racao } = await loja();
    expect(await saldo(ana, racao.id)).toBe(0);
    const e = await erro(bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 5000 }] }));
    expect([e.status, e.message]).toEqual([409, 'Estoque insuficiente para Ração 3 kg. Disponível: 0 un.']);

    expect(await ana.lancarMovimentoEstoque({ produtoId: racao.id, tipo: 'entrada', quantidade: 5, motivo: 'Nota 123' })).toEqual({ produtoId: racao.id, saldo: 5, minimo: null, situacao: 'ok' });
    expect((await erro(bruno.lancarMovimentoEstoque({ produtoId: racao.id, tipo: 'entrada', quantidade: 5, motivo: '' }))).status).toBe(403);
    expect((await erro(ana.lancarMovimentoEstoque({ produtoId: racao.id, tipo: 'ajuste', quantidade: -6, motivo: 'perda' }))).message).toBe(
      'O ajuste deixaria o saldo de Ração 3 kg negativo (saldo atual 5 un.).',
    );
    expect((await erro(ana.lancarMovimentoEstoque({ produtoId: 'nao-existe', tipo: 'entrada', quantidade: 1, motivo: '' }))).status).toBe(404);
    expect(await ana.definirEstoqueMinimo(racao.id, 5)).toMatchObject({ saldo: 5, minimo: 5, situacao: 'baixo' });
    expect(await ana.definirEstoqueMinimo(racao.id, null)).toMatchObject({ minimo: null, situacao: 'ok' });
    expect((await erro(bruno.definirEstoqueMinimo(racao.id, 2))).status).toBe(403);
  });

  it('venda dá baixa; cancelamento devolve tudo; devolução devolve só o que volta para a prateleira', async () => {
    const { ana, bruno, racao, petisco } = await loja();
    reporEstoqueDemo('eco', ANA, 10);
    const v = await bruno.criarVenda({
      itens: [
        { produtoId: racao.id, quantidade: 2 },
        { produtoId: petisco.id, quantidade: 3 },
      ],
      pagamentos: [{ forma: 'pix', valorCentavos: 13000 }],
    });
    expect([await saldo(ana, racao.id), await saldo(ana, petisco.id)]).toEqual([8, 7]);

    await ana.devolverItens(v.id, {
      itens: [
        { linha: 0, quantidade: 1, voltaAoEstoque: false }, // avaria: não volta
        { linha: 1, quantidade: 2 },
      ],
      motivo: 'embalagem rasgada',
    });
    expect([await saldo(ana, racao.id), await saldo(ana, petisco.id)]).toEqual([8, 9]);

    const v2 = await bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 8 }], pagamentos: [{ forma: 'pix', valorCentavos: 40000 }] });
    expect(await saldo(ana, racao.id)).toBe(0);
    await ana.cancelarVenda(v2.id, { motivo: 'cliente desistiu' });
    expect(await saldo(ana, racao.id)).toBe(8);

    const movimentos = await ana.listarMovimentosEstoque({ produtoId: racao.id });
    expect(movimentos.map((m) => [m.tipo, m.quantidade, m.vendaNumero, m.por.nome])).toEqual(
      expect.arrayContaining([
        ['entrada', 10, null, 'Ana'],
        ['venda', -2, 1, 'Bruno'],
        ['venda', -8, 2, 'Bruno'],
        ['cancelamento', 8, 2, 'Ana'],
      ]),
    );
    expect(movimentos).toHaveLength(4);
  });
});

describe('clientes', () => {
  const MARIA = { nome: 'Maria Souza', telefone: '(41) 99999-8888', cpf: '529.982.247-25' };

  it('Vendedor cadastra (CPF não repete), busca e vende para o cliente; o histórico soma as compras', async () => {
    const { ana, bruno, petisco } = await loja();
    reporEstoqueDemo('eco', ANA, 10);
    const maria = await bruno.cadastrarCliente(MARIA);
    expect(maria).toMatchObject({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', ativo: true });
    expect((await erro(ana.cadastrarCliente({ ...MARIA, nome: 'Outra' }))).message).toBe('Este CPF já está no cadastro de Maria Souza.');
    expect((await erro(ana.cadastrarCliente({ ...MARIA, cpf: '111' }))).status).toBe(400);
    expect((await bruno.listarClientes('maria')).map((c) => c.id)).toEqual([maria.id]);
    expect(await bruno.listarClientes('zzz')).toEqual([]);

    const v = await bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 2000 }], clienteId: maria.id });
    expect(v.cliente).toEqual({ id: maria.id, nome: 'Maria Souza' });
    await bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 1000 }] });
    const e = await erro(bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 1000 }], clienteId: 'sumiu' }));
    expect(e.message).toMatch(/Identifique o cliente de novo \(F6\)/);

    const h = await ana.historicoDoCliente(maria.id);
    expect(h.resumo).toMatchObject({ compras: 1, totalCentavos: 2000 });
    expect(h.vendas.map((x) => x.numero)).toEqual([1]);

    // o nome muda no cadastro, mas a venda guarda o nome da hora da venda
    const editada = await bruno.atualizarCliente(maria.id, { ...MARIA, nome: 'Maria Souza Lima' });
    expect(editada.nome).toBe('Maria Souza Lima');
    expect((await ana.listarVendas()).find((x) => x.id === v.id)?.cliente?.nome).toBe('Maria Souza');
    expect((await erro(ana.historicoDoCliente('nao-existe'))).status).toBe(404);
    expect((await erro(ana.atualizarCliente('nao-existe', MARIA))).status).toBe(404);
  });
});

describe('financeiro', () => {
  it('a venda alimenta Caixa, Banco e cartão a receber; só o Dono e o Administrador veem', async () => {
    const { ana, bruno, racao } = await loja();
    reporEstoqueDemo('eco', ANA, 10);
    await bruno.criarVenda({
      itens: [{ produtoId: racao.id, quantidade: 3 }],
      pagamentos: [
        { forma: 'dinheiro', valorCentavos: 2000 },
        { forma: 'pix', valorCentavos: 3000 },
        { forma: 'credito', valorCentavos: 10000 },
      ],
      recebidoDinheiroCentavos: 5000, // R$ 30,00 de troco: não entra no caixa
    });
    expect(await ana.resumoFinanceiro()).toEqual({
      contas: [
        { id: 'caixa', nome: 'Caixa físico', saldoCentavos: 2000 },
        { id: 'banco', nome: 'Conta bancária', saldoCentavos: 3000 },
      ],
      totalCentavos: 5000,
      aReceber: { totalCentavos: 9700, quantidade: 1, vencidosCentavos: 0, vencidos: 0 },
    });
    expect((await erro(bruno.resumoFinanceiro())).status).toBe(403);
    expect((await erro(bruno.listarLancamentos())).status).toBe(403);

    const [credito] = await ana.listarRecebiveis({ situacao: 'pendente' });
    expect(credito).toMatchObject({ forma: 'credito', brutoCentavos: 10000, taxaCentavos: 300, venceEm: '2026-12-16' });
    const recebido = await ana.receberRecebivel(credito!.id, 'banco');
    expect(recebido.situacao).toBe('recebido');
    expect((await erro(ana.receberRecebivel(credito!.id, 'banco'))).message).toBe('Este recebimento já foi confirmado.');
    expect(await ana.resumoFinanceiro()).toMatchObject({ totalCentavos: 14700, aReceber: { totalCentavos: 0, quantidade: 0 } });
    expect((await ana.listarLancamentos({ conta: 'banco' })).map((l) => [l.tipo, l.valorCentavos])).toEqual(
      expect.arrayContaining([
        ['venda', 3000],
        ['recebimento_cartao', 9700],
      ]),
    );
  });

  it('cancelamento estorna pela mesma forma (cartão pendente é cancelado) e a devolução em dinheiro não passa do caixa', async () => {
    const { ana, bruno, racao, petisco } = await loja();
    reporEstoqueDemo('eco', ANA, 10);
    const v = await bruno.criarVenda({
      itens: [{ produtoId: racao.id, quantidade: 1 }],
      pagamentos: [
        { forma: 'dinheiro', valorCentavos: 1000 },
        { forma: 'debito', valorCentavos: 4000 },
      ],
      recebidoDinheiroCentavos: 1000,
    });
    await ana.cancelarVenda(v.id, { motivo: 'desistiu' });
    expect(await ana.resumoFinanceiro()).toMatchObject({ totalCentavos: 0, aReceber: { totalCentavos: 0 } });
    expect((await ana.listarRecebiveis()).map((r) => r.situacao)).toEqual(['cancelado']);

    // devolução em dinheiro maior que o caixa: recusada e nada muda
    const v2 = await bruno.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 2 }], pagamentos: [{ forma: 'dinheiro', valorCentavos: 2000 }], recebidoDinheiroCentavos: 2000 });
    await ana.lancarNoFinanceiro({ tipo: 'despesa', conta: 'caixa', valorCentavos: 1500, descricao: 'Material de limpeza', categoria: null });
    const e = await erro(ana.devolverItens(v2.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' }));
    expect([e.status, txt(e.message)]).toEqual([409, 'A devolução em dinheiro (R$ 10,00) é maior que o saldo do Caixa físico (R$ 5,00). Confira o caixa ou lance uma entrada no Financeiro antes.']);
    expect((await ana.listarVendas()).find((x) => x.id === v2.id)?.devolucoes).toEqual([]);
    expect(await saldo(ana, petisco.id)).toBe(8);

    await ana.lancarNoFinanceiro({ tipo: 'entrada', conta: 'caixa', valorCentavos: 500, descricao: 'Troco do banco', categoria: null });
    await ana.devolverItens(v2.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' });
    expect((await ana.resumoFinanceiro()).contas[0]!.saldoCentavos).toBe(0);
  });

  it('lançamentos à mão, saldo inicial e taxas do cartão (só Dono e Administrador)', async () => {
    const { ana, bruno } = await loja();
    expect((await erro(ana.lancarNoFinanceiro({ tipo: 'retirada', conta: 'caixa', valorCentavos: 1, descricao: 'x', categoria: null }))).message).toMatch(/maior que o saldo do Caixa físico/);
    await ana.definirSaldoInicial({ conta: 'caixa', valorCentavos: 10000 });
    expect((await erro(ana.definirSaldoInicial({ conta: 'caixa', valorCentavos: 1 }))).message).toBe('O saldo inicial desta conta já foi definido.');
    await ana.lancarNoFinanceiro({ tipo: 'transferencia', conta: 'caixa', contaDestino: 'banco', valorCentavos: 4000, descricao: 'Depósito', categoria: null });
    expect((await ana.resumoFinanceiro()).contas.map((c) => c.saldoCentavos)).toEqual([6000, 4000]);
    expect((await erro(bruno.lancarNoFinanceiro({ tipo: 'entrada', conta: 'caixa', valorCentavos: 1, descricao: 'x', categoria: null }))).status).toBe(403);

    expect(await ana.lerTaxasCartao()).toEqual({ taxaPct: { debito: 1.5, credito: 3 }, dias: { debito: 1, credito: 30 } });
    await ana.salvarTaxasCartao({ taxaPct: { debito: 1, credito: 2.5 }, dias: { debito: 2, credito: 15 } });
    expect((await ana.lerTaxasCartao()).taxaPct.credito).toBe(2.5);
    expect((await erro(ana.salvarTaxasCartao({ taxaPct: { debito: 100, credito: 2 }, dias: { debito: 1, credito: 30 } }))).status).toBe(400);
    expect((await erro(bruno.lerTaxasCartao())).status).toBe(403);
  });
});

describe('exemplos e lojas antigas', () => {
  it('loja nova: produtos com estoque, clientes e vendas de exemplo já lançadas no estoque e no financeiro', async () => {
    const ana = criarApiLocal({ lojaId: 'nova', operador: ANA, atrasoMs: 0, agora: () => AGORA });
    const produtos = await ana.listarProdutos();
    const estoque = new Map((await ana.listarEstoque()).map((s) => [produtos.find((p) => p.id === s.produtoId)!.nome, s]));
    expect(estoque.get('Petisco Bifinho Carne 65 g')).toMatchObject({ saldo: 60, minimo: 12, situacao: 'ok' });
    expect(estoque.get('Coleira Ajustável M')).toMatchObject({ saldo: 3, minimo: 5, situacao: 'baixo' });
    expect((await ana.listarClientes()).map((c) => c.nome)).toEqual(['Fernanda Lima', 'João Pereira', 'Maria Oliveira']);
    expect((await ana.listarVendas()).filter((v) => v.cliente).length).toBe(3);
    expect(await ana.resumoFinanceiro()).toMatchObject({
      contas: [
        { id: 'caixa', saldoCentavos: 3000 },
        { id: 'banco', saldoCentavos: 12130 },
      ],
      totalCentavos: 15130,
      aReceber: { totalCentavos: 18420 + 15740, quantidade: 2 },
    });
    // abrir de novo não lança tudo outra vez
    const outra = criarApiLocal({ lojaId: 'nova', operador: ANA, atrasoMs: 0, agora: () => AGORA });
    expect((await outra.resumoFinanceiro()).totalCentavos).toBe(15130);
    expect((await outra.listarMovimentosEstoque()).length).toBe((await ana.listarMovimentosEstoque()).length);
  });

  it('loja de uma versão anterior: estoque e financeiro montados a partir das vendas que já existiam', async () => {
    const produto = { id: 'p1', codigoInterno: '0001', codigoBarras: null, nome: 'Brinquedo Bola', precoCentavos: 1000, ativo: true, criadoEm: '2026-11-01T12:00:00Z', atualizadoEm: '2026-11-01T12:00:00Z' };
    const item = { produtoId: 'p1', codigoInterno: '0001', nome: 'Brinquedo Bola', precoCentavos: 1000, quantidade: 2, subtotalCentavos: 2000 };
    localStorage.setItem('saas-demo:produtos:v1', JSON.stringify({ velha: [produto] }));
    localStorage.setItem('saas-demo:exemplos:v1', JSON.stringify(['velha']));
    localStorage.setItem(
      'saas-demo:vendas:v1',
      JSON.stringify({
        velha: [
          // formato antigo: uma forma de pagamento só
          { id: 'v1', numero: 1, criadaEm: '2026-11-10T13:00:00Z', vendedor: { id: 'ana', nome: 'Ana' }, itens: [item], totalCentavos: 2000, formaPagamento: 'dinheiro' },
          {
            id: 'v2',
            numero: 2,
            criadaEm: '2026-11-11T13:00:00Z',
            vendedor: { id: 'ana', nome: 'Ana' },
            itens: [item],
            totalCentavos: 2000,
            pagamentos: [{ forma: 'pix', valorCentavos: 2000 }],
            status: 'cancelada',
            cancelamento: { em: '2026-11-11T13:10:00Z', por: { id: 'ana', nome: 'Ana' }, autorizadoPor: null, motivo: 'x', estornos: [{ forma: 'pix', valorCentavos: 2000 }] },
            devolucoes: [],
          },
          {
            id: 'v3',
            numero: 3,
            criadaEm: '2026-11-12T13:00:00Z',
            vendedor: { id: 'bruno', nome: 'Bruno' },
            itens: [item],
            totalCentavos: 2000,
            pagamentos: [{ forma: 'credito', valorCentavos: 2000 }],
            status: 'finalizada',
            cancelamento: null,
            devolucoes: [
              {
                id: 'd1',
                numero: 1,
                criadaEm: '2026-11-12T14:00:00Z',
                itens: [{ linha: 0, produtoId: 'p1', nome: 'Brinquedo Bola', quantidade: 1, valorCentavos: 1000 }],
                totalCentavos: 1000,
                estornos: [{ forma: 'credito', valorCentavos: 1000 }],
                motivo: 'defeito',
                feitaPor: { id: 'ana', nome: 'Ana' },
                autorizadaPor: null,
              },
            ],
          },
        ],
      }),
    );
    const ana = criarApiLocal({ lojaId: 'velha', operador: ANA, atrasoMs: 0, agora: () => AGORA });
    // sobra o estoque padrão (20): o inicial cobre o que saiu (2 + 2 - 2 cancelado + 2 - 1 devolvido = 3)
    expect((await ana.listarEstoque())[0]).toMatchObject({ saldo: 20 });
    const inicial = (await ana.listarMovimentosEstoque()).find((m) => m.tipo === 'inicial');
    expect(inicial).toMatchObject({ quantidade: 23, criadoEm: produto.criadoEm });
    expect(await ana.resumoFinanceiro()).toMatchObject({
      contas: [
        { id: 'caixa', saldoCentavos: 2000 },
        { id: 'banco', saldoCentavos: 0 },
      ],
      aReceber: { totalCentavos: 1000 - 30, quantidade: 1 },
    });
    expect((await ana.listarVendas()).find((v) => v.id === 'v3')?.devolucoes[0]?.itens[0]?.voltaAoEstoque).toBe(true);
    expect((await ana.listarClientes()).length).toBe(3); // clientes de exemplo
  });

  it('apagar os dados não traz exemplos nem clientes de volta', async () => {
    const ana = criarApiLocal({ lojaId: 'loja-a', operador: ANA, atrasoMs: 0, agora: () => AGORA });
    expect((await ana.listarProdutos()).length).toBe(6);
    apagarDadosDemo();
    expect(await ana.listarProdutos()).toEqual([]);
    expect(await ana.listarClientes()).toEqual([]);
    expect((await ana.resumoFinanceiro()).totalCentavos).toBe(0);
  });
});
