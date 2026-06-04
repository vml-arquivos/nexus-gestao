import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { addSseClient, removeSseClient } from '../lib/notifHelper'
import { deactivatePushSubscription, ensurePushSchema, getVapidPublicKey, pushConfigured, upsertPushSubscription } from '../services/pushService'

const router = Router()

// ── SSE: conexão em tempo real (sem authMiddleware pois usa token na query) ───
// GET /api/notificacoes/stream?token=<jwt>
router.get('/stream', authMiddleware, (req: Request, res: Response): void => {
  const { userId } = req.user!

  // Cabeçalhos SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Desativa buffering no nginx
  res.flushHeaders()

  // Heartbeat a cada 25s para manter a conexão viva
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch { /* ignore */ }
  }, 25_000)

  addSseClient(userId, res)

  req.on('close', () => {
    clearInterval(hb)
    removeSseClient(userId, res)
  })
})

router.use(authMiddleware)

// GET /api/notificacoes/push/status
router.get('/push/status', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensurePushSchema()
    const { userId, orgId } = req.user!
    const count = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM push_subscriptions WHERE org_id = $1 AND user_id = $2 AND active = TRUE`,
      [orgId, userId]
    )
    res.json({
      supported: true,
      configured: pushConfigured(),
      publicKey: getVapidPublicKey(),
      subscriptions: Number(count?.count || 0),
      subject: process.env.WEB_PUSH_SUBJECT || process.env.VAPID_SUBJECT || null,
    })
  } catch (err) {
    console.error('[PUSH] Erro ao buscar status:', err)
    res.status(500).json({ error: 'Erro ao buscar status do push.' })
  }
})

// POST /api/notificacoes/push/subscribe
router.post('/push/subscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, orgId } = req.user!
    const sub = req.body?.subscription || req.body
    const endpoint = String(sub?.endpoint || '').trim()
    const p256dh = String(sub?.keys?.p256dh || '').trim()
    const auth = String(sub?.keys?.auth || '').trim()
    if (!pushConfigured()) {
      res.status(400).json({ error: 'Push não configurado no servidor. Configure WEB_PUSH_PUBLIC_KEY e WEB_PUSH_PRIVATE_KEY.' })
      return
    }
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: 'Assinatura push inválida.' })
      return
    }
    await upsertPushSubscription({
      orgId,
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: String(req.headers['user-agent'] || ''),
      deviceLabel: String(req.body?.device_label || req.body?.deviceLabel || ''),
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[PUSH] Erro ao salvar assinatura:', err)
    res.status(500).json({ error: 'Erro ao ativar push.' })
  }
})

// POST /api/notificacoes/push/unsubscribe
router.post('/push/unsubscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.user!
    const endpoint = String(req.body?.endpoint || '').trim()
    if (endpoint) await deactivatePushSubscription({ userId, endpoint })
    res.json({ ok: true })
  } catch (err) {
    console.error('[PUSH] Erro ao desativar assinatura:', err)
    res.status(500).json({ error: 'Erro ao desativar push.' })
  }
})


// GET /api/notificacoes
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, orgId } = req.user!
    const apenasNaoLidas = req.query.apenas_nao_lidas === 'true'

    let sql = `SELECT * FROM notificacoes WHERE user_id = $1 AND org_id = $2`
    const params: unknown[] = [userId, orgId]
    if (apenasNaoLidas) sql += ` AND lida = false`
    sql += ` ORDER BY created_at DESC LIMIT 50`

    const notificacoes = await query(sql, params)
    const contagem = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notificacoes WHERE user_id=$1 AND org_id=$2 AND lida=false`,
      [userId, orgId]
    )

    res.json({ notificacoes, nao_lidas: parseInt(contagem?.count || '0') })
  } catch (err) {
    console.error('[NOTIF] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar notificações.' })
  }
})



