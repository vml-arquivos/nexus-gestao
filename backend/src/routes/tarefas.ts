import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware, gestorOnly } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// Função auxiliar: registra evento no histórico da tarefa
async function registrarHistorico(
  tarefaId: string, orgId: string,
  usuarioId: string, usuarioNome: string,
  acao: string, dados?: Record<string, unknown>
) {
  try {
    await queryOne(
      `INSERT INTO tarefa_historico (tarefa_id, org_id, usuario_id, usuario_nome, acao, dados)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tarefaId, orgId, usuarioId, usuarioNome, acao, dados ? JSON.stringify(dados) : null]
    )
  } catch (e) {
    console.warn('[TAREFAS] Falha ao registrar histórico:', e)
  }
}

// Função auxiliar: cria notificação para um usuário
async function criarNotificacao(
  orgId: string, userId: string,
  tipo: string, titulo: string, body: string,
  referenciaId?: string
) {
  try {
    await queryOne(
      `INSERT INTO notificacoes (org_id, user_id, tipo, titulo, body, referencia_id, referencia_tipo)
       VALUES ($1,$2,$3,$4,$5,$6,'tarefa')`,
      [orgId, userId, tipo, titulo, body, referenciaId || null]
    )
  } catch (e) {
    console.warn('[TAREFAS] Falha ao criar notificação:', e)
  }
}

// GET /api/tarefas
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

    if (role === 'membro') { sql += ` AND t.responsavel_id = $${idx++}`; params.push(userId) }
    if (status)       { sql += ` AND t.status = $${idx++}`; params.push(status) }
    if (prioridade)   { sql += ` AND t.prioridade = $${idx++}`; params.push(prioridade) }
    if (responsavel_id && role === 'gestor') { sql += ` AND t.responsavel_id = $${idx++}`; params.push(responsavel_id) }

    sql += ' ORDER BY t.created_at DESC'

    const tarefas = await query(sql, params)
    res.json({ tarefas })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefas.' })
  }
})

// GET /api/tarefas/stats
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const baseFilter = role === 'gestor'
      ? 'WHERE org_id = $1'
      : 'WHERE org_id = $1 AND responsavel_id = $2'
    const params = role === 'gestor' ? [orgId] : [orgId, userId]

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

// GET /api/tarefas/:id/historico
router.get('/:id/historico', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const historico = await query(
      `SELECT * FROM tarefa_historico
       WHERE tarefa_id = $1 AND org_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.params.id, orgId]
    )
    res.json({ historico })
  } catch (err) {
    console.error('[TAREFAS] Erro histórico:', err)
    res.status(500).json({ error: 'Erro ao buscar histórico.' })
  }
})

// POST /api/tarefas (somente gestor)
router.post('/', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, nome } = req.user!
    const { titulo, descricao, data, prazo, prioridade = 'media', responsavel_id, checklist = [], obs } = req.body

    if (!titulo?.trim()) { res.status(400).json({ error: 'Título é obrigatório.' }); return }

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
      [orgId, userId, responsavel_id || null, responsavelNome, titulo.trim(),
       descricao || null, data || null, prazo || null, prioridade, JSON.stringify(checklist), obs || null]
    )

    // Registrar histórico de criação
    await registrarHistorico(tarefa!.id as string, orgId, userId, nome || '', 'criou a tarefa', { titulo: titulo.trim(), prioridade, prazo: prazo || null })

    // Notificar o responsável se for diferente do criador
    if (responsavel_id && responsavel_id !== userId) {
      await criarNotificacao(
        orgId, responsavel_id, 'tarefa',
        `Nova tarefa atribuída: ${titulo.trim()}`,
        `Prazo: ${prazo ? new Date(`${prazo}T12:00:00`).toLocaleDateString('pt-BR') : 'sem prazo'}`,
        tarefa!.id as string
      )
    }

    res.status(201).json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa.' })
  }
})

