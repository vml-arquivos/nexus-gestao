import { Router, Request, Response } from 'express'
import pool, { query, queryOne } from '../db/pool'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
import { criarNotificacao } from '../lib/notifHelper'

const router = Router()
const SCORE_MAX = 20

function parseChecklist(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      if (Array.isArray(parsed?.items)) return parsed.items
      if (Array.isArray(parsed?.checklist)) return parsed.checklist
    } catch {
      return []
    }
  }
  if (value && typeof value === 'object') {
    const item = value as any
    if (Array.isArray(item.items)) return item.items
    if (Array.isArray(item.checklist)) return item.checklist
  }
  return []
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function assignmentId(item: any): string | null {
  for (const value of [item?.responsavel_id, item?.assumido_por, item?.executor_id, item?.aceita_por]) {
    if (isUuid(value)) return value
  }
  return null
}

function itemExecutorId(item: any, task: any): string | null {
  const candidates = item?.feito
    ? [item?.concluido_por, item?.feito_por, assignmentId(item), task?.aceita_por, task?.responsavel_id]
    : [assignmentId(item), item?.concluido_por, item?.feito_por, task?.aceita_por, task?.responsavel_id]
  for (const value of candidates) if (isUuid(value)) return value
  return null
}

function executorIds(task: any): Set<string> {
  const ids = new Set<string>()
  const items = parseChecklist(task?.checklist)
  if (items.length) {
    for (const item of items) {
      const id = itemExecutorId(item, task)
      if (id) ids.add(id)
    }
  } else {
    const id = task?.aceita_por || task?.responsavel_id
    if (isUuid(id)) ids.add(id)
  }
  return ids
}

function isMultiExecutor(task: any): boolean {
  return executorIds(task).size > 1
}

// ── Escopo de pontuação (lista / itens / ambos) ──────────────────────────
// Réplica isolada da mesma lógica de backend/src/routes/tarefas.ts — mantida
// separada de propósito para não criar acoplamento entre os dois arquivos de
// rota; qualquer mudança de regra precisa ser espelhada nos dois lugares.
type PontuacaoEscopo = 'tarefa' | 'subtarefas' | 'ambos'

function parseOriginPayloadSafe(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' ? { ...(value as Record<string, any>) } : {}
}

function normalizePontuacaoEscopo(value: unknown): PontuacaoEscopo {
  const raw = String(value || '').trim().toLowerCase()
  if (['tarefa', 'task', 'somente_tarefa', 'apenas_tarefa'].includes(raw)) return 'tarefa'
  if (['subtarefa', 'subtarefas', 'checklist', 'checklists', 'somente_subtarefas', 'apenas_subtarefas'].includes(raw)) return 'subtarefas'
  return 'ambos'
}

// Diferente do frontend (que assume 'tarefa' como padrão para registros sem
// configuração), aqui precisamos saber se a tarefa TEM ou NÃO uma escolha
// explícita — tarefas antigas, criadas antes desta opção existir, continuam
// usando a regra antiga (inferida pela quantidade de executores), para não
// mudar retroativamente a pontuação de nada que já estava em andamento.
function explicitPontuacaoEscopo(task: any): PontuacaoEscopo | null {
  const payload = parseOriginPayloadSafe(task?.origem_payload)
  const raw = task?.pontuacao_escopo || payload?.nexus_pontuacao_escopo || payload?.pontuacao_escopo || payload?.pontuacao_tipo
  if (!raw) return null
  return normalizePontuacaoEscopo(raw)
}

function officialScore(value: unknown, fallback = 3): number {
  const raw = Number(value)
  const n = Number.isFinite(raw) ? raw : fallback
  if (n <= 0) return 0
  if (n <= 1) return 1
  if (n <= 3) return 3
  if (n <= 5) return 5
  return 20
}

function difficultyScore(value: unknown): number {
  const raw = String(value || '').trim().toLowerCase()
  if (['nivel_1', 'iniciante'].includes(raw)) return 0
  if (['nivel_2', 'facil'].includes(raw)) return 1
  if (['nivel_3', 'medio'].includes(raw)) return 3
  if (['nivel_4', 'dificil'].includes(raw)) return 5
  if (['nivel_5', 'hard'].includes(raw)) return 20
  return 3
}

function itemPoints(item: any): number {
  const fallback = difficultyScore(item?.dificuldade)
  return Math.max(0, Math.min(SCORE_MAX, officialScore(item?.pontuacao, fallback)))
}

