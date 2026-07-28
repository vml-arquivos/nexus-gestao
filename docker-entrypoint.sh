#!/bin/sh
set -eu

mkdir -p /app/uploads

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[STARTUP] ERRO: DATABASE_URL não foi configurada no Coolify." >&2
  exit 1
fi

echo "[STARTUP] Aplicando migrations no PostgreSQL..."
cd /app/backend
node dist/db/migrate.js
echo "[STARTUP] Migrations concluídas."

echo "[STARTUP] Iniciando Nginx e Nexus API..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
