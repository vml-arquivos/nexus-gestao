import { Request } from 'express'
import { TeamRepository } from '../repositories/teamRepository'

/**
 * Serviço de equipes. Fornece métodos de alto nível para manipular
 * conjuntos de equipes e seus membros. Ele recebe o objeto Request
 * para extrair informações de autenticação (orgId, user.id, role) e
 * delega as operações ao TeamRepository.
 */
export class TeamService {
  /**
   * Lista todas as equipes da organização do usuário.
   */
  static async listTeams(req: Request) {
    const { orgId } = req.user!
    return TeamRepository.list(orgId)
  }

  /**
   * Cria uma nova equipe. Somente gestores podem criar equipes. A
   * restrição de permissão deve ser aplicada nas rotas via
   * middleware, mas esta verificação extra é feita por segurança.
   */
  static async createTeam(req: Request, nome: string, descricao?: string) {
    const { orgId, id: userId, role } = req.user!
    if (role !== 'gestor') {
      throw new Error('Apenas gestores podem criar equipes.')
    }
    return TeamRepository.create(orgId, nome, descricao, userId)
  }

  /**
   * Obtém os membros de uma equipe específica. Somente gestores
   * podem visualizar membros de qualquer equipe. Outros usuários
   * poderiam ver apenas equipes das quais participam (a lógica não
   * foi implementada nesta versão). O método recebe o ID da equipe
   * como parâmetro de rota.
   */
  static async getMembers(req: Request, equipeId: string) {
    const { orgId, role } = req.user!
    if (role !== 'gestor') {
      throw new Error('Apenas gestores podem visualizar membros da equipe.')
    }
    return TeamRepository.members(orgId, equipeId)
  }

  /**
   * Adiciona uma lista de usuários a uma equipe. Somente gestores
   * podem adicionar membros. Se nenhum membro for enviado, nada
   * acontece. Após a operação, não há retorno específico.
   */
  static async addMembers(req: Request, equipeId: string, memberIds: string[]) {
    const { role } = req.user!
    if (role !== 'gestor') {
      throw new Error('Apenas gestores podem adicionar membros à equipe.')
    }
    await TeamRepository.addMembers(equipeId, memberIds)
  }
}