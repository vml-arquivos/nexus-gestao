import { query, queryOne } from '../db/pool'

export interface UserProfileRecord {
  id: string
  org_id: string
  nome: string
  email: string
  role: string
  ativo: boolean
  criado_por: string | null
  created_at: Date
}

/**
 * Camada de repositório para usuários (profiles). Encapsula consultas SQL.
 */
export class UserRepository {
  /**
   * Lista todos os usuários de uma organização.
   */
  static async list(orgId: string): Promise<UserProfileRecord[]> {
    return query(
      `SELECT id, nome, email, role, ativo, criado_por, created_at
       FROM profiles
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [orgId],
    ) as Promise<UserProfileRecord[]>
  }

  /**
   * Cria um novo usuário na organização.
   */
  static async create(profile: {
    org_id: string
    nome: string
    email: string
    senha_hash: string
    role: string
    criado_por: string
  }): Promise<UserProfileRecord> {
    const result = await queryOne(
      `INSERT INTO profiles (org_id, nome, email, senha_hash, role, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, nome, email, role, ativo, criado_por, created_at`,
      [profile.org_id, profile.nome, profile.email, profile.senha_hash, profile.role, profile.criado_por],
    )
    return result as unknown as UserProfileRecord
  }
}