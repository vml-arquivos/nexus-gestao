import { query, queryOne } from '../db/pool'
import { upsertGoogleCalendarEvent } from './googleWorkspaceService'

let schemaReady = false
let syncRunning = false
let lastResult: AgendaSyncResult | null = null

export interface AgendaSyncResult {
  ok: boolean
  startedAt: string
  finishedAt: string
  locaisCriados: number
  locaisAtualizados: number
  locaisExistentes: number
  googleCriados: number
  googleAtualizados: number
  googleFalhas: number
  erros: string[]
}

function agendaDate(value: unknown, hour = '09:00:00') {
  const raw = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return `${raw}T${hour}`
}

function dinheiro(v: unknown): string {
  const n = Number(v || 0)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0)
}

function isFinalTask(status: unknown) {
  return ['concluida', 'aprovada', 'cancelada'].includes(String(status || ''))
}

function safeJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }
  if (value && typeof value === 'object') return Array.isArray(value) ? value : []
  return []
}

export async function ensureAgendaSyncSchema() {
  if (schemaReady) return
  await query(`
    ALTER TABLE agenda
      ADD COLUMN IF NOT EXISTS origem_sistema TEXT,
      ADD COLUMN IF NOT EXISTS origem_tipo TEXT,
      ADD COLUMN IF NOT EXISTS origem_id TEXT,
      ADD COLUMN IF NOT EXISTS sync_key TEXT,
      ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS google_event_id TEXT,
      ADD COLUMN IF NOT EXISTS google_calendar_sync_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS google_calendar_status TEXT,
      ADD COLUMN IF NOT EXISTS google_calendar_error TEXT;
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_agenda_sync_key ON agenda(org_id, sync_key) WHERE sync_key IS NOT NULL;`)
  await query(`CREATE INDEX IF NOT EXISTS idx_agenda_auto_sync ON agenda(org_id, auto_sync, data_inicio);`)
  schemaReady = true
}

async function upsertAgendaLocal(input: {
  orgId: string
  criadoPor: string
  syncKey: string
  origemTipo: string
  origemId: string
  titulo: string
  descricao: string
  dataInicio: string
  dataFim?: string | null
  tipo?: string
  cor?: string
  local?: string | null
}) {
  await ensureAgendaSyncSchema()
  const existente = await queryOne<any>(
    `SELECT * FROM agenda WHERE org_id = $1 AND sync_key = $2 LIMIT 1`,
    [input.orgId, input.syncKey]
  )

  if (existente?.id) {
    const dataInicioChanged = new Date(existente.data_inicio).toISOString() !== new Date(input.dataInicio).toISOString()
    const dataFimAtual = existente.data_fim ? new Date(existente.data_fim).toISOString() : ''
    const dataFimNova = input.dataFim ? new Date(input.dataFim).toISOString() : ''
    const changed =
      String(existente.titulo || '') !== input.titulo ||
      String(existente.descricao || '') !== input.descricao ||
      dataInicioChanged ||
      dataFimAtual !== dataFimNova ||
      String(existente.cor || '') !== String(input.cor || '') ||
      String(existente.criado_por || '') !== String(input.criadoPor || '')
    if (!changed) return { evento: existente, created: false, updated: false }
    const atualizado = await queryOne<any>(
      `UPDATE agenda SET
         criado_por = $1,
         titulo = $2,
         descricao = $3,
         data_inicio = $4,
         data_fim = $5,
         local = $6,
         tipo = $7,
         cor = $8,
         origem_sistema = 'nexus',
         origem_tipo = $9,
         origem_id = $10,
         auto_sync = TRUE,
         updated_at = NOW()
       WHERE id = $11 AND org_id = $12
       RETURNING *`,
      [input.criadoPor, input.titulo, input.descricao, input.dataInicio, input.dataFim || null, input.local || null, input.tipo || 'prazo', input.cor || '#6C3BFF', input.origemTipo, input.origemId, existente.id, input.orgId]
    )
    return { evento: atualizado || existente, created: false, updated: true }
  }

  const evento = await queryOne<any>(
    `INSERT INTO agenda
       (org_id, criado_por, titulo, descricao, data_inicio, data_fim, local, tipo, participantes, lembrete_minutos, cor, origem_sistema, origem_tipo, origem_id, sync_key, auto_sync)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]'::jsonb,$9,$10,'nexus',$11,$12,$13,TRUE)
     RETURNING *`,
    [input.orgId, input.criadoPor, input.titulo, input.descricao, input.dataInicio, input.dataFim || null, input.local || null, input.tipo || 'prazo', 60, input.cor || '#6C3BFF', input.origemTipo, input.origemId, input.syncKey]
  )
  return { evento, created: true, updated: false }
}

