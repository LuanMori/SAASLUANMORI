// apps/api/test/vigilancia.spec.ts
// Testes de vigilância (itens 2.1 e 2.2 da revisão de 18/11/2026). Olham o banco INTEIRO, não uma
// lista de tabelas: uma tabela nova que esqueça o RLS, um GRANT a mais ou uma role com BYPASSRLS
// fazem estes testes falharem no CI (a cada push), antes de chegar a produção.
import pg from 'pg';
import { BancoService } from '../src/banco/banco.service.js';
import { lerAmbiente } from '../src/config/ambiente.js';
import { poolAdmin } from './apoio/banco.js';
import { BANCO_TESTE, urlDoBanco } from './apoio/config.js';

/** Tabelas que, de propósito, não são de uma loja. Tabela nova fora desta lista PRECISA ter loja_id + RLS. */
const SEM_LOJA = ['_prisma_migrations', 'lojas'];

/** Tudo o que a role da API pode fazer. Mudou? Revise e atualize aqui (e em docs/SEGURANCA.md). */
const PRIVILEGIOS_DE_TABELA = [
  'auditoria: INSERT',
  'auditoria: SELECT',
  'lojas: SELECT',
  'produtos: INSERT',
  'produtos: SELECT',
  'produtos: UPDATE',
  'sessoes: INSERT',
  'sessoes: SELECT',
  'usuarios: INSERT',
  'usuarios: SELECT',
];
const UPDATE_POR_COLUNA = [
  'sessoes.encerrada_em',
  'sessoes.ultimo_uso_em',
  'usuarios.ativo',
  'usuarios.atualizado_em',
  'usuarios.bloqueado_ate',
  'usuarios.nome',
  'usuarios.papel',
  'usuarios.senha_hash',
  'usuarios.senha_provisoria',
  'usuarios.tentativas_erradas',
  'usuarios.ultimo_acesso_em',
  'usuarios.usuario',
];

