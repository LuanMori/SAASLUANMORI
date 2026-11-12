// apps/api/test/migracoes.spec.ts
// "Toda migration é reversível": aplica tudo -> reverte uma a uma -> reaplica,
// num banco separado, conferindo que cada reversão volta exatamente ao estado
// anterior. Também testa a migration 2 com dados que já existiam.
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

async function comCliente<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function estado() {
  return comCliente(URL, async (c) => {
    const um = async (sql: string) => (await c.query(sql)).rows;
    return {
      tabelas: (await um(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`)).map(
        (r) => r.tablename,
      ),
      colunasProdutos: (await um(`SELECT column_name FROM information_schema.columns WHERE table_name = 'produtos' ORDER BY ordinal_position`)).map(
        (r) => r.column_name,
      ),
      indicesProdutos: (await um(`SELECT indexname FROM pg_indexes WHERE tablename = 'produtos' ORDER BY 1`)).map((r) => r.indexname),
      checksProdutos: (await um(`SELECT conname FROM pg_constraint WHERE conrelid = 'produtos'::regclass AND contype = 'c' ORDER BY 1`)).map(
        (r) => r.conname,
      ),
      forceRls: (await um(`SELECT relforcerowsecurity AS f FROM pg_class WHERE relname = 'produtos'`))[0]?.f ?? null,
      appEscreveUsuarios: (await um(`SELECT has_table_privilege('saas_app', 'usuarios', 'INSERT') AS p`))[0]?.p ?? null,
      policies: (await um(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`))[0].n,
      migrations: (await um(`SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY 1`)).map(
        (r) => r.migration_name,
      ),
    };
  }).catch(async (e) => {
    // Sem as tabelas (tudo revertido) pg_class 'produtos'::regclass falha: estado vazio.
    if (String(e).includes('"produtos" does not exist')) {
      const migrations = await comCliente(URL, async (c) =>
        (await c.query(`SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL`)).rows.map((r) => r.migration_name),
      );
      return { vazio: true, migrations };
    }
    throw e;
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

  it('aplica tudo, reverte uma a uma sem sobras e reaplica', async () => {
    aplicarMigrations(URL);
    const final = await estado();
    expect(final).toMatchObject({
      tabelas: ['lojas', 'produtos', 'usuarios'],
      colunasProdutos: ['id', 'loja_id', 'nome', 'codigo_barras', 'preco_centavos', 'ativo', 'criado_em', 'atualizado_em', 'codigo_interno'],
      checksProdutos: ['produtos_codigo_barras_so_digitos', 'produtos_codigo_interno_so_digitos', 'produtos_preco_maior_que_zero'],
      forceRls: true,
      appEscreveUsuarios: false,
      policies: 2,
      migrations: [M1, M2],
    });

    expect(await reverterUltimaMigration(URL)).toBe(M2);
    const soM1 = await estado();
    expect(soM1).toMatchObject({
      colunasProdutos: ['id', 'loja_id', 'nome', 'codigo', 'preco_centavos', 'ativo', 'criado_em', 'atualizado_em'],
      indicesProdutos: ['produtos_loja_id_codigo_key', 'produtos_loja_id_nome_idx', 'produtos_pkey'],
      checksProdutos: [],
      forceRls: true,
      appEscreveUsuarios: true,
      migrations: [M1],
    });

    expect(await reverterUltimaMigration(URL)).toBe(M1);
    expect(await estado()).toEqual({ vazio: true, migrations: [] });

    aplicarMigrations(URL);
    expect(await estado()).toEqual(final);
  });

  it('migration 2 dá código interno aos produtos que já existiam (por loja, na ordem de cadastro)', async () => {
    await reverterUltimaMigration(URL); // volta para o formato da Fase -1
    await comCliente(URL, async (c) => {
      await c.query(`INSERT INTO lojas (id, nome, auth0_org_id) VALUES
        ('00000000-0000-4000-8000-00000000000a', 'A', 'org_a'), ('00000000-0000-4000-8000-00000000000b', 'B', 'org_b')`);
      await c.query(`INSERT INTO produtos (id, loja_id, nome, codigo, preco_centavos, criado_em) VALUES
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'A-segundo', NULL,   200, now()),
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'A-primeiro', '0789', 100, now() - interval '1 day'),
        (gen_random_uuid(), '00000000-0000-4000-8000-00000000000b', 'B-unico',   '0789', 300, now())`);
    });

    aplicarMigrations(URL);

    const linhas = await comCliente(URL, async (c) =>
      (await c.query(`SELECT nome, codigo_interno, codigo_barras FROM produtos ORDER BY nome`)).rows,
    );
    expect(linhas).toEqual([
      { nome: 'A-primeiro', codigo_interno: '0001', codigo_barras: '0789' },
      { nome: 'A-segundo', codigo_interno: '0002', codigo_barras: null },
      { nome: 'B-unico', codigo_interno: '0001', codigo_barras: '0789' },
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
    await reverterUltimaMigration(URL);
    await comCliente(URL, (c) => c.query(`UPDATE produtos SET codigo = 'COL-01' WHERE nome = 'A-segundo'`));

    expect(() => aplicarMigrations(URL)).toThrow(/código que não é só número/);

    const codigo = await comCliente(URL, async (c) => (await c.query(`SELECT codigo FROM produtos WHERE nome = 'A-segundo'`)).rows[0].codigo);
    expect(codigo).toBe('COL-01');
  });
});
