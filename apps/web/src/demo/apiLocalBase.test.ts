// apps/web/src/demo/apiLocalBase.test.ts
// Fase 2, módulo 1, na API da demonstração: regras da loja valendo nas operações, histórico de todas as
// ações, tudo ou nada quando o navegador recusa gravar, e quem foi desativado em outra aba perdendo o acesso.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroApi } from '../api';
import { darEstoque } from '../testes/estoque';
import { apagarDadosDemo, configuracaoDemo, criarApiLocal } from './apiLocal';
import { usarArmazenamentoParaTeste } from './armazenamento';
import { apagarUsuariosDemo, autorizadoresDemo } from './usuariosDemo';

const AGORA = new Date('2026-11-16T15:00:00Z'); // 12:00 em Brasília
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const txt = (t: string) => t.replace(/ /g, ' ');

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(() => usarArmazenamentoParaTeste(localStorage));

async function erro(p: Promise<unknown>): Promise<ErroApi> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroApi) return e;
    throw e;
  }
  throw new Error('Era para dar erro.');
}

async function loja(lojaId = 'loja-a', extra: { aoSessaoEncerrada?: (m: string) => void } = {}) {
  const opcoes = { lojaId, exemplos: false, atrasoMs: 0, agora: () => AGORA };
  const ana = criarApiLocal({ ...opcoes, operador: ANA });
  const bruno = criarApiLocal({ ...opcoes, operador: BRUNO, ...extra });
  const racao = await ana.criarProduto({ nome: 'Ração 3 kg', codigoBarras: null, precoCentavos: 5000 });
  await darEstoque(lojaId, 20);
  return { ana, bruno, racao };
}

describe('configurações da loja', () => {
  it('começa com o nome da loja e as regras do DaniPets; todos os logados leem', async () => {
    const { bruno } = await loja();
    const c = await bruno.lerConfiguracao();
    expect(c.dados).toEqual({ nome: 'Loja A', descricao: 'Rações, petiscos e acessórios', logo: null });
    expect(c.regras.venda.descontoSemSenhaPct).toBe(10);
    expect(c.regras.fiado.prazoDias).toBe(30);
    expect(configuracaoDemo('loja-sem-nome').dados.nome).toBe('Minha loja');
  });

  it('cada loja tem a sua (isolamento)', async () => {
    const { ana } = await loja('loja-a');
    await ana.salvarDadosDaLoja({ nome: 'Pet Center' });
    expect(configuracaoDemo('loja-a').dados.nome).toBe('Pet Center');
    expect(configuracaoDemo('loja-b').dados.nome).toBe('Loja B');
  });

  it('mudança vazia ou igual não grava nem entra no histórico', async () => {
    const { ana } = await loja();
    await ana.salvarRegrasDaLoja({ venda: { descontoSemSenhaPct: 10 } });
    expect((await ana.listarAuditoria()).filter((h) => h.acao.startsWith('loja.'))).toEqual([]);
    expect((await erro(ana.salvarRegrasDaLoja({}))).message).toBe('Nada para alterar.');
  });

  it('o desconto sem senha da loja vale na venda do Vendedor', async () => {
    const { ana, bruno, racao } = await loja();
    const comDesconto = { itens: [{ produtoId: racao.id, quantidade: 1, desconto: { precoFinalCentavos: 4000, motivo: 'cliente antigo' } }], pagamentos: [{ forma: 'pix' as const, valorCentavos: 4000 }] };
    expect((await erro(bruno.criarVenda(comDesconto))).message).toMatch(/passa de 10% e precisa da autorização/);
    await ana.salvarRegrasDaLoja({ venda: { descontoSemSenhaPct: 20 } });
    const venda = await bruno.criarVenda(comDesconto);
    expect(venda.itens[0]!.desconto).toMatchObject({ responsavel: { id: 'bruno' }, autorizadoComSenha: false });
  });

  it('o prazo do fiado da loja vale no vencimento', async () => {
    const { ana, bruno, racao } = await loja();
    await ana.salvarRegrasDaLoja({ fiado: { prazoDias: 15 } });
    const maria = await bruno.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    await bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 5000 }], clienteId: maria.id });
    const [fiado] = (await ana.listarRecebiveis()).filter((r) => r.forma === 'fiado');
    expect(fiado!.venceEm).toBe('2026-12-01');
  });
});

