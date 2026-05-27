import { query, queryOne } from '../db/pool'

/**
 * Repositório de equipes. Responsável por todas as operações de leitura e
 * escrita relacionadas às tabelas `equipes` e `equipes_membros`. Ao
 * encapsular o acesso ao banco neste módulo isolado, reduzimos o
 * acoplamento entre as rotas/serviços e a camada de persistência e
 * facilitamos testes unitários.
 */
export class TeamRepository {
  /**
   * Lista todas as equipes de uma organização e conta quantos membros
   * cada uma possui. As equipes são ordenadas alfabeticamente.
   *
   * @param orgId Identificador da organização
   */
  static async list(orgId: string, userId: string) {
    // Lista equipes criadas pelo usuário. Não expõe equipes de outros gestores.
    const sql = `
      SELECT e.id, e.org_id, e.nome, e.descricao, e.criado_por, e.created_at,
             COUNT(em.profile_id) AS members_count
      FROM equipes e
      LEFT JOIN equipes_membros em ON em.equipe_id = e.id
      WHERE e.org_id = $1 AND e.criado_por = $2
      GROUP BY e.id
      ORDER BY e.nome ASC
    `
    const result = await query(sql, [orgId, userId])
    return result
  }

  /**
   * Cria uma nova equipe e retorna o registro inserido.
   *
   * @param orgId     Organização responsável pela equipe
   * @param nome      Nome da equipe
   * @param descricao Descrição opcional
   * @param criadoPor Identificador do usuário que está criando
   */
  static async create(orgId: string, nome: string, descricao: string | undefined, criadoPor: string) {
    const sql = `
      INSERT INTO equipes (org_id, nome, descricao, criado_por)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `
    const equipe = await queryOne(sql, [orgId, nome.trim(), descricao || null, criadoPor])
    return equipe
  }

  /**
   * Lista os membros de uma equipe. Retorna informações básicas de cada
   * membro, incluindo quantidade de tarefas pendentes e concluídas. A
   * contagem de tarefas é feita com base no org_id fornecido para que
   * apenas tarefas daquela organização sejam consideradas.
   *
   * @param orgId   Organização
   * @param equipeId Equipe
   */
  static async members(orgId: string, equipeId: string) {
    const sql = `
      SELECT p.id, p.nome, p.email, p.role, p.avatar_url,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'concluida' AND t.responsavel_id = p.id) AS tarefas_pendentes,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'concluida'   AND t.responsavel_id = p.id) AS tarefas_concluidas
      FROM equipes_membros em
      JOIN profiles p ON p.id = em.profile_id
      LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = $1
      WHERE em.equipe_id = $2
      GROUP BY p.id
      ORDER BY p.nome ASC
    `
    const membros = await query(sql, [orgId, equipeId])
    return membros
  }

  /**
   * Adiciona uma lista de membros a uma equipe. Aceita um array de IDs
   * (UUIDs) de perfis e insere cada par (equipe_id, profile_id). Caso
   * alguma combinação já exista, ela é ignorada via ON CONFLICT DO
   * NOTHING. O método retorna void.
   *
   * @param equipeId Identificador da equipe
   * @param memberIds Lista de IDs de perfis
   */
  static async addMembers(equipeId: string, memberIds: string[]) {
    if (!memberIds || memberIds.length === 0) return
    // Constrói um array de valores para inserção. O PostgreSQL permite
    // inserir múltiplas linhas com syntaxe VALUES. Usamos ON CONFLICT
    // para evitar duplicidades na chave composta (equipe_id, profile_id).
    const values: string[] = []
    const params: any[] = []
    memberIds.forEach((id, idx) => {
      values.push(`($1, $${idx + 2})`)
      params.push(id)
    })
    const sql = `
      INSERT INTO equipes_membros (equipe_id, profile_id)
      VALUES ${values.join(',')}
      ON CONFLICT DO NOTHING
    `
    await query(sql, [equipeId, ...params])
  }

  /**
   * Valida se um usuário pode ser membro de uma equipe do gestor.
   * Apenas perfis da mesma organização criados pelo gestor são permitidos.
   */
  static async validateMember(orgId: string, gestorId: string, memberId: string): Promise<boolean> {
    const sql = `SELECT 1
                 FROM profiles
                 WHERE id = $1 AND org_id = $2 AND criado_por = $3 AND ativo = TRUE`;
    const result = await queryOne(sql, [memberId, orgId, gestorId]);
    return !!result;
  }
}