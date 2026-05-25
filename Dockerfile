# ============================================================
# NEXUS GESTÃO — Dockerfile Unificado (Coolify)
# ============================================================

# ── STAGE 1: Build do Backend ─────────────────────────────────
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci || npm install --legacy-peer-deps
COPY backend/ .
RUN npx tsc --skipLibCheck || true

# ── STAGE 2: Build do Frontend ────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY package.json package-lock.json* ./
RUN npm ci || npm install --legacy-peer-deps
COPY . .
RUN rm -rf backend
RUN npm run build

# ── STAGE 3: Produção ─────────────────────────────────────────
FROM node:22-alpine AS production

RUN apk add --no-cache nginx supervisor wget

# Backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev --legacy-peer-deps
COPY --from=backend-builder /app/backend/dist ./dist

# Frontend
RUN mkdir -p /usr/share/nginx/html
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Configs
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.unified.conf /etc/nginx/http.d/app.conf
COPY supervisord.conf /etc/supervisord.conf

# Entrypoint embutido — sem depender de arquivo externo
RUN printf '#!/bin/sh\n\
mkdir -p /app/uploads\n\
echo "[STARTUP] Iniciando Nexus..."\n\
exec /usr/bin/supervisord -c /etc/supervisord.conf\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

VOLUME ["/app/uploads"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
