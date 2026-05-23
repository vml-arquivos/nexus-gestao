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

# ── 4. Build e sobe ──────────────────────────────────────────
echo "🔨 Fazendo build e subindo containers..."
docker compose up -d --build

# ── 5. Aguarda e verifica ────────────────────────────────────
echo "⏳ Aguardando containers iniciarem..."
sleep 5

if docker compose ps | grep -q "Up"; then
  echo ""
  echo "✅ Deploy concluído com sucesso!"
  echo ""
  DOMAIN=$(grep DOMAIN .env | cut -d '=' -f2)
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
