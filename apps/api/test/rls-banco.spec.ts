// apps/api/test/rls-banco.spec.ts
// Isolamento garantido PELO BANCO, sem passar pela API: conecta como a role
// saas_app e tenta de tudo. É a prova de que uma "query esquecida" na
// aplicação não vaza dados de outra loja.
import type pg from 'pg';
import { BancoService } from '../src/banco/banco.service.js';
import { lerAmbiente } from '../src/config/ambiente.js';
import { comoApp, criarLoja, criarProdutoDireto, limparBanco, poolAdmin, poolApp } from './apoio/banco.js';

const ERRO_RLS = /row-level security/;
const SEM_PERMISSAO = { code: '42501' };

describe('RLS no Postgres (role saas_app)', () => {
  let admin: pg.Pool;
  let app: pg.Pool;
  let lojaA: string;
  let lojaB: string;
  let produtoB: string;

  beforeAll(() => {
    admin = poolAdmin();
    app = poolApp();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'org_lojaA');
    lojaB = await criarLoja(admin, 'Loja B', 'org_lojaB');
    await criarProdutoDireto(admin, lojaA, 'A1');
    await criarProdutoDireto(admin, lojaA, 'A2');
    produtoB = await criarProdutoDireto(admin, lojaB, 'B1');
    await admin.query(
      `INSERT INTO usuarios (id, loja_id, auth0_sub) VALUES (gen_random_uuid(), $1, 'auth0|a'), (gen_random_uuid(), $2, 'auth0|b')`,
      [lojaA, lojaB],
    );
  });

  afterAll(async () => {
    await app.end();
    await admin.end();
  });

  it('query direta SEM app.loja_id não retorna nada (e os dados existem)', async () => {
    const total = await admin.query('SELECT count(*)::int AS n FROM produtos');
    expect(total.rows[0].n).toBe(3);

    // Fora de transação, sem set_config: exatamente a "query esquecida".
    const r = await app.query('SELECT * FROM produtos');
    expect(r.rows).toHaveLength(0);
    const u = await app.query('SELECT * FROM usuarios');
    expect(u.rows).toHaveLength(0);
  });

  it('com app.loja_id = A, só enxerga A — mesmo pedindo explicitamente a loja B', async () => {
    const nomes = await comoApp(app, lojaA, async (c) => (await c.query('SELECT nome FROM produtos ORDER BY nome')).rows);
    expect(nomes).toEqual([{ nome: 'A1' }, { nome: 'A2' }]);

    const deB = await comoApp(app, lojaA, async (c) => (await c.query('SELECT * FROM produtos WHERE loja_id = $1', [lojaB])).rows);
    expect(deB).toHaveLength(0);

    const usuarios = await comoApp(app, lojaA, async (c) => (await c.query('SELECT auth0_sub FROM usuarios')).rows);
    expect(usuarios).toEqual([{ auth0_sub: 'auth0|a' }]);
  });

  it('INSERT com loja_id de OUTRA loja é recusado (WITH CHECK)', async () => {
    await expect(
      comoApp(app, lojaA, (c) =>
        c.query(`INSERT INTO produtos (id, loja_id, codigo_interno, nome, preco_centavos) VALUES (gen_random_uuid(), $1, '0099', 'X', 1)`, [lojaB]),
      ),
    ).rejects.toThrow(ERRO_RLS);
  });

  it('INSERT sem app.loja_id é recusado', async () => {
    await expect(
      app.query(`INSERT INTO produtos (id, loja_id, codigo_interno, nome, preco_centavos) VALUES (gen_random_uuid(), $1, '0099', 'X', 1)`, [lojaA]),
    ).rejects.toThrow(ERRO_RLS);
  });

  it('UPDATE não alcança produto de outra loja e não move produto para outra loja', async () => {
    const r = await comoApp(app, lojaA, (c) => c.query(`UPDATE produtos SET nome = 'hackeado' WHERE id = $1`, [produtoB]));
    expect(r.rowCount).toBe(0);
    const b = await admin.query('SELECT nome FROM produtos WHERE id = $1', [produtoB]);
    expect(b.rows[0].nome).toBe('B1');

    await expect(comoApp(app, lojaA, (c) => c.query('UPDATE produtos SET loja_id = $1', [lojaB]))).rejects.toThrow(ERRO_RLS);
  });

  it('app.loja_id vale só dentro da transação — não vaza para a próxima requisição no pool', async () => {
    const umaConexao = poolApp(1); // força reutilizar a MESMA conexão física
    try {
      const pid1 = await comoApp(umaConexao, lojaA, async (c) => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      const depois = await umaConexao.query(
        `SELECT pg_backend_pid() AS pid, current_setting('app.loja_id', true) AS loja, count(*)::int AS n FROM produtos`,
      );
      expect(depois.rows[0].pid).toBe(pid1); // mesma conexão...
      expect(depois.rows[0].loja ?? '').toBe(''); // ...mas sem loja definida
      expect(depois.rows[0].n).toBe(0); // ...e portanto sem dados
    } finally {
      await umaConexao.end();
    }
  });

  it('valor inválido em app.loja_id gera erro (falha fechada, nunca "vê tudo")', async () => {
    await expect(comoApp(app, 'nao-e-uuid', (c) => c.query('SELECT * FROM produtos'))).rejects.toThrow(/uuid/);
  });

  it('saas_app não é superusuário, não tem BYPASSRLS e não é dona das tabelas', async () => {
    const role = await admin.query(`SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'saas_app'`);
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });

    const donas = await admin.query(
      `SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('lojas','usuarios','produtos')`,
    );
    expect(donas.rows).toHaveLength(3);
    for (const t of donas.rows) expect(t.tableowner).not.toBe('saas_app');
  });

  it('RLS está ligado com FORCE em produtos e usuarios', async () => {
    const r = await admin.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname IN ('produtos','usuarios') ORDER BY relname`,
    );
    expect(r.rows).toEqual([
      { relname: 'produtos', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'usuarios', relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it('saas_app só LÊ usuarios: quem cadastra é o dono (hoje, pelo script db:usuario)', async () => {
    await expect(
      comoApp(app, lojaA, (c) =>
        c.query(`INSERT INTO usuarios (id, loja_id, auth0_sub) VALUES (gen_random_uuid(), $1, 'auth0|intruso')`, [lojaA]),
      ),
    ).rejects.toMatchObject(SEM_PERMISSAO);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET papel = 'dono'`))).rejects.toMatchObject(SEM_PERMISSAO);
    const lidos = await comoApp(app, lojaA, async (c) => (await c.query('SELECT auth0_sub FROM usuarios')).rows);
    expect(lidos).toEqual([{ auth0_sub: 'auth0|a' }]);
  });

  it('saas_app não pode apagar, truncar nem alterar estrutura', async () => {
    await expect(comoApp(app, lojaA, (c) => c.query('DELETE FROM produtos'))).rejects.toMatchObject(SEM_PERMISSAO);
    await expect(app.query('TRUNCATE produtos')).rejects.toMatchObject(SEM_PERMISSAO);
    await expect(app.query('ALTER TABLE produtos DISABLE ROW LEVEL SECURITY')).rejects.toMatchObject(SEM_PERMISSAO);
    await expect(app.query('DROP POLICY produtos_isolamento_loja ON produtos')).rejects.toMatchObject(SEM_PERMISSAO);
    await expect(app.query(`UPDATE lojas SET ativa = false`)).rejects.toMatchObject(SEM_PERMISSAO);
  });

  it('CHECK: super_admin é sem loja; os demais papéis exigem loja', async () => {
    await expect(
      admin.query(`INSERT INTO usuarios (id, loja_id, auth0_sub, papel) VALUES (gen_random_uuid(), NULL, 'x', 'vendedor')`),
    ).rejects.toThrow(/usuarios_super_admin_sem_loja/);
    await expect(
      admin.query(`INSERT INTO usuarios (id, loja_id, auth0_sub, papel) VALUES (gen_random_uuid(), $1, 'y', 'super_admin')`, [lojaA]),
    ).rejects.toThrow(/usuarios_super_admin_sem_loja/);
    await admin.query(`INSERT INTO usuarios (id, loja_id, auth0_sub, papel) VALUES (gen_random_uuid(), NULL, 'z', 'super_admin')`);
  });

  it('BancoService.comLoja recusa lojaId que não é UUID e isola por loja', async () => {
    const banco = new BancoService(lerAmbiente());
    try {
      await expect(banco.comLoja("x' OR 1=1 --", async () => 1)).rejects.toThrow('lojaId inválido');
      const nomes = await banco.comLoja(lojaB, (tx) => tx.produto.findMany({ select: { nome: true } }));
      expect(nomes).toEqual([{ nome: 'B1' }]);
    } finally {
      await banco.onModuleDestroy();
    }
  });
});
