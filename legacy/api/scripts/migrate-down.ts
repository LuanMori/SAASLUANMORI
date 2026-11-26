// apps/api/scripts/migrate-down.ts
// Reverte a ÚLTIMA migration aplicada, usando o down.sql da pasta dela.
// O Prisma Migrate não tem "down" nativo; este script cobre isso.
//
// Uso: npm run db:migrate:down -w @saas/api -- --confirmar
// Usa DATABASE_URL_MIGRATE (dona do schema). Roda tudo numa transação:
// ou desfaz a migration inteira e remove o registro, ou não muda nada.
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

export const PASTA_MIGRATIONS = fileURLToPath(new URL('../prisma/migrations', import.meta.url));

export async function reverterUltimaMigration(
  connectionString: string,
  pastaMigrations = PASTA_MIGRATIONS,
): Promise<string | null> {
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name DESC LIMIT 1`,
    );
    const nome = rows[0]?.migration_name;
    if (!nome) return null;

    const arquivo = join(pastaMigrations, nome, 'down.sql');
    if (!existsSync(arquivo)) {
      throw new Error(`A migration ${nome} não tem down.sql — reversão bloqueada.`);
    }
    const sql = readFileSync(arquivo, 'utf8');

    await cliente.query('BEGIN');
    await cliente.query(sql);
    await cliente.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [nome]);
    await cliente.query('COMMIT');
    return nome;
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url) {
    console.error('Defina DATABASE_URL_MIGRATE.');
    process.exit(1);
  }
  if (!process.argv.includes('--confirmar')) {
    console.error('Isto APAGA as tabelas da última migration. Rode de novo com --confirmar.');
    process.exit(1);
  }
  reverterUltimaMigration(url)
    .then((nome) => console.log(nome ? `Revertida: ${nome}` : 'Nenhuma migration aplicada.'))
    .catch((e: unknown) => {
      console.error('Falha ao reverter:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
