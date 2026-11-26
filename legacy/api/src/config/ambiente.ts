// apps/api/src/config/ambiente.ts
// Toda configuração vem do ambiente (variáveis do servidor ou do docker-compose; ver docs/deploy.md).
// Nenhum segredo em código. Falha cedo, citando só os NOMES das variáveis com problema — nunca os valores.

export const AMBIENTE = Symbol('AMBIENTE');

export interface Ambiente {
  porta: number;
  /** Conexão com a role saas_app (sem BYPASSRLS, não é dona das tabelas). Conferido ao iniciar. */
  databaseUrlApp: string;
  /** Origens de outro endereço liberadas no CORS (ex.: o Vite em desenvolvimento). Pode ficar vazio. */
  origensWeb: string[];
  /**
   * Cookie de sessão só por HTTPS (Secure + prefixo __Host-). Padrão: ligado. Desligue (false) só para
   * testar por http num endereço que não seja localhost.
   */
  cookieSeguro: boolean;
  /**
   * Domínio do SaaS (ex.: nomedaempresa.com.br). Com ele, a loja do login vem do endereço acessado
   * (lojaa.nomedaempresa.com.br), e não do que a tela mandou. Vazio em desenvolvimento.
   */
  dominioBase: string | null;
  /** Minutos sem uso até a sessão cair (padrão 30, como o DaniPets). */
  sessaoInatividadeMin: number;
  /** Horas até a sessão cair de qualquer jeito (padrão 12: um turno). */
  sessaoMaximaHoras: number;
  /** Quantos proxies confiáveis há na frente da API (nginx = 1). Define o IP real para os limites. */
  saltosDeProxy: number;
  /** erro | aviso | info | debug (padrão info). Os logs saem em JSON, uma linha por evento. */
  logNivel: NivelLog;
}

export const NIVEIS_LOG = ['erro', 'aviso', 'info', 'debug'] as const;
export type NivelLog = (typeof NIVEIS_LOG)[number];

function inteiro(env: NodeJS.ProcessEnv, nome: string, padrao: number, min: number, max: number): number {
  const bruto = env[nome]?.trim();
  if (!bruto) return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nome} inválida (use um número de ${min} a ${max}).`);
  return n;
}

export function lerAmbiente(env: NodeJS.ProcessEnv = process.env): Ambiente {
  if (!env.DATABASE_URL_APP?.trim()) throw new Error('Variáveis de ambiente ausentes: DATABASE_URL_APP');

  const dominio = env.DOMINIO_BASE?.trim().toLowerCase().replace(/^\.+|\.+$/g, '') || null;
  if (dominio && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) throw new Error('DOMINIO_BASE inválido (ex.: nomedaempresa.com.br, sem https://).');

  const nivel = (env.LOG_NIVEL?.trim().toLowerCase() || 'info') as NivelLog;
  if (!NIVEIS_LOG.includes(nivel)) throw new Error(`LOG_NIVEL deve ser: ${NIVEIS_LOG.join(', ')}.`);

  const seguro = env.COOKIE_SEGURO?.trim().toLowerCase();
  if (seguro && seguro !== 'true' && seguro !== 'false') throw new Error('COOKIE_SEGURO deve ser true ou false.');

  return {
    porta: inteiro(env, 'PORT', 3000, 1, 65535),
    databaseUrlApp: env.DATABASE_URL_APP.trim(),
    origensWeb: (env.WEB_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    cookieSeguro: seguro !== 'false',
    dominioBase: dominio,
    sessaoInatividadeMin: inteiro(env, 'SESSAO_INATIVIDADE_MIN', 30, 5, 24 * 60),
    sessaoMaximaHoras: inteiro(env, 'SESSAO_MAXIMA_HORAS', 12, 1, 72),
    saltosDeProxy: inteiro(env, 'SALTOS_DE_PROXY', 1, 0, 5),
    logNivel: nivel,
  };
}
