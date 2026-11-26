// apps/web/src/demo/apiVisoes.test.ts
// Visões sob medida (Adm. Sup, módulo 13g) na API da demonstração: só o Adm. Sup cria, altera e exclui; quem vê os
// Relatórios lista; ficam fora da cópia de segurança; o histórico guarda o que mudou.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo } from './usuariosDemo';

const SUPORTE = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' as const };
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
const agora = () => new Date('2026-11-25T15:00:00Z');
const api = (operador: { id: string; nome: string; papel: string }, lojaId = 'visoes') =>
  criarApiLocal({ lojaId, operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora });

const POR_FORMA = {
  nome: 'Pagamentos por forma',
  base: 'pagamentos' as const,
  colunas: ['Forma', 'Valor'],
  filtros: [{ coluna: 'Situação', operador: 'igual' as const, valor: 'Finalizada' }],
  agruparPor: 'Forma',
  ordem: { coluna: 'Valor', sentido: 'desc' as const },
};

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

describe('visões sob medida', () => {
  it('o Adm. Sup cria; quem vê os Relatórios lista (só desta loja); o histórico guarda', async () => {
    const sup = api(SUPORTE);
    const v = await sup.salvarVisao(POR_FORMA);
    expect(v).toMatchObject({ ...POR_FORMA, criadaEm: '2026-11-25T15:00:00.000Z', criadaPor: { id: 'adm-sup', nome: 'Suporte' }, alteradaEm: null, alteradaPor: null });
    expect(await api(ANA).listarVisoes()).toEqual([v]);
    expect(await api(ANA, 'outra').listarVisoes()).toEqual([]);
    expect(await erro(api(BRUNO).listarVisoes())).toMatchObject({ status: 403 }); // o Vendedor não vê os Relatórios
    const h = (await api(ANA).listarAuditoria(1))[0]!;
    expect([h.texto, h.resumo, h.quem, h.alvo?.nome]).toEqual(['Visão sob medida salva (Relatórios)', 'Pagamentos • nova', 'Suporte', 'Pagamentos por forma']);
  });

  it('só o Adm. Sup cria, altera e exclui; nome repetido e visão que não existe são recusados', async () => {
    expect(await erro(api(ANA).salvarVisao(POR_FORMA))).toMatchObject({ status: 403, message: 'Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção): só o Adm. Sup.' });
    const sup = api(SUPORTE);
    const v = await sup.salvarVisao(POR_FORMA);
    expect(await erro(sup.salvarVisao({ ...POR_FORMA, nome: 'pagamentos POR forma' }))).toMatchObject({
      status: 400,
      message: 'Já existe a visão "pagamentos POR forma" nesta loja. Escolha outro nome.',
    });
    expect(await erro(sup.salvarVisao({ ...POR_FORMA, nome: 'Outra', base: 'caixa' as never }))).toMatchObject({ status: 400, message: /^Escolha a base da visão/ });
    expect(await erro(sup.salvarVisao({ ...POR_FORMA, id: 'nao-existe' }))).toMatchObject({ status: 404 });
    expect(await erro(api(ANA).excluirVisao(v.id))).toMatchObject({ status: 403 });
    expect(await erro(sup.excluirVisao('nao-existe'))).toMatchObject({ status: 404 });
  });

  it('altera (o nome pode ficar), exclui, e não vai na cópia de segurança da loja', async () => {
    const sup = api(SUPORTE);
    const v = await sup.salvarVisao(POR_FORMA);
    const copia = await sup.gerarCopiaDaLoja();
    expect(JSON.stringify(copia)).not.toContain('Pagamentos por forma');

    const alterada = await sup.salvarVisao({ ...POR_FORMA, id: v.id, agruparPor: null, ordem: null });
    expect(alterada).toMatchObject({ id: v.id, agruparPor: null, ordem: null, criadaEm: v.criadaEm, alteradaEm: '2026-11-25T15:00:00.000Z', alteradaPor: { id: 'adm-sup', nome: 'Suporte' } });
    expect(await api(ANA).listarVisoes()).toEqual([alterada]);
    await sup.excluirVisao(v.id);
    expect(await api(ANA).listarVisoes()).toEqual([]);
    const h = (await api(ANA).listarAuditoria(10)).filter((x) => x.acao.startsWith('suporte.visao')).map((x) => [x.texto, x.resumo]);
    expect(h).toEqual([
      ['Visão sob medida excluída (Relatórios)', 'Pagamentos'],
      ['Visão sob medida salva (Relatórios)', 'Pagamentos • alterada'],
      ['Visão sob medida salva (Relatórios)', 'Pagamentos • nova'],
    ]);
  });

  it('até 30 visões por loja; a lista vem pela ordem do nome', async () => {
    const sup = api(SUPORTE);
    for (let i = 30; i >= 1; i--) await sup.salvarVisao({ ...POR_FORMA, nome: `Visão ${String(i).padStart(2, '0')}` });
    expect(await erro(sup.salvarVisao({ ...POR_FORMA, nome: 'Mais uma' }))).toMatchObject({ status: 409, message: 'Esta loja já tem 30 visões. Exclua uma para criar outra.' });
    const nomes = (await api(ANA).listarVisoes()).map((v) => v.nome);
    expect(nomes.slice(0, 3)).toEqual(['Visão 01', 'Visão 02', 'Visão 03']);
  });
});
