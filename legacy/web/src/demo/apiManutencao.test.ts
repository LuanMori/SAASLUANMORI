// apps/web/src/demo/apiManutencao.test.ts
// Manutenção (Adm. Sup, módulo 13h) na API da demonstração: o diagnóstico da loja, zerar o saldo negativo e o
// registro de erros. Só o Adm. Sup vê e mexe; o registro recebe de todos os logados.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo } from './usuariosDemo';

const SUPORTE = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' as const };
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const LOJA = 'manut';
let relogio = new Date('2026-11-26T15:00:00Z');
const agora = () => relogio;
const api = (operador: { id: string; nome: string; papel: string }) => criarApiLocal({ lojaId: LOJA, operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora });

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
  relogio = new Date('2026-11-26T15:00:00Z');
});

async function erro(p: Promise<unknown>): Promise<ErroApi> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroApi) return e;
    throw e;
  }
  throw new Error('Era para dar erro.');
}

/** Um movimento gravado direto (como viria de uma cópia antiga ou de um defeito): o saldo fica negativo. */
function gravarMovimento(produtoId: string, quantidade: number) {
  const todos = JSON.parse(localStorage.getItem('saas-demo:estoque:v1') ?? '{}') as Record<string, unknown[]>;
  const mov = { id: `m-${produtoId}-${quantidade}`, produtoId, tipo: 'ajuste', quantidade, criadoEm: '2026-11-26T10:00:00.000Z', motivo: 'Contagem', vendaId: null, vendaNumero: null, por: { id: 'ana', nome: 'Ana' } };
  localStorage.setItem('saas-demo:estoque:v1', JSON.stringify({ ...todos, [LOJA]: [...(todos[LOJA] ?? []), mov] }));
}

describe('diagnóstico da loja', () => {
  it('só o Adm. Sup; conta os registros de cada assunto, a equipe, o histórico, o espaço e o caixa', async () => {
    const ana = api(ANA);
    await ana.listarUsuarios(); // grava a equipe da loja (Ana, Caio, Bruno e Carla, desativada)
    await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
    await ana.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    expect(await erro(ana.diagnosticoDaLoja())).toMatchObject({ status: 403 });

    const d = await api(SUPORTE).diagnosticoDaLoja();
    expect(d).toMatchObject({
      geradoEm: '2026-11-26T15:00:00.000Z',
      versao: 'V0.1',
      equipe: { ativos: 3, total: 4 },
      caixa: { hoje: 'nao_aberto', ultimoFechado: null, aVerificar: 0 },
      estoque: { negativos: [], movimentosSemProduto: 0 },
      erros: 0,
    });
    const registros = Object.fromEntries(d.assuntos.map((a) => [a.assunto, a.registros]));
    expect([registros.produtos, registros.clientes, registros.vendas, registros.configuracao]).toEqual([1, 1, 0, 0]);
    expect(d.assuntos[0]).toEqual({ assunto: 'configuracao', nome: 'Dados e regras da loja', registros: 0 });
    expect(d.historico).toBeGreaterThanOrEqual(2); // produto e cliente cadastrados
    expect(d.espaco.daLojaBytes).toBeGreaterThan(0);
    expect(d.espaco.totalBytes).toBeGreaterThanOrEqual(d.espaco.daLojaBytes / 2);
    expect(d.espaco.limiteBytes).toBe(5 * 1024 * 1024);
  });
});

describe('conferir o estoque', () => {
  it('mostra o saldo negativo e o movimento sem produto; "zerar" lança o ajuste e vai para o histórico', async () => {
    const ana = api(ANA);
    const p = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
    gravarMovimento(p.id, -5);
    gravarMovimento('produto-que-sumiu', 3);
    const sup = api(SUPORTE);
    expect((await sup.diagnosticoDaLoja()).estoque).toEqual({ negativos: [{ produtoId: p.id, nome: 'Petisco', saldo: -5, unidade: 'un' }], movimentosSemProduto: 1 });

    expect(await erro(ana.zerarEstoqueNegativo(p.id))).toMatchObject({ status: 403 });
    expect((await sup.zerarEstoqueNegativo(p.id)).saldo).toBe(0);
    expect((await sup.diagnosticoDaLoja()).estoque.negativos).toEqual([]);
    expect(await erro(sup.zerarEstoqueNegativo(p.id))).toMatchObject({ status: 409, message: 'O saldo de Petisco não está negativo.' });
    const h = (await ana.listarAuditoria(1))[0]!;
    expect([h.texto, h.resumo, h.quem, h.alvo?.nome]).toEqual(['Saldo negativo zerado (manutenção do suporte)', '+5 un', 'Suporte', 'Petisco']);
    const mov = (await ana.listarMovimentosEstoque()).find((m) => m.produtoId === p.id && m.quantidade === 5);
    expect(mov).toMatchObject({ tipo: 'ajuste', motivo: 'Manutenção do suporte: saldo negativo zerado', por: { id: 'adm-sup', nome: 'Suporte' } });
  });
});

describe('registro de erros', () => {
  it('todos os logados registram; o mesmo erro em seguida soma "vezes"; só o Adm. Sup lista e limpa', async () => {
    const bruno = api(BRUNO);
    await api(ANA).listarUsuarios(); // a equipe gravada: o nome de quem estava usando aparece
    await bruno.registrarErro({ mensagem: 'TypeError: x is undefined', onde: 'app.js:10:5', tela: 'frente-de-caixa' });
    relogio = new Date('2026-11-26T15:00:20Z');
    await bruno.registrarErro({ mensagem: 'TypeError: x is undefined', onde: 'app.js:10:5', tela: 'frente-de-caixa' });
    await api(ANA).registrarErro({ mensagem: 'Error: falhou', onde: null, tela: 'relatorios' });
    expect(await erro(bruno.registrarErro({ mensagem: ' ', onde: null, tela: null }))).toMatchObject({ status: 400 });
    expect(await erro(bruno.listarErros())).toMatchObject({ status: 403 });

    const sup = api(SUPORTE);
    const lista = await sup.listarErros();
    expect(lista.map((e) => [e.mensagem, e.tela, e.vezes, e.quemNome])).toEqual([
      ['Error: falhou', 'relatorios', 1, 'Ana'],
      ['TypeError: x is undefined', 'frente-de-caixa', 2, 'Bruno'],
    ]);
    expect(lista[1]).toMatchObject({ em: '2026-11-26T15:00:00.000Z', ultimoEm: '2026-11-26T15:00:20.000Z', onde: 'app.js:10:5' });
    expect((await sup.diagnosticoDaLoja()).erros).toBe(2);
    // fica fora da cópia de segurança
    expect(JSON.stringify(await sup.gerarCopiaDaLoja())).not.toContain('x is undefined');

    expect(await erro(api(ANA).limparErros())).toMatchObject({ status: 403 });
    await sup.limparErros();
    expect(await sup.listarErros()).toEqual([]);
    expect((await api(ANA).listarAuditoria(1))[0]).toMatchObject({ texto: 'Registro de erros limpo', resumo: '2 erros', quem: 'Suporte' });
  });
});
