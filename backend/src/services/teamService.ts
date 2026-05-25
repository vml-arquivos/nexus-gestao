import TeamRepository from '../repositories/teamRepository'

// ── TeamService ─────────────────────────────────────────────────────
// Camada de negócios para operações de equipes. Aqui podemos adicionar
// validações, regras de permissão e lógica adicional (como criar tarefas
// para todos os membros da equipe). Atualmente delega ao TeamRepository.

export const TeamService = {
  listTeams: TeamRepository.list,
  createTeam: TeamRepository.create,
  addMembers: TeamRepository.addMembers,
  getMembers: TeamRepository.members,
}

export default TeamService