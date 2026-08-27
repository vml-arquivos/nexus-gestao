import { v4 as uuidv4 } from 'uuid'
import pool, { query, queryOne } from '../../db/pool'
import { criarNotificacao, criarOuAtualizarNotificacaoRecorrente } from '../../lib/notifHelper'
import {
  buscarEventoPorId,
  inserirEvento,
  marcarDespachado,
  marcarFalha,
  registrarAuditoria,
  type AutomationEventRow,
} from './outboxRepository'

export const USER_RULE_EVENT_TYPE = 'NexusUserRule'
export const USER_RULE_TRIGGERS = ['tarefa_criada', 'status_alterado', 'prazo_vencendo', 'checklist_concluido'] as const
export type UserRuleTrigger = (typeof USER_RULE_TRIGGERS)[number]
export const USER_RULE_CONDITION_FIELDS = ['titulo', 'status', 'prioridade', 'responsavel_id', 'projeto_grupo_id', 'status_anterior', 'status_novo', 'checklist_item_texto'] as const
export type UserRuleConditionField = (typeof USER_RULE_CONDITION_FIELDS)[number]
export const USER_RULE_OPERATORS = ['igual', 'diferente', 'contem', 'vazio', 'nao_vazio'] as const
export type UserRuleOperator = (typeof USER_RULE_OPERATORS)[number]
export const USER_RULE_ACTIONS = ['notificar_pessoa', 'notificar_equipe', 'mover_status', 'adicionar_checklist', 'webhook'] as const
export type UserRuleActionType = (typeof USER_RULE_ACTIONS)[number]

export type UserRuleCondition = {
  field: UserRuleConditionField
  operator: UserRuleOperator
  value?: string
}

export type UserRuleAction = {
  type: UserRuleActionType
  user_id?: string
  equipe_id?: string
  status?: string
  texto?: string
  url?: string
}

export type UserRuleConditions = {
  mode: 'AND' | 'OR'
  items: UserRuleCondition[]
}

export type UserRule = {
  id: string
  org_id: string
  created_by: string
  name: string
  description: string | null
  trigger_type: UserRuleTrigger
  conditions: UserRuleConditions
  actions: UserRuleAction[]
  active: boolean
  created_at: string
  updated_at: string
}

export type RuleTaskSnapshot = {
  id: string
  org_id: string
  titulo: string
  descricao?: string | null
  status: string
  prioridade?: string | null
  prazo?: string | null
  responsavel_id?: string | null
  criado_por?: string | null
  projeto_grupo_id?: string | null
  created_at?: string | null
}

export type RuleTriggerContext = {
  status_anterior?: string | null
  status_novo?: string | null
  checklist_item_id?: string | null
  checklist_item_texto?: string | null
  checklist_item_enviado_em?: string | null
  hoje?: string
}

type UserRuleRow = UserRule

type RuleEventPayload = {
  rule_id: string
  rule_name: string
  trigger_type: UserRuleTrigger
  task: RuleTaskSnapshot
  context: RuleTriggerContext
  rule: UserRule
}

const VALID_MOVE_STATUSES = new Set(['pendente', 'em_progresso', 'cancelada'])
const MAX_CHECKLIST_BYTES = 1_000_000
const MAX_RULE_NAME = 120
const MAX_RULE_DESCRIPTION = 500
const MAX_RULES_PER_ORG = 200

function isGestao(role: string | undefined): boolean {
  return ['admin', 'dev', 'gestor', 'sub_gestor'].includes(String(role || ''))
}

function text(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max)
}

function normalizeConditions(value: unknown): UserRuleConditions {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const mode = String(source.mode || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND'
  const rawItems = Array.isArray(source.items) ? source.items : []
  const items = rawItems.slice(0, 12).map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const field = USER_RULE_CONDITION_FIELDS.includes(String(row.field) as UserRuleConditionField)
      ? String(row.field) as UserRuleConditionField
      : 'titulo'
    const operator = USER_RULE_OPERATORS.includes(String(row.operator) as UserRuleOperator)
      ? String(row.operator) as UserRuleOperator
      : 'contem'
    return { field, operator, ...(operator === 'vazio' || operator === 'nao_vazio' ? {} : { value: text(row.value, 240) }) }
  }).filter((item) => item.operator === 'vazio' || item.operator === 'nao_vazio' || item.value)
  return { mode, items }
}

