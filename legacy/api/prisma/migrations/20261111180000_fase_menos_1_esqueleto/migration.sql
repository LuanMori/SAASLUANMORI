-- apps/api/prisma/migrations/20261111180000_fase_menos_1_esqueleto/migration.sql
-- Fase -1: lojas, usuarios, produtos + isolamento por loja no BANCO (RLS).
-- Reverter: apps/api/prisma/migrations/20261111180000_fase_menos_1_esqueleto/down.sql
--           (via `npm run db:migrate:down -w @saas/api`)

-- =====================================================================
-- Parte 1 — estrutura (equivalente ao que o Prisma geraria do schema.prisma)
-- =====================================================================

-- CreateEnum
CREATE TYPE "papel" AS ENUM ('super_admin', 'dono', 'administrador', 'vendedor');

-- CreateTable
CREATE TABLE "lojas" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "auth0_org_id" VARCHAR(64) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "loja_id" UUID,
    "auth0_sub" VARCHAR(128) NOT NULL,
    "email" VARCHAR(254),
    "nome" VARCHAR(120),
    "papel" "papel" NOT NULL DEFAULT 'vendedor',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "codigo" VARCHAR(64),
    "preco_centavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lojas_auth0_org_id_key" ON "lojas"("auth0_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_loja_id_auth0_sub_key" ON "usuarios"("loja_id", "auth0_sub");

-- CreateIndex
CREATE INDEX "produtos_loja_id_nome_idx" ON "produtos"("loja_id", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_loja_id_codigo_key" ON "produtos"("loja_id", "codigo");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Parte 2 — segurança multi-tenant (o Prisma não modela; escrito à mão)
-- =====================================================================

-- 2.1) Role da API. NOLOGIN e sem senha aqui: segredo nunca entra em migration.
--      A senha/LOGIN é ligada por scripts/definir-senha-app.ts (lê do ambiente).
--      NOBYPASSRLS + não ser dona das tabelas = RLS sempre se aplica a ela.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
    CREATE ROLE saas_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

-- 2.2) Loja da transação corrente. A API define com
--      set_config('app.loja_id', <uuid>, true)  -- true = vale só nesta transação.
--      Sem definição => NULL => a comparação nunca é verdadeira => zero linhas.
CREATE FUNCTION "app_loja_atual"() RETURNS UUID
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.loja_id', true), '')::uuid $$;

-- 2.3) super_admin <=> sem loja. Qualquer outro papel exige loja.
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_super_admin_sem_loja"
  CHECK (("papel" = 'super_admin') = ("loja_id" IS NULL));

-- 2.4) Row-Level Security.
--      FORCE: vale até para a role dona das tabelas (só superusuário escapa,
--      e a API nunca conecta como superusuário).
ALTER TABLE "produtos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produtos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "produtos_isolamento_loja" ON "produtos"
  FOR ALL
  USING ("loja_id" = "app_loja_atual"())
  WITH CHECK ("loja_id" = "app_loja_atual"());

-- usuarios também (dado pessoal: e-mail e nome). Linhas de super_admin
-- (loja_id NULL) ficam invisíveis para a API — tratadas na Fase 3.
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" FORCE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_isolamento_loja" ON "usuarios"
  FOR ALL
  USING ("loja_id" = "app_loja_atual"())
  WITH CHECK ("loja_id" = "app_loja_atual"());

-- 2.5) Privilégios mínimos da API (sem DELETE: nenhum endpoint apaga nada nesta fase).
GRANT USAGE ON SCHEMA public TO saas_app;
GRANT SELECT ON "lojas" TO saas_app;
GRANT SELECT, INSERT, UPDATE ON "usuarios" TO saas_app;
GRANT SELECT, INSERT, UPDATE ON "produtos" TO saas_app;
GRANT EXECUTE ON FUNCTION "app_loja_atual"() TO saas_app;
