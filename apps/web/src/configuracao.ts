// apps/web/src/configuracao.ts
// Configuração de build (VITE_*). Nada aqui é segredo: tudo vai para o navegador.
const env = import.meta.env;

function lojaDoEndereco(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('loja');
  } catch {
    return null;
  }
}

export const configuracao = {
  /** Onde a API responde. Padrão: /api no MESMO endereço (o nginx e o Vite repassam para o servidor). */
  apiUrl: (env.VITE_API_URL || '/api').replace(/\/+$/, ''),
  /**
   * Só quando o servidor não tem DOMINIO_BASE (desenvolvimento e teste local): o endereço da loja de
   * teste. Ordem: VITE_LOJA, ?loja= no endereço, "lojaa" no `npm run dev`. Em produção, a loja vem
   * do subdomínio e isto é ignorado pelo servidor.
   */
  lojaDev: env.VITE_LOJA || lojaDoEndereco() || (env.DEV ? 'lojaa' : null),
};
