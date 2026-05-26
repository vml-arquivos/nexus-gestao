# ============================================================
# NEXUS GESTÃO — Dockerfile Unificado (Coolify)
# ============================================================

# ── STAGE 1: Build do Backend ──────────────────────────────
FROM node:20-alpine AS backend-builder

# Força registry público — evita timeout no registry corporativo
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
    NPM_CONFIG_CACHE=/root/.npm

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline 2>/dev/null || \
    npm install --no-audit --no-fund
COPY backend/ .
RUN npx tsc --skipLibCheck || true

# ── STAGE 2: Build do Frontend ─────────────────────────────
FROM node:20-alpine AS frontend-builder

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
    NPM_CONFIG_CACHE=/root/.npm

WORKDIR /app/frontend
COPY package.json package-lock.json* ./

# Regenera lock se necessário e instala dependências
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline 2>/dev/null || \
    npm install --no-audit --no-fund

COPY . .
RUN rm -rf backend
RUN npm run build

# ── STAGE 3: Produção ──────────────────────────────────────
FROM node:20-alpine AS production

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_CACHE=/root/.npm

RUN apk add --no-cache nginx supervisor wget

# Backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund --prefer-offline 2>/dev/null || \
    npm install --omit=dev --no-audit --no-fund
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
