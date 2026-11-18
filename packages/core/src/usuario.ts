// packages/core/src/usuario.ts
// Usuários da loja e login próprio (revisão de 18/11/2026, itens 3.5 e 5.4): o Dono e o
// Administrador cadastram a equipe pela tela; cada pessoa entra com usuário e senha.
// Regras do DaniPets V9.3.3 (aba Usuários), mais o que um sistema na internet precisa:
//   - nome e usuário (login) obrigatórios; o login é único na loja, minúsculo e sem espaço;
//   - senha com pelo menos 8 caracteres (o DaniPets aceitava 6 porque rodava só no computador da
//     loja), diferente do usuário e fora da lista das senhas mais usadas;
//   - a senha que o Dono cria ou redefine é PROVISÓRIA: no primeiro acesso a pessoa cria a dela
//     (assim nem o Dono sabe a senha de quem autoriza descontos);
//   - só o Dono e o Administrador cadastram, alteram, desativam e redefinem senha (DaniPets);
//   - só um Dono mexe em outro Dono ou dá o papel de Dono (o Administrador não se promove);
//   - ninguém desativa nem muda o próprio papel; a loja nunca fica sem um Dono ativo
//     (DaniPets: "Mantenha pelo menos um Administrador ativo");
//   - excluir os dados (LGPD): só o Dono, só de usuário desativado.
// O servidor confere tudo de novo, e o banco tem uma trava própria para papel e Dono.
import { CONTROLE, ehObjeto } from './interno';
import { ehPapelDeLoja, NOME_PAPEL, PAPEIS_DE_LOJA, type PapelDeLoja } from './papeis';
import { mensagemSemPermissao, pode } from './permissoes';
import type { ErroCampo, Resultado } from './resultado';

export const LIMITES_USUARIO = { nomeMin: 2, nomeMax: 120, loginMin: 2, loginMax: 40, senhaMin: 8, senhaMax: 128 } as const;

/** Login: letras minúsculas, números, ponto, hífen e sublinhado; começa com letra ou número. */
export const FORMATO_LOGIN = /^[a-z0-9][a-z0-9._-]{1,39}$/;

/** O login é guardado e comparado sempre em minúsculas e sem espaço nas pontas. */
export const normalizarLogin = (texto: string): string => texto.trim().toLowerCase();

/** Nome que fica no lugar do nome de quem pediu a exclusão dos dados. */
export const NOME_USUARIO_REMOVIDO = 'Usuário removido';

/** As senhas mais usadas no Brasil e no mundo (com 8+ caracteres): recusadas mesmo tendo o tamanho. */
const SENHAS_COMUNS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  '12341234',
  '11223344',
  '123123123',
  'abcd1234',
  'abc12345',
  'password',
  'password1',
  'senha123',
  'senha1234',
  'senhasenha',
  'mudar123',
  'trocar123',
  'qwerty123',
  'qwertyui',
  'asdfghjk',
  'iloveyou',
  'brasil123',
  'flamengo',
  'corinthians',
  'palmeiras',
  'admin123',
  'administrador',
  'vendedor',
  'petshop123',
]);

/**
 * Senha nova (criar, redefinir ou trocar). Sem regra de "maiúscula, número e símbolo": tamanho e fugir
 * das senhas óbvias protegem mais (recomendação NIST 800-63B).
 */
export function validarSenhaNova(senha: unknown, contexto: { usuario?: string | null; nome?: string | null } = {}): Resultado<string> {
  const erro = (mensagem: string): Resultado<string> => ({ ok: false, erros: [{ campo: 'senha', mensagem }] });
  if (typeof senha !== 'string' || senha.length < LIMITES_USUARIO.senhaMin) return erro(`A senha precisa ter pelo menos ${LIMITES_USUARIO.senhaMin} caracteres.`);
  if (senha.length > LIMITES_USUARIO.senhaMax) return erro(`A senha pode ter até ${LIMITES_USUARIO.senhaMax} caracteres.`);
  const minuscula = senha.toLowerCase();
  if (SENHAS_COMUNS.has(minuscula) || /^(.)\1+$/.test(senha)) return erro('Esta senha é fácil de adivinhar. Escolha outra.');
  const login = contexto.usuario ? normalizarLogin(contexto.usuario) : '';
  const nome = contexto.nome ? contexto.nome.trim().toLowerCase().replace(/\s+/g, '') : '';
  if ((login && minuscula.includes(login) && login.length >= 4) || (nome.length >= 4 && minuscula.includes(nome))) {
    return erro('A senha não pode ter o seu usuário ou o seu nome.');
  }
  return { ok: true, valor: senha };
}

