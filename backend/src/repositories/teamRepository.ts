import { query, queryOne } from '../db/pool'

// ── TeamRepository ──────────────────────────────────────────────────
// Esta camada de dados encapsula as operações de leitura e escrita nas
// tabelas equipes e equipes_membros. Não contém lógica de negócio.

export interface Team {
  id: string
  org_id: string
  nome: string
  descricao: string | null
  criado_por: string | null
  created_at: string
  updated_at: string
  total_membros?: number
}

export const TeamRepository = {
  /**
   * Lista todas as equipes da organização, incluindo contagem de membros.
   */
  async list(orgId: string): Promise<Team[]> {
    const rows = await query<Team & { total_membros: string }>(
      `SELECT e.*, COUNT(em.membro_id) AS total_membros
       FROM equipes e
       LEFT JOIN equipes_membros em ON em.equipe_id = e.id
       WHERE e.org_id = $1
       GROUP BY e.id
       ORDER BY e.nome ASC`,
      [orgId]
    )
    return rows.map(r => ({ ...r, total_membros: parseInt(r.total_membros, 10) }))
  },

  /**
   * Cria uma nova equipe.
   */
  async create(orgId: string, nome: string, descricao: string | null, criadoPor: string): Promise<Team> {
    const row = await queryOne<Team>(
      `INSERT INTO equipes (org_id, nome, descricao, criado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orgId, nome, descricao, criadoPor]
    )
    return row as Team
  },

  /**
   * Adiciona membros a uma equipe. Ignora membros já existentes.
   */
  async addMembers(teamId: string, memberIds: string[]): Promise<void> {
    if (!memberIds || memberIds.length === 0) return
    // Usa UNNEST para inserir múltiplos membros de uma vez
    await query(
      `INSERT INTO equipes_membros (equipe_id, membro_id)
       SELECT $1, x FROM unnest($2::uuid[]) AS x
       ON CONFLICT (equipe_id, membro_id) DO NOTHING`,
      [teamId, memberIds]
    )
  },

  /**
   * Retorna membros de uma equipe (profiles) com informações básicas.
   */
  async members(teamId: string): Promise<{ id: string; nome: string; email: string; role: string; avatar_url: string | null }[]> {
    const rows = await query<{
      id: string
      nome: string
      email: string
      role: string
      avatar_url: string | null
    }>(
      `SELECT p.id, p.nome, p.email, p.role, p.avatar_url
       FROM equipes_membros em
       JOIN profiles p ON p.id = em.membro_id
       WHERE em.equipe_id = $1
       ORDER BY p.nome ASC`,
      [teamId]
    )
    return rows
  },
}

export default TeamRepository