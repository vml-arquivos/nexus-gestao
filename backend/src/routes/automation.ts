/**
 * automation.ts
 *
 * Recebe os eventos de domínio que o Destrava emite (Contrato assinado/
 * encerrado, rotinas CND/CEMPROT vencidas, acompanhamento bancário criado,
 * semana concluída, etc.) e expõe endpoints operacionais de outbox para
 * administradores -- espelha server/routes/automationEngine.ts do Destrava.
 *
 * Exporta dois routers: o default (endpoint de eventos), montado em
 * /api/integracoes ao lado de routes/integracoes.ts, e `opsRouter`
 * (visibilidade/retry do outbox), montado em /api/automation -- mantidos
 * separados para que cada prefixo só exponha o que faz sentido nele.
 */
import { Router, Request, Response } from 'express'
import { authMiddleware, adminOrDevOnly } from '../middleware/auth'
import { requireIntegrationSecret } from './integracoes'
import { requireWebhookSignature } from '../middleware/webhookAuth'
import { inserirEvento, buscarEventoPorId, pool } from '../services/automation/outboxRepository'
import { despacharAgora } from '../services/automation/dispatcher'
import { handleContratoAssinado, handleContratoEncerrado } from './automationHandlers/contrato'
import { handleRotinaCndDue, handleRotinaCemprotDue } from './automationHandlers/rotinas'
import { handleAcompanhamentoCriado, handleSemanaConcluida } from './automationHandlers/acompanhamento'

const router = Router()
export const opsRouter = Router()

type HandlerEvento = (payload: Record<string, unknown>, eventoId: string) => Promise<unknown>

const HANDLERS: Record<string, HandlerEvento> = {
  ContratoAssinado: (payload) => handleContratoAssinado(payload),
  ContratoValidado: (payload) => handleContratoAssinado(payload),
  ContratoEncerrado: (payload) => handleContratoEncerrado(payload),
  RotinaCndDue: (payload) => handleRotinaCndDue(payload),
  RotinaCemprotDue: (payload) => handleRotinaCemprotDue(payload),
  AcompanhamentoCriado: (payload) => handleAcompanhamentoCriado(payload),
  SemanaConcluida: (payload) => handleSemanaConcluida(payload),
}

// ── Recebimento de eventos do Destrava ────────────────────────────────────
router.post(
  '/destrava/eventos',
  requireIntegrationSecret,
  requireWebhookSignature,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body || {}
      const eventType = String(body.event_type || '').trim()
      const idempotencyKey = String(body.idempotency_key || '').trim()
      const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Record<string, unknown>

      if (!eventType || !idempotencyKey) {
        res.status(400).json({ error: 'event_type e idempotency_key são obrigatórios.' })
        return
      }

      // Ledger de idempotência: se já processamos esse evento antes (mesma
      // chave), não reprocessa -- responde sucesso para o Destrava parar de
      // reentregar, sem rodar o handler de novo.
      const evento = await inserirEvento({
        eventType,
        aggregateType: String(body.aggregate_type || ''),
        aggregateId: body.aggregate_id ? String(body.aggregate_id) : undefined,
        idempotencyKey,
        payload,
        correlationId: body.correlation_id ? String(body.correlation_id) : undefined,
      })

      if (!evento) {
        res.json({ ok: true, duplicado: true })
        return
      }

      const handler = HANDLERS[eventType]
      if (!handler) {
        // Evento reconhecido pelo catálogo mas sem handler implementado ainda
        // nesta entrega -- aceita e registra, não derruba a entrega do Destrava.
        await pool.query(`UPDATE automation_events SET status = 'dispatched', dispatched_at = NOW() WHERE id = $1`, [evento.id])
        res.json({ ok: true, aviso: `event_type '${eventType}' recebido, sem handler implementado.` })
        return
      }

      const resultado = await handler(payload, evento.id)
      await pool.query(`UPDATE automation_events SET status = 'dispatched', dispatched_at = NOW() WHERE id = $1`, [evento.id])
      res.json({ ok: true, resultado: resultado ?? undefined })
    } catch (err: any) {
      console.error('[AUTOMATION] Erro ao processar evento do Destrava:', err)
      res.status(500).json({ error: err?.message || 'Erro ao processar evento.' })
    }
  }
)

// ── Endpoints operacionais (ops/admin) ────────────────────────────────────
opsRouter.get('/events', authMiddleware, adminOrDevOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : null
    const limite = Math.min(Number(req.query.limit) || 50, 200)
    const { rows } = status
      ? await pool.query(`SELECT * FROM automation_events WHERE status = $1 ORDER BY created_at DESC LIMIT $2`, [status, limite])
      : await pool.query(`SELECT * FROM automation_events ORDER BY created_at DESC LIMIT $1`, [limite])
    res.json({ events: rows })
  } catch (err) {
    console.error('[GET /api/automation/events]', err)
    res.status(500).json({ error: 'Erro ao listar eventos do Automation Engine.' })
  }
})

opsRouter.post('/events/:id/retry', authMiddleware, adminOrDevOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const evento = await buscarEventoPorId(req.params.id)
    if (!evento) {
      res.status(404).json({ error: 'Evento não encontrado.' })
      return
    }
    await despacharAgora(evento)
    const atualizado = await buscarEventoPorId(req.params.id)
    res.json({ event: atualizado })
  } catch (err) {
    console.error('[POST /api/automation/events/:id/retry]', err)
    res.status(500).json({ error: 'Erro ao reprocessar evento.' })
  }
})

export default router
