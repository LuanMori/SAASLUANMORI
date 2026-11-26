# Sistema Padrão — SaaS multi-tenant de gestão de varejo

> "Sistema Padrão" é o nome provisório do repositório; na tela aparece o que está em
> `apps/web/src/marca.ts` (hoje "Nome da empresa").

## Onde o projeto está (18/11/2026)

| Parte | Estado |
|---|---|
| **Servidor** (`apps/api`) | Login próprio (usuário e senha por loja), sessões, tela **Usuários**, histórico (auditoria), produtos, isolamento entre lojas no banco (RLS) vigiado por teste, `/saude`, logs em JSON. **Ainda não tem** vendas, estoque, clientes nem financeiro. |
| **Sistema real** (`apps/web/src/App.tsx`) | Entrada com usuário e senha, "Crie a sua senha" no primeiro acesso, aba Usuários funcionando com o servidor. As abas que o servidor ainda não tem mostram um aviso. |
| **Demonstração** (`sistema-padrao-demo.html`) | O painel completo feito até agora (Visão geral, Frente de caixa, Produtos e estoque, Relatórios, **Usuários**), com os dados no navegador. É onde as telas e as regras são testadas antes de irem para o servidor. |
| **Regras** (`packages/core`) | As mesmas para a demonstração e para o servidor: permissões, senha e bloqueio, usuários, venda, estoque, clientes, financeiro. |
| **Produção** | Docker (`docker-compose.prod.yml`), backup e restauração (`deploy/`), CI no GitHub a cada push. Passo a passo em `docs/deploy.md`. |

A revisão de 18/11/2026 (o documento da reunião) está respondida item por item em
**[`docs/REVISAO-2026-11-18.md`](docs/REVISAO-2026-11-18.md)**.

## Estrutura

```
packages/core   @saas/core  regras puras (sem DOM, sem I/O) — Vitest, cobertura ≥ 80%
apps/api        @saas/api   NestJS 12 + Prisma 7 + PostgreSQL 16 (RLS) — Jest + Supertest, Postgres de verdade
apps/web        @saas/web   React 19 + Vite 8 + TypeScript — Vitest + Testing Library
deploy/                     backup.sh e restaurar.sh (produção)
scripts/                    varrer-segredos.mjs (CI)
docs/                       LOGIN, SEGURANCA, deploy, backup, lgpd/, decisoes/, PENDENCIAS, REVISAO-2026-11-18
```

## Como o isolamento entre lojas funciona

```
navegador ── cookie HttpOnly (sessão) ──▶ nginx ──/api──▶ API
                                                          │ 1. sessão conferida no banco (loja ativa, pessoa ativa, 30 min sem uso = fim)
                                                          │ 2. a loja vem SÓ da sessão (nunca do corpo, da URL ou de cabeçalho)
                                                          │ 3. BancoService.comLoja(lojaId, fn, usuarioId):
                                                          │      BEGIN; set_config('app.loja_id', ..., true); ...; COMMIT
                                                          ▼
                                                      Postgres (role saas_app: sem BYPASSRLS, não é dona das tabelas)
                                                          RLS: loja_id = app_loja_atual()   ← vale mesmo se a query esquecer o filtro
```

- **A loja nunca vem do cliente**: nem corpo, nem URL, nem header. Campos desconhecidos no corpo → 400.
- **Sem `app.loja_id` definido, o banco devolve zero linhas** (falha fechada). Valor inválido → erro.
- `set_config(..., true)` = vale só dentro da transação: não vaza pelo pool de conexões.
- `FORCE ROW LEVEL SECURITY`: nem a role dona das tabelas escapa (só superusuário, que a API nunca usa).
- **A API se recusa a subir** se a conexão ignorar o RLS ou se alguma tabela de loja estiver sem RLS.
  Teste de vigilância no CI olha o banco inteiro a cada push. Detalhes: `docs/SEGURANCA.md`.

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

Na aba **Usuários** (Ana ou Caio) dá para cadastrar a equipe com **senha provisória** (quem recebe cria a
própria no primeiro acesso), alterar nome e papel, desativar, criar senha nova e, como Dono, excluir os dados
de quem foi desativado (LGPD). Abaixo ficam "O que cada papel pode fazer" (a matriz de permissões) e o
**Histórico** (quem fez o quê). "Trocar senha", na barra lateral, troca a própria senha. As senhas da
demonstração ficam guardadas só como hash, como no servidor.

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

Proteções que o servidor tem (ou terá) e a demonstração já imita: o Vendedor só recebe as vendas de hoje (outros
dias são dos Relatórios, do Dono e do Administrador; para devolver, ele busca a venda pelo número); 5 senhas
erradas seguidas bloqueiam o usuário por 5 minutos — no login e na senha de quem autoriza no caixa, que é a
mesma contagem; a sessão termina depois de 30 minutos sem uso.

