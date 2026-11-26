// apps/web/src/demo/apiAjustes.test.ts
// Ajustes da loja (Adm. Sup, módulo 13f) na API da demonstração: só o Adm. Sup muda; desligado, o recurso recusa o
// que é novo dele (o que o cliente já tem continua valendo); limites de usuários e de produtos ativos.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo } from './usuariosDemo';

const SUPORTE = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' as const };
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const MARIA = { nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' };
const HOJE = '2026-11-25';
const agora = () => new Date(`${HOJE}T15:00:00Z`);

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

const api = (operador: { id: string; nome: string; papel: string }, lojaId = 'ajustes') =>
  comCaixaAberto(criarApiLocal({ lojaId, operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora }));

async function loja() {
  const sup = api(SUPORTE);
  const ana = api(ANA);
  const petisco = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('ajustes', 50);
  const maria = await ana.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 50_000 });
  const vender = (n: number, extra: Record<string, unknown> = {}) =>
    ana.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: n }], pagamentos: [{ forma: 'pix', valorCentavos: n * 1000 }], ...extra });
  const desligar = (...desligados: string[]) => sup.salvarAjustesDaLoja({ desligados: desligados as never, limites: { usuariosAtivos: null, produtosAtivos: null } });
  return { sup, ana, petisco, maria, vender, desligar };
}

describe('ajustes da loja', () => {
  it('sem ajustes, tudo ligado e sem limite; só o Adm. Sup muda, e a mudança vai para o histórico', async () => {
    const sup = api(SUPORTE);
    const bruno = api(BRUNO);
    expect(await bruno.lerAjustesDaLoja()).toEqual({ desligados: [], limites: { usuariosAtivos: null, produtosAtivos: null }, alteradoEm: null, alteradoPor: null });
    expect(await erro(api(ANA).salvarAjustesDaLoja({ desligados: ['fiado'], limites: { usuariosAtivos: null, produtosAtivos: null } }))).toMatchObject({
      status: 403,
      message: 'Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção): só o Adm. Sup.',
    });
    expect(await erro(sup.salvarAjustesDaLoja({ desligados: ['caixa' as never], limites: { usuariosAtivos: null, produtosAtivos: null } }))).toMatchObject({
      status: 400,
      message: 'Recurso desconhecido: caixa.',
    });

    const salvos = await sup.salvarAjustesDaLoja({ desligados: ['vales', 'fiado'], limites: { usuariosAtivos: 5, produtosAtivos: null } });
    expect(salvos).toEqual({
      desligados: ['fiado', 'vales'],
      limites: { usuariosAtivos: 5, produtosAtivos: null },
      alteradoEm: '2026-11-25T15:00:00.000Z',
      alteradoPor: { id: 'adm-sup', nome: 'Suporte' },
    });
    expect(await bruno.lerAjustesDaLoja()).toEqual(salvos);
    expect((await api(BRUNO, 'outra').lerAjustesDaLoja()).desligados).toEqual([]); // vale só para esta loja
    const h = await api(ANA).listarAuditoria(1);
    expect(h[0]).toMatchObject({ texto: 'Ajustes da loja alterados (recursos e limites)', resumo: 'desligou Fiado e Vale-troca • usuários: até 5', quem: 'Suporte' });
    // salvar igual não muda nada nem entra no histórico
    expect(await sup.salvarAjustesDaLoja({ desligados: ['fiado', 'vales'], limites: { usuariosAtivos: 5, produtosAtivos: null } })).toEqual(salvos);
    expect((await api(ANA).listarAuditoria()).filter((x) => x.acao === 'suporte.ajustes_alterados')).toHaveLength(1);
  });

  it('não vão na cópia de segurança: restaurar uma cópia antiga não religa nada', async () => {
    const { sup, desligar } = await loja();
    const copia = await sup.gerarCopiaDaLoja();
    expect(JSON.stringify(copia)).not.toContain('desligados');
    await desligar('fiado');
    await sup.restaurarCopiaDaLoja(JSON.stringify(copia));
    expect((await sup.lerAjustesDaLoja()).desligados).toEqual(['fiado']);
  });
});