function normalizeActions(value: unknown): UserRuleAction[] {
  const rawItems = Array.isArray(value) ? value : []
  return rawItems.slice(0, 8).map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const type = USER_RULE_ACTIONS.includes(String(row.type) as UserRuleActionType)
      ? String(row.type) as UserRuleActionType
      : 'notificar_pessoa'
    return {
      type,
      ...(row.user_id ? { user_id: text(row.user_id, 80) } : {}),
      ...(row.equipe_id ? { equipe_id: text(row.equipe_id, 80) } : {}),
      ...(row.status ? { status: text(row.status, 40) } : {}),
      ...(row.texto ? { texto: text(row.texto, 300) } : {}),
      ...(row.url ? { url: text(row.url, 500) } : {}),
    }
  }).filter((action) => {
    if (action.type === 'notificar_pessoa') return Boolean(action.user_id)
    if (action.type === 'notificar_equipe') return Boolean(action.equipe_id)
    if (action.type === 'mover_status') return VALID_MOVE_STATUSES.has(String(action.status || ''))
    if (action.type === 'adicionar_checklist') return Boolean(action.texto)
    if (action.type === 'webhook') {
      try {
        const parsed = new URL(String(action.url || ''))
        return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      } catch {
        return false
      }
    }
    return false
  })
}

export function normalizeUserRuleInput(input: unknown): { name: string; description: string | null; trigger_type: UserRuleTrigger; conditions: UserRuleConditions; actions: UserRuleAction[]; active: boolean } {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const name = text(source.name, MAX_RULE_NAME)
  if (!name) throw new Error('Nome da regra é obrigatório.')
  const trigger = String(source.trigger_type || '') as UserRuleTrigger
  if (!USER_RULE_TRIGGERS.includes(trigger)) throw new Error('Gatilho de regra inválido.')
  const actions = normalizeActions(source.actions)
  if (!actions.length) throw new Error('Informe ao menos uma ação válida.')
  return {
    name,
    description: text(source.description, MAX_RULE_DESCRIPTION) || null,
    trigger_type: trigger,
    conditions: normalizeConditions(source.conditions),
    actions,
    active: source.active !== false,
  }
}

function taskSnapshot(task: any): RuleTaskSnapshot {
  return {
    id: String(task?.id || ''),
    org_id: String(task?.org_id || ''),
    titulo: text(task?.titulo, 240),
    descricao: text(task?.descricao, 500) || null,
    status: text(task?.status, 40),
    prioridade: text(task?.prioridade, 40) || null,
    prazo: task?.prazo ? String(task.prazo).slice(0, 10) : null,
    responsavel_id: task?.responsavel_id ? String(task.responsavel_id) : null,
    criado_por: task?.criado_por ? String(task.criado_por) : null,
    projeto_grupo_id: task?.projeto_grupo_id ? String(task.projeto_grupo_id) : null,
    created_at: task?.created_at ? String(task.created_at) : null,
  }
}

function conditionValue(field: UserRuleConditionField, task: RuleTaskSnapshot, context: RuleTriggerContext): string {
  const values: Record<UserRuleConditionField, unknown> = {
    titulo: task.titulo,
    status: task.status,
    prioridade: task.prioridade,
    responsavel_id: task.responsavel_id,
    projeto_grupo_id: task.projeto_grupo_id,
    status_anterior: context.status_anterior,
    status_novo: context.status_novo,
    checklist_item_texto: context.checklist_item_texto,
  }
  return String(values[field] ?? '').trim()
}

export function matchesUserRule(rule: Pick<UserRule, 'conditions'>, task: RuleTaskSnapshot, context: RuleTriggerContext): boolean {
  const conditions = normalizeConditions(rule.conditions)
  if (!conditions.items.length) return true
  const results = conditions.items.map((condition) => {
    const actual = conditionValue(condition.field, task, context).toLowerCase()
    const expected = text(condition.value, 240).toLowerCase()
    if (condition.operator === 'igual') return actual === expected
    if (condition.operator === 'diferente') return actual !== expected
    if (condition.operator === 'contem') return actual.includes(expected)
    if (condition.operator === 'vazio') return !actual
    return Boolean(actual)
  })
  return conditions.mode === 'OR' ? results.some(Boolean) : results.every(Boolean)
}

function parseChecklist(value: unknown): Array<Record<string, unknown>> | null {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? (() => {
    try { return JSON.parse(value) } catch { return null }
  })() : null
  return Array.isArray(raw) ? raw.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>> : null
}

export function checklistItemsConcluidos(before: unknown, after: unknown): Array<{ id: string; texto: string; enviado_em?: string | null }> {
  const beforeItems = parseChecklist(before) || []
  const previous = new Map(beforeItems.map((item, index) => [String(item.id || `index-${index}`), Boolean(item.feito)]))
  return (parseChecklist(after) || []).filter((item, index) => {
    const key = String(item.id || `index-${index}`)
    return Boolean(item.feito) && previous.get(key) !== true
  }).map((item, index) => ({
    id: String(item.id || `index-${index}`),
    texto: text(item.texto, 300),
    enviado_em: item.enviado_em ? String(item.enviado_em) : null,
  })).filter((item) => item.texto)
}

