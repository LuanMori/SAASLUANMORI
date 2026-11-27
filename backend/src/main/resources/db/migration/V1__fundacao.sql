-- V1__fundacao.sql — a fundação do banco (Fase 2 da reconstrução).
--
-- Reproduz o estado final das migrações do sistema antigo (legacy/api/prisma/migrations: 20261111180000,
-- 20261111190000, 20261118120000 e 20261123210000; SQL catalogado em docs/migracao/00-VISAO-GERAL.md §4) para lojas,
-- usuários, sessões e histórico. Os produtos chegam com o módulo Produtos e estoque. Mudanças da reconstrução:
--   - a coluna da loja se chama tenant_id e a loja da transação vem de app.tenant_id, com a policy da regra 1.5 do
--     prompt mestre (decisão T2 de docs/migracao/06-RISCOS-E-DECISOES.md): sem loja definida, a consulta dá erro;
--   - toda tabela tem criado_em, criado_por, atualizado_em e atualizado_por (regra 1.5). No histórico, criado_por é
--     quem fez a ação (NULL = o sistema ou uma tentativa sem ninguém logado);
--   - o Adm. Sup continua numa linha sem loja, lida só por três funções do banco (decisão T3).

-- =====================================================================
-- 1) estrutura
-- =====================================================================
CREATE TYPE "papel" AS ENUM ('super_admin', 'dono', 'administrador', 'vendedor', 'personalizado');

