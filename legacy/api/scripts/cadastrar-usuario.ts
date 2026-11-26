// apps/api/scripts/cadastrar-usuario.ts
// Cadastra o PRIMEIRO Dono de uma loja (os outros, o Dono cadastra pela tela Usuários), ou socorre
// quem perdeu o acesso: nova senha provisória, desativar. Quem roda é o suporte (Adm. Sup), na implantação:
// o Dono e o Administrador só o suporte cadastra (pedido do Luan, 23/11/2026). O Personalizado, com as funções
// dele, é cadastrado pela tela; o login do suporte (db:suporte) não pode ser usado por ninguém da loja.
//
// Uso:
//   npm run db:usuario -w @saas/api -- --loja lojaa --usuario ana --nome "Ana Paula" --papel dono
//   npm run db:usuario -w @saas/api -- --loja lojaa --usuario ana --redefinir-senha
//   npm run db:usuario -w @saas/api -- --loja lojaa --usuario ana --desativar
//
// A senha provisória é sorteada aqui e mostrada UMA vez: entregue à pessoa; no primeiro acesso ela
// cria a própria senha (o sistema obriga). A senha nunca vai para o banco, só o hash (scrypt).
//
// Lê DATABASE_URL_MIGRATE. Define app.loja_id na transação: no RDS o usuário de
// migração é dono das tabelas mas não superusuário, então também passa pelo RLS.
// Cada ação fica no histórico (auditoria) como feita pelo "sistema" (sem usuário).
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ehPapelDeLoja, PAPEIS_DE_LOJA, type PapelDeLoja, validarLogin, validarNovoUsuario, validarSenhaNova, validarSubdominio } from '@saas/core';
import pg from 'pg';
import { gerarHashSenha } from '../src/auth/senhas.js';

export type OpcoesCadastro =
  | { loja: string; usuario: string; nome?: string; papel?: PapelDeLoja; acao: 'cadastrar' }
  | { loja: string; usuario: string; acao: 'redefinir-senha' | 'desativar' };

export interface ResultadoCadastro {
  resumo: string;
  /** Só quando uma senha provisória foi criada. */
  senhaProvisoria?: string;
}

const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem 0/o, 1/l/i: fácil de ditar

/** 12 letras e números sorteados (~59 bits): só serve até a pessoa criar a dela. */
export function sortearSenhaProvisoria(usuario: string, nome: string): string {
  for (;;) {
    const s = Array.from({ length: 12 }, () => LETRAS[randomInt(LETRAS.length)]).join('');
    if (validarSenhaNova(s, { usuario, nome }).ok) return s;
  }
}

function erroDe(r: { ok: false; erros: { mensagem: string }[] }): Error {
  return new Error(r.erros.map((e) => e.mensagem).join(' '));
}