// PATCH /api/tarefas/:id
// Gestor: pode alterar tudo | Membro: apenas status e checklist das suas tarefas
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role, nome } = req.user!
    const { id } = req.params

    const existing = await queryOne<{
      id: string; responsavel_id: string; org_id: string; titulo: string; status: string
    }>(
      'SELECT id, responsavel_id, org_id, titulo, status FROM tarefas WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }

    // Membro: apenas status e checklist das suas tarefas
    if (role === 'membro') {
      if (existing.responsavel_id !== userId) {
        res.status(403).json({ error: 'Você só pode atualizar tarefas atribuídas a você.' })
        return
      }
      const { status, checklist } = req.body
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (status !== undefined)    { updates.push(`status = $${idx++}`);    params.push(status) }
      if (checklist !== undefined) { updates.push(`checklist = $${idx++}`); params.push(JSON.stringify(checklist)) }

      if (updates.length === 0) { res.status(400).json({ error: 'Nenhum campo permitido.' }); return }

      params.push(id)
      const tarefa = await queryOne(
        `UPDATE tarefas SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        params
      )

      // Histórico
      if (status && status !== existing.status) {
        await registrarHistorico(id, orgId, userId, nome || '', `alterou status para "${status}"`,
          { de: existing.status, para: status })
      }
      if (checklist !== undefined) {
        const done = (checklist as { feito: boolean }[]).filter(i => i.feito).length
        const total = (checklist as unknown[]).length
        await registrarHistorico(id, orgId, userId, nome || '', `atualizou checklist (${done}/${total})`)
      }

      res.json({ tarefa })
      return
    }

    // Gestor: pode alterar tudo via SET dinâmico (evita COALESCE que impede null)
    const {
      titulo, descricao, data, prazo, prioridade, status,
      responsavel_id, checklist, obs,
    } = req.body

    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (titulo !== undefined)        { sets.push(`titulo = $${idx++}`);           params.push(titulo || null) }
    if (descricao !== undefined)     { sets.push(`descricao = $${idx++}`);        params.push(descricao || null) }
    if (data !== undefined)          { sets.push(`data = $${idx++}`);             params.push(data || null) }
    if (prazo !== undefined)         { sets.push(`prazo = $${idx++}`);            params.push(prazo || null) }
    if (prioridade !== undefined)    { sets.push(`prioridade = $${idx++}`);       params.push(prioridade) }
    if (status !== undefined)        { sets.push(`status = $${idx++}`);           params.push(status) }
    if (obs !== undefined)           { sets.push(`obs = $${idx++}`);              params.push(obs || null) }
    if (checklist !== undefined)     { sets.push(`checklist = $${idx++}`);        params.push(JSON.stringify(checklist)) }

    if (responsavel_id !== undefined) {
      sets.push(`responsavel_id = $${idx++}`)
      params.push(responsavel_id || null)
      if (responsavel_id) {
        const resp = await queryOne<{ nome: string }>(
          'SELECT nome FROM profiles WHERE id = $1 AND org_id = $2',
          [responsavel_id, orgId]
        )
        sets.push(`responsavel_nome = $${idx++}`)
        params.push(resp?.nome ?? null)
      } else {
        sets.push(`responsavel_nome = $${idx++}`)
        params.push(null)
      }
    }

    if (sets.length === 0) { res.status(400).json({ error: 'Nenhum campo para atualizar.' }); return }

    params.push(id, orgId)
    const tarefa = await queryOne(
      `UPDATE tarefas SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND org_id = $${idx}
       RETURNING *`,
      params
    )

    // Histórico
    const historicoDados: Record<string, unknown> = {}
    if (status && status !== existing.status) historicoDados.status = { de: existing.status, para: status }
    if (titulo) historicoDados.titulo = titulo
    if (prazo !== undefined) historicoDados.prazo = prazo

    await registrarHistorico(id, orgId, userId, nome || '', 'editou a tarefa', historicoDados)

    // Notificar novo responsável
    if (responsavel_id && responsavel_id !== userId) {
      await criarNotificacao(
        orgId, responsavel_id, 'tarefa',
        `Tarefa atribuída: ${existing.titulo}`,
        `Você foi designado para esta tarefa.`,
        id
      )
    }

    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' })
  }
})

// DELETE /api/tarefas/:id (somente gestor)
router.delete('/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    await query('DELETE FROM tarefas WHERE id = $1 AND org_id = $2', [req.params.id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir tarefa.' })
  }
})

export default router