-- Cadastro das lojas (os tenants). Sem RLS: é a lista de lojas; a aplicação só lê.
CREATE TABLE "lojas" (
    "id"             UUID           NOT NULL,
    "nome"           VARCHAR(120)   NOT NULL,
    "subdominio"     VARCHAR(63)    NOT NULL,
    "ativa"          BOOLEAN        NOT NULL DEFAULT true,
    "criado_em"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por"     UUID,
    "atualizado_em"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" UUID,
    CONSTRAINT "lojas_pkey" PRIMARY KEY ("id"),
    -- as mesmas regras de validarSubdominio (legacy/core/src/loja.ts:7-26)
    CONSTRAINT "lojas_subdominio_formato"
      CHECK ("subdominio" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' AND "subdominio" NOT IN ('www', 'app', 'api', 'login', 'admin'))
);
CREATE UNIQUE INDEX "lojas_subdominio_key" ON "lojas" ("subdominio");

-- Quem opera o sistema numa loja. O Adm. Sup (super_admin) é a única linha sem loja.
CREATE TABLE "usuarios" (
    "id"                 UUID           NOT NULL,
    "tenant_id"          UUID,
    "usuario"            VARCHAR(40)    NOT NULL,
    "nome"               VARCHAR(120)   NOT NULL,
    "papel"              "papel"        NOT NULL DEFAULT 'vendedor',
    "permissoes"         TEXT[]         NOT NULL DEFAULT '{}',
    "ativo"              BOOLEAN        NOT NULL DEFAULT true,
    "senha_hash"         VARCHAR(255),
    "senha_provisoria"   BOOLEAN        NOT NULL DEFAULT true,
    "tentativas_erradas" INTEGER        NOT NULL DEFAULT 0,
    "bloqueado_ate"      TIMESTAMPTZ(3),
    "ultimo_acesso_em"   TIMESTAMPTZ(3),
    "criado_em"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por"         UUID,
    "atualizado_em"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por"     UUID,
    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usuarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "lojas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "usuarios_super_admin_sem_loja" CHECK (("papel" = 'super_admin') = ("tenant_id" IS NULL)),
    -- FORMATO_LOGIN (legacy/core/src/usuario.ts:24)
    CONSTRAINT "usuarios_usuario_formato" CHECK ("usuario" ~ '^[a-z0-9][a-z0-9._-]{1,39}$'),
    CONSTRAINT "usuarios_permissoes_so_personalizado" CHECK ("papel" = 'personalizado' OR cardinality("permissoes") = 0),
    CONSTRAINT "usuarios_permissoes_formato" CHECK (cardinality("permissoes") <= 40 AND array_to_string("permissoes", ',') ~ '^[a-z_.,]*$')
);
CREATE UNIQUE INDEX "usuarios_tenant_id_usuario_key" ON "usuarios" ("tenant_id", "usuario");

-- Sessão de login: o segredo fica só no cookie do navegador; aqui fica o SHA-256 dele.
CREATE TABLE "sessoes" (
    "id"             UUID           NOT NULL,
    "tenant_id"      UUID           NOT NULL,
    "usuario_id"     UUID           NOT NULL,
    "token_hash"     CHAR(64)       NOT NULL,
    "ultimo_uso_em"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em"      TIMESTAMPTZ(3) NOT NULL,
    "encerrada_em"   TIMESTAMPTZ(3),
    "criado_em"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por"     UUID,
    "atualizado_em"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" UUID,
    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "lojas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sessoes_token_hash_key" ON "sessoes" ("token_hash");
CREATE INDEX "sessoes_tenant_id_usuario_id_idx" ON "sessoes" ("tenant_id", "usuario_id");

-- Histórico (quem fez o quê, em qual loja e quando). Só acrescenta: sem UPDATE nem DELETE para a aplicação.
-- Sem dado pessoal em "detalhes": os nomes vêm de usuarios na hora de mostrar (a exclusão LGPD vale aqui também).
CREATE TABLE "auditoria" (
    "id"             UUID           NOT NULL,
    "tenant_id"      UUID           NOT NULL,
    "acao"           VARCHAR(60)    NOT NULL,
    "alvo_tipo"      VARCHAR(40),
    "alvo_id"        UUID,
    "detalhes"       JSONB          NOT NULL DEFAULT '{}',
    "criado_em"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por"     UUID,
    "atualizado_em"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" UUID,
    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auditoria_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "lojas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "auditoria_tenant_id_criado_em_idx" ON "auditoria" ("tenant_id", "criado_em" DESC);

-- =====================================================================
-- 2) a role da aplicação
-- =====================================================================
-- NOLOGIN e sem senha aqui: segredo nunca entra em migração. A senha e o LOGIN vêm do ambiente
-- (callback do Flyway DefinirSenhaDaRoleApp ou o comando senha-app). NOBYPASSRLS + não ser dona das tabelas:
-- o RLS sempre vale para ela.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
    CREATE ROLE saas_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

-- =====================================================================
-- 3) isolamento por loja (RLS forçado) — a policy da regra 1.5 do prompt mestre
-- =====================================================================
-- FORCE: vale até para a role dona das tabelas (só superusuário escapa, e a aplicação nunca conecta assim).
-- A loja da transação: SELECT set_config('app.tenant_id', <uuid>, true) (o mesmo que SET LOCAL).
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" FORCE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_isolamento_loja" ON "usuarios"
  FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "sessoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessoes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessoes_isolamento_loja" ON "sessoes"
  FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id')::uuid);

ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auditoria" FORCE ROW LEVEL SECURITY;
CREATE POLICY "auditoria_isolamento_loja" ON "auditoria"
  FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id')::uuid);

-- O Adm. Sup para a aplicação: só o necessário, nada de listar. As funções pertencem a quem roda as migrações. Num
-- banco gerenciado essa role é dona das tabelas, mas não é superusuário: com FORCE ela também passa pelo RLS. Esta
-- policy deixa SÓ essa role (nunca a saas_app nem PUBLIC) ver e gravar as linhas do super_admin, para as funções
-- abaixo e para o comando suporte.
DO $$
BEGIN
  EXECUTE format(
    'CREATE POLICY "usuarios_suporte_dono_do_schema" ON "usuarios" FOR ALL TO %I USING ("tenant_id" IS NULL AND "papel" = %L) WITH CHECK ("tenant_id" IS NULL AND "papel" = %L)',
    current_user, 'super_admin', 'super_admin');
END
$$;

CREATE FUNCTION "app_suporte_para_login"(p_login text)
  RETURNS TABLE ("id" uuid, "nome" varchar, "usuario" varchar, "ativo" boolean, "senha_hash" varchar, "senha_provisoria" boolean, "tentativas_erradas" integer, "bloqueado_ate" timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT u."id", u."nome", u."usuario", u."ativo", u."senha_hash", u."senha_provisoria", u."tentativas_erradas", u."bloqueado_ate"
      FROM public."usuarios" u
     WHERE u."tenant_id" IS NULL AND u."papel" = 'super_admin' AND u."usuario" = p_login
  $$;

CREATE FUNCTION "app_suporte_por_id"(p_id uuid)
  RETURNS TABLE ("id" uuid, "nome" varchar, "usuario" varchar, "ativo" boolean, "senha_provisoria" boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT u."id", u."nome", u."usuario", u."ativo", u."senha_provisoria"
      FROM public."usuarios" u
     WHERE u."id" = p_id AND u."tenant_id" IS NULL AND u."papel" = 'super_admin'
  $$;

CREATE FUNCTION "app_suporte_registrar"(p_id uuid, p_tentativas integer, p_bloqueado_ate timestamptz, p_ultimo_acesso timestamptz)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    UPDATE public."usuarios"
       SET "tentativas_erradas" = GREATEST(0, LEAST(p_tentativas, 1000)),
           "bloqueado_ate" = p_bloqueado_ate,
           "ultimo_acesso_em" = COALESCE(p_ultimo_acesso, "ultimo_acesso_em")
     WHERE "id" = p_id AND "tenant_id" IS NULL AND "papel" = 'super_admin'
  $$;

REVOKE ALL ON FUNCTION "app_suporte_para_login"(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_suporte_por_id"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_suporte_registrar"(uuid, integer, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app_suporte_para_login"(text) TO saas_app;
GRANT EXECUTE ON FUNCTION "app_suporte_por_id"(uuid) TO saas_app;
GRANT EXECUTE ON FUNCTION "app_suporte_registrar"(uuid, integer, timestamptz, timestamptz) TO saas_app;

-- =====================================================================
-- 4) privilégios mínimos da aplicação (nenhum DELETE)
-- =====================================================================
GRANT USAGE ON SCHEMA public TO saas_app;
GRANT SELECT ON "lojas" TO saas_app;
-- usuarios: cadastra e altera só as colunas que as telas e o login mudam (id, loja e criação nunca mudam)
GRANT SELECT, INSERT ON "usuarios" TO saas_app;
GRANT UPDATE ("usuario", "nome", "papel", "permissoes", "ativo", "senha_hash", "senha_provisoria", "tentativas_erradas",
              "bloqueado_ate", "ultimo_acesso_em", "atualizado_em", "atualizado_por")
  ON "usuarios" TO saas_app;
-- sessoes: cria, lê e encerra; não muda dono, loja nem validade
GRANT SELECT, INSERT ON "sessoes" TO saas_app;
GRANT UPDATE ("ultimo_uso_em", "encerrada_em", "atualizado_em", "atualizado_por") ON "sessoes" TO saas_app;
-- auditoria: só acrescenta e lê (o histórico não se apaga)
GRANT SELECT, INSERT ON "auditoria" TO saas_app;

-- =====================================================================
-- 5) trava de usuários no banco (defesa em profundidade sobre a tela Usuários)
-- =====================================================================
-- Vale só para a role da aplicação; os comandos de administração (dona do schema) passam. A aplicação informa quem
-- está logado com set_config('app.usuario_id', <uuid>, true), na mesma transação.
CREATE FUNCTION "usuarios_trava_api"() RETURNS trigger
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
    IF (NEW."id", NEW."tenant_id", NEW."usuario", NEW."nome", NEW."papel", NEW."ativo", NEW."senha_hash", NEW."senha_provisoria", NEW."criado_em", NEW."permissoes")
       IS NOT DISTINCT FROM
       (OLD."id", OLD."tenant_id", OLD."usuario", OLD."nome", OLD."papel", OLD."ativo", OLD."senha_hash", OLD."senha_provisoria", OLD."criado_em", OLD."permissoes") THEN
      RETURN NEW;
    END IF;
    IF ator_id IS NULL THEN
      RAISE EXCEPTION 'usuarios: alteração sem ninguém logado' USING ERRCODE = '42501';
    END IF;
    -- trocar a própria senha
    IF NEW."id" = ator_id
       AND (NEW."tenant_id", NEW."usuario", NEW."nome", NEW."papel", NEW."ativo", NEW."criado_em", NEW."permissoes")
           IS NOT DISTINCT FROM (OLD."tenant_id", OLD."usuario", OLD."nome", OLD."papel", OLD."ativo", OLD."criado_em", OLD."permissoes") THEN
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
    -- a mesma trava que a aplicação usa: duas pessoas tirando Donos ao mesmo tempo não deixam a loja sem nenhum
    PERFORM pg_advisory_xact_lock(hashtextextended('usuarios:' || OLD."tenant_id"::text, 0));
    IF NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "tenant_id" = OLD."tenant_id" AND "id" <> OLD."id" AND "papel" = 'dono' AND "ativo") THEN
      RAISE EXCEPTION 'usuarios: a loja precisa de pelo menos um Dono ativo' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "usuarios_trava_api"
  BEFORE INSERT OR UPDATE ON "usuarios"
  FOR EACH ROW EXECUTE FUNCTION "usuarios_trava_api"();
