# ============================================================
# NEXUS GESTÃO — Dockerfile Backend (multi-stage)
# ============================================================
FROM node:22-alpine AS builder
#
# Define o registrador padrão para o npm para evitar uso do registro interno.
# Ver detalhes no Dockerfile raiz sobre por que definimos NPM_CONFIG_REGISTRY.
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=3 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS production
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=3 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

RUN printf '#!/bin/sh\nset -e\necho "[ENTRYPOINT] Aplicando migrations no PostgreSQL..."\nnode dist/db/migrate.js\necho "[ENTRYPOINT] Migrations OK. Iniciando servidor Nexus..."\nexec node dist/index.js\n' \
    > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
