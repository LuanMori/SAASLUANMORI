// apps/api/test/adm-sup.spec.ts — o Adm. Sup (super_admin, usuário mestre; pedido do Luan, 23/11/2026): entra em
// qualquer loja, não aparece na lista, aparece como "Suporte" no histórico e só ele cadastra o Dono e o Administrador.
// A API (saas_app) continua sem enxergar a linha dele: só as funções app_suporte_* do banco.
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { cadastrarSuporte } from '../scripts/cadastrar-suporte.js';
import { criarAppTeste } from './apoio/app.js';
import { comoApp, criarLoja, criarUsuario, limparBanco, poolAdmin, poolApp } from './apoio/banco.js';
import { BANCO_TESTE, urlDoBanco } from './apoio/config.js';
import { entrar } from './apoio/sessao.js';

const URL = urlDoBanco(BANCO_TESTE);
const SO_SUP = 'O Dono e o Administrador só são cadastrados pelo suporte (Adm. Sup), na implantação do sistema.';

describe('Adm. Sup (super_admin)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let banco: pg.Pool;
  let lojaA: string;
  let senha: string;
  const http = () => request(app.getHttpServer());
  const entrarSuporte = (loja: string, s = senha) => http().post('/sessao').send({ loja, usuario: 'suporte', senha: s });

  beforeAll(async () => {
    app = await criarAppTeste();
    admin = poolAdmin();
    banco = poolApp(2);
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'lojaa');
    await criarLoja(admin, 'Loja B', 'lojab');
    await criarUsuario(admin, lojaA, { usuario: 'dona', nome: 'Dona Maria', papel: 'dono' });
    senha = (await cadastrarSuporte(URL, { usuario: 'suporte', acao: 'cadastrar' })).senha!;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
    await banco.end();
  });

  it('entra em qualquer loja, com o papel super_admin e o nome "Suporte"', async () => {
    const a = await entrarSuporte('lojaa').expect(200);
    expect(a.body.usuario).toMatchObject({ usuario: 'suporte', nome: 'Suporte', papel: 'super_admin', permissoes: [] });
    const b = await entrarSuporte('lojab').expect(200);
    expect(b.body.loja).toEqual({ nome: 'Loja B', subdominio: 'lojab' });
    const cookie = (a.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect((await http().get('/sessao').set('Cookie', cookie).expect(200)).body.usuario.papel).toBe('super_admin');
  });

  it('não aparece na lista; cadastra o Dono e o Administrador; o histórico diz "Suporte"', async () => {
    const r = await entrarSuporte('lojaa').expect(200);
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const novo = { nome: 'Abel', usuario: 'abel', papel: 'administrador', senha: 'senha-inicial-88' };
    await http().post('/usuarios').set('Cookie', cookie).send(novo).expect(201);
    await http().post('/usuarios').set('Cookie', cookie).send({ ...novo, nome: 'Dora', usuario: 'dora', papel: 'dono' }).expect(201);
    const lista = await http().get('/usuarios').set('Cookie', cookie).expect(200);
    const itens = (lista.body.itens ?? lista.body) as { usuario: string }[];
    expect(itens.map((u) => u.usuario).sort()).toEqual(['abel', 'dona', 'dora']);
    // a Dona não cadastra Administrador; o histórico mostra quem fez como "Suporte"
    const dona = await entrar(app, 'lojaa', 'dona');
    expect((await http().post('/usuarios').set('Cookie', dona).send({ ...novo, usuario: 'outro' }).expect(403)).body.mensagem).toBe(SO_SUP);
    const hist = await http().get('/auditoria').set('Cookie', dona).expect(200);
    const criados = hist.body.itens.filter((i: { acao: string }) => i.acao === 'usuario.criado');
    expect(criados.map((i: { quem: string; resumo: string }) => [i.quem, i.resumo])).toEqual([
      ['Suporte', 'Dono'],
      ['Suporte', 'Administrador'],
    ]);
  });

  it('a API não enxerga a linha do suporte; ninguém da loja usa o login dele; ele não troca a senha pela loja', async () => {
    const visiveis = await comoApp(banco, lojaA, (c) => c.query(`SELECT count(*)::int AS n FROM usuarios WHERE loja_id IS NULL`));
    expect(visiveis.rows[0].n).toBe(0);
    const dona = await entrar(app, 'lojaa', 'dona');
    await http().post('/usuarios').set('Cookie', dona).send({ nome: 'Falso', usuario: 'suporte', papel: 'vendedor', senha: 'senha-inicial-88' }).expect(409);
    const r = await entrarSuporte('lojaa').expect(200);
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await http().post('/sessao/senha').set('Cookie', cookie).send({ senhaAtual: senha, senhaNova: 'outra-senha-muito-boa-1' }).expect(403);
  });

  it('senha errada conta como a de todos; desativado pelo script, não entra mais e a sessão cai', async () => {
    await entrarSuporte('lojaa', 'errada-123456').expect(401);
    const { rows } = await admin.query(`SELECT tentativas_erradas FROM usuarios WHERE usuario = 'suporte' AND loja_id IS NULL`);
    expect(rows[0].tentativas_erradas).toBe(1);
    const r = await entrarSuporte('lojaa').expect(200);
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await cadastrarSuporte(URL, { usuario: 'suporte', acao: 'desativar' });
    await http().get('/sessao').set('Cookie', cookie).expect(401);
    await entrarSuporte('lojaa').expect(403);
    const nova = (await cadastrarSuporte(URL, { usuario: 'suporte', acao: 'redefinir-senha' })).senha!;
    await cadastrarSuporte(URL, { usuario: 'suporte', acao: 'reativar' });
    await entrarSuporte('lojaa', nova).expect(200);
    await expect(cadastrarSuporte(URL, { usuario: 'suporte', acao: 'cadastrar' })).rejects.toThrow(/já existe/);
    // o login do suporte vale em todas as lojas: não pode ser o de alguém de uma loja
    await expect(cadastrarSuporte(URL, { usuario: 'dona', acao: 'cadastrar' })).rejects.toThrow(/já é de um usuário da loja Loja A/);
  });

  it('nova senha pelo script encerra as sessões abertas do suporte em todas as lojas', async () => {
    const cookieDe = (r: request.Response) => (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const naA = cookieDe(await entrarSuporte('lojaa').expect(200));
    const naB = cookieDe(await entrarSuporte('lojab').expect(200));
    const nova = (await cadastrarSuporte(URL, { usuario: 'suporte', acao: 'redefinir-senha' })).senha!;
    expect(nova).not.toBe(senha);
    await http().get('/sessao').set('Cookie', naA).expect(401);
    await http().get('/sessao').set('Cookie', naB).expect(401);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS abertas FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE u.usuario = 'suporte' AND u.loja_id IS NULL AND s.encerrada_em IS NULL`,
    );
    expect(rows[0].abertas).toBe(0);
    await entrarSuporte('lojab', senha).expect(401);
    await entrarSuporte('lojab', nova).expect(200);
  });
});
