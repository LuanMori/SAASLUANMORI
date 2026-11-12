// apps/api/test/apoio/migrations.ts
// Aplica as migrations com o MESMO comando de produção: `prisma migrate deploy`.
// PRISMA_BIN permite apontar outro executável do CLI, se necessário.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PASTA_API = fileURLToPath(new URL('../..', import.meta.url));
const PRISMA_PADRAO = fileURLToPath(new URL('../../../../node_modules/.bin/prisma', import.meta.url));

export function aplicarMigrations(urlBanco: string): void {
  const bin = process.env.PRISMA_BIN ?? PRISMA_PADRAO;
  try {
    execFileSync(bin, ['migrate', 'deploy'], {
      cwd: PASTA_API,
      env: { ...process.env, DATABASE_URL_MIGRATE: urlBanco },
      stdio: 'pipe',
    });
  } catch (erro) {
    const e = erro as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`prisma migrate deploy falhou:\n${e.stdout?.toString() ?? ''}\n${e.stderr?.toString() ?? ''}`);
  }
}
