// apps/web/src/demo/usuariosDemo.test.ts
// Usuários da demonstração: as mesmas regras do servidor (@saas/core), guardadas no navegador.
import { MENSAGEM_ACABOU_DE_BLOQUEAR, MENSAGEM_CREDENCIAIS, mensagemSemPermissao, NOME_CLIENTE_REMOVIDO, NOME_USUARIO_REMOVIDO } from '@saas/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroApi } from '../api';
import { comCaixaAberto } from '../testes/caixa';
import { criarApiLocal } from './apiLocal';
import { apagarUsuariosDemo, conferirHashDemo, entrarDemo, gerarHashDemo, SENHA_DEMO } from './usuariosDemo';

const AGORA = new Date('2026-11-18T15:00:00Z');

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});

async function erro(promessa: Promise<unknown>): Promise<ErroApi> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroApi) return e;
    throw e;
  }
  throw new Error('Era para dar erro.');
}

function relogio() {
  let agora = AGORA;
  return { agora: () => agora, mudar: (iso: string) => (agora = new Date(iso)) };
}

const entrar = (usuario: string, senha: string, agora = () => AGORA) => entrarDemo('lojaa', usuario, senha, { agora, atrasoMs: 0 });
// abre o caixa do dia sozinha antes de vender (o próprio caixa tem os testes dele)
const api = (operadorId: string, papel: 'dono' | 'administrador' | 'vendedor' | 'super_admin', agora = () => AGORA) =>
  comCaixaAberto(criarApiLocal({ lojaId: 'loja-a', operador: { id: operadorId, nome: operadorId, papel }, exemplos: false, atrasoMs: 0, agora }));

describe('senha da demonstração', () => {
  it('fica guardada só como hash (PBKDF2), nunca o texto', async () => {
    await entrar('ana', SENHA_DEMO);
    const guardado = localStorage.getItem('saas-demo:usuarios:v1') ?? '';
    expect(guardado).toContain('pbkdf2$100000$');
    expect(guardado).not.toContain(SENHA_DEMO);
  });

  it('confere a senha certa e recusa a errada; o mesmo texto gera hashes diferentes (sal)', async () => {
    const a = await gerarHashDemo('cavalo-bateria');
    const b = await gerarHashDemo('cavalo-bateria');
    expect(a).not.toBe(b);
    expect(await conferirHashDemo('cavalo-bateria', a)).toBe(true);
    expect(await conferirHashDemo('cavalo-bateri', a)).toBe(false);
    expect(await conferirHashDemo('qualquer', null)).toBe(false);
  });
});

describe('entrar na demonstração', () => {
  it('entra com usuário e senha (sem diferença de maiúsculas no usuário)', async () => {
    const r = await entrar(' ANA ', SENHA_DEMO);
    expect(r).toMatchObject({ ok: true, lojaId: 'loja-a', usuario: { id: 'ana', nome: 'Ana', papel: 'dono', senhaProvisoria: false } });
  });

  it('senha errada e usuário que não existe: a mesma mensagem e o mesmo bloqueio', async () => {
    expect(await entrar('ana', 'errada-1')).toEqual({ ok: false, mensagem: MENSAGEM_CREDENCIAIS });
    expect(await entrar('fantasma', 'errada-1')).toEqual({ ok: false, mensagem: MENSAGEM_CREDENCIAIS });
    for (let i = 2; i <= 4; i += 1) {
      await entrar('ana', `errada-${i}`);
      await entrar('fantasma', `errada-${i}`);
    }
    expect(await entrar('ana', 'errada-5')).toEqual({ ok: false, mensagem: MENSAGEM_ACABOU_DE_BLOQUEAR });
    expect(await entrar('fantasma', 'errada-5')).toEqual({ ok: false, mensagem: MENSAGEM_ACABOU_DE_BLOQUEAR });
  });

  it('5 senhas erradas = 5 minutos bloqueado; depois, a senha certa entra', async () => {
    const r = relogio();
    for (let i = 1; i <= 5; i += 1) await entrar('caio', `errada-${i}`, r.agora);
    expect(await entrar('caio', SENHA_DEMO, r.agora)).toEqual({
      ok: false,
      mensagem: 'Muitas tentativas erradas. Tente de novo em 5 min ou peça ao dono para trocar sua senha.',
    });
    r.mudar('2026-11-18T15:05:01Z');
    expect((await entrar('caio', SENHA_DEMO, r.agora)).ok).toBe(true);
  });

  it('desativada: só quem acerta a senha descobre', async () => {
    expect(await entrar('carla', 'errada-1')).toEqual({ ok: false, mensagem: MENSAGEM_CREDENCIAIS });
    expect(await entrar('carla', SENHA_DEMO)).toEqual({ ok: false, mensagem: 'Seu acesso a esta loja está desativado. Fale com o Dono da loja.' });
  });

  it('loja que não existe', async () => {
    expect(await entrarDemo('naoexiste', 'ana', SENHA_DEMO, { atrasoMs: 0 })).toEqual({ ok: false, mensagem: 'Loja não encontrada. Confira o endereço.' });
  });
});

