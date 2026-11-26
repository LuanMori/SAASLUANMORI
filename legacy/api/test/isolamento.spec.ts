// apps/api/test/isolamento.spec.ts
// Isolamento entre lojas, de ponta a ponta pela API (cookie -> sessão -> guarda -> service -> RLS).
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { criarAppTeste } from './apoio/app.js';
import { criarLoja, criarUsuario, limparBanco, poolAdmin, SENHA_TESTE } from './apoio/banco.js';
import { entrar } from './apoio/sessao.js';

describe('Isolamento entre lojas (API)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let lojaA: string;
  let lojaB: string;
  const sessoes: Record<string, string> = {};

  /** Cookie da pessoa padrão da loja (o mesmo login "caixa" existe nas duas lojas, com senhas próprias). */
  const token = (loja: 'lojaa' | 'lojab', quem: 'caixa' | 'dono' = 'caixa') => sessoes[`${quem}@${loja}`]!;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await criarAppTeste();
    admin = poolAdmin();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'lojaa');
    lojaB = await criarLoja(admin, 'Loja B', 'lojab');
    await criarUsuario(admin, lojaA, { usuario: 'caixa' });
    await criarUsuario(admin, lojaB, { usuario: 'caixa', senha: 'outra-senha-da-loja-b' });
    // A mesma pessoa, dona das duas lojas: um cadastro em cada loja, cada um com a sua senha.
    await criarUsuario(admin, lojaA, { usuario: 'dono', papel: 'dono' });
    await criarUsuario(admin, lojaB, { usuario: 'dono', papel: 'dono', senha: 'outra-senha-da-loja-b' });
    sessoes['caixa@lojaa'] = await entrar(app, 'lojaa', 'caixa');
    sessoes['caixa@lojab'] = await entrar(app, 'lojab', 'caixa', 'outra-senha-da-loja-b');
    sessoes['dono@lojaa'] = await entrar(app, 'lojaa', 'dono');
    sessoes['dono@lojab'] = await entrar(app, 'lojab', 'dono', 'outra-senha-da-loja-b');
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('produto criado na Loja A NÃO aparece para a Loja B', async () => {
    const criado = await http()
      .post('/produtos')
      .set('Cookie', token('lojaa'))
      .send({ nome: 'Ração Premium 15kg', codigoBarras: '7891000100103', precoCentavos: 18990 })
      .expect(201);
    expect(criado.body).toMatchObject({
      codigoInterno: '0001',
      codigoBarras: '7891000100103',
      nome: 'Ração Premium 15kg',
      precoCentavos: 18990,
    });
    expect(criado.body).not.toHaveProperty('lojaId');

    const vistoPorA = await http().get('/produtos').set('Cookie', token('lojaa')).expect(200);
    expect(vistoPorA.body.itens.map((p: { id: string }) => p.id)).toEqual([criado.body.id]);

    const vistoPorB = await http().get('/produtos').set('Cookie', token('lojab')).expect(200);
    expect(vistoPorB.body).toEqual({ itens: [] });
  });

  it('loja_id gravado é sempre o da sessão', async () => {
    const r = await http()
      .post('/produtos')
      .set('Cookie', token('lojab'))
      .send({ nome: 'Areia', precoCentavos: 2500 })
      .expect(201);
    const { rows } = await admin.query('SELECT loja_id FROM produtos WHERE id = $1', [r.body.id]);
    expect(rows).toEqual([{ loja_id: lojaB }]);
  });

  it.each(['lojaId', 'loja_id', 'id'])('recusa "%s" no corpo (400) e não grava nada', async (campo) => {
    const r = await http()
      .post('/produtos')
      .set('Cookie', token('lojaa'))
      .send({ nome: 'Invasor', precoCentavos: 100, [campo]: lojaB })
      .expect(400);
    expect(r.body.erros).toContainEqual({ campo, mensagem: 'Campo não permitido.' });
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM produtos');
    expect(rows[0].n).toBe(0);
  });

  it('o mesmo código de barras pode existir em lojas diferentes', async () => {
    const corpo = { nome: 'Coleira', codigoBarras: '7890000000017', precoCentavos: 3500 };
    await http().post('/produtos').set('Cookie', token('lojaa')).send(corpo).expect(201);
    await http().post('/produtos').set('Cookie', token('lojab')).send(corpo).expect(201);
  });

  it('cada loja tem a própria sequência de código interno', async () => {
    for (const nome of ['A1', 'A2', 'A3']) {
      await http().post('/produtos').set('Cookie', token('lojaa')).send({ nome, precoCentavos: 1 }).expect(201);
    }
    const b = await http().post('/produtos').set('Cookie', token('lojab')).send({ nome: 'B1', precoCentavos: 1 }).expect(201);
    expect(b.body.codigoInterno).toBe('0001');
  });

  it('a mesma pessoa em duas lojas vê, em cada login, só a loja daquele login', async () => {
    await http().post('/produtos').set('Cookie', token('lojaa', 'dono')).send({ nome: 'Só na A', precoCentavos: 1 }).expect(201);
    await http().post('/produtos').set('Cookie', token('lojab', 'dono')).send({ nome: 'Só na B', precoCentavos: 1 }).expect(201);

    const a = await http().get('/produtos').set('Cookie', token('lojaa', 'dono')).expect(200);
    const b = await http().get('/produtos').set('Cookie', token('lojab', 'dono')).expect(200);
    expect(a.body.itens.map((p: { nome: string }) => p.nome)).toEqual(['Só na A']);
    expect(b.body.itens.map((p: { nome: string }) => p.nome)).toEqual(['Só na B']);
  });

  it('a senha de uma loja não abre a outra (cadastros separados)', async () => {
    await http().post('/sessao').send({ loja: 'lojab', usuario: 'dono', senha: SENHA_TESTE }).expect(401);
  });

  it('trocar a loja dentro do cookie não dá acesso à outra loja', async () => {
    const adulterado = token('lojaa').replace(lojaA, lojaB);
    expect(adulterado).not.toBe(token('lojaa'));
    await http().get('/produtos').set('Cookie', adulterado).expect(401);
  });

  it('requisições simultâneas de lojas diferentes não se misturam (pool de conexões)', async () => {
    const N = 15;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        Promise.all([
          http().post('/produtos').set('Cookie', token('lojaa')).send({ nome: `A-${i}`, precoCentavos: i + 1 }).expect(201),
          http().post('/produtos').set('Cookie', token('lojab')).send({ nome: `B-${i}`, precoCentavos: i + 1 }).expect(201),
        ]),
      ),
    );

    const leituras = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const loja = i % 2 === 0 ? 'lojaa' : 'lojab';
        return http().get('/produtos').set('Cookie', token(loja)).expect(200).then((r) => ({ loja, r }));
      }),
    );
    for (const { loja, r } of leituras) {
      const prefixo = loja === 'lojaa' ? 'A-' : 'B-';
      expect(r.body.itens).toHaveLength(N);
      expect(r.body.itens.every((p: { nome: string }) => p.nome.startsWith(prefixo))).toBe(true);
    }
  });
});
