# Sistema Padrão — SaaS multi-tenant de gestão de varejo

> "Sistema Padrão" é o nome provisório do repositório; na tela aparece o que está em
> `apps/web/src/marca.ts` (hoje "Nome da empresa").

## Onde o projeto está (16/11/2026)

| Parte | Estado |
|---|---|
| **Servidor** (`apps/api`) | Fase -1 (esqueleto): banco, Auth0, isolamento entre lojas e cadastro de produtos. **Ainda não tem** vendas, estoque, clientes nem financeiro. |
| **App com servidor** (`apps/web/src/App.tsx`, o que o `teste-local.bat` abre) | Login pelo Auth0 e a tela de produtos. Mostra só o que o servidor já tem. |
| **Demonstração** (`sistema-padrao-demo.html`) | O painel completo feito até agora (entrada com usuário e senha, Visão geral, Frente de caixa, Produtos e estoque, Relatórios), com os dados no navegador. É onde as telas e as regras são testadas antes de irem para o servidor. |
| **Regras** (`packages/core`) | As mesmas para a demonstração e para o servidor: quando o servidor ganhar vendas, estoque, clientes e financeiro, usa estas funções. |

**Decisão em aberto: o login de verdade.** A tela de entrada pedida pelo Luan é usuário e senha, com a loja
vinda do subdomínio (`apps/web/src/telas/TelaEntrada.tsx`, `apps/web/src/subdominio.ts`). O servidor hoje
autentica pelo Auth0 (`docs/AUTH0.md`). Falta decidir como juntar os dois (Auth0 com usuário e senha por loja,
ou login próprio) antes de levar o painel para o servidor. Até lá, o app com servidor continua com o login do Auth0.

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

Abra **`sistema-padrao-demo.html`** no navegador (dois cliques). É o painel com as mesmas regras do
`@saas/core`, mas **sem servidor**: a loja vem do "endereço simulado" da faixa amarela (Loja A ou Loja B),
a entrada é com usuário e senha de teste, e os dados ficam no `localStorage` do navegador, separados por loja.

Na aba **Produtos e estoque** dá para cadastrar produto (código interno 0001…, código de barras só números e
sem repetir, preço maior que zero, Enter do leitor vai para o preço), ver o saldo de cada um e, como Dono ou
Administrador, lançar entrada, ajuste com motivo e estoque mínimo. Produto novo começa com estoque 0.

Já dá para testar o fluxo de vendas: **Frente de caixa** → **Visão geral** (cards com as vendas de
HOJE, que voltam a zero à meia-noite) → **Relatórios** (todas as vendas, de todos os dias). Cada venda
guarda quem vendeu: sempre a pessoa que entrou no sistema, nunca um campo da tela.

A Frente de caixa copia as funções da do DaniPets V9.3.3 que já cabem no SaaS: tela cheia; leitor
com "3*código"; busca por nome (F3); fita com quantidade, desconto e remover; último item; formas de
pagamento com atalho (F4 Dinheiro, F8 Pix, F9 Débito, F10 Crédito); dinheiro com valor recebido e
troco; pagamento dividido; finalizar (F2); limpar venda; carrinho guardado por pessoa; desconto com
motivo (Vendedor até 10%; acima disso, senha do Dono ou do Administrador; brinde só com o Dono);
devolução de itens e cancelamento da venda (no mesmo dia), com o valor voltando pelas mesmas formas.
No pagamento em dinheiro o **troco** é calculado na hora (sobre a parte em dinheiro, no pagamento dividido);
atalhos "Exato" e quantias redondas preenchem o valor recebido, e Enter no campo finaliza. A tela do caixa
se ajusta ao tamanho da janela: em computador e tablet deitado tudo fica à vista sem rolar a página (só a
lista de itens rola); no celular a tela rola normalmente.
Usuários de teste: `ana` (Dono), `caio` (Administrador), `bruno` (Vendedor), senha `demo1234`.
As regras ficam em `packages/core/src/venda.ts`.

