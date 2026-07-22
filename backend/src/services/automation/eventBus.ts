/**
 * eventBus.ts
 *
 * Espelha server/services/automation/eventBus.ts do Destrava. Ponto único
 * de publicação de eventos que o Nexus emite para o Destrava.
 */
import { inserirEvento, registrarAuditoria, type AutomationEventRow } from './outboxRepository'
import { despacharAgora } from './dispatcher'

export type EventType = 'TarefaConcluidaNexus' | 'AlertaAutomacao'

export interface PublicarEventoInput {
  orgId?: string | null
  eventType: EventType
  aggregateType: string
  aggregateId: string
  idempotencyKey: string
  payload: Record<string, unknown>
  correlationId?: string
}

export async function publishEvent(input: PublicarEventoInput): Promise<AutomationEventRow | null> {
  const inicio = Date.now()
  const evento = await inserirEvento({
    orgId: input.orgId || null,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    correlationId: input.correlationId,
  })

  if (!evento) {
    await registrarAuditoria({
      evento: input.eventType,
      orgId: input.orgId || null,
      resultado: 'ignorado_duplicado',
      tempoMs: Date.now() - inicio,
      detalhe: { idempotency_key: input.idempotencyKey, motivo: 'evento já registrado no outbox' },
    })
    return null
  }

  despacharAgora(evento).catch(() => {})

  return evento
}