export async function cadastrarUsuario(connectionString: string, opcoes: OpcoesCadastro): Promise<ResultadoCadastro> {
  const loja = validarSubdominio(opcoes.loja);
  if (!loja.ok) throw new Error('--loja inválida: use o endereço da loja (ex.: lojaa).');
  const login = validarLogin(opcoes.usuario);
  if (!login.ok) throw erroDe(login);

  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    const l = (await cliente.query<{ id: string; nome: string }>('SELECT id, nome FROM lojas WHERE subdominio = $1', [loja.valor])).rows[0];
    if (!l) throw new Error(`Nenhuma loja com o endereço "${loja.valor}". Rode o db:seed antes.`);

    await cliente.query('BEGIN');
    await cliente.query(`SELECT set_config('app.loja_id', $1, true)`, [l.id]);
    const atual = (
      await cliente.query<{ id: string; nome: string; papel: string }>('SELECT id, nome, papel FROM usuarios WHERE loja_id = $1 AND usuario = $2', [
        l.id,
        login.valor,
      ])
    ).rows[0];
    const auditar = (acao: string, id: string, detalhes: object = {}) =>
      cliente.query(
        `INSERT INTO auditoria (id, loja_id, usuario_id, acao, alvo_tipo, alvo_id, detalhes) VALUES (gen_random_uuid(), $1, NULL, $2, 'usuario', $3, $4)`,
        [l.id, acao, id, JSON.stringify({ origem: 'script', ...detalhes })],
      );
    const encerrarSessoes = (id: string) =>
      cliente.query('UPDATE sessoes SET encerrada_em = now() WHERE loja_id = $1 AND usuario_id = $2 AND encerrada_em IS NULL', [l.id, id]);

    let resultado: ResultadoCadastro;
    if (opcoes.acao !== 'cadastrar') {
      if (!atual) throw new Error(`${login.valor} não está cadastrado na loja ${l.nome}.`);
      if (opcoes.acao === 'desativar') {
        await cliente.query('UPDATE usuarios SET ativo = false, atualizado_em = now() WHERE id = $1', [atual.id]);
        await encerrarSessoes(atual.id);
        await auditar('usuario.desativado', atual.id);
        resultado = { resumo: `${login.valor} desativado na loja ${l.nome}.` };
      } else {
        const senha = sortearSenhaProvisoria(login.valor, atual.nome);
        await cliente.query(
          `UPDATE usuarios SET senha_hash = $2, senha_provisoria = true, tentativas_erradas = 0, bloqueado_ate = NULL, atualizado_em = now() WHERE id = $1`,
          [atual.id, await gerarHashSenha(senha)],
        );
        await encerrarSessoes(atual.id);
        await auditar('usuario.senha_redefinida', atual.id);
        resultado = { resumo: `Nova senha provisória para ${login.valor} na loja ${l.nome}.`, senhaProvisoria: senha };
      }
    } else if (opcoes.papel === 'personalizado') {
      throw new Error('O Personalizado é cadastrado pela aba Usuários, com as funções marcadas para ele.');
    } else if (atual) {
      if (opcoes.papel !== undefined && !ehPapelDeLoja(opcoes.papel)) throw new Error(`--papel deve ser: ${PAPEIS_DE_LOJA.join(', ')}.`);
      const nome = opcoes.nome?.trim() || atual.nome;
      const papel = opcoes.papel ?? atual.papel;
      // funções escolhidas só no Personalizado: saindo dele, elas saem junto (como na tela)
      await cliente.query(
        `UPDATE usuarios SET nome = $2, papel = $3::papel, permissoes = CASE WHEN $3 = 'personalizado' THEN permissoes ELSE '{}'::text[] END, ativo = true, atualizado_em = now() WHERE id = $1`,
        [atual.id, nome, papel],
      );
      await auditar('usuario.alterado', atual.id, { papel });
      resultado = { resumo: `${login.valor} atualizado na loja ${l.nome} como ${papel} (a senha não mudou).` };
    } else {
      const doSuporte = await cliente.query(`SELECT 1 FROM usuarios WHERE loja_id IS NULL AND papel = 'super_admin' AND usuario = $1`, [login.valor]);
      if (doSuporte.rowCount) throw new Error(`O login "${login.valor}" é do suporte (Adm. Sup). Escolha outro.`);
      const senha = sortearSenhaProvisoria(login.valor, opcoes.nome ?? '');
      const v = validarNovoUsuario({ nome: opcoes.nome, usuario: login.valor, papel: opcoes.papel, senha });
      if (!v.ok) throw erroDe(v);
      const { rows } = await cliente.query<{ id: string }>(
        `INSERT INTO usuarios (id, loja_id, usuario, nome, papel, ativo, senha_hash, senha_provisoria)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::papel, true, $5, true) RETURNING id`,
        [l.id, v.valor.usuario, v.valor.nome, v.valor.papel, await gerarHashSenha(senha)],
      );
      await auditar('usuario.criado', rows[0]!.id, { papel: v.valor.papel });
      resultado = { resumo: `${login.valor} cadastrado na loja ${l.nome} como ${v.valor.papel}.`, senhaProvisoria: senha };
    }

    await cliente.query('COMMIT');
    return resultado;
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
      loja: { type: 'string' },
      usuario: { type: 'string' },
      nome: { type: 'string' },
      papel: { type: 'string' },
      'redefinir-senha': { type: 'boolean', default: false },
      desativar: { type: 'boolean', default: false },
    },
  });
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url || !values.loja || !values.usuario || (values['redefinir-senha'] && values.desativar)) {
    console.error('Uso: --loja lojaa --usuario ana (--nome "Ana Paula" --papel dono | --redefinir-senha | --desativar)');
    console.error('Precisa de DATABASE_URL_MIGRATE.');
    process.exit(1);
  }
  const acao = values.desativar ? 'desativar' : values['redefinir-senha'] ? 'redefinir-senha' : 'cadastrar';
  const opcoes: OpcoesCadastro =
    acao === 'cadastrar'
      ? { loja: values.loja, usuario: values.usuario, nome: values.nome, papel: values.papel as PapelDeLoja | undefined, acao }
      : { loja: values.loja, usuario: values.usuario, acao };
  cadastrarUsuario(url, opcoes)
    .then((r) => {
      console.log(r.resumo);
      if (r.senhaProvisoria) {
        console.log(`Senha provisória: ${r.senhaProvisoria}`);
        console.log('Entregue à pessoa. No primeiro acesso ela cria a própria senha. Esta senha não aparece de novo.');
      }
    })
    .catch((e: unknown) => {
      console.error('Falha:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
