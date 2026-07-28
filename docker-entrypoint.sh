#!/bin/sh
set -eu

mkdir -p /app/uploads

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[STARTUP] ERRO: DATABASE_URL não foi configurada no Coolify." >&2
  exit 1
fi

echo "[STARTUP] Configuração validada. Iniciando Supervisor..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
