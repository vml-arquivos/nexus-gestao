import { Router, Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../db/pool'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
import { criarNotificacao } from '../lib/notifHelper'
import { createSecureMulterUpload, buildUploadUrl, removeUploadByUrl, uploadErrorMessage } from '../lib/uploadSecurity'

const router = Router()
router.use(authMiddleware)

// ── UPLOADS DE EVIDÊNCIAS DA TAREFA ─────────────────────────────────────────
const evidenceUpload = createSecureMulterUpload()
const uploadEvidenceFile = (req: Request, res: Response, next: NextFunction) => {
  evidenceUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: uploadErrorMessage(err) })
      return
    }
    next()
  })
}

interface MulterTaskRequest extends Request {
  file?: Express.Multer.File
}

const VALID_STATUS = ['pendente', 'em_progresso', 'concluida', 'nao_concluida', 'devolvida', 'reenviada', 'aprovada', 'cancelada'] as const
type TaskStatus = typeof VALID_STATUS[number]

function isValidStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (VALID_STATUS as readonly string[]).includes(v)
}

function parseChecklistItems(value: unknown): Array<{ id?: string; texto: string; feito?: boolean; descricao?: string; data?: string }> {
  const raw = (() => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch { return [] }
    }
    return []
  })()

  return raw
    .map((item: any) => {
      if (typeof item === 'string') return { id: uuidv4(), texto: item.trim(), feito: false }
      const rawDate = String(item?.data || item?.date || item?.prazo || '').slice(0, 10)
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined
      return {
        id: typeof item?.id === 'string' && item.id ? item.id : uuidv4(),
        texto: String(item?.texto || item?.label || item?.title || '').trim(),
        descricao: String(item?.descricao || item?.description || item?.obs || '').trim() || undefined,
        data: safeDate,
        feito: !!item?.feito,
      }
    })
    .filter(item => item.texto)
}

function normalizeChecklist(value: unknown) {
  return JSON.stringify(parseChecklistItems(value))
}

function checklistStructureKey(value: unknown) {
  return parseChecklistItems(value)
    .map(item => `${item.id || ''}:${item.texto}:${item.data || ''}:${item.descricao || ''}`)
    .join('|')
}

function checklistDoneChanged(before: unknown, after: unknown) {
  const beforeItems = parseChecklistItems(before)
  const afterItems = parseChecklistItems(after)
  const beforeByKey = new Map(beforeItems.map(item => [`${item.id || ''}:${item.texto}`, !!item.feito]))

  return afterItems.some(item => {
    const key = `${item.id || ''}:${item.texto}`
    const beforeDone = beforeByKey.get(key)
    if (beforeDone === undefined) return !!item.feito
    return beforeDone !== !!item.feito
  })
}

function isTaskExecutor(task: any, userId: string) {
  return task.responsavel_id === userId || (!task.responsavel_id && task.criado_por === userId)
}

async function syncChecklistTable(input: { orgId: string; tarefaId: string; userId: string; checklist: unknown }) {
  const items = parseChecklistItems(input.checklist)
  await query('DELETE FROM tarefa_checklist WHERE tarefa_id = $1 AND org_id = $2', [input.tarefaId, input.orgId])
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    await query(
      `INSERT INTO tarefa_checklist (id, tarefa_id, org_id, criado_por, texto, feito, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [item.id || uuidv4(), input.tarefaId, input.orgId, input.userId, item.texto, !!item.feito, i]
    )
  }
}

async function addHistorico(input: {
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
    [input.orgId, input.tarefaId, input.userId, input.acao, input.statusAnterior || null, input.statusNovo || null, input.observacao || null]
  ).catch(async () => {
    // Compatibilidade com tabela legada tarefa_historico, caso exista em instalações antigas.
    await query(
      `INSERT INTO tarefa_historico
         (org_id, tarefa_id, usuario_id, acao, dados)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.orgId, input.tarefaId, input.userId, input.acao, JSON.stringify({ status_anterior: input.statusAnterior, status_novo: input.statusNovo, observacao: input.observacao })]
    ).catch(() => {})
  })
}

