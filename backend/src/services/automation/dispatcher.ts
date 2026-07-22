/**
 * dispatcher.ts
 *
 * Espelha server/services/automation/dispatcher.ts do Destrava. Entrega um
 * evento do outbox ao Destrava: despacho imediato (logo após publishEvent)
 * e varredura de retry (chamada periodicamente, reaproveitando o job runner
 * já existente em lib/notifHelper.ts).
 */
import pool from '../../db/pool'
import {
  reivindicarLotePendente,
  marcarDespachado,
  marcarFalha,
  registrarAuditoria,
  type AutomationEventRow,
} from './outboxRepository'
import { enviarWebhookDestrava, destravaConfigurado } from './webhookClient'

const ENDPOINT_EVENTOS_DESTRAVA = '/api/nexus/eventos'

function construirEnvelope(evento: AutomationEventRow) {
  return {
    event_id: evento.id,
    event_type: evento.event_type,
    event_version: evento.event_version,
    occurred_at: evento.created_at,
    source_system: 'nexus',
    aggregate_type: evento.aggregate_type,
    aggregate_id: evento.aggregate_id,
    idempotency_key: evento.idempotency_key,
    correlation_id: evento.correlation_id,
    payload: evento.payload,
  }
}

async function tentarDespachar(client: import('pg').PoolClient, evento: AutomationEventRow): Promise<boolean> {
  const inicio = Date.now()
  const orgId = evento.org_id

  if (!destravaConfigurado()) {
    await marcarFalha(client, evento.id, 'Integração Destrava não configurada (DESTRAVA_API_URL/segredo ausente)', evento.attempts + 1)
    await registrarAuditoria({
      eventId: evento.id,
      evento: evento.event_type,
      orgId,
      resultado: 'falha',
      tempoMs: Date.now() - inicio,
      erro: 'Integração Destrava não configurada',
    })
    return false
  }

  try {
    const resposta = await enviarWebhookDestrava(ENDPOINT_EVENTOS_DESTRAVA, construirEnvelope(evento), evento.idempotency_key)
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}: ${resposta.body.slice(0, 300)}`)

    await marcarDespachado(client, evento.id)
    await registrarAuditoria({
      eventId: evento.id,
      evento: evento.event_type,
      orgId,
      resultado: 'sucesso',
      tempoMs: Date.now() - inicio,
    })
    return true
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : String(err)
    await marcarFalha(client, evento.id, mensagem, evento.attempts + 1)
    await registrarAuditoria({
      eventId: evento.id,
      evento: evento.event_type,
      orgId,
      resultado: 'falha',
      tempoMs: Date.now() - inicio,
      erro: mensagem,
    })
    return false
  }
}

/** Chamado logo após a inserção no outbox -- tentativa imediata, best-effort. */
export async function despacharAgora(evento: AutomationEventRow): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await tentarDespachar(client, evento)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Varredura de retry, chamada periodicamente por iniciarJobsNotificacao(). */
export async function executarVarreduraOutboxAutomation(): Promise<{ processados: number; sucesso: number }> {
  const client = await pool.connect()
  let processados = 0
  let sucesso = 0
  try {
    await client.query('BEGIN')
    const lote = await reivindicarLotePendente(client)
    for (const evento of lote) {
      processados++
      const ok = await tentarDespachar(client, evento)
      if (ok) sucesso++
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  return { processados, sucesso }
}
