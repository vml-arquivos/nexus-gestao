/**
 * acompanhamento.ts
 *
 * Handler de AcompanhamentoCriado (Workflow 2). Cria uma tarefa por semana
 * do acompanhamento bancário, todas ligadas pelo mesmo projeto_grupo_id
 * (acompanhamento_id) e responsável pelo mesmo usuário que iniciou o
 * acompanhamento no Destrava -- nunca pede escolha manual. A tarefa é o
 * registro oficial (system of record); a execução de fato acontece dentro
 * do Destrava, que lê/escreve nela via /api/integracoes/destrava/tarefas/:id
 * (routes/integracoes.ts) em vez de criar sua própria cópia.
 *
 * Cada semana tem sua própria chave de idempotência (acomp:{id}:semana:{n}),
 * então reprocessar o evento inteiro (ex.: depois de uma falha parcial) é
 * seguro -- as semanas já criadas simplesmente não são duplicadas.
 */
import pool from '../../db/pool'
import { addHistorico } from '../integracoes'
import { criarTarefaAutomacao } from './shared'

function addDiasISO(dataBase: Date, dias: number): Date {
  const copia = new Date(dataBase)
  copia.setUTCDate(copia.getUTCDate() + dias)
  return copia
}

export interface SemanaCriada {
  numero_semana: number
  nexus_tarefa_id: string
}

/**
 * Retorna o mapeamento semana -> tarefa criada para que o chamador (o
 * receptor do webhook em routes/automation.ts) devolva isso na resposta
 * HTTP -- é assim que o Destrava aprende os IDs das tarefas do Nexus e
 * preenche sua própria nexus_task_links, sem precisar de uma segunda
 * chamada de volta.
 */
export async function handleAcompanhamentoCriado(payload: Record<string, unknown>): Promise<SemanaCriada[]> {
  const acompanhamentoId = String(payload.acompanhamento_id || '')
  const empresaId = String(payload.empresa_id || '')
  const empresaNome = String(payload.empresa_nome || 'Empresa')
  const banco = payload.banco_observado ? String(payload.banco_observado) : null
  const responsavelEmail = payload.responsavel_email ? String(payload.responsavel_email) : null
  const dataInicio = payload.data_inicio ? String(payload.data_inicio) : null
  const numeroSemanas = Number(payload.numero_semanas || 0)

  if (!acompanhamentoId || !dataInicio || !numeroSemanas || numeroSemanas < 1) {
    throw new Error('AcompanhamentoCriado: acompanhamento_id, data_inicio e numero_semanas (>=1) são obrigatórios.')
  }
  // FIX62: mesma trava usada em rotinas.ts -- empresa_id nunca fica vazio
  // silenciosamente, para nunca virar um balde de agrupamento compartilhado
  // por engano com outra empresa que também tenha esse campo faltando.
  if (!empresaId) {
    throw new Error('AcompanhamentoCriado: empresa_id é obrigatório e não pode ficar em branco.')
  }

  const inicio = new Date(`${dataInicio}T12:00:00Z`)
  if (Number.isNaN(inicio.getTime())) {
    throw new Error(`AcompanhamentoCriado: data_inicio inválida (${dataInicio}).`)
  }

  const resultado: SemanaCriada[] = []

  for (let semana = 1; semana <= numeroSemanas; semana++) {
    const semanaInicio = addDiasISO(inicio, (semana - 1) * 7)
    const semanaFim = addDiasISO(semanaInicio, 6)
    const competencia = semanaInicio.toISOString().slice(0, 7)

    const { tarefa } = await criarTarefaAutomacao({
      externalKey: `acomp:${acompanhamentoId}:semana:${semana}`,
      origemTipo: 'acompanhamento_semana',
      origemId: acompanhamentoId,
      origemNome: `${empresaNome} — Semana ${semana}`,
      titulo: `Acompanhamento Bancário — ${empresaNome} — Semana ${semana}`,
      descricao: banco ? `Banco monitorado: ${banco}.` : null,
      prazo: semanaFim.toISOString().slice(0, 10),
      responsavelEmail,
      workflowTipo: 'acompanhamento_bancario',
      competencia,
      recorrencia: 'nenhum',
      projetoGrupoId: acompanhamentoId,
      checklist: ['Executar acompanhamento da semana no Destrava', 'Concluir'],
      metadata: {
        empresa_id: empresaId,
        acompanhamento_id: acompanhamentoId,
        numero_semana: semana,
        banco_observado: banco,
      },
    })

    resultado.push({ numero_semana: semana, nexus_tarefa_id: tarefa.id })
  }

  return resultado
}

