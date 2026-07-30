#!/bin/bash
# ============================================================
# NEXUS — verify-release.sh
#
# Gate obrigatório de pós-deploy: confirma que o domínio está servindo a
# release que acabou de ser publicada, não uma imagem antiga/cacheada.
# Isso existe porque em 30/07/2026 um deploy foi interrompido (exit 255)
# e o domínio continuou servindo silenciosamente a versão anterior --
# ninguém percebeu porque a checagem de /version era manual.
#
# Uso:
#   ./scripts/verify-release.sh https://nexus.permupay.com.br
#
# Sai com código 0 somente se /version bater com a release do código-fonte
# (backend/src/release.ts) e /health/live e /health responderem corretamente.
# Qualquer outra coisa: código de saída != 0. Use isso como comando de
# pós-deploy no Coolify (ou em qualquer pipeline) para nunca "liberar o
# domínio" com uma imagem errada.
# ============================================================

set -u

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "❌ Uso: $0 <https://dominio>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_FILE="$SCRIPT_DIR/../backend/src/release.ts"

EXPECTED=$(grep -oE "NEXUS_RELEASE = '[^']+'" "$RELEASE_FILE" | sed -E "s/NEXUS_RELEASE = '([^']+)'/\1/")
if [ -z "$EXPECTED" ]; then
  echo "❌ Não consegui ler NEXUS_RELEASE de $RELEASE_FILE"
  exit 1
fi

MAX_TENTATIVAS=20   # ~2 minutos, dá tempo do container novo assumir o tráfego
INTERVALO=6

echo "🔍 Validando deploy em $DOMAIN"
echo "   Release esperada: $EXPECTED"
echo ""

for i in $(seq 1 "$MAX_TENTATIVAS"); do
  VERSION_JSON=$(curl -fsS --max-time 5 "$DOMAIN/version" 2>/dev/null)
  if [ $? -eq 0 ] && echo "$VERSION_JSON" | grep -q "\"$EXPECTED\""; then
    echo "✅ /version confere: $VERSION_JSON"
    break
  fi
  if [ "$i" -eq "$MAX_TENTATIVAS" ]; then
    echo "❌ /version não bateu com a release esperada após $MAX_TENTATIVAS tentativas."
    echo "   Última resposta: ${VERSION_JSON:-<sem resposta>}"
    echo ""
    echo "   O domínio provavelmente ainda está servindo uma imagem antiga."
    echo "   NÃO considere este deploy concluído."
    exit 1
  fi
  echo "   Tentativa $i/$MAX_TENTATIVAS: ainda não bateu, aguardando ${INTERVALO}s..."
  sleep "$INTERVALO"
done

HEALTH_LIVE=$(curl -fsS --max-time 5 "$DOMAIN/health/live" 2>/dev/null)
if [ $? -ne 0 ] || ! echo "$HEALTH_LIVE" | grep -qi "nexus-api"; then
  echo "❌ /health/live não respondeu como esperado (esperava JSON com nexus-api)."
  echo "   Resposta: ${HEALTH_LIVE:-<sem resposta>}"
  exit 1
fi
echo "✅ /health/live: $HEALTH_LIVE"

HEALTH=$(curl -fsS --max-time 8 "$DOMAIN/health" 2>/dev/null)
if [ $? -ne 0 ] || ! echo "$HEALTH" | grep -qi '"db"[[:space:]]*:[[:space:]]*"connected"'; then
  echo "❌ /health não confirmou banco conectado."
  echo "   Resposta: ${HEALTH:-<sem resposta>}"
  exit 1
fi
echo "✅ /health: banco conectado"

echo ""
echo "🚀 Deploy validado: $EXPECTED está no ar em $DOMAIN."
exit 0
