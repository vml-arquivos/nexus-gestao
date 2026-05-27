import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import { TeamService } from '../services/teamService'

const router = Router()
router.use(authMiddleware)

router.get('/', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const equipes = await TeamService.listTeams(req)
    res.json({ equipes })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar equipes:', err)
    res.status(500).json({ error: 'Erro ao listar equipes.' })
  }
})

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
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao criar equipe.' })
  }
})

router.get('/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const equipe = await TeamService.getTeam(req, req.params.id)
    if (!equipe) { res.status(404).json({ error: 'Equipe não encontrada.' }); return }
    res.json({ equipe })
  } catch (err) {
    console.error('[TEAMS] Erro ao buscar equipe:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao buscar equipe.' })
  }
})

router.patch('/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const equipe = await TeamService.updateTeam(req, req.params.id, {
      nome: req.body.nome,
      descricao: req.body.descricao,
    })
    if (!equipe) { res.status(404).json({ error: 'Equipe não encontrada ou nenhum campo para atualizar.' }); return }
    res.json({ equipe })
  } catch (err) {
    console.error('[TEAMS] Erro ao atualizar equipe:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao atualizar equipe.' })
  }
})

router.get('/:id/members', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const membros = await TeamService.getMembers(req, req.params.id)
    res.json({ membros })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar membros da equipe:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao listar membros da equipe.' })
  }
})

router.post('/:id/members', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const members = Array.isArray(req.body.members) ? req.body.members : (req.body.user_id ? [req.body.user_id] : [])
    if (!Array.isArray(members) || members.some((m: unknown) => typeof m !== 'string')) {
      res.status(400).json({ error: 'Lista de membros inválida.' })
      return
    }
    await TeamService.addMembers(req, req.params.id, members)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TEAMS] Erro ao adicionar membros:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao adicionar membros.' })
  }
})

router.delete('/:id/members/:userId', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const removed = await TeamService.removeMember(req, req.params.id, req.params.userId)
    if (!removed) { res.status(404).json({ error: 'Membro não encontrado na equipe.' }); return }
    res.json({ ok: true })
  } catch (err) {
    console.error('[TEAMS] Erro ao remover membro:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao remover membro.' })
  }
})

export default router
