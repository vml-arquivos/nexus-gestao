#!/bin/sh
set -eu

cd /app/backend

MIGRATION_MAX_ATTEMPTS="${MIGRATION_MAX_ATTEMPTS:-12}"
MIGRATION_RETRY_DELAY_SECONDS="${MIGRATION_RETRY_DELAY_SECONDS:-5}"

# Reserva heap compatível com o limite real do contêiner. Pode ser substituído
# explicitamente por NEXUS_NODE_HEAP_MB no Coolify.
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
          if [ "$memory_limit_mb" -gt 2560 ]; then
            heap_mb=1536
          else
            heap_mb=$((memory_limit_mb * 60 / 100))
          fi
          if [ "$heap_mb" -lt 128 ]; then heap_mb=128; fi
          ;;
      esac
      ;;
  esac
  if [ "$heap_mb" -lt 128 ]; then heap_mb=128; fi
  NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=${heap_mb}"
  export NODE_OPTIONS
  echo "[BACKEND] Heap Node configurado em ${heap_mb} MB."
fi

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