async function userCanAccessTask(task: any, user: NonNullable<Request['user']>) {
  const { userId, role } = user
  if (canDeleteOrgRecords(role)) return true
  if (role === 'membro') return task.responsavel_id === userId || task.criado_por === userId
  if (role === 'gestor') return task.criado_por === userId || task.responsavel_id === userId
  if (role === 'sub_gestor') {
    if (task.criado_por === userId || task.responsavel_id === userId) return true
    if (!task.responsavel_id) return false
    const resp = await queryOne('SELECT id FROM profiles WHERE id = $1 AND criado_por = $2', [task.responsavel_id, userId])
    return !!resp
  }
  return false
}

async function getTaskForAccess(id: string, orgId: string) {
  return queryOne<any>(
    `SELECT t.*, p.nome AS responsavel_nome_perfil, p.cargo AS responsavel_cargo,
            c.nome AS criado_por_nome,
            COALESCE((SELECT COUNT(*)::int FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id), 0) AS anexos_count,
            (SELECT MAX(a.created_at) FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id) AS ultima_evidencia_em
     FROM tarefas t
     LEFT JOIN profiles p ON p.id = t.responsavel_id
     LEFT JOIN profiles c ON c.id = t.criado_por
     WHERE t.id = $1 AND t.org_id = $2`,
    [id, orgId]
  )
}

// ── STATS precisa vir antes de /:id ──────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    let filter = 'WHERE org_id = $1'
    const params: unknown[] = [orgId]

    if (role === 'membro') {
      filter += ' AND (responsavel_id = $2 OR criado_por = $2)'
      params.push(userId)
    } else if (role === 'sub_gestor') {
      filter += ` AND (criado_por = $2 OR responsavel_id = $2 OR responsavel_id IN (SELECT id FROM profiles WHERE criado_por = $2 AND org_id = $1))`
      params.push(userId)
    } else if (role === 'gestor') {
      filter += ' AND (criado_por = $2 OR responsavel_id = $2)'
      params.push(userId)
    }

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
       FROM tarefas ${filter}`,
      params
    )
    res.json({ stats })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar stats:', err)
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' })
  }
})

// ── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') {
      const resumo = await queryOne(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
           COUNT(*) FILTER (WHERE status = 'em_progresso') AS em_progresso,
           COUNT(*) FILTER (WHERE status = 'devolvida') AS devolvidas,
           COUNT(*) FILTER (WHERE status IN ('concluida','aprovada')) AS concluidas,
           COUNT(*) FILTER (WHERE prazo = CURRENT_DATE AND status NOT IN ('concluida','aprovada','cancelada')) AS hoje
         FROM tarefas
         WHERE org_id = $1 AND (responsavel_id = $2 OR criado_por = $2)`,
        [orgId, userId]
      )
      res.json({ resumo })
      return
    }

    const resumo = await queryOne(
      `SELECT
         COUNT(*) AS enviadas,
         COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
         COUNT(*) FILTER (WHERE status = 'concluida' AND COALESCE(status_gestor,'aguardando') = 'aguardando') AS aguardando_aprovacao,
         COUNT(*) FILTER (WHERE status = 'nao_concluida') AS nao_concluidas,
         COUNT(*) FILTER (WHERE status = 'devolvida') AS devolvidas,
         COUNT(*) FILTER (WHERE status = 'aprovada') AS aprovadas
       FROM tarefas
       WHERE org_id = $1 AND (criado_por = $2 OR responsavel_id = $2)`,
      [orgId, userId]
    )
    const porMembro = await query(
      `SELECT p.id, p.nome,
              COUNT(t.id) AS total,
              COUNT(t.id) FILTER (WHERE t.status = 'pendente') AS pendentes,
              COUNT(t.id) FILTER (WHERE t.status = 'concluida') AS concluidas,
              COUNT(t.id) FILTER (WHERE t.status = 'nao_concluida') AS nao_concluidas,
              COUNT(t.id) FILTER (WHERE t.status = 'devolvida') AS devolvidas,
              COUNT(t.id) FILTER (WHERE t.status = 'aprovada') AS aprovadas
       FROM profiles p
       LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = p.org_id AND t.criado_por = $2
       WHERE p.org_id = $1 AND p.ativo = TRUE AND (p.id = $2 OR p.criado_por = $2 OR EXISTS (
         SELECT 1 FROM equipes e JOIN equipes_membros em ON em.equipe_id = e.id AND em.org_id = e.org_id
         WHERE e.org_id = $1 AND e.criado_por = $2 AND em.user_id = p.id AND COALESCE(em.ativo, TRUE) = TRUE
       ))
       GROUP BY p.id, p.nome
       ORDER BY p.nome`,
      [orgId, userId]
    )
    res.json({ resumo, por_membro: porMembro })
  } catch (err) {
    console.error('[TAREFAS] Erro dashboard:', err)
    res.status(500).json({ error: 'Erro ao buscar dashboard de tarefas.' })
  }
})

