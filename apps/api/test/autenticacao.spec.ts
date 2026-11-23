// apps/api/test/autenticacao.spec.ts
// Login próprio (itens 3.5 e 5.4 da revisão de 18/11/2026): o que a API aceita e o que recusa.
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { MENSAGEM_ACABOU_DE_BLOQUEAR, MENSAGEM_CREDENCIAIS } from '@saas/core';
import type pg from 'pg';
import request from 'supertest';
import { criarAppTeste } from './apoio/app.js';
import { criarLoja, criarUsuario, limparBanco, poolAdmin, SENHA_TESTE } from './apoio/banco.js';
import { cookieDe, entrar } from './apoio/sessao.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let ultimoIp = 0;
/** Cada teste usa IPs próprios, para o limite por IP de um teste não atrapalhar o outro. */
const ipNovo = () => `203.0.113.${(ultimoIp = (ultimoIp % 250) + 1)}`;

describe('Login próprio (usuário e senha)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let lojaA: string;

  const http = () => request(app.getHttpServer());
  const login = (corpo: object, ip = ipNovo()) => http().post('/sessao').set('X-Forwarded-For', ip).send(corpo);
  const ana = (senha = SENHA_TESTE) => ({ loja: 'lojaa', usuario: 'ana', senha });
  const contar = async (sql: string, ...p: unknown[]) => (await admin.query<{ n: number }>(sql, p)).rows[0]!.n;

  beforeAll(async () => {
    app = await criarAppTeste();
    admin = poolAdmin();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'lojaa');
    await criarLoja(admin, 'Loja Inativa', 'inativa', false);
    await criarUsuario(admin, lojaA, { usuario: 'ana', nome: 'Ana Paula' });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('entra: cookie HttpOnly e SameSite=Strict, sem validade fixa; o banco guarda só o hash do segredo', async () => {
    const r = await login(ana()).expect(200);
    expect(r.body).toEqual({
      usuario: { id: expect.stringMatching(UUID), nome: 'Ana Paula', usuario: 'ana', papel: 'vendedor', permissoes: [] },
      loja: { nome: 'Loja A', subdominio: 'lojaa' },
      senhaProvisoria: false,
      inatividadeMin: 30,
    });
    const linha = (r.headers['set-cookie'] as unknown as string[])[0]!;
    expect(linha).toMatch(/^sessao=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict$/);

    const segredo = cookieDe(r).split('.')[1]!;
    const sessoes = await admin.query('SELECT token_hash FROM sessoes');
    expect(sessoes.rows).toEqual([{ token_hash: createHash('sha256').update(segredo).digest('hex') }]);

    const u = await admin.query(`SELECT senha_hash, ultimo_acesso_em FROM usuarios WHERE usuario = 'ana'`);
    expect(u.rows[0].senha_hash).toMatch(/^scrypt\$/);
    expect(u.rows[0].senha_hash).not.toContain(SENHA_TESTE);
    expect(u.rows[0].ultimo_acesso_em).not.toBeNull();
    expect(await contar(`SELECT count(*)::int AS n FROM auditoria WHERE acao = 'sessao.entrou'`)).toBe(1);
  });

  it('o usuário vale sem diferença de maiúsculas e espaços nas pontas', async () => {
    await login({ ...ana(), usuario: '  ANA ' }).expect(200);
  });

  it('com o cookie, acessa; sem cookie, 401', async () => {
    const cookie = await entrar(app, 'lojaa', 'ana');
    await http().get('/produtos').set('Cookie', cookie).expect(200);
    const r = await http().get('/produtos').expect(401);
    expect(r.body).toEqual({ status: 401, mensagem: 'Faça login para continuar.', codigo: 'sem_sessao' });
  });

  it('GET /sessao diz quem está logado', async () => {
    const cookie = await entrar(app, 'lojaa', 'ana');
    const r = await http().get('/sessao').set('Cookie', cookie).expect(200);
    expect(r.body).toMatchObject({ usuario: { nome: 'Ana Paula', usuario: 'ana', papel: 'vendedor' }, loja: { subdominio: 'lojaa' }, senhaProvisoria: false });
  });

  describe('cookie adulterado -> 401 e o cookie é apagado', () => {
    const casos: [string, (c: string, lojaB: string) => string][] = [
      ['segredo trocado', (c) => c.replace(/\.[A-Za-z0-9_-]{43}$/, `.${'A'.repeat(43)}`)],
      ['loja trocada (mesmo segredo, outra loja)', (c, lojaB) => c.replace(/=[0-9a-f-]{36}\./, `=${lojaB}.`)],
      ['formato inválido', () => 'sessao=qualquer-coisa'],
    ];
    it.each(casos)('%s', async (_nome, adulterar) => {
      const lojaB = await criarLoja(admin, 'Loja B', 'lojab');
      const cookie = await entrar(app, 'lojaa', 'ana');
      const r = await http().get('/produtos').set('Cookie', adulterar(cookie, lojaB)).expect(401);
      expect(r.body).toEqual({ status: 401, mensagem: 'Sua sessão terminou. Entre de novo.', codigo: 'sessao_encerrada' });
      expect((r.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^sessao=; .*Max-Age=0/);
    });
  });

  describe('senha errada', () => {
    it('senha errada e usuário que não existe recebem a MESMA resposta', async () => {
      const errada = await login(ana('outra-senha-qualquer')).expect(401);
      const inexistente = await login({ ...ana('outra-senha-qualquer'), usuario: 'fantasma' }).expect(401);
      expect(errada.body).toEqual({ status: 401, mensagem: MENSAGEM_CREDENCIAIS, codigo: 'credenciais' });
      expect(inexistente.body).toEqual(errada.body);
    });

    it('5 senhas erradas bloqueiam o usuário por 5 minutos — nem a senha certa entra', async () => {
      for (let i = 1; i <= 4; i += 1) await login(ana(`errada-${i}`)).expect(401);
      const quinta = await login(ana('errada-5')).expect(429);
      expect(quinta.body).toEqual({ status: 429, mensagem: MENSAGEM_ACABOU_DE_BLOQUEAR, codigo: 'muitas_tentativas' });
      expect(quinta.headers['retry-after']).toBe('300');

      const certa = await login(ana()).expect(429);
      expect(certa.body.mensagem).toBe('Muitas tentativas erradas. Tente de novo em 5 min ou peça ao dono para trocar sua senha.');
      const { rows } = await admin.query(`SELECT tentativas_erradas, bloqueado_ate > now() + interval '4 minutes' AS bloqueado FROM usuarios WHERE usuario = 'ana'`);
      expect(rows[0]).toEqual({ tentativas_erradas: 0, bloqueado: true });

      // passados os 5 minutos (simulado no banco), a senha certa entra
      await admin.query(`UPDATE usuarios SET bloqueado_ate = now() - interval '1 second' WHERE usuario = 'ana'`);
      await login(ana()).expect(200);
      const acoes = await admin.query(`SELECT acao, count(*)::int AS n FROM auditoria GROUP BY acao ORDER BY acao`);
      expect(acoes.rows).toEqual([
        { acao: 'sessao.bloqueado', n: 1 },
        { acao: 'sessao.entrou', n: 1 },
        { acao: 'sessao.senha_errada', n: 4 },
      ]);
    });

    it('usuário que NÃO existe "bloqueia" do mesmo jeito (o bloqueio não revela quem existe)', async () => {
      const fantasma = (i: number) => ({ loja: 'lojaa', usuario: 'fantasma', senha: `errada-${i}` });
      for (let i = 1; i <= 4; i += 1) await login(fantasma(i)).expect(401);
      expect((await login(fantasma(5)).expect(429)).body.mensagem).toBe(MENSAGEM_ACABOU_DE_BLOQUEAR);
      expect((await login(fantasma(6)).expect(429)).body.mensagem).toMatch(/Tente de novo em 5 min/);
    });

    it('acertar zera a contagem', async () => {
      for (let i = 1; i <= 3; i += 1) await login(ana(`errada-${i}`)).expect(401);
      await login(ana()).expect(200);
      expect(await contar(`SELECT tentativas_erradas AS n FROM usuarios WHERE usuario = 'ana'`)).toBe(0);
    });

    it('30 tentativas ao mesmo tempo: só 4 erram antes do bloqueio (uma por vez para o mesmo usuário)', async () => {
      const respostas = await Promise.all(Array.from({ length: 30 }, (_, i) => login(ana(`errada-${i}`))));
      const status = respostas.map((r) => r.status);
      expect(status.filter((s) => s === 401)).toHaveLength(4);
      expect(status.filter((s) => s === 429)).toHaveLength(26);
      expect(await contar(`SELECT count(*)::int AS n FROM auditoria WHERE acao = 'sessao.senha_errada'`)).toBe(4);
    });

    it('limite por IP: 5 logins errados em 1 minuto (usuários diferentes) bloqueiam aquele IP', async () => {
      const ip = ipNovo();
      for (const usuario of ['u1', 'u2', 'u3', 'u4', 'u5']) await login({ loja: 'lojaa', usuario, senha: 'x-errada-1' }, ip).expect(401);
      const r = await login(ana(), ip).expect(429);
      expect(r.body.mensagem).toBe('Muitas tentativas de login erradas a partir desta rede. Tente de novo em 5 min.');
      await login(ana(), ipNovo()).expect(200); // de outro IP, a Ana entra
    });
  });

  it('usuário desativado: só quem acerta a senha descobre que está desativado', async () => {
    await criarUsuario(admin, lojaA, { usuario: 'demitido', ativo: false });
    await login({ loja: 'lojaa', usuario: 'demitido', senha: 'senha-errada-1' }).expect(401);
    const r = await login({ loja: 'lojaa', usuario: 'demitido', senha: SENHA_TESTE }).expect(403);
    expect(r.body).toEqual({ status: 403, mensagem: 'Seu acesso a esta loja está desativado. Fale com o Dono da loja.', codigo: 'usuario_desativado' });
  });

  it('usuário sem senha (veio do Auth0) não entra até o Dono criar uma senha', async () => {
    await criarUsuario(admin, lojaA, { usuario: 'antigo', senha: null });
    const r = await login({ loja: 'lojaa', usuario: 'antigo', senha: SENHA_TESTE }).expect(401);
    expect(r.body.mensagem).toBe(MENSAGEM_CREDENCIAIS);
  });

  it('loja que não existe e loja inativa: a mesma resposta', async () => {
    const naoExiste = await login({ ...ana(), loja: 'naoexiste' }).expect(404);
    const inativa = await login({ ...ana(), loja: 'inativa' }).expect(404);
    expect(naoExiste.body).toEqual({ status: 404, mensagem: 'Loja não encontrada. Confira o endereço.', codigo: 'loja_nao_encontrada' });
    expect(inativa.body).toEqual(naoExiste.body);
  });

  it.each([{}, { usuario: 'ana' }, { usuario: 1, senha: 2 }, { usuario: '', senha: '' }])('pede usuário e senha (%p)', async (corpo) => {
    const r = await login({ loja: 'lojaa', ...corpo }).expect(400);
    expect(r.body).toEqual({ status: 400, mensagem: 'Informe o usuário e a senha.' });
  });

  describe('a sessão termina', () => {
    it('depois de 30 minutos sem uso', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      await admin.query(`UPDATE sessoes SET ultimo_uso_em = now() - interval '31 minutes'`);
      expect((await http().get('/produtos').set('Cookie', cookie).expect(401)).body.codigo).toBe('sessao_encerrada');
      expect(await contar(`SELECT count(*)::int AS n FROM sessoes WHERE encerrada_em IS NOT NULL`)).toBe(1);
    });

    it('12 horas depois do login, mesmo em uso', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      await admin.query(`UPDATE sessoes SET expira_em = now() - interval '1 second'`);
      await http().get('/produtos').set('Cookie', cookie).expect(401);
    });

    it('usar renova o "último uso" (no máximo uma gravação por minuto)', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      await admin.query(`UPDATE sessoes SET ultimo_uso_em = now() - interval '10 minutes'`);
      await http().get('/produtos').set('Cookie', cookie).expect(200);
      expect(await contar(`SELECT count(*)::int AS n FROM sessoes WHERE ultimo_uso_em > now() - interval '1 minute'`)).toBe(1);
    });

    it('quando o usuário é desativado ou a loja é desativada', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      await admin.query(`UPDATE usuarios SET ativo = false WHERE usuario = 'ana'`);
      await http().get('/produtos').set('Cookie', cookie).expect(401);

      await admin.query(`UPDATE usuarios SET ativo = true WHERE usuario = 'ana'`);
      const outro = await entrar(app, 'lojaa', 'ana');
      await admin.query(`UPDATE lojas SET ativa = false WHERE id = $1`, [lojaA]);
      await http().get('/produtos').set('Cookie', outro).expect(401);
    });

    it('ao sair: o mesmo cookie não entra mais', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      const r = await http().post('/sessao/sair').set('Cookie', cookie).expect(204);
      expect((r.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^sessao=; .*Max-Age=0/);
      await http().get('/produtos').set('Cookie', cookie).expect(401);
      expect(await contar(`SELECT count(*)::int AS n FROM auditoria WHERE acao = 'sessao.saiu'`)).toBe(1);
      // sair de novo, ou sem cookie, não dá erro
      await http().post('/sessao/sair').set('Cookie', cookie).expect(204);
      await http().post('/sessao/sair').expect(204);
    });

    it('cada login gera um segredo novo e encerra a sessão anterior do mesmo navegador', async () => {
      const antigo = await entrar(app, 'lojaa', 'ana');
      const r = await http().post('/sessao').set('Cookie', antigo).send(ana()).expect(200);
      const novo = cookieDe(r);
      expect(novo).not.toBe(antigo);
      await http().get('/sessao').set('Cookie', antigo).expect(401);
      await http().get('/sessao').set('Cookie', novo).expect(200);
    });
  });

  describe('senha provisória (criada pelo Dono)', () => {
    beforeEach(async () => {
      await criarUsuario(admin, lojaA, { usuario: 'novato', nome: 'Novo Vendedor', senha: 'provisoria-9876', provisoria: true });
    });

    it('entra, mas só consegue criar a própria senha; depois, usa normalmente', async () => {
      const r = await login({ loja: 'lojaa', usuario: 'novato', senha: 'provisoria-9876' }).expect(200);
      expect(r.body.senhaProvisoria).toBe(true);
      const cookie = cookieDe(r);

      const bloqueado = await http().get('/produtos').set('Cookie', cookie).expect(403);
      expect(bloqueado.body).toEqual({ status: 403, mensagem: 'Crie a sua senha antes de continuar.', codigo: 'senha_provisoria' });
      await http().get('/sessao').set('Cookie', cookie).expect(200);

      const trocou = await http()
        .post('/sessao/senha')
        .set('Cookie', cookie)
        .send({ senhaAtual: 'provisoria-9876', senhaNova: 'minha-senha-de-verdade' })
        .expect(200);
      expect(trocou.body.senhaProvisoria).toBe(false);
      await http().get('/produtos').set('Cookie', cookie).expect(200);
      expect(await contar(`SELECT count(*)::int AS n FROM auditoria WHERE acao = 'usuario.senha_trocada'`)).toBe(1);
    });
  });

  describe('trocar a própria senha', () => {
    const trocar = (cookie: string, senhaAtual: string, senhaNova: string) =>
      http().post('/sessao/senha').set('Cookie', cookie).send({ senhaAtual, senhaNova });

    it.each([
      ['1234567', 'A senha precisa ter pelo menos 8 caracteres.'],
      ['12345678', 'Esta senha é fácil de adivinhar. Escolha outra.'],
      [SENHA_TESTE, 'A senha nova precisa ser diferente da atual.'],
    ])('recusa "%s"', async (senhaNova, mensagem) => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      expect((await trocar(cookie, SENHA_TESTE, senhaNova).expect(400)).body.mensagem).toBe(mensagem);
    });

    it('senha atual errada -> 400; na 5ª, bloqueia e derruba a sessão', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      for (let i = 1; i <= 4; i += 1) {
        expect((await trocar(cookie, `errada-${i}`, 'senha-nova-boa-1').expect(400)).body.mensagem).toBe('A senha atual não confere.');
      }
      const r = await trocar(cookie, 'errada-5', 'senha-nova-boa-1').expect(429);
      expect(r.body.mensagem).toBe(MENSAGEM_ACABOU_DE_BLOQUEAR);
      await http().get('/sessao').set('Cookie', cookie).expect(401);
      await login(ana()).expect(429);
    });

    it('troca, derruba as OUTRAS sessões (outros aparelhos) e mantém a atual', async () => {
      const celular = await entrar(app, 'lojaa', 'ana');
      const caixa = await entrar(app, 'lojaa', 'ana');
      await trocar(caixa, SENHA_TESTE, 'senha-nova-da-ana').expect(200);
      await http().get('/sessao').set('Cookie', celular).expect(401);
      await http().get('/sessao').set('Cookie', caixa).expect(200);
      await login(ana()).expect(401);
      await login(ana('senha-nova-da-ana')).expect(200);
    });
  });

  describe('proteções HTTP', () => {
    it('pedido que muda dados vindo de OUTRO site -> 403 (o mesmo endereço e a origem liberada passam)', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      const produto = { nome: 'Bolinha', precoCentavos: 500 };
      const outroSite = await http().post('/produtos').set('Cookie', cookie).set('Origin', 'https://site-malicioso.example').send(produto).expect(403);
      expect(outroSite.body).toEqual({ status: 403, mensagem: 'Pedido vindo de outro site recusado.' });
      await http().post('/produtos').set('Cookie', cookie).set('Sec-Fetch-Site', 'cross-site').send(produto).expect(403);
      await http()
        .post('/produtos')
        .set('Cookie', cookie)
        .set('Host', 'lojaa.exemplo.com.br')
        .set('Origin', 'https://lojaa.exemplo.com.br')
        .send(produto)
        .expect(201);
      await http().post('/produtos').set('Cookie', cookie).set('Origin', 'http://localhost:5173').send(produto).expect(201);
      expect(await contar('SELECT count(*)::int AS n FROM produtos')).toBe(2);
    });

    it('o login também confere a origem', async () => {
      await http().post('/sessao').set('Origin', 'https://site-malicioso.example').send(ana()).expect(403);
    });

    it('toda resposta tem X-Request-Id e Cache-Control: no-store', async () => {
      const r = await http().get('/saude').expect(200);
      expect(r.body).toEqual({ status: 'ok' });
      expect(r.headers['x-request-id']).toMatch(UUID);
      expect(r.headers['cache-control']).toBe('no-store');
      expect((await http().get('/saude').set('X-Request-Id', 'nginx-1234abcd').expect(200)).headers['x-request-id']).toBe('nginx-1234abcd');
      expect((await http().get('/saude').set('X-Request-Id', 'x').expect(200)).headers['x-request-id']).toMatch(UUID);
    });

    it('JSON malformado -> 400 com mensagem própria', async () => {
      const cookie = await entrar(app, 'lojaa', 'ana');
      const r = await http().post('/produtos').set('Cookie', cookie).set('Content-Type', 'application/json').send('{"nome":').expect(400);
      expect(r.body).toEqual({ status: 400, mensagem: 'JSON inválido.' });
    });

    it('rota inexistente -> 404 no formato padrão', async () => {
      const r = await http().get('/nao-existe').expect(404);
      expect(r.body).toEqual({ status: 404, mensagem: 'Rota não encontrada.' });
    });
  });
});

