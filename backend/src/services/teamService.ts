import { Request } from 'express'
import { TeamRepository } from '../repositories/teamRepository'

function isGestao(role?: string): boolean {
  return role === 'admin' || role === 'dev' || role === 'gestor' || role === 'sub_gestor'
}

function isDonoGestao(role?: string): boolean {
  return role === 'admin' || role === 'dev' || role === 'gestor'
}

export class TeamService {
  static async listTeams(req: Request) {
    const { orgId, userId, role } = req.user!
    if (!isGestao(role)) throw new Error('Acesso restrito para gerenciar equipes.')
    return TeamRepository.list(orgId, isDonoGestao(role) ? null : userId)
  }

  static async createTeam(req: Request, nome: string, descricao?: string) {
    const { orgId, userId, role } = req.user!
    if (!isGestao(role)) throw new Error('Acesso restrito para criar equipes.')
    return TeamRepository.create(orgId, nome, descricao, userId)
  }

  static async getTeam(req: Request, equipeId: string) {
    const { orgId, userId, role } = req.user!
    if (!isGestao(role)) throw new Error('Acesso restrito para visualizar equipes.')
    return TeamRepository.detail(orgId, isDonoGestao(role) ? null : userId, equipeId)
  }

  static async updateTeam(req: Request, equipeId: string, data: { nome?: string; descricao?: string | null }) {
    const { orgId, userId, role } = req.user!
    if (!isGestao(role)) throw new Error('Acesso restrito para editar equipes.')
    return TeamRepository.update(orgId, isDonoGestao(role) ? null : userId, equipeId, data)
  }

  static async getMembers(req: Request, equipeId: string) {
    const { orgId, userId, role } = req.user!
    if (!isGestao(role)) throw new Error('Acesso restrito para visualizar membros da equipe.')
    const ownerFilter = isDonoGestao(role) ? null : userId
    const team = await TeamRepository.detail(orgId, ownerFilter, equipeId)
    if (!team) throw new Error('Equipe não encontrada ou sem permissão.')
    return TeamRepository.members(orgId, ownerFilter, equipeId, userId)
  }

  static async addMembers(req: Request, equipeId: string, members: Array<string | { user_id: string; role_na_equipe?: string }>) {
    const { orgId, userId, role } = req.user!
    if (!isGestao(role)) throw new Error('Acesso restrito para adicionar membros à equipe.')
    const ownerFilter = isDonoGestao(role) ? null : userId
    const team = await TeamRepository.detail(orgId, ownerFilter, equipeId)
    if (!team) throw new Error('Equipe não encontrada ou sem permissão.')
    const validMembers: { user_id: string; role_na_equipe: string }[] = []
    for (const item of members) {
      const user_id = typeof item === 'string' ? item : item.user_id
      const role_na_equipe = typeof item === 'string' ? 'membro' : (item.role_na_equipe || 'membro')
      if (!['membro','sub_gestor','gestor'].includes(role_na_equipe)) continue
      if (await TeamRepository.validateMember(orgId, userId, user_id, isDonoGestao(role))) {
        validMembers.push({ user_id, role_na_equipe })
      }
    }
    if (validMembers.length > 0) await TeamRepository.addMembers(orgId, equipeId, validMembers, userId)
  }

  static async removeMember(req: Request, equipeId: string, memberId: string) {
    const { orgId, userId, role } = req.user!
    if (!isGestao(role)) throw new Error('Acesso restrito para remover membros da equipe.')
    return TeamRepository.removeMember(orgId, isDonoGestao(role) ? null : userId, equipeId, memberId)
  }
}