describe('tela Usuários na demonstração (as regras do servidor)', () => {
  it('o Dono cadastra com senha provisória; a pessoa entra e precisa criar a dela', async () => {
    const ana = api('ana', 'dono');
    const joana = await ana.criarUsuario({ nome: 'Joana Lima', usuario: 'joana', papel: 'vendedor', senha: 'senha-inicial-77' });
    expect(joana).toMatchObject({ usuario: 'joana', senhaProvisoria: true, ativo: true });
    expect(joana).not.toHaveProperty('senhaHash');
    const r = await entrar('joana', 'senha-inicial-77');
    expect(r).toMatchObject({ ok: true, usuario: { senhaProvisoria: true } });

    const comoJoana = api(joana.id, 'vendedor');
    expect((await erro(comoJoana.trocarMinhaSenha('senha-inicial-77', 'joana-123456'))).message).toBe('A senha não pode ter o seu usuário ou o seu nome.');
    await comoJoana.trocarMinhaSenha('senha-inicial-77', 'minha-senha-de-verdade');
    expect(await entrar('joana', 'minha-senha-de-verdade')).toMatchObject({ ok: true, usuario: { senhaProvisoria: false } });
  });

  it('quem pode o quê: Vendedor não vê; Administrador não mexe em Dono; ninguém se desativa', async () => {
    expect((await erro(api('bruno', 'vendedor').listarUsuarios())).message).toBe(mensagemSemPermissao('usuarios'));
    const caio = api('caio', 'administrador');
    expect((await erro(caio.criarUsuario({ nome: 'Outro Dono', usuario: 'outro', papel: 'dono', senha: 'senha-inicial-88' }))).message).toBe(
      'O Dono e o Administrador só são cadastrados pelo suporte (Adm. Sup), na implantação do sistema.',
    );
    expect((await erro(caio.alterarUsuario('ana', { nome: 'Ana Maria' }))).status).toBe(403);
    expect((await erro(caio.alterarUsuario('caio', { ativo: false }))).message).toBe('Você não pode desativar o seu próprio usuário.');
    expect((await erro(caio.criarUsuario({ nome: 'Bruno Dois', usuario: 'bruno', papel: 'vendedor', senha: 'senha-inicial-88' }))).status).toBe(409);
  });

  it('desativar, redefinir a senha e excluir os dados (LGPD: só o Dono, só de desativado)', async () => {
    const ana = api('ana', 'dono');
    const caio = api('caio', 'administrador');
    expect((await erro(ana.excluirDadosUsuario('bruno'))).message).toBe('Desative o usuário antes de excluir os dados dele.');
    await caio.alterarUsuario('bruno', { ativo: false });
    expect((await erro(caio.excluirDadosUsuario('bruno'))).message).toBe(mensagemSemPermissao('usuarios.excluir_dados'));
    const removido = await ana.excluirDadosUsuario('bruno');
    expect(removido).toMatchObject({ nome: NOME_USUARIO_REMOVIDO, ativo: false });
    expect(removido.usuario).toMatch(/^removido-/);
    expect(localStorage.getItem('saas-demo:usuarios:v1')).not.toMatch(/"Bruno"/);

    await caio.redefinirSenhaUsuario('carla', 'nova-provisoria-1');
    await caio.alterarUsuario('carla', { ativo: true });
    expect(await entrar('carla', 'nova-provisoria-1')).toMatchObject({ ok: true, usuario: { senhaProvisoria: true } });
    expect((await erro(caio.redefinirSenhaUsuario('caio', 'nova-provisoria-2'))).message).toBe('Para a sua própria senha, use “Trocar minha senha”.');
  });

  it('o histórico mostra quem fez o quê, com o nome lido na hora (sem nome guardado nos detalhes)', async () => {
    await entrar('ana', SENHA_DEMO);
    const ana = api('ana', 'dono');
    await ana.criarUsuario({ nome: 'Joana Lima', usuario: 'joana', papel: 'vendedor', senha: 'senha-inicial-77' });
    await ana.criarProduto({ nome: 'Ração 1kg', codigoBarras: null, precoCentavos: 1500 });
    const h = await ana.listarAuditoria(10);
    expect(h.map((x) => x.texto)).toEqual(['Produto cadastrado', 'Usuário criado', 'Entrou no sistema']);
    expect(h[0]).toMatchObject({ quem: 'Ana', alvo: { tipo: 'produto', nome: 'Ração 1kg' } });
    expect(h[1]).toMatchObject({ quem: 'Ana', alvo: { tipo: 'usuario', nome: 'Joana Lima' }, detalhes: { papel: 'vendedor' } });
    expect(localStorage.getItem('saas-demo:auditoria:v1')).not.toContain('Joana');
  });

  it('trocar a própria senha: 5 senhas atuais erradas bloqueiam', async () => {
    const bruno = api('bruno', 'vendedor');
    for (let i = 1; i <= 4; i += 1) expect((await erro(bruno.trocarMinhaSenha(`errada-${i}`, 'senha-nova-boa-1'))).message).toBe('A senha atual não confere.');
    const quinta = await erro(bruno.trocarMinhaSenha('errada-5', 'senha-nova-boa-1'));
    expect([quinta.status, quinta.message]).toEqual([429, MENSAGEM_ACABOU_DE_BLOQUEAR]);
    expect((await entrar('bruno', SENHA_DEMO)).ok).toBe(false);
  });
});

