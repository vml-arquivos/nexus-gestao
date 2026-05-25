import { query, queryOne } from '../db/pool'

/**
 * TeamRepository — operações sobre as tabelas `equipes` e `equipes_membros`.
 * As tabelas existem no schema v2 (migrate.ts).
 */
export class TeamRepository {
  /**
   * Lista todas as equipes da organização com contagem de membros.
   */
  static async list(orgId: string) {
    return query(
      `SELECT e.id, e.org_id, e.nome, e.descricao, e.criado_por, e.created_at,
              COUNT(em.profile_id) AS members_count
       FROM equipes e
       LEFT JOIN equipes_membros em ON em.equipe_id = e.id
       WHERE e.org_id = $1
       GROUP BY e.id
       ORDER BY e.nome ASC`,
      [orgId]
    )
  }

  /**
   * Cria uma nova equipe.
   */
  static async create(orgId: string, nome: string, descricao: string | undefined, criadoPor: string) {
    return queryOne(
      `INSERT INTO equipes (org_id, nome, descricao, criado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orgId, nome.trim(), descricao || null, criadoPor]
    )
  }

  /**
   * Lista membros de uma equipe com contadores de tarefas.
   */
  static async members(orgId: string, equipeId: string) {
    return query(
      `SELECT p.id, p.nome, p.email, p.role, p.avatar_url,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'concluida') AS tarefas_pendentes,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status  = 'concluida') AS tarefas_concluidas
       FROM equipes_membros em
       JOIN profiles p ON p.id = em.profile_id
       LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = $1
       WHERE em.equipe_id = $2
       GROUP BY p.id
       ORDER BY p.nome ASC`,
      [orgId, equipeId]
    )
  }

  /**
   * Adiciona membros a uma equipe. Ignora duplicados via ON CONFLICT.
   */
  static async addMembers(equipeId: string, memberIds: string[]) {
    if (!memberIds || memberIds.length === 0) return

    const values: string[] = []
    const params: unknown[] = [equipeId]

    memberIds.forEach((id, idx) => {
      values.push(`($1, $${idx + 2})`)
      params.push(id)
    })

    await query(
      `INSERT INTO equipes_membros (equipe_id, profile_id)
       VALUES ${values.join(', ')}
       ON CONFLICT DO NOTHING`,
      params
    )
  }

  /**
   * Remove um membro de uma equipe.
   */
  static async removeMember(equipeId: string, profileId: string) {
    await query(
      'DELETE FROM equipes_membros WHERE equipe_id = $1 AND profile_id = $2',
      [equipeId, profileId]
    )
  }

  /**
   * Deleta uma equipe (cascata remove os membros automaticamente).
   */
  static async delete(orgId: string, equipeId: string) {
    await query('DELETE FROM equipes WHERE id = $1 AND org_id = $2', [equipeId, orgId])
  }
}
