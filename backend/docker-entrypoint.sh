#!/bin/sh
set -eu

mkdir -p /app/uploads

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[STARTUP] ERRO: DATABASE_URL não foi configurada no ambiente." >&2
  exit 1
fi

# Reserva heap explícito dentro do limite do contêiner. Sem esta configuração,
# o V8 pode escolher ~259 MB mesmo com mais memória disponível.
if [ -z "${NODE_OPTIONS:-}" ] || ! printf '%s' "$NODE_OPTIONS" | grep -q -- '--max-old-space-size'; then
  heap_mb="${NEXUS_NODE_HEAP_MB:-}"
  case "$heap_mb" in
    ''|*[!0-9]*)
      memory_limit_bytes=""
      if [ -r /sys/fs/cgroup/memory.max ]; then
        memory_limit_bytes="$(sed -n '1p' /sys/fs/cgroup/memory.max)"
      elif [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
        memory_limit_bytes="$(sed -n '1p' /sys/fs/cgroup/memory/memory.limit_in_bytes)"
      fi
      case "$memory_limit_bytes" in
        ''|max|*[!0-9]*) heap_mb=512 ;;
        *)
          memory_limit_mb=$((memory_limit_bytes / 1024 / 1024))
          heap_mb=$((memory_limit_mb * 60 / 100))
          if [ "$heap_mb" -gt 1536 ]; then heap_mb=1536; fi
          if [ "$heap_mb" -lt 128 ]; then heap_mb=128; fi
          ;;
      esac
      ;;
  esac
  NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=${heap_mb}"
  export NODE_OPTIONS
  echo "[STARTUP] Heap Node configurado em ${heap_mb} MB."
fi

echo "[STARTUP] Aplicando migrations no PostgreSQL..."
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
  echo "[STARTUP] Migration: tentativa ${attempt}/${MIGRATION_MAX_ATTEMPTS}..."
  if node dist/db/migrate.js; then
    echo "[STARTUP] Migrations concluídas. Iniciando Nexus API..."
    exec node dist/index.js
  fi

  if [ "$attempt" -ge "$MIGRATION_MAX_ATTEMPTS" ]; then
    echo "[STARTUP] ERRO: migration não concluída após ${MIGRATION_MAX_ATTEMPTS} tentativa(s)." >&2
    exit 1
  fi

  echo "[STARTUP] Banco ainda indisponível. Nova tentativa em ${MIGRATION_RETRY_DELAY_SECONDS}s." >&2
  sleep "$MIGRATION_RETRY_DELAY_SECONDS"
  attempt=$((attempt + 1))
done
