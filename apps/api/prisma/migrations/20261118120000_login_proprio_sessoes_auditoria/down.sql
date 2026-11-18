-- apps/api/prisma/migrations/20261118120000_login_proprio_sessoes_auditoria/down.sql
-- Desfaz migration.sql desta pasta (volta para o login pelo Auth0).
-- O que se perde: sessões, auditoria, logins e senhas. As lojas ganham o org_id "org_<subdominio>"
-- e as pessoas o id "migrado|<id>": cadastre de novo o org_id e o user_id reais do Auth0.

-- 6) trava
DROP TRIGGER IF EXISTS "usuarios_trava_api" ON "usuarios";
DROP FUNCTION IF EXISTS "usuarios_trava_api"();

-- 5) privilégios e políticas
REVOKE UPDATE ("usuario", "nome", "papel", "ativo", "senha_hash", "senha_provisoria", "tentativas_erradas", "bloqueado_ate", "ultimo_acesso_em", "atualizado_em")
  ON "usuarios" FROM saas_app;
REVOKE INSERT, UPDATE ON "usuarios" FROM saas_app;
DROP POLICY IF EXISTS "auditoria_isolamento_loja" ON "auditoria";
DROP POLICY IF EXISTS "sessoes_isolamento_loja" ON "sessoes";

-- 3) e 4) tabelas novas
DROP TABLE IF EXISTS "auditoria";
DROP TABLE IF EXISTS "sessoes";

-- 2) usuarios
ALTER TABLE "usuarios" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" ADD COLUMN "auth0_sub" VARCHAR(128), ADD COLUMN "email" VARCHAR(254);
UPDATE "usuarios" SET "auth0_sub" = 'migrado|' || "id"::text;
ALTER TABLE "usuarios" ALTER COLUMN "auth0_sub" SET NOT NULL;
ALTER TABLE "usuarios" ALTER COLUMN "nome" DROP NOT NULL;
DROP INDEX IF EXISTS "usuarios_loja_id_usuario_key";
ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "usuarios_usuario_formato";
ALTER TABLE "usuarios"
  DROP COLUMN "usuario",
  DROP COLUMN "senha_hash",
  DROP COLUMN "senha_provisoria",
  DROP COLUMN "tentativas_erradas",
  DROP COLUMN "bloqueado_ate",
  DROP COLUMN "ultimo_acesso_em";
CREATE UNIQUE INDEX "usuarios_loja_id_auth0_sub_key" ON "usuarios"("loja_id", "auth0_sub");
ALTER TABLE "usuarios" FORCE ROW LEVEL SECURITY;

-- 1) lojas
ALTER TABLE "lojas" ADD COLUMN "auth0_org_id" VARCHAR(64);
UPDATE "lojas" SET "auth0_org_id" = 'org_' || replace("subdominio", '-', '');
ALTER TABLE "lojas" ALTER COLUMN "auth0_org_id" SET NOT NULL;
CREATE UNIQUE INDEX "lojas_auth0_org_id_key" ON "lojas"("auth0_org_id");
ALTER TABLE "lojas" DROP CONSTRAINT IF EXISTS "lojas_subdominio_formato";
DROP INDEX IF EXISTS "lojas_subdominio_key";
ALTER TABLE "lojas" DROP COLUMN "subdominio";
