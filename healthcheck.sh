#!/bin/sh
set -u

HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1/health}"

if output="$(wget -T 5 -O - "$HEALTHCHECK_URL" 2>&1)"; then
  exit 0
fi

compact_output="$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-500)"
echo "[HEALTHCHECK] ${HEALTHCHECK_URL} indisponível: ${compact_output:-sem resposta HTTP}" >&2
exit 1
