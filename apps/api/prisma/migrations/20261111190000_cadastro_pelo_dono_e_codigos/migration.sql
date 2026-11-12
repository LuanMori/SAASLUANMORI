-- apps/api/prisma/migrations/20261111190000_cadastro_pelo_dono_e_codigos/migration.sql
-- Decisões do Luan (11/11/2026), alinhadas ao DaniPets V9.2:
--   1. Só entra quem o dono cadastrou: a API deixa de criar usuários sozinha.
--   2. Código interno gerado pelo sistema (0001, 0002, …); código de barras só números.
--   3. Preço de venda maior que zero (brinde é dado na venda, não no cadastro).
-- Reverter: down.sql desta pasta (via `npm run db:migrate:down -w @saas/api -- --confirmar`).

-- =====================================================================
-- 1) usuarios: a API só lê (privilégio mínimo). Cadastro: scripts/cadastrar-usuario.ts
--    até existir a tela de usuários (Fase 5.7).
-- =====================================================================
REVOKE INSERT, UPDATE ON "usuarios" FROM saas_app;

-- =====================================================================
-- 2) produtos
-- =====================================================================

-- No RDS, quem roda a migration é dono das tabelas mas NÃO é superusuário. Com
-- FORCE ROW LEVEL SECURITY ele também ficaria preso ao RLS e não enxergaria
-- nenhuma linha para conferir e preencher. Desliga o FORCE só para o dono,
-- só durante esta migration. A role saas_app continua sob RLS o tempo todo
-- (ENABLE continua ligado), e o FORCE volta no fim deste arquivo.
ALTER TABLE "produtos" NO FORCE ROW LEVEL SECURITY;

-- Dados antigos que não cabem nas regras novas: para e explica, nunca descarta.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "produtos" WHERE "codigo" IS NOT NULL AND "codigo" !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'Migration interrompida: há produtos com código que não é só número. O código de barras agora aceita só números. Corrija esses códigos e rode de novo.';
  END IF;
  IF EXISTS (SELECT 1 FROM "produtos" WHERE "preco_centavos" <= 0) THEN
    RAISE EXCEPTION 'Migration interrompida: há produtos com preço zero. O preço de venda agora precisa ser maior que zero. Corrija esses preços e rode de novo.';
  END IF;
END
$$;

-- O campo "codigo" da Fase -1 passa a ser o código de barras.
ALTER TABLE "produtos" RENAME COLUMN "codigo" TO "codigo_barras";
ALTER INDEX "produtos_loja_id_codigo_key" RENAME TO "produtos_loja_id_codigo_barras_key";

-- Código interno: produtos que já existem recebem 0001, 0002, … por loja, na ordem de cadastro.
ALTER TABLE "produtos" ADD COLUMN "codigo_interno" VARCHAR(18);

UPDATE "produtos" AS p
   SET "codigo_interno" = lpad(o.n::text, 4, '0')
  FROM (SELECT "id", row_number() OVER (PARTITION BY "loja_id" ORDER BY "criado_em", "id") AS n FROM "produtos") AS o
 WHERE p."id" = o."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "produtos" a JOIN "produtos" b
      ON a."loja_id" = b."loja_id" AND a."codigo_interno" = b."codigo_barras"
  ) THEN
    RAISE EXCEPTION 'Migration interrompida: um código interno gerado ficou igual a um código de barras já cadastrado na mesma loja. Corrija esse código de barras e rode de novo.';
  END IF;
END
$$;

ALTER TABLE "produtos" ALTER COLUMN "codigo_interno" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "produtos_loja_id_codigo_interno_key" ON "produtos"("loja_id", "codigo_interno");

-- Regras que o Prisma não modela (testadas em test/codigos.spec.ts e test/rls-banco.spec.ts)
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_codigo_interno_so_digitos" CHECK ("codigo_interno" ~ '^[0-9]{1,18}$');
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_codigo_barras_so_digitos" CHECK ("codigo_barras" ~ '^[0-9]{1,64}$');
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_preco_maior_que_zero" CHECK ("preco_centavos" > 0);

ALTER TABLE "produtos" FORCE ROW LEVEL SECURITY;
