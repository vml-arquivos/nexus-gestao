import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import { TeamService } from '../services/teamService'

const router = Router()

// Aplica autenticação a todas as rotas de equipes
router.use(authMiddleware)

// ── LISTAR EQUIPES ────────────────────────────────────────────────────────
// GET /api/teams
router.get('/', gestorOnly, async (req: Request, res: Response) => {
  try {
    const equipes = await TeamService.listTeams(req)
    res.json({ equipes })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar equipes:', err)
    res.status(500).json({ error: 'Erro ao listar equipes.' })
  }
})

// ── CRIAR EQUIPE ─────────────────────────────────────────────────────────-
// POST /api/teams
router.post('/', gestorOnly, async (req: Request, res: Response) => {
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

// ── LISTAR MEMBROS DA EQUIPE ─────────────────────────────────────────────
// GET /api/teams/:id/members
router.get('/:id/members', gestorOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const membros = await TeamService.getMembers(req, id)
    res.json({ membros })
  } catch (err) {
    console.error('[TEAMS] Erro ao listar membros da equipe:', err)
    res.status(500).json({ error: 'Erro ao listar membros da equipe.' })
  }
})

// ── ADICIONAR MEMBROS À EQUIPE ───────────────────────────────────────────
// POST /api/teams/:id/members  body: { members: [profileId] }
router.post('/:id/members', gestorOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { members } = req.body
    if (!Array.isArray(members) || members.some(m => typeof m !== 'string')) {
      res.status(400).json({ error: 'Lista de membros inválida.' })
      return
    }
    await TeamService.addMembers(req, id, members)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TEAMS] Erro ao adicionar membros à equipe:', err)
    res.status(500).json({ error: 'Erro ao adicionar membros à equipe.' })
  }
})

export default router