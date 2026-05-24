#!/bin/sh
set -e

# ── Diretório de uploads ──────────────────────────────────────
mkdir -p /app/uploads

# ── Aguarda PostgreSQL ficar disponível (até 60s) ─────────────
# O DB pode demorar alguns segundos para aceitar conexões no primeiro boot
echo "[STARTUP] Aguardando PostgreSQL..."
RETRIES=20
i=0
until node -e "
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
  c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i+1))
  if [ $i -ge $RETRIES ]; then
    echo "[STARTUP] ❌ PostgreSQL não respondeu após ${RETRIES} tentativas. Abortando."
    exit 1
  fi
  echo "[STARTUP] Tentativa $i/$RETRIES — aguardando 3s..."
  sleep 3
done

echo "[STARTUP] ✅ PostgreSQL disponível."

# ── Executa migrations (idempotente — CREATE TABLE IF NOT EXISTS) ──
echo "[STARTUP] Executando migrations..."
cd /app/backend
if node dist/db/migrate.js; then
  echo "[STARTUP] ✅ Migrations OK."
else
  echo "[STARTUP] ⚠️  Migrations retornaram erro — continuando mesmo assim."
  # Não abortamos: se as tabelas já existem, está OK
fi

# ── Inicia nginx + node via supervisord ──────────────────────
echo "[STARTUP] Iniciando nginx + node (supervisord)..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
