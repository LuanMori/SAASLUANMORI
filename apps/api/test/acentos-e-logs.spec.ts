// apps/api/test/acentos-e-logs.spec.ts
// Item 4.5 (acentos de ponta a ponta) e item 5.3 (logs em JSON, sem dado pessoal).
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { desviarLog } from '../src/http/log.js';
import { criarAppTeste } from './apoio/app.js';
import { criarLoja, criarUsuario, limparBanco, poolAdmin, SENHA_TESTE } from './apoio/banco.js';
import { entrar } from './apoio/sessao.js';

describe('Acentos de ponta a ponta (UTF-8)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let cookie: string;

  beforeAll(async () => {
    app = await criarAppTeste();
    admin = poolAdmin();
    await limparBanco(admin);
    const loja = await criarLoja(admin, 'Pet Shop São João', 'saojoao');
    await criarUsuario(admin, loja, { usuario: 'joao', nome: 'João Conceição' });
    cookie = await entrar(app, 'saojoao', 'joao');
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('nome com acento, cedilha e travessão volta idêntico (API -> banco -> API)', async () => {
    const nome = 'Ração Pássaro Açaí — Coração & Ñandú 1kg';
    const criado = await request(app.getHttpServer()).post('/produtos').set('Cookie', cookie).send({ nome, precoCentavos: 1990 }).expect(201);
    expect(criado.body.nome).toBe(nome);
    expect(criado.headers['content-type']).toMatch(/charset=utf-8/i);
    const lido = await request(app.getHttpServer()).get('/produtos').set('Cookie', cookie).expect(200);
    expect(lido.body.itens[0].nome).toBe(nome);
    // gravado em UTF-8 de verdade no banco (bytes de "ç" = c3 a7), não "Ã§"
    const { rows } = await admin.query(`SELECT nome, encode(convert_to(nome, 'UTF8'), 'hex') AS hex FROM produtos`);
    expect(rows[0].nome).toBe(nome);
    expect(rows[0].hex).toContain('c3a7');
  });

  it('o "ç" do Mac (c + cedilha) é guardado igual ao do Windows', async () => {
    await request(app.getHttpServer()).post('/produtos').set('Cookie', cookie).send({ nome: 'Pão de Maçã', precoCentavos: 500 }).expect(201);
    const { rows } = await admin.query(`SELECT count(*)::int AS n FROM produtos WHERE nome = 'Pão de Maçã'`);
    expect(rows[0].n).toBe(1);
  });

  it('a sessão e a loja com acento aparecem certas', async () => {
    const r = await request(app.getHttpServer()).get('/sessao').set('Cookie', cookie).expect(200);
    expect(r.body).toMatchObject({ usuario: { nome: 'João Conceição' }, loja: { nome: 'Pet Shop São João' } });
  });
});

describe('Logs em JSON, sem dado pessoal', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  const linhas: string[] = [];

  beforeAll(async () => {
    app = await criarAppTeste({ logNivel: 'info' });
    admin = poolAdmin();
    await limparBanco(admin);
    const loja = await criarLoja(admin, 'Loja A', 'lojaa');
    await criarUsuario(admin, loja, { usuario: 'ana', nome: 'Ana Sigilosa' });
    desviarLog((linha) => linhas.push(linha));
  });

  afterAll(async () => {
    desviarLog(null);
    await app.close();
    await admin.end();
  });

  it('uma linha JSON por requisição, com id, rota (padrão), status e tempo; nada de senha, cookie ou nome', async () => {
    const http = () => request(app.getHttpServer());
    await http().post('/sessao').set('X-Forwarded-For', '198.51.100.77').send({ loja: 'lojaa', usuario: 'ana', senha: 'senha-errada-secreta' }).expect(401);
    const r = await http().post('/sessao').send({ loja: 'lojaa', usuario: 'ana', senha: SENHA_TESTE }).expect(200);
    const cookie = String(r.headers['set-cookie']).split(';')[0]!;
    await http().post('/produtos').set('Cookie', cookie).set('X-Request-Id', 'pedido-12345678').send({ nome: 'Produto Confidencial', precoCentavos: 100 }).expect(201);

    const eventos = linhas.map((l) => JSON.parse(l) as Record<string, unknown>);
    const req = eventos.filter((e) => e.evento === 'requisicao');
    expect(req.map((e) => [e.metodo, e.rota, e.status])).toEqual([
      ['POST', '/sessao', 401],
      ['POST', '/sessao', 200],
      ['POST', '/produtos', 201],
    ]);
    const produto = req[2]!;
    expect(produto).toMatchObject({ nivel: 'info', id: 'pedido-12345678', loja: expect.any(String), usuario: expect.any(String), ms: expect.any(Number) });
    expect(Date.parse(String(produto.hora))).not.toBeNaN();

    const tudo = linhas.join('\n');
    for (const segredo of ['senha-errada-secreta', SENHA_TESTE, cookie.split('=')[1]!, 'Ana Sigilosa', 'Produto Confidencial', 'ana']) {
      expect(tudo).not.toContain(segredo);
    }
  });
});
