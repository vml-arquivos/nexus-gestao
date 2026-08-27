import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  canEditUserRule,
  createUserRule,
  deactivateUserRule,
  getUserRule,
  listUserRuleAudit,
  listUserRules,
  normalizeUserRuleInput,
  updateUserRule,
  userRuleCatalog,
} from '../services/automation/userRules'

const router = Router()
router.use(authMiddleware)

function canManageRules(req: Request): boolean {
  return Boolean(req.user)
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageRules(req)) { res.status(401).json({ error: 'Não autenticado.' }); return }
    const regras = await listUserRules(req.user!.orgId, req.user!.userId, req.user!.role)
    res.json({ regras })
  } catch (err) {
    console.error('[AUTOMATION-RULES] Erro ao listar regras:', err)
    res.status(500).json({ error: 'Erro ao listar regras de automação.' })
  }
})

router.get('/catalogo', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageRules(req)) { res.status(401).json({ error: 'Não autenticado.' }); return }
    res.json(await userRuleCatalog(req.user!.orgId))
  } catch (err) {
    console.error('[AUTOMATION-RULES] Erro ao carregar catálogo:', err)
    res.status(500).json({ error: 'Erro ao carregar catálogo de automação.' })
  }
})

router.get('/auditoria', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageRules(req)) { res.status(401).json({ error: 'Não autenticado.' }); return }
    const auditoria = await listUserRuleAudit(req.user!.orgId, Number(req.query.limit || 50))
    res.json({ auditoria })
  } catch (err) {
    console.error('[AUTOMATION-RULES] Erro ao listar auditoria:', err)
    res.status(500).json({ error: 'Erro ao listar auditoria das regras.' })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageRules(req)) { res.status(401).json({ error: 'Não autenticado.' }); return }
    const regra = await createUserRule(req.user!.orgId, req.user!.userId, req.body)
    res.status(201).json({ regra })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar regra.'
    res.status(400).json({ error: message })
  }
})

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageRules(req)) { res.status(401).json({ error: 'Não autenticado.' }); return }
    const current = await getUserRule(req.user!.orgId, req.params.id)
    if (!current) { res.status(404).json({ error: 'Regra não encontrada.' }); return }
    if (!(await canEditUserRule(current, req.user!.userId, req.user!.role))) { res.status(403).json({ error: 'Você não pode editar esta regra.' }); return }
    const regra = await updateUserRule(req.user!.orgId, req.params.id, req.body)
    if (!regra) { res.status(404).json({ error: 'Regra não encontrada.' }); return }
    res.json({ regra })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar regra.'
    res.status(400).json({ error: message })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageRules(req)) { res.status(401).json({ error: 'Não autenticado.' }); return }
    const current = await getUserRule(req.user!.orgId, req.params.id)
    if (!current) { res.status(404).json({ error: 'Regra não encontrada.' }); return }
    if (!(await canEditUserRule(current, req.user!.userId, req.user!.role))) { res.status(403).json({ error: 'Você não pode desativar esta regra.' }); return }
    const regra = await deactivateUserRule(req.user!.orgId, req.params.id)
    res.json({ regra })
  } catch (err) {
    console.error('[AUTOMATION-RULES] Erro ao desativar regra:', err)
    res.status(500).json({ error: 'Erro ao desativar regra.' })
  }
})

export default router
