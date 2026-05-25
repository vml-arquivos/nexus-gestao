import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'
import pool from './db/pool'

// Rotas
import authRoutes          from './routes/auth'
import tarefasRoutes       from './routes/tarefas'
import equipeRoutes        from './routes/equipe'
import agendaRoutes        from './routes/agenda'
import pagamentosRoutes    from './routes/pagamentos'
import uploadsRoutes       from './routes/uploads'
import documentosRoutes    from './routes/documentos'
import teamsRoutes         from './routes/teams'
import usersRoutes         from './routes/users'
// FIX: rotas existentes que não estavam registradas
import notificacoesRoutes  from './routes/notificacoes'
import relatoriosRoutes    from './routes/relatorios'

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

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── ARQUIVOS ESTÁTICOS (uploads) ──────────────────────────────────────────────
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  etag: true,
  setHeaders: (res, filePath) => {
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
app.use('/api/auth',          authRoutes)
app.use('/api/tarefas',       tarefasRoutes)
app.use('/api/equipe',        equipeRoutes)
app.use('/api/agenda',        agendaRoutes)
app.use('/api/pagamentos',    pagamentosRoutes)
app.use('/api/uploads',       uploadsRoutes)
app.use('/api/documentos',    documentosRoutes)
app.use('/api/teams',         teamsRoutes)
app.use('/api/users',         usersRoutes)
// FIX: registrar rotas que existiam mas não estavam montadas
app.use('/api/notificacoes',  notificacoesRoutes)
app.use('/api/relatorios',    relatoriosRoutes)

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
// FIX: migrate é executado pelo entrypoint.sh antes de subir o processo.
// Removida a chamada duplicada via execSync que causava race condition e
// warnings de "Migração automática ignorada" em produção.
async function start() {
  try {
    await pool.query('SELECT 1')
    console.log('[DB] ✅ PostgreSQL conectado')
  } catch (err) {
    console.error('[DB] ❌ Falha ao conectar ao PostgreSQL:', err)
    process.exit(1)
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ✅ Nexus API rodando na porta ${PORT}`)
    console.log(`[SERVER] 🌐 Frontend: ${FRONTEND_URL}`)
    console.log(`[SERVER] 📁 Uploads: ${UPLOADS_DIR}`)
  })
}

start()
