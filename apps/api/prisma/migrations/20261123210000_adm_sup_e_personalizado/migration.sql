-- 20261123210000_adm_sup_e_personalizado (pedido do Luan, 23/11/2026)
-- 1) Papel PERSONALIZADO: a pessoa tem só as funções marcadas para ela (coluna `permissoes`, só nesse papel).
-- 2) ADM. SUP (super_admin, linha sem loja): o usuário mestre entra em QUALQUER loja. A API (saas_app) continua sem
--    enxergar a linha dele (RLS por loja_id); ela usa só três funções SECURITY DEFINER, estreitas, com search_path fixo:
--      app_suporte_para_login(login) -> o que o login precisa (id, nome, situação, hash e tentativas);
--      app_suporte_por_id(id)        -> nome e situação (a sessão confere a cada pedido; o histórico mostra "Suporte");
--      app_suporte_registrar(...)    -> senhas erradas, bloqueio e último acesso (no login).
--    As funções pertencem a quem roda as migrations (superusuário), por isso leem a linha sem loja.
-- 3) A trava de usuários no banco segue as regras novas: Dono e Administrador só o super_admin cadastra ou dá esses
--    papéis; o super_admin (que não aparece na loja) é reconhecido pela função; o Personalizado precisa de funções.

ALTER TYPE "papel" ADD VALUE IF NOT EXISTS 'personalizado';

ALTER TABLE "usuarios" ADD COLUMN "permissoes" TEXT[] NOT NULL DEFAULT '{}';
-- comparado como texto: o valor novo do enum só pode ser usado como valor depois do COMMIT
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_permissoes_so_personalizado"
  CHECK ("papel"::text = 'personalizado' OR cardinality("permissoes") = 0);
-- até 40 funções, nomes curtos de letras minúsculas, ponto e _ (a lista vem de @saas/core; a API confere cada nome)
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_permissoes_formato"
  CHECK (cardinality("permissoes") <= 40 AND array_to_string("permissoes", ',') ~ '^[a-z_.,]*$');
GRANT UPDATE ("permissoes") ON "usuarios" TO saas_app;

-- 2) o super_admin para a API: só o necessário, nada de listar.
-- As funções pertencem a quem roda as migrations. Num banco gerenciado (RDS) essa role é dona das tabelas, mas não é
-- superusuário: com FORCE ROW LEVEL SECURITY ela também passa pelo RLS. Esta policy deixa SÓ essa role (nunca a
-- saas_app nem PUBLIC) ver e gravar as linhas do super_admin, para as funções abaixo e para o script db:suporte.
DO $$
BEGIN
  EXECUTE format(
    'CREATE POLICY "usuarios_suporte_dono_do_schema" ON "usuarios" FOR ALL TO %I USING ("loja_id" IS NULL AND "papel" = %L) WITH CHECK ("loja_id" IS NULL AND "papel" = %L)',
    current_user, 'super_admin', 'super_admin');
END
$$;

