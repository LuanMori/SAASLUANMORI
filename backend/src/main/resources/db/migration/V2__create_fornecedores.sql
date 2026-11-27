-- V2__create_fornecedores.sql — o cadastro de fornecedores de cada loja (Fase 3, módulo de referência).
--
-- No sistema antigo o fornecedor só existia na demonstração (legacy/core/src/fornecedor.ts:1-102;
-- legacy/web/src/demo/apiLocal.ts:3164-3223); as regras estão em docs/migracao/03-REGRAS-DE-NEGOCIO.md §8:
--   - nome obrigatório (2 a 120); CNPJ ou CPF e telefone opcionais, guardados só com os dígitos;
--   - o mesmo documento não se repete na loja (entre todos, ativos e desativados);
--   - não se apaga: desativar tira o fornecedor das listas de escolha, e o que já aponta para ele continua.
-- As policies passam a ter o nome do template do prompt mestre (<tabela>_tenant_isolation), também as da fundação.

-- =====================================================================
-- 1) estrutura
-- =====================================================================
CREATE TABLE "fornecedores" (
    "id"             UUID           NOT NULL,
    "tenant_id"      UUID           NOT NULL,
    "nome"           VARCHAR(120)   NOT NULL,
    "documento"      VARCHAR(14),
    "telefone"       VARCHAR(11),
    "contato"        VARCHAR(80),
    "observacao"     VARCHAR(300),
    "ativo"          BOOLEAN        NOT NULL DEFAULT true,
    "criado_em"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por"     UUID,
    "atualizado_em"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" UUID,
    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fornecedores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "lojas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- os tamanhos do nome, do contato e da observação são conferidos pela regra (em unidades UTF-16, como o
    -- JavaScript conta: "😀" tem tamanho 2); o VARCHAR do banco conta caracteres e nunca fica abaixo disso
    -- CNPJ (14) ou CPF (11), só os dígitos (fornecedor.ts:15,77-83)
    CONSTRAINT "fornecedores_documento_formato" CHECK ("documento" ~ '^([0-9]{11}|[0-9]{14})$'),
    -- com DDD, 10 ou 11 dígitos (fornecedor.ts:17,84-89)
    CONSTRAINT "fornecedores_telefone_formato" CHECK ("telefone" ~ '^[0-9]{10,11}$')
);
-- o mesmo documento não se repete na loja (conferirDocumentoUnico, fornecedor.ts:95-102); a tela confere antes, sob a
-- trava da loja, para dizer de quem é o documento
CREATE UNIQUE INDEX "fornecedores_tenant_id_documento_key" ON "fornecedores" ("tenant_id", "documento") WHERE "documento" IS NOT NULL;
CREATE INDEX "fornecedores_tenant_id_criado_em_idx" ON "fornecedores" ("tenant_id", "criado_em");

-- =====================================================================
-- 2) isolamento por loja (RLS forçado) — a policy da regra 1.5 do prompt mestre
-- =====================================================================
ALTER TABLE "fornecedores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fornecedores" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fornecedores_tenant_isolation" ON "fornecedores"
  FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id')::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id')::uuid);

-- o mesmo nome para as policies da fundação (V1)
ALTER POLICY "usuarios_isolamento_loja" ON "usuarios" RENAME TO "usuarios_tenant_isolation";
ALTER POLICY "sessoes_isolamento_loja" ON "sessoes" RENAME TO "sessoes_tenant_isolation";
ALTER POLICY "auditoria_isolamento_loja" ON "auditoria" RENAME TO "auditoria_tenant_isolation";

-- =====================================================================
-- 3) privilégios mínimos da aplicação (nenhum DELETE: fornecedor não se apaga)
-- =====================================================================
GRANT SELECT, INSERT ON "fornecedores" TO saas_app;
GRANT UPDATE ("nome", "documento", "telefone", "contato", "observacao", "ativo", "atualizado_em", "atualizado_por")
  ON "fornecedores" TO saas_app;
