// packages/core/tsup.config.ts
// Gera ESM (usado pelo frontend/Vite) e CJS (usado pela API NestJS), com tipos.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
