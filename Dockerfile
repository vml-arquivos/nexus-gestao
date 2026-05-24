# ============================================================
# NEXUS GESTÃO — Dockerfile Unificado (Coolify)
# Container único: Nginx (porta 80) + Node.js API (porta 3001)
# supervisord gerencia os dois processos
# ============================================================

# ── STAGE 1: Build do Backend (TypeScript → JavaScript) ──────
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
# Copia projeto (exceto backend — removido abaixo)
COPY . .
RUN rm -rf backend
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
# Resultado: /app/frontend/dist

# ── STAGE 3: Imagem de produção unificada ────────────────────
FROM node:20-alpine AS production

# nginx + supervisor + wget (health check)
RUN apk add --no-cache nginx supervisor wget

# ── Backend: dependências de produção ────────────────────────
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY --from=backend-builder /app/backend/dist ./dist

# ── Frontend: arquivos estáticos para o nginx ─────────────────
RUN mkdir -p /usr/share/nginx/html
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# ── Nginx: limpa config padrão e usa a nossa ──────────────────
# Alpine nginx usa /etc/nginx/http.d/ (não /etc/nginx/conf.d/)
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.unified.conf /etc/nginx/http.d/app.conf

# ── Supervisor: gerencia nginx + node ────────────────────────
COPY supervisord.conf /etc/supervisord.conf

# ── Entrypoint: retry no DB → migrate → supervisord ──────────
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Volume para uploads persistentes (configurar no Coolify)
VOLUME ["/app/uploads"]

EXPOSE 80

# Health check generoso: container leva ~30s para subir (migrate + node start)
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=5 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "/app/entrypoint.sh"]
