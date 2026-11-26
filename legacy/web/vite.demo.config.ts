// apps/web/vite.demo.config.ts — build da demonstração (demo.html) em um arquivo só.
// O JS e o CSS saem num bundle único; scripts/juntar-html.mjs coloca tudo dentro do HTML.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: 'demo.html',
      output: { inlineDynamicImports: true },
    },
  },
});
