-- apps/api/prisma/migrations/20261111180000_fase_menos_1_esqueleto/down.sql
-- Desfaz migration.sql desta pasta. Executado por scripts/migrate-down.ts,
-- que também remove o registro em _prisma_migrations (tudo numa transação).
--
-- A role saas_app NÃO é removida: role é do cluster Postgres inteiro e pode
-- estar em uso por outro banco (ex.: banco de testes). Só perde o acesso aqui.

DROP POLICY IF EXISTS "usuarios_isolamento_loja" ON "usuarios";
DROP POLICY IF EXISTS "produtos_isolamento_loja" ON "produtos";

DROP TABLE IF EXISTS "produtos";
DROP TABLE IF EXISTS "usuarios";
DROP TABLE IF EXISTS "lojas";

DROP TYPE IF EXISTS "papel";
DROP FUNCTION IF EXISTS "app_loja_atual"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
    REVOKE USAGE ON SCHEMA public FROM saas_app;
  END IF;
END
$$;