// ── LISTAR TAREFAS ───────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { status, prioridade, responsavel_id } = req.query

    let sql = `
      SELECT t.*,
             p.nome  AS responsavel_nome_perfil,
             p.cargo AS responsavel_cargo,
             c.nome  AS criado_por_nome,
             COALESCE((SELECT COUNT(*)::int FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id), 0) AS anexos_count,
             (SELECT MAX(a.created_at) FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id) AS ultima_evidencia_em
      FROM tarefas t
      LEFT JOIN profiles p ON p.id = t.responsavel_id
      LEFT JOIN profiles c ON c.id = t.criado_por
      WHERE t.org_id = $1
    `
    const params: unknown[] = [orgId]
    let idx = 2

    if (role === 'membro') {
      sql += ` AND (t.responsavel_id = $${idx} OR t.criado_por = $${idx})`
      params.push(userId); idx++
    } else if (role === 'sub_gestor') {
      sql += ` AND (t.criado_por = $${idx} OR t.responsavel_id = $${idx} OR t.responsavel_id IN (SELECT id FROM profiles WHERE criado_por = $${idx} AND org_id = $${idx + 1}))`
      params.push(userId, orgId); idx += 2
    } else if (role === 'gestor') {
      sql += ` AND (t.criado_por = $${idx} OR t.responsavel_id = $${idx})`
      params.push(userId); idx++
    }

    if (typeof status === 'string' && status && status !== 'todos') { sql += ` AND t.status = $${idx++}`; params.push(status) }
    if (typeof prioridade === 'string' && prioridade && prioridade !== 'todos') { sql += ` AND t.prioridade = $${idx++}`; params.push(prioridade) }
    if (typeof responsavel_id === 'string' && responsavel_id && role !== 'membro') { sql += ` AND t.responsavel_id = $${idx++}`; params.push(responsavel_id) }

    sql += ' ORDER BY t.created_at DESC'
    const tarefas = await query(sql, params)
    res.json({ tarefas })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefas.' })
  }
})

// ── CRIAR TAREFA ─────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { titulo, descricao, data, prazo, prioridade = 'media', responsavel_id, checklist = [], obs } = req.body

    if (!titulo?.trim()) { res.status(400).json({ error: 'Título é obrigatório.' }); return }
    if (!['baixa','media','alta'].includes(prioridade)) { res.status(400).json({ error: 'Prioridade inválida.' }); return }

    let responsavelId = responsavel_id || userId

    if (role === 'membro') {
      // membro só cria tarefa pessoal para si mesmo
      responsavelId = userId
    } else if (responsavelId) {
      const resp = await queryOne<{ id: string; nome: string; criado_por: string | null }>(
        'SELECT id, nome, criado_por FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE',
        [responsavelId, orgId]
      )
      if (!resp) { res.status(404).json({ error: 'Responsável não encontrado.' }); return }
      if (role === 'sub_gestor' && resp.id !== userId && resp.criado_por !== userId) {
        res.status(403).json({ error: 'Sub-gestor só pode atribuir tarefas para si ou seus comandados diretos.' }); return
      }
    }

    const responsavel = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1 AND org_id = $2', [responsavelId, orgId])
    const criador = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId])

    const tarefa = await queryOne<any>(
      `INSERT INTO tarefas
         (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade, checklist, obs, status, status_gestor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendente','aguardando')
       RETURNING *`,
      [orgId, userId, responsavelId, responsavel?.nome || null, titulo.trim(), descricao || null, data || null, prazo || null, prioridade, normalizeChecklist(checklist), obs || null]
    )

    await syncChecklistTable({ orgId, tarefaId: tarefa.id, userId, checklist })
    await addHistorico({ orgId, tarefaId: tarefa.id, userId, acao: 'criada', statusNovo: 'pendente', observacao: obs || null })

    if (responsavelId && responsavelId !== userId) {
      const prazoFmt = prazo ? ` — prazo: ${new Date(prazo).toLocaleDateString('pt-BR')}` : ''
      await criarNotificacao({
        orgId, userId: responsavelId,
        tipo: 'nova_tarefa',
        titulo: '📋 Nova tarefa atribuída a você!',
        body: `"${titulo.trim()}" por ${criador?.nome || 'Gestor'}${prazoFmt}`,
        referenciaId: tarefa.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.status(201).json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa.' })
  }
})

