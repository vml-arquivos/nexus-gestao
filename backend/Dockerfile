# ============================================================
# NEXUS GESTÃO — Dockerfile Backend (multi-stage)
# Stage 1: build TypeScript → JavaScript
# Stage 2: imagem de produção Node 20 Alpine (~80MB)
#
# STARTUP ORDER:
#   1. node dist/db/migrate.js  → cria/atualiza tabelas (idempotente)
#   2. node dist/index.js       → inicia o servidor Express
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Instala TODAS as dependências (dev necessário para compilar TS)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Compila TypeScript (gera dist/)
COPY . .
RUN npx tsc --skipLibCheck

# ── Imagem de produção ────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NEXUS_RELEASE=fix51-sequential-build-20260730

# Apenas dependências de produção
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copia build compilado (inclui dist/db/migrate.js e dist/index.js)
COPY --from=builder /app/dist ./dist

COPY docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Volume de uploads
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD wget -T 5 -qO- http://localhost:3001/health/live || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
