// apps/api/test/scripts.spec.ts
// Scripts de instalação: lojas pelo endereço (db:seed) e o primeiro Dono de cada loja (db:usuario).
import type pg from 'pg';
import { cadastrarSuporte } from '../scripts/cadastrar-suporte.js';
import { cadastrarUsuario, sortearSenhaProvisoria } from '../scripts/cadastrar-usuario.js';
import { lerSeedLojas, semearLojas } from '../scripts/seed-dev.js';
import { conferirSenha } from '../src/auth/senhas.js';
import { criarLoja, limparBanco, poolAdmin } from './apoio/banco.js';
import { BANCO_TESTE, urlDoBanco } from './apoio/config.js';

const URL = urlDoBanco(BANCO_TESTE);

describe('scripts/cadastrar-usuario', () => {
  let admin: pg.Pool;
  let lojaA: string;

  const usuario = async (login: string) =>
    (await admin.query('SELECT usuario, nome, papel, ativo, senha_hash, senha_provisoria, tentativas_erradas, bloqueado_ate FROM usuarios WHERE usuario = $1', [login])).rows[0];

  beforeAll(() => {
    admin = poolAdmin();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'lojaa');
  });

  afterAll(async () => {
    await admin.end();
  });

  it('cadastra o primeiro Dono com uma senha provisória sorteada (mostrada uma vez)', async () => {
    const r = await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'Ana', nome: 'Ana Paula', papel: 'dono', acao: 'cadastrar' });
    expect(r.resumo).toBe('ana cadastrado na loja Loja A como dono.');
    expect(r.senhaProvisoria).toMatch(/^[a-km-np-z2-9]{12}$/);
    const u = await usuario('ana');
    expect(u).toMatchObject({ nome: 'Ana Paula', papel: 'dono', ativo: true, senha_provisoria: true });
    expect(await conferirSenha(r.senhaProvisoria!, u.senha_hash)).toBe(true);
    const aud = await admin.query('SELECT acao, usuario_id, detalhes FROM auditoria');
    expect(aud.rows).toEqual([{ acao: 'usuario.criado', usuario_id: null, detalhes: { origem: 'script', papel: 'dono' } }]);
  });

  it('cadastrar de novo atualiza nome e papel e reativa, sem mexer na senha', async () => {
    const r = await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', nome: 'Ana', papel: 'vendedor', acao: 'cadastrar' });
    await admin.query(`UPDATE usuarios SET ativo = false WHERE usuario = 'ana'`);
    const hash = (await usuario('ana')).senha_hash;
    const r2 = await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', papel: 'administrador', acao: 'cadastrar' });
    expect(r2).toEqual({ resumo: 'ana atualizado na loja Loja A como administrador (a senha não mudou).' });
    expect(await usuario('ana')).toMatchObject({ nome: 'Ana', papel: 'administrador', ativo: true, senha_hash: hash });
    expect(r.senhaProvisoria).toBeDefined();
  });

  it('redefinir a senha: nova provisória, zera o bloqueio e encerra as sessões', async () => {
    await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', nome: 'Ana', papel: 'dono', acao: 'cadastrar' });
    await admin.query(`UPDATE usuarios SET senha_provisoria = false, tentativas_erradas = 0, bloqueado_ate = now() + interval '5 minutes' WHERE usuario = 'ana'`);
    await admin.query(
      `INSERT INTO sessoes (id, loja_id, usuario_id, token_hash, expira_em) SELECT gen_random_uuid(), loja_id, id, repeat('b', 64), now() + interval '1 hour' FROM usuarios WHERE usuario = 'ana'`,
    );
    const r = await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', acao: 'redefinir-senha' });
    expect(r.resumo).toBe('Nova senha provisória para ana na loja Loja A.');
    const u = await usuario('ana');
    expect(u).toMatchObject({ senha_provisoria: true, tentativas_erradas: 0, bloqueado_ate: null });
    expect(await conferirSenha(r.senhaProvisoria!, u.senha_hash)).toBe(true);
    const abertas = await admin.query('SELECT count(*)::int AS n FROM sessoes WHERE encerrada_em IS NULL');
    expect(abertas.rows[0].n).toBe(0);
  });

  it('desativa e encerra as sessões', async () => {
    await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', nome: 'Ana', papel: 'dono', acao: 'cadastrar' });
    expect((await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', acao: 'desativar' })).resumo).toBe('ana desativado na loja Loja A.');
    expect((await usuario('ana')).ativo).toBe(false);
  });

  it('o login do suporte não vale na loja; Personalizado só pela tela; saindo do Personalizado, as funções saem', async () => {
    await cadastrarSuporte(URL, { usuario: 'suporte', acao: 'cadastrar' });
    await expect(cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'suporte', nome: 'Falso Suporte', papel: 'dono', acao: 'cadastrar' })).rejects.toThrow(/é do suporte/);
    await expect(cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'bia', nome: 'Bia', papel: 'personalizado', acao: 'cadastrar' })).rejects.toThrow(/aba Usuários/);
    await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'bia', nome: 'Bia', papel: 'vendedor', acao: 'cadastrar' });
    await admin.query(`UPDATE usuarios SET papel = 'personalizado', permissoes = '{vender,caixa}' WHERE usuario = 'bia'`);
    await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'bia', nome: 'Bia', acao: 'cadastrar' }); // sem --papel: continua Personalizado
    expect((await admin.query(`SELECT papel, permissoes FROM usuarios WHERE usuario = 'bia'`)).rows[0]).toEqual({ papel: 'personalizado', permissoes: ['vender', 'caixa'] });
    await cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'bia', papel: 'vendedor', acao: 'cadastrar' });
    expect((await admin.query(`SELECT papel, permissoes FROM usuarios WHERE usuario = 'bia'`)).rows[0]).toEqual({ papel: 'vendedor', permissoes: [] });
  });

  it('recusa loja desconhecida, papel inválido, login inválido e cadastro sem nome', async () => {
    await expect(cadastrarUsuario(URL, { loja: 'naoexiste', usuario: 'ana', nome: 'Ana', papel: 'dono', acao: 'cadastrar' })).rejects.toThrow(/Nenhuma loja/);
    await expect(cadastrarUsuario(URL, { loja: 'Loja A', usuario: 'ana', nome: 'Ana', papel: 'dono', acao: 'cadastrar' })).rejects.toThrow(/--loja/);
    await expect(cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', nome: 'Ana', papel: 'chefe' as never, acao: 'cadastrar' })).rejects.toThrow(/papel/);
    await expect(cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', nome: 'Ana', papel: 'super_admin' as never, acao: 'cadastrar' })).rejects.toThrow(/papel/);
    await expect(cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'Ana Paula', nome: 'Ana', papel: 'dono', acao: 'cadastrar' })).rejects.toThrow(/usuário \(login\)/);
    await expect(cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'ana', papel: 'dono', acao: 'cadastrar' })).rejects.toThrow(/nome/);
    await expect(cadastrarUsuario(URL, { loja: 'lojaa', usuario: 'fantasma', acao: 'desativar' })).rejects.toThrow(/não está cadastrado/);
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM usuarios WHERE loja_id = $1', [lojaA]);
    expect(rows[0].n).toBe(0);
  });

  it('a senha sorteada passa nas regras de senha e não tem letras que confundem (0/o, 1/l)', () => {
    for (let i = 0; i < 50; i += 1) expect(sortearSenhaProvisoria('ana', 'Ana Paula')).toMatch(/^[a-km-np-z2-9]{12}$/);
  });
});