describe('recurso desligado', () => {
  it('fiado: não vende fiado; o fiado que já existe continua podendo ser recebido', async () => {
    const { ana, maria, vender, desligar } = await loja();
    await vender(3, { clienteId: maria.id, pagamentos: [{ forma: 'fiado', valorCentavos: 3000 }] });
    await desligar('fiado');
    expect(await erro(vender(2, { clienteId: maria.id, pagamentos: [{ forma: 'fiado', valorCentavos: 2000 }] }))).toMatchObject({
      status: 403,
      message: 'Fiado: este recurso está desligado nesta loja. Fale com o suporte.',
      codigo: 'recurso_desligado',
    });
    await vender(1, { clienteId: maria.id }); // no Pix, vende normal
    await ana.receberFiadoDoCliente(maria.id, { valorCentavos: 3000, forma: 'pix' });
    expect((await ana.contaDoCliente(maria.id)).fiado.devendoCentavos).toBe(0);
  });

  it('fidelidade: a compra não gera cashback e não há lembretes; o saldo que o cliente já tem continua valendo', async () => {
    const { ana, maria, vender, desligar } = await loja();
    const antes = await vender(10, { clienteId: maria.id });
    expect(antes.cashbackGeradoCentavos).toBe(350); // 3,5% de R$ 100,00
    await desligar('fidelidade');
    const depois = await vender(10, { clienteId: maria.id });
    expect(depois.cashbackGeradoCentavos ?? 0).toBe(0);
    expect(await erro(ana.registrarContato(maria.id, { tipo: 'retorno', canal: 'outro' }))).toMatchObject({ status: 403, message: /^Fidelidade: este recurso está desligado/ });
    const pendencias = await ana.pendenciasDeClientes();
    expect([pendencias.cashback, pendencias.promocao]).toEqual([[], []]);
    // usa o cashback que já tinha
    const usou = await ana.criarVenda({
      itens: [{ produtoId: antes.itens[0]!.produtoId, quantidade: 1 }],
      clienteId: maria.id,
      pagamentos: [
        { forma: 'cashback', valorCentavos: 350 },
        { forma: 'pix', valorCentavos: 650 },
      ],
    });
    expect(usou.pagamentos.map((p) => [p.forma, p.valorCentavos]).sort()).toEqual([
      ['cashback', 350],
      ['pix', 650],
    ]);
  });

  it('vale-troca: a devolução não vira vale (volta pela forma da venda)', async () => {
    const { ana, vender, desligar } = await loja();
    const v = await vender(4);
    await desligar('vales');
    expect(await erro(ana.devolverItens(v.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca', modo: 'vale' }))).toMatchObject({
      status: 403,
      message: 'Vale-troca: este recurso está desligado nesta loja. Fale com o suporte.',
    });
    const r = await ana.devolverItens(v.id, { itens: [{ linha: 0, quantidade: 1 }], motivo: 'troca' });
    expect(r.devolucao.estornos).toEqual([{ forma: 'pix', valorCentavos: 1000 }]);
  });

  it('compras, financeiro e relatórios: recusam o que é novo; as vendas continuam movimentando as contas', async () => {
    const { ana, petisco, vender, desligar } = await loja();
    await desligar('compras', 'financeiro', 'relatorios');
    expect(
      (await erro(ana.registrarCompra({ data: HOJE, itens: [{ produtoId: petisco.id, quantidade: 1, custoCentavos: 500 }], pagamento: { tipo: 'avista', conta: 'banco' } }))).message,
    ).toBe('Compras: este recurso está desligado nesta loja. Fale com o suporte.');
    expect((await erro(ana.lancarNoFinanceiro({ tipo: 'despesa', conta: 'banco', valorCentavos: 500, descricao: 'Lanche', categoria: 'Outras despesas' }))).message).toBe(
      'Financeiro: este recurso está desligado nesta loja. Fale com o suporte.',
    );
    expect((await erro(ana.conferirVendasAntigas([['Data', 'Total'], ['01/03/2025', 10]]))).message).toBe(
      'Relatórios: este recurso está desligado nesta loja. Fale com o suporte.',
    );
    expect((await erro(ana.conferirImportacao('fornecedores', [['Nome'], ['Distribuidora']]))).message).toMatch(/^Compras: este recurso está desligado/);
    const antes = (await ana.listarLancamentos()).length;
    await vender(2);
    expect((await ana.listarLancamentos()).length).toBe(antes + 1); // o Pix da venda entra na conta
  });
});

describe('limites', () => {
  it('produtos ativos: não cria nem reativa acima do limite; na importação, já na prévia', async () => {
    const { sup, ana, petisco } = await loja();
    await sup.salvarAjustesDaLoja({ desligados: [], limites: { usuariosAtivos: null, produtosAtivos: 2 } });
    const racao = await ana.criarProduto({ nome: 'Ração', codigoBarras: null, precoCentavos: 5000 });
    expect(await erro(ana.criarProduto({ nome: 'Coleira', codigoBarras: null, precoCentavos: 3000 }))).toMatchObject({
      status: 409,
      message: 'Esta loja pode ter até 2 produtos ativos (hoje: 2). Inative um produto ou fale com o suporte para aumentar o limite.',
      codigo: 'limite_da_loja',
    });
    await ana.definirProdutoAtivo(racao.id, false);
    await ana.criarProduto({ nome: 'Coleira', codigoBarras: null, precoCentavos: 3000 }); // inativo não conta
    expect((await erro(ana.definirProdutoAtivo(racao.id, true))).message).toMatch(/^Esta loja pode ter até 2 produtos ativos/);
    await ana.definirProdutoAtivo(petisco.id, false);
    const planilha = [['Nome', 'Preço de venda'], ['Areia', '20,00'], ['Bolinha', '5,00']];
    expect((await erro(ana.conferirImportacao('produtos', planilha))).message).toBe(
      'A planilha traz 2 produtos novos, e esta loja pode ter até 2 produtos ativos (hoje: 1). Fale com o suporte para aumentar o limite.',
    );
    expect((await erro(ana.importarCadastro('produtos', planilha))).message).toMatch(/^A planilha traz 2 produtos novos/);
    expect((await ana.conferirImportacao('produtos', planilha.slice(0, 2))).contagem.nova).toBe(1);
  });

  it('usuários ativos: não cria nem reativa acima do limite; baixar o limite não desativa ninguém', async () => {
    const sup = api(SUPORTE);
    const ana = api(ANA);
    const equipe = await ana.listarUsuarios(); // Ana, Caio e Bruno ativos; Carla desativada
    expect(equipe.filter((u) => u.ativo)).toHaveLength(3);
    await sup.salvarAjustesDaLoja({ desligados: [], limites: { usuariosAtivos: 2, produtosAtivos: null } });
    expect((await ana.listarUsuarios()).filter((u) => u.ativo)).toHaveLength(3);
    const nova = { nome: 'Dani', usuario: 'dani', papel: 'vendedor' as const, senha: 'Loja#2026forte' };
    expect(await erro(ana.criarUsuario(nova))).toMatchObject({
      status: 409,
      message: 'Esta loja pode ter até 2 usuários ativos (hoje: 3). Desative um usuário ou fale com o suporte para aumentar o limite.',
    });
    const carla = equipe.find((u) => u.usuario === 'carla')!;
    expect((await erro(ana.alterarUsuario(carla.id, { ativo: true }))).message).toMatch(/^Esta loja pode ter até 2 usuários ativos/);
    await sup.salvarAjustesDaLoja({ desligados: [], limites: { usuariosAtivos: 4, produtosAtivos: null } });
    await ana.criarUsuario(nova);
    expect((await erro(ana.alterarUsuario(carla.id, { ativo: true }))).message).toMatch(/hoje: 4/);
  });
});