async function syncGoogle(evento: any, result: AgendaSyncResult) {
  if (!process.env.GOOGLE_CALENDAR_ID) return
  try {
    const google = await upsertGoogleCalendarEvent({
      googleEventId: evento.google_event_id || null,
      summary: evento.titulo,
      description: evento.descricao || '',
      start: evento.data_inicio,
      end: evento.data_fim || null,
      location: evento.local || null,
    })
    if (!google.ok) {
      result.googleFalhas++
      await query(
        `UPDATE agenda SET google_calendar_status = 'erro', google_calendar_error = $1 WHERE id = $2`,
        [google.error || 'Falha Google Calendar', evento.id]
      ).catch(() => {})
      return
    }
    if (google.action === 'created') result.googleCriados++
    if (google.action === 'updated') result.googleAtualizados++
    await query(
      `UPDATE agenda SET google_event_id = COALESCE($1, google_event_id), google_calendar_sync_at = NOW(), google_calendar_status = 'ok', google_calendar_error = NULL WHERE id = $2`,
      [google.id || null, evento.id]
    ).catch(() => {})
  } catch (err) {
    result.googleFalhas++
    const msg = (err as Error).message
    result.erros.push(`Google Calendar: ${msg}`)
    await query(`UPDATE agenda SET google_calendar_status = 'erro', google_calendar_error = $1 WHERE id = $2`, [msg, evento.id]).catch(() => {})
  }
}

async function syncManualAgendaToGoogle(orgId: string | null, result: AgendaSyncResult) {
  if (!process.env.GOOGLE_CALENDAR_ID) return
  await ensureAgendaSyncSchema()
  const params: unknown[] = []
  let where = `WHERE data_inicio IS NOT NULL`
  if (orgId) { params.push(orgId); where += ` AND org_id = $${params.length}` }
  const eventos = await query<any>(
    `SELECT * FROM agenda
     ${where}
       AND (google_calendar_sync_at IS NULL OR updated_at > google_calendar_sync_at)
     ORDER BY data_inicio ASC
     LIMIT 1000`,
    params
  ).catch(() => [])
  for (const evento of eventos) await syncGoogle(evento, result)
}

async function applyLocalCount(result: AgendaSyncResult, row: { created: boolean; updated: boolean }) {
  if (row.created) result.locaisCriados++
  else if (row.updated) result.locaisAtualizados++
  else result.locaisExistentes++
}

