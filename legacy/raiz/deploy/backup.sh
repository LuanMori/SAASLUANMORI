#!/usr/bin/env bash
# deploy/backup.sh — cópia do banco (item 3.x da revisão de 18/11/2026).
#
# Usa a role saas_backup (só LÊ, com BYPASSRLS para enxergar todas as lojas). Grava em
# backups/saas-AAAAMMDD-HHMMSS.dump (formato do pg_restore), confere se o arquivo abre e apaga os
# backups com mais de BACKUP_DIAS dias. Rode no servidor, na pasta do projeto, pelo cron:
#   17 3 * * *  cd /opt/sistema-padrao && ./deploy/backup.sh >> backups/backup.log 2>&1
# Depois COPIE a pasta backups/ para fora do servidor (outro provedor, S3, Google Drive...):
# backup que fica só no mesmo disco some junto com ele. Restaurar: deploy/restaurar.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_ARQUIVO="${ENV_ARQUIVO:-.env.producao}"
[ -f "$ENV_ARQUIVO" ] || { echo "Falta $ENV_ARQUIVO (copie de .env.producao.example)." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "./$ENV_ARQUIVO"
set +a
: "${SAAS_BACKUP_DB_PASSWORD:?defina SAAS_BACKUP_DB_PASSWORD em $ENV_ARQUIVO}"
BANCO="${POSTGRES_DB:-saas}"
DIAS="${BACKUP_DIAS:-14}"
compose() { docker compose -f docker-compose.prod.yml --env-file "$ENV_ARQUIVO" "$@"; }

mkdir -p backups
chmod 700 backups
arquivo="backups/saas-$(date -u +%Y%m%d-%H%M%S).dump"
parcial="$arquivo.parcial"
trap 'rm -f -- "$parcial"' EXIT

echo "$(date -u +%FT%TZ) backup de $BANCO -> $arquivo"
compose exec -T -e PGPASSWORD="$SAAS_BACKUP_DB_PASSWORD" db \
  pg_dump --username=saas_backup --host=127.0.0.1 --dbname="$BANCO" --format=custom >"$parcial"

# o arquivo abre? (lista o conteúdo sem restaurar nada)
compose exec -T db pg_restore --list <"$parcial" >/dev/null
mv -- "$parcial" "$arquivo"
chmod 600 "$arquivo"
echo "$(date -u +%FT%TZ) ok: $(du -h "$arquivo" | cut -f1)"

# os antigos saem (só os deste script, pelo nome)
find backups -maxdepth 1 -name 'saas-*.dump' -type f -mtime "+$DIAS" -print -delete