As abas Clientes e Financeiro ainda não têm tela (ficam em branco até a vez delas), mas o código está pronto:
regras em `packages/core/src/cliente.ts` e `financeiro.ts`; chamadas da API em `apps/web/src/api.ts`
(`ApiClientes`, `ApiFinanceiro`), já funcionando na demonstração. Lojas usadas em versões anteriores da
demonstração ganham o estoque e o financeiro montados a partir das vendas que já tinham.
O card **Pendências** da Visão geral já existe, mas o que entra nele ainda está **a definir**
(sugestões em `docs/PENDENCIAS.md`); na demonstração, "Usuários de teste" → "Mostrar pendências de exemplo".

Serve para testar telas e regras. **Não testa segurança**: cookie HttpOnly, RLS e isolamento
de verdade só existem com API + Postgres (abaixo). A demonstração tem CSP (só roda o próprio código e não
fala com servidor nenhum) e começa com o BOM UTF-8, para os acentos abrirem certos em qualquer programa. Para gerar o arquivo de novo depois de mudar
a tela: `npm run build:core && npm run build:demo -w @saas/web`.

## Rodar localmente

### Windows: um clique

Com o Node 22+ instalado e o Docker Desktop aberto, dê dois cliques em **`teste-local.bat`**.
Ele sobe o Postgres, cria os `.env` (e acerta os da época do Auth0), instala as dependências, aplica as
migrations, cadastra as lojas, **cria o Dono e mostra a senha provisória**, abre API e web e o navegador.

```powershell
.\teste-local.ps1 -PularInstalacao                   # próximas vezes (sem npm install)
.\teste-local.ps1 -PularInstalacao -RedefinirSenha   # esqueceu a senha do Dono
.\teste-local.ps1 -Parar                             # para o banco
```

### Passo a passo (qualquer sistema)

Pré-requisitos: Node 22+ e Docker (ou um Postgres 16+ local).

```bash
docker compose up -d db
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run build:core

npm run db:migrate     -w @saas/api   # prisma migrate deploy
npm run db:drift       -w @saas/api   # confere schema.prisma x banco (tem que sair sem diferenças)
npm run db:app-role    -w @saas/api   # liga o login da role saas_app com a senha do .env
npm run db:backup-role -w @saas/api   # role do backup (só leitura)
npm run db:seed        -w @saas/api   # lojas do SEED_LOJAS ("Loja A=lojaa;Loja B=lojab")
npm run db:usuario     -w @saas/api -- --loja lojaa --usuario dono --nome "Dono da Loja" --papel dono   # mostra a senha provisória
npm run db:suporte     -w @saas/api -- --usuario suporte   # o Adm. Sup (entra em qualquer loja); mostra a senha uma vez

# terminal 1
npm run dev:build -w @saas/api      # compila em modo watch
# terminal 2
npm run dev -w @saas/api            # http://localhost:3000
# terminal 3
npm run dev -w @saas/web            # http://localhost:5173 (o /api vai para a API)
```

Login: usuário `dono` e a senha provisória mostrada pelo `db:usuario`. Reverter a última migration:
`npm run db:migrate:down -w @saas/api -- --confirmar`. Produção: `docs/deploy.md`.

## Testes

```bash
npm test          # core + api + web
node scripts/varrer-segredos.mjs --historico   # segredos nos arquivos e em todo o histórico
```

Os testes da API usam **Postgres de verdade** (o do docker-compose): recriam o banco `saas_teste`,
aplicam as migrations com `prisma migrate deploy` e conectam como `saas_app`. O CI
(`.github/workflows/ci.yml`) roda tudo isso a cada push, e ainda sobe as imagens Docker juntas.

| Arquivo | O que prova |
|---|---|
| `apps/api/test/vigilancia.spec.ts` | **o banco inteiro**: toda tabela de loja com RLS forçado e a policy padrão; privilégios da `saas_app` numa lista fechada; sem superusuário/BYPASSRLS (nem herdado); a API não sobe com conexão insegura ou tabela sem RLS |
| `apps/api/test/autenticacao.spec.ts` | login: cookie HttpOnly/SameSite/`__Host-`, só o hash no banco, mesma resposta para usuário inexistente, 5 erradas = 5 min (também para quem não existe), 30 tentativas simultâneas, limite por IP, desativado, sem senha, sessão de 30 min e 12 h, sair, senha provisória, trocar senha, origem de outro site, loja pelo endereço |
| `apps/api/test/usuarios.spec.ts` | tela Usuários: Vendedor e Personalizado (com funções), Dono e Administrador só pelo suporte, login repetido, ninguém se desativa, dois Donos ao mesmo tempo, desativar derruba a sessão, nova senha, excluir dados (LGPD), histórico; **e a trava no banco** conectando direto como `saas_app` |
| `apps/api/test/isolamento.spec.ts` | produto da Loja A não aparece na B; loja_id sempre o da sessão; mesmo login em duas lojas com senhas separadas; cookie com a loja trocada não entra; 30 pedidos simultâneos sem mistura |
| `apps/api/test/rls-banco.spec.ts` | query direta sem loja_id → 0 linhas; WITH CHECK; sem vazamento no pool; sem DELETE/DDL; CHECK do super_admin |
| `apps/api/test/codigos.spec.ts` | código interno 0001…, 25 cadastros simultâneos, código de barras só números e sem repetir, preço maior que zero |
| `apps/api/test/acentos-e-logs.spec.ts` | acentos de ponta a ponta (bytes UTF-8 no banco, NFC); logs em JSON sem senha, cookie ou nome |
| `apps/api/test/backup.spec.ts` | `pg_dump` com a role de backup → `pg_restore` num banco novo → mesmas linhas e RLS; com a role da API o dump falha |
| `apps/api/test/migracoes.spec.ts` | aplica → reverte uma a uma → reaplica igual; migrations 2 e 3 convertem dados antigos (Auth0 → login próprio) |
| `apps/api/test/scripts.spec.ts` | `db:usuario` (senha provisória sorteada, redefinir, desativar, login do suporte recusado, Personalizado só pela tela) e `db:seed` |
| `apps/api/test/adm-sup.spec.ts` | o suporte (Adm. Sup): entra em qualquer loja, não aparece na lista, cadastra Dono e Administrador, "Suporte" no histórico, a API não enxerga a linha dele, `db:suporte` (senha, desativar, sessões encerradas em todas as lojas) |
| `packages/core/test/*` | produto, dinheiro, venda, estoque, clientes (e exclusão LGPD), financeiro, permissões, senha, bloqueio, usuários, endereço da loja |
| `apps/web/src/**/*.test.ts(x)` | sistema real (login, senha provisória, 401 volta à entrada), cliente HTTP, tela Usuários, trocar senha, saída por inatividade, barra lateral, Visão geral, Frente de caixa, Produtos e estoque, Relatórios, demonstração |

