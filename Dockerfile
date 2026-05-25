# ============================================================
# NEXUS GESTÃO — Dockerfile Unificado (Coolify)
# ============================================================

# ── STAGE 1: Build do Backend ─────────────────────────────────
FROM node:22-alpine AS backend-builder
#
# Configurações para instalação do NPM
#
# - NPM_CONFIG_REGISTRY: força o npm a utilizar o registro público oficial
#   em vez do registro interno da plataforma (packages.applied‑caas‑gateway1).
#   Isso torna o processo de instalação mais resiliente quando o registro
#   corporativo está indisponível ou lento. Sem essa linha, o build tenta
#   buscar pacotes do registro interno e sofre timeouts como visto nos logs
#   (ETIMEDOUT ao baixar react‑is).  Usar o registry público é seguro e
#   recomendado para projetos open source que publicam suas dependências.
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
    NPM_CONFIG_CACHE=/root/.npm
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
# FIX: cache mount preserva o cache npm entre builds — elimina re-download de 192 pacotes
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY backend/ .
RUN npm run build

# ── STAGE 2: Build do Frontend ────────────────────────────────
FROM node:22-alpine AS frontend-builder
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
    NPM_CONFIG_CACHE=/root/.npm
WORKDIR /app/frontend
COPY package.json package-lock.json ./
# FIX: cache mount preserva o cache npm entre builds — elimina re-download de 554 pacotes
# --prefer-offline usa o cache local antes de ir à rede (mais resiliente a timeouts)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline
COPY . .
RUN rm -rf backend
RUN npm run build

# ── STAGE 3: Produção ─────────────────────────────────────────
FROM node:22-alpine AS production
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
    NPM_CONFIG_CACHE=/root/.npm

RUN apk add --no-cache nginx supervisor wget

# Backend production dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund --prefer-offline
COPY --from=backend-builder /app/backend/dist ./dist

# Frontend build
RUN mkdir -p /usr/share/nginx/html
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Configs
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.unified.conf /etc/nginx/http.d/app.conf
COPY supervisord.conf /etc/supervisord.conf

# Entrypoint embutido — falhas de banco/migration não são ocultadas
RUN printf '#!/bin/sh\n\
set -e\n\
mkdir -p /app/uploads\n\
echo "[STARTUP] Aguardando PostgreSQL..."\n\
i=0\n\
until node -e "const {Client}=require('"'"'pg'"'"');const c=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='"'"'true'"'"'?{rejectUnauthorized:false}:false});c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1))"; do\n\
  i=$((i+1))\n\
  [ $i -ge 20 ] && echo "[STARTUP] DB nao respondeu. Abortando." && exit 1\n\
  echo "[STARTUP] Tentativa $i/20 — aguardando 3s..."\n\
  sleep 3\n\
done\n\
echo "[STARTUP] PostgreSQL OK."\n\
echo "[STARTUP] Aplicando migrations..."\n\
cd /app/backend && node dist/db/migrate.js\n\
echo "[STARTUP] Migrations OK."\n\
exec /usr/bin/supervisord -c /etc/supervisord.conf\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

VOLUME ["/app/uploads"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=5 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
