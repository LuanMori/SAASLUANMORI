// apps/web/src/demo/apiComunicados.test.ts
// Atualizações do sistema e avisos para a equipe (Adm. Sup, módulo 13) na API da demonstração.
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo } from './usuariosDemo';

const SUPORTE = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' as const };
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const BRUNO = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };

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

function relogio(inicio = '2026-11-25T15:00:00Z') {
  let agora = new Date(inicio);
  return { agora: () => agora, ir: (iso: string) => (agora = new Date(iso)) };
}
const api = (operador: { id: string; nome: string; papel: string }, agora: () => Date, lojaId = 'loja-a') =>
  criarApiLocal({ lojaId, operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora });

describe('atualizações do sistema', () => {
  it('o Adm. Sup publica; a versão vale para todas as lojas e cada pessoa vê as novidades uma vez', async () => {
    const r = relogio();
    const sup = api(SUPORTE, r.agora);
    expect((await api(BRUNO, r.agora).meusComunicados()).versao).toBe('V0.1');
    const a = await sup.publicarAtualizacao({ versao: '0.2', novidades: 'Aba Meu usuário\nImportar planilhas' });
    expect(a).toMatchObject({ versao: 'V0.2', novidades: ['Aba Meu usuário', 'Importar planilhas'], publicadaPor: { id: 'adm-sup', nome: 'Suporte' } });

    const bruno = api(BRUNO, r.agora);
    expect(await bruno.meusComunicados()).toMatchObject({ versao: 'V0.2', novidades: { id: a.id, versao: 'V0.2' } });
    await bruno.marcarComunicadoVisto(a.id);
    expect((await bruno.meusComunicados()).novidades).toBeNull();
    expect((await api(ANA, r.agora).meusComunicados()).novidades?.id).toBe(a.id); // a Ana ainda não viu
    expect((await api(ANA, r.agora, 'loja-b').meusComunicados()).versao).toBe('V0.2'); // vale para a outra loja também

    expect((await sup.listarAtualizacoes()).map((x) => x.versao)).toEqual(['V0.2']);
    expect((await api(ANA, r.agora).listarAuditoria(1))[0]).toMatchObject({ acao: 'suporte.atualizacao_publicada', resumo: 'V0.2 • 2 novidades', quem: 'Suporte' });
  });

  it('só o Adm. Sup publica; a versão precisa ser maior que a de agora', async () => {
    const r = relogio();
    expect(await erro(api(ANA, r.agora).publicarAtualizacao({ versao: 'V0.2', novidades: 'x' }))).toMatchObject({
      status: 403,
      message: 'Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção): só o Adm. Sup.',
    });
    const sup = api(SUPORTE, r.agora);
    await sup.publicarAtualizacao({ versao: 'V0.2', novidades: 'x' });
    expect(await erro(sup.publicarAtualizacao({ versao: 'V0.2', novidades: 'y' }))).toMatchObject({ status: 400, message: 'A versão nova precisa ser maior que a de agora (V0.2).' });
  });
});

describe('avisos para a equipe', () => {
  it('aparecem só na loja do aviso, até a pessoa fechar, até o último dia ou até o Adm. Sup encerrar', async () => {
    const r = relogio();
    const sup = api(SUPORTE, r.agora);
    const manutencao = await sup.criarAvisoDaEquipe({ texto: 'Manutenção amanhã às 22h', importancia: 'atencao', ate: '2026-11-26' });
    const geral = await sup.criarAvisoDaEquipe({ texto: 'Bem-vindos à versão nova' });

    const bruno = api(BRUNO, r.agora);
    expect((await bruno.meusComunicados()).avisos.map((a) => a.texto)).toEqual(['Manutenção amanhã às 22h', 'Bem-vindos à versão nova']);
    expect((await api(ANA, r.agora, 'loja-b').meusComunicados()).avisos).toEqual([]);

    await bruno.marcarComunicadoVisto(geral.id);
    expect((await bruno.meusComunicados()).avisos.map((a) => a.id)).toEqual([manutencao.id]);
    expect((await api(ANA, r.agora).meusComunicados()).avisos).toHaveLength(2);

    r.ir('2026-11-27T15:00:00Z'); // passou do último dia
    expect((await bruno.meusComunicados()).avisos).toEqual([]);
    await sup.encerrarAvisoDaEquipe(geral.id);
    expect((await api(ANA, r.agora).meusComunicados()).avisos).toEqual([]);
    const todos = await sup.listarAvisosDaEquipe();
    expect(todos.map((a) => [a.texto, Boolean(a.encerradoEm)])).toEqual([
      ['Bem-vindos à versão nova', true],
      ['Manutenção amanhã às 22h', false],
    ]);
    const h = (await api(ANA, r.agora).listarAuditoria(5)).map((x) => [x.texto, x.resumo]);
    expect(h).toContainEqual(['Aviso para a equipe publicado', 'atenção • até 26/11/2026']);
    expect(h).toContainEqual(['Aviso para a equipe encerrado', '']);
  });

  it('só o Adm. Sup cria, lista e encerra; aviso vazio ou com data passada é recusado', async () => {
    const r = relogio();
    expect(await erro(api(ANA, r.agora).criarAvisoDaEquipe({ texto: 'Olá' }))).toMatchObject({ status: 403 });
    expect(await erro(api(ANA, r.agora).listarAvisosDaEquipe())).toMatchObject({ status: 403 });
    const sup = api(SUPORTE, r.agora);
    expect(await erro(sup.criarAvisoDaEquipe({ texto: ' ' }))).toMatchObject({ status: 400, message: 'Escreva o aviso para a equipe.' });
    expect(await erro(sup.criarAvisoDaEquipe({ texto: 'Aviso', ate: '2026-11-20' }))).toMatchObject({ status: 400, message: 'O último dia do aviso não pode ser antes de hoje.' });
    expect(await erro(sup.encerrarAvisoDaEquipe('nao-existe'))).toMatchObject({ status: 404 });
  });
});