// ── ATUALIZAR STATUS PELO MEMBRO ─────────────────────────────────────────────
router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { id } = req.params
    const { status, motivo_nao_conclusao, observacao_conclusao, resposta_membro } = req.body

    if (!['em_progresso','concluida','nao_concluida'].includes(status)) {
      res.status(400).json({ error: 'Status permitido: em_progresso, concluida ou nao_concluida.' }); return
    }
    if (status === 'nao_concluida' && !String(motivo_nao_conclusao || resposta_membro || '').trim()) {
      res.status(400).json({ error: 'Motivo é obrigatório para marcar como não concluída.' }); return
    }

    const existing = await getTaskForAccess(id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (existing.responsavel_id !== userId && existing.criado_por !== userId) {
      res.status(403).json({ error: 'Você só pode atualizar status de tarefas atribuídas ou criadas por você.' }); return
    }

    const statusAnterior = existing.status
    const sets: string[] = ['status = $1', 'status_gestor = $2', 'updated_at = NOW()']
    const params: unknown[] = [status, status === 'em_progresso' ? existing.status_gestor || 'aguardando' : 'aguardando']
    let idx = 3

    if (status === 'em_progresso') sets.push(`data_inicio = COALESCE(data_inicio, NOW())`)
    if (status === 'concluida') {
      sets.push(`data_conclusao = NOW()`)
      sets.push(`observacao_conclusao = $${idx++}`); params.push(observacao_conclusao || resposta_membro || null)
      sets.push(`resposta_membro = $${idx++}`); params.push(resposta_membro || observacao_conclusao || null)
      sets.push(`resposta_status = 'concluida'`)
      sets.push(`resposta_obs = $${idx++}`); params.push(observacao_conclusao || resposta_membro || null)
      sets.push(`resposta_em = NOW()`)
    }
    if (status === 'nao_concluida') {
      sets.push(`motivo_nao_conclusao = $${idx++}`); params.push(motivo_nao_conclusao || resposta_membro)
      sets.push(`resposta_membro = $${idx++}`); params.push(resposta_membro || motivo_nao_conclusao)
      sets.push(`resposta_status = 'nao_concluida'`)
      sets.push(`resposta_obs = $${idx++}`); params.push(motivo_nao_conclusao || resposta_membro)
      sets.push(`resposta_em = NOW()`)
    }

    params.push(id, orgId)
    const tarefa = await queryOne<any>(`UPDATE tarefas SET ${sets.join(', ')} WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`, params)
    await addHistorico({ orgId, tarefaId: id, userId, acao: status, statusAnterior, statusNovo: status, observacao: motivo_nao_conclusao || observacao_conclusao || resposta_membro || null })

    if (existing.criado_por && existing.criado_por !== userId && status !== 'em_progresso') {
      await criarNotificacao({
        orgId,
        userId: existing.criado_por,
        tipo: status === 'concluida' ? 'tarefa_concluida' : 'tarefa_nao_concluida',
        titulo: status === 'concluida' ? '✅ Tarefa concluída!' : '❌ Tarefa não concluída',
        body: status === 'concluida' ? `A tarefa "${existing.titulo}" foi concluída.` : `A tarefa "${existing.titulo}" não foi concluída.`,
        referenciaId: id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar status:', err)
    res.status(500).json({ error: 'Erro ao atualizar status da tarefa.' })
  }
})

// ── APROVAR ─────────────────────────────────────────────────────────────────
router.patch('/:id/aprovar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') { res.status(403).json({ error: 'Membro não aprova tarefa.' }); return }
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!)) || existing.criado_por !== userId) {
      res.status(403).json({ error: 'Você só pode aprovar tarefas criadas por você.' }); return
    }
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status = 'aprovada', status_gestor = 'aprovada', aprovada_em = NOW(), aprovada_por = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [userId, req.params.id, orgId]
    )
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'aprovada', statusAnterior: existing.status, statusNovo: 'aprovada' })
    if (existing.responsavel_id && existing.responsavel_id !== userId) {
      await criarNotificacao({ orgId, userId: existing.responsavel_id, tipo: 'tarefa_aprovada', titulo: '✅ Tarefa aprovada', body: `"${existing.titulo}" foi aprovada.`, referenciaId: req.params.id, referenciaTipo: 'tarefa' }).catch(() => {})
    }
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao aprovar:', err)
    res.status(500).json({ error: 'Erro ao aprovar tarefa.' })
  }
})