describe('histórico de todas as ações (DaniPets ACE-17)', () => {
  it('venda com desconto autorizado, cancelamento e devolução: número, valor e quem autorizou', async () => {
    const { ana, bruno, racao } = await loja();
    await autorizadoresDemo('loja-a'); // grava a equipe (Ana, Caio, Bruno, Carla)
    const { autorizacao } = await bruno.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'desconto', produtoId: racao.id, precoFinalCentavos: 3500 } });
    const v1 = await bruno.criarVenda({
      itens: [{ produtoId: racao.id, quantidade: 1, desconto: { precoFinalCentavos: 3500, motivo: 'avaria', autorizacao } }],
      pagamentos: [{ forma: 'dinheiro', valorCentavos: 3500 }],
      recebidoDinheiroCentavos: 3500,
    });
    await ana.definirSaldoInicial({ conta: 'caixa', valorCentavos: 10_000 });
    await ana.cancelarVenda(v1.id, { motivo: 'cliente desistiu' });
    const v2 = await bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 10_000 }] });
    await ana.devolverItens(v2.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'trocou de ideia' });

    const hist = await ana.listarAuditoria();
    const linha = (acao: string) => hist.find((h) => h.acao === acao)!;
    expect(txt(linha('venda.desconto').resumo!)).toBe('venda nº 00001 • R$ 15,00 de desconto • autorizado por Ana');
    expect(linha('venda.desconto').quem).toBe('Bruno');
    expect(txt(linha('venda.cancelada').resumo!)).toBe('venda nº 00001 • R$ 35,00');
    expect(txt(linha('venda.devolucao').resumo!)).toBe('venda nº 00002 • R$ 50,00');
    expect(txt(linha('financeiro.saldo_inicial').resumo!)).toBe('R$ 100,00 • Caixa físico');
    // sem dado pessoal nos detalhes guardados
    expect(JSON.stringify(hist.map((h) => h.detalhes))).not.toMatch(/Ana|Bruno|avaria|desistiu/);
  });

  it('estoque, clientes e financeiro: com o nome do produto e do cliente buscado na hora', async () => {
    const { ana, racao } = await loja();
    await ana.lancarMovimentoEstoque({ produtoId: racao.id, tipo: 'ajuste', quantidade: -2, motivo: 'Perda ou avaria' });
    await ana.definirEstoqueMinimo(racao.id, 4);
    const maria = await ana.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    await ana.atualizarCliente(maria.id, { nome: 'Maria Souza Lima', telefone: '41999998888', cpf: '52998224725' });
    await ana.atualizarCliente(maria.id, { nome: 'Maria Souza Lima', telefone: '41999998888', cpf: '52998224725' }); // igual: não registra
    await ana.definirClienteAtivo(maria.id, false);
    await ana.definirClienteAtivo(maria.id, false); // já estava: não registra
    await ana.lancarNoFinanceiro({ tipo: 'entrada', conta: 'banco', valorCentavos: 50_000, descricao: 'Aporte' });
    await ana.lancarNoFinanceiro({ tipo: 'despesa', conta: 'banco', valorCentavos: 12_000, descricao: 'Aluguel de novembro', categoria: 'Aluguel' });
    await ana.lancarNoFinanceiro({ tipo: 'transferencia', conta: 'banco', contaDestino: 'caixa', valorCentavos: 5000, descricao: 'Troco' });
    await ana.salvarTaxasCartao({ taxaPct: { debito: 1.2, credito: 2.9 }, dias: { debito: 1, credito: 30 } });

    const hist = await ana.listarAuditoria();
    const de = (acao: string) => hist.filter((h) => h.acao === acao);
    expect(de('estoque.ajuste')[0]).toMatchObject({ alvo: { tipo: 'produto', nome: 'Ração 3 kg' }, resumo: '-2 un • Perda ou avaria' });
    expect(de('estoque.entrada')).toHaveLength(1); // a do darEstoque
    expect(de('estoque.minimo')[0]!.resumo).toBe('mínimo 4 un');
    expect(de('cliente.cadastrado')[0]!.alvo).toMatchObject({ tipo: 'cliente', nome: 'Maria Souza Lima' });
    expect(de('cliente.alterado')).toHaveLength(1);
    expect(de('cliente.alterado')[0]!.detalhes).toEqual({ campos: ['nome'] });
    expect(de('cliente.desativado')).toHaveLength(1);
    expect(txt(de('financeiro.despesa')[0]!.resumo!)).toBe('R$ 120,00 • Conta bancária • Aluguel');
    expect(txt(de('financeiro.transferencia')[0]!.resumo!)).toBe('R$ 50,00 • Conta bancária → Caixa físico');
    expect(de('financeiro.entrada')).toHaveLength(1);
    expect(de('financeiro.taxas')).toHaveLength(1);
  });

  it('depois da exclusão de dados (LGPD), o histórico mostra "Cliente removido"', async () => {
    const { ana } = await loja();
    const maria = await ana.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    await ana.excluirDadosDoCliente(maria.id);
    const hist = await ana.listarAuditoria();
    expect(hist.filter((h) => h.alvo?.tipo === 'cliente').map((h) => h.alvo!.nome)).toEqual(['Cliente removido', 'Cliente removido']);
  });
});

