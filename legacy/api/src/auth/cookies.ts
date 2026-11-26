// apps/api/src/auth/cookies.ts
// Cookie da sessão. O navegador guarda "<loja>.<segredo>"; o banco guarda só o SHA-256 do segredo
// (quem lê o banco não consegue entrar como ninguém). O id da loja vem junto só para abrir a
// transação certa (RLS): trocar a loja do cookie não acha sessão nenhuma.
//   - HttpOnly: o JavaScript da página não lê (um XSS não rouba a sessão);
//   - SameSite=Strict: outro site não consegue usar a sessão (CSRF);
//   - Secure + prefixo __Host-: só por HTTPS, só neste endereço exato (outra loja, outro subdomínio,
//     não recebe nem sobrescreve);
//   - sem Max-Age: some ao fechar o navegador (como a sessão do DaniPets).
import { createHash, randomBytes } from 'node:crypto';
import type { Ambiente } from '../config/ambiente.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGREDO = /^[A-Za-z0-9_-]{43}$/;

export const nomeDoCookie = (amb: Pick<Ambiente, 'cookieSeguro'>) => (amb.cookieSeguro ? '__Host-sessao' : 'sessao');

/** 32 bytes aleatórios (256 bits), em base64url. */
export const novoSegredo = () => randomBytes(32).toString('base64url');

export const hashDoSegredo = (segredo: string) => createHash('sha256').update(segredo).digest('hex');

export const valorDoCookie = (lojaId: string, segredo: string) => `${lojaId}.${segredo}`;

export function lerValorDoCookie(valor: string | undefined): { lojaId: string; segredo: string } | null {
  if (!valor || valor.length > 200) return null;
  const ponto = valor.indexOf('.');
  const lojaId = valor.slice(0, ponto);
  const segredo = valor.slice(ponto + 1);
  return ponto > 0 && UUID.test(lojaId) && SEGREDO.test(segredo) ? { lojaId: lojaId.toLowerCase(), segredo } : null;
}

/** "a=1; b=2" -> Map. Cookies repetidos: vale o primeiro (o mais específico, pela regra dos navegadores). */
export function lerCookies(cabecalho: string | undefined): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const parte of (cabecalho ?? '').split(';')) {
    const igual = parte.indexOf('=');
    if (igual <= 0) continue;
    const nome = parte.slice(0, igual).trim();
    if (!mapa.has(nome)) mapa.set(nome, parte.slice(igual + 1).trim());
  }
  return mapa;
}

export function cookieDaSessao(amb: Pick<Ambiente, 'cookieSeguro'>, valor: string): string {
  return `${nomeDoCookie(amb)}=${valor}; Path=/; HttpOnly; SameSite=Strict${amb.cookieSeguro ? '; Secure' : ''}`;
}

export function cookieApagado(amb: Pick<Ambiente, 'cookieSeguro'>): string {
  return `${nomeDoCookie(amb)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${amb.cookieSeguro ? '; Secure' : ''}`;
}