// ── DEVOLVER ────────────────────────────────────────────────────────────────
router.patch('/:id/devolver', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') { res.status(403).json({ error: 'Membro não devolve tarefa.' }); return }
    const { ressalva_gestor } = req.body
    if (!String(ressalva_gestor || '').trim()) { res.status(400).json({ error: 'Ressalva é obrigatória.' }); return }
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!)) || existing.criado_por !== userId) {
      res.status(403).json({ error: 'Você só pode devolver tarefas criadas por você.' }); return
    }
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status = 'devolvida', status_gestor = 'devolvida', ressalva_gestor = $1, devolvida_em = NOW(), updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [String(ressalva_gestor).trim(), req.params.id, orgId]
    )
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'devolvida', statusAnterior: existing.status, statusNovo: 'devolvida', observacao: String(ressalva_gestor).trim() })
    if (existing.responsavel_id && existing.responsavel_id !== userId) {
      await criarNotificacao({ orgId, userId: existing.responsavel_id, tipo: 'tarefa_devolvida', titulo: '↩️ Tarefa devolvida', body: String(ressalva_gestor).trim(), referenciaId: req.params.id, referenciaTipo: 'tarefa' }).catch(() => {})
    }
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao devolver:', err)
    res.status(500).json({ error: 'Erro ao devolver tarefa.' })
  }
})

