import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import { TeamService } from '../services/teamService'
import { TeamRepository } from '../repositories/teamRepository'

const router = Router()
router.use(authMiddleware)

// GET /api/teams — lista equipes da organização
router.get('/', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const equipes = await TeamService.listTeams(req)
    res.json({ equipes })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar equipes:', err)
    res.status(500).json({ error: 'Erro ao listar equipes.' })
  }
})

// POST /api/teams — criar equipe
router.post('/', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, descricao } = req.body
    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      res.status(400).json({ error: 'Nome da equipe é obrigatório.' })
      return
    }
    const equipe = await TeamService.createTeam(req, nome, descricao)
    res.status(201).json({ equipe })
  } catch (err) {
    console.error('[TEAMS] Erro ao criar equipe:', err)
    res.status(500).json({ error: 'Erro ao criar equipe.' })
  }
})

// GET /api/teams/:id/members — listar membros de uma equipe
router.get('/:id/members', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const membros = await TeamService.getMembers(req, req.params.id)
    res.json({ membros })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar membros:', err)
    res.status(500).json({ error: 'Erro ao listar membros da equipe.' })
  }
})

// POST /api/teams/:id/members — adicionar membros
router.post('/:id/members', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { members } = req.body
    if (!Array.isArray(members) || members.some((m: unknown) => typeof m !== 'string')) {
      res.status(400).json({ error: 'Lista de membros inválida.' })
      return
    }
    await TeamService.addMembers(req, req.params.id, members)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TEAMS] Erro ao adicionar membros:', err)
    res.status(500).json({ error: 'Erro ao adicionar membros à equipe.' })
  }
})

// DELETE /api/teams/:id/members/:profileId — remover membro
router.delete('/:id/members/:profileId', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    await TeamRepository.removeMember(req.params.id, req.params.profileId)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TEAMS] Erro ao remover membro:', err)
    res.status(500).json({ error: 'Erro ao remover membro.' })
  }
})

// DELETE /api/teams/:id — deletar equipe
router.delete('/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    await TeamRepository.delete(orgId, req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TEAMS] Erro ao deletar equipe:', err)
    res.status(500).json({ error: 'Erro ao deletar equipe.' })
  }
})

export default router
