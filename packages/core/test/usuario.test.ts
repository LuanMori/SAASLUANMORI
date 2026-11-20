// packages/core/test/usuario.test.ts
import { describe, expect, it } from 'vitest';
import {
  ACOES_AUDITORIA,
  aposSenhaErrada,
  anonimizarCliente,
  type Cliente,
  conferirExclusaoDeCliente,
  conferirGestaoDeUsuario,
  LISTA_PERMISSOES,
  MENSAGEM_ACABOU_DE_BLOQUEAR,
  mensagemBloqueado,
  mensagemSemPermissao,
  NOME_CLIENTE_REMOVIDO,
  normalizarLogin,
  pode,
  quemAutorizaDesconto,
  quemAutorizaEstorno,
  quemPode,
  SEM_TENTATIVAS,
  situacaoBloqueio,
  situacaoDoUsuario,
  tirarNomeDoCliente,
  type UsuarioParaRegra,
  validarAlteracaoUsuario,
  validarLogin,
  validarNovoUsuario,
  validarSenhaNova,
} from '../src';

const campos = (r: { ok: boolean; erros?: { campo: string }[] }) => (!r.ok && r.erros ? r.erros.map((e) => e.campo) : []);
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? r.erros[0]!.mensagem : '');

describe('permissões (matriz única, do DaniPets)', () => {
  it('Dono pode tudo; Administrador tudo menos o que é só do Dono; Vendedor o do DaniPets', () => {
    expect(LISTA_PERMISSOES.every((p) => pode('dono', p))).toBe(true);
    expect(LISTA_PERMISSOES.filter((p) => !pode('administrador', p))).toEqual(['usuarios.donos', 'usuarios.excluir_dados', 'clientes.excluir_dados', 'brinde', 'dia_fechado.liberar']);
    expect(LISTA_PERMISSOES.filter((p) => pode('vendedor', p))).toEqual(['vender', 'caixa', 'clientes', 'produtos.cadastrar']);
  });

  it('papel desconhecido ou vazio não pode nada (dado alterado por fora)', () => {
    expect(pode('super_admin', 'vender')).toBe(false);
    expect(pode('chefe', 'vender')).toBe(false);
    expect(pode('__proto__', 'vender')).toBe(false);
    expect(pode(null, 'vender')).toBe(false);
  });

  it('mensagem de recusa diz quem pode', () => {
    expect(quemPode('financeiro')).toEqual(['dono', 'administrador']);
    expect(mensagemSemPermissao('financeiro')).toBe('Financeiro: só o Dono ou o Administrador.');
    expect(mensagemSemPermissao('brinde')).toBe('Dar brinde (preço R$ 0,00) sem pedir senha: só o Dono.');
    expect(mensagemSemPermissao('vender')).toBe('Vender na Frente de caixa: só o Dono, o Administrador ou o Vendedor.');
  });

  it('as regras da venda usam a mesma matriz', () => {
    expect([quemAutorizaDesconto('brinde', 'dono'), quemAutorizaDesconto('brinde', 'administrador'), quemAutorizaDesconto('brinde', 'vendedor')]).toEqual([null, 'dono', 'dono']);
    expect([quemAutorizaDesconto('acima-do-limite', 'administrador'), quemAutorizaDesconto('acima-do-limite', 'vendedor')]).toEqual([null, 'gestor']);
    expect([quemAutorizaEstorno('dono'), quemAutorizaEstorno('vendedor')]).toEqual([null, 'gestor']);
  });
});

