#!/bin/sh
set -u

# Liveness não depende da fila do PostgreSQL. A readiness pública continua em
# /health e valida o banco, mas uma saturação momentânea não reinicia o contêiner
# inteiro e não amplifica a indisponibilidade.
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3001/health/live}"

if output="$(wget -T 5 -O - "$HEALTHCHECK_URL" 2>&1)"; then
  exit 0
fi

compact_output="$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-500)"
echo "[HEALTHCHECK] ${HEALTHCHECK_URL} indisponível: ${compact_output:-sem resposta HTTP}" >&2
exit 1