// ── REABRIR / COMPLEMENTAR TAREFA APROVADA ─────────────────────────────────
router.patch('/:id/reabrir', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { complemento, prazo, prioridade } = req.body || {}
    if (!complemento?.trim()) { res.status(400).json({ error: 'Informe o complemento solicitado.' }); return }

    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    if (role === 'membro') { res.status(403).json({ error: 'Membro não pode reabrir tarefa.' }); return }
    if (!canDeleteOrgRecords(role) && existing.criado_por !== userId) { res.status(403).json({ error: 'Você só pode complementar tarefas criadas por você.' }); return }

    const carimbo = new Date().toLocaleString('pt-BR')
    const obsComplemento = `Complemento solicitado em ${carimbo}: ${complemento.trim()}`
    const novaObs = [existing.obs, obsComplemento].filter(Boolean).join('\n\n')

    const updated = await queryOne(
      `UPDATE tarefas SET
         status = 'pendente',
         status_gestor = 'aguardando',
         ressalva_gestor = NULL,
         resposta_membro = NULL,
         motivo_nao_conclusao = NULL,
         observacao_conclusao = NULL,
         data_inicio = NULL,
         data_conclusao = NULL,
         prazo = COALESCE($1, prazo),
         prioridade = COALESCE($2, prioridade),
         obs = $3,
         updated_at = NOW()
       WHERE id = $4 AND org_id = $5
       RETURNING *`,
      [prazo || null, prioridade || null, novaObs, req.params.id, orgId]
    )

    await addHistorico({
      orgId,
      tarefaId: req.params.id,
      userId,
      acao: 'complemento_solicitado',
      statusAnterior: existing.status,
      statusNovo: 'pendente',
      observacao: complemento.trim(),
    })

    if (existing.responsavel_id && existing.responsavel_id !== userId) {
      await criarNotificacao({
        orgId,
        userId: existing.responsavel_id,
        tipo: 'tarefa_atualizada',
        titulo: 'Complemento solicitado em tarefa',
        body: updated?.titulo || existing.titulo,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.json({ tarefa: updated })
  } catch (err) {
    console.error('[TAREFAS] Erro ao reabrir/complementar:', err)
    res.status(500).json({ error: 'Erro ao reabrir tarefa.' })
  }
})

// ── REENVIAR CORREÇÃO APÓS DEVOLUÇÃO ────────────────────────────────────────
router.patch('/:id/reenviar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { observacao } = req.body || {}
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    if (existing.responsavel_id !== userId && existing.criado_por !== userId) {
      res.status(403).json({ error: 'Você só pode reenviar tarefas atribuídas ou criadas por você.' }); return
    }
    if (existing.status !== 'devolvida') {
      res.status(400).json({ error: 'Somente tarefas devolvidas podem ser reenviadas.' }); return
    }

    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET
         status = 'reenviada',
         status_gestor = 'aguardando',
         resposta_membro = COALESCE($1, resposta_membro),
         observacao_conclusao = COALESCE($1, observacao_conclusao),
         reenviada_em = NOW(),
         updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [String(observacao || '').trim() || null, req.params.id, orgId]
    )

    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'reenviada', statusAnterior: existing.status, statusNovo: 'reenviada', observacao: String(observacao || '').trim() || null })

    if (existing.criado_por && existing.criado_por !== userId) {
      const autor = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId])
      await criarNotificacao({
        orgId,
        userId: existing.criado_por,
        tipo: 'tarefa_reenviada',
        titulo: `${autor?.nome || 'Membro'} reenviou a tarefa`,
        body: `"${existing.titulo}" foi reenviada para conferência.`,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao reenviar:', err)
    res.status(500).json({ error: 'Erro ao reenviar tarefa.' })
  }
})

// ── HISTÓRICO ────────────────────────────────────────────────────────────────
router.get('/:id/historico', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(task, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    const historico = await query(
      `SELECT h.*, p.nome AS usuario_nome
       FROM tarefas_historico h
       LEFT JOIN profiles p ON p.id = h.user_id
       WHERE h.tarefa_id = $1 AND h.org_id = $2
       ORDER BY h.created_at DESC`,
      [req.params.id, orgId]
    ).catch(() => [])
    res.json({ historico })
  } catch (err) {
    console.error('[TAREFAS] Erro historico:', err)
    res.status(500).json({ error: 'Erro ao buscar histórico.' })
  }
})


// ── ANEXOS / EVIDÊNCIAS DA TAREFA ────────────────────────────────────────────
// GET /api/tarefas/:id/anexos
router.get('/:id/anexos', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(task, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const anexos = await query(
      `SELECT a.*, p.nome AS enviado_por_nome
       FROM tarefa_anexos a
       LEFT JOIN profiles p ON p.id = a.enviado_por
       WHERE a.tarefa_id = $1 AND a.org_id = $2
       ORDER BY a.created_at DESC`,
      [req.params.id, orgId]
    )

    res.json({ anexos })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar anexos:', err)
    res.status(500).json({ error: 'Erro ao buscar anexos da tarefa.' })
  }
})

