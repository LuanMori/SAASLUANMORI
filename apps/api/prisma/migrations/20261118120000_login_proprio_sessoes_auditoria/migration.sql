-- apps/api/prisma/migrations/20261118120000_login_proprio_sessoes_auditoria/migration.sql
-- Revisão de 18/11/2026 (decisão do Luan: login próprio, sem Auth0; o Dono cadastra a equipe):
--   1. lojas: a loja é achada pelo SUBDOMÍNIO (sai o org_id do Auth0);
--   2. usuarios: login (usuário) e senha próprios, senha provisória, bloqueio por senhas erradas;
--      sai o e-mail (nunca foi usado: dado pessoal só quando precisar, LGPD);
--   3. sessoes: sessão de login (o segredo fica só no cookie HttpOnly; aqui, o SHA-256 dele);
--   4. auditoria: quem fez o quê, em qual loja e quando (só acrescenta, ninguém apaga);
--   5. RLS com FORCE nas tabelas novas + privilégios mínimos da role saas_app;
--   6. trava no banco: mesmo que a API erre, ela não promove ninguém a Dono sem ser Dono, não deixa
--      a loja sem Dono ativo e ninguém desativa nem muda o próprio papel.
-- Reverter: down.sql desta pasta (via `npm run db:migrate:down -w @saas/api -- --confirmar`).

-- =====================================================================
-- 1) lojas: subdomínio no lugar do org_id do Auth0
-- =====================================================================
ALTER TABLE "lojas" ADD COLUMN "subdominio" VARCHAR(63);

