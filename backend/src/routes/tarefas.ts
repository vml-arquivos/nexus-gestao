import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware } from '../middleware/auth'
import { criarNotificacao } from '../lib/notifHelper'

const router = Router()
router.use(authMiddleware)

// ── LISTAR TAREFAS ────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { status, prioridade, responsavel_id } = req.query

    let sql = `
      SELECT t.*,
             p.nome  AS responsavel_nome_perfil,
             p.cargo AS responsavel_cargo,
             c.nome  AS criado_por_nome
      FROM tarefas t
      LEFT JOIN profiles p ON p.id = t.responsavel_id
      LEFT JOIN profiles c ON c.id = t.criado_por
      WHERE t.org_id = $1
    `
    const params: unknown[] = [orgId]
    let idx = 2

    if (role === 'membro') {
      sql += ` AND t.responsavel_id = $${idx++}`
      params.push(userId)
    } else if (role === 'sub_gestor') {
      sql += ` AND (
        t.criado_por = $${idx} OR
        t.responsavel_id = $${idx} OR
        t.responsavel_id IN (SELECT id FROM profiles WHERE criado_por = $${idx} AND org_id = $${idx + 1})
      )`
      params.push(userId, orgId)
      idx += 2
    }

    if (status)     { sql += ` AND t.status = $${idx++}`;     params.push(status) }
    if (prioridade) { sql += ` AND t.prioridade = $${idx++}`; params.push(prioridade) }
    if (responsavel_id && role !== 'membro') {
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
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!

    if (role === 'membro') {
      res.status(403).json({ error: 'Membros não podem criar tarefas.' })
      return
    }

    const { titulo, descricao, data, prazo, prioridade = 'media', responsavel_id, checklist = [], obs } = req.body
    if (!titulo?.trim()) {
      res.status(400).json({ error: 'Título é obrigatório.' })
      return
    }

    if (responsavel_id && role === 'sub_gestor') {
      const resp = await queryOne<{ id: string; criado_por: string }>(
        'SELECT id, criado_por FROM profiles WHERE id = $1 AND org_id = $2',
        [responsavel_id, orgId]
      )
      if (!resp) { res.status(404).json({ error: 'Responsável não encontrado.' }); return }
      if (resp.id !== userId && resp.criado_por !== userId) {
        res.status(403).json({ error: 'Sub-gestor só pode atribuir tarefas para seus comandados diretos.' })
        return
      }
    }

    let responsavelNome: string | null = null
    if (responsavel_id) {
      const resp = await queryOne<{ nome: string }>(
        'SELECT nome FROM profiles WHERE id = $1 AND org_id = $2',
        [responsavel_id, orgId]
      )
      responsavelNome = resp?.nome ?? null
    }

    // Busca nome do criador para a notificação
    const criador = await queryOne<{ nome: string }>(
      'SELECT nome FROM profiles WHERE id = $1', [userId]
    )
    const criadorNome = criador?.nome || 'Gestor'

    const tarefa = await queryOne<{ id: string }>(
      `INSERT INTO tarefas
         (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade, checklist, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [orgId, userId, responsavel_id || null, responsavelNome,
       titulo.trim(), descricao || null, data || null, prazo || null,
       prioridade, JSON.stringify(checklist), obs || null]
    )

    // ── Notifica responsável se for diferente do criador ──────────────────────
    if (responsavel_id && responsavel_id !== userId) {
      const prazoFmt = prazo ? ` — prazo: ${new Date(prazo).toLocaleDateString('pt-BR')}` : ''
      await criarNotificacao({
        orgId, userId: responsavel_id,
        tipo: 'nova_tarefa',
        titulo: '📋 Nova tarefa atribuída a você!',
        body: `"${titulo.trim()}" por ${criadorNome}${prazoFmt}`,
        referenciaId: (tarefa as any).id,
        referenciaTipo: 'tarefa',
      })
    }

    res.status(201).json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa.' })
  }
})

// ── BUSCAR TAREFA ─────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const tarefa = await queryOne<any>(
      `SELECT t.*, p.nome AS responsavel_nome_perfil, p.cargo AS responsavel_cargo,
              c.nome AS criado_por_nome
       FROM tarefas t
       LEFT JOIN profiles p ON p.id = t.responsavel_id
       LEFT JOIN profiles c ON c.id = t.criado_por
       WHERE t.id = $1 AND t.org_id = $2`,
      [req.params.id, orgId]
    )
    if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (role === 'membro' && tarefa.responsavel_id !== userId) {
      res.status(403).json({ error: 'Acesso negado.' }); return
    }
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefa.' })
  }
})

// ── ATUALIZAR TAREFA ──────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params

    const existing = await queryOne<{
      id: string; responsavel_id: string; criado_por: string; org_id: string
      titulo: string; responsavel_nome: string
    }>(
      'SELECT id, responsavel_id, criado_por, org_id, titulo, responsavel_nome FROM tarefas WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }

    // MEMBRO: só suas tarefas, só campos permitidos
    if (role === 'membro') {
      if (existing.responsavel_id !== userId) {
        res.status(403).json({ error: 'Você só pode atualizar tarefas atribuídas a você.' })
        return
      }
      const { status, checklist, resposta_status, resposta_obs } = req.body
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (status !== undefined)          { updates.push(`status = $${idx++}`);          params.push(status) }
      if (checklist !== undefined)       { updates.push(`checklist = $${idx++}`);       params.push(JSON.stringify(checklist)) }
      if (resposta_status !== undefined) {
        updates.push(`resposta_status = $${idx++}`)
        params.push(resposta_status)
        updates.push(`resposta_em = NOW()`)
        if (resposta_status === 'concluida') updates.push(`status = 'concluida'`)
      }
      if (resposta_obs !== undefined)    { updates.push(`resposta_obs = $${idx++}`);    params.push(resposta_obs) }

      if (updates.length === 0) {
        res.status(400).json({ error: 'Nenhum campo permitido para atualização.' })
        return
      }
      params.push(id)
      const tarefa = await queryOne(
        `UPDATE tarefas SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        params
      )

      // ── Notifica gestor/criador ao responder ──────────────────────────────
      if (resposta_status && existing.criado_por && existing.criado_por !== userId) {
        const membro = await queryOne<{ nome: string }>(
          'SELECT nome FROM profiles WHERE id = $1', [userId]
        )
        const membroNome = membro?.nome || 'Membro'
        if (resposta_status === 'concluida') {
          await criarNotificacao({
            orgId, userId: existing.criado_por,
            tipo: 'tarefa_concluida',
            titulo: '✅ Tarefa concluída!',
            body: `${membroNome} concluiu "${existing.titulo}".`,
            referenciaId: id, referenciaTipo: 'tarefa',
          })
        } else {
          await criarNotificacao({
            orgId, userId: existing.criado_por,
            tipo: 'tarefa_nao_concluida',
            titulo: '❌ Tarefa não concluída',
            body: `${membroNome} não concluiu "${existing.titulo}". Obs: ${resposta_obs || 'sem observação'}`,
            referenciaId: id, referenciaTipo: 'tarefa',
          })
        }
      }

      res.json({ tarefa })
      return
    }

    // SUB_GESTOR: só tarefas que criou ou de seus comandados
    if (role === 'sub_gestor') {
      const isOwner = existing.criado_por === userId
      const isComandado = existing.responsavel_id
        ? !!(await queryOne('SELECT id FROM profiles WHERE id = $1 AND criado_por = $2', [existing.responsavel_id, userId]))
        : false
      if (!isOwner && !isComandado) {
        res.status(403).json({ error: 'Você só pode atualizar tarefas que criou ou de seus comandados.' })
        return
      }
    }

    // GESTOR / SUB_GESTOR com permissão: altera tudo
    const { titulo, descricao, data, prazo, prioridade, status, responsavel_id, checklist, obs } = req.body
    let responsavelNome: string | null = null
    if (responsavel_id) {
      const resp = await queryOne<{ nome: string }>(
        'SELECT nome FROM profiles WHERE id = $1 AND org_id = $2',
        [responsavel_id, orgId]
      )
      responsavelNome = resp?.nome ?? null
    }

    // Notifica novo responsável se mudou
    const novoResponsavel = responsavel_id && responsavel_id !== existing.responsavel_id
    if (novoResponsavel && responsavel_id !== userId) {
      const criador = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId])
      const prazoFmt = prazo ? ` — prazo: ${new Date(prazo).toLocaleDateString('pt-BR')}` : ''
      await criarNotificacao({
        orgId, userId: responsavel_id,
        tipo: 'nova_tarefa',
        titulo: '📋 Nova tarefa atribuída a você!',
        body: `"${titulo || existing.titulo}" por ${criador?.nome || 'Gestor'}${prazoFmt}`,
        referenciaId: id, referenciaTipo: 'tarefa',
      })
    }

    const tarefa = await queryOne(
      `UPDATE tarefas SET
         titulo           = COALESCE($1,  titulo),
         descricao        = COALESCE($2,  descricao),
         data             = COALESCE($3,  data),
         prazo            = COALESCE($4,  prazo),
         prioridade       = COALESCE($5,  prioridade),
         status           = COALESCE($6,  status),
         responsavel_id   = COALESCE($7,  responsavel_id),
         responsavel_nome = COALESCE($8,  responsavel_nome),
         checklist        = COALESCE($9,  checklist),
         obs              = COALESCE($10, obs),
         updated_at       = NOW()
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

// ── RESPONDER TAREFA ──────────────────────────────────────────────────────────
router.post('/:id/resposta', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const { resposta_status, resposta_obs } = req.body

    if (!resposta_status || !['concluida', 'nao_concluida'].includes(resposta_status)) {
      res.status(400).json({ error: 'resposta_status deve ser "concluida" ou "nao_concluida".' })
      return
    }

    const existing = await queryOne<{
      id: string; responsavel_id: string; criado_por: string; titulo: string
    }>(
      'SELECT id, responsavel_id, criado_por, titulo FROM tarefas WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }

    if (role === 'membro' && existing.responsavel_id !== userId) {
      res.status(403).json({ error: 'Você só pode responder tarefas atribuídas a você.' })
      return
    }

    const novoStatus = resposta_status === 'concluida' ? 'concluida' : 'pendente'

    const tarefa = await queryOne(
      `UPDATE tarefas SET
         resposta_status = $1,
         resposta_obs    = $2,
         resposta_em     = NOW(),
         status          = $3,
         updated_at      = NOW()
       WHERE id = $4 AND org_id = $5
       RETURNING *`,
      [resposta_status, resposta_obs || null, novoStatus, id, orgId]
    )

    // ── Notifica criador da tarefa ────────────────────────────────────────────
    if (existing.criado_por && existing.criado_por !== userId) {
      const membro = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId])
      const membroNome = membro?.nome || 'Membro'
      if (resposta_status === 'concluida') {
        await criarNotificacao({
          orgId, userId: existing.criado_por,
          tipo: 'tarefa_concluida',
          titulo: '✅ Tarefa concluída!',
          body: `${membroNome} concluiu "${existing.titulo}" com sucesso.`,
          referenciaId: id, referenciaTipo: 'tarefa',
        })
      } else {
        await criarNotificacao({
          orgId, userId: existing.criado_por,
          tipo: 'tarefa_nao_concluida',
          titulo: '❌ Tarefa não concluída',
          body: `${membroNome} não concluiu "${existing.titulo}". Obs: ${resposta_obs || 'sem observação'}`,
          referenciaId: id, referenciaTipo: 'tarefa',
        })
      }
    }

    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao responder:', err)
    res.status(500).json({ error: 'Erro ao registrar resposta.' })
  }
})

// ── EXCLUIR TAREFA ────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Membros não podem excluir tarefas.' }); return
    }
    const existing = await queryOne<{ criado_por: string }>(
      'SELECT criado_por FROM tarefas WHERE id = $1 AND org_id = $2',
      [req.params.id, orgId]
    )
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (role === 'sub_gestor' && existing.criado_por !== userId) {
      res.status(403).json({ error: 'Sub-gestor só pode excluir tarefas que criou.' }); return
    }
    await query('DELETE FROM tarefas WHERE id = $1 AND org_id = $2', [req.params.id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir tarefa.' })
  }
})

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    let filter = 'WHERE org_id = $1'
    const params: unknown[] = [orgId]

    if (role === 'membro') {
      filter += ' AND responsavel_id = $2'
      params.push(userId)
    } else if (role === 'sub_gestor') {
      filter += ` AND (criado_por = $2 OR responsavel_id = $2 OR responsavel_id IN (SELECT id FROM profiles WHERE criado_por = $2 AND org_id = $1))`
      params.push(userId)
    }

    const stats = await queryOne<{
      total: string; pendente: string; em_progresso: string; concluida: string; cancelada: string
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pendente')     AS pendente,
         COUNT(*) FILTER (WHERE status = 'em_progresso') AS em_progresso,
         COUNT(*) FILTER (WHERE status = 'concluida')    AS concluida,
         COUNT(*) FILTER (WHERE status = 'cancelada')    AS cancelada
       FROM tarefas ${filter}`,
      params
    )
    res.json({ stats })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar stats:', err)
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' })
  }
})

export default router
