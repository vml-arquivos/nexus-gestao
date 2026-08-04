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

// Usado quando inserirEvento() retorna null (já existe uma linha para essa
// chave de idempotência) -- para decidir se é um duplicado de verdade (já
// processado com sucesso) ou uma entrega repetida de um evento cujo handler
// falhou da última vez (ex.: bug de schema já corrigido, erro transitório de
// rede/DB). Sem isso, uma falha no handler "envenena" a chave para sempre:
// toda reentrega seguinte é tratada como duplicado e o handler nunca roda de
// novo, mesmo depois do bug de origem ser corrigido. Reproduzido e confirmado
// contra Postgres real antes desta correção.
export async function buscarEventoPorChave(eventType: string, idempotencyKey: string): Promise<AutomationEventRow | null> {
  return queryOne<AutomationEventRow>(
    `SELECT * FROM automation_events WHERE event_type = $1 AND idempotency_key = $2`,
    [eventType, idempotencyKey]
  )
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

// ── DEADLOCK CORRIGIDO ────────────────────────────────────────────────────────
// registrarAuditoria() aceita um `client` transacional opcional. Quando o
// chamador está no meio de uma transação que já tocou a linha correspondente
// em automation_events (ex.: marcarDespachado/marcarFalha), automation_audit_log
// tem uma FK para automation_events(id) -- inserir usando uma conexão NOVA do
// pool (o antigo comportamento, via query()) faz o INSERT esperar a checagem de
// FK contra uma linha bloqueada pela transação ainda aberta na OUTRA conexão.
// Como o código que abriu essa transação é o mesmo que está esperando este
// INSERT terminar, isso é um deadlock a nível de aplicação que o detector de
// deadlock do Postgres não enxerga (a conexão dona da transação não está
// esperando lock nenhum do lado do Postgres, só está com o cliente Node parado).
// Reproduzido e confirmado contra Postgres real: a conexão travava para sempre
// (estado "idle in transaction" + "active"/wait_event "transactionid"), vazando
// uma conexão do pool a cada evento despachado até esgotar o pool inteiro --
// e como esse pool esgotado é o MESMO usado por toda a aplicação, isso derrubava
// rotas completamente não relacionadas (equipe/membros, notificacoes) com
// "Connection terminated due to connection timeout". Passando o mesmo `client`
// da transação, o INSERT roda na mesma conexão/transação que já tem a linha
// travada -- sem esperar lock de ninguém.
export async function registrarAuditoria(registro: NovoRegistroAuditoria, client?: PoolClient): Promise<void> {
  const runner = client ?? { query: (text: string, params?: unknown[]) => query(text, params) }
  await runner.query(
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
