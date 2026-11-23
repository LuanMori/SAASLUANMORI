// apps/api/scripts/cadastrar-suporte.ts
// O Adm. Sup (super_admin): o usuário mestre do sistema, que entra em QUALQUER loja (pedido do Luan, 23/11/2026).
// Fica numa linha sem loja (loja_id NULL); a API não enxerga essa linha (RLS) e usa só as funções app_suporte_*.
// Na loja, aparece como "Suporte" (histórico, vendas). Só ele cadastra o Dono (implantação) e o Administrador.
//
// Uso:
//   npm run db:suporte -w @saas/api -- --usuario suporte                 (cadastra; mostra a senha UMA vez)
//   npm run db:suporte -w @saas/api -- --usuario suporte --redefinir-senha
//   npm run db:suporte -w @saas/api -- --usuario suporte --desativar
//   npm run db:suporte -w @saas/api -- --usuario suporte --reativar
//
// A senha é sorteada aqui (20 letras e números) e mostrada uma vez: guarde num cofre de senhas. Não é provisória
// (o suporte não troca a senha pela tela da loja). Lê DATABASE_URL_MIGRATE (a dona do schema).
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { NOME_SUPORTE, validarLogin, validarSenhaNova } from '@saas/core';
import pg from 'pg';
import { gerarHashSenha } from '../src/auth/senhas.js';

export type AcaoSuporte = 'cadastrar' | 'redefinir-senha' | 'desativar' | 'reativar';
export interface ResultadoSuporte {
  resumo: string;
  /** Só quando uma senha foi criada. */
  senha?: string;
}

const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function sortearSenhaDoSuporte(usuario: string): string {
  for (;;) {
    const s = Array.from({ length: 20 }, () => LETRAS[randomInt(LETRAS.length)]).join('');
    if (validarSenhaNova(s, { usuario, nome: NOME_SUPORTE }).ok) return s;
  }
}

export async function cadastrarSuporte(connectionString: string, opcoes: { usuario: string; acao: AcaoSuporte }): Promise<ResultadoSuporte> {
  const login = validarLogin(opcoes.usuario);
  if (!login.ok) throw new Error(login.erros.map((e) => e.mensagem).join(' '));
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    // duas execuções ao mesmo tempo com o mesmo login não criam dois suportes
    await cliente.query(`SELECT pg_advisory_xact_lock(hashtextextended('suporte:' || $1, 0))`, [login.valor]);
    const atual = (
      await cliente.query<{ id: string; ativo: boolean }>(`SELECT id, ativo FROM usuarios WHERE loja_id IS NULL AND papel = 'super_admin' AND usuario = $1`, [login.valor])
    ).rows[0];
    let r: ResultadoSuporte;
    if (opcoes.acao === 'cadastrar') {
      if (atual) throw new Error(`O suporte "${login.valor}" já existe. Use --redefinir-senha, --desativar ou --reativar.`);
      // o login do suporte vale em todas as lojas: não pode ser o de alguém de uma loja (procura loja a loja, pelo RLS)
      for (const l of (await cliente.query<{ id: string; nome: string }>('SELECT id, nome FROM lojas ORDER BY nome')).rows) {
        await cliente.query(`SELECT set_config('app.loja_id', $1, true)`, [l.id]);
        const usado = await cliente.query('SELECT 1 FROM usuarios WHERE loja_id = $1 AND usuario = $2', [l.id, login.valor]);
        if (usado.rowCount) throw new Error(`O login "${login.valor}" já é de um usuário da loja ${l.nome}. Escolha outro para o suporte (ex.: suporte.joao).`);
      }
      const senha = sortearSenhaDoSuporte(login.valor);
      await cliente.query(
        `INSERT INTO usuarios (id, loja_id, usuario, nome, papel, ativo, senha_hash, senha_provisoria) VALUES (gen_random_uuid(), NULL, $1, $2, 'super_admin', true, $3, false)`,
        [login.valor, NOME_SUPORTE, await gerarHashSenha(senha)],
      );
      r = { resumo: `Suporte (Adm. Sup) "${login.valor}" cadastrado: entra em qualquer loja.`, senha };
    } else {
      if (!atual) throw new Error(`Não há suporte "${login.valor}". Cadastre antes (sem opção).`);
      // As sessões do suporte ficam nas lojas em que ele entrou: encerra loja a loja, com a loja no app.loja_id (no RDS a
      // dona do schema não é superusuário e também passa pelo RLS forçado das sessões — o mesmo cuidado do db:usuario).
      const encerrar = async () => {
        const lojas = (await cliente.query<{ id: string }>('SELECT id FROM lojas')).rows;
        for (const l of lojas) {
          await cliente.query(`SELECT set_config('app.loja_id', $1, true)`, [l.id]);
          await cliente.query('UPDATE sessoes SET encerrada_em = now() WHERE loja_id = $1 AND usuario_id = $2 AND encerrada_em IS NULL', [l.id, atual.id]);
        }
      };
      if (opcoes.acao === 'redefinir-senha') {
        const senha = sortearSenhaDoSuporte(login.valor);
        await cliente.query(`UPDATE usuarios SET senha_hash = $2, tentativas_erradas = 0, bloqueado_ate = NULL, atualizado_em = now() WHERE id = $1`, [
          atual.id,
          await gerarHashSenha(senha),
        ]);
        await encerrar();
        r = { resumo: `Nova senha para o suporte "${login.valor}" (as sessões abertas terminaram).`, senha };
      } else {
        const ativo = opcoes.acao === 'reativar';
        await cliente.query('UPDATE usuarios SET ativo = $2, atualizado_em = now() WHERE id = $1', [atual.id, ativo]);
        if (!ativo) await encerrar();
        r = { resumo: `Suporte "${login.valor}" ${ativo ? 'reativado' : 'desativado'}.` };
      }
    }
    await cliente.query('COMMIT');
    return r;
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: { usuario: { type: 'string' }, 'redefinir-senha': { type: 'boolean' }, desativar: { type: 'boolean' }, reativar: { type: 'boolean' } },
  });
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url) throw new Error('Defina DATABASE_URL_MIGRATE (a dona do schema).');
  if (!values.usuario) throw new Error('Informe --usuario (ex.: --usuario suporte).');
  const acoes = (['redefinir-senha', 'desativar', 'reativar'] as const).filter((a) => values[a]);
  if (acoes.length > 1) throw new Error('Use só uma opção por vez.');
  const r = await cadastrarSuporte(url, { usuario: values.usuario, acao: acoes[0] ?? 'cadastrar' });
  console.log(r.resumo);
  if (r.senha) console.log(`Senha (mostrada só agora; guarde num cofre de senhas): ${r.senha}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