export interface NovoUsuario {
  nome: string;
  usuario: string;
  papel: PapelDeLoja;
  /** Senha provisória: no primeiro acesso a pessoa cria a dela. */
  senha: string;
}

export interface AlteracaoUsuario {
  nome?: string;
  papel?: PapelDeLoja;
  ativo?: boolean;
}

function lerNome(valor: unknown, erros: ErroCampo[]): string {
  const nome = typeof valor === 'string' ? valor.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (nome.length < LIMITES_USUARIO.nomeMin) erros.push({ campo: 'nome', mensagem: 'Informe o nome da pessoa.' });
  else if (nome.length > LIMITES_USUARIO.nomeMax) erros.push({ campo: 'nome', mensagem: `O nome pode ter até ${LIMITES_USUARIO.nomeMax} caracteres.` });
  else if (CONTROLE.test(nome)) erros.push({ campo: 'nome', mensagem: 'O nome contém caracteres inválidos.' });
  return nome;
}

function lerPapel(valor: unknown, erros: ErroCampo[]): PapelDeLoja {
  if (!ehPapelDeLoja(valor)) erros.push({ campo: 'papel', mensagem: `Escolha o papel: ${PAPEIS_DE_LOJA.map((p) => NOME_PAPEL[p]).join(', ')}.` });
  return valor as PapelDeLoja;
}

function camposPermitidos(dados: Record<string, unknown>, permitidos: readonly string[], erros: ErroCampo[]) {
  for (const k of Object.keys(dados)) if (!permitidos.includes(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });
}

export function validarLogin(valor: unknown): Resultado<string> {
  const login = typeof valor === 'string' ? normalizarLogin(valor) : '';
  if (!FORMATO_LOGIN.test(login)) {
    return {
      ok: false,
      erros: [{ campo: 'usuario', mensagem: 'O usuário (login) tem de 2 a 40 letras minúsculas ou números, sem espaço (pode ter ponto, hífen e _).' }],
    };
  }
  return { ok: true, valor: login };
}

export function validarNovoUsuario(entrada: unknown): Resultado<NovoUsuario> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os dados do usuário.' }] };
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['nome', 'usuario', 'papel', 'senha'], erros);
  const nome = lerNome(entrada.nome, erros);
  const login = validarLogin(entrada.usuario);
  if (!login.ok) erros.push(...login.erros);
  const papel = lerPapel(entrada.papel, erros);
  const senha = validarSenhaNova(entrada.senha, { usuario: login.ok ? login.valor : null, nome });
  if (!senha.ok) erros.push(...senha.erros);
  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { nome, usuario: (login as { valor: string }).valor, papel, senha: entrada.senha as string } };
}

export function validarAlteracaoUsuario(entrada: unknown): Resultado<AlteracaoUsuario> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o que muda.' }] };
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['nome', 'papel', 'ativo'], erros);
  const mudanca: AlteracaoUsuario = {};
  if (entrada.nome !== undefined) mudanca.nome = lerNome(entrada.nome, erros);
  if (entrada.papel !== undefined) mudanca.papel = lerPapel(entrada.papel, erros);
  if (entrada.ativo !== undefined) {
    if (typeof entrada.ativo !== 'boolean') erros.push({ campo: 'ativo', mensagem: 'Informe se o usuário fica ativo (true ou false).' });
    else mudanca.ativo = entrada.ativo;
  }
  if (!erros.length && Object.keys(mudanca).length === 0) erros.push({ campo: '_', mensagem: 'Nada para alterar.' });
  return erros.length ? { ok: false, erros } : { ok: true, valor: mudanca };
}

/** O que a regra precisa saber de cada usuário. */
export interface UsuarioParaRegra {
  id: string;
  papel: PapelDeLoja;
  ativo: boolean;
}

export type AcaoSobreUsuario =
  | { tipo: 'criar'; papel: PapelDeLoja }
  | { tipo: 'alterar'; mudanca: AlteracaoUsuario }
  | { tipo: 'redefinir_senha' }
  | { tipo: 'excluir_dados' };

const recusa = (mensagem: string, campo = '_'): Resultado<null> => ({ ok: false, erros: [{ campo, mensagem }] });

