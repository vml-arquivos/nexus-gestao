/**
 * publish.ts
 *
 * Ponte tarefas.ts -> Automation Engine. Sempre que uma tarefa com
 * origem_sistema='destrava' muda de status/checklist dentro do próprio
 * Nexus (um usuário do Nexus editou/aprovou diretamente, sem passar pelo
 * Destrava), publica TarefaConcluidaNexus para o Destrava refletir a
 * mudança -- tarefas nativas do Nexus (a grande maioria) não são afetadas,
 * pois a chave de idempotência exige origem_sistema='destrava'.
 *
 * Fire-and-forget por design: nunca deve atrasar ou falhar a resposta do
 * endpoint de tarefas que a chamou.
 */
import { publishEvent } from '../../services/automation/eventBus'

export function publicarTarefaConcluidaSeAutomacao(tarefa: any): void {
  if (!tarefa || tarefa.origem_sistema !== 'destrava') return

  const origemPayload = tarefa.origem_payload && typeof tarefa.origem_payload === 'object' ? tarefa.origem_payload : {}

  publishEvent({
    orgId: tarefa.org_id,
    eventType: 'TarefaConcluidaNexus',
    aggregateType: 'tarefa',
    aggregateId: tarefa.id,
    idempotencyKey: `tarefa_nexus:${tarefa.id}:${tarefa.status}:${tarefa.updated_at}`,
    payload: {
      nexus_tarefa_id: tarefa.id,
      origem_tipo: tarefa.origem_tipo,
      origem_id: tarefa.origem_id,
      numero_semana: origemPayload.numero_semana ?? null,
      status: tarefa.status,
      status_gestor: tarefa.status_gestor,
      checklist: tarefa.checklist,
      updated_at: tarefa.updated_at,
    },
  }).catch((err) => {
    console.error('[AUTOMATION] Erro ao publicar TarefaConcluidaNexus:', err)
  })
}
