// apps/api/test/codigos.spec.ts
// Código interno (do sistema), código de barras (só números) e preço > 0,
// pela API e no banco. Regras: DaniPets V8.6/V9.2, confirmadas pelo Luan.
import type { INestApplication } from '@nestjs/common';
import { MENSAGEM_PRECO_ZERO } from '@saas/core';
import type pg from 'pg';
import request from 'supertest';
import { type ParChaves, emitirToken, gerarParChaves, iniciarServidorJwks } from './apoio/auth0-falso.js';
import { criarAppTeste } from './apoio/app.js';
import { cadastrarUsuario, comoApp, criarLoja, criarProdutoDireto, limparBanco, poolAdmin, poolApp } from './apoio/banco.js';

const SEM_REGRA = { code: '23514' }; // check_violation

describe('Códigos e preço de produto', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let appDb: pg.Pool;
  let chave: ParChaves;
  let jwks: Awaited<ReturnType<typeof iniciarServidorJwks>>;
  let lojaA: string;

  const auth = () => `Bearer ${emitirToken(chave, { sub: 'auth0|vendedor', org_id: 'org_lojaA' })}`;
  const criar = (corpo: object) => request(app.getHttpServer()).post('/produtos').set('Authorization', auth()).send(corpo);

  beforeAll(async () => {
    chave = gerarParChaves();
    jwks = await iniciarServidorJwks([chave]);
    app = await criarAppTeste(jwks.url);
    admin = poolAdmin();
    appDb = poolApp();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'org_lojaA');
    await cadastrarUsuario(admin, lojaA, 'auth0|vendedor', 'vendedor');
  });

  afterAll(async () => {
    await app.close();
    await appDb.end();
    await admin.end();
    await jwks.fechar();
  });

  describe('código interno', () => {
    it('é gerado em sequência: 0001, 0002, 0003', async () => {
      const codigos = [];
      for (const nome of ['Um', 'Dois', 'Três']) codigos.push((await criar({ nome, precoCentavos: 100 }).expect(201)).body.codigoInterno);
      expect(codigos).toEqual(['0001', '0002', '0003']);
    });

    it('continua do maior código existente, e passa de 9999 para 10000', async () => {
      await admin.query(
        `INSERT INTO produtos (id, loja_id, codigo_interno, nome, preco_centavos) VALUES (gen_random_uuid(), $1, '9999', 'Antigo', 100)`,
        [lojaA],
      );
      expect((await criar({ nome: 'Novo', precoCentavos: 100 }).expect(201)).body.codigoInterno).toBe('10000');
    });

    it('pula número que já é código de barras de outro produto', async () => {
      await criarProdutoDireto(admin, lojaA, 'Primeiro'); // 0001
      await admin.query(
        `INSERT INTO produtos (id, loja_id, codigo_interno, codigo_barras, nome, preco_centavos)
         VALUES (gen_random_uuid(), $1, '0050', '0051', 'Barra curta', 100)`,
        [lojaA],
      );
      // maior = 0050 -> 0051 já é código de barras -> 0052
      expect((await criar({ nome: 'Seguinte', precoCentavos: 100 }).expect(201)).body.codigoInterno).toBe('0052');
    });

    it('não fica igual ao código de barras do próprio produto', async () => {
      const r = await criar({ nome: 'Estranho', codigoBarras: '0001', precoCentavos: 100 }).expect(201);
      expect(r.body).toMatchObject({ codigoInterno: '0002', codigoBarras: '0001' });
    });

    it('não pode ser enviado pelo cliente', async () => {
      const r = await criar({ nome: 'X', precoCentavos: 100, codigoInterno: '9999' }).expect(400);
      expect(r.body.erros).toEqual([{ campo: 'codigoInterno', mensagem: 'O código interno é gerado pelo sistema.' }]);
    });

    it('cadastros simultâneos na mesma loja: sem repetir e sem buracos', async () => {
      const N = 25;
      const respostas = await Promise.all(Array.from({ length: N }, (_, i) => criar({ nome: `P${i}`, precoCentavos: 100 })));
      expect(respostas.map((r) => r.status)).toEqual(Array(N).fill(201));
      const codigos = respostas.map((r) => r.body.codigoInterno as string).sort();
      expect(codigos).toEqual(Array.from({ length: N }, (_, i) => String(i + 1).padStart(4, '0')));
    });

    it('cadastro recusado não gasta número', async () => {
      await criar({ nome: 'A', codigoBarras: '7891', precoCentavos: 100 }).expect(201); // 0001
      await criar({ nome: 'B', codigoBarras: '7891', precoCentavos: 100 }).expect(409);
      expect((await criar({ nome: 'C', precoCentavos: 100 }).expect(201)).body.codigoInterno).toBe('0002');
    });
  });

  describe('código de barras', () => {
    it('aceita só números e preserva zeros à esquerda', async () => {
      const r = await criar({ nome: 'Areia', codigoBarras: '0012345678905', precoCentavos: 100 }).expect(201);
      expect(r.body.codigoBarras).toBe('0012345678905');
    });

    it.each(['COL-01', '789 1234', 'ABC'])('recusa "%s" (400)', async (codigoBarras) => {
      const r = await criar({ nome: 'X', codigoBarras, precoCentavos: 100 }).expect(400);
      expect(r.body.erros).toContainEqual({ campo: 'codigoBarras', mensagem: 'O código de barras deve ter só números.' });
    });

    it('repetido na mesma loja -> 409 dizendo em qual produto está', async () => {
      await criar({ nome: 'Ração Gold 10kg', codigoBarras: '7896181212345', precoCentavos: 100 }).expect(201);
      const r = await criar({ nome: 'Outra ração', codigoBarras: '7896181212345', precoCentavos: 100 }).expect(409);
      expect(r.body).toEqual({
        status: 409,
        mensagem: 'Código de barras repetido: 7896181212345 já está vinculado ao produto "Ração Gold 10kg".',
        erros: [{ campo: 'codigoBarras', mensagem: 'Já usado em "Ração Gold 10kg".' }],
      });
    });

    it('igual ao código interno de outro produto -> 409 (o leitor não saberia qual é)', async () => {
      await criar({ nome: 'Petisco', precoCentavos: 100 }).expect(201); // 0001
      const r = await criar({ nome: 'Brinquedo', codigoBarras: '0001', precoCentavos: 100 }).expect(409);
      expect(r.body.mensagem).toBe('Código de barras repetido: 0001 já está vinculado ao produto "Petisco".');
    });

    it('o conflito só considera a própria loja', async () => {
      const lojaB = await criarLoja(admin, 'Loja B', 'org_lojaB');
      await criarProdutoDireto(admin, lojaB, 'Produto da B', '7890000000017');
      await criar({ nome: 'Produto da A', codigoBarras: '7890000000017', precoCentavos: 100 }).expect(201);
    });
  });

  describe('preço', () => {
    it('zero é recusado pela API, com a orientação do brinde', async () => {
      const r = await criar({ nome: 'Brinde', precoCentavos: 0 }).expect(400);
      expect(r.body.erros).toEqual([{ campo: 'precoCentavos', mensagem: MENSAGEM_PRECO_ZERO }]);
    });
  });

  describe('o banco também recusa (mesmo que a API seja contornada)', () => {
    const inserir = (cols: string, vals: string) =>
      comoApp(appDb, lojaA, (c) => c.query(`INSERT INTO produtos (id, loja_id, ${cols}) VALUES (gen_random_uuid(), $1, ${vals})`, [lojaA]));

    it('preço zero', async () => {
      await expect(inserir('codigo_interno, nome, preco_centavos', `'0001', 'X', 0`)).rejects.toMatchObject(SEM_REGRA);
    });

    it('código de barras com letra', async () => {
      await expect(inserir('codigo_interno, codigo_barras, nome, preco_centavos', `'0001', 'ABC1', 'X', 1`)).rejects.toMatchObject(
        SEM_REGRA,
      );
    });

    it('código interno com letra ou ausente', async () => {
      await expect(inserir('codigo_interno, nome, preco_centavos', `'A001', 'X', 1`)).rejects.toMatchObject(SEM_REGRA);
      await expect(inserir('nome, preco_centavos', `'X', 1`)).rejects.toMatchObject({ code: '23502' }); // not_null_violation
    });

    it('código interno repetido na loja', async () => {
      await inserir('codigo_interno, nome, preco_centavos', `'0001', 'X', 1`);
      await expect(inserir('codigo_interno, nome, preco_centavos', `'0001', 'Y', 1`)).rejects.toMatchObject({ code: '23505' });
    });
  });
});
