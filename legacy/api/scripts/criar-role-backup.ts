// apps/api/scripts/criar-role-backup.ts
// Role do BACKUP (item 3.x da revisão): saas_backup só LÊ (SELECT) e tem BYPASSRLS, para o pg_dump
// enxergar as linhas de TODAS as lojas. Sem ela, o pg_dump falha ("query would be affected by
// row-level security policy"): o RLS com FORCE vale até para o dono das tabelas. A role da API
// (saas_app) continua sem BYPASSRLS — e a API se recusa a subir se um dia tiver (conferencia.ts).
//
// Uso: npm run db:backup-role -w @saas/api
// Lê: DATABASE_URL_MIGRATE (superusuário, ou role com CREATEROLE e BYPASSRLS) e SAAS_BACKUP_DB_PASSWORD.
// Rode de novo depois de migrations novas, se o dono das tabelas não for quem rodou este script.
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const NOME = /^[a-z_][a-z0-9_]{0,62}$/;

export async function criarRoleBackup(connectionString: string, senha: string, role = 'saas_backup'): Promise<void> {
  if (senha.length < 16) throw new Error('SAAS_BACKUP_DB_PASSWORD precisa ter pelo menos 16 caracteres.');
  if (!NOME.test(role)) throw new Error('Nome de role inválido.');
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    const existe = (await cliente.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount;
    if (!existe) await cliente.query(`CREATE ROLE ${role} NOLOGIN`);
    // ALTER ROLE não aceita parâmetro ($1); format(%L) faz o escape seguro do literal.
    const { rows } = await cliente.query<{ sql: string }>(
      `SELECT format('ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS PASSWORD %L', $1::text) AS sql`,
      [senha],
    );
    await cliente.query(rows[0]!.sql);
    await cliente.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await cliente.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
    await cliente.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    // tabelas que as próximas migrations criarem (pelo mesmo dono) já nascem legíveis para o backup
    await cliente.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${role}`);
    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL_MIGRATE;
  const senha = process.env.SAAS_BACKUP_DB_PASSWORD;
  if (!url || !senha) {
    console.error('Defina DATABASE_URL_MIGRATE e SAAS_BACKUP_DB_PASSWORD.');
    process.exit(1);
  }
  criarRoleBackup(url, senha)
    .then(() => console.log('Role saas_backup pronta (só leitura, para o pg_dump).'))
    .catch((e: unknown) => {
      console.error('Falha:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
