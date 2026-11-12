// apps/api/test/autenticacao.spec.ts
// Guarda de autenticação: o que a API aceita e o que recusa.
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import {
  type ParChaves,
  emitirToken,
  forjarToken,
  gerarParChaves,
  iniciarServidorJwks,
} from './apoio/auth0-falso.js';
import { criarAppTeste } from './apoio/app.js';
import { cadastrarUsuario, criarLoja, limparBanco, poolAdmin } from './apoio/banco.js';

describe('Autenticação (Auth0 Organizations)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let chave: ParChaves;
  let jwks: Awaited<ReturnType<typeof iniciarServidorJwks>>;
  let lojaA: string;

  const http = () => request(app.getHttpServer());
  const pedir = (authorization?: string) => {
    const r = http().get('/produtos');
    return authorization === undefined ? r : r.set('Authorization', authorization);
  };
  const valido = { sub: 'auth0|vendedor1', org_id: 'org_lojaA' };

  beforeAll(async () => {
    chave = gerarParChaves();
    jwks = await iniciarServidorJwks([chave]);
    app = await criarAppTeste(jwks.url);
    admin = poolAdmin();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'org_lojaA');
    await criarLoja(admin, 'Loja Inativa', 'org_inativa', false);
    await cadastrarUsuario(admin, lojaA, valido.sub);
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
    await jwks.fechar();
  });

  it('token válido da loja -> 200', async () => {
    await pedir(`Bearer ${emitirToken(chave, valido)}`).expect(200);
  });

  describe('401 — não autenticado', () => {
    const casos: [string, () => string | undefined][] = [
      ['sem cabeçalho Authorization', () => undefined],
      ['esquema diferente de Bearer', () => `Basic ${emitirToken(chave, valido)}`],
      ['Bearer vazio', () => 'Bearer '],
      ['token malformado', () => 'Bearer abc.def.ghi'],
      ['assinado por outra chave (mesmo kid)', () => `Bearer ${emitirToken({ ...gerarParChaves(), kid: chave.kid }, valido)}`],
      ['kid que não está no JWKS', () => `Bearer ${emitirToken(gerarParChaves(), valido)}`],
      ['expirado', () => `Bearer ${emitirToken(chave, valido, { expiraEmSegundos: -60 })}`],
      ['audience de outra API', () => `Bearer ${emitirToken(chave, valido, { audience: 'https://outra.api' })}`],
      ['issuer de outro tenant Auth0', () => `Bearer ${emitirToken(chave, valido, { issuer: 'https://outro.auth0.com/' })}`],
      ['alg=none', () => `Bearer ${forjarToken('none', valido, chave.kid)}`],
      [
        'HS256 usando a chave pública como segredo',
        () =>
          `Bearer ${forjarToken('HS256', valido, chave.kid, chave.publica.export({ type: 'spki', format: 'pem' }).toString())}`,
      ],
      ['sem sub', () => `Bearer ${emitirToken(chave, { org_id: 'org_lojaA' })}`],
    ];

    it.each(casos)('%s', async (_nome, montar) => {
      const r = await pedir(montar()).expect(401);
      expect(Object.keys(r.body).sort()).toEqual(['mensagem', 'status']);
      expect(JSON.stringify(r.body)).not.toMatch(/jwt|jsonwebtoken|stack|signature|kid/i);
    });
  });

  describe('403 — autenticado, mas sem acesso', () => {
    it('token sem org_id (login fora de uma loja)', async () => {
      const r = await pedir(`Bearer ${emitirToken(chave, { sub: 'auth0|x' })}`).expect(403);
      expect(r.body.mensagem).toBe('Sua conta não está vinculada a uma loja.');
    });

    it('org_id que não é loja cadastrada e loja inativa recebem a MESMA resposta', async () => {
      const desconhecida = await pedir(`Bearer ${emitirToken(chave, { sub: 'auth0|x', org_id: 'org_naoexiste' })}`).expect(403);
      const inativa = await pedir(`Bearer ${emitirToken(chave, { sub: 'auth0|x', org_id: 'org_inativa' })}`).expect(403);
      expect(desconhecida.body).toEqual(inativa.body);
    });

    it('usuário desativado na loja', async () => {
      await cadastrarUsuario(admin, lojaA, 'auth0|demitido', 'vendedor', false);
      const r = await pedir(`Bearer ${emitirToken(chave, { sub: 'auth0|demitido', org_id: 'org_lojaA' })}`).expect(403);
      expect(r.body.mensagem).toBe('Seu acesso a esta loja está desativado.');
    });
  });

  describe('só entra quem o dono cadastrou', () => {
    const MSG = 'Seu acesso a esta loja ainda não foi liberado. Peça ao dono da loja para cadastrar você.';

    it('membro da Organization no Auth0, mas sem cadastro na loja -> 403, e nada é criado', async () => {
      const r = await pedir(`Bearer ${emitirToken(chave, { sub: 'auth0|novato', org_id: 'org_lojaA' })}`).expect(403);
      expect(r.body).toEqual({ status: 403, mensagem: MSG });
      const { rows } = await admin.query(`SELECT count(*)::int AS n FROM usuarios WHERE auth0_sub = 'auth0|novato'`);
      expect(rows[0].n).toBe(0);
    });

    it('cadastro em OUTRA loja não vale nesta', async () => {
      const lojaB = await criarLoja(admin, 'Loja B', 'org_lojaB');
      await cadastrarUsuario(admin, lojaB, 'auth0|so-da-b', 'dono');
      await pedir(`Bearer ${emitirToken(chave, { sub: 'auth0|so-da-b', org_id: 'org_lojaB' })}`).expect(200);
      const r = await pedir(`Bearer ${emitirToken(chave, { sub: 'auth0|so-da-b', org_id: 'org_lojaA' })}`).expect(403);
      expect(r.body.mensagem).toBe(MSG);
    });

    it('acessos simultâneos de quem não foi cadastrado continuam negados', async () => {
      const t = `Bearer ${emitirToken(chave, { sub: 'auth0|insistente', org_id: 'org_lojaA' })}`;
      const respostas = await Promise.all(Array.from({ length: 10 }, () => pedir(t)));
      expect(respostas.map((r) => r.status)).toEqual(Array(10).fill(403));
    });
  });

  describe('erros de requisição', () => {
    it('JSON malformado -> 400 com mensagem própria', async () => {
      const r = await http()
        .post('/produtos')
        .set('Authorization', `Bearer ${emitirToken(chave, valido)}`)
        .set('Content-Type', 'application/json')
        .send('{"nome":')
        .expect(400);
      expect(r.body).toEqual({ status: 400, mensagem: 'JSON inválido.' });
    });

    it('rota inexistente -> 404 no formato padrão', async () => {
      const r = await http().get('/nao-existe').expect(404);
      expect(r.body).toEqual({ status: 404, mensagem: 'Rota não encontrada.' });
    });
  });
});
