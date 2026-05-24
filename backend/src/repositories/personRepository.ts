import { query, queryOne } from '../db/pool'

export interface PersonFilters {
  tipo?: string
}

export async function list(orgId: string, filters: PersonFilters) {
  let sql = 'SELECT * FROM pessoas WHERE org_id = $1'
  const params: unknown[] = [orgId]
  let idx = 2
  if (filters.tipo) {
    sql += ` AND tipo = $${idx++}`
    params.push(filters.tipo)
  }
  sql += ' ORDER BY nome ASC'
  return query(sql, params)
}

export async function create(orgId: string, data: any) {
  const { nome, tipo, cargo, contato, email, valor, obs } = data
  return queryOne(
    `INSERT INTO pessoas (org_id, nome, tipo, cargo, contato, email, valor, obs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [orgId, nome.trim(), tipo, cargo || null, contato || null, email || null, valor || null, obs || null]
  )
}

export async function update(orgId: string, id: string, data: any) {
  const { nome, tipo, cargo, contato, email, valor, obs } = data
  return queryOne(
    `UPDATE pessoas SET
       nome = COALESCE($1, nome), tipo = COALESCE($2, tipo),
       cargo = COALESCE($3, cargo), contato = COALESCE($4, contato),
       email = COALESCE($5, email), valor = COALESCE($6, valor), obs = COALESCE($7, obs)
     WHERE id = $8 AND org_id = $9 RETURNING *`,
    [nome || null, tipo || null, cargo || null, contato || null, email || null, valor || null, obs || null, id, orgId]
  )
}

export async function remove(orgId: string, id: string) {
  await query('DELETE FROM pessoas WHERE id = $1 AND org_id = $2', [id, orgId])
  return { ok: true }
}

export default { list, create, update, remove }