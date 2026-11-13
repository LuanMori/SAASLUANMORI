# Sistema Padrão — SaaS multi-tenant de gestão de varejo

> Nome provisório. Fase atual: **-1 (esqueleto)** — prova que banco + auth + multi-tenant
> funcionam juntos antes de qualquer regra de negócio.

## Estrutura

```
packages/core   @saas/core  regras puras (sem DOM, sem I/O, sem dependência de runtime) — Vitest
apps/api        @saas/api   NestJS 12 + Prisma 7 + PostgreSQL (RLS) + Auth0 — Jest + Supertest
apps/web        @saas/web   React 19 + Vite 8 + TypeScript + Auth0 SPA SDK — Vitest + Testing Library
docs/AUTH0.md               passo a passo do Auth0 (Organizations)
```

## Como o isolamento entre lojas funciona

```
navegador ── token Auth0 (org_id) ──▶ API
                                       │ 1. GuardaAutenticacao valida o JWT (RS256, iss, aud, exp)
                                       │ 2. org_id → loja ativa (tabela lojas)
                                       │ 3. BancoService.comLoja(lojaId):
                                       │      BEGIN; set_config('app.loja_id', lojaId, true); ...; COMMIT
                                       ▼
                                   Postgres (role saas_app, sem BYPASSRLS, não é dona das tabelas)
                                       RLS: loja_id = app_loja_atual()   ← vale mesmo se a query esquecer o filtro
```

- **A loja nunca vem do cliente**: nem corpo, nem URL, nem header. Campos desconhecidos no corpo → 400.
- **Sem `app.loja_id` definido, o banco devolve zero linhas** (falha fechada). Valor inválido → erro.
- `set_config(..., true)` = vale só dentro da transação: não vaza pelo pool de conexões.
- `FORCE ROW LEVEL SECURITY`: nem a role dona das tabelas escapa (só superusuário, que a API nunca usa).

## Demonstração em um arquivo só (sem instalar nada)

Abra **`sistema-padrao-demo.html`** no navegador (dois cliques). É a mesma tela de produtos e as
mesmas regras do `@saas/core` (código interno 0001…, código de barras só números e sem repetir,
preço maior que zero, Enter do leitor vai para o preço), mas **sem servidor**: o login é uma
lista (Loja A/B; Dono, Vendedor ou pessoa não cadastrada, que vê o bloqueio) e os produtos ficam
no `localStorage` do navegador, separados por loja.

Já dá para testar o fluxo de vendas: **Frente de caixa** (leitor de código, código interno ou nome;
forma de pagamento) → **Visão geral** (cards com as vendas de HOJE, que voltam a zero à meia-noite)
→ **Relatórios** (todas as vendas, de todos os dias). Cada venda guarda quem vendeu: sempre a pessoa
que entrou no sistema, nunca um campo da tela. As regras ficam em `packages/core/src/venda.ts`.
O card **Pendências** da Visão geral já existe, mas o que entra nele ainda está **a definir**
(sugestões em `docs/PENDENCIAS.md`); na demonstração, "Usuários de teste" → "Mostrar pendências de exemplo".

Serve para testar telas e regras. **Não testa segurança**: Auth0, RLS e isolamento
de verdade só existem com API + Postgres (abaixo). Para gerar o arquivo de novo depois de mudar
a tela: `npm run build:core && npm run build:demo -w @saas/web`.

## Rodar localmente

### Windows: um clique

Com o Node 22+ instalado e o Docker Desktop aberto, dê dois cliques em **`teste-local.bat`**.
Ele sobe o Postgres, cria os `.env` (se não existirem), instala as dependências, aplica as
migrations, cadastra as lojas, abre API e web em janelas separadas e abre o navegador.

```powershell
.\teste-local.ps1 -PularInstalacao                              # próximas vezes (sem npm install)
.\teste-local.ps1 -PularInstalacao -Org org_xxx -Sub "auth0|..." -Papel dono   # cadastra uma pessoa
.\teste-local.ps1 -Parar                                        # para o banco
```

O login só funciona depois de preencher o Auth0 nos `.env` (docs/AUTH0.md).

### Passo a passo (qualquer sistema)

Pré-requisitos: Node 22+, Docker (ou um Postgres 16+ local), um tenant Auth0 configurado (docs/AUTH0.md).

```bash
docker compose up -d db
npm install
cp apps/api/.env.example apps/api/.env      # preencha
cp apps/web/.env.example apps/web/.env      # preencha
npm run build:core

npm run db:migrate   -w @saas/api   # prisma migrate deploy
npm run db:drift     -w @saas/api   # confere schema.prisma x banco (tem que sair sem diferenças)
npm run db:app-role  -w @saas/api   # liga login da role saas_app com a senha do .env
npm run db:seed      -w @saas/api   # cadastra as lojas (org_id do Auth0)
# cadastra cada pessoa na loja (só entra quem foi cadastrado — ver docs/AUTH0.md, passo 5)
npm run db:usuario   -w @saas/api -- --org org_xxx --sub "auth0|..." --papel dono

# terminal 1
npm run dev:build -w @saas/api      # compila em modo watch
# terminal 2
npm run dev -w @saas/api            # http://localhost:3000
# terminal 3
npm run dev -w @saas/web            # http://localhost:5173
```

