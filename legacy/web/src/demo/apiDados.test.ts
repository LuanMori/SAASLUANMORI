// apps/web/src/demo/apiDados.test.ts
// Dados e backup (Fase 2, módulo 13) na API da demonstração: a cópia de segurança (DaniPets DAT-01), a restauração só
// pelo Adm. Sup (DAT-05: só da mesma loja, recusa arquivo alterado) e o registro das planilhas exportadas.
import { MENSAGENS_DA_COPIA, textoParaConferencia } from '@saas/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { chavesForaDaCopia, criarApiLocal } from './apiLocal';
import { sha256Hex } from './copiaDaLojaDemo';
import { apagarUsuariosDemo } from './usuariosDemo';

const AGORA = new Date('2026-11-25T17:32:00Z'); // 14:32 em Brasília
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const CAIO = { id: 'caio', nome: 'Caio', papel: 'administrador' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const SUPORTE = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' as const };

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
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

const api = (operador: { id: string; nome: string; papel: string; permissoes?: string[] }, lojaId = 'loja-a') =>
  comCaixaAberto(criarApiLocal({ lojaId, operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora: () => AGORA }));

/** Uma loja com produto, estoque, cliente, fornecedor e uma venda. */
async function lojaComDados(lojaId = 'loja-a') {
  const ana = api(ANA, lojaId);
  await ana.listarUsuarios(); // a equipe da loja é gravada quando alguém entra (aqui, sem a tela de entrada)
  const racao = await ana.criarProduto({ nome: 'Ração 3 kg', codigoBarras: '789100', precoCentavos: 5000 });
  await darEstoque(lojaId, 10);
  const maria = await ana.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
  await ana.cadastrarFornecedor({ nome: 'Distribuidora Pet', documento: null, telefone: null, contato: null, observacao: null });
  await ana.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 10000 }], clienteId: maria.id });
  return { ana, racao, maria };
}

describe('cópia de segurança: baixar', () => {
  it('leva todas as chaves de dados da demonstração (de fora, só as marcas de "loja já preparada")', () => {
    expect(chavesForaDaCopia().sort()).toEqual(['saas-demo:ecossistema:v1', 'saas-demo:exemplos:v1']);
  });

  it('o Dono baixa: tudo da loja, a equipe sem senha, o histórico e a conferência certa', async () => {
    const { ana } = await lojaComDados();
    const c = await ana.gerarCopiaDaLoja();
    expect(c).toMatchObject({ formato: 'sistema-padrao/copia-da-loja', versao: 1, loja: { id: 'loja-a', nome: 'Loja A' }, geradaEm: AGORA.toISOString(), geradaPor: { id: 'ana', nome: 'Ana' } });
    expect(c.contagem).toMatchObject({ produtos: 1, clientes: 1, fornecedores: 1, vendas: 1 });
    expect(c.contagem.estoque).toBeGreaterThanOrEqual(2); // a entrada e a baixa da venda
    expect((c.dados.clientes as { cpf: string }[])[0]!.cpf).toBe('52998224725');
    expect(c.equipe.length).toBeGreaterThan(0);
    expect(JSON.stringify(c.equipe)).not.toMatch(/senhaHash|tentativasErradas|pbkdf2/);
    expect(c.historico.length).toBeGreaterThan(0);
    expect(c.conferencia).toBe(await sha256Hex(textoParaConferencia(c)));
    // e fica no histórico
    const h = await ana.listarAuditoria(5);
    expect(h[0]).toMatchObject({ acao: 'dados.copia_gerada', texto: 'Cópia de segurança baixada', quem: 'Ana' });
    expect(h[0]!.resumo).toMatch(/^\d+ registros$/);
  });

  it('o Administrador baixa; o Vendedor não; o Personalizado só com "Ver o CPF completo do cliente"', async () => {
    await lojaComDados();
    await expect(api(CAIO).gerarCopiaDaLoja()).resolves.toMatchObject({ loja: { id: 'loja-a' } });
    expect(await erro(api(BRUNO).gerarCopiaDaLoja())).toMatchObject({ status: 403, message: 'Dados e backup: só o Dono ou o Administrador.' });
    const so = { id: 'p1', nome: 'Paula', papel: 'personalizado', permissoes: ['dados'] };
    expect(await erro(api(so).gerarCopiaDaLoja())).toMatchObject({ status: 403, message: MENSAGENS_DA_COPIA.precisaCpf });
    const comCpf = { ...so, permissoes: ['dados', 'clientes', 'clientes.cpf'] };
    await expect(api(comCpf).gerarCopiaDaLoja()).resolves.toMatchObject({ loja: { id: 'loja-a' } });
  });
});

