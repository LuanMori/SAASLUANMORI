// apps/api/prisma.config.ts
// O Prisma CLI (migrate) usa a conexão de DONO do schema (DATABASE_URL_MIGRATE).
// A API em execução usa outra conexão, com a role saas_app (DATABASE_URL_APP),
// que não é dona das tabelas e não tem BYPASSRLS.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` não precisa de banco; migrate precisa e falha com mensagem clara se vazio.
    url: process.env.DATABASE_URL_MIGRATE ?? '',
  },
});
