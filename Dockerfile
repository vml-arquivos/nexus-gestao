# syntax=docker/dockerfile:1.7
# ============================================================
# NEXUS GESTÃO — Dockerfile unificado e sequencial (Coolify)
# Release FIX54
#
# Uma única etapa de build executa frontend e backend em sequência. A etapa
# de produção só começa depois que o builder termina. Isso impede o BuildKit
# de repetir o cenário comprovado no log: npm ci do frontend, tsc do backend
# e apk/npm da produção concorrendo por CPU, memória, disco e rede.
# ============================================================

FROM node:20-alpine AS builder

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000

WORKDIR /app

# Dependências do frontend. O cache BuildKit reduz downloads em redeploys.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,id=nexus-frontend-npm,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

# Dependências do backend são instaladas depois, nunca em paralelo.
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN --mount=type=cache,id=nexus-backend-npm,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

# Os patches antes executados dentro do Docker já estão incorporados ao fonte
# desta release. Não instalamos Python e não reescrevemos arquivos no deploy.
WORKDIR /app
COPY . .

# Backend primeiro.
WORKDIR /app/backend
RUN NODE_OPTIONS="--max-old-space-size=384" ./node_modules/.bin/tsc --skipLibCheck

# Frontend depois. O typecheck completo foi validado antes do empacotamento;
# na VPS usamos Vite diretamente para reduzir o pico de memória.
WORKDIR /app
RUN NODE_OPTIONS="--max-old-space-size=384" ./node_modules/.bin/vite build

# Reaproveita as dependências já baixadas. Evita um terceiro npm ci na imagem
# final e mantém somente dependências de produção do backend.
WORKDIR /app/backend
RUN --mount=type=cache,id=nexus-backend-npm,target=/root/.npm \
    npm prune --omit=dev --no-audit --no-fund

# ── PRODUÇÃO ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

ENV NODE_ENV=production \
    NEXUS_RELEASE=fix55-agenda-sem-limite-20260806

LABEL org.opencontainers.image.title="Nexus Gestão" \
      org.opencontainers.image.version="fix55-agenda-sem-limite-20260806"

# Barreira de serialização: esta cópia depende do builder completo. Portanto
# nem apk nem qualquer trabalho da produção inicia junto com npm/tsc/vite.
COPY --from=builder /app/backend/dist /tmp/nexus-backend-dist

RUN apk add --no-cache nginx supervisor wget postgresql-client tar gzip

WORKDIR /app/backend
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/package-lock.json ./package-lock.json
COPY --from=builder /app/backend/node_modules ./node_modules
RUN mv /tmp/nexus-backend-dist ./dist

RUN mkdir -p /usr/share/nginx/html
COPY --from=builder /app/dist /usr/share/nginx/html

RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.unified.conf /etc/nginx/http.d/app.conf
COPY supervisord.conf /etc/supervisord.conf
COPY backend-start.sh /app/backend-start.sh
COPY healthcheck.sh /app/healthcheck.sh
RUN chmod +x /app/backend-start.sh /app/healthcheck.sh

RUN printf '#!/bin/sh\nset -e\nmkdir -p /app/uploads /app/backups\necho "[STARTUP] Nexus ${NEXUS_RELEASE} iniciando..."\nexec /usr/bin/supervisord -c /etc/supervisord.conf\n' \
    > /app/entrypoint.sh \
    && chmod +x /app/entrypoint.sh

VOLUME ["/app/uploads"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD ["/app/healthcheck.sh"]

CMD ["/bin/sh", "/app/entrypoint.sh"]
