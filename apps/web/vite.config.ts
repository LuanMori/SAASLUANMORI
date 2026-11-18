// apps/web/vite.config.ts
// `npm run dev`: a tela em http://localhost:5173 e /api repassado para a API em http://localhost:3000
// (mesmo endereço para o navegador: o cookie de sessão é SameSite=Strict e o CORS nem entra em jogo).
// No build, a política de segurança de conteúdo (CSP) vai no HTML; o nginx manda a mesma no cabeçalho.
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * CSP do sistema real: só scripts, estilos e chamadas do próprio endereço (um XSS não carrega nada de
 * fora nem manda dados para fora). frame-ancestors só vale no cabeçalho (nginx), não no <meta>.
 */
export const CSP_META = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function cspNoHtml(): Plugin {
  return {
    name: 'csp-no-html',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_META }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  plugins: [react(), cspNoHtml()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false, rewrite: (caminho) => caminho.replace(/^\/api/, '') },
    },
  },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
