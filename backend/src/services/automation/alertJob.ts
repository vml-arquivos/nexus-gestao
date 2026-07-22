/**
 * alertJob.ts
 *
 * Ladder de alertas 7d/3d/1d/no dia/atrasado para tarefas do Automation
 * Engine (workflow_tipo IN rotina_cnd/rotina_cemprot/acompanhamento_bancario).
 * Diferente de jobVencimentos (notifHelper.ts), que só cobre dia-do-vencimento
 * e atrasado -- este é o ladder completo pedido para as rotinas/acompanhamentos.
 *
 * Cada (tarefa, tier, dia) só dispara uma vez: a checagem de idempotência
 * usa o próprio outbox (automation_events, UNIQUE(event_type,idempotency_key)),
 * então rodar o job com qualquer frequência é seguro -- não duplica alerta.
 */
import pool, { query } from '../../db/pool'
import { criarNotificacao } from '../../lib/notifHelper'
import { publishEvent } from './eventBus'

const TIERS = [7, 3, 1, 0] as const

interface TarefaComPrazo {
  id: string
  org_id: string
  titulo: string
  prazo: string
  status: string
  responsavel_id: string | null
  workflow_tipo: string
  origem_tipo: string | null
  origem_id: string | null
  origem_payload: Record<string, unknown> | null
}

function diasRestantes(prazo: string): number {
  const hoje = new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00Z')
  const dataPrazo = new Date(`${prazo}T12:00:00Z`)
  return Math.round((dataPrazo.getTime() - hoje.getTime()) / 86_400_000)
}

function tituloTier(dias: number): { tier: string; titulo: string } {
  if (dias < 0) return { tier: 'atrasado', titulo: `Atrasado há ${Math.abs(dias)} dia(s)` }
  if (dias === 0) return { tier: 'hoje', titulo: 'Vence hoje' }
  return { tier: `d${dias}`, titulo: `Vence em ${dias} dia(s)` }
}

export async function avaliarAlertasAutomacao(): Promise<void> {
  const hojeStr = new Date().toISOString().slice(0, 10)

  const tarefas = await query<TarefaComPrazo>(
    `SELECT id, org_id, titulo, prazo::text, status, responsavel_id, workflow_tipo, origem_tipo, origem_id, origem_payload
       FROM tarefas
      WHERE workflow_tipo IS NOT NULL
        AND status NOT IN ('concluida', 'aprovada', 'cancelada')
        AND prazo IS NOT NULL
        AND prazo <= (CURRENT_DATE + INTERVAL '7 days')`
  )

  for (const tarefa of tarefas) {
    const dias = diasRestantes(tarefa.prazo)
    if (dias > 7) continue
    if (dias > 0 && !(TIERS as readonly number[]).includes(dias)) continue

    const { tier, titulo } = tituloTier(dias)
    const idempotencyKey = `alerta:${tarefa.id}:${tier}:${hojeStr}`

    if (tarefa.responsavel_id) {
      await criarNotificacao({
        orgId: tarefa.org_id,
        userId: tarefa.responsavel_id,
        tipo: 'automacao_prazo',
        titulo: `${titulo}: ${tarefa.titulo}`,
        body: tarefa.titulo,
        referenciaId: tarefa.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    const empresaId = (tarefa.origem_payload as any)?.empresa_id || null
    await publishEvent({
      orgId: tarefa.org_id,
      eventType: 'AlertaAutomacao',
      aggregateType: 'tarefa',
      aggregateId: tarefa.id,
      idempotencyKey,
      payload: {
        tarefa_id: tarefa.id,
        titulo: tarefa.titulo,
        workflow_tipo: tarefa.workflow_tipo,
        origem_tipo: tarefa.origem_tipo,
        origem_id: tarefa.origem_id,
        empresa_id: empresaId,
        tier,
        mensagem: `${titulo}: ${tarefa.titulo}`,
        prazo: tarefa.prazo,
      },
    }).catch((err) => {
      console.error('[AUTOMATION] Erro ao publicar AlertaAutomacao:', err)
    })
  }
}
