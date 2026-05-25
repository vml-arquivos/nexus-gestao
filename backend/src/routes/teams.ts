import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import TeamService from '../services/teamService'

const router = Router()

// Aplica autenticação em todas as rotas. Apenas gestores podem criar
// equipes e adicionar membros. Membros podem visualizar as equipes às quais
// pertencem via listagem global (opcional).
router.use(authMiddleware)

// GET /api/teams — lista todas as equipes da organização (gestor)
router.get('/', gestorOnly, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.user!
    const teams = await TeamService.listTeams(orgId)
    res.json({ teams })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar equipes:', err)
    res.status(500).json({ error: 'Erro ao buscar equipes.' })
  }
})

// POST /api/teams — cria uma nova equipe (gestor)
router.post('/', gestorOnly, async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = req.user!
    const { nome, descricao } = req.body
    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      res.status(400).json({ error: 'Nome da equipe é obrigatório.' })
      return
    }
    const team = await TeamService.createTeam(orgId, nome.trim(), descricao || null, userId)
    res.status(201).json({ team })
  } catch (err) {
    console.error('[TEAMS] Erro ao criar equipe:', err)
    res.status(500).json({ error: 'Erro ao criar equipe.' })
  }
})

// GET /api/teams/:id/members — lista membros de uma equipe
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const members = await TeamService.getMembers(id)
    res.json({ members })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar membros:', err)
    res.status(500).json({ error: 'Erro ao buscar membros da equipe.' })
  }
})

// POST /api/teams/:id/members — adiciona membros à equipe (gestor)
router.post('/:id/members', gestorOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { memberIds } = req.body as { memberIds: string[] }
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ error: 'memberIds deve ser um array de IDs de usuários.' })
      return
    }
    await TeamService.addMembers(id, memberIds)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TEAMS] Erro ao adicionar membros:', err)
    res.status(500).json({ error: 'Erro ao adicionar membros à equipe.' })
  }
})

export default router