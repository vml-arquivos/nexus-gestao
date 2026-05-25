# ============================================================
# NEXUS GESTÃO — Dockerfile Unificado (Coolify)
# ============================================================

# ── STAGE 1: Build do Backend ─────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY backend/ .
RUN npx tsc --skipLibCheck || true

# ── STAGE 2: Build do Frontend ────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY . .
RUN rm -rf backend
RUN npm run build

# ── STAGE 3: Produção ─────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache nginx supervisor wget

# Backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
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
echo "[STARTUP] Aguardando PostgreSQL..."\n\
i=0\n\
until node -e "const {Client}=require('"'"'pg'"'"');const c=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='"'"'true'"'"'?{rejectUnauthorized:false}:false});c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do\n\
  i=$((i+1))\n\
  [ $i -ge 20 ] && echo "[STARTUP] DB nao respondeu. Abortando." && exit 1\n\
  echo "[STARTUP] Tentativa $i/20 — aguardando 3s..."\n\
  sleep 3\n\
done\n\
echo "[STARTUP] PostgreSQL OK."\n\
cd /app/backend && node dist/db/migrate.js 2>/dev/null && echo "[STARTUP] Migrations OK." || echo "[STARTUP] Migrations ignoradas."\n\
exec /usr/bin/supervisord -c /etc/supervisord.conf\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

VOLUME ["/app/uploads"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=5 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
