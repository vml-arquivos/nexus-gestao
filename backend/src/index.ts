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
import teamsRoutes      from './routes/teams'
import usersRoutes      from './routes/users'
import convitesRoutes       from './routes/convites'
import notificacoesRoutes  from './routes/notificacoes'
import integracoesRoutes   from './routes/integracoes'
import inteligenciaRoutes  from './routes/inteligencia'
import adminRoutes         from './routes/admin'
import { iniciarJobsNotificacao } from './lib/notifHelper'
import { iniciarAgendaAutoSync } from './services/agendaSyncService'
import { iniciarBackupAutomatico } from './services/backupAutoService'

const app = express()
// Necessário em produção atrás do Coolify/Traefik para o express-rate-limit interpretar X-Forwarded-For corretamente.
app.set('trust proxy', 1)
const PORT = parseInt(process.env.PORT || '3001', 10)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://nexus.permupay.com.br'
const DESTRAVA_FRONTEND_URL = process.env.DESTRAVA_FRONTEND_URL || 'https://destravacredito.com'
const CORS_EXTRA_ORIGINS = (process.env.CORS_EXTRA_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)
const FRAME_ANCESTORS = process.env.NEXUS_ALLOWED_FRAME_ANCESTORS || `'self' ${DESTRAVA_FRONTEND_URL} https://destravacredito.com.br`
const UPLOADS_DIR  = process.env.UPLOADS_DIR  || path.join(process.cwd(), 'uploads')

// Garante que o diretório de uploads existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// ── SEGURANÇA ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false,
}))

app.use((_req, res, next) => {
  // Permite abrir o mesmo Nexus dentro do Destrava via iframe controlado por domínio.
  // O valor pode ser ajustado em NEXUS_ALLOWED_FRAME_ANCESTORS no Coolify.
  res.removeHeader('X-Frame-Options')
  res.setHeader('Content-Security-Policy', `frame-ancestors ${FRAME_ANCESTORS}`)
  next()
})

app.use(cors({
  origin: [
    FRONTEND_URL,
    DESTRAVA_FRONTEND_URL,
    'https://destravacredito.com.br',
    'http://localhost:5173',
    'http://localhost:3000',
    ...CORS_EXTRA_ORIGINS,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Integration-Secret', 'X-Nexus-Integration-Secret'],
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
// Anteriormente utilizávamos um limitador dedicado com mensagem de "Muitas tentativas de login" e
// bloqueio por 15 minutos. Esse comportamento prejudicava a experiência do usuário ao atualizar a
// página diversas vezes e foi removido. Mantemos apenas o limitador global acima.


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
// A rota de autenticação não utiliza mais o authLimiter específico.
app.use('/api/auth',        authRoutes)
app.use('/api/tarefas',     tarefasRoutes)
app.use('/api/equipe',      equipeRoutes)
app.use('/api/agenda',      agendaRoutes)
app.use('/api/pagamentos',  pagamentosRoutes)
app.use('/api/uploads',     uploadsRoutes)
app.use('/api/documentos',  documentosRoutes)
app.use('/api/teams',       teamsRoutes)
app.use('/api/users',       usersRoutes)
app.use('/api/convites',       convitesRoutes)
app.use('/api/notificacoes',  notificacoesRoutes)
app.use('/api/integracoes',   integracoesRoutes)
app.use('/api/inteligencia',  inteligenciaRoutes)
app.use('/api/admin',        adminRoutes)

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
async function waitForDb(retries = 30, delay = 3000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1')
      console.log('[DB] ✅ PostgreSQL conectado')
      return
    } catch (err) {
      console.warn(`[DB] Tentativa ${i}/${retries} — aguardando ${delay / 1000}s...`)
      if (i === retries) {
        console.error('[DB] ❌ Não foi possível conectar ao PostgreSQL após todas as tentativas.')
        // Não encerra o processo — permite que o nginx suba e retorne 503 em vez de 502
        return
      }
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

async function start() {
  await waitForDb()

  try {
    const { execSync } = require('child_process')
    execSync('node dist/db/migrate.js', { stdio: 'inherit' })
    console.log('[MIGRATE] ✅ Migrations executadas.')
  } catch {
    console.warn('[MIGRATE] Migração automática ignorada — execute manualmente se necessário.')
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ✅ Nexus API rodando na porta ${PORT}`)
    console.log(`[SERVER] 🌐 Frontend: ${FRONTEND_URL}`)
    console.log(`[SERVER] 📁 Uploads: ${UPLOADS_DIR}`)
    // Inicia jobs de notificação após o servidor subir
    iniciarJobsNotificacao()
    iniciarAgendaAutoSync()
    iniciarBackupAutomatico()
  })
}

start()