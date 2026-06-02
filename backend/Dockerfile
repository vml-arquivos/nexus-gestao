# ============================================================
# NEXUS GESTÃO — Dockerfile Unificado (Coolify)
# Versão com build SEQUENCIAL para evitar OOM no servidor
# ============================================================

# ── STAGE 1: Build do Frontend ─────────────────────────────
# Roda PRIMEIRO e libera memória antes do backend compilar
FROM node:20-alpine AS frontend-builder

ENV NODE_OPTIONS="--max-old-space-size=512" \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=3 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=5000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=30000 \
    NPM_CONFIG_CACHE=/root/.npm

WORKDIR /app/frontend
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN rm -rf backend
# Limita workers do Vite para reduzir RAM
RUN npm run build

# ── STAGE 2: Build do Backend ──────────────────────────────
# Roda APÓS o frontend — Docker BuildKit usa stages separados
FROM node:20-alpine AS backend-builder

ENV NODE_OPTIONS="--max-old-space-size=512" \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=3 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=5000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=30000 \
    NPM_CONFIG_CACHE=/root/.npm

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY backend/ .
RUN npx tsc --skipLibCheck

# ── STAGE 3: Produção ──────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache nginx supervisor wget postgresql-client tar gzip

# Backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=backend-builder /app/backend/dist ./dist

# Frontend
RUN mkdir -p /usr/share/nginx/html
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Configurações
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.unified.conf /etc/nginx/http.d/app.conf
COPY supervisord.conf /etc/supervisord.conf

# Entrypoint
RUN printf '#!/bin/sh\nset -e\nmkdir -p /app/uploads\necho "[STARTUP] Iniciando Nexus..."\nexec /usr/bin/supervisord -c /etc/supervisord.conf\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

VOLUME ["/app/uploads"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
