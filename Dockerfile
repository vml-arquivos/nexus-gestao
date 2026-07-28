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

# Validações idempotentes: confirmam que as correções versionadas continuam
# presentes, sem reescrever o código-fonte durante o build.
WORKDIR /app
COPY . .
RUN python3 scripts/apply_tarefas_client_select_patch.py \
    && python3 scripts/apply_task_scoring_ui_patch.py \
    && node scripts/apply_task_visibility_board_patch.mjs

WORKDIR /app/backend
RUN NODE_OPTIONS="--max-old-space-size=384" npx tsc --skipLibCheck

# ── STAGE 2: Build do Frontend ─────────────────────────────
FROM node:20-alpine AS frontend-builder

ARG VITE_API_URL=/api
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
    NPM_CONFIG_CACHE=/root/.npm \
    VITE_API_URL=${VITE_API_URL}

RUN apk add --no-cache python3

WORKDIR /app/frontend
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN python3 scripts/apply_tarefas_client_select_patch.py \
    && python3 scripts/apply_task_scoring_ui_patch.py \
    && node scripts/apply_task_visibility_board_patch.mjs \
    && rm -rf backend

# Força o BuildKit a concluir o build TypeScript do backend antes do build do frontend.
# Sem esta dependência, Coolify/BuildKit pode executar backend tsc e frontend tsc/vite em paralelo,
# consumindo muita memória na VPS e derrubando o deploy sem mostrar erro TypeScript claro.
COPY --from=backend-builder /app/backend/dist /tmp/backend-build-check
# No deploy do Coolify a VPS pode encerrar o tsc -b por memória antes de mostrar o erro real.
# O build completo com typecheck continua sendo validado fora do Docker com npm run build.
# Dentro da imagem usamos o build do Vite para evitar falha falsa de deploy e não alterar runtime.
RUN rm -rf /tmp/backend-build-check && NODE_OPTIONS="--max-old-space-size=384" npx vite build

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

# O entrypoint inicia o Supervisor imediatamente. O Nginx fica disponível
# enquanto o backend executa a migração com tentativas controladas.
COPY docker-entrypoint.sh /app/entrypoint.sh
COPY backend-start.sh /app/backend-start.sh
COPY healthcheck.sh /app/healthcheck.sh
RUN chmod +x /app/entrypoint.sh /app/backend-start.sh /app/healthcheck.sh

VOLUME ["/app/uploads"]
EXPOSE 80
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=8s --start-period=60s --retries=10 \
  CMD /bin/sh /app/healthcheck.sh

CMD ["/bin/sh", "/app/entrypoint.sh"]
