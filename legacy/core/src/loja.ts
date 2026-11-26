// packages/core/src/loja.ts
// Endereço de cada loja: <subdomínio>.<domínio do SaaS> (ex.: lojaa.nomedaempresa.com.br). É por ele
// que o servidor sabe em qual loja a pessoa está entrando — nunca pelo que a tela manda.
// O banco tem a mesma regra (CHECK lojas_subdominio_formato, migration 20261118120000).
import type { Resultado } from './resultado';

export const FORMATO_SUBDOMINIO = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Endereços que ficam para o próprio sistema (site, painel, API). */
export const SUBDOMINIOS_RESERVADOS: readonly string[] = ['www', 'app', 'api', 'login', 'admin'];

export function validarSubdominio(valor: unknown): Resultado<string> {
  const s = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (!FORMATO_SUBDOMINIO.test(s)) {
    return {
      ok: false,
      erros: [
        {
          campo: 'loja',
          mensagem: 'O endereço da loja tem até 63 letras minúsculas, números ou hífen (sem acento, sem espaço, sem hífen nas pontas).',
        },
      ],
    };
  }
  if (SUBDOMINIOS_RESERVADOS.includes(s)) return { ok: false, erros: [{ campo: 'loja', mensagem: `"${s}" é reservado. Escolha outro endereço.` }] };
  return { ok: true, valor: s };
}

/**
 * Subdomínio da loja a partir do endereço acessado (cabeçalho Host), ou null se o endereço não for de
 * uma loja deste domínio. "LojaA.NomeDaEmpresa.com.br:443" -> "lojaa". "a.b.nomedaempresa.com.br" -> null.
 */
export function subdominioDoEndereco(host: string | null | undefined, dominioBase: string): string | null {
  const h = String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  const sufixo = `.${dominioBase.toLowerCase()}`;
  if (!h.endsWith(sufixo)) return null;
  const r = validarSubdominio(h.slice(0, -sufixo.length));
  return r.ok ? r.valor : null;
}
