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
import { ehAdmSup, ehPapelDeLoja, NOME_PAPEL, PAPEIS_DE_LOJA, type PapelDeLoja, type PapelNaLoja } from './papeis';
import { ehPermissaoConcedivel, mensagemSemPermissao, type Permissao, PERMISSOES, PERMISSOES_CONCEDIVEIS, pode, type QuemAcessa, telaQueAFuncaoPede } from './permissoes';
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
  /** Só no Personalizado: as funções escolhidas para ele (PERMISSOES_CONCEDIVEIS). */
  permissoes?: Permissao[];
}

export interface AlteracaoUsuario {
  nome?: string;
  papel?: PapelDeLoja;
  ativo?: boolean;
  /** Só no Personalizado: a lista nova de funções (troca a anterior inteira). */
  permissoes?: Permissao[];
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

/** Funções do Personalizado: pelo menos uma, sem repetir, só das que se podem dar. */
function lerPermissoes(valor: unknown, erros: ErroCampo[]): Permissao[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    erros.push({ campo: 'permissoes', mensagem: 'Marque pelo menos uma função para o Personalizado.' });
    return [];
  }
  const estranha = valor.find((p) => !ehPermissaoConcedivel(p));
  if (estranha !== undefined) {
    erros.push({ campo: 'permissoes', mensagem: `Esta função não pode ser dada a um Personalizado: ${typeof estranha === 'string' ? estranha : '?'}.` });
    return [];
  }
  // na ordem da lista de permissões (a mesma em toda tela e em todo registro)
  const marcadas = new Set(valor as Permissao[]);
  // o extra de uma tela só vale com o acesso a ela (ex.: o CPF completo, só com Clientes)
  const solta = PERMISSOES_CONCEDIVEIS.find((p) => marcadas.has(p) && telaQueAFuncaoPede(p) !== null && !marcadas.has(telaQueAFuncaoPede(p)!.acesso!));
  if (solta) {
    erros.push({ campo: 'permissoes', mensagem: `Para “${PERMISSOES[solta]}”, marque também a tela “${telaQueAFuncaoPede(solta)!.tela}”.` });
    return [];
  }
  return PERMISSOES_CONCEDIVEIS.filter((p) => marcadas.has(p));
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
  camposPermitidos(entrada, ['nome', 'usuario', 'papel', 'senha', 'permissoes'], erros);
  const nome = lerNome(entrada.nome, erros);
  const login = validarLogin(entrada.usuario);
  if (!login.ok) erros.push(...login.erros);
  const papel = lerPapel(entrada.papel, erros);
  let permissoes: Permissao[] | undefined;
  if (papel === 'personalizado') permissoes = lerPermissoes(entrada.permissoes, erros);
  else if (entrada.permissoes !== undefined && !(Array.isArray(entrada.permissoes) && entrada.permissoes.length === 0)) {
    erros.push({ campo: 'permissoes', mensagem: 'Funções escolhidas só no papel Personalizado.' });
  }
  const senha = validarSenhaNova(entrada.senha, { usuario: login.ok ? login.valor : null, nome });
  if (!senha.ok) erros.push(...senha.erros);
  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { nome, usuario: (login as { valor: string }).valor, papel, senha: entrada.senha as string, ...(permissoes ? { permissoes } : {}) } };
}

export function validarAlteracaoUsuario(entrada: unknown): Resultado<AlteracaoUsuario> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o que muda.' }] };
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['nome', 'papel', 'ativo', 'permissoes'], erros);
  const mudanca: AlteracaoUsuario = {};
  if (entrada.nome !== undefined) mudanca.nome = lerNome(entrada.nome, erros);
  if (entrada.papel !== undefined) mudanca.papel = lerPapel(entrada.papel, erros);
  if (entrada.permissoes !== undefined) mudanca.permissoes = lerPermissoes(entrada.permissoes, erros);
  if (entrada.ativo !== undefined) {
    if (typeof entrada.ativo !== 'boolean') erros.push({ campo: 'ativo', mensagem: 'Informe se o usuário fica ativo (true ou false).' });
    else mudanca.ativo = entrada.ativo;
  }
  if (!erros.length && Object.keys(mudanca).length === 0) erros.push({ campo: '_', mensagem: 'Nada para alterar.' });
  return erros.length ? { ok: false, erros } : { ok: true, valor: mudanca };
}

/** O que a regra precisa saber de cada usuário (quem faz pode ser o Adm. Sup). */
export interface UsuarioParaRegra {
  id: string;
  papel: PapelNaLoja;
  ativo: boolean;
  /** Funções do Personalizado. */
  permissoes?: readonly string[] | null;
}

