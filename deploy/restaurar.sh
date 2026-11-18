#!/usr/bin/env bash
# deploy/restaurar.sh — restaura um backup feito por deploy/backup.sh.
#
#   ./deploy/restaurar.sh backups/saas-20261118-031700.dump
#       restaura num banco NOVO (saas_restaurado), sem mexer no banco em uso, e mostra quantas
#       linhas cada tabela tem: é o "teste de restauração" (faça um por mês e anote a data em docs/backup.md)
#
#   ./deploy/restaurar.sh backups/saas-20261118-031700.dump --substituir-producao
#       PARA a API, apaga o banco em uso, restaura o backup no lugar e sobe a API de novo.
#       Tudo o que foi feito depois do backup se perde. Pede para digitar o nome do banco.
set -euo pipefail
cd "$(dirname "$0")/.."

arquivo="${1:?informe o arquivo .dump (ex.: backups/saas-20261118-031700.dump)}"
modo="${2:-}"
[ -f "$arquivo" ] || { echo "Arquivo não encontrado: $arquivo" >&2; exit 1; }

ENV_ARQUIVO="${ENV_ARQUIVO:-.env.producao}"
[ -f "$ENV_ARQUIVO" ] || { echo "Falta $ENV_ARQUIVO." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "./$ENV_ARQUIVO"
set +a
USUARIO="${POSTGRES_USER:-postgres}"
BANCO="${POSTGRES_DB:-saas}"
compose() { docker compose -f docker-compose.prod.yml --env-file "$ENV_ARQUIVO" "$@"; }
psql_admin() { compose exec -T db psql --username="$USUARIO" --dbname=postgres -v ON_ERROR_STOP=1 "$@"; }

if [ "$modo" = "--substituir-producao" ]; then
  destino="$BANCO"
  echo "ATENÇÃO: o banco $destino será APAGADO e trocado pelo backup $arquivo."
  read -r -p "Digite o nome do banco ($destino) para confirmar: " resposta
  [ "$resposta" = "$destino" ] || { echo "Cancelado."; exit 1; }
  compose stop api web
else
  [ -z "$modo" ] || { echo "Opção desconhecida: $modo" >&2; exit 1; }
  destino="saas_restaurado"
fi

psql_admin -c "DROP DATABASE IF EXISTS \"$destino\" WITH (FORCE)"
psql_admin -c "CREATE DATABASE \"$destino\" ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'pt-BR' TEMPLATE template0"
# as roles que o backup cita (no mesmo servidor já existem; num servidor novo, nascem aqui, sem login)
psql_admin -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
    CREATE ROLE saas_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_backup') THEN CREATE ROLE saas_backup NOLOGIN; END IF;
END \$\$"
# como superusuário: o RLS com FORCE barraria até o dono das tabelas. O backup traz as tabelas, os
# dados, as policies, a trava de usuários e os GRANTs.
compose exec -T db pg_restore --username="$USUARIO" --dbname="$destino" --no-owner --exit-on-error <"$arquivo"
# senha das roles (do .env.producao) e leitura do backup nas tabelas restauradas
compose run --rm --no-deps -e DATABASE_URL_MIGRATE="postgresql://$USUARIO:$POSTGRES_PASSWORD@db:5432/$destino" migracao \
  sh -c "npx tsx scripts/definir-senha-app.ts && npx tsx scripts/criar-role-backup.ts"

echo "Linhas por tabela em $destino:"
compose exec -T db psql --username="$USUARIO" --dbname="$destino" -At -F ' ' -c \
  "SELECT 'lojas', count(*) FROM lojas UNION ALL SELECT 'usuarios', count(*) FROM usuarios
   UNION ALL SELECT 'produtos', count(*) FROM produtos UNION ALL SELECT 'auditoria', count(*) FROM auditoria"

if [ "$modo" = "--substituir-producao" ]; then
  compose up -d --no-build api web
  echo "Backup restaurado no banco em uso e API de volta."
else
  echo "Restaurado em $destino (o banco em uso não mudou). Para apagar o teste:"
  echo "  docker compose -f docker-compose.prod.yml --env-file $ENV_ARQUIVO exec db psql -U $USUARIO -d postgres -c 'DROP DATABASE saas_restaurado'"
fi
