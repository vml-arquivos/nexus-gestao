import { Request } from 'express'
import { TeamRepository } from '../repositories/teamRepository'

export class TeamService {
  static async listTeams(req: Request) {
    const { orgId, userId } = req.user!
    return TeamRepository.list(orgId, userId)
  }

  static async createTeam(req: Request, nome: string, descricao?: string) {
    const { orgId, userId, role } = req.user!
    if (!['admin','dev','gestor'].includes(role)) throw new Error('Apenas admin, dev ou gestores podem criar equipes.')
    return TeamRepository.create(orgId, nome, descricao, userId)
  }

  static async getTeam(req: Request, equipeId: string) {
    const { orgId, userId, role } = req.user!
    if (!['admin','dev','gestor'].includes(role)) throw new Error('Apenas admin, dev ou gestores podem visualizar equipes.')
    return TeamRepository.detail(orgId, userId, equipeId)
  }

  static async updateTeam(req: Request, equipeId: string, data: { nome?: string; descricao?: string | null }) {
    const { orgId, userId, role } = req.user!
    if (!['admin','dev','gestor'].includes(role)) throw new Error('Apenas admin, dev ou gestores podem editar equipes.')
    return TeamRepository.update(orgId, userId, equipeId, data)
  }

  static async getMembers(req: Request, equipeId: string) {
    const { orgId, userId, role } = req.user!
    if (!['admin','dev','gestor'].includes(role)) throw new Error('Apenas admin, dev ou gestores podem visualizar membros da equipe.')
    const team = await TeamRepository.detail(orgId, userId, equipeId)
    if (!team) throw new Error('Equipe não encontrada ou sem permissão.')
    return TeamRepository.members(orgId, userId, equipeId)
  }

  static async addMembers(req: Request, equipeId: string, memberIds: string[]) {
    const { orgId, userId, role } = req.user!
    if (!['admin','dev','gestor'].includes(role)) throw new Error('Apenas admin, dev ou gestores podem adicionar membros à equipe.')
    const team = await TeamRepository.detail(orgId, userId, equipeId)
    if (!team) throw new Error('Equipe não encontrada ou sem permissão.')
    const validMembers: string[] = []
    for (const m of memberIds) {
      if (await TeamRepository.validateMember(orgId, userId, m)) validMembers.push(m)
    }
    if (validMembers.length > 0) await TeamRepository.addMembers(orgId, equipeId, validMembers, userId)
  }

  static async removeMember(req: Request, equipeId: string, memberId: string) {
    const { orgId, userId, role } = req.user!
    if (!['admin','dev','gestor'].includes(role)) throw new Error('Apenas admin, dev ou gestores podem remover membros da equipe.')
    return TeamRepository.removeMember(orgId, userId, equipeId, memberId)
  }
}