describe('excluir os dados de um cliente (LGPD) na demonstração', () => {
  it('só o Dono; com fiado em aberto, não; sem, apaga nome, CPF e telefone e tira o nome das vendas', async () => {
    const ana = api('ana', 'dono');
    const bruno = api('bruno', 'vendedor');
    const cliente = await ana.cadastrarCliente({ nome: 'Maria Souza', cpf: '529.982.247-25', telefone: '11987654321', limiteFiadoCentavos: 5000 });
    const produto = await ana.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
    await ana.lancarMovimentoEstoque({ produtoId: produto.id, tipo: 'entrada', quantidade: 10, motivo: 'Nota 1' });
    await bruno.criarVenda({ itens: [{ produtoId: produto.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 1000 }], clienteId: cliente.id });
    await bruno.criarVenda({ itens: [{ produtoId: produto.id, quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 1000 }], clienteId: cliente.id });

    expect((await erro(bruno.excluirDadosDoCliente(cliente.id))).message).toBe(mensagemSemPermissao('clientes.excluir_dados'));
    expect((await erro(ana.excluirDadosDoCliente(cliente.id))).message).toMatch(/fiado em aberto/);

    const fiado = (await ana.listarRecebiveis()).find((r) => r.forma === 'fiado')!;
    await ana.receberRecebivel(fiado.id, 'caixa');
    // mesmo o Dono precisa da liberação (senha e motivo), como no DaniPets
    expect((await erro(ana.excluirDadosDoCliente(cliente.id))).message).toBe('A exclusão precisa da liberação de um Dono.');
    const { autorizacao } = await ana.autorizar({ usuarioId: 'ana', senha: 'demo1234', acao: { tipo: 'excluir_dados_cliente', clienteId: cliente.id } });
    const anonimo = await ana.excluirDadosDoCliente(cliente.id, { liberacao: { autorizacao, motivo: 'pedido do cliente' } });
    expect(anonimo).toMatchObject({ nome: NOME_CLIENTE_REMOVIDO, cpf: '', telefone: '', ativo: false });
    const tudo = Object.values(localStorage).join('\n');
    expect(tudo).not.toContain('Maria Souza');
    expect(tudo).not.toContain('52998224725');
    expect((await ana.listarVendas({ de: '2026-11-18', ate: '2026-11-18' })).every((v) => v.cliente?.nome === NOME_CLIENTE_REMOVIDO)).toBe(true);
  });
});