/**
 * Handler de fallback para SemanaConcluida -- só é exercitado quando a
 * chamada síncrona do Destrava para PATCH /destrava/tarefas/:id/checklist
 * (routes/integracoes.ts) falha e o Destrava enfileira o evento no outbox
 * em vez de perder a atualização. Aplica a mesma mudança de status/checklist
 * diretamente por nexus_tarefa_id (a tarefa já existe -- isto não cria nada).
 */
export async function handleSemanaConcluida(payload: Record<string, unknown>): Promise<void> {
  const nexusTarefaId = String(payload.nexus_tarefa_id || '').trim()
  const orgId = String(payload.nexus_org_id || payload.org_id || '').trim()
  if (!nexusTarefaId) throw new Error('SemanaConcluida: nexus_tarefa_id é obrigatório.')
  if (!orgId) throw new Error('SemanaConcluida: contexto organizacional é obrigatório.')

  const acompanhamentoId = String(
    payload.acompanhamento_id || payload.projeto_grupo_id || payload.nexus_aggregate_id || '',
  ).trim()
  const externalKey = String(payload.external_key || '').trim()
  const existing = await pool.query(
    `SELECT * FROM tarefas
      WHERE id = $1
        AND org_id = $2
        AND origem_sistema = 'destrava'
        AND workflow_tipo = 'acompanhamento_bancario'
        AND ($3 = '' OR projeto_grupo_id::text = $3 OR origem_id = $3)
        AND ($4 = '' OR external_key = $4)
      LIMIT 1`,
    [nexusTarefaId, orgId, acompanhamentoId, externalKey],
  )
  const tarefa = existing.rows[0]
  if (!tarefa) throw new Error(`SemanaConcluida: tarefa ${nexusTarefaId} não pertence ao contexto autorizado.`)

  const validStatuses = new Set(['pendente', 'em_progresso', 'concluida', 'nao_concluida', 'cancelada', 'aprovada'])
  const status = typeof payload.status === 'string' && payload.status.trim()
    ? payload.status.trim()
    : tarefa.status
  if (!validStatuses.has(status)) throw new Error(`SemanaConcluida: status inválido (${status}).`)

  const hasChecklist = Array.isArray(payload.checklist)
  const checklist = hasChecklist ? payload.checklist : null
  if (hasChecklist && Buffer.byteLength(JSON.stringify(checklist), 'utf8') > 1_000_000) {
    throw new Error('SemanaConcluida: checklist acima de 1 MB deve ser tratada por fluxo específico.')
  }

  if (hasChecklist) {
    await pool.query(
      `UPDATE tarefas SET status = $1, checklist = $2, updated_at = NOW()
        WHERE id = $3 AND org_id = $4 AND workflow_tipo = 'acompanhamento_bancario'`,
      [status, JSON.stringify(checklist), nexusTarefaId, orgId],
    )
  } else {
    await pool.query(
      `UPDATE tarefas SET status = $1, updated_at = NOW()
        WHERE id = $2 AND org_id = $3 AND workflow_tipo = 'acompanhamento_bancario'`,
      [status, nexusTarefaId, orgId],
    )
  }

  await addHistorico(
    orgId,
    nexusTarefaId,
    tarefa.criado_por,
    'atualizada_automacao_retry',
    `Sincronização atrasada do Destrava aplicada via retry do Automation Engine (${String(payload.concluida_por || 'usuário')}).`
  )
}
