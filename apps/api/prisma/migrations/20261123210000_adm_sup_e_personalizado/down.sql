-- Desfaz 20261123210000_adm_sup_e_personalizado: volta a trava de usuários anterior, tira as funções do suporte, a
-- coluna de funções e o papel Personalizado (quem era Personalizado vira Vendedor, sem funções).
CREATE OR REPLACE FUNCTION "usuarios_trava_api"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  ator_id uuid := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
  ator_papel "papel";
BEGIN
  IF current_user <> 'saas_app' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- login: contagem de senhas erradas, bloqueio e último acesso (ninguém logado ainda)
    IF (NEW."id", NEW."loja_id", NEW."usuario", NEW."nome", NEW."papel", NEW."ativo", NEW."senha_hash", NEW."senha_provisoria", NEW."criado_em")
       IS NOT DISTINCT FROM
       (OLD."id", OLD."loja_id", OLD."usuario", OLD."nome", OLD."papel", OLD."ativo", OLD."senha_hash", OLD."senha_provisoria", OLD."criado_em") THEN
      RETURN NEW;
    END IF;
    IF ator_id IS NULL THEN
      RAISE EXCEPTION 'usuarios: alteração sem ninguém logado' USING ERRCODE = '42501';
    END IF;
    -- trocar a própria senha
    IF NEW."id" = ator_id
       AND (NEW."loja_id", NEW."usuario", NEW."nome", NEW."papel", NEW."ativo", NEW."criado_em")
           IS NOT DISTINCT FROM (OLD."loja_id", OLD."usuario", OLD."nome", OLD."papel", OLD."ativo", OLD."criado_em") THEN
      RETURN NEW;
    END IF;
  END IF;

  IF ator_id IS NULL THEN
    RAISE EXCEPTION 'usuarios: cadastro sem ninguém logado' USING ERRCODE = '42501';
  END IF;
  -- RLS: só enxerga quem é da mesma loja
  SELECT "papel" INTO ator_papel FROM "usuarios" WHERE "id" = ator_id AND "ativo";
  IF ator_papel IS NULL OR ator_papel NOT IN ('dono', 'administrador') THEN
    RAISE EXCEPTION 'usuarios: só o Dono ou o Administrador cadastra e altera usuários' USING ERRCODE = '42501';
  END IF;
  IF (TG_OP = 'INSERT' AND NEW."papel" = 'dono') OR (TG_OP = 'UPDATE' AND (OLD."papel" = 'dono' OR NEW."papel" = 'dono')) THEN
    IF ator_papel <> 'dono' THEN
      RAISE EXCEPTION 'usuarios: só um Dono mexe em outro Dono ou dá o papel de Dono' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."id" = ator_id AND (NEW."ativo" IS DISTINCT FROM OLD."ativo" OR NEW."papel" IS DISTINCT FROM OLD."papel") THEN
    RAISE EXCEPTION 'usuarios: ninguém desativa nem muda o próprio papel' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."papel" = 'dono' AND OLD."ativo" AND (NEW."papel" <> 'dono' OR NOT NEW."ativo") THEN
    -- mesma trava que a API usa: duas pessoas tirando Donos ao mesmo tempo não deixam a loja sem nenhum
    PERFORM pg_advisory_xact_lock(hashtextextended('usuarios:' || OLD."loja_id"::text, 0));
    IF NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "loja_id" = OLD."loja_id" AND "id" <> OLD."id" AND "papel" = 'dono' AND "ativo") THEN
      RAISE EXCEPTION 'usuarios: a loja precisa de pelo menos um Dono ativo' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP POLICY IF EXISTS "usuarios_suporte_dono_do_schema" ON "usuarios";
DROP FUNCTION IF EXISTS "app_suporte_registrar"(uuid, integer, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS "app_suporte_por_id"(uuid);
DROP FUNCTION IF EXISTS "app_suporte_para_login"(text);

UPDATE "usuarios" SET "papel" = 'vendedor', "permissoes" = '{}' WHERE "papel"::text = 'personalizado';
REVOKE UPDATE ("permissoes") ON "usuarios" FROM saas_app;
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_permissoes_formato";
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_permissoes_so_personalizado";
ALTER TABLE "usuarios" DROP COLUMN "permissoes";

-- o Postgres não tira valor de enum: recria o tipo sem 'personalizado'
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_super_admin_sem_loja";
ALTER TABLE "usuarios" ALTER COLUMN "papel" DROP DEFAULT;
ALTER TYPE "papel" RENAME TO "papel_com_personalizado";
CREATE TYPE "papel" AS ENUM ('super_admin', 'dono', 'administrador', 'vendedor');
ALTER TABLE "usuarios" ALTER COLUMN "papel" TYPE "papel" USING "papel"::text::"papel";
ALTER TABLE "usuarios" ALTER COLUMN "papel" SET DEFAULT 'vendedor';
DROP TYPE "papel_com_personalizado";
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_super_admin_sem_loja"
  CHECK (("papel" = 'super_admin') = ("loja_id" IS NULL));