function eventIdempotencyKey(rule: UserRule, task: RuleTaskSnapshot, trigger: UserRuleTrigger, context: RuleTriggerContext): string {
  const suffix = trigger === 'checklist_concluido'
    ? `${context.checklist_item_id || 'item'}:${context.checklist_item_enviado_em || context.hoje || 'now'}`
    : trigger === 'prazo_vencendo'
      ? `${context.hoje || new Date().toISOString().slice(0, 10)}`
      : trigger === 'status_alterado'
        ? `${context.status_novo || task.status}:${task.id}:${context.status_anterior || ''}`
        :     `${task.id}:${task.created_at || ''}`

  return `user-rule:${rule.id}:${suffix}`.slice(0, 200)
}

async function notifyUser(orgId: string, userId: string, task: RuleTaskSnapshot, rule: UserRule, eventKey: string, title: string): Promise<void> {
  const target = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE', [userId, orgId])
  if (!target) throw new Error('Destinatário da regra não encontrado ou inativo.')
  await criarOuAtualizarNotificacaoRecorrente({
    orgId,
    userId,
    tipo: 'automacao_regra',
    titulo: title,
    body: `A regra "${rule.name}" foi acionada pela tarefa "${task.titulo}".`,
    referenciaId: task.id,
    referenciaTipo: 'tarefa',
    chaveRecorrencia: `${eventKey}:notificacao:${userId}`,
  })
}

