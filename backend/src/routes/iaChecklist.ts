import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { gerarSugestaoChecklist } from '../services/geminiService'

const router = Router()
router.use(authMiddleware)

router.post('/ia-checklist', async (req, res) => {
  const titulo = String(req.body?.titulo || '').trim().slice(0, 240)
  const descricao = String(req.body?.descricao || '').trim().slice(0, 1800)
  if (!titulo) return res.status(400).json({ error: 'Informe o título da tarefa para sugerir um checklist.' })

  const result = await gerarSugestaoChecklist({ titulo, descricao })
  if (!result.itens.length) {
    return res.status(result.enabled ? 502 : 503).json({
      error: result.erro || 'Não foi possível gerar uma sugestão agora.',
      available: result.enabled,
    })
  }
  return res.json({ itens: result.itens, provider: result.provider, model: result.model })
})

export default router
