// apps/web/src/demo/apiMeuUsuario.test.ts
// Aba "Meu usuário" na API da demonstração (pedido do Luan, 25/11/2026): o meu perfil, a minha foto e as minhas entradas
// e saídas. E o Adm. Sup, que fica fora das lojas: a foto e a senha dele são gravadas no lugar dele, nunca na equipe.
import { LIMITES_FOTO, MENSAGENS_FOTO } from '@saas/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo, entrarDemo, registrarSaidaDemo, SENHA_DEMO } from './usuariosDemo';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});

async function erro(promessa: Promise<unknown>): Promise<ErroApi> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroApi) return e;
    throw e;
  }
  throw new Error('Era para dar erro.');
}

function relogio(inicio = '2026-11-25T11:00:00.000Z') {
  let agora = new Date(inicio);
  return { agora: () => agora, ir: (iso: string) => (agora = new Date(iso)) };
}

const api = (id: string, papel: 'dono' | 'administrador' | 'vendedor' | 'super_admin', agora = () => new Date('2026-11-25T12:00:00Z')) =>
  criarApiLocal({ lojaId: 'loja-a', operador: { id, nome: id, papel }, exemplos: false, atrasoMs: 0, agora });
const entrar = (usuario: string, agora: () => Date, senha = SENHA_DEMO) => entrarDemo('lojaa', usuario, senha, { agora, atrasoMs: 0 });

describe('meu perfil e a minha foto', () => {
  it('cada um vê o próprio cadastro (sem senha); a foto entra, aparece para o Dono na equipe e sai', async () => {
    const r = relogio();
    await entrar('bruno', r.agora);
    const bruno = api('bruno', 'vendedor', r.agora);
    const eu = await bruno.meuPerfil();
    expect(eu).toMatchObject({ id: 'bruno', nome: 'Bruno', usuario: 'bruno', papel: 'vendedor' });
    expect(eu.foto ?? null).toBeNull();
    expect(JSON.stringify(eu)).not.toMatch(/senhaHash|tentativasErradas/);

    await expect(bruno.salvarMinhaFoto(PNG)).resolves.toMatchObject({ id: 'bruno', foto: PNG });
    expect((await bruno.meuPerfil()).foto).toBe(PNG);
    const equipe = await api('ana', 'dono', r.agora).listarUsuarios();
    expect(equipe.find((u) => u.id === 'bruno')?.foto).toBe(PNG);
    expect(equipe.find((u) => u.id === 'ana')?.foto ?? null).toBeNull();

    // a mesma foto de novo: nada muda e nada entra no histórico
    await bruno.salvarMinhaFoto(PNG);
    await bruno.salvarMinhaFoto(null);
    expect((await bruno.meuPerfil()).foto ?? null).toBeNull();
    const historico = (await api('ana', 'dono', r.agora).listarAuditoria(10)).filter((h) => h.acao === 'usuario.foto_alterada');
    expect(historico.map((h) => [h.texto, h.quem, h.resumo])).toEqual([
      ['Foto do perfil alterada', 'Bruno', 'tirou a foto'],
      ['Foto do perfil alterada', 'Bruno', ''],
    ]);
  });

  it('foto em outro formato ou grande demais é recusada; nada muda', async () => {
    const bruno = api('bruno', 'vendedor');
    await bruno.listarUsuarios().catch(() => undefined); // prepara a equipe da loja
    expect(await erro(bruno.salvarMinhaFoto('data:image/svg+xml;base64,PHN2Zz4='))).toMatchObject({ status: 400, message: MENSAGENS_FOTO.formato });
    expect(await erro(bruno.salvarMinhaFoto(`data:image/jpeg;base64,${'A'.repeat(LIMITES_FOTO.maxCaracteres)}`))).toMatchObject({ status: 400, message: MENSAGENS_FOTO.grande });
    expect((await bruno.meuPerfil()).foto ?? null).toBeNull();
  });

  it('excluir os dados de um usuário (LGPD) tira a foto também', async () => {
    const ana = api('ana', 'dono');
    const novo = await ana.criarUsuario({ nome: 'Paulo Lima', usuario: 'paulo', papel: 'vendedor', senha: 'senha-provisoria-1' });
    await api(novo.id, 'vendedor').salvarMinhaFoto(PNG);
    await ana.alterarUsuario(novo.id, { ativo: false });
    const removido = await ana.excluirDadosUsuario(novo.id);
    expect(removido.foto ?? null).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(PNG.slice(30));
  });

  it('o Adm. Sup grava a foto e a senha no lugar dele: não entra na equipe da loja', async () => {
    const r = relogio();
    await entrar('suporte', r.agora);
    const sup = api('adm-sup', 'super_admin', r.agora);
    await sup.salvarMinhaFoto(PNG);
    expect((await sup.meuPerfil()).foto).toBe(PNG);
    await sup.trocarMinhaSenha(SENHA_DEMO, 'uma frase nova e longa');
    const equipe = await api('ana', 'dono', r.agora).listarUsuarios();
    expect(equipe.map((u) => u.usuario)).not.toContain('suporte');
    // a senha nova vale para entrar (e a antiga não)
    expect((await entrar('suporte', r.agora, 'uma frase nova e longa')).ok).toBe(true);
    expect((await entrar('suporte', r.agora)).ok).toBe(false);
  });
});

describe('as minhas entradas e saídas', () => {
  it('cada entrada com a sua saída (pelo botão ou por falta de uso); a de agora fica "em uso"; só as minhas', async () => {
    const r = relogio('2026-11-24T11:00:00.000Z');
    await entrar('bruno', r.agora);
    r.ir('2026-11-24T15:30:00.000Z');
    await registrarSaidaDemo('loja-a', 'bruno', null, r.agora());
    r.ir('2026-11-25T11:02:00.000Z');
    await entrar('bruno', r.agora);
    await entrar('caio', r.agora); // outra pessoa: não aparece para o Bruno
    r.ir('2026-11-25T11:40:00.000Z');
    await registrarSaidaDemo('loja-a', 'bruno', 'inatividade', r.agora());
    r.ir('2026-11-25T17:00:00.000Z');
    await entrar('bruno', r.agora);

    const acessos = await api('bruno', 'vendedor', r.agora).meusAcessos();
    expect(acessos).toHaveLength(3);
    expect(acessos[0]).toMatchObject({ saida: null, como: null, atual: true });
    expect(acessos[1]).toMatchObject({ como: 'inatividade', atual: false });
    expect(acessos[2]).toMatchObject({ como: 'sair', atual: false });
    expect((await api('caio', 'administrador', r.agora).meusAcessos()).map((a) => a.atual)).toEqual([true]);
    // no histórico dos gestores, a saída por falta de uso tem o resumo
    const saidas = (await api('ana', 'dono', r.agora).listarAuditoria(20)).filter((h) => h.acao === 'sessao.saiu');
    expect(saidas.map((h) => h.resumo)).toEqual(['por falta de uso', '']);
  });

  it('sem login, nada', async () => {
    const semNinguem = criarApiLocal({ lojaId: 'loja-a', operador: null, exemplos: false, atrasoMs: 0 });
    expect(await erro(semNinguem.meusAcessos())).toMatchObject({ status: 401 });
    expect(await erro(semNinguem.salvarMinhaFoto(PNG))).toMatchObject({ status: 401 });
  });
});
