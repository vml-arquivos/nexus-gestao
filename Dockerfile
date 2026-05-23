# ============================================================
# NEXUS — Dockerfile (multi-stage)
# Stage 1: build com Node
# Stage 2: serve com Nginx (imagem mínima ~25MB)
# ============================================================

# ── Stage 1: Build ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas package.json primeiro para aproveitar cache do Docker
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# Copia o restante do código
COPY . .

# As variáveis VITE_* precisam estar disponíveis em BUILD TIME
# Elas são passadas via --build-arg no docker-compose
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────
FROM nginx:alpine AS production

# Remove config padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia nossa config customizada
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copia o build gerado no Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Permissões corretas
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
