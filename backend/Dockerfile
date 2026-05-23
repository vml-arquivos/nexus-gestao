FROM node:20-alpine AS builder

WORKDIR /app

# Copia manifesto e instala dependências
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install

# Copia código fonte e compila TypeScript
COPY . .
RUN npm run build 2>/dev/null || npx tsc --skipLibCheck

# ── Imagem de produção ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Instala apenas dependências de produção
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copia build compilado
COPY --from=builder /app/dist ./dist

# Diretório persistente para uploads
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
