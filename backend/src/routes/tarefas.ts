import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware } from '../middleware/auth'
import { criarNotificacao } from '../lib/notifHelper'

const router = Router()
router.use(authMiddleware)

type Role = 'gestor' | 'sub_gestor' | 'membro'
type TarefaStatus = 'pendente' | 'em_progresso' | 'concluida' | 'nao_concluida' | 'devolvida' | 'aprovada' | 'cancelada'

const STATUS_PERMITIDOS: TarefaStatus[] = ['pendente', 'em_progresso', 'concluida', 'nao_concluida', 'devolvida', 'aprovada', 'cancelada']
const STATUS_MEMBRO: TarefaStatus[] = ['em_progresso', 'concluida', 'nao_concluida']

function normalizeChecklist(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify([{ id: cryptoRandom(), texto: value, feito: false }])
    }
  }
  return JSON.stringify([])
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10)
}

async function registrarHistorico(args: {
  orgId: string
  tarefaId: string
  userId: string
  acao: string
  statusAnterior?: string | null
  statusNovo?: string | null
  observacao?: string | null
}) {
  await query(
    `INSERT INTO tarefas_historico
       (org_id, tarefa_id, user_id, acao, status_anterior, status_novo, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [args.orgId, args.tarefaId, args.userId, args.acao, args.statusAnterior || null, args.statusNovo || null, args.observacao || null]
  )
}

function tarefaAccessWhere(role: Role, alias = 't') {
  if (role === 'membro') {
    return ` AND (${alias}.responsavel_id = $2 OR ${alias}.criado_por = $2)`
  }
  if (role === 'sub_gestor') {
    return ` AND (
      ${alias}.criado_por = $2 OR
      ${alias}.responsavel_id = $2 OR
      ${alias}.responsavel_id IN (SELECT id FROM profiles WHERE criado_por = $2 AND org_id = $1)
    )`
  }
  return ` AND (${alias}.criado_por = $2 OR ${alias}.responsavel_id = $2)`
}

async function carregarTarefaPermitida(orgId: string, userId: string, role: Role, tarefaId: string) {
  return queryOne<any>(
    `SELECT t.*, p.nome AS responsavel_nome_perfil, p.cargo AS responsavel_cargo, c.nome AS criado_por_nome
     FROM tarefas t
     LEFT JOIN profiles p ON p.id = t.responsavel_id
     LEFT JOIN profiles c ON c.id = t.criado_por
     WHERE t.id = $3 AND t.org_id = $1 ${tarefaAccessWhere(role, 't')}`,
    [orgId, userId, tarefaId]
  )
}

async function validarResponsavel(orgId: string, userId: string, role: Role, responsavelId: string) {
  const responsavel = await queryOne<{ id: string; nome: string; criado_por: string | null }>(
    'SELECT id, nome, criado_por FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE',
    [responsavelId, orgId]
  )
  if (!responsavel) return null
  if (role === 'sub_gestor' && responsavel.id !== userId && responsavel.criado_por !== userId) {
    return null
  }
  return responsavel
}

// GET /api/tarefas/dashboard
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!

    const baseParams = [orgId, userId]
    const access = tarefaAccessWhere(role as Role, 't')

    const resumo = await queryOne<any>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
         COUNT(*) FILTER (WHERE status = 'em_progresso') AS em_progresso,
         COUNT(*) FILTER (WHERE status = 'concluida' AND status_gestor = 'aguardando') AS aguardando_aprovacao,
         COUNT(*) FILTER (WHERE status = 'nao_concluida') AS nao_concluidas,
         COUNT(*) FILTER (WHERE status = 'devolvida') AS devolvidas,
         COUNT(*) FILTER (WHERE status = 'aprovada') AS aprovadas,
         COUNT(*) FILTER (WHERE prazo = CURRENT_DATE AND status NOT IN ('aprovada','cancelada')) AS hoje
       FROM tarefas t
       WHERE t.org_id = $1 ${access}`,
      baseParams
    )

    const porMembro = role === 'membro'
      ? []
      : await query(
          `SELECT p.id, p.nome, p.email,
                  COUNT(t.id) AS total,
                  COUNT(t.id) FILTER (WHERE t.status = 'pendente') AS pendentes,
                  COUNT(t.id) FILTER (WHERE t.status = 'em_progresso') AS em_progresso,
                  COUNT(t.id) FILTER (WHERE t.status = 'concluida' AND t.status_gestor = 'aguardando') AS aguardando_aprovacao,
                  COUNT(t.id) FILTER (WHERE t.status = 'nao_concluida') AS nao_concluidas,
                  COUNT(t.id) FILTER (WHERE t.status = 'devolvida') AS devolvidas,
                  COUNT(t.id) FILTER (WHERE t.status = 'aprovada') AS aprovadas
           FROM profiles p
           LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = p.org_id AND t.criado_por = $2
           WHERE p.org_id = $1 AND p.ativo = TRUE AND (p.criado_por = $2 OR p.id = $2)
           GROUP BY p.id, p.nome, p.email
           ORDER BY p.nome`,
          baseParams
        )

    res.json({ resumo, por_membro: porMembro })
  } catch (err) {
    console.error('[TAREFAS] Erro dashboard:', err)
    res.status(500).json({ error: 'Erro ao buscar dashboard de tarefas.' })
  }
})