function taskPoints(task: any): number {
  return Math.max(0, Math.min(SCORE_MAX, officialScore(task?.pontuacao, 3)))
}

function periodMonth(value: unknown = new Date()): string {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 7) : date.toISOString().slice(0, 7)
}

function periodRange(raw: string) {
  const now = new Date()
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  if (raw === 'semana') {
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const day = start.getUTCDay() || 7
    start.setUTCDate(start.getUTCDate() - day + 1)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)
    return { label: 'semana', start: iso(start), end: iso(end) }
  }
  if (raw === 'mes') {
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    return { label: 'mes', start: iso(start), end: iso(end) }
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const start = new Date(`${raw}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
    return { label: raw, start: iso(start), end: iso(end) }
  }
  return { label: 'todos', start: null as string | null, end: null as string | null }
}

function inPeriod(value: unknown, range: ReturnType<typeof periodRange>): boolean {
  if (range.label === 'todos') return true
  const date = String(value || '').slice(0, 10)
  return Boolean(date && range.start && range.end && date >= range.start && date < range.end)
}

let compatibilityPromise: Promise<void> | null = null
async function ensureCompatibilitySchema() {
  if (!compatibilityPromise) {
    compatibilityPromise = (async () => {
      await query(`ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL`)
      // Nota: em produção este índice já é criado de forma definitiva (com
      // deduplicação prévia) pela migration em backend/src/db/migrate.ts.
      // Esta chamada permanece apenas como reforço best-effort para bancos
      // que ainda não rodaram a migration mais recente; se falhar, o erro é
      // logado (não mais engolido silenciosamente) para ficar visível em
      // observabilidade, já que a ausência desse índice quebra o
      // ON CONFLICT usado pela aprovação de tarefas.
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_tarefas_pontuacao_tarefa_usuario_motivo ON tarefas_pontuacao (tarefa_id, usuario_id, motivo)`)
    })().catch(err => {
      compatibilityPromise = null
      console.error('[TAREFAS-SCORING] Falha ao garantir schema de compatibilidade (rode a migration mais recente em backend/src/db/migrate.ts):', err)
      throw err
    })
  }
  return compatibilityPromise
}

async function canManageTask(task: any, req: Request): Promise<boolean> {
  const user = req.user!
  if (canDeleteOrgRecords(user.role) || user.role === 'gestor') return true
  if (user.role !== 'sub_gestor') return false
  if (task.criado_por === user.userId || task.responsavel_id === user.userId) return true
  if (parseChecklist(task.checklist).some(item => assignmentId(item) === user.userId)) return true
  if (!task.responsavel_id) return false
  const managed = await queryOne(
    'SELECT id FROM profiles WHERE id = $1 AND org_id = $2 AND criado_por = $3',
    [task.responsavel_id, user.orgId, user.userId],
  )
  return Boolean(managed)
}

async function upsertItemScore(client: any, task: any, item: any, approverId: string) {
  const participant = itemExecutorId(item, task)
  const points = itemPoints(item)
  if (!participant || points <= 0 || task.conta_ranking === false) return
  await client.query(
    `INSERT INTO tarefas_pontuacao (
       org_id, tarefa_id, usuario_id, checklist_id, pontos, motivo,
       aprovado_por, aprovado_em, periodo_mes,
       tarefa_titulo_snapshot, item_titulo_snapshot, escopo_snapshot, conta_ranking_snapshot
     )
     SELECT $1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,$10,'equipe',TRUE
     WHERE EXISTS (
       SELECT 1 FROM profiles p
       WHERE p.id = $3 AND p.org_id = $1 AND p.ativo = TRUE AND p.role = 'membro'
     )
     ON CONFLICT (tarefa_id, usuario_id, motivo) DO UPDATE SET
       checklist_id = EXCLUDED.checklist_id,
       pontos = EXCLUDED.pontos,
       aprovado_por = EXCLUDED.aprovado_por,
       aprovado_em = EXCLUDED.aprovado_em,
       periodo_mes = EXCLUDED.periodo_mes,
       tarefa_titulo_snapshot = EXCLUDED.tarefa_titulo_snapshot,
       item_titulo_snapshot = EXCLUDED.item_titulo_snapshot,
       escopo_snapshot = EXCLUDED.escopo_snapshot,
       conta_ranking_snapshot = TRUE,
       tarefa_excluida_em = NULL`,
    [task.org_id, task.id, participant, String(item.id || item.texto || ''), points, `checklist_aprovado:${item.id || item.texto}`, approverId, periodMonth(), task.titulo || 'Tarefa', item.texto || 'Tarefa da lista'],
  )
}

