// apps/web/src/subdominio.ts — descobre a loja pelo endereço acessado.
// Cada loja entra pelo próprio subdomínio (ex.: petshopdaana.nomedaempresa.com.br),
// então a pessoa não precisa escolher a loja na tela de entrada.
//
// Isto só serve para MOSTRAR a loja e mandar o login para o lugar certo. Quem decide
// a loja de verdade continua sendo a API (pelo token), nunca o navegador.

/** Subdomínios que não são lojas. */
const RESERVADOS = new Set(['www', 'app', 'api', 'login', 'admin']);

/**
 * "petshopdaana.nomedaempresa.com.br" -> "petshopdaana".
 * Domínio sem subdomínio, IP, localhost ou subdomínio reservado -> null.
 * @param dominioBase domínio do SaaS (ex.: "nomedaempresa.com.br").
 */
export function lojaDoEndereco(hostname: string, dominioBase: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const base = dominioBase.trim().toLowerCase().replace(/^\.+|\.$/g, '');
  if (!host || !base || !host.endsWith(`.${base}`)) return null;

  const resto = host.slice(0, -(base.length + 1));
  // Só um nível: "a.b.nomedaempresa.com.br" não é loja.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(resto)) return null;
  return RESERVADOS.has(resto) ? null : resto;
}
