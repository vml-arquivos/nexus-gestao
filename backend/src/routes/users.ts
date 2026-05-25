import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { UserService } from '../services/userService'

const router = Router()
router.use(authMiddleware)

// ── LISTAR USUÁRIOS ────────────────────────────────────────────────────────
// GET /api/users
// Retorna os usuários da mesma organização. Sub-gestores e gestores podem ver todos; membros veem apenas a si mesmos.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Apenas sub-gestores e gestores podem listar todos os usuários; membros veem só o próprio perfil
    const { role, userId } = req.user!
    const users = await UserService.listUsers(req)
    const filtered = role === 'membro' ? users.filter(u => u.id === userId) : users
    res.json({ users: filtered })
  } catch (err) {
    console.error('[USERS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao listar usuários.' })
  }
})

// ── CRIAR USUÁRIO ─────────────────────────────────────────────────────────
// POST /api/users
// Apenas gestores ou sub-gestores podem criar usuários. Sub-gestores não criam outros sub-gestores ou gestores.
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, email, role, senha } = req.body
    if (!nome?.trim() || !email?.trim() || !role) {
      res.status(400).json({ error: 'Nome, e-mail e role são obrigatórios.' })
      return
    }
    const result = await UserService.createUser(req, nome.trim(), email.trim(), role, senha)
    res.status(201).json(result)
  } catch (err: any) {
    console.error('[USERS] Erro ao criar:', err)
    res.status(400).json({ error: err.message || 'Erro ao criar usuário.' })
  }
})

export default router