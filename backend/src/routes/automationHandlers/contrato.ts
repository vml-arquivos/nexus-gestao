/**
 * contrato.ts
 *
 * Handlers de ContratoAssinado/ContratoValidado/ContratoEncerrado. Não
 * criam tarefa nenhuma aqui -- quem cria a tarefa concreta de cada período
 * é RotinaCndDue/RotinaCemprotDue (rotinas.ts), disparado pelo scheduler do
 * Destrava a cada avaliação (dia 22 / semanal). O papel deste handler é só
 * registrar em auditoria que o workflow do contrato começou/terminou; o
 * próprio scheduler do Destrava já para de emitir novos RotinaXDue sozinho
 * assim que o contrato deixa de estar ativo (consulta contratos_gerados
 * direto), então não há "série recorrente" para cancelar aqui do lado Nexus.
 */
import { registrarAuditoria } from '../../services/automation/outboxRepository'

export async function handleContratoAssinado(payload: Record<string, unknown>): Promise<void> {
  await registrarAuditoria({
    evento: 'ContratoAssinado',
    origemSistema: 'destrava',
    resultado: 'sucesso',
    detalhe: { contrato_id: payload.contrato_id, empresa_id: payload.empresa_id },
  })
}

export async function handleContratoEncerrado(payload: Record<string, unknown>): Promise<void> {
  await registrarAuditoria({
    evento: 'ContratoEncerrado',
    origemSistema: 'destrava',
    resultado: 'sucesso',
    detalhe: { contrato_id: payload.contrato_id, empresa_id: payload.empresa_id },
  })
}