async function upsertTaskScore(client: any, task: any, approverId: string) {
  const ids = executorIds(task)
  const participant = task.aceita_por || task.responsavel_id || Array.from(ids)[0]
  const points = taskPoints(task)
  if (!participant || points <= 0 || task.conta_ranking === false) return
  await client.query(
    `INSERT INTO tarefas_pontuacao (
       org_id, tarefa_id, usuario_id, checklist_id, pontos, motivo,
       aprovado_por, aprovado_em, periodo_mes,
       tarefa_titulo_snapshot, item_titulo_snapshot, escopo_snapshot, conta_ranking_snapshot
     )
     SELECT $1,$2,$3,'__tarefa__',$4,'tarefa_aprovada',$5,NOW(),$6,$7,NULL,'equipe',TRUE
     WHERE EXISTS (
       SELECT 1 FROM profiles p
       WHERE p.id = $3 AND p.org_id = $1 AND p.ativo = TRUE AND p.role = 'membro'
     )
     ON CONFLICT (tarefa_id, usuario_id, motivo) DO UPDATE SET
       checklist_id = '__tarefa__', pontos = EXCLUDED.pontos,
       aprovado_por = EXCLUDED.aprovado_por, aprovado_em = EXCLUDED.aprovado_em,
       periodo_mes = EXCLUDED.periodo_mes,
       tarefa_titulo_snapshot = EXCLUDED.tarefa_titulo_snapshot,
       item_titulo_snapshot = NULL, escopo_snapshot = 'equipe',
       conta_ranking_snapshot = TRUE, tarefa_excluida_em = NULL`,
    [task.org_id, task.id, participant, points, approverId, periodMonth(), task.titulo || 'Tarefa'],
  )
}

