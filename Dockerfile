# ============================================================
# NEXUS GESTAO — Dockerfile Unificado para Coolify
# Deploy via Dockerfile (sem docker-compose)
#
# ARQUITETURA DO CONTAINER:
#   - Nginx (porta 80): serve o frontend React/PWA
#   - Node.js (porta 3001, interno): API backend Express + JWT
#   - supervisord: gerencia os dois processos
#   - Migration: executada automaticamente no startup
#   - Uploads: /app/uploads (configurar volume persistente no Coolify)
#
# TRAEFIK (Coolify): gerencia SSL e dominio externamente
# ============================================================

# ── STAGE 1: Build do Backend (TypeScript -> JavaScript) ─────
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY backend/ .
RUN npx tsc --skipLibCheck

# ── STAGE 2: Build do Frontend (React + Vite + PWA) ──────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY . .
RUN rm -rf backend
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── STAGE 3: Imagem de producao unificada ────────────────────
FROM node:20-alpine AS production

# Instala nginx e supervisor
RUN apk add --no-cache nginx supervisor wget

# ── Backend: dependencias de producao ────────────────────────
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY --from=backend-builder /app/backend/dist ./dist

# ── Frontend: arquivos estaticos ─────────────────────────────
RUN mkdir -p /usr/share/nginx/html
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# ── Nginx: configuracao ──────────────────────────────────────
# Limpa configs default e copia apenas para http.d/ (Alpine nginx moderno)
RUN rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf && \
    rm -rf /etc/nginx/conf.d
COPY nginx.unified.conf /etc/nginx/http.d/app.conf

# ── Supervisor: gerencia nginx + node ────────────────────────
COPY supervisord.conf /etc/supervisord.conf

# ── Entrypoint: migration -> supervisor ──────────────────────
RUN printf '#!/bin/sh\nset -e\nmkdir -p /app/uploads\necho "[STARTUP] Executando migrations no PostgreSQL..."\ncd /app/backend && node dist/db/migrate.js\necho "[STARTUP] Migrations OK. Iniciando nginx + node..."\nexec /usr/bin/supervisord -c /etc/supervisord.conf\n' \
    > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Volume para uploads persistentes
VOLUME ["/app/uploads"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