-- Lojas que já existem: subdomínio a partir do nome ("Loja A" -> "lojaa"), sem acento, só letras e
-- números. Nome repetido ganha número no fim; nome reservado ou vazio vira "loja...".
WITH base AS (
  SELECT "id",
         left(regexp_replace(translate(lower("nome"), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '', 'g'), 50) AS s,
         "criado_em"
    FROM "lojas"
), ajustado AS (
  SELECT "id", CASE WHEN s = '' OR s IN ('www', 'app', 'api', 'login', 'admin') THEN 'loja' || s ELSE s END AS s, "criado_em" FROM base
), numerado AS (
  SELECT "id", s, row_number() OVER (PARTITION BY s ORDER BY "criado_em", "id") AS n FROM ajustado
)
UPDATE "lojas" AS l
   SET "subdominio" = CASE WHEN numerado.n = 1 THEN numerado.s ELSE numerado.s || numerado.n END
  FROM numerado
 WHERE l."id" = numerado."id";

ALTER TABLE "lojas" ALTER COLUMN "subdominio" SET NOT NULL;
-- Mesmas regras de @saas/core (loja.ts: validarSubdominio).
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_subdominio_formato"
  CHECK ("subdominio" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' AND "subdominio" NOT IN ('www', 'app', 'api', 'login', 'admin'));

-- DropIndex
DROP INDEX "lojas_auth0_org_id_key";
ALTER TABLE "lojas" DROP COLUMN "auth0_org_id";

-- CreateIndex
CREATE UNIQUE INDEX "lojas_subdominio_key" ON "lojas"("subdominio");

-- =====================================================================
-- 2) usuarios: login e senha próprios
-- =====================================================================
ALTER TABLE "usuarios"
  ADD COLUMN "usuario" VARCHAR(40),
  ADD COLUMN "senha_hash" VARCHAR(255),
  ADD COLUMN "senha_provisoria" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "tentativas_erradas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bloqueado_ate" TIMESTAMPTZ(3),
  ADD COLUMN "ultimo_acesso_em" TIMESTAMPTZ(3);

-- No RDS quem roda a migration é dono das tabelas mas não superusuário: com FORCE RLS ele não
-- enxergaria as linhas para preencher. Desliga o FORCE só para o dono, só durante esta migration
-- (a role saas_app continua sob RLS: ENABLE continua ligado). O FORCE volta no fim do arquivo.
ALTER TABLE "usuarios" NO FORCE ROW LEVEL SECURITY;

-- Quem já existia (cadastrado com o id do Auth0) ganha nome e login provisórios e fica SEM senha:
-- só entra depois que o script db:usuario definir uma (docs/LOGIN.md).
WITH numerado AS (
  SELECT "id",
         row_number() OVER (PARTITION BY "loja_id" ORDER BY "criado_em", "id") AS n,
         left(regexp_replace(translate(lower(coalesce("nome", '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '', 'g'), 30) AS s
    FROM "usuarios"
)
UPDATE "usuarios" AS u
   SET "nome" = coalesce(nullif(trim(u."nome"), ''), 'Pessoa ' || numerado.n),
       "usuario" = CASE WHEN length(numerado.s) >= 2 THEN numerado.s || numerado.n ELSE 'pessoa' || numerado.n END
  FROM numerado
 WHERE u."id" = numerado."id";

ALTER TABLE "usuarios" ALTER COLUMN "usuario" SET NOT NULL;
ALTER TABLE "usuarios" ALTER COLUMN "nome" SET NOT NULL;
-- Mesmas regras de @saas/core (FORMATO_LOGIN).
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_usuario_formato" CHECK ("usuario" ~ '^[a-z0-9][a-z0-9._-]{1,39}$');

-- DropIndex
DROP INDEX "usuarios_loja_id_auth0_sub_key";
ALTER TABLE "usuarios" DROP COLUMN "auth0_sub", DROP COLUMN "email";

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_loja_id_usuario_key" ON "usuarios"("loja_id", "usuario");

ALTER TABLE "usuarios" FORCE ROW LEVEL SECURITY;

-- =====================================================================
-- 3) sessoes
-- =====================================================================
-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "encerrada_em" TIMESTAMPTZ(3),

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_token_hash_key" ON "sessoes"("token_hash");

-- CreateIndex
CREATE INDEX "sessoes_loja_id_usuario_id_idx" ON "sessoes"("loja_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- 4) auditoria
-- =====================================================================
-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" VARCHAR(60) NOT NULL,
    "alvo_tipo" VARCHAR(40),
    "alvo_id" UUID,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_loja_id_criado_em_idx" ON "auditoria"("loja_id", "criado_em" DESC);

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- 5) Isolamento por loja (RLS com FORCE) e privilégios mínimos
-- =====================================================================
ALTER TABLE "sessoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessoes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessoes_isolamento_loja" ON "sessoes"
  FOR ALL
  USING ("loja_id" = "app_loja_atual"())
  WITH CHECK ("loja_id" = "app_loja_atual"());

ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auditoria" FORCE ROW LEVEL SECURITY;
CREATE POLICY "auditoria_isolamento_loja" ON "auditoria"
  FOR ALL
  USING ("loja_id" = "app_loja_atual"())
  WITH CHECK ("loja_id" = "app_loja_atual"());

-- usuarios: a API passa a cadastrar e alterar (tela Usuários). UPDATE só nas colunas que a tela e o
-- login mudam: id, loja e data de cadastro nunca mudam. Quem pode o quê: trava do item 6 + API.
GRANT INSERT ON "usuarios" TO saas_app;
GRANT UPDATE ("usuario", "nome", "papel", "ativo", "senha_hash", "senha_provisoria", "tentativas_erradas", "bloqueado_ate", "ultimo_acesso_em", "atualizado_em")
  ON "usuarios" TO saas_app;
-- sessoes: cria, lê e encerra; não muda dono, loja nem validade.
GRANT SELECT, INSERT ON "sessoes" TO saas_app;
GRANT UPDATE ("ultimo_uso_em", "encerrada_em") ON "sessoes" TO saas_app;
-- auditoria: só acrescenta e lê. Sem UPDATE e sem DELETE: o histórico não se apaga pela API.
GRANT SELECT, INSERT ON "auditoria" TO saas_app;

-- =====================================================================
-- 6) Trava de usuários no banco (defesa em profundidade)
-- =====================================================================
-- Vale só para a role da API (saas_app); scripts de administração (dono do schema) passam.
-- A API informa quem está logado com set_config('app.usuario_id', <uuid>, true), na mesma transação.
CREATE FUNCTION "usuarios_trava_api"() RETURNS trigger
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

CREATE TRIGGER "usuarios_trava_api"
  BEFORE INSERT OR UPDATE ON "usuarios"
  FOR EACH ROW EXECUTE FUNCTION "usuarios_trava_api"();