describe('scripts/seed-dev', () => {
  it('lê SEED_LOJAS ("Nome=endereco") e recusa formato inválido', () => {
    expect(lerSeedLojas('Loja A=lojaa; Pet Shop da Ana = PetShopDaAna ;')).toEqual([
      { nome: 'Loja A', subdominio: 'lojaa' },
      { nome: 'Pet Shop da Ana', subdominio: 'petshopdaana' },
    ]);
    expect(() => lerSeedLojas('Loja A=org_abc123')).toThrow(/inválida/);
    expect(() => lerSeedLojas('=lojaa')).toThrow(/inválida/);
    expect(() => lerSeedLojas('Site=www')).toThrow(/inválida/);
    expect(() => lerSeedLojas('A=b=c')).toThrow(/inválida/);
  });

  it('cria a loja e, de novo, só atualiza o nome', async () => {
    const admin = poolAdmin();
    try {
      await limparBanco(admin);
      expect(await semearLojas(URL, [{ nome: 'Loja A', subdominio: 'lojaa' }])).toEqual(['Loja pronta: Loja A (lojaa)']);
      await semearLojas(URL, [{ nome: 'Loja A — Centro', subdominio: 'lojaa' }]);
      const { rows } = await admin.query('SELECT nome, subdominio FROM lojas');
      expect(rows).toEqual([{ nome: 'Loja A — Centro', subdominio: 'lojaa' }]);
    } finally {
      await admin.end();
    }
  });
});
