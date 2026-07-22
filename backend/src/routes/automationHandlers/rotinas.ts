/**
 * rotinas.ts
 *
 * Handlers de RotinaCndDue/RotinaCemprotDue -- criam a tarefa concreta do
 * período (mês para CND, semana ISO para CEMPROT) quando o scheduler do
 * Destrava decide que é hora. A chave de idempotência já vem pronta do
 * Destrava (embutida no idempotency_key do evento, formato
 * "rotina:cnd:{contrato_id}:{YYYY-MM}" / "rotina:cemprot:{contrato_id}:{YYYY-MM}:{iso_week}")
 * e é reaproveitada como external_key da tarefa -- garante que o mesmo mês/
 * semana nunca gera duas tarefas mesmo que o evento seja entregue mais de
 * uma vez (despacho imediato + retry sweep, por exemplo).
 */
import { criarTarefaAutomacao } from './shared'

const CHECKLIST_CND = [
  'Consultar CND',
  'Baixar PDF',
  'Anexar PDF',
  'Registrar validade',
  'Registrar observações',
  'Atualizar Cliente 360',
  'Concluir',
]

const CHECKLIST_CEMPROT = [
  'Consultar CEMPROT',
  'Registrar resultado',
  'Anexar evidências',
  'Atualizar Cliente 360',
  'Concluir',
]

export async function handleRotinaCndDue(payload: Record<string, unknown>): Promise<void> {
  const contratoId = String(payload.contrato_id || '')
  const empresaId = String(payload.empresa_id || '')
  const empresaNome = String(payload.empresa_nome || 'Empresa')
  const competencia = String(payload.competencia || '')
  const responsavelEmail = payload.responsavel_email ? String(payload.responsavel_email) : null

  if (!contratoId || !competencia) {
    throw new Error('RotinaCndDue: contrato_id e competencia são obrigatórios.')
  }

  await criarTarefaAutomacao({
    externalKey: `rotina:cnd:${contratoId}:${competencia}`,
    origemTipo: 'rotina_cnd',
    origemId: contratoId,
    origemNome: empresaNome,
    titulo: `Rotina CND — ${empresaNome} (${competencia})`,
    descricao: 'Verificação mensal de Certidão Negativa de Débitos, gerada automaticamente pelo Automation Engine a partir do contrato de assessoria ativo.',
    responsavelEmail,
    workflowTipo: 'rotina_cnd',
    competencia,
    recorrencia: 'mensal',
    projetoGrupoId: contratoId,
    checklist: CHECKLIST_CND,
    metadata: { empresa_id: empresaId, empresa_cnpj: payload.empresa_cnpj || null, contrato_id: contratoId },
  })
}

export async function handleRotinaCemprotDue(payload: Record<string, unknown>): Promise<void> {
  const contratoId = String(payload.contrato_id || '')
  const empresaId = String(payload.empresa_id || '')
  const empresaNome = String(payload.empresa_nome || 'Empresa')
  const competencia = String(payload.competencia || '')
  const isoWeek = String(payload.iso_week || '')
  const responsavelEmail = payload.responsavel_email ? String(payload.responsavel_email) : null

  if (!contratoId || !isoWeek) {
    throw new Error('RotinaCemprotDue: contrato_id e iso_week são obrigatórios.')
  }

  await criarTarefaAutomacao({
    externalKey: `rotina:cemprot:${contratoId}:${competencia}:${isoWeek}`,
    origemTipo: 'rotina_cemprot',
    origemId: contratoId,
    origemNome: empresaNome,
    titulo: `Rotina CEMPROT — ${empresaNome} (${isoWeek})`,
    descricao: 'Verificação semanal de CEMPROT, gerada automaticamente pelo Automation Engine a partir do contrato de assessoria ativo.',
    responsavelEmail,
    workflowTipo: 'rotina_cemprot',
    competencia,
    recorrencia: 'semanal',
    projetoGrupoId: contratoId,
    checklist: CHECKLIST_CEMPROT,
    metadata: { empresa_id: empresaId, empresa_cnpj: payload.empresa_cnpj || null, contrato_id: contratoId, iso_week: isoWeek },
  })
}
