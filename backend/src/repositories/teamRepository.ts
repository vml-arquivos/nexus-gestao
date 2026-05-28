import { query, queryOne } from '../db/pool'

export class TeamRepository {
  static async list(orgId: string, criadoPor: string | null) {
    const sql = `
      SELECT e.id, e.org_id, e.nome, e.descricao, e.criado_por, e.created_at, e.updated_at,
             COUNT(em.user_id) FILTER (WHERE COALESCE(em.ativo, TRUE) = TRUE) AS members_count
      FROM equipes e
      LEFT JOIN equipes_membros em ON em.equipe_id = e.id AND em.org_id = e.org_id
      WHERE e.org_id = $1 AND ($2::uuid IS NULL OR e.criado_por = $2)
      GROUP BY e.id
      ORDER BY e.nome ASC
    `
    return query(sql, [orgId, criadoPor])
  }

  static async detail(orgId: string, criadoPor: string | null, equipeId: string) {
    return queryOne(
      `SELECT e.id, e.org_id, e.nome, e.descricao, e.criado_por, e.created_at, e.updated_at,
              COUNT(em.user_id) FILTER (WHERE COALESCE(em.ativo, TRUE) = TRUE) AS members_count
       FROM equipes e
       LEFT JOIN equipes_membros em ON em.equipe_id = e.id AND em.org_id = e.org_id
       WHERE e.id = $1 AND e.org_id = $2 AND ($3::uuid IS NULL OR e.criado_por = $3)
       GROUP BY e.id`,
      [equipeId, orgId, criadoPor]
    )
  }

  static async create(orgId: string, nome: string, descricao: string | undefined, criadoPor: string) {
    return queryOne(
      `INSERT INTO equipes (org_id, nome, descricao, criado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orgId, nome.trim(), descricao || null, criadoPor]
    )
  }

  static async update(orgId: string, criadoPor: string | null, equipeId: string, data: { nome?: string; descricao?: string | null }) {
    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (data.nome !== undefined) { updates.push(`nome = $${idx++}`); params.push(data.nome.trim()) }
    if (data.descricao !== undefined) { updates.push(`descricao = $${idx++}`); params.push(data.descricao || null) }
    if (!updates.length) return null
    params.push(equipeId, orgId, criadoPor)
    return queryOne(
      `UPDATE equipes SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND org_id = $${idx++} AND ($${idx}::uuid IS NULL OR criado_por = $${idx})
       RETURNING *`,
      params
    )
  }

  static async members(orgId: string, criadoPor: string | null, equipeId: string, gestorAtual: string) {
    const sql = `
      SELECT p.id, p.nome, p.email, p.role, p.cargo, p.avatar_url, p.ativo,
             em.role_na_equipe, em.created_at AS membro_desde,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pendente' AND t.responsavel_id = p.id AND t.criado_por = $4) AS tarefas_pendentes,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'concluida' AND t.responsavel_id = p.id AND t.criado_por = $4) AS tarefas_concluidas,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'nao_concluida' AND t.responsavel_id = p.id AND t.criado_por = $4) AS tarefas_nao_concluidas,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'devolvida' AND t.responsavel_id = p.id AND t.criado_por = $4) AS tarefas_devolvidas
      FROM equipes e
      JOIN equipes_membros em ON em.equipe_id = e.id AND em.org_id = e.org_id AND COALESCE(em.ativo, TRUE) = TRUE
      JOIN profiles p ON p.id = em.user_id AND p.org_id = e.org_id
      LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = e.org_id
      WHERE e.id = $1 AND e.org_id = $3 AND ($2::uuid IS NULL OR e.criado_por = $2)
      GROUP BY p.id, em.role_na_equipe, em.created_at
      ORDER BY p.nome ASC
    `
    return query(sql, [equipeId, criadoPor, orgId, gestorAtual])
  }

  static async validateMember(orgId: string, gestorId: string, memberId: string, acessoAlto = false): Promise<boolean> {
    const result = await queryOne(
      `SELECT 1 FROM profiles
       WHERE id = $1 AND org_id = $2 AND ativo = TRUE
         AND ($4::boolean = TRUE OR id = $3 OR criado_por = $3 OR role IN ('membro','sub_gestor'))`,
      [memberId, orgId, gestorId, acessoAlto]
    )
    return !!result
  }

  static async addMembers(orgId: string, equipeId: string, members: { user_id: string; role_na_equipe: string }[], criadoPor: string) {
    for (const member of members) {
      await query(
        `INSERT INTO equipes_membros (org_id, equipe_id, user_id, profile_id, role_na_equipe, criado_por, ativo)
         VALUES ($1,$2,$3,$3,$4,$5,TRUE)
         ON CONFLICT (equipe_id, user_id) DO UPDATE SET ativo = TRUE, role_na_equipe = EXCLUDED.role_na_equipe`,
        [orgId, equipeId, member.user_id, member.role_na_equipe, criadoPor]
      )
    }
  }

  static async removeMember(orgId: string, criadoPor: string | null, equipeId: string, userId: string) {
    return queryOne(
      `UPDATE equipes_membros em
       SET ativo = FALSE
       FROM equipes e
       WHERE em.equipe_id = e.id
         AND em.user_id = $1
         AND em.equipe_id = $2
         AND em.org_id = $3
         AND ($4::uuid IS NULL OR e.criado_por = $4)
       RETURNING em.user_id`,
      [userId, equipeId, orgId, criadoPor]
    )
  }
}
