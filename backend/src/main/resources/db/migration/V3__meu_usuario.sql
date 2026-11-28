-- V3__meu_usuario.sql — a aba "Meu usuário" (Fase 4): a foto do perfil e as entradas e saídas da pessoa.
--
-- No sistema antigo, só a demonstração tinha a foto e as entradas e saídas (legacy/core/src/perfil.ts:1-98;
-- legacy/web/src/demo/usuariosDemo.ts:583-606); as regras estão em docs/migracao/03-REGRAS-DE-NEGOCIO.md §4:
--   - a foto é uma imagem PNG, JPEG ou WebP em data URL (base64), com até 150.000 caracteres, e cada pessoa troca só a
--     própria (a do Adm. Sup, que não tem loja, passa pelas funções dele, como o login);
--   - as entradas e saídas saem do histórico (sessao.entrou e sessao.saiu de quem fez), da mais recente para trás.

-- =====================================================================
-- 1) a foto do perfil
-- =====================================================================
ALTER TABLE "usuarios" ADD COLUMN "foto" TEXT;
-- lerFotoDoPerfil (perfil.ts:16,24-29): o formato e o tamanho (o data URL é só ASCII: o tamanho do JavaScript é o
-- mesmo número de caracteres)
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_foto_formato"
  CHECK ("foto" ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' AND char_length("foto") <= 150000);
GRANT UPDATE ("foto") ON "usuarios" TO saas_app;

-- O Adm. Sup não tem loja e a aplicação não enxerga a linha dele (decisão T3): ler e trocar a foto dele só por estas
-- duas funções, como as outras três do V1.
CREATE FUNCTION "app_suporte_foto"(p_id uuid)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT u."foto"
      FROM public."usuarios" u
     WHERE u."id" = p_id AND u."tenant_id" IS NULL AND u."papel" = 'super_admin'
  $$;

CREATE FUNCTION "app_suporte_definir_foto"(p_id uuid, p_foto text)
  RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    WITH trocada AS (
      UPDATE public."usuarios"
         SET "foto" = p_foto, "atualizado_em" = CURRENT_TIMESTAMP, "atualizado_por" = p_id
       WHERE "id" = p_id AND "tenant_id" IS NULL AND "papel" = 'super_admin'
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM trocada)
  $$;

REVOKE ALL ON FUNCTION "app_suporte_foto"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_suporte_definir_foto"(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app_suporte_foto"(uuid) TO saas_app;
GRANT EXECUTE ON FUNCTION "app_suporte_definir_foto"(uuid, text) TO saas_app;

-- =====================================================================
-- 2) as entradas e saídas: as últimas da pessoa, sem varrer o histórico da loja inteiro
-- =====================================================================
CREATE INDEX "auditoria_sessoes_da_pessoa_idx" ON "auditoria" ("tenant_id", "criado_por", "criado_em" DESC, "id" DESC)
  WHERE "acao" IN ('sessao.entrou', 'sessao.saiu');
