// apps/api/test/apoio/banco.ts
// Conexões diretas ao banco de testes:
//   poolAdmin() -> superusuário (prepara dados e confere o que foi gravado; ignora RLS e a trava)
//   poolApp()   -> role saas_app (a mesma da API; sujeita a RLS e à trava de usuários)
import type { PapelDeLoja } from '@saas/core';
import pg from 'pg';
import { gerarHashSenha, usarCustoDeTeste } from '../../src/auth/senhas.js';
import { BANCO_TESTE, URL_APP_TESTE, urlDoBanco } from './config.js';

usarCustoDeTeste();

/** Senha padrão das pessoas criadas pelos testes. */
export const SENHA_TESTE = 'cavalo-bateria-grampo';

export function poolAdmin(): pg.Pool {
  return new pg.Pool({ connectionString: urlDoBanco(BANCO_TESTE), max: 3 });
}

export function poolApp(max = 3): pg.Pool {
  return new pg.Pool({ connectionString: URL_APP_TESTE, max });
}

export async function limparBanco(admin: pg.Pool): Promise<void> {
  await admin.query('TRUNCATE auditoria, sessoes, produtos, usuarios, lojas');
}

export async function criarLoja(admin: pg.Pool, nome: string, subdominio: string, ativa = true): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    'INSERT INTO lojas (id, nome, subdominio, ativa) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id',
    [nome, subdominio, ativa],
  );
  return rows[0]!.id;
}

export interface DadosUsuario {
  usuario: string;
  nome?: string;
  papel?: PapelDeLoja;
  /** null = sem senha (como os usuários que vieram do Auth0). */
  senha?: string | null;
  ativo?: boolean;
  /** Padrão false: a pessoa já criou a própria senha. */
  provisoria?: boolean;
}

/** Faz o papel do Dono cadastrando a pessoa (direto no banco, como superusuário). */
export async function criarUsuario(admin: pg.Pool, lojaId: string, d: DadosUsuario): Promise<string> {
  const senha = d.senha === undefined ? SENHA_TESTE : d.senha;
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO usuarios (id, loja_id, usuario, nome, papel, ativo, senha_hash, senha_provisoria)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::papel, $5, $6, $7) RETURNING id`,
    [lojaId, d.usuario, d.nome ?? `Pessoa ${d.usuario}`, d.papel ?? 'vendedor', d.ativo ?? true, senha === null ? null : await gerarHashSenha(senha), d.provisoria ?? false],
  );
  return rows[0]!.id;
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

/**
 * Executa `fn` numa transação da role saas_app, com app.loja_id = lojaId (ou sem definir, se null) e,
 * se informado, app.usuario_id = quem está "logado" (é o que a trava de usuários confere).
 */
export async function comoApp<T>(
  app: pg.Pool,
  lojaId: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
  usuarioId: string | null = null,
): Promise<T> {
  const c = await app.connect();
  try {
    await c.query('BEGIN');
    if (lojaId !== null) await c.query(`SELECT set_config('app.loja_id', $1, true)`, [lojaId]);
    if (usuarioId !== null) await c.query(`SELECT set_config('app.usuario_id', $1, true)`, [usuarioId]);
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