// GET /api/tarefas/stats
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const stats = await queryOne<Record<string, string>>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pendente') AS pendente,
         COUNT(*) FILTER (WHERE status = 'em_progresso') AS em_progresso,
         COUNT(*) FILTER (WHERE status = 'concluida') AS concluida,
         COUNT(*) FILTER (WHERE status = 'nao_concluida') AS nao_concluida,
         COUNT(*) FILTER (WHERE status = 'devolvida') AS devolvida,
         COUNT(*) FILTER (WHERE status = 'aprovada') AS aprovada,
         COUNT(*) FILTER (WHERE status = 'cancelada') AS cancelada
       FROM tarefas t
       WHERE t.org_id = $1 ${tarefaAccessWhere(role as Role, 't')}`,
      [orgId, userId]
    )
    res.json({ stats })
  } catch (err) {
    console.error('[TAREFAS] Erro stats:', err)
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' })
  }
})

// GET /api/tarefas
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { status, prioridade, responsavel_id, prazo } = req.query
    const params: unknown[] = [orgId, userId]
    let sql = `
      SELECT t.*, p.nome AS responsavel_nome_perfil, p.cargo AS responsavel_cargo, c.nome AS criado_por_nome
      FROM tarefas t
      LEFT JOIN profiles p ON p.id = t.responsavel_id
      LEFT JOIN profiles c ON c.id = t.criado_por
      WHERE t.org_id = $1 ${tarefaAccessWhere(role as Role, 't')}
    `
    let idx = 3
    if (status) { sql += ` AND t.status = $${idx++}`; params.push(status) }
    if (prioridade) { sql += ` AND t.prioridade = $${idx++}`; params.push(prioridade) }
    if (responsavel_id && role !== 'membro') { sql += ` AND t.responsavel_id = $${idx++}`; params.push(responsavel_id) }
    if (prazo) { sql += ` AND t.prazo = $${idx++}`; params.push(prazo) }
    sql += ' ORDER BY t.created_at DESC'
    const tarefas = await query(sql, params)
    res.json({ tarefas })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefas.' })
  }
})

// POST /api/tarefas
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { titulo, descricao, data, prazo, prioridade = 'media', responsavel_id, checklist = [], obs } = req.body
    if (!titulo?.trim()) { res.status(400).json({ error: 'Título é obrigatório.' }); return }

    const responsavelId = role === 'membro' ? userId : (responsavel_id || userId)
    if (role === 'membro' && responsavel_id && responsavel_id !== userId) {
      res.status(403).json({ error: 'Membro só pode criar tarefa pessoal para si.' })
      return
    }

    const responsavel = await validarResponsavel(orgId, userId, role as Role, responsavelId)
    if (!responsavel) { res.status(404).json({ error: 'Responsável não encontrado ou sem permissão.' }); return }

    const tarefa = await queryOne<any>(
      `INSERT INTO tarefas
        (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade, checklist, obs, status, status_gestor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'pendente','aguardando')
       RETURNING *`,
      [orgId, userId, responsavel.id, responsavel.nome, titulo.trim(), descricao || null, data || null, prazo || null, prioridade, normalizeChecklist(checklist), obs || null]
    )

    await registrarHistorico({ orgId, tarefaId: tarefa.id, userId, acao: 'criada', statusAnterior: null, statusNovo: 'pendente', observacao: obs || null })

    if (responsavel.id !== userId) {
      await criarNotificacao({
        orgId,
        userId: responsavel.id,
        tipo: 'nova_tarefa',
        titulo: '📋 Nova tarefa atribuída a você!',
        body: `${titulo.trim()}${prazo ? ` — prazo: ${new Date(prazo).toLocaleDateString('pt-BR')}` : ''}`,
        referenciaId: tarefa.id,
        referenciaTipo: 'tarefa',
      })
    }

    res.status(201).json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa.' })
  }
})

// PATCH /api/tarefas/:id/status
router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const { status, motivo_nao_conclusao, observacao_conclusao, resposta_membro, checklist } = req.body

    if (!STATUS_MEMBRO.includes(status)) {
      res.status(400).json({ error: 'Status inválido para execução da tarefa.' })
      return
    }
    const tarefaAtual = await carregarTarefaPermitida(orgId, userId, role as Role, id)
    if (!tarefaAtual) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (tarefaAtual.responsavel_id !== userId && role === 'membro') {
      res.status(403).json({ error: 'Você só pode executar tarefas atribuídas a você.' })
      return
    }
    if (status === 'nao_concluida' && !String(motivo_nao_conclusao || '').trim()) {
      res.status(400).json({ error: 'Motivo é obrigatório para marcar como não concluída.' })
      return
    }

    const updates: string[] = ['status = $1', 'updated_at = NOW()']
    const params: unknown[] = [status]
    let idx = 2
    if (status === 'em_progresso') {
      updates.push(`data_inicio = COALESCE(data_inicio, NOW())`)
    }
    if (status === 'concluida') {
      updates.push(`observacao_conclusao = $${idx++}`); params.push(observacao_conclusao || null)
      updates.push(`resposta_membro = $${idx++}`); params.push(resposta_membro || observacao_conclusao || null)
      updates.push(`motivo_nao_conclusao = NULL`)
      updates.push(`data_conclusao = NOW()`)
      updates.push(`status_gestor = 'aguardando'`)
    }
    if (status === 'nao_concluida') {
      updates.push(`motivo_nao_conclusao = $${idx++}`); params.push(String(motivo_nao_conclusao).trim())
      updates.push(`resposta_membro = $${idx++}`); params.push(resposta_membro || motivo_nao_conclusao)
      updates.push(`observacao_conclusao = NULL`)
      updates.push(`data_conclusao = NOW()`)
      updates.push(`status_gestor = 'aguardando'`)
    }
    if (checklist !== undefined) {
      updates.push(`checklist = $${idx++}::jsonb`)
      params.push(normalizeChecklist(checklist))
    }
    params.push(id, orgId)
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET ${updates.join(', ')} WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`,
      params
    )

    await registrarHistorico({
      orgId,
      tarefaId: id,
      userId,
      acao: status === 'em_progresso' ? 'iniciada' : status === 'concluida' ? 'concluida_pelo_membro' : 'nao_concluida_pelo_membro',
      statusAnterior: tarefaAtual.status,
      statusNovo: status,
      observacao: status === 'nao_concluida' ? motivo_nao_conclusao : observacao_conclusao || resposta_membro || null,
    })

    if (tarefaAtual.criado_por && tarefaAtual.criado_por !== userId && status !== 'em_progresso') {
      await criarNotificacao({
        orgId,
        userId: tarefaAtual.criado_por,
        tipo: status === 'concluida' ? 'tarefa_concluida' : 'tarefa_nao_concluida',
        titulo: status === 'concluida' ? '✅ Tarefa concluída' : '❌ Tarefa não concluída',
        body: tarefaAtual.titulo,
        referenciaId: id,
        referenciaTipo: 'tarefa',
      })
    }

    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar status:', err)
    res.status(500).json({ error: 'Erro ao atualizar status da tarefa.' })
  }
})

