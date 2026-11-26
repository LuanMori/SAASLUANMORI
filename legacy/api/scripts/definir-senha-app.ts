// apps/api/scripts/definir-senha-app.ts
// Liga LOGIN na role saas_app e define a senha a partir do ambiente.
// A senha nunca fica em código nem em migration. Em produção ela vem do
// AWS Secrets Manager (Fase 8); localmente, do .env.
//
// Uso: npm run db:app-role -w @saas/api
// Lê: DATABASE_URL_MIGRATE (dona do schema) e SAAS_APP_DB_PASSWORD.
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export async function definirSenhaApp(connectionString: string, senha: string): Promise<void> {
  if (senha.length < 16) {
    throw new Error('SAAS_APP_DB_PASSWORD precisa ter pelo menos 16 caracteres.');
  }
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    // ALTER ROLE não aceita parâmetro ($1); format(%L) faz o escape seguro do literal.
    const { rows } = await cliente.query<{ sql: string }>(
      `SELECT format('ALTER ROLE saas_app WITH LOGIN PASSWORD %L', $1::text) AS sql`,
      [senha],
    );
    await cliente.query(rows[0]!.sql);
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL_MIGRATE;
  const senha = process.env.SAAS_APP_DB_PASSWORD;
  if (!url || !senha) {
    console.error('Defina DATABASE_URL_MIGRATE e SAAS_APP_DB_PASSWORD.');
    process.exit(1);
  }
  definirSenhaApp(url, senha)
    .then(() => console.log('Role saas_app pronta para login.'))
    .catch((e: unknown) => {
      console.error('Falha:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