/**
 * Pode `ator` fazer `acao` com `alvo` (null ao criar)? `daLoja` = todos os usuários da loja, para a regra
 * "nunca sem um Dono ativo".
 */
export function conferirGestaoDeUsuario(
  ator: UsuarioParaRegra,
  alvo: UsuarioParaRegra | null,
  acao: AcaoSobreUsuario,
  daLoja: readonly UsuarioParaRegra[],
): Resultado<null> {
  if (!ator.ativo || !pode(ator.papel, 'usuarios')) return recusa(mensagemSemPermissao('usuarios'));

  if (acao.tipo === 'criar') {
    if (acao.papel === 'dono' && !pode(ator.papel, 'usuarios.donos')) return recusa('Só um Dono cadastra outro Dono.', 'papel');
    return { ok: true, valor: null };
  }
  if (!alvo) return recusa('Usuário não encontrado.');

  const ehEle = alvo.id === ator.id;
  const mexeEmDono = alvo.papel === 'dono' || (acao.tipo === 'alterar' && acao.mudanca.papel === 'dono');
  if (mexeEmDono && !pode(ator.papel, 'usuarios.donos')) return recusa('Só um Dono altera, desativa ou redefine a senha de outro Dono, ou dá o papel de Dono.');

  if (acao.tipo === 'redefinir_senha') {
    if (ehEle) return recusa('Para a sua própria senha, use “Trocar minha senha”.');
    return { ok: true, valor: null };
  }

  if (acao.tipo === 'excluir_dados') {
    if (!pode(ator.papel, 'usuarios.excluir_dados')) return recusa(mensagemSemPermissao('usuarios.excluir_dados'));
    if (ehEle) return recusa('Você não pode excluir os seus próprios dados por aqui.');
    if (alvo.ativo) return recusa('Desative o usuário antes de excluir os dados dele.');
    return { ok: true, valor: null };
  }

  const { mudanca } = acao;
  if (ehEle && mudanca.ativo === false) return recusa('Você não pode desativar o seu próprio usuário.', 'ativo');
  if (ehEle && mudanca.papel !== undefined && mudanca.papel !== alvo.papel) return recusa('Você não pode mudar o seu próprio papel. Peça a outro Dono.', 'papel');

  // a loja nunca fica sem um Dono ativo
  const deixaDeSerDonoAtivo = alvo.papel === 'dono' && alvo.ativo && ((mudanca.papel !== undefined && mudanca.papel !== 'dono') || mudanca.ativo === false);
  if (deixaDeSerDonoAtivo && !daLoja.some((u) => u.id !== alvo.id && u.papel === 'dono' && u.ativo)) {
    return recusa('Mantenha pelo menos um Dono ativo na loja.');
  }
  return { ok: true, valor: null };
}

/** Situação que a tela mostra na lista de usuários. */
export function situacaoDoUsuario(u: { ativo: boolean; senhaProvisoria: boolean; bloqueadoAte: string | null }, agora: Date): string {
  if (!u.ativo) return 'Desativado';
  if (u.bloqueadoAte && new Date(u.bloqueadoAte).getTime() > agora.getTime()) return 'Bloqueado (senhas erradas)';
  if (u.senhaProvisoria) return 'Senha provisória';
  return 'Ativo';
}

/** Ações registradas no histórico (auditoria), com o texto que aparece na tela. */
export const ACOES_AUDITORIA = {
  'sessao.entrou': 'Entrou no sistema',
  'sessao.saiu': 'Saiu do sistema',
  'sessao.senha_errada': 'Senha errada',
  'sessao.bloqueado': 'Bloqueado por senhas erradas',
  'usuario.criado': 'Usuário criado',
  'usuario.alterado': 'Usuário alterado',
  'usuario.desativado': 'Usuário desativado',
  'usuario.reativado': 'Usuário reativado',
  'usuario.senha_redefinida': 'Senha redefinida pelo Dono ou Administrador',
  'usuario.senha_trocada': 'Trocou a própria senha',
  'usuario.dados_excluidos': 'Dados do usuário excluídos (LGPD)',
  'cliente.dados_excluidos': 'Dados do cliente excluídos (LGPD)',
  'produto.criado': 'Produto cadastrado',
} as const;

export type AcaoAuditoria = keyof typeof ACOES_AUDITORIA;