Cada venda da Frente de caixa alimenta o resto do sistema, como no DaniPets:

- **Estoque**: a venda dá baixa e é recusada sem estoque ("Estoque insuficiente para X. Disponível: N un.");
  o cancelamento devolve tudo; na devolução, cada item volta para a prateleira ou não (avaria, vencido).
  A busca (F3) mostra o saldo, que é buscado de novo a cada 20 segundos e depois de cada venda.
- **Fiado (F7)**: só para cliente identificado. Sem cliente, o botão fica bloqueado e o servidor recusa a
  venda; tirar o cliente da venda tira o fiado do pagamento. Pode ser uma forma só ou parte de um pagamento
  dividido. A compra vira "a receber" na conta do cliente, sem taxa e com prazo de 30 dias (como no DaniPets);
  não entra no Caixa nem no Banco até o cliente pagar. Na devolução e no cancelamento, abate do que ele deve.
  A faixa do cliente no caixa mostra quanto ele deve no fiado.
- **Clientes**: F6 identifica o cliente (CPF, telefone ou nome) ou cadastra na hora (nome, telefone e CPF,
  sem repetir CPF); a compra entra no histórico dele. A busca é feita no servidor, que devolve o CPF já
  mascarado: a lista de clientes não vai para o navegador.
- **Financeiro**: Dinheiro entra no Caixa físico, Pix na Conta bancária e cartão vira "a receber", com a taxa
  e o prazo da operadora (padrão: débito 1,5% em 1 dia, crédito 3% em 30 dias). Cancelamento e devolução
  estornam pela mesma forma (devolução em dinheiro não passa do que há no caixa).
- **Visão geral**: o card Saldo das contas (só Dono e Administrador) mostra Caixa + Banco e o que ainda vai
  entrar (cartão e fiado).
- **Relatórios**: coluna e filtro de cliente; taxas de cartão do período. "Total vendido" é o bruto; havendo
  devolução no período aparece também "Vendas líquidas" (bruto menos devoluções), como no DaniPets. Os filtros
  de quem vendeu, cliente e pagamento valem também para as devoluções e as taxas.

Proteções que o servidor terá e a demonstração já imita: o Vendedor só recebe as vendas de hoje (outros dias são
dos Relatórios, do Dono e do Administrador; para devolver, ele busca a venda pelo número); 5 senhas erradas
seguidas na autorização bloqueiam aquele autorizador por 1 minuto, como no login.

As abas Clientes e Financeiro ainda não têm tela (ficam em branco até a vez delas), mas o código está pronto:
regras em `packages/core/src/cliente.ts` e `financeiro.ts`; chamadas da API em `apps/web/src/api.ts`
(`ApiClientes`, `ApiFinanceiro`), já funcionando na demonstração. Lojas usadas em versões anteriores da
demonstração ganham o estoque e o financeiro montados a partir das vendas que já tinham.
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
| `packages/core/test/*` | validação de produto, formato do código interno, conversão de dinheiro, venda, estoque, clientes e financeiro (cobertura ≥ 80% obrigatória) |
| `apps/web/src/telas/*.test.tsx` | tela de entrada (usuário e senha, loja pelo subdomínio); produtos: lista com códigos, cadastro sem campo de código interno, Enter do leitor vai para o preço, validação local, erro 409, bloqueio 403, queda de rede |
| `apps/web/src/painel/*.test.tsx` | barra lateral e permissões por papel, Visão geral, Frente de caixa (leitor, pagamento, desconto, estoque, cliente F6, devolução), Produtos e estoque, Relatórios, regras de pendência |
| `apps/web/src/demo/apiLocal.test.ts` | a venda alimenta estoque, clientes e financeiro; cancelamento e devolução desfazem; loja de versão anterior é convertida; proteções (Vendedor só hoje, bloqueio da senha de autorização, CPF mascarado na busca) |

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
