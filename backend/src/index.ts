import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'
import pool, { getPoolStatus } from './db/pool'

// Rotas
import authRoutes       from './routes/auth'
import tarefasScoringRoutes from './routes/tarefasScoring'
import tarefasRoutes    from './routes/tarefas'
import iaChecklistRoutes from './routes/iaChecklist'
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
import automationRoutes, { opsRouter as automationOpsRoutes } from './routes/automation'
import automationRulesRoutes from './routes/automationRules'
import inteligenciaRoutes  from './routes/inteligencia'
import adminRoutes         from './routes/admin'
import { iniciarJobsNotificacao } from './lib/notifHelper'
import { iniciarAgendaAutoSync } from './services/agendaSyncService'
import { iniciarBackupAutomatico } from './services/backupAutoService'
import { iniciarRecorrenciaTarefas } from './services/recorrenciaTarefasService'
import { executarVarreduraOutboxAutomation } from './services/automation/dispatcher'
import { avaliarAlertasAutomacao } from './services/automation/alertJob'
import { runClusterSingletonJob } from './lib/clusterJob'
import { NEXUS_RELEASE, NEXUS_RELEASE_DATE } from './release'

const app = express()
// Necessário em produção atrás do Coolify/Traefik para o express-rate-limit interpretar X-Forwarded-For corretamente.
app.set('trust proxy', 1)
const PORT = parseInt(process.env.PORT || '3001', 10)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://nexus.permupay.com.br'
const DESTRAVA_FRONTEND_URL = process.env.DESTRAVA_FRONTEND_URL || 'https://destravacredito.com'
const CORS_EXTRA_ORIGINS = (process.env.CORS_EXTRA_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)
const FRAME_ANCESTORS = process.env.NEXUS_ALLOWED_FRAME_ANCESTORS || `'self' ${DESTRAVA_FRONTEND_URL} https://destravacredito.com.br`
const UPLOADS_DIR  = process.env.UPLOADS_DIR  || path.join(process.cwd(), 'uploads')

app.use((_req, res, next) => {
  res.setHeader('X-Nexus-Release', NEXUS_RELEASE)
  next()
})

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
// bloqueio por 15 minutos. Esse comportamento prejudicava a experiência do usuário ao atualizar a
// página diversas vezes e foi removido. Mantemos apenas o limitador global acima.


app.use(express.json({
  limit: '10mb',
  // Preserva o corpo bruto para verificação de assinatura HMAC do
  // Automation Engine (middleware/webhookAuth.ts) -- não afeta o parsing normal.
  verify: (req, _res, buf) => { (req as any).rawBody = buf },
}))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── ARQUIVOS ────────────────────────────────────────────────────────────────────
// Uploads não são expostos como conteúdo estático. A rota autenticada
// /api/uploads/file/:filename valida ticket, organização, recurso e registro
// antes de abrir o arquivo físico.

// ── VERSÃO / HEALTH CHECK ─────────────────────────────────────────────────────
const versionPayload = () => ({
  name: 'nexus-gestao',
  release: NEXUS_RELEASE,
  release_date: NEXUS_RELEASE_DATE,
  node: process.version,
})

const livePayload = () => ({
  status: 'ok',
  service: 'nexus-api',
  release: NEXUS_RELEASE,
  uptime_seconds: Math.round(process.uptime()),
})

app.get('/version', (_req, res) => res.json(versionPayload()))
app.get('/api/version', (_req, res) => res.json(versionPayload()))
app.get('/health/live', (_req, res) => res.json(livePayload()))
app.get('/api/health/live', (_req, res) => res.json(livePayload()))

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({
      status: 'ok',
      db: 'connected',
      release: NEXUS_RELEASE,
      pool: getPoolStatus(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    res.setHeader('Retry-After', '3')
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      release: NEXUS_RELEASE,
      pool: getPoolStatus(),
      error: error instanceof Error ? error.message : 'database unavailable',
    })
  }
})
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected', release: NEXUS_RELEASE, pool: getPoolStatus() })
  } catch {
    res.setHeader('Retry-After', '3')
    res.status(503).json({ status: 'error', db: 'disconnected', release: NEXUS_RELEASE, pool: getPoolStatus() })
  }
})

// ── ROTAS API ─────────────────────────────────────────────────────────────────
// A rota de autenticação não utiliza mais o authLimiter específico.
app.use('/api/auth',        authRoutes)
app.use('/api/tarefas',     tarefasScoringRoutes)
app.use('/api/tarefas',     tarefasRoutes)
app.use('/api/tarefas',     iaChecklistRoutes)
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
app.use('/api/integracoes',   automationRoutes)
app.use('/api/automation',    automationOpsRoutes)
app.use('/api/automation/rules', automationRulesRoutes)
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
async function waitForDb(retries = 3, delay = 2000): Promise<void> {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ✅ Nexus API rodando na porta ${PORT}`)
    console.log(`[SERVER] 🌐 Frontend: ${FRONTEND_URL}`)
    console.log(`[SERVER] 📁 Uploads: ${UPLOADS_DIR}`)
    // Inicia jobs de notificação após o servidor subir
    iniciarJobsNotificacao()
    iniciarAgendaAutoSync()
    iniciarBackupAutomatico()
    iniciarRecorrenciaTarefas()

    // Automation Engine: varredura de retry do outbox (mesmo padrão setInterval
    // dos jobs de notificação acima -- entrega eventos que o despacho imediato
    // não conseguiu concluir).
    const intervaloRetryMs = Number(process.env.AUTOMATION_RETRY_INTERVAL_MS || 60_000)
    const runOutbox = () => runClusterSingletonJob(
      'automation-outbox',
      () => executarVarreduraOutboxAutomation().then(() => undefined),
    )
    setInterval(() => { void runOutbox() }, intervaloRetryMs)
    setTimeout(() => { void runOutbox() }, 180_000)

    // Ladder de alertas 7d/3d/1d/hoje/atrasado das rotinas e acompanhamentos.
    const runAlerts = () => runClusterSingletonJob(
      'automation-alerts',
      () => avaliarAlertasAutomacao().then(() => undefined),
    )
    setInterval(() => { void runAlerts() }, 30 * 60_000)
    setTimeout(() => { void runAlerts() }, 330_000)
  })
}

start()
