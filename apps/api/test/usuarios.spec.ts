// apps/api/test/usuarios.spec.ts
// Tela Usuários (item 5.4): o Dono e o Administrador cadastram a equipe. Regras do DaniPets V9.3.3
// mais as de um sistema na internet. Depois, a trava do banco, conectando direto como saas_app.
import type { INestApplication } from '@nestjs/common';
import { mensagemSemPermissao, NOME_USUARIO_REMOVIDO } from '@saas/core';
import pg from 'pg';
import request from 'supertest';
import { criarAppTeste } from './apoio/app.js';
import { comoApp, criarLoja, criarUsuario, limparBanco, poolAdmin, poolApp, SENHA_TESTE } from './apoio/banco.js';
import { URL_APP_TESTE } from './apoio/config.js';
import { entrar } from './apoio/sessao.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NEGADO = { code: '42501' };

describe('Tela Usuários (API)', () => {
  let app: INestApplication;
  let admin: pg.Pool;
  let lojaA: string;
  const id: Record<string, string> = {};
  const cookie: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await criarAppTeste();
    admin = poolAdmin();
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'lojaa');
    id.dona = await criarUsuario(admin, lojaA, { usuario: 'dona', nome: 'Dona Maria', papel: 'dono' });
    id.gerente = await criarUsuario(admin, lojaA, { usuario: 'gerente', nome: 'Gerente Carlos', papel: 'administrador' });
    id.caixa = await criarUsuario(admin, lojaA, { usuario: 'caixa', nome: 'Caixa Bruno', papel: 'vendedor' });
    for (const quem of ['dona', 'gerente', 'caixa']) cookie[quem] = await entrar(app, 'lojaa', quem);
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  const acoes = async () => (await admin.query(`SELECT acao, usuario_id, alvo_id, detalhes FROM auditoria WHERE acao LIKE 'usuario.%' ORDER BY criado_em, id`)).rows;

  it('o Dono cadastra um vendedor com senha provisória; ele entra e tem de criar a dele', async () => {
    const r = await http()
      .post('/usuarios')
      .set('Cookie', cookie.dona!)
      .send({ nome: '  Joana   Lima ', usuario: 'Joana', papel: 'vendedor', senha: 'senha-inicial-77' })
      .expect(201);
    expect(r.body).toEqual({
      id: expect.stringMatching(UUID),
      nome: 'Joana Lima',
      usuario: 'joana',
      papel: 'vendedor',
      permissoes: [],
      ativo: true,
      senhaProvisoria: true,
      bloqueadoAte: null,
      ultimoAcessoEm: null,
      criadoEm: expect.any(String),
    });
    const entrou = await http().post('/sessao').send({ loja: 'lojaa', usuario: 'joana', senha: 'senha-inicial-77' }).expect(200);
    expect(entrou.body.senhaProvisoria).toBe(true);
    expect(await acoes()).toEqual([{ acao: 'usuario.criado', usuario_id: id.dona, alvo_id: r.body.id, detalhes: { papel: 'vendedor' } }]);
  });

  it('a lista não traz senha nem hash; vendedor não vê a lista', async () => {
    const r = await http().get('/usuarios').set('Cookie', cookie.gerente!).expect(200);
    expect(r.body.itens.map((u: { usuario: string }) => u.usuario)).toEqual(['caixa', 'dona', 'gerente']);
    expect(JSON.stringify(r.body)).not.toMatch(/scrypt|senhaHash|tentativas/);
    const negado = await http().get('/usuarios').set('Cookie', cookie.caixa!).expect(403);
    expect(negado.body).toEqual({ status: 403, mensagem: mensagemSemPermissao('usuarios'), codigo: 'sem_permissao' });
  });

  it('o Administrador não cadastra Dono nem mexe em Dono', async () => {
    const novo = { nome: 'Outro Dono', usuario: 'outro', papel: 'dono', senha: 'senha-inicial-88' };
    expect((await http().post('/usuarios').set('Cookie', cookie.gerente!).send(novo).expect(403)).body.mensagem).toBe('O Dono e o Administrador só são cadastrados pelo suporte (Adm. Sup), na implantação do sistema.');
    await http().patch(`/usuarios/${id.dona}`).set('Cookie', cookie.gerente!).send({ nome: 'Maria' }).expect(403);
    await http().post(`/usuarios/${id.dona}/senha`).set('Cookie', cookie.gerente!).send({ senha: 'nova-senha-123' }).expect(403);
    await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ papel: 'dono' }).expect(403);
    // Administrador, só o suporte; Vendedor e Personalizado (com as funções), sim
    expect((await http().post('/usuarios').set('Cookie', cookie.gerente!).send({ ...novo, papel: 'administrador' }).expect(403)).body.mensagem).toBe('O Dono e o Administrador só são cadastrados pelo suporte (Adm. Sup), na implantação do sistema.');
    await http().post('/usuarios').set('Cookie', cookie.gerente!).send({ ...novo, usuario: 'novo.vend', papel: 'vendedor' }).expect(201);
    const p = await http().post('/usuarios').set('Cookie', cookie.dona!).send({ ...novo, usuario: 'gil', papel: 'personalizado', permissoes: ['vender', 'relatorios'] }).expect(201);
    expect(p.body).toMatchObject({ papel: 'personalizado', permissoes: ['vender', 'relatorios'] });
    // o Personalizado não recebe o que é só do Dono nem a gestão de usuários
    await http().post('/usuarios').set('Cookie', cookie.dona!).send({ ...novo, usuario: 'lia', papel: 'personalizado', permissoes: ['usuarios'] }).expect(400);
  });

  it('login repetido -> 409; campo estranho e senha fraca -> 400', async () => {
    const base = { nome: 'Bruno Dois', usuario: 'caixa', papel: 'vendedor', senha: 'provisoria-bruno' };
    const r = await http().post('/usuarios').set('Cookie', cookie.dona!).send(base).expect(409);
    expect(r.body.mensagem).toBe('Já existe o usuário "caixa" nesta loja. Escolha outro login.');
    const extra = await http().post('/usuarios').set('Cookie', cookie.dona!).send({ ...base, usuario: 'novo', lojaId: lojaA }).expect(400);
    expect(extra.body.erros).toContainEqual({ campo: 'lojaId', mensagem: 'Campo não permitido.' });
    const fraca = await http().post('/usuarios').set('Cookie', cookie.dona!).send({ ...base, usuario: 'novo', senha: '12345678' }).expect(400);
    expect(fraca.body.erros).toContainEqual({ campo: 'senha', mensagem: 'Esta senha é fácil de adivinhar. Escolha outra.' });
  });

  it('ninguém desativa a si mesmo nem muda o próprio papel', async () => {
    const r = await http().patch(`/usuarios/${id.gerente}`).set('Cookie', cookie.gerente!).send({ ativo: false }).expect(403);
    expect(r.body.mensagem).toBe('Você não pode desativar o seu próprio usuário.');
    await http().patch(`/usuarios/${id.dona}`).set('Cookie', cookie.dona!).send({ papel: 'vendedor' }).expect(403);
    // o próprio nome pode
    await http().patch(`/usuarios/${id.gerente}`).set('Cookie', cookie.gerente!).send({ nome: 'Carlos Gerente' }).expect(200);
  });

  it('dois Donos se rebaixando ao mesmo tempo: a loja continua com um Dono', async () => {
    id.dono2 = await criarUsuario(admin, lojaA, { usuario: 'dono2', papel: 'dono' });
    cookie.dono2 = await entrar(app, 'lojaa', 'dono2');
    const [a, b] = await Promise.all([
      http().patch(`/usuarios/${id.dono2}`).set('Cookie', cookie.dona!).send({ papel: 'vendedor' }),
      http().patch(`/usuarios/${id.dona}`).set('Cookie', cookie.dono2).send({ papel: 'vendedor' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 403]);
    const { rows } = await admin.query(`SELECT count(*)::int AS n FROM usuarios WHERE papel = 'dono' AND ativo`);
    expect(rows[0].n).toBe(1);
  });

  it('desativar derruba as sessões da pessoa na hora; reativar devolve o acesso', async () => {
    const r = await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ ativo: false }).expect(200);
    expect(r.body.ativo).toBe(false);
    await http().get('/produtos').set('Cookie', cookie.caixa!).expect(401);
    await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ ativo: true }).expect(200);
    await entrar(app, 'lojaa', 'caixa');
    expect((await acoes()).map((a) => a.acao)).toEqual(['usuario.desativado', 'usuario.reativado']);
  });

  it('mudar o papel e as funções vale já no próximo pedido; o histórico guarda o papel e as funções, não o nome', async () => {
    const produto = { nome: 'Ração 1 kg', codigoBarras: null, precoCentavos: 1990 };
    await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ papel: 'personalizado', permissoes: ['vender'], nome: 'Bruno Silva' }).expect(200);
    await http().post('/produtos').set('Cookie', cookie.caixa!).send(produto).expect(403); // sem "cadastrar produto"
    await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ permissoes: ['vender', 'produtos.cadastrar'] }).expect(200);
    await http().post('/produtos').set('Cookie', cookie.caixa!).send(produto).expect(201);
    const [alterou, funcoes] = await acoes();
    expect(alterou.detalhes).toEqual({ campos: ['nome', 'papel', 'permissoes'], papelAntes: 'vendedor', papelDepois: 'personalizado', permissoes: ['vender'] });
    expect(funcoes.detalhes).toEqual({ campos: ['permissoes'], permissoes: ['vender', 'produtos.cadastrar'] });
    expect(JSON.stringify(alterou)).not.toMatch(/Bruno/);
    // voltou a Vendedor: as funções somem
    const r = await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ papel: 'vendedor' }).expect(200);
    expect(r.body.permissoes).toEqual([]);
  });

  it('sem mudança de verdade, não grava nada', async () => {
    await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ papel: 'vendedor' }).expect(200);
    expect(await acoes()).toEqual([]);
  });

  it('redefinir a senha: fica provisória, zera o bloqueio e derruba as sessões', async () => {
    await admin.query(`UPDATE usuarios SET bloqueado_ate = now() + interval '5 minutes' WHERE id = $1`, [id.caixa]);
    await http().post(`/usuarios/${id.caixa}/senha`).set('Cookie', cookie.gerente!).send({ senha: 'nova-provisoria-1' }).expect(204);
    await http().get('/sessao').set('Cookie', cookie.caixa!).expect(401);
    const r = await http().post('/sessao').send({ loja: 'lojaa', usuario: 'caixa', senha: 'nova-provisoria-1' }).expect(200);
    expect(r.body.senhaProvisoria).toBe(true);

    const propria = await http().post(`/usuarios/${id.gerente}/senha`).set('Cookie', cookie.gerente!).send({ senha: 'nova-provisoria-2' }).expect(403);
    expect(propria.body.mensagem).toBe('Para a sua própria senha, use “Trocar minha senha”.');
    await http().post(`/usuarios/${id.caixa}/senha`).set('Cookie', cookie.gerente!).send({ senha: 'curta' }).expect(400);
  });

  it('excluir os dados (LGPD): só o Dono, só de desativado; o histórico continua, sem o nome', async () => {
    const naoDesativado = await http().post(`/usuarios/${id.caixa}/excluir-dados`).set('Cookie', cookie.dona!).expect(403);
    expect(naoDesativado.body.mensagem).toBe('Desative o usuário antes de excluir os dados dele.');
    await http().patch(`/usuarios/${id.caixa}`).set('Cookie', cookie.gerente!).send({ ativo: false }).expect(200);
    const gerente = await http().post(`/usuarios/${id.caixa}/excluir-dados`).set('Cookie', cookie.gerente!).expect(403);
    expect(gerente.body.mensagem).toBe(mensagemSemPermissao('usuarios.excluir_dados'));

    const r = await http().post(`/usuarios/${id.caixa}/excluir-dados`).set('Cookie', cookie.dona!).expect(200);
    expect(r.body).toMatchObject({ nome: NOME_USUARIO_REMOVIDO, usuario: expect.stringMatching(/^removido-[0-9a-f]{24}$/), ativo: false, ultimoAcessoEm: null });
    const banco = await admin.query('SELECT nome, senha_hash FROM usuarios WHERE id = $1', [id.caixa]);
    expect(banco.rows[0]).toEqual({ nome: NOME_USUARIO_REMOVIDO, senha_hash: null });

    const historico = await http().get('/auditoria').set('Cookie', cookie.dona!).expect(200);
    expect(JSON.stringify(historico.body)).not.toMatch(/Caixa Bruno/);
    expect(historico.body.itens[0]).toMatchObject({ acao: 'usuario.dados_excluidos', quem: 'Dona Maria', alvo: { tipo: 'usuario', id: id.caixa, nome: NOME_USUARIO_REMOVIDO } });
    await http().post('/sessao').send({ loja: 'lojaa', usuario: 'caixa', senha: SENHA_TESTE }).expect(401);
  });

  it('usuário de outra loja ou id inválido -> 404', async () => {
    const lojaB = await criarLoja(admin, 'Loja B', 'lojab');
    const deB = await criarUsuario(admin, lojaB, { usuario: 'bia' });
    await http().patch(`/usuarios/${deB}`).set('Cookie', cookie.dona!).send({ nome: 'Invasor' }).expect(404);
    await http().patch('/usuarios/abc').set('Cookie', cookie.dona!).send({ nome: 'Invasor' }).expect(404);
    const { rows } = await admin.query('SELECT nome FROM usuarios WHERE id = $1', [deB]);
    expect(rows[0].nome).not.toBe('Invasor');
  });

  it('GET /auditoria: do mais novo ao mais antigo, com o texto da ação; só Dono e Administrador', async () => {
    await http().post('/produtos').set('Cookie', cookie.caixa!).send({ nome: 'Ração 1kg', precoCentavos: 1500 }).expect(201);
    const r = await http().get('/auditoria?limite=2').set('Cookie', cookie.gerente!).expect(200);
    expect(r.body.itens).toHaveLength(2);
    expect(r.body.itens[0]).toMatchObject({ acao: 'produto.criado', texto: 'Produto cadastrado', quem: 'Caixa Bruno', alvo: { tipo: 'produto', nome: 'Ração 1kg' } });
    expect(r.body.itens[1]).toMatchObject({ acao: 'sessao.entrou', texto: 'Entrou no sistema' });
    await http().get('/auditoria').set('Cookie', cookie.caixa!).expect(403);
    await http().get('/auditoria?limite=0').set('Cookie', cookie.dona!).expect(400);
  });
});

