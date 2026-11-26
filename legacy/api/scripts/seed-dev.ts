// apps/api/scripts/seed-dev.ts
// SÓ PARA DESENVOLVIMENTO E PRIMEIRA INSTALAÇÃO: cadastra as lojas pelo endereço (subdomínio).
// Depois, cadastre o primeiro Dono de cada loja com `npm run db:usuario` (ele cadastra o resto pela
// tela Usuários). O cadastro de lojas "de verdade" (pelo super_admin) é assunto da Fase 3.
//
// Uso: npm run db:seed -w @saas/api
// Lê: DATABASE_URL_MIGRATE e SEED_LOJAS, no formato
//   SEED_LOJAS="Loja A=lojaa;Pet Shop da Ana=petshopdaana"
// (lojaa vira o endereço lojaa.<DOMINIO_BASE>; em desenvolvimento, o campo "Loja" da tela de entrada)
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { validarSubdominio } from '@saas/core';
import pg from 'pg';

export function lerSeedLojas(texto: string): { nome: string; subdominio: string }[] {
  return texto
    .split(';')
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [nome, sub, ...resto] = par.split('=').map((s) => s.trim());
      const v = validarSubdominio(sub);
      if (!nome || !v.ok || resto.length > 0) {
        throw new Error(`Entrada inválida em SEED_LOJAS: "${par}" (esperado "Nome=endereco", endereço com letras minúsculas, números e hífen)`);
      }
      return { nome, subdominio: v.valor };
    });
}

export async function semearLojas(connectionString: string, lojas: { nome: string; subdominio: string }[]): Promise<string[]> {
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    const feitas: string[] = [];
    for (const loja of lojas) {
      await cliente.query(
        `INSERT INTO lojas (id, nome, subdominio)
         VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT (subdominio) DO UPDATE SET nome = EXCLUDED.nome, atualizado_em = now()`,
        [loja.nome, loja.subdominio],
      );
      feitas.push(`Loja pronta: ${loja.nome} (${loja.subdominio})`);
    }
    return feitas;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL_MIGRATE;
  const seed = process.env.SEED_LOJAS;
  if (!url || !seed) {
    console.error('Defina DATABASE_URL_MIGRATE e SEED_LOJAS.');
    process.exit(1);
  }
  Promise.resolve()
    .then(() => semearLojas(url, lerSeedLojas(seed)))
    .then((linhas) => linhas.forEach((l) => console.log(l)))
    .catch((e: unknown) => {
      console.error('Falha no seed:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
