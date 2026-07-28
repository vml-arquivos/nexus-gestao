#!/bin/sh
set -eu

mkdir -p /app/uploads

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[STARTUP] ERRO: DATABASE_URL não foi configurada no ambiente." >&2
  exit 1
fi

echo "[STARTUP] Aplicando migrations no PostgreSQL..."
node dist/db/migrate.js
echo "[STARTUP] Migrations concluídas. Iniciando Nexus API..."
exec node dist/index.js
