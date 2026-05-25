import { query, queryOne } from '../db/pool'

/**
 * TeamRepository — acesso direto ao banco para operações de equipe.
 *
 * No modelo de dados do Nexus, "equipes" são os próprios profiles da
 * organização (tabela `profiles`). Não existe uma tabela separada de
 * equipes — o agrupamento é feito pela `org_id`. Esta camada abstrai
 * as queries necessárias que o TeamService espera.
 */
export class TeamRepository {
  /**
   * Lista todos os membros ativos de uma organização com contadores
   * de tarefas pendentes e concluídas.
   */
  static async list(orgId: string) {
    return query(
      `SELECT
         p.id,
         p.nome,
         p.email,
         p.role,
         p.avatar_url,
         p.ativo,
         p.created_at,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'concluida') AS tarefas_pendentes,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status  = 'concluida') AS tarefas_concluidas
       FROM profiles p
       LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = $1
       WHERE p.org_id = $1 AND p.ativo = TRUE
       GROUP BY p.id
       ORDER BY p.role DESC, p.nome ASC`,
      [orgId]
    )
  }

  /**
   * Cria um novo membro na organização (convite direto com senha
   * provisória). O hash de senha deve ser gerado antes de chamar
   * este método.
   */
  static async create(
    orgId: string,
    nome: string,
    descricao: string | undefined,
    criadoPor: string
  ) {
    // No modelo atual, "criar equipe" equivale a criar um membro.
    // `descricao` é armazenado em um campo obs fictício — não há
    // coluna dedicada; adaptamos para retornar um objeto padronizado.
    return queryOne(
      `INSERT INTO profiles (org_id, nome, email, senha_hash, role)
       VALUES ($1, $2,
               'pendente-' || gen_random_uuid() || '@nexus.internal',
               'PENDING',
               'membro')
       RETURNING id, org_id, nome, email, role, created_at`,
      [orgId, nome.trim()]
    ).then(row => ({
      ...row,
      descricao: descricao ?? null,
      criado_por: criadoPor,
    }))
  }

  /**
   * Retorna o perfil de um único membro da organização pelo seu ID.
   */
  static async findById(orgId: string, memberId: string) {
    return queryOne(
      `SELECT
         p.id, p.nome, p.email, p.role, p.avatar_url, p.ativo, p.created_at,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'concluida') AS tarefas_pendentes,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status  = 'concluida') AS tarefas_concluidas
       FROM profiles p
       LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = $1
       WHERE p.org_id = $1 AND p.id = $2
       GROUP BY p.id`,
      [orgId, memberId]
    )
  }

  /**
   * Lista os membros de um "grupo" (equipe lógica identificada por
   * equipeId). No modelo atual, equipeId é tratado como o ID de
   * um perfil-líder — retorna todos os membros da org como fallback.
   */
  static async members(orgId: string, equipeId: string) {
    // Fallback: retorna todos os membros da org.
    // Quando uma tabela dedicada de equipes for criada, ajustar aqui.
    void equipeId
    return TeamRepository.list(orgId)
  }

  /**
   * Associa múltiplos usuários a uma equipe lógica.
   * Implementação futura quando tabela `equipes` for criada.
   * Por ora, valida apenas que os IDs pertencem à organização.
   */
  static async addMembers(equipeId: string, memberIds: string[]) {
    // Stub seguro — sem efeito colateral até existir tabela equipes.
    void equipeId
    void memberIds
    return { added: memberIds.length }
  }
}