// PATCH /api/tarefas/:id/aprovar
router.patch('/:id/aprovar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') { res.status(403).json({ error: 'Membro não aprova tarefas.' }); return }
    const { id } = req.params
    const atual = await carregarTarefaPermitida(orgId, userId, role as Role, id)
    if (!atual) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (atual.criado_por !== userId && role === 'gestor') { res.status(403).json({ error: 'Você só aprova tarefas que delegou.' }); return }

    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status='aprovada', status_gestor='aprovada', aprovada_em=NOW(), aprovada_por=$1, updated_at=NOW()
       WHERE id=$2 AND org_id=$3 RETURNING *`,
      [userId, id, orgId]
    )
    await registrarHistorico({ orgId, tarefaId: id, userId, acao: 'aprovada_pelo_gestor', statusAnterior: atual.status, statusNovo: 'aprovada', observacao: req.body?.observacao || null })
    if (atual.responsavel_id && atual.responsavel_id !== userId) {
      await criarNotificacao({ orgId, userId: atual.responsavel_id, tipo: 'tarefa_aprovada', titulo: '✅ Tarefa aprovada', body: atual.titulo, referenciaId: id, referenciaTipo: 'tarefa' })
    }
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro aprovar:', err)
    res.status(500).json({ error: 'Erro ao aprovar tarefa.' })
  }
})

// PATCH /api/tarefas/:id/devolver
router.patch('/:id/devolver', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') { res.status(403).json({ error: 'Membro não devolve tarefas.' }); return }
    const { id } = req.params
    const ressalva = String(req.body?.ressalva_gestor || '').trim()
    if (!ressalva) { res.status(400).json({ error: 'Ressalva é obrigatória para devolver.' }); return }
    const atual = await carregarTarefaPermitida(orgId, userId, role as Role, id)
    if (!atual) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (atual.criado_por !== userId && role === 'gestor') { res.status(403).json({ error: 'Você só devolve tarefas que delegou.' }); return }

    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status='devolvida', status_gestor='devolvida', ressalva_gestor=$1, devolvida_em=NOW(), updated_at=NOW()
       WHERE id=$2 AND org_id=$3 RETURNING *`,
      [ressalva, id, orgId]
    )
    await registrarHistorico({ orgId, tarefaId: id, userId, acao: 'devolvida_pelo_gestor', statusAnterior: atual.status, statusNovo: 'devolvida', observacao: ressalva })
    if (atual.responsavel_id && atual.responsavel_id !== userId) {
      await criarNotificacao({ orgId, userId: atual.responsavel_id, tipo: 'tarefa_devolvida', titulo: '↩️ Tarefa devolvida com ressalva', body: ressalva, referenciaId: id, referenciaTipo: 'tarefa' })
    }
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro devolver:', err)
    res.status(500).json({ error: 'Erro ao devolver tarefa.' })
  }
})

