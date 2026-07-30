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

RUN apk add --no-cache python3

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Os patches são determinísticos, versionados e falham imediatamente se o código-base
# esperado tiver mudado. Assim backend e frontend recebem exatamente a mesma regra.
WORKDIR /app
COPY . .
RUN python3 scripts/apply_tarefas_client_select_patch.py \
    && python3 scripts/apply_task_scoring_ui_patch.py \
    && node scripts/apply_task_visibility_board_patch.mjs

WORKDIR /app/backend
RUN NODE_OPTIONS="--max-old-space-size=384" npx tsc --skipLibCheck

# ── STAGE 2: Build do Frontend ─────────────────────────────
FROM node:20-alpine AS frontend-builder

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
    NPM_CONFIG_CACHE=/root/.npm

RUN apk add --no-cache python3

WORKDIR /app/frontend

# Sincroniza com o fim do backend-builder ANTES de qualquer passo do frontend-builder --
# não só antes do vite build (onde estava antes). Achado com log real de deploy (fix50):
# o COPY --from ficava lá embaixo, logo antes do vite build, e isso NÃO impedia o BuildKit
# de rodar o `npm ci` do frontend em paralelo com o `tsc` do backend -- que é o passo mais
# pesado dos dois. Log real mostrou os dois rodando ao mesmo tempo por ~90s (13:15:25 a
# 13:17:00) e o build inteiro morrendo com "exit code 255" genérico, sem NENHUM erro de
# TypeScript impresso -- assinatura de OOM kill, não de erro de compilação, num host
# historicamente apertado de RAM (ver relatórios de correção anteriores: 94% CPU, OOM em
# outros serviços, coolify-realtime em restart loop por falta de memória). Com o COPY --from
# aqui em cima, o BuildKit é obrigado a esperar o backend-builder terminar por completo
# (tsc incluso) antes de iniciar QUALQUER passo do frontend-builder, inclusive o npm ci --
# serializa os dois estágios de verdade, ao custo de build total mais lento.
COPY --from=backend-builder /app/backend/dist /tmp/backend-build-check

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN python3 scripts/apply_tarefas_client_select_patch.py \
    && python3 scripts/apply_task_scoring_ui_patch.py \
    && node scripts/apply_task_visibility_board_patch.mjs \
    && rm -rf backend /tmp/backend-build-check

RUN NODE_OPTIONS="--max-old-space-size=384" npx vite build

# ── STAGE 3: Produção ──────────────────────────────────────
FROM node:20-alpine AS production

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_CACHE=/root/.npm

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
RUN printf '#!/bin/sh\nset -e\nmkdir -p /app/uploads\necho "[STARTUP] Rodando migration..."\ncd /app/backend && node dist/db/migrate.js && echo "[STARTUP] Migration OK"\necho "[STARTUP] Iniciando Nexus..."\nexec /usr/bin/supervisord -c /etc/supervisord.conf\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

VOLUME ["/app/uploads"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