// GET /api/notificacoes/atrasos-pendentes
// Resumo diário para popup ao acessar o sistema: tarefas, financeiro e compromissos atrasados.
router.get('/atrasos-pendentes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, orgId, role } = req.user!
    const gestorLike = ['admin', 'dev', 'gestor', 'sub_gestor'].includes(String(role || ''))

    const tarefasRows = await query<any>(
      `SELECT id, titulo, prazo, status, prioridade, responsavel_id, criado_por, aceita_por, checklist,
              COALESCE(modo_distribuicao, 'normal') AS modo_distribuicao,
              (CURRENT_DATE - prazo::date)::int AS dias_atraso
       FROM tarefas
       WHERE org_id = $1
         AND prazo IS NOT NULL
         AND prazo::date < CURRENT_DATE
         AND status IN ('pendente','em_progresso','devolvida','reenviada')
       ORDER BY prazo ASC
       LIMIT 80`,
      [orgId]
    )
    const tarefas = tarefasRows.filter(t => {
      if (gestorLike) return true
      if (t.responsavel_id === userId || t.criado_por === userId || t.aceita_por === userId) return true
      if (!t.responsavel_id || t.modo_distribuicao === 'livre_equipe') return true
      const raw = Array.isArray(t.checklist) ? t.checklist : []
      return raw.some((i: any) => i?.responsavel_id === userId)
    }).slice(0, 30).map(t => ({
      id: t.id,
      tipo: 'tarefa',
      titulo: t.titulo,
      detalhe: `Atrasada há ${Number(t.dias_atraso || 1)} dia(s).`,
      destino: `/tarefas?task=${t.id}`,
      dias_atraso: Number(t.dias_atraso || 1),
      nivel: Number(t.dias_atraso || 0) >= 3 ? 'critico' : 'alto',
    }))

    const financeiros = await query<any>(
      `SELECT p.id, p.titulo, p.tipo, p.valor::text, p.vencimento,
              COALESCE(pe.nome, p.pessoa_nome, '') AS pessoa_nome,
              (CURRENT_DATE - p.vencimento::date)::int AS dias_atraso
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.org_id = $1
         AND p.status = 'pendente'
         AND p.vencimento IS NOT NULL
         AND p.vencimento::date < CURRENT_DATE
         ${gestorLike ? '' : 'AND p.criado_por = $2'}
       ORDER BY p.vencimento ASC
       LIMIT 50`,
      gestorLike ? [orgId] : [orgId, userId]
    )

    const financeiro = financeiros.map(f => ({
      id: f.id,
      tipo: f.tipo === 'recebimento' ? 'recebimento' : 'pagamento',
      titulo: f.titulo,
      detalhe: `${f.tipo === 'recebimento' ? 'A receber' : 'A pagar'}${f.pessoa_nome ? ` · ${f.pessoa_nome}` : ''} · ${Number(f.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · atrasado há ${Number(f.dias_atraso || 1)} dia(s).`,
      destino: '/financeiro',
      dias_atraso: Number(f.dias_atraso || 1),
      nivel: Number(f.dias_atraso || 0) >= 3 ? 'critico' : 'alto',
    }))

    const eventos = await query<any>(
      `SELECT id, titulo, data_inicio,
              EXTRACT(EPOCH FROM (NOW() - data_inicio))/3600 AS horas_atraso
       FROM agenda
       WHERE org_id = $1
         AND data_inicio < NOW()
         AND data_inicio >= NOW() - INTERVAL '7 days'
         ${gestorLike ? '' : 'AND criado_por = $2'}
       ORDER BY data_inicio ASC
       LIMIT 30`,
      gestorLike ? [orgId] : [orgId, userId]
    )

    const agenda = eventos.map(e => ({
      id: e.id,
      tipo: 'agenda',
      titulo: e.titulo,
      detalhe: `Compromisso passou há ${Math.max(1, Math.round(Number(e.horas_atraso || 1)))} hora(s).`,
      destino: '/agenda',
      nivel: Number(e.horas_atraso || 0) >= 24 ? 'alto' : 'medio',
    }))

    res.json({ total: tarefas.length + financeiro.length + agenda.length, tarefas, financeiro, agenda, gerado_em: new Date().toISOString() })
  } catch (err) {
    console.error('[NOTIF] Erro ao buscar atrasos pendentes:', err)
    res.status(500).json({ error: 'Erro ao buscar atrasos pendentes.' })
  }
})

// PATCH /api/notificacoes/ler-todas
router.patch('/ler-todas', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, orgId } = req.user!
    await query(
      `UPDATE notificacoes SET lida = true WHERE user_id=$1 AND org_id=$2 AND lida=false`,
      [userId, orgId]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[NOTIF] Erro ao marcar todas lidas:', err)
    res.status(500).json({ error: 'Erro.' })
  }
})

// PATCH /api/notificacoes/:id/ler
router.patch('/:id/ler', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, orgId } = req.user!
    await queryOne(
      `UPDATE notificacoes SET lida = true WHERE id=$1 AND user_id=$2 AND org_id=$3`,
      [req.params.id, userId, orgId]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[NOTIF] Erro ao marcar lida:', err)
    res.status(500).json({ error: 'Erro.' })
  }
})

// DELETE /api/notificacoes/antigas
router.delete('/antigas', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, orgId } = req.user!
    await query(
      `DELETE FROM notificacoes WHERE user_id=$1 AND org_id=$2 AND lida=true
       AND created_at < NOW() - INTERVAL '30 days'`,
      [userId, orgId]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[NOTIF] Erro ao limpar:', err)
    res.status(500).json({ error: 'Erro.' })
  }
})

export default router
