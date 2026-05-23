import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'
import pool from './db/pool'

// Rotas
import authRoutes       from './routes/auth'
import tarefasRoutes    from './routes/tarefas'
import equipeRoutes     from './routes/equipe'
import agendaRoutes     from './routes/agenda'
import pagamentosRoutes from './routes/pagamentos'
import uploadsRoutes    from './routes/uploads'
import documentosRoutes from './routes/documentos'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://nexus.permupay.com.br'
const UPLOADS_DIR  = process.env.UPLOADS_DIR  || path.join(process.cwd(), 'uploads')

// Garante que o diretório de uploads existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// ── SEGURANÇA ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

app.use(cors({
  origin: [
    FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
}))

// Rate limiting mais restrito para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
})

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── ARQUIVOS ESTÁTICOS (uploads) ──────────────────────────────────────────────
// Servir arquivos de upload publicamente via /uploads/:filename
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  etag: true,
  setHeaders: (res, filePath) => {
    // Permite visualização inline de imagens e PDFs
    const ext = path.extname(filePath).toLowerCase()
    if (['.jpg','.jpeg','.png','.webp','.gif','.pdf'].includes(ext)) {
      res.setHeader('Content-Disposition', 'inline')
    }
  },
}))

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

// ── ROTAS API ─────────────────────────────────────────────────────────────────
app.use('/api/auth',        authLimiter, authRoutes)
app.use('/api/tarefas',     tarefasRoutes)
app.use('/api/equipe',      equipeRoutes)
app.use('/api/agenda',      agendaRoutes)
app.use('/api/pagamentos',  pagamentosRoutes)
app.use('/api/uploads',     uploadsRoutes)
app.use('/api/documentos',  documentosRoutes)

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
})

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SERVER] Erro não tratado:', err)
  res.status(500).json({ error: 'Erro interno do servidor.' })
})

// ── STARTUP ───────────────────────────────────────────────────────────────────
async function start() {
  try {
    await pool.query('SELECT 1')
    console.log('[DB] ✅ PostgreSQL conectado')
  } catch (err) {
    console.error('[DB] ❌ Falha ao conectar ao PostgreSQL:', err)
    process.exit(1)
  }

  try {
    const { execSync } = require('child_process')
    execSync('node dist/db/migrate.js', { stdio: 'inherit' })
  } catch {
    console.warn('[MIGRATE] Migração automática ignorada em modo dev — execute manualmente se necessário.')
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ✅ Nexus API rodando na porta ${PORT}`)
    console.log(`[SERVER] 🌐 Frontend: ${FRONTEND_URL}`)
    console.log(`[SERVER] 📁 Uploads: ${UPLOADS_DIR}`)
  })
}

start()
