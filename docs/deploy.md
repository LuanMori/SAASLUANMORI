# Colocar em produção (item 3.3 da revisão de 18/11/2026)

Passo a passo para subir o sistema num servidor (VPS) com Docker. Testado em 18/11/2026: as três
imagens construídas, banco + migração + API + nginx no ar, login de verdade pelo navegador, backup
e restauração. O CI repete o teste das imagens a cada push.

```
internet ──HTTPS──▶ [Cloudflare / balanceador / Caddy] ──http──▶ web (nginx :8080) ──/api──▶ api (:3000) ──▶ db (Postgres 16)
                     o HTTPS termina aqui                          tela + cabeçalhos         role saas_app    sem porta aberta
```

## 1. O que precisa

- Um servidor Linux com Docker e o plugin compose (2 GB de RAM bastam para começar).
- Um domínio (ex.: `nomedaempresa.com.br`) com um registro **curinga** `*.nomedaempresa.com.br`
  apontando para o servidor: cada loja entra por `lojaa.nomedaempresa.com.br`.
- **HTTPS na frente** do nginx. O mais simples: Cloudflare com proxy ligado (certificado curinga
  automático) apontando para a porta do nginx. Alternativas: um balanceador da nuvem ou Caddy.
  Sem HTTPS, o cookie de sessão (`__Host-sessao`, Secure) não funciona — de propósito.

## 2. Primeira instalação

```bash
git clone <repositório> /opt/sistema-padrao && cd /opt/sistema-padrao
cp .env.producao.example .env.producao
openssl rand -hex 24     # rode 3 vezes: POSTGRES_PASSWORD, SAAS_APP_DB_PASSWORD, SAAS_BACKUP_DB_PASSWORD
nano .env.producao       # cole as senhas; DOMINIO_BASE=nomedaempresa.com.br
chmod 600 .env.producao

docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build --wait
curl -s http://localhost:8080/api/saude      # {"status":"ok"}
```

O `up` cria o banco (UTF-8, ordem do português), aplica as migrations, prepara as roles `saas_app` e
`saas_backup` e só então sobe a API (que confere se a conexão é segura antes de aceitar pedidos).

### Cadastrar a primeira loja e o primeiro Dono

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.producao"
$C run --rm -e SEED_LOJAS="Pet Shop da Ana=petshopdaana" migracao npx tsx scripts/seed-dev.ts
$C run --rm migracao npx tsx scripts/cadastrar-usuario.ts --loja petshopdaana --usuario ana --nome "Ana Paula" --papel dono
```

O segundo comando mostra a senha provisória uma vez. A Ana abre `https://petshopdaana.nomedaempresa.com.br`,
entra, cria a senha dela e cadastra a equipe na aba **Usuários**.

## 3. Atualizar para uma versão nova

```bash
cd /opt/sistema-padrao
./deploy/backup.sh                                  # sempre um backup antes
git pull
docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build --wait
```

As migrations novas rodam sozinhas no container `migracao` antes da API subir. Se uma migration
falhar, a API velha continua no ar e nada muda no banco (cada migration é uma transação).
Voltar uma migration: `$C run --rm migracao npx tsx scripts/migrate-down.ts --confirmar` (usa o `down.sql`).

## 4. Dia a dia

| Para | Comando |
|---|---|
| Ver se está tudo de pé | `$C ps` (todos `healthy`) e `curl -s https://<loja>.<domínio>/api/saude` |
| Logs da API (JSON) | `$C logs -f api` — filtre por `"loja":"<id>"` ou pelo `X-Request-Id` |
| Monitoramento | aponte um monitor externo (UptimeRobot, Better Stack...) para `https://<qualquer loja>/api/saude`: `200 {"status":"ok"}` = API e banco respondendo; `503` = banco fora |
| Reiniciar | `$C restart api web` |
| Backup | `./deploy/backup.sh` (e o cron — ver [`backup.md`](backup.md)) |

## 5. Configurações (`.env.producao`)

| Variável | Para quê |
|---|---|
| `POSTGRES_PASSWORD` | superusuário do Postgres (só o container de migração usa) |
| `SAAS_APP_DB_PASSWORD` | role da API (sem BYPASSRLS) |
| `SAAS_BACKUP_DB_PASSWORD` | role do backup (só leitura, com BYPASSRLS) |
| `DOMINIO_BASE` | domínio do SaaS; a loja vem do subdomínio |
| `COOKIE_SEGURO` | `true` em produção |
| `PORTA_HTTP` | porta do nginx no servidor (o HTTPS da frente aponta para ela) |
| `LOG_NIVEL` | `info` (padrão), `debug` mostra também os `/saude` |
| `BACKUP_DIAS` | quantos dias de backup ficam no servidor |

A API também aceita `SESSAO_INATIVIDADE_MIN` (30) e `SESSAO_MAXIMA_HORAS` (12).

## 6. Cuidados

- **Nunca** abra a porta 3000 (API) ou 5432 (banco) para a internet: só a do nginx. A API confia no
  `X-Forwarded-For` de **um** proxy (o nginx, `SALTOS_DE_PROXY=1`); exposta direto, qualquer um
  inventaria o IP e fugiria do limite de tentativas por IP.
- Com Cloudflare na frente, configure o nginx para usar o IP real (`set_real_ip_from` com as faixas da
  Cloudflare + `real_ip_header CF-Connecting-IP`), senão todo mundo parece vir do IP da Cloudflare e o
  limite por IP vira um limite de todos.
- Uma cópia da API por enquanto (os contadores por IP ficam na memória dela — ver `SEGURANCA.md`).
- Em rede com proxy que inspeciona HTTPS (empresa), o build precisa do certificado dessa rede:
  `docker build --secret id=ca_extra,src=certificado.crt ...` (não fica gravado na imagem).

## 7. Na AWS (alternativa)

Mesmas imagens: API no ECS/Fargate (alvo `api`), migração como tarefa avulsa (alvo `ferramentas`),
tela no nginx (alvo `web`) ou S3+CloudFront com a mesma CSP, banco no **RDS PostgreSQL 16** com backup
automático e restauração para um ponto no tempo (ver `backup.md`). No RDS o usuário master não é
superusuário: confira se a sua versão deixa criar uma role com BYPASSRLS (`scripts/criar-role-backup.ts`);
se não deixar, use os snapshots do RDS como backup (cópia física, não depende de role nem de RLS).
