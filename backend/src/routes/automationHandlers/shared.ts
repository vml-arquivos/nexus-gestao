/**
 * shared.ts
 *
 * Criação idempotente e concorrência-segura de tarefas originadas do
 * Automation Engine (rotinas CND/CEMPROT, semanas de acompanhamento
 * bancário). Mesmo padrão de pg_advisory_xact_lock + INSERT ... ON CONFLICT
 * DO NOTHING já corrigido em routes/integracoes.ts (POST /destrava/tarefas),
 * reaproveitado aqui em vez de duplicado por cópia-e-cola.
 */
import crypto from 'crypto'
import pool from '../../db/pool'
import { findActiveUserByEmail, resolveIntegrationUser, addHistorico } from '../integracoes'

export interface ChecklistItemInput {
  texto: string
}

export interface CriarTarefaAutomacaoInput {
  externalKey: string
  origemTipo: string
  origemId: string
  origemNome?: string | null
  titulo: string
  descricao?: string | null
  prazo?: string | null
  responsavelEmail?: string | null
  workflowTipo: 'rotina_cnd' | 'rotina_cemprot' | 'acompanhamento_bancario'
  competencia?: string | null
  recorrencia?: 'nenhum' | 'semanal' | 'mensal'
  projetoGrupoId?: string | null
  checklist: string[]
  metadata?: Record<string, unknown>
}

export interface TarefaAutomacaoResultado {
  tarefa: any
  criada: boolean
}

/**
 * Cria (ou recupera, se já existir) a tarefa identificada por externalKey.
 * O advisory lock serializa duas entregas concorrentes da mesma chave (ex.:
 * despacho imediato do Destrava + sua própria varredura de retry chegando
 * quase juntas); o ON CONFLICT DO NOTHING garante que só uma sobrevive
 * mesmo sem o lock, mas o lock evita o round-trip extra e corridas na
 * lógica de "juntar em lista existente" que viria depois.
 */
export async function criarTarefaAutomacao(input: CriarTarefaAutomacaoInput): Promise<TarefaAutomacaoResultado> {
  const creator = await resolveIntegrationUser({ responsavel_email: input.responsavelEmail })
  if (!creator) throw new Error('Nenhum usuário ativo encontrado no Nexus para receber a automação.')

  const orgId = process.env.NEXUS_DESTRAVA_ORG_ID || creator.org_id
  let responsavel = input.responsavelEmail ? await findActiveUserByEmail(input.responsavelEmail) : null
  if (!responsavel || responsavel.org_id !== orgId) responsavel = creator

  const checklist = input.checklist.map((texto) => ({
    id: crypto.randomUUID(),
    texto,
    feito: false,
  }))

  const client = await pool.connect()
  let tarefa: any = null
  let criada = false
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.externalKey])

    const inserted = await client.query(
      `INSERT INTO tarefas
         (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, prazo, prioridade,
          checklist, status, status_gestor, origem_sistema, origem_tipo, origem_id, origem_nome,
          origem_payload, external_key, workflow_tipo, competencia, recorrencia, projeto_grupo_id, escopo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'media',$8,'pendente','aguardando','destrava',$9,$10,$11,$12,$13,$14,$15,$16,$17,'equipe')
       ON CONFLICT (org_id, external_key) DO NOTHING
       RETURNING *`,
      [
        orgId,
        creator.id,
        responsavel.id,
        responsavel.nome,
        input.titulo,
        input.descricao || null,
        input.prazo || null,
        JSON.stringify(checklist),
        input.origemTipo,
        input.origemId,
        input.origemNome || null,
        JSON.stringify(input.metadata || {}),
        input.externalKey,
        input.workflowTipo,
        input.competencia || null,
        input.recorrencia || 'nenhum',
        input.projetoGrupoId || null,
      ]
    )

    if (inserted.rows[0]) {
      tarefa = inserted.rows[0]
      criada = true
    } else {
      const existing = await client.query(`SELECT * FROM tarefas WHERE org_id = $1 AND external_key = $2`, [orgId, input.externalKey])
      tarefa = existing.rows[0] || null
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  if (!tarefa) throw new Error('Falha ao criar tarefa de automação.')

  if (criada) {
    await pool
      .query(
        `INSERT INTO nexus_external_links
           (org_id, source_system, external_type, external_id, external_name, nexus_type, nexus_id, metadata)
         VALUES ($1,'destrava',$2,$3,$4,'tarefa',$5,$6)
         ON CONFLICT (org_id, source_system, external_type, external_id, nexus_type) DO NOTHING`,
        [orgId, input.origemTipo, input.origemId, input.origemNome || null, tarefa.id, JSON.stringify(input.metadata || {})]
      )
      .catch(() => {})

    await addHistorico(orgId, tarefa.id, creator.id, 'criada_automacao', `Tarefa criada automaticamente pelo Automation Engine (${input.workflowTipo}).`)
  }

  return { tarefa, criada }
}
