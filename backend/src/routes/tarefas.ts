import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware, gestorOnly } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// ── LISTAR TAREFAS ────────────────────────────────────────────────────────────
// GET /api/tarefas
// Gestor: vê todas da organização
// Membro: vê apenas as atribuídas a ele
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { status, prioridade, responsavel_id } = req.query

    let sql = `
      SELECT t.*,
             p.nome AS responsavel_nome_perfil,
             c.nome AS criado_por_nome
      FROM tarefas t
      LEFT JOIN profiles p ON p.id = t.responsavel_id
      LEFT JOIN profiles c ON c.id = t.criado_por
      WHERE t.org_id = $1
    `
    const params: unknown[] = [orgId]
    let idx = 2

    // Membro só vê as suas tarefas
    if (role === 'membro') {
      sql += ` AND t.responsavel_id = $${idx++}`
      params.push(userId)
    }

    if (status) { sql += ` AND t.status = $${idx++}`; params.push(status) }
    if (prioridade) { sql += ` AND t.prioridade = $${idx++}`; params.push(prioridade) }
    if (responsavel_id && (role === 'gestor' || role === 'sub_gestor')) {
      sql += ` AND t.responsavel_id = $${idx++}`
      params.push(responsavel_id)
    }

    sql += ' ORDER BY t.created_at DESC'

    const tarefas = await query(sql, params)
    res.json({ tarefas })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefas.' })
  }
})

// ── CRIAR TAREFA ──────────────────────────────────────────────────────────────
// POST /api/tarefas
// Gestores e sub-gestores podem criar tarefas. Membros não.
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    // Permite apenas gestores e sub-gestores
    if (role !== 'gestor' && role !== 'sub_gestor') {
      res.status(403).json({ error: 'Somente gestores ou sub-gestores podem criar tarefas.' })
      return
    }
    const { titulo, descricao, data, prazo, prioridade = 'media', responsavel_id, checklist = [], obs } = req.body

    if (!titulo?.trim()) {
      res.status(400).json({ error: 'Título é obrigatório.' })
      return
    }

    // Busca nome do responsável se fornecido
    let responsavelNome: string | null = null
    if (responsavel_id) {
      const resp = await queryOne<{ nome: string }>(
        'SELECT nome FROM profiles WHERE id = $1 AND org_id = $2',
        [responsavel_id, orgId]
      )
      responsavelNome = resp?.nome ?? null
    }

    const tarefa = await queryOne(
      `INSERT INTO tarefas
         (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade, checklist, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [orgId, userId, responsavel_id || null, responsavelNome, titulo.trim(), descricao || null,
       data || null, prazo || null, prioridade, JSON.stringify(checklist), obs || null]
    )

    res.status(201).json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa.' })
  }
})

// ── ATUALIZAR TAREFA ──────────────────────────────────────────────────────────
// PATCH /api/tarefas/:id
// Gestor: pode alterar tudo
// Membro: pode alterar apenas status e checklist das suas tarefas
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params

    const existing = await queryOne<{ id: string; responsavel_id: string; org_id: string }>(
      'SELECT id, responsavel_id, org_id FROM tarefas WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!existing) {
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }

    // Membro só pode alterar suas próprias tarefas e apenas status/checklist
    if (role === 'membro') {
      if (existing.responsavel_id !== userId) {
        res.status(403).json({ error: 'Você só pode atualizar tarefas atribuídas a você.' })
        return
      }
      const { status, checklist } = req.body
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status) }
      if (checklist !== undefined) { updates.push(`checklist = $${idx++}`); params.push(JSON.stringify(checklist)) }

      if (updates.length === 0) {
        res.status(400).json({ error: 'Nenhum campo permitido para atualização.' })
        return
      }

      params.push(id)
      const tarefa = await queryOne(
        `UPDATE tarefas SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        params
      )
      res.json({ tarefa })
      return
    }

    // Gestor pode alterar tudo
    const { titulo, descricao, data, prazo, prioridade, status, responsavel_id, checklist, obs } = req.body

    let responsavelNome: string | null = null
    if (responsavel_id) {
      const resp = await queryOne<{ nome: string }>(
        'SELECT nome FROM profiles WHERE id = $1 AND org_id = $2',
        [responsavel_id, orgId]
      )
      responsavelNome = resp?.nome ?? null
    }

    const tarefa = await queryOne(
      `UPDATE tarefas SET
         titulo = COALESCE($1, titulo),
         descricao = COALESCE($2, descricao),
         data = COALESCE($3, data),
         prazo = COALESCE($4, prazo),
         prioridade = COALESCE($5, prioridade),
         status = COALESCE($6, status),
         responsavel_id = COALESCE($7, responsavel_id),
         responsavel_nome = COALESCE($8, responsavel_nome),
         checklist = COALESCE($9, checklist),
         obs = COALESCE($10, obs),
         updated_at = NOW()
       WHERE id = $11 AND org_id = $12
       RETURNING *`,
      [titulo || null, descricao || null, data || null, prazo || null, prioridade || null,
       status || null, responsavel_id || null, responsavelNome,
       checklist ? JSON.stringify(checklist) : null, obs || null, id, orgId]
    )

    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' })
  }
})

// ── EXCLUIR TAREFA ────────────────────────────────────────────────────────────
// DELETE /api/tarefas/:id  (somente gestor)
router.delete('/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const { id } = req.params
    await query('DELETE FROM tarefas WHERE id = $1 AND org_id = $2', [id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir tarefa.' })
  }
})

// ── DASHBOARD DE TAREFAS ──────────────────────────────────────────────────────
// GET /api/tarefas/stats
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const isGestor = role === 'gestor' || role === 'sub_gestor'
    const baseFilter = isGestor
      ? 'WHERE org_id = $1'
      : 'WHERE org_id = $1 AND responsavel_id = $2'
    const params = isGestor ? [orgId] : [orgId, userId]

    const stats = await queryOne<{
      total: string; pendente: string; em_progresso: string; concluida: string; cancelada: string
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pendente') AS pendente,
         COUNT(*) FILTER (WHERE status = 'em_progresso') AS em_progresso,
         COUNT(*) FILTER (WHERE status = 'concluida') AS concluida,
         COUNT(*) FILTER (WHERE status = 'cancelada') AS cancelada
       FROM tarefas ${baseFilter}`,
      params
    )

    res.json({ stats })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar stats:', err)
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' })
  }
})

export default router