describe('senha nova', () => {
  it('pelo menos 8 caracteres, no máximo 128', () => {
    expect(validarSenhaNova('abc12')).toEqual({ ok: false, erros: [{ campo: 'senha', mensagem: 'A senha precisa ter pelo menos 8 caracteres.' }] });
    expect(mensagem(validarSenhaNova('x'.repeat(129)))).toMatch(/até 128/);
    expect(mensagem(validarSenhaNova(12345678))).toMatch(/pelo menos 8/);
    expect(validarSenhaNova('Rio-de-Janeiro 2026')).toEqual({ ok: true, valor: 'Rio-de-Janeiro 2026' });
  });

  it('recusa as senhas óbvias, repetidas e com o usuário ou o nome', () => {
    for (const s of ['12345678', 'Senha123', 'aaaaaaaa', 'PASSWORD']) expect(mensagem(validarSenhaNova(s))).toBe('Esta senha é fácil de adivinhar. Escolha outra.');
    expect(mensagem(validarSenhaNova('mariana2026', { usuario: 'mariana' }))).toBe('A senha não pode ter o seu usuário ou o seu nome.');
    expect(mensagem(validarSenhaNova('xx-joaosilva-xx', { nome: 'João Silva'.normalize('NFD').replace(/[̀-ͯ]/g, '') }))).toMatch(/usuário ou o seu nome/);
    expect(validarSenhaNova('ana-vende-bem', { usuario: 'ana' }).ok).toBe(true); // login curto (3 letras) não conta
  });
});

describe('cadastro e alteração de usuário', () => {
  it('nome, usuário (login) minúsculo e sem espaço, papel e senha provisória', () => {
    expect(validarNovoUsuario({ nome: '  Maria   Souza ', usuario: ' Maria.Souza ', papel: 'vendedor', senha: 'caixa-da-loja-1' })).toEqual({
      ok: true,
      valor: { nome: 'Maria Souza', usuario: 'maria.souza', papel: 'vendedor', senha: 'caixa-da-loja-1' },
    });
    expect(campos(validarNovoUsuario({ nome: 'M', usuario: 'maria souza', papel: 'super_admin', senha: '123' }))).toEqual(['nome', 'usuario', 'papel', 'senha']);
    expect(campos(validarNovoUsuario({ nome: 'Maria', usuario: 'maria', papel: 'dono', senha: 'caixa-da-loja-1', lojaId: 'x' }))).toEqual(['lojaId']);
    expect(campos(validarNovoUsuario({ nome: 'Ma\u0000ria', usuario: 'maria', papel: 'dono', senha: 'caixa-da-loja-1' }))).toEqual(['nome']);
    expect(campos(validarNovoUsuario({ nome: 'x'.repeat(121), usuario: 'maria', papel: 'dono', senha: 'caixa-da-loja-1' }))).toEqual(['nome']);
    expect(campos(validarNovoUsuario('maria'))).toEqual(['_']);
    expect(normalizarLogin('  ANA ')).toBe('ana');
    expect(validarLogin('_ana').ok).toBe(false);
    expect(validarLogin('a').ok).toBe(false);
    expect(validarLogin('ana-paula_2').ok).toBe(true);
  });

  it('alteração: nome, papel e ativo; pelo menos um; campo desconhecido recusado', () => {
    expect(validarAlteracaoUsuario({ papel: 'administrador', ativo: false })).toEqual({ ok: true, valor: { papel: 'administrador', ativo: false } });
    expect(campos(validarAlteracaoUsuario({}))).toEqual(['_']);
    expect(campos(validarAlteracaoUsuario({ ativo: 'sim', senha: 'x' }))).toEqual(['senha', 'ativo']);
    expect(campos(validarAlteracaoUsuario([]))).toEqual(['_']);
  });
});