// POST /api/tarefas/:id/anexos
// Usado pelo membro para anexar evidências da execução e pelo gestor para anexar referência/validação.
router.post('/:id/anexos', uploadEvidenceFile, async (req: MulterTaskRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Nenhum arquivo enviado.' }); return }

    const { orgId, userId } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) {
      removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }
    if (!(await userCanAccessTask(task, req.user!))) {
      removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(403).json({ error: 'Acesso negado.' })
      return
    }

    const { titulo, descricao, tipo = 'evidencia' } = req.body
    const arquivoUrl = buildUploadUrl(req.file.filename)
    const anexo = await queryOne(
      `INSERT INTO tarefa_anexos
         (org_id, tarefa_id, enviado_por, titulo, descricao, tipo, arquivo_url, nome_original, mime_type, tamanho)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        orgId,
        req.params.id,
        userId,
        String(titulo || req.file.originalname || 'Anexo da tarefa').trim(),
        descricao ? String(descricao).trim() : null,
        String(tipo || 'evidencia').trim(),
        arquivoUrl,
        req.file.originalname || null,
        req.file.mimetype || null,
        req.file.size || null,
      ]
    )

    await addHistorico({
      orgId,
      tarefaId: req.params.id,
      userId,
      acao: 'anexo_adicionado',
      statusAnterior: task.status,
      statusNovo: task.status,
      observacao: `${anexo?.titulo || 'Anexo'} (${req.file.originalname || req.file.filename})`,
    })

    if (task.criado_por && task.criado_por !== userId) {
      await criarNotificacao({
        orgId,
        userId: task.criado_por,
        tipo: 'tarefa_atualizada',
        titulo: '📎 Anexo enviado na tarefa',
        body: `Foi anexado um arquivo na tarefa "${task.titulo}".`,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.status(201).json({ anexo })
  } catch (err) {
    if (req.file) { removeUploadByUrl(buildUploadUrl(req.file.filename)) }
    const msg = uploadErrorMessage(err)
    console.error('[TAREFAS] Erro ao anexar:', msg)
    res.status(500).json({ error: msg })
  }
})

// DELETE /api/tarefas/:id/anexos/:anexoId
router.delete('/:id/anexos/:anexoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(task, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const anexo = await queryOne<any>(
      `SELECT * FROM tarefa_anexos WHERE id = $1 AND tarefa_id = $2 AND org_id = $3`,
      [req.params.anexoId, req.params.id, orgId]
    )
    if (!anexo) { res.status(404).json({ error: 'Anexo não encontrado.' }); return }

    const canDelete = canDeleteOrgRecords(role) || anexo.enviado_por === userId || task.criado_por === userId || role === 'sub_gestor'
    if (!canDelete) { res.status(403).json({ error: 'Você não tem permissão para excluir este anexo.' }); return }

    removeUploadByUrl(anexo.arquivo_url)

    await query('DELETE FROM tarefa_anexos WHERE id = $1 AND tarefa_id = $2 AND org_id = $3', [req.params.anexoId, req.params.id, orgId])
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'anexo_removido', statusAnterior: task.status, statusNovo: task.status, observacao: anexo.titulo || anexo.nome_original || null })
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir anexo:', err)
    res.status(500).json({ error: 'Erro ao excluir anexo da tarefa.' })
  }
})

// ── BUSCAR TAREFA ────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const tarefa = await getTaskForAccess(req.params.id, orgId)
    if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(tarefa, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefa.' })
  }
})

// ── EDITAR TAREFA ────────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const isMember = role === 'membro'
    const allowed = isMember ? ['checklist', 'obs'] : ['titulo','descricao','data','prazo','prioridade','responsavel_id','checklist','obs']

    if ((req.body as any).checklist !== undefined && checklistDoneChanged(existing.checklist, (req.body as any).checklist) && !isTaskExecutor(existing, userId)) {
      res.status(403).json({ error: 'Apenas o executor da tarefa pode marcar o checklist.' })
      return
    }

    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const key of allowed) {
      if ((req.body as any)[key] !== undefined) {
        if (key === 'responsavel_id') {
          const resp = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE', [(req.body as any)[key], orgId])
          if (!resp) { res.status(404).json({ error: 'Responsável não encontrado.' }); return }
          sets.push(`responsavel_id = $${idx++}`); params.push((req.body as any)[key])
          sets.push(`responsavel_nome = $${idx++}`); params.push(resp.nome)
        } else if (key === 'checklist') {
          sets.push(`checklist = $${idx++}`); params.push(normalizeChecklist((req.body as any)[key]))
        } else {
          sets.push(`${key} = $${idx++}`); params.push((req.body as any)[key] || null)
        }
      }
    }
    if (!sets.length) { res.status(400).json({ error: 'Nenhum campo para atualizar.' }); return }
    params.push(req.params.id, orgId)
    const tarefa = await queryOne<any>(`UPDATE tarefas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`, params)
    if ((req.body as any).checklist !== undefined) {
      await syncChecklistTable({ orgId, tarefaId: req.params.id, userId, checklist: (req.body as any).checklist })
    }
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'atualizada', statusAnterior: existing.status, statusNovo: tarefa.status })
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' })
  }
})

// ── RESPONDER: compatibilidade com frontend antigo ───────────────────────────
router.post('/:id/resposta', async (req: Request, res: Response): Promise<void> => {
  try {
    const { resposta_status, resposta_obs } = req.body
    req.body.status = resposta_status === 'nao_concluida' ? 'nao_concluida' : 'concluida'
    req.body.motivo_nao_conclusao = resposta_status === 'nao_concluida' ? resposta_obs : undefined
    req.body.observacao_conclusao = resposta_status === 'concluida' ? resposta_obs : undefined
    // Encaminha logicamente replicando o update de status sem redirect HTTP.
    const { orgId, userId } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (existing.responsavel_id !== userId && existing.criado_por !== userId) { res.status(403).json({ error: 'Acesso negado.' }); return }
    const status = req.body.status
    if (status === 'nao_concluida' && !String(resposta_obs || '').trim()) { res.status(400).json({ error: 'Motivo é obrigatório.' }); return }
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status = $1, status_gestor = 'aguardando', resposta_status = $2, resposta_obs = $3,
          resposta_membro = $3,
          motivo_nao_conclusao = CASE WHEN $1 = 'nao_concluida' THEN $3 ELSE motivo_nao_conclusao END,
          observacao_conclusao = CASE WHEN $1 = 'concluida' THEN $3 ELSE observacao_conclusao END,
          data_conclusao = CASE WHEN $1 = 'concluida' THEN NOW() ELSE data_conclusao END,
          resposta_em = NOW(), updated_at = NOW()
       WHERE id = $4 AND org_id = $5 RETURNING *`,
      [status, resposta_status, resposta_obs || null, req.params.id, orgId]
    )
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: status, statusAnterior: existing.status, statusNovo: status, observacao: resposta_obs || null })
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao responder:', err)
    res.status(500).json({ error: 'Erro ao registrar resposta.' })
  }
})

// ── EXCLUIR TAREFA ───────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    const canDeleteAny = canDeleteOrgRecords(role)
    if (role === 'membro' && existing.criado_por !== userId) { res.status(403).json({ error: 'Membro só exclui tarefas pessoais criadas por ele.' }); return }
    if (!canDeleteAny && role !== 'membro' && existing.criado_por !== userId && existing.responsavel_id !== userId) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const anexos = await query<{ arquivo_url?: string }>('SELECT arquivo_url FROM tarefa_anexos WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId])
    await query('BEGIN')
    try {
      await query('DELETE FROM tarefa_anexos WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query('DELETE FROM tarefa_checklist WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query('DELETE FROM tarefas_historico WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query('DELETE FROM tarefa_historico WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      const deleted = await query('DELETE FROM tarefas WHERE id = $1 AND org_id = $2 RETURNING id', [req.params.id, orgId]) as any[]
      if (deleted.length === 0) throw new Error('Tarefa não encontrada para exclusão.')
      await query('COMMIT')
    } catch (cleanupErr) {
      await query('ROLLBACK').catch(() => {})
      throw cleanupErr
    }
    for (const anexo of anexos) removeUploadByUrl(anexo.arquivo_url)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir tarefa.' })
  }
})

export default router