Reverter a última migration: `npm run db:migrate:down -w @saas/api -- --confirmar`.

## Testes

```bash
npm test          # core + api + web
```

Os testes da API usam **Postgres de verdade** (o do docker-compose): recriam o banco `saas_teste`,
aplicam as migrations com `prisma migrate deploy` e conectam como `saas_app`. O Auth0 é
substituído por um JWKS local — a verificação do token é o mesmo código de produção.

| Arquivo | O que prova |
|---|---|
| `apps/api/test/isolamento.spec.ts` | produto da Loja A não aparece na Loja B; loja_id sempre o do token; lojaId no corpo recusado; mesmo código de barras em lojas diferentes; sequência de código interno por loja; mesma pessoa em 2 lojas; 30 requisições concorrentes sem mistura |
| `apps/api/test/rls-banco.spec.ts` | query direta sem loja_id → 0 linhas; WITH CHECK bloqueia INSERT/UPDATE em outra loja; sem vazamento no pool; saas_app sem superuser/BYPASSRLS/DELETE/DDL e sem escrita em usuarios; FORCE RLS ligado |
| `apps/api/test/autenticacao.spec.ts` | 401 para token ausente/forjado/expirado/alg none/HS256/aud ou iss errados; 403 sem org, org desconhecida, loja inativa, pessoa não cadastrada pelo dono (e nada é criado), cadastro em outra loja, usuário desativado |
| `apps/api/test/codigos.spec.ts` | código interno 0001, 0002…, continua do maior, 9999 → 10000, pula código de barras, 25 cadastros simultâneos sem repetir nem pular; código de barras só números, repetido → 409 com o nome do produto, igual a código interno → 409; preço zero recusado pela API e pelo banco |
| `apps/api/test/migracoes.spec.ts` | aplica tudo → reverte uma a uma (conferindo cada estado) → reaplica; migration 2 numera produtos antigos por loja; para sem apagar nada se houver código com letra |
| `apps/api/test/scripts.spec.ts` | `db:usuario` cadastra, muda papel, desativa, reativa; recusa loja desconhecida, papel inválido e super_admin |
| `packages/core/test/*` | validação de produto, formato do código interno e conversão de dinheiro (cobertura ≥ 80% obrigatória) |
| `apps/web/src/telas/*.test.tsx` | lista com códigos, cadastro sem campo de código interno, Enter do leitor vai para o preço, validação local, erro 409, bloqueio 403, queda de rede |

## Regras de produto já decididas (Luan, 11/11/2026 — iguais ao DaniPets V9.2)

- **Só entra quem o dono cadastrou.** Ser membro da Organization no Auth0 não basta; a pessoa precisa estar em `usuarios` daquela loja. Até a tela de usuários (Fase 5.7), o cadastro é pelo script `db:usuario`.
- **Preço de venda maior que zero.** Brinde é dado na venda, com 100% de desconto e autorização do Dono (Fase 4).
- **Código interno é do sistema:** maior código da loja + 1, com 4 dígitos (0001… 9999, 10000…). Cada loja tem a sua sequência.
- **Código de barras: opcional, só números**, único na loja. Nenhum código de barras pode ser igual a um código interno da mesma loja (o leitor aceita os dois).

## Decisões técnicas da Fase -1

| Decisão | Por quê |
|---|---|
| Duas conexões: `DATABASE_URL_MIGRATE` (dona) e `DATABASE_URL_APP` (`saas_app`) | Dono de tabela e superusuário ignoram RLS. A API roda com uma role que não consegue nem desligar o RLS. |
| `set_config(..., true)` dentro de transação, via `BancoService.comLoja()` | `SET` comum grudaria na conexão do pool e vazaria para a requisição seguinte. |
| `PrismaClient` privado no `BancoService` | Não existe outro caminho de código para tabela de tenant. |
| RLS também em `usuarios` | Tem e-mail/nome (LGPD). Custa uma policy. |
| API só lê `usuarios` (sem INSERT/UPDATE no banco) | Se a API for enganada, ainda assim não consegue se cadastrar nem promover alguém a dono. |
| Código interno gerado sob trava por loja (`pg_advisory_xact_lock`) | Dois vendedores cadastrando ao mesmo tempo não pegam o mesmo número; lojas diferentes não esperam umas pelas outras. |
| Migration 2 desliga o `FORCE RLS` só durante ela | No RDS o usuário de migração não é superusuário e ficaria preso ao RLS (não veria as linhas para numerar). A `saas_app` fica sob RLS o tempo todo. |
| Down migrations em `down.sql` + script | Prisma Migrate não tem "down" nativo. O teste garante que a reversão funciona. |
| Dinheiro em centavos (`INTEGER`) | Sem erro de ponto flutuante. Conversão texto→centavos sem passar por float. |
| Validação no `@saas/core`, usada por API e web | Mesma regra nos dois lados; a API continua sendo a autoridade. |
| `jose` para validar JWT | ESM nativo (NestJS 12 é ESM), mantida, usada pelos SDKs oficiais do Auth0. |
| Guarda global (APP_GUARD) | Toda rota nasce protegida; esquecer o decorator não abre nada. |
| Tokens do Auth0 só em memória no navegador | Nada em localStorage (menos exposição a XSS). |
