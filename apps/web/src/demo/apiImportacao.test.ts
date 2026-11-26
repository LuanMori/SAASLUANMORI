// apps/web/src/demo/apiImportacao.test.ts
// Importar planilhas na API da demonstração (módulo 13; DaniPets DAT-07): conferir sem gravar, gravar tudo de uma vez,
// acrescentar só o que não existe, as linhas com erro e quem pode. E a volta completa: exportar de uma loja e importar
// na outra.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { planilhaDeProdutos } from '../painel/dados/planilhasDeCadastro';
import { lerArquivoDePlanilha } from '../relatorios/lerPlanilha';
import { gerarXlsx } from '../relatorios/xlsx';
import { comCaixaAberto } from '../testes/caixa';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo } from './usuariosDemo';

const AGORA = new Date('2026-11-25T15:00:00Z');
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };

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

const api = (operador: { id: string; nome: string; papel: string; permissoes?: string[] } = ANA, lojaId = 'loja-a') =>
  comCaixaAberto(criarApiLocal({ lojaId, operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora: () => AGORA }));

const TITULOS = ['Nome', 'Código de barras', 'Marca', 'Unidade', 'Peso da embalagem (kg)', 'Preço de venda', 'Estoque', 'Custo', 'Estoque mínimo', 'Fornecedor'];

describe('importar produtos', () => {
  it('conferir não grava; importar cria os produtos com código interno, estoque inicial com custo e mínimo', async () => {
    const ana = api();
    await ana.criarProduto({ nome: 'Areia 4 kg', codigoBarras: '7896000300306', precoCentavos: 2490 });
    const f = await ana.cadastrarFornecedor({ nome: 'Distribuidora Pet', documento: null, telefone: null, contato: null, observacao: null });
    const tabela = [
      TITULOS,
      ['Ração a granel', '2000000000015', 'Da casa', 'kg', null, 19.9, '25,5', 12, 5, 'Distribuidora Pet'],
      ['Areia Sanitária', '7896000300306', null, null, null, 25],
      ['Petisco', null, null, null, null, 7.5, 60],
    ];
    const previa = await ana.conferirImportacao('produtos', tabela);
    expect(previa.contagem).toEqual({ nova: 2, existe: 1, repetida: 0, erro: 0 });
    expect(previa.linhas.map((l) => [l.numero, l.situacao])).toEqual([[3, 'existe']]); // as novas sem observação não vêm
    expect(await ana.listarProdutos()).toHaveLength(1);

    const r = await ana.importarCadastro('produtos', tabela);
    expect(r).toEqual({ cadastro: 'produtos', importadas: 2, existentes: 1, repetidas: 0, comErro: 0 });
    const produtos = await ana.listarProdutos();
    const granel = produtos.find((p) => p.nome === 'Ração a granel')!;
    expect(granel).toMatchObject({ codigoInterno: '0002', unidade: 'kg', precoCentavos: 1990, marca: 'Da casa', fornecedorId: f.id, ativo: true });
    expect(produtos.find((p) => p.nome === 'Petisco')!.codigoInterno).toBe('0003');
    const estoque = await ana.listarEstoque();
    expect(estoque.find((e) => e.produtoId === granel.id)).toMatchObject({ saldo: 25_500, minimo: 5000, custoMedioCentavos: 1200 });
    const h = await ana.listarAuditoria(1);
    expect(h[0]).toMatchObject({ acao: 'dados.importados', texto: 'Planilha importada (Dados e backup)', resumo: 'Produtos • 2 cadastros novos • 1 já existia' });

    // de novo a mesma planilha: nada novo
    expect(await erro(ana.importarCadastro('produtos', tabela))).toMatchObject({ status: 409, message: 'Nada a importar: as linhas da planilha já estão cadastradas, repetidas ou com erro.' });
  });

  it('com linhas com erro: só importa se a pessoa aceitar deixá-las de fora', async () => {
    const ana = api();
    const tabela = [TITULOS, ['Coleira M', null, null, null, null, 29.9], ['Sem preço', null, null, null, null, null]];
    expect(await erro(ana.importarCadastro('produtos', tabela))).toMatchObject({ status: 409, codigo: 'linhas_com_erro', message: 'A planilha tem 1 linha com erro. Corrija a planilha ou importe só as linhas certas.' });
    expect(await ana.listarProdutos()).toHaveLength(0);
    await expect(ana.importarCadastro('produtos', tabela, { semAsLinhasComErro: true })).resolves.toMatchObject({ importadas: 1, comErro: 1 });
    expect((await ana.listarProdutos()).map((p) => p.nome)).toEqual(['Coleira M']);
  });

  it('o código interno novo pula o código de barras de outro produto da planilha', async () => {
    const ana = api();
    await ana.criarProduto({ nome: 'Areia', codigoBarras: null, precoCentavos: 2490 }); // 0001
    await ana.importarCadastro('produtos', [TITULOS, ['Sem código', null, null, null, null, 10], ['Código curto', '0002', null, null, null, 10]]);
    const p = await ana.listarProdutos();
    expect(p.find((x) => x.nome === 'Sem código')!.codigoInterno).toBe('0003');
    expect(p.find((x) => x.nome === 'Código curto')).toMatchObject({ codigoBarras: '0002', codigoInterno: '0004' });
  });

  it('planilha sem a coluna obrigatória ou fora do formato é recusada', async () => {
    const ana = api();
    expect(await erro(ana.conferirImportacao('produtos', [['Nome', 'Marca'], ['Ração', 'X']]))).toMatchObject({
      status: 400,
      message: 'A planilha não tem a coluna "Preço de venda". Baixe o modelo para conferir os títulos.',
    });
    expect(await erro(ana.conferirImportacao('produtos', 'Nome;Preço' as never))).toMatchObject({ status: 400, message: 'A planilha não chegou inteira. Escolha o arquivo de novo.' });
    expect(await erro(ana.conferirImportacao('vendas' as never, [TITULOS]))).toMatchObject({ status: 400 });
  });
});