async function executeAction(action: UserRuleAction, payload: RuleEventPayload, eventKey: string, index: number): Promise<string> {
  const { task, rule } = payload
  if (action.type === 'notificar_pessoa' && action.user_id) {
    await notifyUser(task.org_id, action.user_id, task, rule, `${eventKey}:${index}`, 'Automação: nova ação para você')
    return 'pessoa notificada'
  }
  if (action.type === 'notificar_equipe' && action.equipe_id) {
    const members = await query<{ user_id: string }>(
      `SELECT em.profile_id AS user_id
         FROM equipes_membros em
         JOIN equipes e ON e.id = em.equipe_id AND e.org_id = $2
         JOIN profiles p ON p.id = em.profile_id AND p.org_id = $2 AND p.ativo = TRUE
        WHERE em.equipe_id = $1`,
      [action.equipe_id, task.org_id],
    )
    for (const member of members) await notifyUser(task.org_id, member.user_id, task, rule, `${eventKey}:${index}`, 'Automação: ação para sua equipe')
    return `${members.length} membro(s) notificado(s)`
  }
  if (action.type === 'mover_status' && action.status && VALID_MOVE_STATUSES.has(action.status)) {
    await query(
      `UPDATE tarefas SET status = $1, status_gestor = CASE WHEN $1 = 'em_progresso' THEN COALESCE(status_gestor, 'aguardando') ELSE status_gestor END, updated_at = NOW()
       WHERE id = $2 AND org_id = $3 AND status <> $1`,
      [action.status, task.id, task.org_id],
    )
    return `status movido para ${action.status}`
  }
  if (action.type === 'adicionar_checklist' && action.texto) {
    const current = await queryOne<{ checklist: unknown }>(
      `SELECT checklist FROM tarefas WHERE id = $1 AND org_id = $2 AND COALESCE(pg_column_size(checklist), 0) <= $3`,
      [task.id, task.org_id, MAX_CHECKLIST_BYTES],
    )
    if (!current) throw new Error('Checklist ausente ou protegido por exceder 1 MB.')
    const items = parseChecklist(current.checklist)
    if (!items) throw new Error('Checklist da tarefa não está em formato JSONB compatível.')
    if (items.some((item) => String(item.automation_event_key || '') === eventKey && String(item.texto || '') === action.texto)) return 'item já existente'
    const next = [...items, { id: uuidv4(), texto: action.texto, feito: false, automation_event_key: eventKey }]
    const serialized = JSON.stringify(next)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CHECKLIST_BYTES) throw new Error('A ação não foi aplicada: checklist ultrapassaria 1 MB.')
    await query('UPDATE tarefas SET checklist = $1::jsonb, updated_at = NOW() WHERE id = $2 AND org_id = $3', [serialized, task.id, task.org_id])
    return 'item de checklist criado'
  }
  if (action.type === 'webhook' && action.url) {
    const parsed = new URL(action.url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Webhook deve usar HTTP ou HTTPS.')
    const response = await fetch(action.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Automation-Event': eventKey },
      body: JSON.stringify({ event_type: USER_RULE_EVENT_TYPE, rule_id: rule.id, rule_name: rule.name, trigger_type: rule.trigger_type, task }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`Webhook respondeu HTTP ${response.status}.`)
    return 'webhook entregue'
  }
  throw new Error(`Ação de regra inválida no índice ${index}.`)
}

async function processLocalEvent(eventId: string): Promise<void> {
  const lockKey = `nexus:user-rule-event:${eventId}`
  const client = await pool.connect()
  let locked = false
  let eventOrgId: string | null = null
  const inicio = Date.now()
  try {
    const lock = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [lockKey])
    locked = Boolean(lock.rows[0]?.locked)
    if (!locked) return
    const row = await client.query<AutomationEventRow>('SELECT * FROM automation_events WHERE id = $1', [eventId])
    const event = row.rows[0]
    if (!event || event.status === 'dispatched') return
    eventOrgId = event.org_id
    await client.query('UPDATE automation_events SET attempts = attempts + 1 WHERE id = $1', [eventId])
    const payload = event.payload as unknown as RuleEventPayload
    const rule = await queryOne<UserRuleRow>('SELECT * FROM automation_user_rules WHERE id = $1 AND org_id = $2', [payload.rule_id, event.org_id])
    if (!rule || !rule.active) {
      await client.query(`UPDATE automation_events SET status = 'dispatched', dispatched_at = NOW() WHERE id = $1`, [eventId])
      await registrarAuditoria({ eventId, evento: USER_RULE_EVENT_TYPE, orgId: event.org_id, resultado: 'sucesso', tempoMs: Date.now() - inicio, detalhe: { regra_id: payload.rule_id, ignorada: 'regra inativa ou removida' } }, client)
      return
    }
    const result = await Promise.all(rule.actions.map((action, index) => executeAction(action, { ...payload, rule }, event.idempotency_key, index)))
    await marcarDespachado(client, eventId)
    await registrarAuditoria({ eventId, evento: USER_RULE_EVENT_TYPE, orgId: event.org_id, resultado: 'sucesso', tempoMs: Date.now() - inicio, detalhe: { regra_id: rule.id, regra_nome: rule.name, gatilho: rule.trigger_type, tarefa_id: payload.task.id, acoes: result } }, client)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      const current = await client.query<{ attempts: number }>('SELECT attempts FROM automation_events WHERE id = $1', [eventId])
      const attempts = Number(current.rows[0]?.attempts || 1)
      await marcarFalha(client, eventId, message, attempts)
      await registrarAuditoria({ eventId, evento: USER_RULE_EVENT_TYPE, orgId: eventOrgId, resultado: 'falha', tempoMs: Date.now() - inicio, erro: message }, client)
    } catch (auditError) {
      console.error('[AUTOMATION-RULES] Falha ao registrar erro de execução:', auditError)
    }
    console.error('[AUTOMATION-RULES] Regra falhou:', message)
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => undefined)
    client.release()
  }
}

export async function publicarEventosRegras(input: { orgId: string; trigger: UserRuleTrigger; tarefa: any; context?: RuleTriggerContext }): Promise<void> {
  const task = taskSnapshot(input.tarefa)
  if (!task.id || !task.org_id) return
  const context = input.context || {}
  const rules = await query<UserRuleRow>('SELECT * FROM automation_user_rules WHERE org_id = $1 AND trigger_type = $2 AND active = TRUE ORDER BY created_at ASC LIMIT $3', [input.orgId, input.trigger, MAX_RULES_PER_ORG])
  for (const rule of rules) {
    if (!matchesUserRule(rule, task, context)) continue
    const idempotencyKey = eventIdempotencyKey(rule, task, input.trigger, context)
    const event = await inserirEvento({
      orgId: input.orgId,
      eventType: USER_RULE_EVENT_TYPE,
      aggregateType: 'tarefa',
      aggregateId: task.id,
      idempotencyKey,
      payload: { rule_id: rule.id, rule_name: rule.name, trigger_type: input.trigger, task, context },
    })
    if (event) await processLocalEvent(event.id)
  }
}

export async function processarEventosRegrasPendentes(): Promise<void> {
  const events = await query<{ id: string }>(
    `SELECT id FROM automation_events WHERE event_type = $1 AND status IN ('pending', 'failed') AND attempts < 10 ORDER BY created_at ASC LIMIT 20`,
    [USER_RULE_EVENT_TYPE],
  )
  for (const event of events) await processLocalEvent(event.id)
}

