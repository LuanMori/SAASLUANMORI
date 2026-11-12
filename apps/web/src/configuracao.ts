// apps/web/src/configuracao.ts
// Lê a configuração de build (VITE_*). Falta algo? Mostra na tela em vez de quebrar em silêncio.
const env = import.meta.env;

const faltando = (['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE', 'VITE_API_URL'] as const).filter(
  (n) => !env[n],
);

export const erroConfiguracao = faltando.length ? `Configuração incompleta: ${faltando.join(', ')}` : null;

export const configuracao = {
  auth0Domain: env.VITE_AUTH0_DOMAIN,
  auth0ClientId: env.VITE_AUTH0_CLIENT_ID,
  auth0Audience: env.VITE_AUTH0_AUDIENCE,
  apiUrl: (env.VITE_API_URL ?? '').replace(/\/+$/, ''),
};
