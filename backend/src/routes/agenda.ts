import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
import { sincronizarAgendaOperacional } from '../services/agendaSyncService'

const router = Router()
router.use(authMiddleware)

function shouldAutoSync(req: Request) {
  return req.query.sync !== 'false'
}

function canSeeOrgAgenda(role: string | undefined): boolean {
  return canDeleteOrgRecords(role)
}

async function trySyncForUser(req: Request) {
  if (!shouldAutoSync(req)) return null
  try {
    return await sincronizarAgendaOperacional({ orgId: req.user!.orgId, userId: req.user!.userId, forceGoogle: true })
  } catch (err) {
    console.warn('[AGENDA] Sincronização automática antes da listagem falhou:', (err as Error)?.message || err)
    return null
  }
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { mes, ano } = req.query
    const sync = await trySyncForUser(req)

    const params: unknown[] = [orgId]
    let sql = 'SELECT * FROM agenda WHERE org_id = $1'

    if (!canSeeOrgAgenda(role)) {
      params.push(userId)
      sql += ` AND (criado_por = $${params.length} OR participantes::text ILIKE $${params.length + 1})`
      params.push(`%${userId}%`)
    }

    if (mes && ano) {
      sql += ` AND EXTRACT(MONTH FROM data_inicio) = $${params.length + 1} AND EXTRACT(YEAR FROM data_inicio) = $${params.length + 2}`
      params.push(mes, ano)
    }

    sql += ` ORDER BY data_inicio ASC, created_at ASC`
    const eventos = await query(sql, params)
    res.json({ eventos, sync })
  } catch (err) {
    console.error('[AGENDA] Erro ao buscar agenda:', err)
    res.status(500).json({ error: 'Erro ao buscar agenda.' })
  }
})

router.post('/sincronizar', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sincronizarAgendaOperacional({ orgId: req.user!.orgId, userId: req.user!.userId, forceGoogle: true })
    res.json({ ok: result.ok, result })
  } catch (err) {
    console.error('[AGENDA] Erro ao sincronizar agenda:', err)
    res.status(500).json({ error: (err as Error)?.message || 'Erro ao sincronizar agenda.' })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { titulo, descricao, data_inicio, data_fim, local, tipo = 'compromisso', participantes = [], lembrete_minutos = 15, cor } = req.body
    if (!titulo || !data_inicio) { res.status(400).json({ error: 'Título e data de início são obrigatórios.' }); return }
    const evento = await queryOne(
      `INSERT INTO agenda (org_id, criado_por, titulo, descricao, data_inicio, data_fim, local, tipo, participantes, lembrete_minutos, cor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [orgId, userId, titulo.trim(), descricao || null, data_inicio, data_fim || null, local || null, tipo, JSON.stringify(participantes), lembrete_minutos, cor || null]
    )
    res.status(201).json({ evento })
  } catch (err) {
    console.error('[AGENDA] Erro ao criar evento:', err)
    res.status(500).json({ error: 'Erro ao criar evento.' })
  }
})

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { titulo, descricao, data_inicio, data_fim, local, tipo, participantes, lembrete_minutos, cor } = req.body
    const evento = await queryOne(
      `UPDATE agenda SET
         titulo = COALESCE($1,titulo), descricao = COALESCE($2,descricao),
         data_inicio = COALESCE($3,data_inicio), data_fim = COALESCE($4,data_fim),
         local = COALESCE($5,local), tipo = COALESCE($6,tipo),
         participantes = COALESCE($7,participantes), lembrete_minutos = COALESCE($8,lembrete_minutos),
         cor = COALESCE($9,cor), updated_at = NOW()
       WHERE id = $10 AND org_id = $11 AND ($12::boolean = TRUE OR criado_por = $13) RETURNING *`,
      [titulo||null, descricao||null, data_inicio||null, data_fim||null, local||null, tipo||null,
       participantes ? JSON.stringify(participantes) : null, lembrete_minutos||null, cor||null, req.params.id, orgId, canSeeOrgAgenda(role), userId]
    )
    if (!evento) { res.status(404).json({ error: 'Evento não encontrado ou sem permissão.' }); return }
    res.json({ evento })
  } catch (err) {
    console.error('[AGENDA] Erro ao atualizar evento:', err)
    res.status(500).json({ error: 'Erro ao atualizar evento.' })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const canDeleteAny = canDeleteOrgRecords(role)
    const deleted = await query(
      `DELETE FROM agenda
       WHERE id = $1 AND org_id = $2 AND ($3::boolean = TRUE OR criado_por = $4)
       RETURNING id`,
      [req.params.id, orgId, canDeleteAny, userId]
    ) as any[]
    if (deleted.length === 0) { res.status(404).json({ error: 'Evento não encontrado ou sem permissão.' }); return }
    res.json({ ok: true })
  } catch (err) {
    console.error('[AGENDA] Erro ao excluir evento:', err)
    res.status(500).json({ error: 'Erro ao excluir evento.' })
  }
})

export default router