describe('Vigilância do banco inteiro', () => {
  let admin: pg.Pool;

  beforeAll(() => {
    admin = poolAdmin();
  });

  afterAll(async () => {
    await admin.end();
  });

  it('toda tabela é de loja (loja_id + RLS ligado e forçado) ou está na lista do que não é de loja', async () => {
    const { rows } = await admin.query(`
      SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'loja_id' AND NOT a.attisdropped) AS loja
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       ORDER BY 1`);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const t of rows) {
      if (SEM_LOJA.includes(t.tabela)) expect({ tabela: t.tabela, loja: t.loja }).toEqual({ tabela: t.tabela, loja: false });
      else expect(t).toEqual({ tabela: t.tabela, rls: true, forcado: true, loja: true });
    }
  });

  it('toda tabela de loja tem UMA policy, para tudo, por loja_id = app_loja_atual()', async () => {
    const { rows: tabelas } = await admin.query(`
      SELECT DISTINCT c.relname AS tabela FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'loja_id' AND NOT a.attisdropped
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`);
    const { rows: policies } = await admin.query(`SELECT tablename, cmd, permissive, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`);
    expect(policies.map((p) => p.tablename)).toEqual(tabelas.map((t) => t.tabela));
    for (const p of policies) {
      expect(p).toEqual({
        tablename: p.tablename,
        cmd: 'ALL',
        permissive: 'PERMISSIVE',
        roles: '{public}',
        qual: '(loja_id = app_loja_atual())',
        with_check: '(loja_id = app_loja_atual())',
      });
    }
  });

  it('a role saas_app tem exatamente os privilégios revisados (nada de DELETE ou TRUNCATE em lugar nenhum)', async () => {
    const tabela = await admin.query(
      `SELECT table_name || ': ' || privilege_type AS p FROM information_schema.role_table_grants WHERE grantee = 'saas_app' ORDER BY 1`,
    );
    expect(tabela.rows.map((r) => r.p)).toEqual(PRIVILEGIOS_DE_TABELA);
    const colunas = await admin.query(`
      SELECT c.relname || '.' || a.attname AS p
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(a.attacl) x
       WHERE n.nspname = 'public' AND x.grantee = 'saas_app'::regrole AND x.privilege_type = 'UPDATE'
       ORDER BY 1`);
    expect(colunas.rows.map((r) => r.p)).toEqual(UPDATE_POR_COLUNA);
  });

  it('saas_app, e toda role de que ela faça parte, não é superusuário nem tem BYPASSRLS', async () => {
    const { rows } = await admin.query(`
      WITH RECURSIVE papeis AS (
        SELECT oid FROM pg_roles WHERE rolname = 'saas_app'
        UNION SELECT m.roleid FROM pg_auth_members m JOIN papeis p ON m.member = p.oid)
      SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb FROM pg_roles r JOIN papeis p ON p.oid = r.oid`);
    expect(rows).toEqual([{ rolname: 'saas_app', rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false }]);
  });

  it('banco em UTF-8 (acentos)', async () => {
    const { rows } = await admin.query(`SELECT pg_encoding_to_char(encoding) AS cod FROM pg_database WHERE datname = current_database()`);
    expect(rows[0].cod).toBe('UTF8');
  });

  describe('a API se recusa a subir com uma conexão insegura', () => {
    const SENHA = 'senha-de-teste-vigilancia-123';
    const subir = async (url: string) => {
      const banco = new BancoService({ ...lerAmbiente(), databaseUrlApp: url });
      try {
        await banco.onModuleInit();
      } finally {
        await banco.onModuleDestroy();
      }
    };

    beforeAll(async () => {
      await admin.query('DROP TABLE IF EXISTS vig_tabela_da_role, vig_sem_rls');
      for (const r of ['vig_herda', 'vig_bypass', 'vig_dona']) await admin.query(`DROP ROLE IF EXISTS ${r}`);
      await admin.query(`CREATE ROLE vig_bypass NOLOGIN BYPASSRLS`);
      await admin.query(`CREATE ROLE vig_herda LOGIN NOINHERIT PASSWORD '${SENHA}' IN ROLE vig_bypass`);
      await admin.query(`CREATE ROLE vig_dona LOGIN PASSWORD '${SENHA}'`);
    });

    afterAll(async () => {
      await admin.query('DROP TABLE IF EXISTS vig_tabela_da_role, vig_sem_rls');
      for (const r of ['vig_herda', 'vig_bypass', 'vig_dona']) await admin.query(`DROP ROLE IF EXISTS ${r}`);
    });

    it('com a role saas_app (a certa), sobe', async () => {
      await expect(subir(lerAmbiente().databaseUrlApp)).resolves.toBeUndefined();
    });

    it('superusuário', async () => {
      await expect(subir(urlDoBanco(BANCO_TESTE))).rejects.toThrow(/a API não sobe.*é superusuário/);
    });

    it('role comum que FAZ PARTE de uma role com BYPASSRLS (mesmo com NOINHERIT)', async () => {
      await expect(subir(urlDoBanco(BANCO_TESTE, { usuario: 'vig_herda', senha: SENHA }))).rejects.toThrow(/"vig_bypass" tem BYPASSRLS/);
    });

    it('role dona de tabela', async () => {
      await admin.query('CREATE TABLE vig_tabela_da_role (id int)');
      await admin.query('ALTER TABLE vig_tabela_da_role OWNER TO vig_dona');
      try {
        await expect(subir(urlDoBanco(BANCO_TESTE, { usuario: 'vig_dona', senha: SENHA }))).rejects.toThrow(/dona de tabela\(s\): vig_tabela_da_role/);
      } finally {
        await admin.query('DROP TABLE vig_tabela_da_role');
      }
    });

    it('tabela com loja_id sem RLS (migration que esqueceu o RLS)', async () => {
      await admin.query('CREATE TABLE vig_sem_rls (id uuid PRIMARY KEY, loja_id uuid NOT NULL)');
      try {
        await expect(subir(lerAmbiente().databaseUrlApp)).rejects.toThrow(/"vig_sem_rls" tem loja_id mas está sem RLS/);
      } finally {
        await admin.query('DROP TABLE vig_sem_rls');
      }
    });
  });
});
