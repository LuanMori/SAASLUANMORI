// apps/api/test/apoio/banco.ts
// Conexões diretas ao banco de testes:
//   poolAdmin() -> superusuário (prepara dados e confere o que foi gravado; ignora RLS)
//   poolApp()   -> role saas_app (a mesma da API; sujeita a RLS)
import type { PapelDeLoja } from '@saas/core';
import pg from 'pg';
import { BANCO_TESTE, URL_APP_TESTE, urlDoBanco } from './config.js';

export function poolAdmin(): pg.Pool {
  return new pg.Pool({ connectionString: urlDoBanco(BANCO_TESTE), max: 3 });
}

export function poolApp(max = 3): pg.Pool {
  return new pg.Pool({ connectionString: URL_APP_TESTE, max });
}

export async function limparBanco(admin: pg.Pool): Promise<void> {
  await admin.query('TRUNCATE produtos, usuarios, lojas');
}

export async function criarLoja(admin: pg.Pool, nome: string, auth0OrgId: string, ativa = true): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    'INSERT INTO lojas (id, nome, auth0_org_id, ativa) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id',
    [nome, auth0OrgId, ativa],
  );
  return rows[0]!.id;
}

/** Faz o papel do dono cadastrando a pessoa na loja (o que o script db:usuario faz). */
export async function cadastrarUsuario(
  admin: pg.Pool,
  lojaId: string,
  auth0Sub: string,
  papel: PapelDeLoja = 'vendedor',
  ativo = true,
): Promise<void> {
  await admin.query(
    `INSERT INTO usuarios (id, loja_id, auth0_sub, papel, ativo) VALUES (gen_random_uuid(), $1, $2, $3::papel, $4)`,
    [lojaId, auth0Sub, papel, ativo],
  );
}

/** Insere produto direto no banco (como superusuário), com o próximo código interno da loja. */
export async function criarProdutoDireto(
  admin: pg.Pool,
  lojaId: string,
  nome: string,
  codigoBarras: string | null = null,
): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO produtos (id, loja_id, codigo_interno, codigo_barras, nome, preco_centavos)
     VALUES (gen_random_uuid(), $1,
             lpad(((SELECT count(*) FROM produtos WHERE loja_id = $1) + 1)::text, 4, '0'),
             $2, $3, 1000)
     RETURNING id`,
    [lojaId, codigoBarras, nome],
  );
  return rows[0]!.id;
}

/** Executa `fn` numa transação da role saas_app, com app.loja_id = lojaId (ou sem definir, se null). */
export async function comoApp<T>(app: pg.Pool, lojaId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await app.connect();
  try {
    await c.query('BEGIN');
    if (lojaId !== null) await c.query(`SELECT set_config('app.loja_id', $1, true)`, [lojaId]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
