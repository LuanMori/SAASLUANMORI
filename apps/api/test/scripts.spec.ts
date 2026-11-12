// apps/api/test/scripts.spec.ts
// Script de cadastro de pessoas na loja (o "dono cadastra", até a Fase 5.7).
import type pg from 'pg';
import { cadastrarUsuario } from '../scripts/cadastrar-usuario.js';
import { lerSeedLojas } from '../scripts/seed-dev.js';
import { criarLoja, limparBanco, poolAdmin } from './apoio/banco.js';
import { BANCO_TESTE, urlDoBanco } from './apoio/config.js';

const URL = urlDoBanco(BANCO_TESTE);

describe('scripts/cadastrar-usuario', () => {
  let admin: pg.Pool;
  let lojaA: string;

  const usuarios = async () =>
    (await admin.query('SELECT loja_id, auth0_sub, papel, ativo FROM usuarios ORDER BY auth0_sub')).rows;

  beforeAll(() => {
    admin = poolAdmin();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'org_lojaA');
  });

  afterAll(async () => {
    await admin.end();
  });

  it('cadastra, muda o papel e desativa', async () => {
    expect(await cadastrarUsuario(URL, { org: 'org_lojaA', sub: 'auth0|maria', papel: 'vendedor' })).toBe(
      'auth0|maria cadastrado na loja Loja A como vendedor.',
    );
    await cadastrarUsuario(URL, { org: 'org_lojaA', sub: 'auth0|maria', papel: 'dono' });
    expect(await usuarios()).toEqual([{ loja_id: lojaA, auth0_sub: 'auth0|maria', papel: 'dono', ativo: true }]);

    await cadastrarUsuario(URL, { org: 'org_lojaA', sub: 'auth0|maria', desativar: true });
    expect((await usuarios())[0].ativo).toBe(false);

    // cadastrar de novo reativa
    await cadastrarUsuario(URL, { org: 'org_lojaA', sub: 'auth0|maria', papel: 'vendedor' });
    expect((await usuarios())[0]).toMatchObject({ papel: 'vendedor', ativo: true });
  });

  it('recusa loja desconhecida, papel inválido e super_admin', async () => {
    await expect(cadastrarUsuario(URL, { org: 'org_nao', sub: 'auth0|x', papel: 'dono' })).rejects.toThrow(/Nenhuma loja/);
    await expect(cadastrarUsuario(URL, { org: 'org_lojaA', sub: 'auth0|x', papel: 'chefe' as never })).rejects.toThrow(/--papel/);
    await expect(cadastrarUsuario(URL, { org: 'org_lojaA', sub: 'auth0|x', papel: 'super_admin' as never })).rejects.toThrow(/--papel/);
    await expect(cadastrarUsuario(URL, { org: 'org_lojaA', sub: '  ', papel: 'dono' })).rejects.toThrow(/--sub/);
    expect(await usuarios()).toEqual([]);
  });

  it('desativar quem não está cadastrado dá erro e não cria nada', async () => {
    await expect(cadastrarUsuario(URL, { org: 'org_lojaA', sub: 'auth0|fantasma', desativar: true })).rejects.toThrow(
      /não está cadastrado/,
    );
    expect(await usuarios()).toEqual([]);
  });
});

describe('scripts/seed-dev', () => {
  it('lê SEED_LOJAS e recusa formato inválido', () => {
    expect(lerSeedLojas('Loja A=org_abc123; Loja B = org_DEF456 ;')).toEqual([
      { nome: 'Loja A', auth0OrgId: 'org_abc123' },
      { nome: 'Loja B', auth0OrgId: 'org_DEF456' },
    ]);
    expect(() => lerSeedLojas('Loja A=abc')).toThrow(/inválida/);
    expect(() => lerSeedLojas('=org_abc')).toThrow(/inválida/);
  });
});