describe('Cookie em produção (COOKIE_SEGURO)', () => {
  let app: INestApplication;
  let admin: pg.Pool;

  beforeAll(async () => {
    app = await criarAppTeste({ cookieSeguro: true });
    admin = poolAdmin();
    await limparBanco(admin);
    const loja = await criarLoja(admin, 'Loja A', 'lojaa');
    await criarUsuario(admin, loja, { usuario: 'ana' });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('__Host-sessao, só por HTTPS (Secure), só neste endereço', async () => {
    const r = await request(app.getHttpServer()).post('/sessao').send({ loja: 'lojaa', usuario: 'ana', senha: SENHA_TESTE }).expect(200);
    const linha = (r.headers['set-cookie'] as unknown as string[])[0]!;
    expect(linha).toMatch(/^__Host-sessao=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
    const valor = cookieDe(r).split('=')[1]!;
    await request(app.getHttpServer()).get('/sessao').set('Cookie', `__Host-sessao=${valor}`).expect(200);
    // sem o prefixo (um cookie que outro subdomínio poderia ter plantado) não vale
    await request(app.getHttpServer()).get('/sessao').set('Cookie', `sessao=${valor}`).expect(401);
  });
});

describe('Loja pelo endereço (DOMINIO_BASE)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await criarAppTeste({ dominioBase: 'nomedaempresa.com.br' });
    admin = poolAdmin();
    await limparBanco(admin);
    await criarLoja(admin, 'Loja A', 'lojaa');
    const lojaB = await criarLoja(admin, 'Loja B', 'lojab');
    await criarUsuario(admin, lojaB, { usuario: 'bia' });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('a loja vem do endereço acessado, nunca do que a tela manda', async () => {
    const corpo = { loja: 'lojab', usuario: 'bia', senha: SENHA_TESTE };
    await http().post('/sessao').set('Host', 'lojaa.nomedaempresa.com.br').send(corpo).expect(401);
    await http().post('/sessao').set('Host', 'lojab.nomedaempresa.com.br').send({ ...corpo, loja: 'lojaa' }).expect(200);
    await http().post('/sessao').set('Host', 'nomedaempresa.com.br').send(corpo).expect(404);
  });

  it('a sessão só vale no endereço da própria loja', async () => {
    const r = await http().post('/sessao').set('Host', 'lojab.nomedaempresa.com.br').send({ usuario: 'bia', senha: SENHA_TESTE }).expect(200);
    const cookie = cookieDe(r);
    await http().get('/sessao').set('Host', 'lojaa.nomedaempresa.com.br').set('Cookie', cookie).expect(401);
    // e a sessão usada no endereço errado foi encerrada
    await http().get('/sessao').set('Host', 'lojab.nomedaempresa.com.br').set('Cookie', cookie).expect(401);
  });

  it('GET /sessao/loja mostra o nome da loja do endereço', async () => {
    const b = await http().get('/sessao/loja').set('Host', 'lojab.nomedaempresa.com.br').expect(200);
    expect(b.body).toEqual({ loja: { nome: 'Loja B', subdominio: 'lojab' }, informarLoja: false });
    const nenhuma = await http().get('/sessao/loja?loja=lojab').set('Host', 'outra.nomedaempresa.com.br').expect(200);
    expect(nenhuma.body).toEqual({ loja: null, informarLoja: false });
  });
});