## Regras de produto já decididas (Luan, 11/11/2026 — iguais ao DaniPets V9.2)

- **Só entra quem o dono cadastrou.** Desde 18/11/2026, pela aba **Usuários**. Desde 23/11/2026, o Dono e o Administrador só o suporte (Adm. Sup) cadastra, na implantação; o Dono cadastra Vendedor e Personalizado (com as funções que marcar). Ver `docs/LOGIN.md` e `docs/decisoes/0006-adm-sup-e-personalizado.md`.
- **Preço de venda maior que zero.** Brinde é dado na venda, com 100% de desconto e autorização do Dono (Fase 4).
- **Código interno é do sistema:** maior código da loja + 1, com 4 dígitos (0001… 9999, 10000…). Cada loja tem a sua sequência.
- **Código de barras: opcional, só números**, único na loja. Nenhum código de barras pode ser igual a um código interno da mesma loja (o leitor aceita os dois).

## Decisões técnicas

Registros completos em `docs/decisoes/` (auditoria, login próprio, transação e concorrência, roles do banco, implantação, suporte e Personalizado).

| Decisão | Por quê |
|---|---|
| Duas conexões: `DATABASE_URL_MIGRATE` (dona) e `DATABASE_URL_APP` (`saas_app`) | Dono de tabela e superusuário ignoram RLS. A API roda com uma role que não consegue nem desligar o RLS — e confere isso ao subir. |
| `set_config(..., true)` dentro de transação, via `BancoService.comLoja()` | `SET` comum grudaria na conexão do pool e vazaria para a requisição seguinte. |
| `PrismaClient` privado no `BancoService` | Não existe outro caminho de código para tabela de tenant. |
| Login próprio com sessão no servidor (cookie `__Host-` HttpOnly) | Dá para encerrar na hora; o JavaScript não lê o cookie; o banco guarda só o hash. Ver `docs/decisoes/0002-login-proprio.md`. |
| Senha com scrypt (do próprio Node) | Sem dependência nova; custo guardado junto com o hash. |
| Trava de usuários no banco (trigger) | Se a API errar, ainda assim não promove ninguém a Dono nem deixa a loja sem Dono. |
| Auditoria só de acréscimo, sem dado pessoal nos detalhes | O histórico não se apaga pela API, e a exclusão LGPD vale também para ele. |
| Permissões numa matriz só (`@saas/core/permissoes.ts`) | A mesma regra no servidor, nas telas, no menu e na demonstração. |
| Código interno gerado sob trava por loja (`pg_advisory_xact_lock`) | Dois vendedores cadastrando ao mesmo tempo não pegam o mesmo número; lojas diferentes não esperam umas pelas outras. |
| Migrations desligam o `FORCE RLS` só durante elas | No RDS o usuário de migração não é superusuário e ficaria preso ao RLS. A `saas_app` fica sob RLS o tempo todo. |
| Down migrations em `down.sql` + script | Prisma Migrate não tem "down" nativo. O teste garante que a reversão funciona. |
| Dinheiro em centavos (`INTEGER`) | Sem erro de ponto flutuante. |
| Validação no `@saas/core`, usada por API e web | Mesma regra nos dois lados; a API continua sendo a autoridade. |
| Guarda global (APP_GUARD) | Toda rota nasce protegida; esquecer o decorator não abre nada. |
| Tela e API no mesmo endereço (nginx repassa `/api`) | Cookie SameSite=Strict funciona e o CORS nem entra em jogo. |