export async function listUserRules(orgId: string, userId: string, role?: string): Promise<UserRule[]> {
  const all = isGestao(role)
  return query<UserRule>(
    `SELECT * FROM automation_user_rules WHERE org_id = $1 AND ($2::boolean = TRUE OR created_by = $3) ORDER BY active DESC, created_at DESC LIMIT $4`,
    [orgId, all, userId, MAX_RULES_PER_ORG],
  )
}

export async function getUserRule(orgId: string, id: string): Promise<UserRule | null> {
  return queryOne<UserRule>('SELECT * FROM automation_user_rules WHERE id = $1 AND org_id = $2', [id, orgId])
}

export async function canEditUserRule(rule: UserRule, userId: string, role?: string): Promise<boolean> {
  return isGestao(role) || rule.created_by === userId
}

export async function createUserRule(orgId: string, userId: string, input: unknown): Promise<UserRule> {
  const normalized = normalizeUserRuleInput(input)
  const row = await queryOne<UserRule>(
    `INSERT INTO automation_user_rules (org_id, created_by, name, description, trigger_type, conditions, actions, active)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING *`,
    [orgId, userId, normalized.name, normalized.description, normalized.trigger_type, JSON.stringify(normalized.conditions), JSON.stringify(normalized.actions), normalized.active],
  )
  if (!row) throw new Error('Não foi possível criar a regra.')
  return row
}

export async function updateUserRule(orgId: string, id: string, input: unknown): Promise<UserRule | null> {
  const current = await getUserRule(orgId, id)
  if (!current) return null
  const normalized = normalizeUserRuleInput({ ...current, ...(input as Record<string, unknown> || {}) })
  return queryOne<UserRule>(
    `UPDATE automation_user_rules SET name=$1, description=$2, trigger_type=$3, conditions=$4::jsonb, actions=$5::jsonb, active=$6, updated_at=NOW() WHERE id=$7 AND org_id=$8 RETURNING *`,
    [normalized.name, normalized.description, normalized.trigger_type, JSON.stringify(normalized.conditions), JSON.stringify(normalized.actions), normalized.active, id, orgId],
  )
}

export async function deactivateUserRule(orgId: string, id: string): Promise<UserRule | null> {
  return queryOne<UserRule>('UPDATE automation_user_rules SET active = FALSE, updated_at = NOW() WHERE id = $1 AND org_id = $2 RETURNING *', [id, orgId])
}

export async function listUserRuleAudit(orgId: string, limit = 50): Promise<any[]> {
  return query(
    `SELECT id, event_id, evento, executado_em, tempo_ms, resultado, erro, detalhe
       FROM automation_audit_log WHERE org_id = $1 AND evento = $2 ORDER BY executado_em DESC LIMIT $3`,
    [orgId, USER_RULE_EVENT_TYPE, Math.min(Math.max(Number(limit) || 50, 1), 100)],
  )
}

export async function userRuleCatalog(orgId: string): Promise<{ pessoas: Array<{ id: string; nome: string; email: string; role: string }>; equipes: Array<{ id: string; nome: string; members_count: number }> }> {
  const [pessoas, equipes] = await Promise.all([
    query<{ id: string; nome: string; email: string; role: string }>('SELECT id, nome, email, role FROM profiles WHERE org_id = $1 AND ativo = TRUE ORDER BY nome ASC LIMIT 500', [orgId]),
    query<{ id: string; nome: string; members_count: number }>(
      `SELECT e.id, e.nome, COUNT(em.user_id) FILTER (WHERE COALESCE(em.ativo, TRUE) = TRUE)::int AS members_count
         FROM equipes e LEFT JOIN equipes_membros em ON em.equipe_id = e.id AND em.org_id = e.org_id
        WHERE e.org_id = $1 GROUP BY e.id ORDER BY e.nome ASC LIMIT 200`,
      [orgId],
    ),
  ])
  return { pessoas, equipes }
}

export function getUserRuleEventType(): string { return USER_RULE_EVENT_TYPE }

export async function buscarEventoRegra(id: string): Promise<AutomationEventRow | null> { return buscarEventoPorId(id) }

export async function marcarEventoRegraFalha(event: AutomationEventRow, erro: string): Promise<void> {
  const client = await pool.connect()
  try {
    await marcarFalha(client, event.id, erro, event.attempts + 1)
  } finally {
    client.release()
  }
}

export async function criarNotificacaoRegraTeste(orgId: string, userId: string, title: string): Promise<void> {
  await criarNotificacao({ orgId, userId, tipo: 'automacao_regra', titulo: title })
}