describe('tudo ou nada quando o navegador recusa gravar', () => {
  it('venda recusada pelo navegador: nem venda, nem baixa no estoque, nem dinheiro no caixa', async () => {
    const { ana, bruno, racao } = await loja();
    const real = localStorage;
    const recusando = new Proxy(real, {
      get(alvo, nome) {
        if (nome === 'setItem') {
          return (k: string, v: string) => {
            if (k === 'saas-demo:lancamentos:v1') throw new DOMException('cheio', 'QuotaExceededError');
            alvo.setItem(k, v);
          };
        }
        const v = Reflect.get(alvo, nome) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(alvo) : v;
      },
    });
    usarArmazenamentoParaTeste(recusando);
    const e = await erro(bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'dinheiro', valorCentavos: 5000 }], recebidoDinheiroCentavos: 5000 }));
    expect([e.status, e.codigo]).toEqual([507, 'gravacao_recusada']);
    usarArmazenamentoParaTeste(real);
    expect(await ana.listarVendas({})).toEqual([]);
    expect((await ana.listarEstoque()).find((s) => s.produtoId === racao.id)!.saldo).toBe(20);
    expect((await ana.resumoFinanceiro()).totalCentavos).toBe(0);
  });
});

describe('quem está logado, como está agora (outra aba pode ter mudado)', () => {
  it('desativado em outra aba: a próxima operação é recusada e a tela volta para a entrada', async () => {
    const encerrou = vi.fn();
    const { ana, bruno, racao } = await loja('loja-a', { aoSessaoEncerrada: encerrou });
    await autorizadoresDemo('loja-a'); // grava a equipe
    await ana.alterarUsuario('bruno', { ativo: false });
    const e = await erro(bruno.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 5000 }] }));
    expect([e.status, e.codigo]).toEqual([401, 'sessao_encerrada']);
    expect(encerrou).toHaveBeenCalledWith('Seu acesso a esta loja foi desativado. Fale com o Dono da loja.');
  });

  it('papel mudado em outra aba vale na hora (como no servidor)', async () => {
    const { ana, bruno } = await loja();
    await autorizadoresDemo('loja-a');
    expect((await erro(bruno.resumoFinanceiro())).status).toBe(403);
    await ana.alterarUsuario('bruno', { papel: 'administrador' });
    await expect(bruno.resumoFinanceiro()).resolves.toMatchObject({ totalCentavos: 0 });
  });
});

describe('apagar os dados da demonstração', () => {
  it('também volta os dados e as regras da loja ao padrão', async () => {
    const { ana } = await loja();
    await ana.salvarDadosDaLoja({ nome: 'Pet Center' });
    apagarDadosDemo();
    expect(configuracaoDemo('loja-a').dados.nome).toBe('Loja A');
  });
});