/**
 * Que papéis `quem` pode dar a um usuário novo (pedido do Luan, 23/11/2026): o Dono e o Administrador cadastram
 * Vendedor e Personalizado; o Dono (na implantação) e o Administrador só o Adm. Sup cadastra.
 */
export function papeisQuePodeCriar(quem: QuemAcessa): PapelDeLoja[] {
  const papel = typeof quem === 'string' ? quem : quem?.papel;
  if (ehAdmSup(papel)) return [...PAPEIS_DE_LOJA];
  return pode(quem, 'usuarios') ? ['vendedor', 'personalizado'] : [];
}

const SO_PELO_SUPORTE = 'O Dono e o Administrador só são cadastrados pelo suporte (Adm. Sup), na implantação do sistema.';

export type AcaoSobreUsuario =
  | { tipo: 'criar'; papel: PapelDeLoja; permissoes?: readonly string[] }
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
  if (!ator.ativo || !pode(ator, 'usuarios')) return recusa(mensagemSemPermissao('usuarios'));
  // ninguém dá ao Personalizado uma função que não tem (o Administrador não dá o que é só do Dono)
  const daFuncoes = (lista: readonly string[] | undefined) =>
    !lista || lista.every((p) => ehPermissaoConcedivel(p) && pode(ator, p)) ? null : recusa('Você só pode dar ao Personalizado as funções que você mesmo tem.', 'permissoes');

  if (acao.tipo === 'criar') {
    if (!papeisQuePodeCriar(ator).includes(acao.papel)) return recusa(acao.papel === 'dono' || acao.papel === 'administrador' ? SO_PELO_SUPORTE : mensagemSemPermissao('usuarios'), 'papel');
    if (acao.papel === 'personalizado' && (!acao.permissoes || acao.permissoes.length === 0)) return recusa('Marque pelo menos uma função para o Personalizado.', 'permissoes');
    return daFuncoes(acao.permissoes) ?? { ok: true, valor: null };
  }
  if (!alvo) return recusa('Usuário não encontrado.');
  if (ehAdmSup(alvo.papel)) return recusa('Usuário não encontrado.'); // o Adm. Sup não é da loja

  const ehEle = alvo.id === ator.id;
  const mexeEmDono = alvo.papel === 'dono' || (acao.tipo === 'alterar' && acao.mudanca.papel === 'dono');
  if (mexeEmDono && !pode(ator, 'usuarios.donos')) return recusa('Só um Dono altera, desativa ou redefine a senha de outro Dono, ou dá o papel de Dono.');

  if (acao.tipo === 'redefinir_senha') {
    if (ehEle) return recusa('Para a sua própria senha, use “Trocar minha senha”.');
    return { ok: true, valor: null };
  }

  if (acao.tipo === 'excluir_dados') {
    if (!pode(ator, 'usuarios.excluir_dados')) return recusa(mensagemSemPermissao('usuarios.excluir_dados'));
    if (ehEle) return recusa('Você não pode excluir os seus próprios dados por aqui.');
    if (alvo.ativo) return recusa('Desative o usuário antes de excluir os dados dele.');
    return { ok: true, valor: null };
  }

  const { mudanca } = acao;
  if (ehEle && mudanca.ativo === false) return recusa('Você não pode desativar o seu próprio usuário.', 'ativo');
  if (ehEle && ((mudanca.papel !== undefined && mudanca.papel !== alvo.papel) || mudanca.permissoes !== undefined)) {
    return recusa('Você não pode mudar o seu próprio papel nem as suas funções. Peça a outro Dono.', 'papel');
  }
  // dar o papel de Dono ou de Administrador: só o Adm. Sup
  if (mudanca.papel !== undefined && mudanca.papel !== alvo.papel && (mudanca.papel === 'dono' || mudanca.papel === 'administrador') && !ehAdmSup(ator.papel)) {
    return recusa('Só o suporte (Adm. Sup) dá o papel de Dono ou de Administrador.', 'papel');
  }
  // funções: só no Personalizado (o papel novo, ou o atual se o papel não muda)
  const papelDepois = mudanca.papel ?? alvo.papel;
  if (mudanca.permissoes !== undefined && papelDepois !== 'personalizado') return recusa('Funções escolhidas só no papel Personalizado.', 'permissoes');
  if (papelDepois === 'personalizado' && alvo.papel !== 'personalizado' && !(mudanca.permissoes && mudanca.permissoes.length)) {
    return recusa('Marque pelo menos uma função para o Personalizado.', 'permissoes');
  }
  const funcoes = daFuncoes(mudanca.permissoes);
  if (funcoes) return funcoes;

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

// As ações do histórico (ACOES_AUDITORIA) ficam em auditoria.ts.
