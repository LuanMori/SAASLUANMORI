// apps/web/src/demo/apiVendasAntigas.test.ts
// Vendas antigas na API da demonstração (módulo 13): entram só como histórico, sem mexer em estoque, caixa, financeiro e
// nas vendas do sistema; não se repetem; vão na cópia de segurança; quem pode.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { carregarRelatorios, planilhasDeTudo } from '../relatorios/planilhas';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo } from './usuariosDemo';

const AGORA = new Date('2026-11-25T15:00:00Z');
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
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

const api = (operador: { id: string; nome: string; papel: string; permissoes?: string[] } = ANA) =>
  comCaixaAberto(criarApiLocal({ lojaId: 'loja-a', operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora: () => AGORA }));

const PLANILHA = [
  ['Data', 'Número', 'Cliente', 'Produto', 'Quantidade', 'Preço unitário', 'Total', 'Forma de pagamento', 'Vendedor'],
  ['10/03/2025', '123', 'Maria Souza', 'Ração 15 kg', 1, 189.9, null, 'crédito', 'Ana'],
  ['10/03/2025', '123', null, 'Petisco', 3, 7.5, null, null, null],
  ['15/04/2025', null, 'João', null, null, null, 'R$ 50,00', 'pix', null],
];

describe('vendas antigas', () => {
  it('entram só como histórico: estoque, caixa, financeiro e as vendas do sistema não mudam', async () => {
    const ana = api();
    const racao = await ana.criarProduto({ nome: 'Ração 15 kg', codigoBarras: null, precoCentavos: 18990 });
    await darEstoque('loja-a', 10);
    const antes = { estoque: await ana.listarEstoque(), financeiro: await ana.resumoFinanceiro(), lancamentos: await ana.listarLancamentos({}), caixa: (await ana.lerCaixa()).hoje };

    const previa = await ana.conferirVendasAntigas(PLANILHA);
    expect(previa).toMatchObject({ vendas: 2, totalCentavos: 26240, de: '2025-03-10', ate: '2025-04-15', vendasExistentes: 0, contagem: { nova: 3, erro: 0 } });
    expect(await ana.listarVendasAntigas()).toEqual([]); // conferir não grava

    await expect(ana.importarVendasAntigas(PLANILHA)).resolves.toEqual({ vendas: 2, totalCentavos: 26240, vendasExistentes: 0, linhasComErro: 0 });
    const antigas = await ana.listarVendasAntigas();
    expect(antigas.map((v) => [v.dia, v.numeroAntigo, v.cliente, v.pagamento, v.totalCentavos, v.itens.length])).toEqual([
      ['2025-04-15', null, 'João', 'Pix', 5000, 1],
      ['2025-03-10', '123', 'Maria Souza', 'Crédito', 21240, 2],
    ]);
    expect(antigas[1]).toMatchObject({ vendedor: 'Ana', importadaEm: AGORA.toISOString(), importadaPor: { id: 'ana', nome: 'Ana' } });

    expect(await ana.listarVendas({})).toEqual([]);
    expect(await ana.listarEstoque()).toEqual(antes.estoque);
    expect((await ana.listarEstoque()).find((e) => e.produtoId === racao.id)?.saldo).toBe(10);
    expect(await ana.resumoFinanceiro()).toEqual(antes.financeiro);
    expect(await ana.listarLancamentos({})).toEqual(antes.lancamentos);
    expect((await ana.lerCaixa()).hoje).toEqual(antes.caixa);
    expect((await ana.listarAuditoria(1))[0]).toMatchObject({ acao: 'dados.vendas_importadas', texto: 'Vendas antigas importadas', resumo: '2 vendas • R$ 262,40 • 10/03/2025 a 15/04/2025' });
  });

  it('a mesma planilha de novo não repete; com linhas com erro, só importa se a pessoa aceitar', async () => {
    const ana = api();
    await ana.importarVendasAntigas(PLANILHA);
    expect(await erro(ana.importarVendasAntigas(PLANILHA))).toMatchObject({ status: 409, message: 'Nada a importar: as vendas da planilha já foram importadas ou têm erro.' });
    const comErro = [PLANILHA[0]!, ['01/05/2025', '200', null, null, null, null, 10], ['30/12/2026', '201', null, null, null, null, 10]];
    expect(await erro(ana.importarVendasAntigas(comErro))).toMatchObject({ status: 409, codigo: 'linhas_com_erro' });
    await expect(ana.importarVendasAntigas(comErro, { semAsLinhasComErro: true })).resolves.toMatchObject({ vendas: 1, linhasComErro: 1 });
    expect((await ana.listarVendasAntigas()).map((v) => v.numeroAntigo)).toEqual(['200', null, '123']);
  });

  it('quem pode: Dados e backup e Relatórios para importar; Relatórios para ver', async () => {
    const paula = { id: 'paula', nome: 'Paula', papel: 'personalizado', permissoes: ['dados'] };
    expect(await erro(api(paula).conferirVendasAntigas(PLANILHA))).toMatchObject({ status: 403, message: 'Relatórios e vendas de outros dias: só o Dono ou o Administrador.' });
    await expect(api({ ...paula, permissoes: ['dados', 'relatorios'] }).importarVendasAntigas(PLANILHA)).resolves.toMatchObject({ vendas: 2 });
    expect(await erro(api({ id: 'bruno', nome: 'Bruno', papel: 'vendedor' }).listarVendasAntigas())).toMatchObject({ status: 403 });
  });

  it('vão na cópia de segurança e voltam na restauração; o "Exportar tudo" dos Relatórios leva as duas abas delas', async () => {
    const ana = api();
    await ana.importarVendasAntigas(PLANILHA);
    const copia = await ana.gerarCopiaDaLoja();
    expect(copia.contagem.vendasAntigas).toBe(2);
    localStorage.removeItem('saas-demo:vendas-antigas:v1');
    expect(await ana.listarVendasAntigas()).toEqual([]);
    await api(SUPORTE).restaurarCopiaDaLoja(JSON.stringify(copia));
    expect(await ana.listarVendasAntigas()).toHaveLength(2);

    const dados = await carregarRelatorios(ana, { de: '2025-04-01', ate: null });
    expect(dados.vendasAntigas).toHaveLength(2); // todas: a aba filtra pelo período
    const abas = planilhasDeTudo(dados, { de: '2025-04-01', ate: null }, { caixa: 'Caixa', banco: 'Banco' } as never, 'America/Sao_Paulo', AGORA);
    const itens = abas.find((a) => a.nome === 'Itens das vendas antigas')!;
    expect(abas.map((a) => a.nome)).toContain('Vendas antigas');
    expect(itens.linhas).toEqual([['2025-04-15', null, 'João', null, null, null, 5000, 'Pix', null]]); // só as do período
  });
});
