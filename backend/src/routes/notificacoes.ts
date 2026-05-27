import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { addSseClient, removeSseClient } from '../lib/notifHelper'

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
