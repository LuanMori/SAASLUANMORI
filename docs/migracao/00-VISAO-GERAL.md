# 00 — Visão geral (manual de reconstrução)

Fase 1 da reconstrução (`docs/migracao/PROMPT-MESTRE.md`). O que é o sistema, como o antigo era montado, como o novo
vai ser, e o SQL exato do isolamento por loja que a reconstrução precisa manter.

## 1. O sistema

- SaaS multiempresa de gestão de varejo (`legacy/raiz/README.md:1`): Frente de caixa (PDV), Caixa do dia, Produtos e
  estoque, Compras, Clientes (fiado, fidelidade, vale-troca), Financeiro, Relatórios, Usuários, Dados e backup, Meu
  usuário e as ferramentas do suporte. Cada módulo segue o formato do DaniPets V9.3.3, a referência funcional do Luan
  (`legacy/web/src/painel/pendencias.ts:2`; `legacy/web/src/painel/TelaCaixaDoDia.tsx:2`; regras em
  `03-REGRAS-DE-NEGOCIO.md`).
- **Várias lojas no mesmo sistema**, cada uma no seu endereço: `<loja>.<domínio base>` (03 §5.1). Os dados de uma loja
  nunca aparecem para outra (§4).
- **Usuários por loja**, com cinco papéis — Adm. Sup (o usuário mestre do suporte, em todas as lojas e invisível nelas),
  Dono, Administrador, Vendedor e Personalizado — e uma matriz única de permissões (`05-MATRIZ-PERMISSOES.md`).
- Nome e marca ainda provisórios: "Nome da empresa" (`legacy/web/src/marca.ts:1-24`); "Sistema Padrão" é só o nome
  provisório do repositório (`legacy/raiz/README.md:3-4`).

## 2. O sistema antigo (`legacy/`)

Monorepo de workspaces do npm, Node 22 ou mais novo (`legacy/raiz/package.json`):

| Parte | O que é | Versões | Onde |
|---|---|---|---|
| `core` | as regras puras (validação, contas, mensagens), usadas pela tela e pelo servidor | TypeScript 5.9.3, Vitest 5.1.0, tsup 9.0.0 | `legacy/core/src` (33 arquivos, 8694 linhas) |
| `api` | o servidor: NestJS + Prisma + PostgreSQL com RLS | NestJS 12.4.2, Prisma 7.10.1 (adapter pg), pg 8.23.1, helmet 8.3.0, Jest 30.5.2 | `legacy/api/src`, migrações em `legacy/api/prisma/migrations` |
| `web` | a tela: React 19.3.1 + Vite 8.3.8 (uma página só) | React 19.3.1, Vite 8.3.8, Vitest 5.1.0, Testing Library | `legacy/web/src` |
| demonstração | a mesma tela com uma API que guarda tudo no navegador (`localStorage`), num arquivo HTML só | — | `legacy/web/src/demo`, gerada em `legacy/demo/sistema-padrao-demo.html` |

- **Produção antiga** (`legacy/raiz/docker-compose.prod.yml`): `db` (postgres:16-alpine, UTF-8, ICU `pt-BR`), `migracao`
  (aplica as migrações como dono do schema), `api` (conecta como `saas_app`) e `web` (nginx: a tela e o `/api` repassado
  para o servidor, com os cabeçalhos de segurança).
- **O que existia no servidor**: só login e sessão, usuários, produtos (cadastro básico) e histórico; todo o resto
  existia só na demonstração (`legacy/raiz/README.md:10-13`; `02-MAPA-DE-FUNCIONALIDADES.md` §2).
- **Caminho de um pedido no servidor antigo** (`legacy/raiz/README.md:30-48`): navegador → cookie HttpOnly da sessão →
  nginx → `/api` → a API confere a sessão no banco (loja ativa, pessoa ativa, 30 min sem uso encerra) → a loja vem só
  da sessão, nunca do corpo, da URL ou de cabeçalho (campo desconhecido no corpo dá 400) → `BEGIN;
  set_config('app.loja_id', …, true); …; COMMIT` → Postgres com RLS (`loja_id = app_loja_atual()`), que vale mesmo se a
  consulta esquecer o filtro.
- **Tabelas do servidor antigo** (`legacy/api/prisma/schema.prisma:1-150`): `lojas` (id, nome, subdomínio único, ativa,
  datas), `usuarios` (loja, login único por loja, nome, papel, permissões do Personalizado, ativo, hash da senha, senha
  provisória, tentativas erradas, bloqueado até, último acesso, datas), `sessoes` (loja, usuário, hash do token,
  criada, último uso, expira, encerrada), `auditoria` (loja, usuário, ação, alvo, detalhes em JSON, criado em; índice por
  loja e data decrescente) e `produtos` (loja, código interno e código de barras únicos por loja, nome, preço em centavos,
  ativo, datas). Ids UUID v7.