describe('Adm. Sup e Personalizado (pedido do Luan, 23/11/2026)', () => {
  it('o Adm. Sup entra em qualquer loja com "suporte", não aparece na lista e, no histórico, aparece como "Suporte"', async () => {
    const r = await entrar('suporte', SENHA_DEMO);
    expect(r).toMatchObject({ ok: true, usuario: { usuario: 'suporte', nome: 'Suporte', papel: 'super_admin' } });
    const naLojaB = await entrarDemo('lojab', 'suporte', SENHA_DEMO, { agora: () => AGORA, atrasoMs: 0 });
    expect(naLojaB.ok).toBe(true);
    const sup = api('adm-sup', 'super_admin');
    // cadastra o Dono (implantação) e o Administrador
    await sup.criarUsuario({ nome: 'Dora', usuario: 'dora', papel: 'dono', senha: 'senha-inicial-88' });
    await sup.criarUsuario({ nome: 'Abel', usuario: 'abel', papel: 'administrador', senha: 'senha-inicial-88' });
    const lista = await api('ana', 'dono').listarUsuarios();
    expect(lista.map((u) => u.usuario)).not.toContain('suporte');
    expect(lista.map((u) => u.usuario)).toEqual(expect.arrayContaining(['dora', 'abel']));
    const hist = await api('ana', 'dono').listarAuditoria(10);
    expect(hist.filter((h) => h.acao === 'usuario.criado').map((h) => [h.quem, h.resumo])).toEqual([
      ['Suporte', 'Administrador'],
      ['Suporte', 'Dono'],
    ]);
    expect(hist.find((h) => h.acao === 'sessao.entrou')?.quem).toBe('Suporte');
    // ninguém da loja usa o login "suporte" nem mexe no Adm. Sup
    expect((await erro(api('ana', 'dono').criarUsuario({ nome: 'Falso', usuario: 'suporte', papel: 'vendedor', senha: 'senha-inicial-88' }))).status).toBe(409);
    expect((await erro(api('ana', 'dono').alterarUsuario('adm-sup', { ativo: false }))).status).toBe(404);
    // senha errada do suporte conta como as outras
    expect(await entrar('suporte', 'errada')).toEqual({ ok: false, mensagem: MENSAGEM_CREDENCIAIS });
  });

  it('as vendas do Adm. Sup ficam no nome "Suporte"', async () => {
    const sup = api('adm-sup', 'super_admin');
    await entrar('suporte', SENHA_DEMO); // cria o cadastro do suporte
    const p = await sup.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 500 });
    await sup.lancarMovimentoEstoque({ produtoId: p.id, tipo: 'entrada', quantidade: 3, motivo: '' });
    const v = await sup.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 500 }] });
    expect(v.vendedor).toEqual({ id: 'adm-sup', nome: 'Suporte' });
  });

  it('Personalizado: o Dono marca as funções; o Personalizado não gerencia usuários', async () => {
    const ana = api('ana', 'dono');
    const gil = await ana.criarUsuario({ nome: 'Gil', usuario: 'gil', papel: 'personalizado', senha: 'senha-inicial-88', permissoes: ['vender', 'relatorios'] });
    expect(gil).toMatchObject({ papel: 'personalizado', permissoes: ['vender', 'relatorios'] });
    expect((await erro(ana.criarUsuario({ nome: 'Lia', usuario: 'lia', papel: 'personalizado', senha: 'senha-inicial-88' }))).status).toBe(400);
    const hist = await ana.listarAuditoria(3);
    expect(hist.find((h) => h.acao === 'usuario.criado')?.resumo).toBe('Personalizado • 2 funções');
    await ana.alterarUsuario(gil.id, { permissoes: ['vender', 'relatorios', 'compras'] });
    expect((await ana.listarAuditoria(3)).find((h) => h.acao === 'usuario.alterado')?.resumo).toBe('funções do Personalizado: 3');
    // voltou a Vendedor: perde a lista
    const vend = await ana.alterarUsuario(gil.id, { papel: 'vendedor' });
    expect(vend.permissoes ?? null).toBeNull();
  });
});
