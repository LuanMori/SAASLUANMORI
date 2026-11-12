// apps/api/src/config/ambiente.ts
// Toda configuração vem do ambiente (em produção: ECS task definition +
// AWS Secrets Manager). Nenhum segredo em código. Falha cedo, citando só os
// NOMES das variáveis que faltam — nunca os valores.

export const AMBIENTE = Symbol('AMBIENTE');

export interface Ambiente {
  porta: number;
  /** Conexão com a role saas_app (sem BYPASSRLS, não é dona das tabelas). */
  databaseUrlApp: string;
  /** Ex.: minha-empresa.us.auth0.com (sem https://). */
  auth0Domain: string;
  /** Identifier da API cadastrada no Auth0. Ex.: https://api.meudominio.com.br */
  auth0Audience: string;
  /** Origens do frontend liberadas no CORS. */
  origensWeb: string[];
}

export function lerAmbiente(env: NodeJS.ProcessEnv = process.env): Ambiente {
  const obrigatorias = ['DATABASE_URL_APP', 'AUTH0_DOMAIN', 'AUTH0_AUDIENCE', 'WEB_ORIGINS'] as const;
  const faltando = obrigatorias.filter((nome) => !env[nome]?.trim());
  if (faltando.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${faltando.join(', ')}`);
  }

  const dominio = env.AUTH0_DOMAIN!.trim();
  if (/^https?:\/\//.test(dominio) || dominio.includes('/')) {
    throw new Error('AUTH0_DOMAIN deve ser só o domínio (ex.: minha-empresa.us.auth0.com).');
  }

  const porta = Number(env.PORT ?? 3000);
  if (!Number.isInteger(porta) || porta <= 0) throw new Error('PORT inválida.');

  return {
    porta,
    databaseUrlApp: env.DATABASE_URL_APP!.trim(),
    auth0Domain: dominio,
    auth0Audience: env.AUTH0_AUDIENCE!.trim(),
    origensWeb: env
      .WEB_ORIGINS!.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

export function issuerAuth0(amb: Ambiente): string {
  return `https://${amb.auth0Domain}/`;
}