describe('cópia de segurança: restaurar (só o Adm. Sup)', () => {
  it('volta a loja ao que a cópia tem; a outra loja, a equipe e o histórico continuam', async () => {
    const { ana, racao } = await lojaComDados();
    const outra = await lojaComDados('loja-b');
    const copia = await ana.gerarCopiaDaLoja();
    const texto = JSON.stringify(copia, null, 1);

    // depois da cópia: produto novo, preço mudado, outra venda e o nome da loja
    await ana.criarProduto({ nome: 'Areia 4 kg', codigoBarras: null, precoCentavos: 2490 });
    await ana.alterarProduto(racao.id, { precoCentavos: 5500 });
    await ana.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 5500 }] });
    await ana.salvarDadosDaLoja({ nome: 'Pet Center' });
    const historicoAntes = await ana.listarAuditoria(500);

    const sup = api(SUPORTE);
    const previa = await sup.conferirCopiaDaLoja(texto);
    expect(previa).toMatchObject({ loja: { id: 'loja-a', nome: 'Loja A' }, geradaEm: AGORA.toISOString(), geradaPor: 'Ana' });
    expect(previa.assuntos.find((a) => a.assunto === 'produtos')).toEqual({ assunto: 'produtos', nome: 'Produtos', quantidade: 1 });
    expect((await ana.listarProdutos()).length).toBe(2); // conferir não grava nada

    const feita = await sup.restaurarCopiaDaLoja(texto);
    expect(feita.registros).toBe(previa.registros);
    const produtos = await ana.listarProdutos();
    expect(produtos.map((p) => [p.nome, p.precoCentavos])).toEqual([['Ração 3 kg', 5000]]);
    expect(await ana.listarVendas({})).toHaveLength(1);
    expect((await ana.lerConfiguracao()).dados.nome).toBe('Loja A');
    expect((await ana.listarEstoque()).find((e) => e.produtoId === racao.id)?.saldo).toBe(8);
    // a outra loja não muda
    expect((await outra.ana.listarProdutos()).map((p) => p.nome)).toEqual(['Ração 3 kg']);
    expect(await outra.ana.listarVendas({})).toHaveLength(1);
    // a equipe continua (Ana entra e opera) e o histórico só cresceu, com a restauração no topo
    const historico = await ana.listarAuditoria(500);
    expect(historico.length).toBe(historicoAntes.length + 1);
    expect(historico[0]).toMatchObject({ acao: 'dados.copia_restaurada', texto: 'Cópia de segurança restaurada', quem: 'Suporte', resumo: `cópia de 25/11/2026 • ${previa.registros} registros` });
  });

  it('o Dono e o Administrador não restauram nem conferem (troca os dados atuais)', async () => {
    const { ana } = await lojaComDados();
    const texto = JSON.stringify(await ana.gerarCopiaDaLoja());
    const recusa = { status: 403, message: 'Restaurar uma cópia de segurança (troca os dados atuais da loja): só o Adm. Sup.' };
    expect(await erro(ana.restaurarCopiaDaLoja(texto))).toMatchObject(recusa);
    expect(await erro(ana.conferirCopiaDaLoja(texto))).toMatchObject(recusa);
    expect(await erro(api(CAIO).restaurarCopiaDaLoja(texto))).toMatchObject(recusa);
  });

  it('recusa arquivo alterado, de outra loja ou que não é cópia — e nada muda', async () => {
    const { ana } = await lojaComDados();
    const outra = await lojaComDados('loja-b');
    const copia = await ana.gerarCopiaDaLoja();
    const sup = api(SUPORTE);

    const mexida = JSON.parse(JSON.stringify(copia));
    mexida.dados.produtos[0].precoCentavos = 1;
    expect(await erro(sup.restaurarCopiaDaLoja(JSON.stringify(mexida)))).toMatchObject({ status: 400, message: MENSAGENS_DA_COPIA.alterada });
    expect(await erro(sup.conferirCopiaDaLoja(JSON.stringify({ ...copia, geradaEm: '2026-11-24T10:00:00.000Z' })))).toMatchObject({ message: MENSAGENS_DA_COPIA.alterada });

    const daOutra = JSON.stringify(await outra.ana.gerarCopiaDaLoja());
    expect(await erro(sup.restaurarCopiaDaLoja(daOutra))).toMatchObject({ status: 400, message: 'Esta cópia é da loja "Loja B". Só dá para restaurar a cópia na mesma loja.' });
    expect(await erro(sup.restaurarCopiaDaLoja('Nome;Preço\nRação;10'))).toMatchObject({ status: 400, message: MENSAGENS_DA_COPIA.naoE });

    expect((await ana.listarProdutos()).map((p) => p.precoCentavos)).toEqual([5000]);
    expect((await ana.listarAuditoria(3)).map((h) => h.acao)).not.toContain('dados.copia_restaurada');
  });

  it('num navegador sem os dados (tudo apagado), a cópia traz a loja de volta e os exemplos não voltam por cima', async () => {
    const ana = criarApiLocal({ lojaId: 'loja-a', operador: ANA, exemplos: true, atrasoMs: 0, agora: () => AGORA });
    const nomes = (await ana.listarProdutos()).map((p) => p.nome);
    expect(nomes.length).toBeGreaterThan(3); // os exemplos da demonstração
    const texto = JSON.stringify(await ana.gerarCopiaDaLoja());

    localStorage.clear();
    apagarUsuariosDemo();
    const sup = criarApiLocal({ lojaId: 'loja-a', operador: SUPORTE, exemplos: true, atrasoMs: 0, agora: () => AGORA });
    const recriados = (await sup.listarProdutos()).map((p) => p.id);
    await sup.restaurarCopiaDaLoja(texto);
    const depois = await sup.listarProdutos();
    expect(depois.map((p) => p.nome)).toEqual(nomes);
    expect(depois.some((p) => recriados.includes(p.id))).toBe(false);
    // de novo, com outra aba: continua igual (a loja ficou marcada como preparada)
    const outraAba = criarApiLocal({ lojaId: 'loja-a', operador: SUPORTE, exemplos: true, atrasoMs: 0, agora: () => AGORA });
    expect((await outraAba.listarProdutos()).map((p) => p.id)).toEqual(depois.map((p) => p.id));
  });
});

describe('planilha de cadastro exportada', () => {
  it('fica no histórico com o cadastro e as linhas; o Vendedor não registra', async () => {
    const { ana } = await lojaComDados();
    await ana.registrarPlanilhaExportada({ assunto: 'Clientes', linhas: 1 });
    expect((await ana.listarAuditoria(1))[0]).toMatchObject({ acao: 'dados.planilha_exportada', texto: 'Planilha exportada (Dados e backup)', resumo: 'Clientes • 1 linha' });
    expect(await erro(ana.registrarPlanilhaExportada({ assunto: ' ', linhas: 1 }))).toMatchObject({ status: 400 });
    expect(await erro(api(BRUNO).registrarPlanilhaExportada({ assunto: 'Produtos', linhas: 2 }))).toMatchObject({ status: 403 });
  });
});
