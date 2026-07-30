#!/bin/bash
# ============================================================
# NEXUS — deploy.sh
# Script de deploy completo para VPS com Docker
# Execute: chmod +x deploy.sh && ./deploy.sh
# ============================================================

set -e  # Para tudo se qualquer comando falhar

echo ""
echo "🚀 NEXUS — Deploy iniciando..."
echo ""

# ── 1. Verifica se o .env existe ─────────────────────────────
if [ ! -f ".env" ]; then
  echo "❌ Arquivo .env não encontrado!"
  echo "   Copie o .env.docker para .env e preencha as variáveis."
  echo "   cp .env.docker .env && nano .env"
  exit 1
fi

# ── 2. Verifica se Docker está instalado ─────────────────────
if ! command -v docker &> /dev/null; then
  echo "📦 Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo "✅ Docker instalado."
fi

if ! command -v docker compose &> /dev/null; then
  echo "📦 Instalando Docker Compose plugin..."
  sudo apt-get update -qq
  sudo apt-get install -y docker-compose-plugin
fi

# ── 3. Para containers existentes (deploy de atualização) ────
echo "⏹️  Parando containers existentes (se houver)..."
docker compose down --remove-orphans 2>/dev/null || true

# ── 4. Build sem cache e sobe ─────────────────────────────────
# --no-cache evita reaproveitar uma camada de uma imagem anterior
# quebrada/incompleta -- foi exatamente isso que manteve o domínio servindo
# a versão antiga depois de um build interrompido em 30/07/2026.
echo "🔨 Fazendo build sem cache e subindo containers..."
docker compose build --no-cache
docker compose up -d

# ── 5. Aguarda e verifica ────────────────────────────────────
echo "⏳ Aguardando containers iniciarem..."
sleep 5

if docker compose ps | grep -q "Up"; then
  echo ""
  echo "✅ Containers no ar. Validando release publicada..."
  echo ""
  DOMAIN=$(grep DOMAIN .env | cut -d '=' -f2)

  # Gate obrigatório: só considera o deploy concluído se /version bater com
  # a release do código-fonte. Container "Up" não significa release certa.
  if [ -f "scripts/verify-release.sh" ] && [ -n "$DOMAIN" ]; then
    if ./scripts/verify-release.sh "https://$DOMAIN"; then
      echo ""
      echo "✅ Deploy concluído e validado com sucesso!"
    else
      echo ""
      echo "❌ Containers subiram, mas a release publicada não confere."
      echo "   NÃO trate este deploy como concluído. Veja os logs:"
      docker compose logs --tail=80
      exit 1
    fi
  else
    echo "⚠️  scripts/verify-release.sh ou DOMAIN ausente -- validação manual necessária."
  fi
  echo ""
  echo "🌐 Acesse: https://$DOMAIN"
  echo ""
  echo "📱 Para instalar como app no iPhone:"
  echo "   Safari → https://$DOMAIN → Compartilhar → Adicionar à Tela de Início"
  echo ""
  echo "📱 Para instalar como app no Android:"
  echo "   Chrome → https://$DOMAIN → Menu (⋮) → Instalar aplicativo"
  echo ""
else
  echo "❌ Algo deu errado. Veja os logs:"
  docker compose logs --tail=50
  exit 1
fi
