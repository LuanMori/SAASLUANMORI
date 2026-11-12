// apps/api/test/apoio/global-setup.js
// Uma vez por execução: recria o banco de testes do zero, aplica as
// migrations com o comando de produção (`prisma migrate deploy`) e liga o
// login da role saas_app com o script real (scripts/definir-senha-app.ts).
// Em JS puro porque o Jest carrega o globalSetup fora do modo ESM dos testes.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const BANCO_TESTE = 'saas_teste';
const SENHA_APP_TESTE = 'senha-de-teste-nao-usar-em-producao'; // igual a test/apoio/config.ts
const PASTA_API = fileURLToPath(new URL('../..', import.meta.url));
const BIN = fileURLToPath(new URL('../../../../node_modules/.bin/', import.meta.url));

function rodar(comando, args, env) {
  try {
    execFileSync(comando, args, { cwd: PASTA_API, env: { ...process.env, ...env }, stdio: 'pipe' });
  } catch (erro) {
    throw new Error(`${args.join(' ')} falhou:\n${erro.stdout ?? ''}\n${erro.stderr ?? ''}`);
  }
}

export default async function globalSetup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${BANCO_TESTE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${BANCO_TESTE}`);
  } finally {
    await admin.end();
  }

  const url = new URL(ADMIN_URL);
  url.pathname = `/${BANCO_TESTE}`;
  const env = { DATABASE_URL_MIGRATE: url.toString(), SAAS_APP_DB_PASSWORD: SENHA_APP_TESTE };

  rodar(process.env.PRISMA_BIN ?? `${BIN}prisma`, ['migrate', 'deploy'], env);
  rodar(`${BIN}tsx`, ['scripts/definir-senha-app.ts'], env);
}