router.patch('/:id/checklist/:itemId/revisao', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  await ensureCompatibilitySchema().catch(() => undefined)
  const client = await pool.connect()
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Apenas a gestão pode revisar entregas.' })
      return
    }
    const decisionRaw = String(req.body?.decisao || '')
    if (decisionRaw !== 'aprovar' && decisionRaw !== 'devolver') {
      res.status(400).json({ error: 'Decisão inválida.' })
      return
    }
    const decision: 'aprovar' | 'devolver' = decisionRaw

    await client.query('BEGIN')
    const locked = await client.query('SELECT * FROM tarefas WHERE id = $1 AND org_id = $2 FOR UPDATE', [req.params.id, orgId])
    const task = locked.rows[0]
    if (!task || !(await canManageTask(task, req))) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }

    const items = parseChecklist(task.checklist)
    const index = items.findIndex(item => String(item.id) === String(req.params.itemId))
    if (index < 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Item não encontrado.' })
      return
    }

    const item = { ...items[index] }
    if (decision === 'aprovar' && !item.feito) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'O executor ainda não enviou este item.' })
      return
    }

    const alreadyApproved = decision === 'aprovar' && item.aprovacao_status === 'aprovada'
    if (alreadyApproved) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Este item já foi aprovado e não pode ser aprovado novamente.' })
      return
    }
    const now = new Date().toISOString()
    if (decision === 'aprovar') {
      item.aprovacao_status = 'aprovada'
      item.aprovado_por = userId
      item.aprovado_em = now
      item.ressalva_gestor = null
      const escopoExplicitoItem = explicitPontuacaoEscopo(task)
      const incluiItensRevisao = escopoExplicitoItem ? (escopoExplicitoItem === 'subtarefas' || escopoExplicitoItem === 'ambos') : isMultiExecutor(task)
      if (incluiItensRevisao) await upsertItemScore(client, task, item, userId)
    } else {
      item.aprovacao_status = 'devolvida'
      item.ressalva_gestor = String(req.body?.ressalva || '').trim() || 'Necessita correção'
      item.devolvido_por = userId
      item.devolvido_em = now
      item.feito = false
      await client.query(
        `DELETE FROM tarefas_pontuacao
         WHERE org_id = $1 AND tarefa_id = $2
           AND (checklist_id = $3 OR motivo = $4)`,
        [orgId, task.id, String(item.id || ''), `checklist_aprovado:${item.id || item.texto}`],
      )
    }
    items[index] = item

    const updated = await client.query(
      `UPDATE tarefas SET
         checklist = $1::jsonb,
         status = CASE WHEN $2 = 'devolver' THEN 'em_progresso' ELSE status END,
         status_gestor = CASE WHEN $2 = 'devolver' THEN 'aguardando' ELSE status_gestor END,
         updated_at = NOW()
       WHERE id = $3 AND org_id = $4
       RETURNING *`,
      [JSON.stringify(items), decision, task.id, orgId],
    )

    await client.query(
      `INSERT INTO tarefas_comentarios
         (org_id, tarefa_id, checklist_id, autor_id, comentario, tipo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [orgId, task.id, String(item.id || ''), userId, String(req.body?.ressalva || (decision === 'aprovar' ? 'Item aprovado pela gestão.' : 'Item devolvido para correção.')), decision === 'aprovar' ? 'aprovacao' : 'devolucao'],
    )

    await client.query('COMMIT')

    const participant = itemExecutorId(item, task)
    if (participant && participant !== userId) {
      await criarNotificacao({
        orgId,
        userId: participant,
        tipo: decision === 'aprovar' ? 'tarefa_aprovada' : 'tarefa_devolvida',
        titulo: decision === 'aprovar' ? '✅ Sua parte foi aprovada' : '↩️ Sua parte foi devolvida',
        body: decision === 'aprovar' ? `A tarefa "${item.texto || task.titulo}" foi aprovada.` : item.ressalva_gestor,
        referenciaId: task.id,
        referenciaTipo: 'tarefa',
      }).catch(() => undefined)
    }

    res.json({ tarefa: updated.rows[0], pontuacao_liberada: decision === 'aprovar' && isMultiExecutor({ ...task, checklist: items }) })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('[TAREFAS-SCORING] Erro na revisão por item:', err)
    res.status(500).json({ error: 'Erro ao revisar item.' })
  } finally {
    client.release()
  }
})

router.patch('/:id/aprovar', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  await ensureCompatibilitySchema().catch(() => undefined)
  const client = await pool.connect()
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Membro não aprova tarefa.' })
      return
    }
    await client.query('BEGIN')
    const locked = await client.query('SELECT * FROM tarefas WHERE id = $1 AND org_id = $2 FOR UPDATE', [req.params.id, orgId])
    const task = locked.rows[0]
    if (!task || !(await canManageTask(task, req))) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }
    if (String(task.escopo || 'pessoal') !== 'equipe') {
      await client.query('ROLLBACK')
      res.status(403).json({ error: 'Tarefas pessoais não passam por aprovação do gestor.' })
      return
    }
    if (String(task.status || '') === 'aprovada') {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Esta lista já foi aprovada e não pode ser aprovada novamente.' })
      return
    }
    if (!['concluida', 'reenviada'].includes(String(task.status || ''))) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'A tarefa só pode ser aprovada depois que o executor enviar a conclusão.' })
      return
    }

    const items = parseChecklist(task.checklist)
    const multi = isMultiExecutor(task)

    // Se a lista tem escolha explícita de escopo, ela manda — inclusive
    // permitindo "ambos" (lista + itens ao mesmo tempo), que a regra antiga
    // (baseada só em quantos executores existem) nunca conseguia expressar.
    // Sem escolha explícita (tarefas antigas), mantém o comportamento de
    // sempre: múltiplos executores pontuam por item, um único executor
    // pontua pela tarefa.
    const escopoExplicito = explicitPontuacaoEscopo(task)
    const incluiItens = escopoExplicito ? (escopoExplicito === 'subtarefas' || escopoExplicito === 'ambos') : multi
    const incluiTarefa = escopoExplicito ? (escopoExplicito === 'tarefa' || escopoExplicito === 'ambos') : !multi

    if (incluiItens) {
      const pending = items.filter(item => item.feito && item.aprovacao_status !== 'aprovada')
      if (pending.length) {
        await client.query('ROLLBACK')
        res.status(409).json({ error: `Aprove cada parte antes da aprovação final (${pending.length} pendente(s)).` })
        return
      }
      for (const item of items) {
        if (item.feito && item.aprovacao_status === 'aprovada') await upsertItemScore(client, task, item, userId)
      }
    } else {
      // Escopo atual não inclui pontos por item — remove pontuação de itens
      // que possa ter ficado de uma configuração/aprovação anterior.
      await client.query(`DELETE FROM tarefas_pontuacao WHERE org_id = $1 AND tarefa_id = $2 AND motivo LIKE 'checklist_aprovado:%'`, [orgId, task.id])
    }

    if (incluiTarefa) {
      await upsertTaskScore(client, task, userId)
    } else {
      // Escopo atual não inclui pontuação fixa da lista — remove pontos de
      // tarefa que possam ter ficado de uma configuração/aprovação anterior.
      await client.query(`DELETE FROM tarefas_pontuacao WHERE org_id = $1 AND tarefa_id = $2 AND motivo = 'tarefa_aprovada'`, [orgId, task.id])
    }

    const updated = await client.query(
      `UPDATE tarefas SET status = 'aprovada', status_gestor = 'aprovada',
         aprovada_em = NOW(), aprovada_por = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [userId, task.id, orgId],
    )
    await client.query(
      `INSERT INTO tarefas_historico
         (org_id, tarefa_id, user_id, acao, status_anterior, status_novo, observacao)
       VALUES ($1,$2,$3,'aprovada',$4,'aprovada',$5)`,
      [orgId, task.id, userId, task.status, incluiItens && incluiTarefa
        ? 'Pontuação da lista e de cada item liberada.'
        : incluiItens ? 'Pontuação liberada por item para os executores.'
        : 'Pontuação única liberada para o executor da lista.'],
    ).catch(() => undefined)
    await client.query('COMMIT')

    const recipients = new Set<string>(
      [task.responsavel_id, task.aceita_por, ...Array.from(executorIds(task))]
        .filter((value): value is string => Boolean(value)),
    )
    for (const recipient of recipients) {
      if (recipient === userId) continue
      await criarNotificacao({
        orgId,
        userId: recipient,
        tipo: 'tarefa_aprovada',
        titulo: '✅ Tarefa aprovada',
        body: `"${task.titulo}" foi aprovada.`,
        referenciaId: task.id,
        referenciaTipo: 'tarefa',
      }).catch(() => undefined)
    }
    res.json({ tarefa: updated.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('[TAREFAS-SCORING] Erro ao aprovar lista:', err)
    res.status(500).json({ error: 'Erro ao aprovar tarefa.' })
  } finally {
    client.release()
  }
})