CREATE FUNCTION "app_suporte_para_login"(p_login text)
  RETURNS TABLE ("id" uuid, "nome" varchar, "usuario" varchar, "ativo" boolean, "senha_hash" varchar, "senha_provisoria" boolean, "tentativas_erradas" integer, "bloqueado_ate" timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT u."id", u."nome", u."usuario", u."ativo", u."senha_hash", u."senha_provisoria", u."tentativas_erradas", u."bloqueado_ate"
      FROM public."usuarios" u
     WHERE u."loja_id" IS NULL AND u."papel" = 'super_admin' AND u."usuario" = p_login
  $$;

CREATE FUNCTION "app_suporte_por_id"(p_id uuid)
  RETURNS TABLE ("id" uuid, "nome" varchar, "usuario" varchar, "ativo" boolean, "senha_provisoria" boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT u."id", u."nome", u."usuario", u."ativo", u."senha_provisoria"
      FROM public."usuarios" u
     WHERE u."id" = p_id AND u."loja_id" IS NULL AND u."papel" = 'super_admin'
  $$;

CREATE FUNCTION "app_suporte_registrar"(p_id uuid, p_tentativas integer, p_bloqueado_ate timestamptz, p_ultimo_acesso timestamptz)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    UPDATE public."usuarios"
       SET "tentativas_erradas" = GREATEST(0, LEAST(p_tentativas, 1000)),
           "bloqueado_ate" = p_bloqueado_ate,
           "ultimo_acesso_em" = COALESCE(p_ultimo_acesso, "ultimo_acesso_em")
     WHERE "id" = p_id AND "loja_id" IS NULL AND "papel" = 'super_admin'
  $$;

REVOKE ALL ON FUNCTION "app_suporte_para_login"(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_suporte_por_id"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_suporte_registrar"(uuid, integer, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app_suporte_para_login"(text) TO saas_app;
GRANT EXECUTE ON FUNCTION "app_suporte_por_id"(uuid) TO saas_app;
GRANT EXECUTE ON FUNCTION "app_suporte_registrar"(uuid, integer, timestamptz, timestamptz) TO saas_app;

-- 3) a trava de usuários, com as regras novas
CREATE OR REPLACE FUNCTION "usuarios_trava_api"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  ator_id uuid := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
  ator_papel text;
BEGIN
  IF current_user <> 'saas_app' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- login: contagem de senhas erradas, bloqueio e último acesso (ninguém logado ainda)
    IF (NEW."id", NEW."loja_id", NEW."usuario", NEW."nome", NEW."papel", NEW."ativo", NEW."senha_hash", NEW."senha_provisoria", NEW."criado_em", NEW."permissoes")
       IS NOT DISTINCT FROM
       (OLD."id", OLD."loja_id", OLD."usuario", OLD."nome", OLD."papel", OLD."ativo", OLD."senha_hash", OLD."senha_provisoria", OLD."criado_em", OLD."permissoes") THEN
      RETURN NEW;
    END IF;
    IF ator_id IS NULL THEN
      RAISE EXCEPTION 'usuarios: alteração sem ninguém logado' USING ERRCODE = '42501';
    END IF;
    -- trocar a própria senha
    IF NEW."id" = ator_id
       AND (NEW."loja_id", NEW."usuario", NEW."nome", NEW."papel", NEW."ativo", NEW."criado_em", NEW."permissoes")
           IS NOT DISTINCT FROM (OLD."loja_id", OLD."usuario", OLD."nome", OLD."papel", OLD."ativo", OLD."criado_em", OLD."permissoes") THEN
      RETURN NEW;
    END IF;
  END IF;

  IF ator_id IS NULL THEN
    RAISE EXCEPTION 'usuarios: cadastro sem ninguém logado' USING ERRCODE = '42501';
  END IF;
  -- RLS: só enxerga quem é da mesma loja; o super_admin (sem loja) é reconhecido pela função
  SELECT "papel"::text INTO ator_papel FROM "usuarios" WHERE "id" = ator_id AND "ativo";
  IF ator_papel IS NULL AND EXISTS (SELECT 1 FROM "app_suporte_por_id"(ator_id) s WHERE s."ativo") THEN
    ator_papel := 'super_admin';
  END IF;
  IF ator_papel IS NULL OR ator_papel NOT IN ('dono', 'administrador', 'super_admin') THEN
    RAISE EXCEPTION 'usuarios: só o Dono, o Administrador ou o suporte cadastra e altera usuários' USING ERRCODE = '42501';
  END IF;
  -- Dono e Administrador: só o suporte (Adm. Sup) cadastra ou dá esses papéis
  IF (TG_OP = 'INSERT' AND NEW."papel"::text IN ('dono', 'administrador'))
     OR (TG_OP = 'UPDATE' AND NEW."papel"::text IN ('dono', 'administrador') AND NEW."papel" IS DISTINCT FROM OLD."papel") THEN
    IF ator_papel <> 'super_admin' THEN
      RAISE EXCEPTION 'usuarios: só o suporte (Adm. Sup) cadastra ou dá o papel de Dono ou de Administrador' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."papel"::text = 'dono' AND ator_papel NOT IN ('dono', 'super_admin') THEN
    RAISE EXCEPTION 'usuarios: só um Dono mexe em outro Dono' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."id" = ator_id
     AND (NEW."ativo" IS DISTINCT FROM OLD."ativo" OR NEW."papel" IS DISTINCT FROM OLD."papel" OR NEW."permissoes" IS DISTINCT FROM OLD."permissoes") THEN
    RAISE EXCEPTION 'usuarios: ninguém desativa nem muda o próprio papel ou as próprias funções' USING ERRCODE = '42501';
  END IF;
  IF NEW."papel"::text = 'personalizado' AND cardinality(NEW."permissoes") = 0 THEN
    RAISE EXCEPTION 'usuarios: o Personalizado precisa de pelo menos uma função' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."papel"::text = 'dono' AND OLD."ativo" AND (NEW."papel"::text <> 'dono' OR NOT NEW."ativo") THEN
    -- mesma trava que a API usa: duas pessoas tirando Donos ao mesmo tempo não deixam a loja sem nenhum
    PERFORM pg_advisory_xact_lock(hashtextextended('usuarios:' || OLD."loja_id"::text, 0));
    IF NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "loja_id" = OLD."loja_id" AND "id" <> OLD."id" AND "papel" = 'dono' AND "ativo") THEN
      RAISE EXCEPTION 'usuarios: a loja precisa de pelo menos um Dono ativo' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
