// apps/api/test/migracoes.spec.ts
// "Toda migration é reversível": aplica tudo -> reverte uma a uma -> reaplica, num banco separado,
// conferindo o que cada reversão desfaz. Também testa as migrations 2 e 3 com dados que já existiam.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { reverterUltimaMigration } from '../scripts/migrate-down.js';
import { ADMIN_URL, urlDoBanco } from './apoio/config.js';
import { aplicarMigrations } from './apoio/migrations.js';

const BANCO = 'saas_teste_migracoes';
const URL = urlDoBanco(BANCO);
const M1 = '20261111180000_fase_menos_1_esqueleto';
const M2 = '20261111190000_cadastro_pelo_dono_e_codigos';
const M3 = '20261118120000_login_proprio_sessoes_auditoria';

async function comCliente<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Retrato do schema: tabelas, colunas, índices, restrições, policies, triggers, funções e privilégios. */
async function estado() {
  return comCliente(URL, async (c) => {
    const lista = async (sql: string) => (await c.query<{ v: string }>(sql)).rows.map((r) => r.v);
    return {
      tabelas: await lista(`SELECT tablename AS v FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`),
      colunas: await lista(
        `SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS v FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
      ),
      indices: await lista(`SELECT indexname AS v FROM pg_indexes WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`),
      restricoes: await lista(
        `SELECT conrelid::regclass || ':' || conname AS v FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = 'public' AND conrelid::regclass::text <> '_prisma_migrations' ORDER BY 1`,
      ),
      rls: await lista(
        `SELECT relname || ':' || relrowsecurity || ':' || relforcerowsecurity AS v FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND relkind = 'r' AND relname <> '_prisma_migrations' ORDER BY 1`,
      ),
      policies: await lista(`SELECT tablename || ':' || policyname AS v FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`),
      triggers: await lista(`SELECT tgname AS v FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1`),
      funcoes: await lista(`SELECT proname AS v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1`),
      privilegiosApp: await lista(
        `SELECT table_name || ':' || privilege_type AS v FROM information_schema.role_table_grants WHERE grantee = 'saas_app' ORDER BY 1`,
      ),
      updatePorColuna: await lista(
        `SELECT c.relname || '.' || a.attname AS v FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE x.grantee = 'saas_app'::regrole AND x.privilege_type = 'UPDATE' ORDER BY 1`,
      ),
      migrations: await lista(`SELECT migration_name AS v FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY 1`),
    };
  });
}

describe('Migrations reversíveis', () => {
  beforeAll(async () => {
    await comCliente(ADMIN_URL, async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
      await c.query(`CREATE DATABASE ${BANCO}`);
    });
  });

  afterAll(async () => {
    await comCliente(ADMIN_URL, (c) => c.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`));
  });

  it('aplica tudo, reverte uma a uma sem sobras e reaplica igual', async () => {
    aplicarMigrations(URL);
    const final = await estado();
    expect(final).toMatchObject({
      tabelas: ['auditoria', 'lojas', 'produtos', 'sessoes', 'usuarios'],
      policies: ['auditoria:auditoria_isolamento_loja', 'produtos:produtos_isolamento_loja', 'sessoes:sessoes_isolamento_loja', 'usuarios:usuarios_isolamento_loja'],
      triggers: ['usuarios_trava_api'],
      funcoes: ['app_loja_atual', 'usuarios_trava_api'],
      migrations: [M1, M2, M3],
    });
    expect(final.colunas).toEqual(expect.arrayContaining(['lojas.subdominio:character varying:NO', 'usuarios.usuario:character varying:NO', 'usuarios.senha_hash:character varying:YES']));
    expect(final.colunas.filter((c) => /auth0|email/.test(c))).toEqual([]);
    expect(final.rls).toEqual(['auditoria:true:true', 'lojas:false:false', 'produtos:true:true', 'sessoes:true:true', 'usuarios:true:true']);

    expect(await reverterUltimaMigration(URL)).toBe(M3);
    const ateM2 = await estado();
    expect(ateM2).toMatchObject({
      tabelas: ['lojas', 'produtos', 'usuarios'],
      policies: ['produtos:produtos_isolamento_loja', 'usuarios:usuarios_isolamento_loja'],
      triggers: [],
      funcoes: ['app_loja_atual'],
      privilegiosApp: ['lojas:SELECT', 'produtos:INSERT', 'produtos:SELECT', 'produtos:UPDATE', 'usuarios:SELECT'],
      updatePorColuna: [],
      migrations: [M1, M2],
    });
    expect(ateM2.colunas).toEqual(
      expect.arrayContaining(['lojas.auth0_org_id:character varying:NO', 'usuarios.auth0_sub:character varying:NO', 'usuarios.email:character varying:YES', 'usuarios.nome:character varying:YES']),
    );
    expect(ateM2.colunas.filter((c) => /subdominio|senha|tentativas|bloqueado|acesso|usuarios\.usuario:/.test(c))).toEqual([]);
    expect(ateM2.indices).toEqual(expect.arrayContaining(['lojas_auth0_org_id_key', 'usuarios_loja_id_auth0_sub_key']));

    // reaplicar só a 3 e reverter de novo dá exatamente o mesmo retrato (ida e volta sem sobras)
    aplicarMigrations(URL);
    expect(await reverterUltimaMigration(URL)).toBe(M3);
    expect(await estado()).toEqual(ateM2);

    expect(await reverterUltimaMigration(URL)).toBe(M2);
    const soM1 = await estado();
    expect(soM1).toMatchObject({ privilegiosApp: ['lojas:SELECT', 'produtos:INSERT', 'produtos:SELECT', 'produtos:UPDATE', 'usuarios:INSERT', 'usuarios:SELECT', 'usuarios:UPDATE'], migrations: [M1] });
    expect(soM1.colunas).toEqual(expect.arrayContaining(['produtos.codigo:character varying:YES']));
    expect(soM1.indices).toEqual(expect.arrayContaining(['produtos_loja_id_codigo_key', 'produtos_loja_id_nome_idx', 'produtos_pkey']));
    expect(soM1.restricoes.filter((r) => r.startsWith('produtos:produtos_codigo') || r.includes('preco'))).toEqual([]);

    expect(await reverterUltimaMigration(URL)).toBe(M1);
    expect(await estado()).toMatchObject({ tabelas: [], policies: [], funcoes: [], migrations: [] });

    aplicarMigrations(URL);
    expect(await estado()).toEqual(final);
  });

  it('migration 2 dá código interno aos produtos que já existiam (por loja, na ordem de cadastro)', async () => {
    await reverterUltimaMigration(URL); // 3
    await reverterUltimaMigration(URL); // 2 -> formato da Fase -1
    await comCliente(URL, async (c) => {
      await c.query(`INSERT INTO lojas (id, nome, auth0_org_id) VALUES
        ('00000000-0000-4000-8000-00000000000a', 'Loja A', 'org_a'), ('00000000-0000-4000-8000-00000000000b', 'Loja B', 'org_b')`);
      await c.query(`INSERT INTO produtos (id, loja_id, nome, codigo, preco_centavos, criado_em) VALUES
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'A-segundo', NULL,   200, now()),
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'A-primeiro', '0789', 100, now() - interval '1 day'),
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000b', 'B-unico',   '0789', 300, now())`);
    });

    aplicarMigrations(URL);

    const linhas = await comCliente(URL, async (c) => (await c.query(`SELECT nome, codigo_interno, codigo_barras FROM produtos ORDER BY nome`)).rows);
    expect(linhas).toEqual([
      { nome: 'A-primeiro', codigo_interno: '0001', codigo_barras: '0789' },
      { nome: 'A-segundo', codigo_interno: '0002', codigo_barras: null },
      { nome: 'B-unico', codigo_interno: '0001', codigo_barras: '0789' },
    ]);
  });

  it('migration 3 dá endereço às lojas e login às pessoas que vieram do Auth0 (sem senha: o Dono define)', async () => {
    await reverterUltimaMigration(URL); // 3
    await comCliente(URL, async (c) => {
      await c.query(`INSERT INTO lojas (id, nome, auth0_org_id, criado_em) VALUES
        ('00000000-0000-4000-8000-0000000000c1', 'Loja A', 'org_a2', now() + interval '1 day'),
        ('00000000-0000-4000-8000-0000000000c2', 'Admin', 'org_admin', now()),
        ('00000000-0000-4000-8000-0000000000c3', 'Pet Shop da Ana — Matriz', 'org_pet', now()),
        ('00000000-0000-4000-8000-0000000000c4', 'Ração & Cia', 'org_racao', now())`);
      await c.query(`INSERT INTO usuarios (id, loja_id, auth0_sub, email, nome, papel, criado_em) VALUES
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'auth0|1', 'ana@exemplo.com', 'Ana Paula', 'dono', now() - interval '2 day'),
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'auth0|2', NULL, NULL, 'vendedor', now() - interval '1 day'),
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000b', 'auth0|3', NULL, 'João', 'vendedor', now())`);
    });

    aplicarMigrations(URL);

    const lojas = await comCliente(URL, async (c) => (await c.query(`SELECT nome, subdominio FROM lojas ORDER BY nome`)).rows);
    expect(lojas).toEqual([
      { nome: 'Admin', subdominio: 'lojaadmin' }, // "admin" é reservado
      { nome: 'Loja A', subdominio: 'lojaa' },
      { nome: 'Loja A', subdominio: 'lojaa2' }, // nome repetido ganha número
      { nome: 'Loja B', subdominio: 'lojab' },
      { nome: 'Pet Shop da Ana — Matriz', subdominio: 'petshopdaanamatriz' },
      { nome: 'Ração & Cia', subdominio: 'racaocia' },
    ]);
    const pessoas = await comCliente(URL, async (c) =>
      (await c.query(`SELECT usuario, nome, papel, senha_hash, senha_provisoria FROM usuarios ORDER BY usuario`)).rows,
    );
    expect(pessoas).toEqual([
      { usuario: 'anapaula1', nome: 'Ana Paula', papel: 'dono', senha_hash: null, senha_provisoria: true },
      { usuario: 'joao1', nome: 'João', papel: 'vendedor', senha_hash: null, senha_provisoria: true },
      { usuario: 'pessoa2', nome: 'Pessoa 2', papel: 'vendedor', senha_hash: null, senha_provisoria: true },
    ]);
  });

  it('sem down.sql a reversão é bloqueada e nada muda', async () => {
    const pastaVazia = mkdtempSync(join(tmpdir(), 'sem-down-'));
    try {
      const antes = await estado();
      await expect(reverterUltimaMigration(URL, pastaVazia)).rejects.toThrow(/não tem down\.sql/);
      expect(await estado()).toEqual(antes);
    } finally {
      rmSync(pastaVazia, { recursive: true, force: true });
    }
  });

  it('migration 2 para, sem apagar nada, se houver código com letra (último teste: deixa o banco com migration falha)', async () => {
    await reverterUltimaMigration(URL); // 3
    await reverterUltimaMigration(URL); // 2
    await comCliente(URL, (c) => c.query(`UPDATE produtos SET codigo = 'COL-01' WHERE nome = 'A-segundo'`));

    expect(() => aplicarMigrations(URL)).toThrow(/código que não é só número/);

    const codigo = await comCliente(URL, async (c) => (await c.query(`SELECT codigo FROM produtos WHERE nome = 'A-segundo'`)).rows[0].codigo);
    expect(codigo).toBe('COL-01');
  });
});
