# ============================================================
# NEXUS GESTÃO — Dockerfile Unificado
# ============================================================

# ── STAGE 1: Backend ──────────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --registry https://registry.npmjs.org
COPY backend/ .
RUN npx tsc --skipLibCheck || true

# ── STAGE 2: Frontend ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
# .npmrc garante registry correto; deletar lock evita entradas corrompidas
COPY .npmrc* ./
COPY package.json ./
# Força resolução limpa sem package-lock corrompido
RUN npm install --registry https://registry.npmjs.org
COPY . .
RUN rm -rf backend
RUN npm run build

# ── STAGE 3: Produção ─────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache nginx supervisor wget

WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --omit=dev --registry https://registry.npmjs.org
COPY --from=backend-builder /app/backend/dist ./dist

RUN mkdir -p /usr/share/nginx/html
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.unified.conf /etc/nginx/http.d/app.conf
COPY supervisord.conf /etc/supervisord.conf

RUN printf '#!/bin/sh\n\
mkdir -p /app/uploads\n\
echo "[STARTUP] Aguardando PostgreSQL..."\n\
i=0\n\
until node -e "const {Client}=require('"'"'pg'"'"');const c=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='"'"'true'"'"'?{rejectUnauthorized:false}:false});c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do\n\
  i=$((i+1)); [ $i -ge 20 ] && echo "[STARTUP] DB timeout." && exit 1\n\
  echo "[STARTUP] Tentativa $i/20..."; sleep 3\n\
done\n\
echo "[STARTUP] PostgreSQL OK."\n\
cd /app/backend && node dist/db/migrate.js 2>/dev/null && echo "[STARTUP] Migrations OK." || echo "[STARTUP] Migrations ignoradas."\n\
exec /usr/bin/supervisord -c /etc/supervisord.conf\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

VOLUME ["/app/uploads"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
