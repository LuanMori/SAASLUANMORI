// apps/api/test/backup.spec.ts
// Backup e restauração DE VERDADE (item 3.x da revisão): pg_dump com a role de backup -> pg_restore
// num banco novo -> as mesmas linhas, o mesmo RLS, e a API sobe no banco restaurado.
// Precisa do pg_dump/pg_restore (cliente do PostgreSQL 16) no PATH. No CI ele é obrigatório; na sua
// máquina, sem ele, o teste é pulado com um aviso (docs/backup.md explica como instalar).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { criarRoleBackup } from '../scripts/criar-role-backup.js';
import { BancoService } from '../src/banco/banco.service.js';
import { lerAmbiente } from '../src/config/ambiente.js';
import { criarLoja, criarProdutoDireto, criarUsuario, limparBanco, poolAdmin } from './apoio/banco.js';
import { ADMIN_URL, BANCO_TESTE, SENHA_APP_TESTE, urlDoBanco } from './apoio/config.js';

const ROLE = 'saas_backup_teste';
const SENHA = 'senha-do-backup-de-teste-123';
const RESTAURO = 'saas_teste_restauro';
const TABELAS = ['auditoria', 'lojas', 'produtos', 'sessoes', 'usuarios'];

const temPgDump = spawnSync('pg_dump', ['--version']).status === 0;
if (!temPgDump && !process.env.CI) console.warn('pg_dump não encontrado: teste de backup pulado (no CI ele roda sempre).');
const descrever = temPgDump || process.env.CI ? describe : describe.skip;

function rodar(comando: string, args: string[]): { status: number | null; erro: string } {
  const r = spawnSync(comando, args, { encoding: 'utf8' });
  return { status: r.status, erro: `${r.stderr ?? ''}${r.error ? String(r.error) : ''}` };
}

async function comCliente<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function retrato(url: string) {
  return comCliente(url, async (c) => {
    const linhas: Record<string, number> = {};
    for (const t of TABELAS) linhas[t] = (await c.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    const rls = (await c.query(`SELECT relname, relforcerowsecurity FROM pg_class WHERE relname = ANY($1) ORDER BY 1`, [TABELAS])).rows;
    const policies = (await c.query(`SELECT tablename, policyname FROM pg_policies ORDER BY 1`)).rows;
    const trigger = (await c.query(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`)).rows;
    const nomes = (await c.query(`SELECT nome FROM produtos ORDER BY nome`)).rows.map((r) => r.nome);
    return { linhas, rls, policies, trigger, nomes };
  });
}

descrever('Backup e restauração (pg_dump / pg_restore)', () => {
  let admin: pg.Pool;
  let pasta: string;

  beforeAll(async () => {
    admin = poolAdmin();
    pasta = mkdtempSync(join(tmpdir(), 'backup-'));
    await limparBanco(admin);
    const a = await criarLoja(admin, 'Loja A', 'lojaa');
    const b = await criarLoja(admin, 'Loja B', 'lojab');
    await criarUsuario(admin, a, { usuario: 'ana', nome: 'Ana Conceição', papel: 'dono' });
    await criarUsuario(admin, b, { usuario: 'bia', papel: 'dono' });
    await criarProdutoDireto(admin, a, 'Ração Pássaro Açaí');
    await criarProdutoDireto(admin, b, 'Coleira Pequena');
    await admin.query(`INSERT INTO auditoria (id, loja_id, acao) VALUES (gen_random_uuid(), $1, 'sessao.entrou'), (gen_random_uuid(), $2, 'sessao.entrou')`, [a, b]);
    await criarRoleBackup(urlDoBanco(BANCO_TESTE), SENHA, ROLE);
    await comCliente(ADMIN_URL, (c) => c.query(`DROP DATABASE IF EXISTS ${RESTAURO} WITH (FORCE)`));
  });

  afterAll(async () => {
    await comCliente(ADMIN_URL, (c) => c.query(`DROP DATABASE IF EXISTS ${RESTAURO} WITH (FORCE)`));
    await admin.query(`DROP OWNED BY ${ROLE}`);
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin.end();
    rmSync(pasta, { recursive: true, force: true });
  });

  it('com a role da API (sem BYPASSRLS) o pg_dump falha: por isso existe a role de backup', () => {
    const r = rodar('pg_dump', ['-Fc', '-f', join(pasta, 'app.dump'), urlDoBanco(BANCO_TESTE, { usuario: 'saas_app', senha: SENHA_APP_TESTE })]);
    expect(r.status).not.toBe(0);
    expect(r.erro).toMatch(/row-level security|permission denied/);
  });

  it('copia com a role de backup e restaura num banco novo: tudo igual, inclusive acentos e RLS', async () => {
    const arquivo = join(pasta, 'saas.dump');
    const dump = rodar('pg_dump', ['-Fc', '-f', arquivo, urlDoBanco(BANCO_TESTE, { usuario: ROLE, senha: SENHA })]);
    expect(dump).toEqual({ status: 0, erro: '' });
    expect(statSync(arquivo).size).toBeGreaterThan(1000);

    await comCliente(ADMIN_URL, (c) => c.query(`CREATE DATABASE ${RESTAURO}`));
    const restauro = rodar('pg_restore', ['--exit-on-error', '-d', urlDoBanco(RESTAURO), arquivo]);
    expect(restauro).toEqual({ status: 0, erro: '' });

    const original = await retrato(urlDoBanco(BANCO_TESTE));
    const restaurado = await retrato(urlDoBanco(RESTAURO));
    expect(restaurado).toEqual(original);
    expect(restaurado.linhas).toEqual({ auditoria: 2, lojas: 2, produtos: 2, sessoes: 0, usuarios: 2 });
    expect(restaurado.nomes).toContain('Ração Pássaro Açaí');

    // e a API sobe no banco restaurado (a conferência de segurança passa)
    const banco = new BancoService({ ...lerAmbiente(), databaseUrlApp: urlDoBanco(RESTAURO, { usuario: 'saas_app', senha: SENHA_APP_TESTE }) });
    try {
      await expect(banco.onModuleInit()).resolves.toBeUndefined();
    } finally {
      await banco.onModuleDestroy();
    }
  });

  it('a role de backup só lê', async () => {
    await expect(
      comCliente(urlDoBanco(BANCO_TESTE, { usuario: ROLE, senha: SENHA }), (c) => c.query(`UPDATE lojas SET nome = 'x'`)),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(comCliente(urlDoBanco(BANCO_TESTE, { usuario: ROLE, senha: SENHA }), (c) => c.query(`DELETE FROM produtos`))).rejects.toMatchObject({
      code: '42501',
    });
  });
});
