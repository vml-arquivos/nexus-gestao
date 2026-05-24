import { query, queryOne } from '../db/pool'

/**
 * Placeholder de repositório de empresas. O sistema atual ainda não
 * possui tabela/rota específica para empresas (pode ser representada
 * pela tabela `pessoas` ou uma futura `empresas`). Este arquivo serve
 * como preparação para futuras expansões.
 */
export async function list(orgId: string) {
  // Ajuste a consulta conforme a estrutura real de empresas no banco
  return query('SELECT * FROM empresas WHERE org_id = $1 ORDER BY nome ASC', [orgId])
}

export async function create(orgId: string, data: any) {
  const { nome, cnpj, contato, email, endereco, obs } = data
  return queryOne(
    `INSERT INTO empresas (org_id, nome, cnpj, contato, email, endereco, obs)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, nome.trim(), cnpj || null, contato || null, email || null, endereco || null, obs || null]
  )
}

export async function update(orgId: string, id: string, data: any) {
  const { nome, cnpj, contato, email, endereco, obs } = data
  return queryOne(
    `UPDATE empresas SET
       nome = COALESCE($1, nome), cnpj = COALESCE($2, cnpj),
       contato = COALESCE($3, contato), email = COALESCE($4, email),
       endereco = COALESCE($5, endereco), obs = COALESCE($6, obs)
     WHERE id = $7 AND org_id = $8 RETURNING *`,
    [nome || null, cnpj || null, contato || null, email || null, endereco || null, obs || null, id, orgId]
  )
}

export async function remove(orgId: string, id: string) {
  await query('DELETE FROM empresas WHERE id = $1 AND org_id = $2', [id, orgId])
  return { ok: true }
}

export default { list, create, update, remove }