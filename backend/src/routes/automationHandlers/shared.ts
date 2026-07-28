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
  let mesclada = false
  try {
    await client.query('BEGIN')
    // Trava por ocorrência (idempotência) e por empresa (coordena decisão de
    // mesclar vs. criar) — serializa duas entregas concorrentes de verdade;
    // sem a trava, a leitura abaixo ainda ficaria correta graças ao
    // ON CONFLICT DO NOTHING no INSERT final, só que faria trabalho à toa.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.externalKey])
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`empresa:${orgId}:${input.origemId}`])

    // Esta ocorrência já foi processada antes (em qualquer formato — linha
    // própria ou mesclada em outra)? Só então evita refazer o trabalho.
    const jaProcessado = await client.query(
      `SELECT t.* FROM automation_processed_keys k JOIN tarefas t ON t.id = k.tarefa_id
       WHERE k.org_id = $1 AND k.external_key = $2`,
      [orgId, input.externalKey],
    )
    if (jaProcessado.rows[0]) {
      tarefa = jaProcessado.rows[0]
      await client.query('COMMIT')
      return { tarefa, criada: false }
    }

    // Empresa já tem uma lista aberta (mesma regra que a criação manual pelo
    // gestor usa): soma os itens nela em vez de criar uma lista nova e
    // quase-duplicada. Só se aplica às rotinas de lembrete recorrente
    // (CND/CEMPROT) -- o acompanhamento bancário é desenhado de propósito
    // para criar uma tarefa por semana (agrupadas por projeto_grupo_id na
    // UI), então nunca mescla.
    const permiteMesclagem = input.workflowTipo !== 'acompanhamento_bancario'
    const listaAbertaResult = permiteMesclagem
      ? await client.query<any>(
          `SELECT * FROM tarefas
           WHERE org_id = $1 AND origem_id = $2 AND COALESCE(escopo, 'pessoal') = 'equipe' AND status <> 'cancelada'
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [orgId, input.origemId],
        )
      : { rows: [] }
    const listaAberta = listaAbertaResult.rows[0]

    if (listaAberta) {
      const itensAtuais = Array.isArray(listaAberta.checklist)
        ? listaAberta.checklist
        : (typeof listaAberta.checklist === 'string' ? JSON.parse(listaAberta.checklist || '[]') : [])
      const novoChecklist = [...itensAtuais, ...checklist]
      const finalizada = ['aprovada', 'concluida'].includes(String(listaAberta.status || ''))
      const updated = await client.query(
        `UPDATE tarefas SET
           checklist = $1,
           status = CASE WHEN $4 THEN 'pendente' ELSE status END,
           status_gestor = CASE WHEN $4 THEN 'aguardando' ELSE status_gestor END,
           aprovada_em = CASE WHEN $4 THEN NULL ELSE aprovada_em END,
           aprovada_por = CASE WHEN $4 THEN NULL ELSE aprovada_por END,
           updated_at = NOW()
         WHERE id = $2 AND org_id = $3
         RETURNING *`,
        [JSON.stringify(novoChecklist), listaAberta.id, orgId, finalizada],
      )
      tarefa = updated.rows[0]
      mesclada = true
    } else {
      // Nenhuma lista aberta para esta empresa — cria a primeira.
      const inserted = await client.query(
        `INSERT INTO tarefas
           (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, prazo, prioridade,
            checklist, status, status_gestor, origem_sistema, origem_tipo, origem_id, origem_nome,
            origem_payload, external_key, workflow_tipo, competencia, recorrencia, projeto_grupo_id, escopo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'media',$8,'pendente','aguardando','destrava',$9,$10,$11,$12,$13,$14,$15,$16,$17,'equipe')
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
      tarefa = inserted.rows[0]
      criada = true
    }

    // Reivindica esta ocorrência só agora, já com o id final e correto da
    // tarefa (nunca existe um estado intermediário "reivindicado mas sem
    // tarefa"). ON CONFLICT DO NOTHING como rede de segurança final.
    await client.query(
      `INSERT INTO automation_processed_keys (org_id, external_key, tarefa_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, external_key) DO NOTHING`,
      [orgId, input.externalKey, tarefa.id],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  if (!tarefa) throw new Error('Falha ao criar tarefa de automação.')

  if (mesclada) {
    await addHistorico(orgId, tarefa.id, creator.id, 'itens_automacao_mesclados', `${checklist.length} tarefa(s) adicionada(s) automaticamente pelo Automation Engine (${input.workflowTipo}) à lista já aberta desta empresa.`)
  }

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
