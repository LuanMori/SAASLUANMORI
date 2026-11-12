// apps/api/scripts/cadastrar-usuario.ts
// Cadastra (ou desativa) uma pessoa numa loja. Faz o papel do "dono cadastra"
// até existir a tela de usuários (Fase 5.7) e o super_admin (Fase 3).
//
// Uso:
//   npm run db:usuario -w @saas/api -- --org org_xxx --sub "auth0|abc123" --papel dono
//   npm run db:usuario -w @saas/api -- --org org_xxx --sub "auth0|abc123" --desativar
//
// --sub é o "user_id" da pessoa no painel do Auth0 (User Management → Users).
// A pessoa também precisa ser membro da Organization no Auth0.
//
// Lê DATABASE_URL_MIGRATE. Define app.loja_id na transação: no RDS o usuário de
// migração é dono das tabelas mas não superusuário, então também passa pelo RLS.
// Não grava nome nem e-mail (dado pessoal só com auditoria — Fases 2/3).
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type PapelDeLoja, PAPEIS_DE_LOJA, ehPapelDeLoja } from '@saas/core';
import pg from 'pg';

export type OpcoesCadastro =
  | { org: string; sub: string; papel: PapelDeLoja; desativar?: false }
  | { org: string; sub: string; desativar: true };

export async function cadastrarUsuario(connectionString: string, opcoes: OpcoesCadastro): Promise<string> {
  const sub = opcoes.sub.trim();
  if (sub === '' || sub.length > 128) throw new Error('--sub inválido.');
  if (!opcoes.desativar && !ehPapelDeLoja(opcoes.papel)) {
    throw new Error(`--papel deve ser: ${PAPEIS_DE_LOJA.join(', ')}.`);
  }

  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    const loja = await cliente.query<{ id: string; nome: string }>(
      'SELECT id, nome FROM lojas WHERE auth0_org_id = $1',
      [opcoes.org],
    );
    const l = loja.rows[0];
    if (!l) throw new Error(`Nenhuma loja cadastrada com a organization ${opcoes.org}.`);

    await cliente.query('BEGIN');
    await cliente.query(`SELECT set_config('app.loja_id', $1, true)`, [l.id]);

    let resumo: string;
    if (opcoes.desativar) {
      const r = await cliente.query(
        'UPDATE usuarios SET ativo = false, atualizado_em = now() WHERE loja_id = $1 AND auth0_sub = $2',
        [l.id, sub],
      );
      if (r.rowCount === 0) throw new Error(`${sub} não está cadastrado na loja ${l.nome}.`);
      resumo = `${sub} desativado na loja ${l.nome}.`;
    } else {
      await cliente.query(
        `INSERT INTO usuarios (id, loja_id, auth0_sub, papel, ativo)
         VALUES (gen_random_uuid(), $1, $2, $3::papel, true)
         ON CONFLICT (loja_id, auth0_sub)
         DO UPDATE SET papel = EXCLUDED.papel, ativo = true, atualizado_em = now()`,
        [l.id, sub, opcoes.papel],
      );
      resumo = `${sub} cadastrado na loja ${l.nome} como ${opcoes.papel}.`;
    }

    await cliente.query('COMMIT');
    return resumo;
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      org: { type: 'string' },
      sub: { type: 'string' },
      papel: { type: 'string' },
      desativar: { type: 'boolean', default: false },
    },
  });
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url || !values.org || !values.sub || (!values.desativar && !values.papel)) {
    console.error('Uso: --org org_xxx --sub "auth0|..." (--papel dono|administrador|vendedor | --desativar)');
    console.error('Precisa de DATABASE_URL_MIGRATE.');
    process.exit(1);
  }
  const opcoes: OpcoesCadastro = values.desativar
    ? { org: values.org, sub: values.sub, desativar: true }
    : { org: values.org, sub: values.sub, papel: values.papel as PapelDeLoja };
  cadastrarUsuario(url, opcoes)
    .then((msg) => console.log(msg))
    .catch((e: unknown) => {
      console.error('Falha:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