describe('importar clientes e fornecedores', () => {
  it('cliente sem CPF entra com o cadastro incompleto; o mesmo CPF fica de fora', async () => {
    const ana = api();
    await ana.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    const tabela = [
      ['Nome', 'Telefone', 'CPF', 'Aceita mensagens', 'Limite de fiado'],
      ['Ana Paula Rocha', '(41) 98888-7777', null, 'Sim', 100],
      ['Maria S. Souza', null, '529.982.247-25'],
      ['Carlos Dias', '41977776666', '111.444.777-35'],
    ];
    const r = await ana.importarCadastro('clientes', tabela);
    expect(r).toMatchObject({ importadas: 2, existentes: 1 });
    const incompletos = await ana.listarContasDeClientes({ filtro: 'incompleto' });
    expect(incompletos.clientes.map((c) => [c.nome, c.completo, c.cpfMascarado])).toEqual([['Ana Paula Rocha', false, '—']]);
    const ana2 = (await ana.listarClientes('')).find((c) => c.nome === 'Ana Paula Rocha')!;
    expect(ana2).toMatchObject({ cpf: '', telefone: '41988887777', whatsapp: true, limiteFiadoCentavos: 10000, autorizaMensagens: { por: { id: 'ana', nome: 'Ana' } } });
    // o fiado continua exigindo o cadastro completo
    const racao = await ana.criarProduto({ nome: 'Ração', codigoBarras: null, precoCentavos: 1000, estoqueInicial: 5 });
    expect(await erro(ana.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 1000 }], clienteId: ana2.id }))).toMatchObject({
      message: 'Fiado só com o cadastro completo do cliente (nome, telefone e CPF).',
    });
  });

  it('fornecedores: entram os novos; o mesmo documento ou nome fica de fora', async () => {
    const ana = api();
    await ana.cadastrarFornecedor({ nome: 'Distribuidora Pet', documento: '11222333000181', telefone: null, contato: null, observacao: null });
    const r = await ana.importarCadastro('fornecedores', [['Nome', 'CNPJ ou CPF', 'Telefone'], ['Outro nome', '11.222.333/0001-81', null], ['Rações Sul', null, '4130304040']]);
    expect(r).toMatchObject({ importadas: 1, existentes: 1 });
    expect((await ana.listarFornecedores()).map((f) => f.nome).sort()).toEqual(['Distribuidora Pet', 'Rações Sul']);
  });

  it('quem pode: Dados e backup e o acesso ao cadastro', async () => {
    const tabela = [TITULOS, ['Ração', null, null, null, null, 10]];
    expect(await erro(api({ id: 'bruno', nome: 'Bruno', papel: 'vendedor' }).conferirImportacao('produtos', tabela))).toMatchObject({ status: 403, message: 'Dados e backup: só o Dono ou o Administrador.' });
    const paula = { id: 'paula', nome: 'Paula', papel: 'personalizado', permissoes: ['dados'] };
    expect(await erro(api(paula).importarCadastro('produtos', tabela))).toMatchObject({ status: 403 });
    await expect(api({ ...paula, permissoes: ['dados', 'produtos.cadastrar'] }).importarCadastro('produtos', tabela)).resolves.toMatchObject({ importadas: 1 });
  });
});

describe('a volta completa', () => {
  it('exportar os produtos de uma loja (Excel) e importar na outra: tudo chega igual', async () => {
    const a = api();
    await a.criarProduto({ nome: 'Ração 15 kg', codigoBarras: '7891000100103', precoCentavos: 18990, marca: 'Premium', pesoGramas: 15000, estoqueInicial: 12, custoInicialCentavos: 12000 });
    await a.criarProduto({ nome: 'Ração a granel', codigoBarras: null, precoCentavos: 1990, unidade: 'kg', estoqueInicial: 25_500 });
    const planilha = planilhaDeProdutos(await a.listarProdutos(), await a.listarEstoque(), await a.listarFornecedores());
    const tabela = await lerArquivoDePlanilha(new Blob([gerarXlsx([planilha], AGORA) as BlobPart]));

    const b = api(ANA, 'loja-b');
    const previa = await b.conferirImportacao('produtos', tabela);
    expect(previa.contagem).toEqual({ nova: 2, existe: 0, repetida: 0, erro: 0 });
    expect(previa.ignoradas).toEqual(['Código interno', 'Situação']);
    await b.importarCadastro('produtos', tabela);
    const naB = await b.listarProdutos();
    expect(naB.map((p) => [p.nome, p.codigoBarras, p.precoCentavos, p.unidade, p.marca ?? null, p.pesoGramas ?? null])).toEqual([
      ['Ração 15 kg', '7891000100103', 18990, 'un', 'Premium', 15000],
      ['Ração a granel', null, 1990, 'kg', null, null],
    ]);
    const estoque = new Map((await b.listarEstoque()).map((e) => [e.produtoId, e]));
    expect(naB.map((p) => [estoque.get(p.id)?.saldo, estoque.get(p.id)?.custoMedioCentavos ?? null])).toEqual([
      [12, 12000],
      [25_500, null],
    ]);
  });
});
