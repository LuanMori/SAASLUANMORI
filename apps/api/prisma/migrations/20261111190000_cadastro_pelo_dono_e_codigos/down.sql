-- apps/api/prisma/migrations/20261111190000_cadastro_pelo_dono_e_codigos/down.sql
-- Desfaz migration.sql desta pasta. Os códigos internos gerados são perdidos;
-- os códigos de barras voltam para a coluna "codigo".

ALTER TABLE "produtos" DROP CONSTRAINT IF EXISTS "produtos_preco_maior_que_zero";
ALTER TABLE "produtos" DROP CONSTRAINT IF EXISTS "produtos_codigo_barras_so_digitos";
ALTER TABLE "produtos" DROP CONSTRAINT IF EXISTS "produtos_codigo_interno_so_digitos";

DROP INDEX IF EXISTS "produtos_loja_id_codigo_interno_key";
ALTER TABLE "produtos" DROP COLUMN IF EXISTS "codigo_interno";

ALTER INDEX "produtos_loja_id_codigo_barras_key" RENAME TO "produtos_loja_id_codigo_key";
ALTER TABLE "produtos" RENAME COLUMN "codigo_barras" TO "codigo";

-- O FORCE RLS não muda aqui: migration.sql o desliga e religa no mesmo arquivo.
GRANT INSERT, UPDATE ON "usuarios" TO saas_app;
