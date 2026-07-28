#!/bin/sh
set -eu

cd /app/backend

MIGRATION_MAX_ATTEMPTS="${MIGRATION_MAX_ATTEMPTS:-12}"
MIGRATION_RETRY_DELAY_SECONDS="${MIGRATION_RETRY_DELAY_SECONDS:-5}"

case "$MIGRATION_MAX_ATTEMPTS" in
  ''|*[!0-9]*) MIGRATION_MAX_ATTEMPTS=12 ;;
esac
case "$MIGRATION_RETRY_DELAY_SECONDS" in
  ''|*[!0-9]*) MIGRATION_RETRY_DELAY_SECONDS=5 ;;
esac

if [ "$MIGRATION_MAX_ATTEMPTS" -lt 1 ]; then
  MIGRATION_MAX_ATTEMPTS=1
fi

attempt=1
while [ "$attempt" -le "$MIGRATION_MAX_ATTEMPTS" ]; do
  echo "[BACKEND] Migration: tentativa ${attempt}/${MIGRATION_MAX_ATTEMPTS}..."
  if node dist/db/migrate.js; then
    echo "[BACKEND] Migration concluída."
    echo "[BACKEND] Iniciando Nexus API na porta ${PORT:-3001}..."
    exec node dist/index.js
  fi

  if [ "$attempt" -ge "$MIGRATION_MAX_ATTEMPTS" ]; then
    echo "[BACKEND] ERRO: migration não concluída após ${MIGRATION_MAX_ATTEMPTS} tentativa(s)." >&2
    exit 1
  fi

  echo "[BACKEND] Banco ainda indisponível. Nova tentativa em ${MIGRATION_RETRY_DELAY_SECONDS}s." >&2
  sleep "$MIGRATION_RETRY_DELAY_SECONDS"
  attempt=$((attempt + 1))
done