describe('Trava de usuários no banco (mesmo que a API seja contornada)', () => {
  let admin: pg.Pool;
  let app: pg.Pool;
  let lojaA: string;
  const id: Record<string, string> = {};

  const inserir = (c: pg.PoolClient, papel = 'vendedor') =>
    c.query(`INSERT INTO usuarios (id, loja_id, usuario, nome, papel) VALUES (gen_random_uuid(), $1, 'intruso', 'Intruso', $2::papel)`, [lojaA, papel]);

  beforeAll(() => {
    admin = poolAdmin();
    app = poolApp(4);
  });

  beforeEach(async () => {
    await limparBanco(admin);
    lojaA = await criarLoja(admin, 'Loja A', 'lojaa');
    id.dona = await criarUsuario(admin, lojaA, { usuario: 'dona', papel: 'dono' });
    id.gerente = await criarUsuario(admin, lojaA, { usuario: 'gerente', papel: 'administrador' });
    id.caixa = await criarUsuario(admin, lojaA, { usuario: 'caixa' });
  });

  afterAll(async () => {
    await app.end();
    await admin.end();
  });

  it('sem ninguém logado (app.usuario_id), não cadastra nem altera', async () => {
    await expect(comoApp(app, lojaA, (c) => inserir(c))).rejects.toMatchObject(NEGADO);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET papel = 'dono' WHERE id = $1`, [id.caixa]))).rejects.toMatchObject(NEGADO);
  });

  it('o login mexe só na contagem de senhas erradas e no último acesso, sem ninguém logado', async () => {
    const r = await comoApp(app, lojaA, (c) =>
      c.query(`UPDATE usuarios SET tentativas_erradas = 3, bloqueado_ate = NULL, ultimo_acesso_em = now() WHERE id = $1`, [id.caixa]),
    );
    expect(r.rowCount).toBe(1);
  });

  it('vendedor não cadastra, não promove e não muda o próprio nome por fora da API', async () => {
    await expect(comoApp(app, lojaA, (c) => inserir(c), id.caixa)).rejects.toMatchObject(NEGADO);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET papel = 'administrador' WHERE id = $1`, [id.caixa]), id.caixa)).rejects.toMatchObject(NEGADO);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET nome = 'X' WHERE id = $1`, [id.caixa]), id.caixa)).rejects.toMatchObject(NEGADO);
  });

  it('cada um troca a própria senha', async () => {
    const r = await comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET senha_hash = 'scrypt$x', senha_provisoria = false WHERE id = $1`, [id.caixa]), id.caixa);
    expect(r.rowCount).toBe(1);
  });

  it('Administrador não cria Dono, não promove a Dono e não mexe em Dono', async () => {
    await expect(comoApp(app, lojaA, (c) => inserir(c, 'dono'), id.gerente)).rejects.toThrow(/só o suporte/);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET papel = 'dono' WHERE id = $1`, [id.caixa]), id.gerente)).rejects.toMatchObject(NEGADO);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET nome = 'X' WHERE id = $1`, [id.dona]), id.gerente)).rejects.toMatchObject(NEGADO);
    // vendedor ele cadastra
    await comoApp(app, lojaA, (c) => inserir(c), id.gerente);
  });

  it('Dono e Administrador só o suporte cadastra (nem o Dono, por fora da API); o Personalizado precisa de funções', async () => {
    await expect(comoApp(app, lojaA, (c) => inserir(c, 'administrador'), id.dona)).rejects.toThrow(/só o suporte/);
    await expect(comoApp(app, lojaA, (c) => inserir(c, 'dono'), id.dona)).rejects.toThrow(/só o suporte/);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET papel = 'administrador' WHERE id = $1`, [id.caixa]), id.dona)).rejects.toThrow(/só o suporte/);
    await expect(comoApp(app, lojaA, (c) => inserir(c, 'personalizado'), id.dona)).rejects.toThrow(/precisa de pelo menos uma função/);
    // funções só no Personalizado (CHECK no banco)
    await expect(
      comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET permissoes = ARRAY['vender'] WHERE id = $1`, [id.caixa]), id.dona),
    ).rejects.toThrow(/usuarios_permissoes_so_personalizado/);
    await comoApp(
      app,
      lojaA,
      (c) => c.query(`INSERT INTO usuarios (id, loja_id, usuario, nome, papel, permissoes) VALUES (gen_random_uuid(), $1, 'gil', 'Gil', 'personalizado', ARRAY['vender'])`, [lojaA]),
      id.dona,
    );
  });

  it('ninguém se desativa nem muda o próprio papel', async () => {
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET ativo = false WHERE id = $1`, [id.dona]), id.dona)).rejects.toThrow(/ninguém desativa/);
    await expect(comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET papel = 'vendedor' WHERE id = $1`, [id.gerente]), id.gerente)).rejects.toMatchObject(NEGADO);
  });

  it('dois Donos se rebaixando em transações simultâneas: o banco segura o último Dono', async () => {
    id.dono2 = await criarUsuario(admin, lojaA, { usuario: 'dono2', papel: 'dono' });
    const [c1, c2] = [new pg.Client({ connectionString: URL_APP_TESTE }), new pg.Client({ connectionString: URL_APP_TESTE })];
    await Promise.all([c1.connect(), c2.connect()]);
    try {
      for (const [c, quem] of [[c1, id.dona], [c2, id.dono2]] as const) {
        await c.query('BEGIN');
        await c.query(`SELECT set_config('app.loja_id', $1, true), set_config('app.usuario_id', $2, true)`, [lojaA, quem]);
      }
      await c1.query(`UPDATE usuarios SET papel = 'vendedor' WHERE id = $1`, [id.dono2]); // segura a trava
      const segundo = c2.query(`UPDATE usuarios SET ativo = false WHERE id = $1`, [id.dona]); // espera a trava
      await new Promise((ok) => setTimeout(ok, 200));
      await c1.query('COMMIT');
      await expect(segundo).rejects.toThrow(/pelo menos um Dono ativo/);
      await c2.query('ROLLBACK');
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
    const { rows } = await admin.query(`SELECT usuario FROM usuarios WHERE papel = 'dono' AND ativo`);
    expect(rows).toEqual([{ usuario: 'dona' }]);
  });

  it('não alcança usuário de outra loja (RLS)', async () => {
    const lojaB = await criarLoja(admin, 'Loja B', 'lojab');
    const deB = await criarUsuario(admin, lojaB, { usuario: 'bia' });
    const r = await comoApp(app, lojaA, (c) => c.query(`UPDATE usuarios SET nome = 'Invasor' WHERE id = $1`, [deB]), id.dona);
    expect(r.rowCount).toBe(0);
  });

  it('sessões e histórico: a API não estica validade, não troca o dono da sessão e não apaga nada', async () => {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO sessoes (id, loja_id, usuario_id, token_hash, expira_em) VALUES (gen_random_uuid(), $1, $2, repeat('a', 64), now() + interval '1 hour') RETURNING id`,
      [lojaA, id.caixa],
    );
    await admin.query(`INSERT INTO auditoria (id, loja_id, acao) VALUES (gen_random_uuid(), $1, 'sessao.entrou')`, [lojaA]);
    const sessao = rows[0]!.id;
    for (const sql of [
      `UPDATE sessoes SET expira_em = now() + interval '1 year' WHERE id = '${sessao}'`,
      `UPDATE sessoes SET usuario_id = '${id.dona}' WHERE id = '${sessao}'`,
      `DELETE FROM sessoes`,
      `UPDATE auditoria SET acao = 'outra'`,
      `DELETE FROM auditoria`,
    ]) {
      await expect(comoApp(app, lojaA, (c) => c.query(sql), id.dona)).rejects.toMatchObject(NEGADO);
    }
  });
});