// GET /api/tarefas/:id/historico
router.get('/:id/historico', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const tarefa = await carregarTarefaPermitida(orgId, userId, role as Role, id)
    if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    const historico = await query(
      `SELECT h.*, p.nome AS user_nome
       FROM tarefas_historico h
       LEFT JOIN profiles p ON p.id = h.user_id
       WHERE h.org_id = $1 AND h.tarefa_id = $2
       ORDER BY h.created_at ASC`,
      [orgId, id]
    )
    res.json({ historico })
  } catch (err) {
    console.error('[TAREFAS] Erro histórico:', err)
    res.status(500).json({ error: 'Erro ao buscar histórico.' })
  }
})

// GET /api/tarefas/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const tarefa = await carregarTarefaPermitida(orgId, userId, role as Role, req.params.id)
    if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefa.' })
  }
})

// PATCH /api/tarefas/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const atual = await carregarTarefaPermitida(orgId, userId, role as Role, id)
    if (!atual) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }

    if (role === 'membro' && atual.responsavel_id !== userId && atual.criado_por !== userId) {
      res.status(403).json({ error: 'Sem permissão para editar esta tarefa.' })
      return
    }

    const { titulo, descricao, data, prazo, prioridade, status, responsavel_id, checklist, obs } = req.body
    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (titulo !== undefined) { updates.push(`titulo = $${idx++}`); params.push(titulo?.trim() || atual.titulo) }
    if (descricao !== undefined) { updates.push(`descricao = $${idx++}`); params.push(descricao || null) }
    if (data !== undefined) { updates.push(`data = $${idx++}`); params.push(data || null) }
    if (prazo !== undefined) { updates.push(`prazo = $${idx++}`); params.push(prazo || null) }
    if (prioridade !== undefined) { updates.push(`prioridade = $${idx++}`); params.push(prioridade) }
    if (obs !== undefined) { updates.push(`obs = $${idx++}`); params.push(obs || null) }
    if (checklist !== undefined) { updates.push(`checklist = $${idx++}::jsonb`); params.push(normalizeChecklist(checklist)) }
    if (status !== undefined && STATUS_PERMITIDOS.includes(status)) { updates.push(`status = $${idx++}`); params.push(status) }

    if (responsavel_id !== undefined && role !== 'membro') {
      const resp = await validarResponsavel(orgId, userId, role as Role, responsavel_id)
      if (!resp) { res.status(404).json({ error: 'Responsável não encontrado ou sem permissão.' }); return }
      updates.push(`responsavel_id = $${idx++}`); params.push(resp.id)
      updates.push(`responsavel_nome = $${idx++}`); params.push(resp.nome)
    }

    if (updates.length === 0) { res.status(400).json({ error: 'Nenhum campo para atualizar.' }); return }
    updates.push(`updated_at = NOW()`)
    params.push(id, orgId)
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET ${updates.join(', ')} WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`,
      params
    )
    await registrarHistorico({ orgId, tarefaId: id, userId, acao: 'editada', statusAnterior: atual.status, statusNovo: tarefa?.status || atual.status, observacao: obs || null })
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' })
  }
})

// POST /api/tarefas/:id/resposta — compatibilidade com versões anteriores
router.post('/:id/resposta', async (req: Request, res: Response): Promise<void> => {
  req.body.status = req.body.resposta_status === 'nao_concluida' ? 'nao_concluida' : 'concluida'
  req.body.motivo_nao_conclusao = req.body.resposta_obs || req.body.motivo_nao_conclusao
  req.body.observacao_conclusao = req.body.resposta_obs || req.body.observacao_conclusao
  // Reaproveita a lógica do endpoint status via chamada interna simplificada não é trivial; replica essencial.
  const { orgId, userId, role } = req.user!
  const { id } = req.params
  const status = req.body.status as TarefaStatus
  try {
    const atual = await carregarTarefaPermitida(orgId, userId, role as Role, id)
    if (!atual) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (status === 'nao_concluida' && !String(req.body.motivo_nao_conclusao || '').trim()) {
      res.status(400).json({ error: 'Motivo é obrigatório.' }); return
    }
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status=$1, resposta_membro=$2, motivo_nao_conclusao=$3, observacao_conclusao=$4,
         data_conclusao=NOW(), status_gestor='aguardando', updated_at=NOW()
       WHERE id=$5 AND org_id=$6 RETURNING *`,
      [status, req.body.resposta_obs || null, status === 'nao_concluida' ? req.body.motivo_nao_conclusao : null, status === 'concluida' ? req.body.observacao_conclusao : null, id, orgId]
    )
    await registrarHistorico({ orgId, tarefaId: id, userId, acao: status === 'concluida' ? 'concluida_pelo_membro' : 'nao_concluida_pelo_membro', statusAnterior: atual.status, statusNovo: status, observacao: req.body.resposta_obs || null })
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro resposta:', err)
    res.status(500).json({ error: 'Erro ao registrar resposta.' })
  }
})

// DELETE /api/tarefas/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') { res.status(403).json({ error: 'Membros não podem excluir tarefas.' }); return }
    const atual = await carregarTarefaPermitida(orgId, userId, role as Role, req.params.id)
    if (!atual) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (atual.criado_por !== userId && role !== 'sub_gestor') { res.status(403).json({ error: 'Você só pode excluir tarefas que criou.' }); return }
    await registrarHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'cancelada_excluida', statusAnterior: atual.status, statusNovo: 'cancelada', observacao: 'Tarefa removida' })
    await query('DELETE FROM tarefas WHERE id = $1 AND org_id = $2', [req.params.id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir tarefa.' })
  }
})

export default router