router.get('/ranking', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureCompatibilitySchema()
    const { orgId } = req.user!
    const range = periodRange(String(req.query.periodo || 'todos').trim().toLowerCase())
    const members = await query<any>(
      `SELECT id, nome, email, role FROM profiles
       WHERE org_id = $1 AND ativo = TRUE AND role = 'membro'
       ORDER BY nome`,
      [orgId],
    )
    const tasks = await query<any>(
      `SELECT * FROM tarefas
       WHERE org_id = $1
         AND COALESCE(escopo, 'pessoal') = 'equipe'
         AND COALESCE(conta_ranking, TRUE) = TRUE`,
      [orgId],
    )

    const ranking = new Map<string, any>()
    for (const member of members) {
      ranking.set(member.id, {
        ...member,
        pontos: 0,
        tarefas_aprovadas: 0,
        subtarefas_executadas: 0,
        tarefas_executadas: 0,
        ultima_aprovacao: null,
        historico: [],
      })
    }
    const seen = new Set<string>()
    const add = (userId: string, points: number, task: any, item: any | null, when: unknown, approver?: string | null) => {
      const entry = ranking.get(userId)
      if (!entry || !inPeriod(when, range)) return
      const key = `${task.id}:${userId}:${item ? item.id || item.texto : '__tarefa__'}`
      if (seen.has(key)) return
      seen.add(key)
      const safePoints = Math.max(0, Math.min(SCORE_MAX, Number(points || 0)))
      entry.pontos += safePoints
      if (item) entry.subtarefas_executadas += 1
      else {
        entry.tarefas_executadas += 1
        entry.tarefas_aprovadas += 1
      }
      entry.historico.push({
        tarefa_id: task.id,
        tarefa_titulo: task.titulo,
        subtarefa_titulo: item?.texto || null,
        dificuldade: item?.dificuldade || null,
        checklist: Boolean(item),
        pontos: safePoints,
        aprovado_em: when,
        aprovado_por: approver || item?.aprovado_por || task.aprovada_por || null,
        motivo: item ? 'Tarefa da lista aprovada pelo gestor' : 'Tarefa aprovada pelo gestor',
      })
      if (when && (!entry.ultima_aprovacao || new Date(String(when)).getTime() > new Date(entry.ultima_aprovacao).getTime())) entry.ultima_aprovacao = when
    }

    for (const task of tasks) {
      const ids = executorIds(task)
      if (ids.size > 1) {
        for (const item of parseChecklist(task.checklist)) {
          if (!item.feito || item.aprovacao_status !== 'aprovada') continue
          const participant = itemExecutorId(item, task)
          if (participant) add(participant, itemPoints(item), task, item, item.aprovado_em || task.updated_at, item.aprovado_por)
        }
      } else if (task.status === 'aprovada') {
        const participant = task.aceita_por || task.responsavel_id || Array.from(ids)[0]
        if (participant) add(participant, taskPoints(task), task, null, task.aprovada_em || task.updated_at, task.aprovada_por)
      }
    }

    const orphanScores = await query<any>(
      `SELECT tp.* FROM tarefas_pontuacao tp
       LEFT JOIN tarefas t ON t.id = tp.tarefa_id AND t.org_id = tp.org_id
       WHERE tp.org_id = $1 AND t.id IS NULL
         AND COALESCE(tp.conta_ranking_snapshot, TRUE) = TRUE
         AND COALESCE(tp.escopo_snapshot, 'equipe') = 'equipe'`,
      [orgId],
    ).catch(() => [])
    for (const row of orphanScores) {
      const item = String(row.motivo || '').startsWith('checklist_aprovado')
        ? { id: row.checklist_id, texto: row.item_titulo_snapshot }
        : null
      add(row.usuario_id, Number(row.pontos || 0), { id: row.tarefa_id || row.id, titulo: row.tarefa_titulo_snapshot || 'Tarefa excluída' }, item, row.aprovado_em || row.created_at, row.aprovado_por)
    }

    const ordered = Array.from(ranking.values()).sort((a, b) => Number(b.pontos) - Number(a.pontos) || Number(b.subtarefas_executadas) - Number(a.subtarefas_executadas) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    const free = await queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE modo_distribuicao = 'livre_equipe' AND aceita_por IS NULL AND status IN ('pendente','em_progresso'))::int AS disponiveis,
         COUNT(*) FILTER (WHERE modo_distribuicao = 'livre_equipe' AND aceita_por IS NOT NULL AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS em_execucao,
         COUNT(*) FILTER (WHERE modo_distribuicao = 'livre_equipe' AND status IN ('concluida','aprovada'))::int AS concluidas
       FROM tarefas WHERE org_id = $1`,
      [orgId],
    )
    res.json({
      periodo: range.label,
      ranking: ordered,
      resumo: {
        disponiveis: Number(free?.disponiveis || 0),
        em_execucao: Number(free?.em_execucao || 0),
        concluidas: Number(free?.concluidas || 0),
        membros: ordered.length,
        pontos: ordered.reduce((sum, item) => sum + Number(item.pontos || 0), 0),
        subtarefas_executadas: ordered.reduce((sum, item) => sum + Number(item.subtarefas_executadas || 0), 0),
        tarefas_executadas: ordered.reduce((sum, item) => sum + Number(item.tarefas_executadas || 0), 0),
      },
    })
  } catch (err) {
    console.error('[TAREFAS-SCORING] Erro ao buscar ranking:', err)
    res.status(500).json({ error: 'Erro ao buscar ranking de tarefas.' })
  }
})

router.get('/ajuda/minhas', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureCompatibilitySchema()
    const { orgId, userId } = req.user!
    const ajudas = await query(
      `SELECT ta.*, ps.nome AS solicitante_nome, pd.nome AS destinatario_nome, t.titulo AS tarefa_titulo
       FROM tarefas_ajuda ta
       JOIN profiles ps ON ps.id = ta.solicitante_id
       JOIN profiles pd ON pd.id = ta.destinatario_id
       JOIN tarefas t ON t.id = ta.tarefa_id
       WHERE ta.org_id = $1 AND ta.solicitante_id = $2 AND ta.status IN ('pendente','respondida')
       ORDER BY ta.updated_at DESC NULLS LAST, ta.respondida_em DESC NULLS LAST, ta.created_at DESC
       LIMIT 50`,
      [orgId, userId],
    )
    res.json({ ajudas })
  } catch (err) {
    console.error('[TAREFAS-SCORING] Erro ao buscar ajudas solicitadas:', err)
    res.status(500).json({ error: 'Erro ao buscar suas solicitações de ajuda.' })
  }
})

export default router
