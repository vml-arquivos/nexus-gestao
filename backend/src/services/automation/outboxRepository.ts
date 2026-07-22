/**
 * outboxRepository.ts
 *
 * Espelha server/services/automation/outboxRepository.ts do Destrava.
 * Persistência do outbox de eventos (automation_events) que o Nexus precisa
 * emitir para o Destrava (hoje: TarefaConcluidaNexus).
 *
 * As funções de reivindicar/marcar aceitam opcionalmente um client já em
 * transação (usado pelo dispatcher durante a varredura de retry, que precisa
 * manter o FOR UPDATE SKIP LOCKED e as atualizações de status na mesma
 * transação -- caso contrário a atualização feita por outra conexão do pool
 * ficaria bloqueada esperando o lock da linha).
 */
import pool, { query, queryOne } from '../../db/pool'
import type { PoolClient } from 'pg'

export type AutomationEventStatus = 'pending' | 'dispatched' | 'failed' | 'dead'

export interface AutomationEventRow {
  id: string
  org_id: string | null
  event_type: string
  event_version: number
  aggregate_type: string | null
  aggregate_id: string | null
  idempotency_key: string
  payload: Record<string, unknown>
  correlation_id: string | null
  status: AutomationEventStatus
  attempts: number
  last_error: string | null
  created_at: string
  dispatched_at: string | null
}

export interface NovoEvento {
  orgId?: string | null
  eventType: string
  aggregateType?: string
  aggregateId?: string
  idempotencyKey: string
  payload: Record<string, unknown>
  correlationId?: string
}

export async function inserirEvento(evento: NovoEvento): Promise<AutomationEventRow | null> {
  return queryOne<AutomationEventRow>(
    `INSERT INTO automation_events (org_id, event_type, aggregate_type, aggregate_id, idempotency_key, payload, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (event_type, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      evento.orgId || null,
      evento.eventType,
      evento.aggregateType || null,
      evento.aggregateId || null,
      evento.idempotencyKey,
      JSON.stringify(evento.payload || {}),
      evento.correlationId || null,
    ]
  )
}

export async function reivindicarLotePendente(client: PoolClient, limite = 20): Promise<AutomationEventRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM automation_events
     WHERE status IN ('pending', 'failed') AND attempts < 10
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limite]
  )
  return rows
}

export async function marcarDespachado(client: PoolClient, id: string): Promise<void> {
  await client.query(`UPDATE automation_events SET status = 'dispatched', dispatched_at = NOW() WHERE id = $1`, [id])
}

export async function marcarFalha(client: PoolClient, id: string, erro: string, tentativas: number): Promise<void> {
  const proximoStatus = tentativas >= 10 ? 'dead' : 'failed'
  await client.query(`UPDATE automation_events SET status = $1, attempts = $2, last_error = $3 WHERE id = $4`, [
    proximoStatus,
    tentativas,
    erro.slice(0, 2000),
    id,
  ])
}

export async function buscarEventoPorId(id: string): Promise<AutomationEventRow | null> {
  return queryOne<AutomationEventRow>(`SELECT * FROM automation_events WHERE id = $1`, [id])
}

export { pool }

export interface NovoRegistroAuditoria {
  eventId?: string | null
  evento: string
  origemSistema?: 'destrava' | 'nexus'
  orgId?: string | null
  executadoPor?: string | null
  tempoMs?: number | null
  resultado: 'sucesso' | 'falha' | 'ignorado_duplicado'
  erro?: string | null
  detalhe?: Record<string, unknown> | null
}

export async function registrarAuditoria(registro: NovoRegistroAuditoria): Promise<void> {
  await query(
    `INSERT INTO automation_audit_log
       (event_id, evento, origem_sistema, org_id, executado_por, tempo_ms, resultado, erro, detalhe)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      registro.eventId || null,
      registro.evento,
      registro.origemSistema || 'nexus',
      registro.orgId || null,
      registro.executadoPor || null,
      registro.tempoMs ?? null,
      registro.resultado,
      registro.erro || null,
      JSON.stringify(registro.detalhe || {}),
    ]
  )
}