describe('quem gerencia quem', () => {
  const dono: UsuarioParaRegra = { id: 'dono', papel: 'dono', ativo: true };
  const dono2: UsuarioParaRegra = { id: 'dono2', papel: 'dono', ativo: true };
  const adm: UsuarioParaRegra = { id: 'adm', papel: 'administrador', ativo: true };
  const vend: UsuarioParaRegra = { id: 'vend', papel: 'vendedor', ativo: true };
  const loja = [dono, adm, vend];

  it('Vendedor não gerencia usuários', () => {
    expect(mensagem(conferirGestaoDeUsuario(vend, null, { tipo: 'criar', papel: 'vendedor' }, loja))).toBe(
      'Cadastrar, alterar e desativar usuários: só o Dono ou o Administrador.',
    );
  });

  it('Administrador gerencia Vendedor e Administrador, mas não mexe em Dono nem promove a Dono', () => {
    expect(conferirGestaoDeUsuario(adm, null, { tipo: 'criar', papel: 'vendedor' }, loja).ok).toBe(true);
    expect(mensagem(conferirGestaoDeUsuario(adm, null, { tipo: 'criar', papel: 'dono' }, loja))).toBe('Só um Dono cadastra outro Dono.');
    expect(mensagem(conferirGestaoDeUsuario(adm, vend, { tipo: 'alterar', mudanca: { papel: 'dono' } }, loja))).toMatch(/Só um Dono/);
    expect(mensagem(conferirGestaoDeUsuario(adm, dono, { tipo: 'redefinir_senha' }, loja))).toMatch(/Só um Dono/);
    expect(mensagem(conferirGestaoDeUsuario(adm, dono, { tipo: 'alterar', mudanca: { ativo: false } }, loja))).toMatch(/Só um Dono/);
    expect(conferirGestaoDeUsuario(adm, vend, { tipo: 'redefinir_senha' }, loja).ok).toBe(true);
  });

  it('ninguém se desativa nem muda o próprio papel; a própria senha é em "Trocar minha senha"', () => {
    expect(mensagem(conferirGestaoDeUsuario(adm, adm, { tipo: 'alterar', mudanca: { ativo: false } }, loja))).toBe('Você não pode desativar o seu próprio usuário.');
    expect(mensagem(conferirGestaoDeUsuario(dono, dono, { tipo: 'alterar', mudanca: { papel: 'vendedor' } }, [dono, dono2]))).toMatch(/próprio papel/);
    expect(conferirGestaoDeUsuario(dono, dono, { tipo: 'alterar', mudanca: { nome: 'Ana Maria', papel: 'dono' } }, loja).ok).toBe(true);
    expect(mensagem(conferirGestaoDeUsuario(adm, adm, { tipo: 'redefinir_senha' }, loja))).toMatch(/Trocar minha senha/);
  });

  it('a loja nunca fica sem um Dono ativo', () => {
    const outroDono: UsuarioParaRegra = { id: 'outro', papel: 'dono', ativo: true };
    // com dois Donos, um pode tirar o outro
    expect(conferirGestaoDeUsuario(dono, outroDono, { tipo: 'alterar', mudanca: { ativo: false } }, [dono, outroDono]).ok).toBe(true);
    // o Dono desativado não conta
    expect(mensagem(conferirGestaoDeUsuario(dono, outroDono, { tipo: 'alterar', mudanca: { papel: 'administrador' } }, [outroDono, { ...dono, ativo: false }]))).toBe(
      'Mantenha pelo menos um Dono ativo na loja.',
    );
  });

  it('excluir dados (LGPD): só o Dono, só de usuário desativado, nunca de si mesmo', () => {
    const fora: UsuarioParaRegra = { id: 'fora', papel: 'vendedor', ativo: false };
    expect(conferirGestaoDeUsuario(dono, fora, { tipo: 'excluir_dados' }, loja).ok).toBe(true);
    expect(mensagem(conferirGestaoDeUsuario(adm, fora, { tipo: 'excluir_dados' }, loja))).toBe('Excluir os dados de um usuário desativado (LGPD): só o Dono.');
    expect(mensagem(conferirGestaoDeUsuario(dono, vend, { tipo: 'excluir_dados' }, loja))).toBe('Desative o usuário antes de excluir os dados dele.');
    expect(mensagem(conferirGestaoDeUsuario(dono, { ...dono, ativo: false }, { tipo: 'excluir_dados' }, loja))).toMatch(/seus próprios dados/);
    expect(mensagem(conferirGestaoDeUsuario(dono, null, { tipo: 'excluir_dados' }, loja))).toBe('Usuário não encontrado.');
  });

  it('quem foi desativado não gerencia nada', () => {
    expect(conferirGestaoDeUsuario({ ...dono, ativo: false }, null, { tipo: 'criar', papel: 'vendedor' }, loja).ok).toBe(false);
  });
});

