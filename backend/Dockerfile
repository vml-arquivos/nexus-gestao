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
RUN npm ci 2>/dev/null || npm install

# Compila TypeScript (gera dist/)
COPY . .
RUN npx tsc --skipLibCheck

# ── Imagem de produção ────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Apenas dependências de produção
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copia build compilado (inclui dist/db/migrate.js e dist/index.js)
COPY --from=builder /app/dist ./dist

# Entrypoint: roda migrate ANTES do servidor
RUN printf '#!/bin/sh\nset -e\necho "[ENTRYPOINT] Aplicando migrations no PostgreSQL..."\nnode dist/db/migrate.js\necho "[ENTRYPOINT] Migrations OK. Iniciando servidor Nexus..."\nexec node dist/index.js\n' \
    > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Volume de uploads
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
