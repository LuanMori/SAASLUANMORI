// apps/api/test/isolamento.spec.ts
// Isolamento entre lojas, de ponta a ponta pela API (token -> guarda -> service -> RLS).
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { type ParChaves, emitirToken, gerarParChaves, iniciarServidorJwks } from './apoio/auth0-falso.js';
import { criarAppTeste } from './apoio/app.js';
import { cadastrarUsuario, criarLoja, limparBanco, poolAdmin } from './apoio/banco.js';

const DONO_DE_DUAS = 'auth0|dono-de-duas-lojas';

describe('Isolamento entre lojas (API)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let chave: ParChaves;
  let jwks: Awaited<ReturnType<typeof iniciarServidorJwks>>;
  let lojaA: string;
  let lojaB: string;

  const subPadrao = (org: string) => `auth0|pessoa-${org}`;
  const token = (org: string, sub = subPadrao(org)) => `Bearer ${emitirToken(chave, { sub, org_id: org })}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    chave = gerarParChaves();
    jwks = await iniciarServidorJwks([chave]);
    app = await criarAppTeste(jwks.url);
    admin = poolAdmin();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'org_lojaA');
    lojaB = await criarLoja(admin, 'Loja B', 'org_lojaB');
    await cadastrarUsuario(admin, lojaA, subPadrao('org_lojaA'));
    await cadastrarUsuario(admin, lojaB, subPadrao('org_lojaB'));
    await cadastrarUsuario(admin, lojaA, DONO_DE_DUAS, 'dono');
    await cadastrarUsuario(admin, lojaB, DONO_DE_DUAS, 'dono');
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
    await jwks.fechar();
  });

  it('produto criado na Loja A NÃO aparece para a Loja B', async () => {
    const criado = await http()
      .post('/produtos')
      .set('Authorization', token('org_lojaA'))
      .send({ nome: 'Ração Premium 15kg', codigoBarras: '7891000100103', precoCentavos: 18990 })
      .expect(201);
    expect(criado.body).toMatchObject({
      codigoInterno: '0001',
      codigoBarras: '7891000100103',
      nome: 'Ração Premium 15kg',
      precoCentavos: 18990,
    });
    expect(criado.body).not.toHaveProperty('lojaId');

    const vistoPorA = await http().get('/produtos').set('Authorization', token('org_lojaA')).expect(200);
    expect(vistoPorA.body.itens.map((p: { id: string }) => p.id)).toEqual([criado.body.id]);

    const vistoPorB = await http().get('/produtos').set('Authorization', token('org_lojaB')).expect(200);
    expect(vistoPorB.body).toEqual({ itens: [] });
  });

  it('loja_id gravado é sempre o do token', async () => {
    const r = await http()
      .post('/produtos')
      .set('Authorization', token('org_lojaB'))
      .send({ nome: 'Areia', precoCentavos: 2500 })
      .expect(201);
    const { rows } = await admin.query('SELECT loja_id FROM produtos WHERE id = $1', [r.body.id]);
    expect(rows).toEqual([{ loja_id: lojaB }]);
  });

  it.each(['lojaId', 'loja_id', 'id'])('recusa "%s" no corpo (400) e não grava nada', async (campo) => {
    const r = await http()
      .post('/produtos')
      .set('Authorization', token('org_lojaA'))
      .send({ nome: 'Invasor', precoCentavos: 100, [campo]: lojaB })
      .expect(400);
    expect(r.body.erros).toContainEqual({ campo, mensagem: 'Campo não permitido.' });
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM produtos');
    expect(rows[0].n).toBe(0);
  });

  it('o mesmo código de barras pode existir em lojas diferentes', async () => {
    const corpo = { nome: 'Coleira', codigoBarras: '7890000000017', precoCentavos: 3500 };
    await http().post('/produtos').set('Authorization', token('org_lojaA')).send(corpo).expect(201);
    await http().post('/produtos').set('Authorization', token('org_lojaB')).send(corpo).expect(201);
  });

  it('cada loja tem a própria sequência de código interno', async () => {
    for (const nome of ['A1', 'A2', 'A3']) {
      await http().post('/produtos').set('Authorization', token('org_lojaA')).send({ nome, precoCentavos: 1 }).expect(201);
    }
    const b = await http().post('/produtos').set('Authorization', token('org_lojaB')).send({ nome: 'B1', precoCentavos: 1 }).expect(201);
    expect(b.body.codigoInterno).toBe('0001');
  });

  it('a mesma pessoa em duas lojas vê, em cada login, só a loja do token', async () => {
    const sub = DONO_DE_DUAS;
    await http().post('/produtos').set('Authorization', token('org_lojaA', sub)).send({ nome: 'Só na A', precoCentavos: 1 }).expect(201);
    await http().post('/produtos').set('Authorization', token('org_lojaB', sub)).send({ nome: 'Só na B', precoCentavos: 1 }).expect(201);

    const a = await http().get('/produtos').set('Authorization', token('org_lojaA', sub)).expect(200);
    const b = await http().get('/produtos').set('Authorization', token('org_lojaB', sub)).expect(200);
    expect(a.body.itens.map((p: { nome: string }) => p.nome)).toEqual(['Só na A']);
    expect(b.body.itens.map((p: { nome: string }) => p.nome)).toEqual(['Só na B']);
  });

  it('requisições simultâneas de lojas diferentes não se misturam (pool de conexões)', async () => {
    const N = 15;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        Promise.all([
          http().post('/produtos').set('Authorization', token('org_lojaA')).send({ nome: `A-${i}`, precoCentavos: i + 1 }).expect(201),
          http().post('/produtos').set('Authorization', token('org_lojaB')).send({ nome: `B-${i}`, precoCentavos: i + 1 }).expect(201),
        ]),
      ),
    );

    const leituras = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const org = i % 2 === 0 ? 'org_lojaA' : 'org_lojaB';
        return http().get('/produtos').set('Authorization', token(org)).expect(200).then((r) => ({ org, r }));
      }),
    );
    for (const { org, r } of leituras) {
      const prefixo = org === 'org_lojaA' ? 'A-' : 'B-';
      expect(r.body.itens).toHaveLength(N);
      expect(r.body.itens.every((p: { nome: string }) => p.nome.startsWith(prefixo))).toBe(true);
    }
  });
});
