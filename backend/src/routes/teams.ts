import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import { TeamService } from '../services/teamService'

/**
 * Rota /api/teams
 *
 * O frontend chama /api/teams. Este router conecta os endpoints ao
 * TeamService → TeamRepository → PostgreSQL.
 *
 * Registrar em index.ts:
 *   import teamsRoutes from './routes/teams'
 *   app.use('/api/teams', teamsRoutes)
 */
const router = Router()
router.use(authMiddleware)

// GET /api/teams — lista membros da organização
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const membros = await TeamService.listTeams(req)
    res.json({ equipes: membros, membros })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao listar equipes.' })
  }
})

// GET /api/teams/:id — detalhe de um membro/grupo
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const membros = await TeamService.getMembers(req, req.params.id)
    res.json({ membros })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao buscar equipe.'
    res.status(403).json({ error: msg })
  }
})

// POST /api/teams — criar equipe (somente gestor)
router.post('/', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, descricao } = req.body
    if (!nome?.trim()) {
      res.status(400).json({ error: 'Nome é obrigatório.' })
      return
    }
    const equipe = await TeamService.createTeam(req, nome.trim(), descricao)
    res.status(201).json({ equipe })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao criar equipe.'
    console.error('[TEAMS] Erro ao criar:', err)
    res.status(500).json({ error: msg })
  }
})

// POST /api/teams/:id/members — adicionar membros (somente gestor)
router.post('/:id/members', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { memberIds } = req.body
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ error: 'memberIds deve ser um array não vazio.' })
      return
    }
    await TeamService.addMembers(req, req.params.id, memberIds)
    res.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao adicionar membros.'
    res.status(500).json({ error: msg })
  }
})

export default router
