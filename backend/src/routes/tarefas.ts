import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware, gestorOnly } from '../middleware/auth'
// Importa TaskService para delegar regras de negócio
import { TaskService } from '../services/taskService'

const router = Router()
router.use(authMiddleware)

// ── LISTAR TAREFAS ────────────────────────────────────────────────────────────
// GET /api/tarefas
// Gestor: vê todas da organização
// Membro: vê apenas as atribuídas a ele
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { status, prioridade, responsavel_id } = req.query
    const filtros = {
      status: typeof status === 'string' ? status : undefined,
      prioridade: typeof prioridade === 'string' ? prioridade : undefined,
      responsavel_id: typeof responsavel_id === 'string' ? responsavel_id : undefined,
    }
    const tarefas = await TaskService.listTasks(orgId, userId, role, filtros)
    res.json({ tarefas })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefas.' })
  }
})

// ── CRIAR TAREFA ──────────────────────────────────────────────────────────────
// POST /api/tarefas  (somente gestor)
router.post('/', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { titulo } = req.body
    if (!titulo?.trim()) {
      res.status(400).json({ error: 'Título é obrigatório.' })
      return
    }
    const tarefa = await TaskService.createTask(orgId, userId, req.body)
    res.status(201).json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa.' })
  }
})

// ── ATUALIZAR TAREFA ──────────────────────────────────────────────────────────
// PATCH /api/tarefas/:id
// Gestor: pode alterar tudo
// Membro: pode alterar apenas status e checklist das suas tarefas
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const tarefa = await TaskService.updateTask(orgId, userId, role, id, req.body)
    res.json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' })
  }
})

// ── EXCLUIR TAREFA ────────────────────────────────────────────────────────────
// DELETE /api/tarefas/:id  (somente gestor)
router.delete('/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const { id } = req.params
    const result = await TaskService.deleteTask(orgId, id)
    res.json(result)
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir tarefa.' })
  }
})

// ── DASHBOARD DE TAREFAS ──────────────────────────────────────────────────────
// GET /api/tarefas/stats
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const stats = await TaskService.getStats(orgId, userId, role)
    res.json({ stats })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar stats:', err)
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' })
  }
})

export default router