export async function sincronizarAgendaOperacional(input?: { orgId?: string; userId?: string; forceGoogle?: boolean }): Promise<AgendaSyncResult> {
  if (syncRunning) {
    return lastResult || { ok: true, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), locaisCriados: 0, locaisAtualizados: 0, locaisExistentes: 0, googleCriados: 0, googleAtualizados: 0, googleFalhas: 0, erros: ['Sincronização já em andamento.'] }
  }
  syncRunning = true
  const result: AgendaSyncResult = {
    ok: true,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    locaisCriados: 0,
    locaisAtualizados: 0,
    locaisExistentes: 0,
    googleCriados: 0,
    googleAtualizados: 0,
    googleFalhas: 0,
    erros: [],
  }

  try {
    await ensureAgendaSyncSchema()
    const params: unknown[] = []
    let orgFilter = ''
    if (input?.orgId) { params.push(input.orgId); orgFilter = `AND t.org_id = $${params.length}` }

    const tarefas = await query<any>(
      `SELECT t.id, t.org_id, t.criado_por, t.responsavel_id, t.aceita_por, t.modo_distribuicao,
              t.titulo, t.descricao, t.prazo, t.data, t.prioridade, t.status, t.responsavel_nome, t.checklist,
              COALESCE(p.nome, t.responsavel_nome, '') AS responsavel_nome_atual
       FROM tarefas t
       LEFT JOIN profiles p ON p.id = t.responsavel_id
       WHERE t.status <> 'cancelada'
         AND (COALESCE(t.prazo, t.data) IS NOT NULL OR t.checklist IS NOT NULL)
         ${orgFilter}
       ORDER BY COALESCE(t.updated_at, t.created_at) DESC
       LIMIT 3000`,
      params
    ).catch((err) => { result.erros.push(`Tarefas: ${(err as Error).message}`); return [] })

    for (const t of tarefas) {
      const owner = t.responsavel_id || t.aceita_por || t.criado_por || input?.userId
      if (!owner) continue

      const when = agendaDate(t.prazo || t.data, t.prioridade === 'alta' ? '08:30:00' : '09:00:00')
      if (when) {
        const row = await upsertAgendaLocal({
          orgId: t.org_id,
          criadoPor: owner,
          syncKey: `tarefa:${t.id}`,
          origemTipo: 'tarefa',
          origemId: t.id,
          titulo: `${isFinalTask(t.status) ? '✅' : '📋'} Tarefa: ${t.titulo}`,
          descricao: `Sincronizado automaticamente pelo Nexus.\nOrigem: tarefa.\nStatus: ${t.status}.\nPrioridade: ${t.prioridade}.\nResponsável: ${t.responsavel_nome_atual || 'sem responsável'}.\n\n${t.descricao || ''}`,
          dataInicio: when,
          tipo: 'prazo',
          cor: isFinalTask(t.status) ? '#22c55e' : t.prioridade === 'alta' ? '#ef4444' : '#6C3BFF',
        })
        await applyLocalCount(result, row)
        if (row.evento) await syncGoogle(row.evento, result)
      }

      const checklist = safeJsonArray(t.checklist)
      for (const item of checklist) {
        const itemId = String(item?.id || item?.texto || '').slice(0, 120)
        const itemDate = agendaDate(item?.data || item?.prazo || item?.date, '09:30:00')
        if (!itemId || !itemDate) continue
        const itemOwner = item?.responsavel_id || t.responsavel_id || t.aceita_por || t.criado_por || input?.userId
        if (!itemOwner) continue
        const itemText = String(item?.texto || item?.label || item?.title || 'Subtarefa').trim()
        const done = !!item?.feito
        const row = await upsertAgendaLocal({
          orgId: t.org_id,
          criadoPor: itemOwner,
          syncKey: `checklist:${t.id}:${itemId}`,
          origemTipo: 'checklist',
          origemId: `${t.id}:${itemId}`,
          titulo: `${done ? '✅' : '☑️'} Subtarefa: ${itemText}`,
          descricao: `Sincronizado automaticamente pelo Nexus.\nOrigem: checklist/subtarefa.\nTarefa mãe: ${t.titulo}.\nStatus: ${done ? 'concluída' : 'pendente'}.\nPontuação: ${item?.pontuacao || 1}.\nDificuldade: ${item?.dificuldade || 'não definida'}.\n\n${item?.descricao || ''}`,
          dataInicio: itemDate,
          tipo: 'prazo',
          cor: done ? '#22c55e' : '#8b5cf6',
        })
        await applyLocalCount(result, row)
        if (row.evento) await syncGoogle(row.evento, result)
      }
    }

    const pParams: unknown[] = []
    let pOrgFilter = ''
    if (input?.orgId) { pParams.push(input.orgId); pOrgFilter = `AND p.org_id = $${pParams.length}` }
    const financeiros = await query<any>(
      `SELECT p.id, p.org_id, p.criado_por, p.titulo, p.descricao, p.tipo, p.valor, p.vencimento, p.status,
              COALESCE(pe.nome, p.pessoa_nome, '') AS pessoa_nome_atual
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.status <> 'cancelado'
         AND p.vencimento IS NOT NULL
         ${pOrgFilter}
       ORDER BY p.vencimento ASC
       LIMIT 3000`,
      pParams
    ).catch((err) => { result.erros.push(`Financeiro: ${(err as Error).message}`); return [] })

    for (const f of financeiros) {
      const when = agendaDate(f.vencimento, f.tipo === 'recebimento' ? '10:00:00' : '11:00:00')
      if (!when) continue
      const isReceber = f.tipo === 'recebimento'
      const row = await upsertAgendaLocal({
        orgId: f.org_id,
        criadoPor: f.criado_por || input?.userId,
        syncKey: `financeiro:${f.id}`,
        origemTipo: 'financeiro',
        origemId: f.id,
        titulo: `${f.status === 'pago' ? '✅' : isReceber ? '💰' : '💸'} ${isReceber ? 'Receber' : 'Pagar'}: ${f.titulo}`,
        descricao: `Sincronizado automaticamente pelo Nexus.\nOrigem: financeiro.\nTipo: ${isReceber ? 'Conta a receber' : 'Conta a pagar'}.\nStatus: ${f.status}.\nPessoa: ${f.pessoa_nome_atual || 'não informada'}.\nValor: ${dinheiro(f.valor)}.\n\n${f.descricao || ''}`,
        dataInicio: when,
        tipo: 'prazo',
        cor: f.status === 'pago' ? '#22c55e' : isReceber ? '#059669' : '#d97706',
      })
      await applyLocalCount(result, row)
      if (row.evento) await syncGoogle(row.evento, result)
    }

    await syncManualAgendaToGoogle(input?.orgId || null, result)
  } catch (err) {
    result.ok = false
    result.erros.push((err as Error).message)
    console.error('[AGENDA_SYNC] Erro ao sincronizar agenda:', err)
  } finally {
    result.finishedAt = new Date().toISOString()
    lastResult = result
    syncRunning = false
  }
  return result
}

export function getAgendaSyncStatus() {
  return { running: syncRunning, lastResult }
}

export function iniciarAgendaAutoSync() {
  const enabled = process.env.AGENDA_AUTO_SYNC_ENABLED !== 'false'
  if (!enabled) {
    console.log('[AGENDA_SYNC] Sincronização automática desativada por AGENDA_AUTO_SYNC_ENABLED=false.')
    return
  }
  const intervalMinutes = Math.max(1, Math.min(1440, Number(process.env.AGENDA_AUTO_SYNC_INTERVAL_MINUTES || 10)))
  setInterval(() => sincronizarAgendaOperacional().catch(err => console.error('[AGENDA_SYNC] Falha no job:', err)), intervalMinutes * 60 * 1000)
  setTimeout(() => sincronizarAgendaOperacional().catch(err => console.error('[AGENDA_SYNC] Falha no primeiro job:', err)), 10_000)
  console.log(`[AGENDA_SYNC] Sincronização automática iniciada a cada ${intervalMinutes} minuto(s).`)
}
