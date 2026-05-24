import { query, queryOne } from '../db/pool'

export interface TaskFilters {
  status?: string
  prioridade?: string
  responsavel_id?: string
}

export async function list(orgId: string, userId: string, role: string, filters: TaskFilters) {
  let sql = `
    SELECT t.*, p.nome AS responsavel_nome_perfil, c.nome AS criado_por_nome
    FROM tarefas t
    LEFT JOIN profiles p ON p.id = t.responsavel_id
    LEFT JOIN profiles c ON c.id = t.criado_por
    WHERE t.org_id = $1
  `
  const params: unknown[] = [orgId]
  let idx = 2
  if (role === 'membro') {
    sql += ` AND t.responsavel_id = $${idx++}`
    params.push(userId)
  }
  if (filters.status) {
    sql += ` AND t.status = $${idx++}`
    params.push(filters.status)
  }
  if (filters.prioridade) {
    sql += ` AND t.prioridade = $${idx++}`
    params.push(filters.prioridade)
  }
  if (filters.responsavel_id && role === 'gestor') {
    sql += ` AND t.responsavel_id = $${idx++}`
    params.push(filters.responsavel_id)
  }
  sql += ' ORDER BY t.created_at DESC'
  return query(sql, params)
}

export async function getStats(orgId: string, userId: string, role: string) {
  const baseFilter = role === 'gestor' ? 'WHERE org_id = $1' : 'WHERE org_id = $1 AND responsavel_id = $2'
  const params = role === 'gestor' ? [orgId] : [orgId, userId]
  const stats = await queryOne<{
    total: string
    pendente: string
    em_progresso: string
    concluida: string
    cancelada: string
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'pendente')     AS pendente,
       COUNT(*) FILTER (WHERE status = 'em_progresso') AS em_progresso,
       COUNT(*) FILTER (WHERE status = 'concluida')    AS concluida,
       COUNT(*) FILTER (WHERE status = 'cancelada')    AS cancelada
     FROM tarefas
     ${baseFilter}`,
    params
  )
  return {
    total: parseInt(stats?.total || '0'),
    pendente: parseInt(stats?.pendente || '0'),
    em_progresso: parseInt(stats?.em_progresso || '0'),
    concluida: parseInt(stats?.concluida || '0'),
    cancelada: parseInt(stats?.cancelada || '0'),
  }
}

export async function create(orgId: string, userId: string, data: any) {
  const { titulo, descricao, data: dataInicio, prazo, prioridade = 'media', responsavel_id, checklist = [], obs } = data
  // Busca nome do responsável se fornecido
  let responsavelNome: string | null = null
  if (responsavel_id) {
    const resp = await queryOne<{ nome: string }>(
      'SELECT nome FROM profiles WHERE id = $1 AND org_id = $2',
      [responsavel_id, orgId]
    )
    responsavelNome = resp?.nome ?? null
  }
  return queryOne(
    `INSERT INTO tarefas
       (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade, checklist, obs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [orgId, userId, responsavel_id || null, responsavelNome, titulo.trim(), descricao || null,
     dataInicio || null, prazo || null, prioridade, JSON.stringify(checklist), obs || null]
  )
}

export async function update(orgId: string, userId: string, role: string, id: string, data: any) {
  // Membro pode alterar apenas status e checklist de suas tarefas
  if (role === 'membro') {
    const existing = await queryOne<{ id: string; responsavel_id: string }>(
      'SELECT id, responsavel_id FROM tarefas WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!existing || existing.responsavel_id !== userId) {
      throw new Error('Você não pode editar esta tarefa')
    }
    const allowed: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (data.status !== undefined) { allowed.push(`status = $${idx++}`); params.push(data.status) }
    if (data.checklist !== undefined) { allowed.push(`checklist = $${idx++}`); params.push(JSON.stringify(data.checklist)) }
    if (allowed.length === 0) {
      throw new Error('Nenhum campo permitido para atualizar.')
    }
    params.push(id)
    return queryOne(
      `UPDATE tarefas SET ${allowed.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    )
  }
  // Gestor: pode alterar todos campos
  const { titulo, descricao, data: dataInicio, prazo, prioridade, status, responsavel_id, checklist, obs } = data
  let responsavelNome: string | null = null
  if (responsavel_id) {
    const resp = await queryOne<{ nome: string }>(
      'SELECT nome FROM profiles WHERE id = $1 AND org_id = $2',
      [responsavel_id, orgId]
    )
    responsavelNome = resp?.nome ?? null
  }
  return queryOne(
    `UPDATE tarefas SET
       titulo = COALESCE($1, titulo),
       descricao = COALESCE($2, descricao),
       data = COALESCE($3, data),
       prazo = COALESCE($4, prazo),
       prioridade = COALESCE($5, prioridade),
       status = COALESCE($6, status),
       responsavel_id = COALESCE($7, responsavel_id),
       responsavel_nome = COALESCE($8, responsavel_nome),
       checklist = COALESCE($9, checklist),
       obs = COALESCE($10, obs),
       updated_at = NOW()
     WHERE id = $11 AND org_id = $12
     RETURNING *`,
    [titulo || null, descricao || null, dataInicio || null, prazo || null, prioridade || null,
     status || null, responsavel_id || null, responsavelNome,
     checklist ? JSON.stringify(checklist) : null, obs || null, id, orgId]
  )
}

export async function remove(orgId: string, id: string) {
  await query('DELETE FROM tarefas WHERE id = $1 AND org_id = $2', [id, orgId])
  return { ok: true }
}

export default { list, getStats, create, update, remove }