- **Dados da demonstração**: uma chave do `localStorage` por assunto, cada uma com as listas separadas por loja
  (`legacy/web/src/demo/apiLocal.ts:296-349`; `legacy/web/src/demo/armazenamento.ts:1-11`). São esses assuntos que a
  reconstrução transforma em tabelas (os mesmos da cópia de segurança, 03 §18.1).

## 3. Dívida técnica do sistema antigo (o que a reconstrução resolve)

1. A maior parte do sistema funcionava só na demonstração (no navegador); o servidor tinha só usuários, produtos básicos
   e histórico (`legacy/web/src/api.ts:1014-1042`). A reconstrução põe tudo no servidor.
2. Relatórios e planilhas do Excel eram montados no navegador, lendo tudo da loja, e o histórico era lido até 2000
   linhas (`legacy/web/src/relatorios/planilhas.ts:91-137`). Na reconstrução, o servidor monta.
3. As autorizações com senha (desconto, cancelamento, liberações do Dono) ficavam só na memória da aba
   (`legacy/web/src/demo/apiLocal.ts:570-572`). Na reconstrução, ficam no banco, com expiração e uso único.
4. A demonstração guardava só as últimas 2000 linhas do histórico por loja (`legacy/web/src/demo/usuariosDemo.ts:65,232`),
   contra a regra do core de nunca apagar (`legacy/core/src/auditoria.ts:4`).
5. A conferência da cópia de segurança era um SHA-256 sem chave; o próprio core previa uma chave do servidor
   (`legacy/core/src/copiaDaLoja.ts:10-12`).