describe('bloqueio por senhas erradas (5 seguidas = 5 minutos, como no DaniPets)', () => {
  const agora = new Date('2026-11-18T12:00:00Z');

  it('conta as erradas e bloqueia na quinta (e zera a contagem)', () => {
    let estado = SEM_TENTATIVAS;
    for (let i = 1; i <= 4; i++) {
      const r = aposSenhaErrada(estado, agora);
      expect(r).toEqual({ estado: { tentativasErradas: i, bloqueadoAte: null }, bloqueou: false });
      estado = r.estado;
    }
    const quinta = aposSenhaErrada(estado, agora);
    expect(quinta).toEqual({ estado: { tentativasErradas: 0, bloqueadoAte: '2026-11-18T12:05:00.000Z' }, bloqueou: true });
    expect(situacaoBloqueio(quinta.estado, agora)).toEqual({ bloqueado: true, restanteSegundos: 300 });
    expect(situacaoBloqueio(quinta.estado, new Date('2026-11-18T12:05:00Z'))).toEqual({ bloqueado: false, restanteSegundos: 0 });
    expect(situacaoBloqueio(SEM_TENTATIVAS, agora).bloqueado).toBe(false);
  });

  it('mensagens', () => {
    expect(MENSAGEM_ACABOU_DE_BLOQUEAR).toBe('Muitas tentativas erradas. Este usuário ficou bloqueado por 5 minutos.');
    expect(mensagemBloqueado(241)).toBe('Muitas tentativas erradas. Tente de novo em 5 min ou peça ao dono para trocar sua senha.');
    expect(mensagemBloqueado(12)).toMatch(/em 12 s/);
    expect(mensagemBloqueado(0)).toMatch(/em 1 s/);
  });

  it('situação na lista de usuários', () => {
    expect(situacaoDoUsuario({ ativo: false, senhaProvisoria: false, bloqueadoAte: null }, agora)).toBe('Desativado');
    expect(situacaoDoUsuario({ ativo: true, senhaProvisoria: true, bloqueadoAte: '2026-11-18T12:01:00Z' }, agora)).toBe('Bloqueado (senhas erradas)');
    expect(situacaoDoUsuario({ ativo: true, senhaProvisoria: true, bloqueadoAte: '2026-11-18T11:00:00Z' }, agora)).toBe('Senha provisória');
    expect(situacaoDoUsuario({ ativo: true, senhaProvisoria: false, bloqueadoAte: null }, agora)).toBe('Ativo');
    expect(ACOES_AUDITORIA['sessao.bloqueado']).toBe('Bloqueado por senhas erradas');
  });
});

describe('LGPD: exclusão dos dados do cliente (como o DaniPets)', () => {
  const maria: Cliente = { id: 'c1', nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', ativo: true, criadoEm: 'x', atualizadoEm: 'x' };

  it('só o Dono; recusada com fiado em aberto', () => {
    expect(conferirExclusaoDeCliente('dono', maria, 0)).toEqual({ ok: true, valor: null });
    expect(mensagem(conferirExclusaoDeCliente('administrador', maria, 0))).toBe('Excluir os dados de um cliente (LGPD): só o Dono.');
    expect(mensagem(conferirExclusaoDeCliente('dono', maria, 2500)).replace(/ /g, ' ')).toBe(
      'Maria Souza tem R$ 25,00 de fiado em aberto. Os dados ficam guardados até a conta ser paga.',
    );
    expect(mensagem(conferirExclusaoDeCliente('dono', null, 0))).toBe('Cliente não encontrado.');
    expect(mensagem(conferirExclusaoDeCliente('dono', { nome: NOME_CLIENTE_REMOVIDO, ativo: false }, 0))).toBe('Cliente não encontrado.');
  });

  it('tira nome, telefone e CPF do cadastro e o nome das vendas; o id fica para o histórico', () => {
    const agora = new Date('2026-11-18T12:00:00Z');
    expect(anonimizarCliente(maria, agora)).toEqual({ ...maria, nome: 'Cliente removido', telefone: '', cpf: '', ativo: false, atualizadoEm: agora.toISOString() });
    const vendas = [
      { id: 'v1', cliente: { id: 'c1', nome: 'Maria Souza' } },
      { id: 'v2', cliente: { id: 'c2', nome: 'João' } },
      { id: 'v3', cliente: null },
    ];
    expect(tirarNomeDoCliente(vendas, 'c1')).toEqual([
      { id: 'v1', cliente: { id: 'c1', nome: 'Cliente removido' } },
      { id: 'v2', cliente: { id: 'c2', nome: 'João' } },
      { id: 'v3', cliente: null },
    ]);
  });
});
