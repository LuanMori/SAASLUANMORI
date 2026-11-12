// apps/api/scripts/seed-dev.ts
// SÓ PARA DESENVOLVIMENTO: cadastra as lojas ligadas às Organizations do Auth0.
// Depois, cadastre as pessoas de cada loja com `npm run db:usuario`.
// O cadastro de lojas "de verdade" (pelo super_admin) é assunto da Fase 3.
//
// Uso: npm run db:seed -w @saas/api
// Lê: DATABASE_URL_MIGRATE e SEED_LOJAS, no formato
//   SEED_LOJAS="Loja A=org_xxxxxxxx;Loja B=org_yyyyyyyy"
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export function lerSeedLojas(texto: string): { nome: string; auth0OrgId: string }[] {
  return texto
    .split(';')
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [nome, org] = par.split('=').map((s) => s.trim());
      if (!nome || !org || !/^org_[A-Za-z0-9]+$/.test(org)) {
        throw new Error(`Entrada inválida em SEED_LOJAS: "${par}" (esperado "Nome=org_xxx")`);
      }
      return { nome, auth0OrgId: org };
    });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATE;
  const seed = process.env.SEED_LOJAS;
  if (!url || !seed) throw new Error('Defina DATABASE_URL_MIGRATE e SEED_LOJAS.');

  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    for (const loja of lerSeedLojas(seed)) {
      await cliente.query(
        `INSERT INTO lojas (id, nome, auth0_org_id)
         VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT (auth0_org_id) DO UPDATE SET nome = EXCLUDED.nome, atualizado_em = now()`,
        [loja.nome, loja.auth0OrgId],
      );
      console.log(`Loja pronta: ${loja.nome} (${loja.auth0OrgId})`);
    }
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error('Falha no seed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