6. Textos e regras prontas mas desligadas (pendências 6, 7, 10, 11 e 12; `legacy/web/src/painel/regrasPendencias.ts:1-19`).
7. Na `main`, uma tentativa anterior de Java (PR #2, com Auth0, `apps/java`, `apps/web/html`, `docs/MIGRACAO-JAVA.md`),
   divergente desde `c541411` (12/11/2026), que não segue o prompt mestre (`07-STATUS-MODULOS.md`, pendências).

## 4. Isolamento por loja no banco antigo (SQL exato)

O servidor conectava com a role `saas_app`, que **não** é superusuário, **não** tem BYPASSRLS e **não** é dona das tabelas;
toda tabela com `loja_id` tem RLS ligado **e forçado** e uma policy por loja. A loja da transação vem de
`set_config('app.loja_id', <uuid>, true)` (vale só na transação). Sem loja definida, nenhuma linha passa.

**Role e função da loja atual** (`legacy/api/prisma/migrations/20261111180000_fase_menos_1_esqueleto/migration.sql:79-96`):
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
    CREATE ROLE saas_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

CREATE FUNCTION "app_loja_atual"() RETURNS UUID
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.loja_id', true), '')::uuid $$;

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_super_admin_sem_loja"
  CHECK (("papel" = 'super_admin') = ("loja_id" IS NULL));
```

**Policies por loja** (`20261111180000_fase_menos_1_esqueleto/migration.sql:101-115`;
`20261118120000_login_proprio_sessoes_auditoria/migration.sql:146-158`):
```sql
ALTER TABLE "produtos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produtos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "produtos_isolamento_loja" ON "produtos"
  FOR ALL
  USING ("loja_id" = "app_loja_atual"())
  WITH CHECK ("loja_id" = "app_loja_atual"());

ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" FORCE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_isolamento_loja" ON "usuarios"
  FOR ALL
  USING ("loja_id" = "app_loja_atual"())
  WITH CHECK ("loja_id" = "app_loja_atual"());

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
```

**Adm. Sup (linha sem loja)** — a `saas_app` não enxerga a linha dele; uma policy só para a role dona do schema e três
funções `SECURITY DEFINER` estreitas (`20261123210000_adm_sup_e_personalizado/migration.sql:23-69`):
```sql
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
```

**Privilégios mínimos da `saas_app`** (`20261111180000…/migration.sql:118-122`; `20261111190000…/migration.sql:12`;
`20261118120000…/migration.sql:162-169`; `20261123210000…/migration.sql:21`): `USAGE` no schema; `SELECT` em `lojas`;
em `usuarios`, `SELECT`, `INSERT` e `UPDATE` só das colunas `usuario`, `nome`, `papel`, `ativo`, `senha_hash`,
`senha_provisoria`, `tentativas_erradas`, `bloqueado_ate`, `ultimo_acesso_em`, `atualizado_em` e `permissoes`; em
`produtos`, `SELECT`, `INSERT`, `UPDATE`; em `sessoes`, `SELECT`, `INSERT` e `UPDATE` de `ultimo_uso_em` e `encerrada_em`;
em `auditoria`, só `SELECT` e `INSERT` (o histórico não se apaga). Nenhum `DELETE`.

**Trava de usuários no banco** (trigger `usuarios_trava_api`, defesa em profundidade sobre a tela Usuários):
`20261118120000…/migration.sql:171-234`, refeita em `20261123210000…/migration.sql:71-138` (regras em 03 §3.4).

**Outras regras no banco** (`20261111190000…/migration.sql:60-70`; `20261118120000…/migration.sql:79-80`;
`20261123210000…/migration.sql:14-20`): código interno só dígitos (1 a 18), código de barras só dígitos (1 a 64), preço >
0, login no formato `^[a-z0-9][a-z0-9._-]{1,39}$`, permissões só no Personalizado (até 40, `^[a-z_.,]*$`).

**Migração que precisa ler os dados**: no banco gerenciado, quem aplica a migração é dono das tabelas mas não é
superusuário; com FORCE ele também fica preso ao RLS. A migração desliga o FORCE só para o dono, só durante ela, e liga de
novo no fim (`20261111190000…/migration.sql:18-23,70`; `20261118120000…/migration.sql:58-61,89`).

**Conferência ao subir** (`legacy/api/src/banco/conferencia.ts:1-63`): o servidor se recusa a subir se a role da conexão
(ou qualquer role de que ela faça parte, mesmo com NOINHERIT) é superusuário ou tem BYPASSRLS; se ela é dona de alguma
tabela (ou faz parte da role dona); se alguma tabela com `loja_id` está sem RLS ligado e forçado ou sem policy; se não
acha nenhuma tabela de loja; se o banco ou a conexão não estão em UTF-8. As mensagens citam só nomes de roles e de
tabelas, nunca senha nem endereço de conexão (`:9,44-60`).

**Na reconstrução** (03 §2.2): coluna `tenant_id` em toda tabela de loja, `SET LOCAL app.tenant_id` em cada transação, as
mesmas policies (ENABLE + FORCE + `USING`/`WITH CHECK` pela loja atual) em todas as tabelas novas, a role da aplicação
sem superusuário, sem BYPASSRLS e sem ser dona, os mesmos `GRANT`s mínimos (histórico só acrescenta) e a mesma
conferência ao subir. As tabelas novas (estoque, compras, vendas, caixa, clientes, fidelidade, vales, financeiro,
configuração da loja, comunicados, visões, erros) entram todas nessa regra.

## 5. O sistema novo (`backend/`)

| Item | Escolha | Fonte |
|---|---|---|
| Linguagem e plataforma | Java 21, Spring Boot 3.3.13 | `backend/pom.xml`; `PROMPT-MESTRE.md` §2.8 |
| Telas | Thymeleaf (HTML no servidor) + HTMX 1.9.12 (WebJar), JavaScript mínimo | idem |
| Segurança | Spring Security com login próprio, codificador de senha scrypt no formato antigo (Bouncy Castle 1.87), sessão em cookie | idem; 03 §1 |
| Dados | Spring Data JPA, Flyway (com `flyway-database-postgresql`), PostgreSQL 15 ou mais novo | idem |
| Validação | Bean Validation, mais as regras de 03 nos serviços | idem |
| Testes | JUnit 5, Spring Boot Test, Spring Security Test; ponta a ponta com Playwright (Fase 5) | idem |
| Pacotes | `com.saasluanmori.config`, `domain`, `repository`, `service`, `web` | `backend/src/main/java/com/saasluanmori/*/package-info.java` |
| Visual | `static/css/app.css` reproduzindo `legacy/web/src/estilos.css` regra por regra | `04-DESIGN-SYSTEM.md` §0 |

## 6. Documentos desta pasta

| Documento | O que tem |
|---|---|
| `PROMPT-MESTRE.md` | o contrato da reconstrução |
| `00-VISAO-GERAL.md` | este |
| `01-MAPA-DE-TELAS.md` | cada tela: partes, campos, botões, mensagens, navegação, atalhos |
| `02-MAPA-DE-FUNCIONALIDADES.md` | o que cada tela lê e grava; servidor antigo × demonstração |
| `03-REGRAS-DE-NEGOCIO.md` | todas as regras, mensagens e casos-limite, com `arquivo:linha` |
| `04-DESIGN-SYSTEM.md` | cores, tipografia, medidas, breakpoints, estados, componentes, assets |
| `05-MATRIZ-PERMISSOES.md` | papéis, permissões, mensagens de recusa, Personalizado, barra lateral |
| `06-RISCOS-E-DECISOES.md` | riscos e decisões da reconstrução |
| `07-STATUS-MODULOS.md` | o andamento, módulo por módulo |
