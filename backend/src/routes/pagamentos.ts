import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
// Importa PaymentService para delegar listagem, resumo e agregações por pessoa.
import { PaymentService } from '../services/paymentService'

const router = Router()
router.use(authMiddleware)

const RECORRENCIAS = ['nenhum', 'semanal', 'quinzenal', 'mensal', 'anual'] as const

type Recorrencia = typeof RECORRENCIAS[number]

function isRecorrencia(v: unknown): v is Recorrencia {
  return typeof v === 'string' && (RECORRENCIAS as readonly string[]).includes(v)
}

function normalizeDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue
    const date = item.trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (seen.has(date)) continue
    seen.add(date)
    out.push(date)
  }

  return out.sort()
}

function addRecurrenceDate(base: Date, recorrencia: Recorrencia) {
  switch (recorrencia) {
    case 'semanal':
      base.setDate(base.getDate() + 7)
      break
    case 'quinzenal':
      base.setDate(base.getDate() + 14)
      break
    case 'mensal':
      base.setMonth(base.getMonth() + 1)
      break
    case 'anual':
      base.setFullYear(base.getFullYear() + 1)
      break
  }
}

function buildRecurringDates(vencimento: string | undefined, recorrencia: Recorrencia, recorrenciaFim?: string): string[] {
  if (!vencimento || recorrencia === 'nenhum') return []

  const current = new Date(`${vencimento}T00:00:00`)
  const limitDate = recorrenciaFim
    ? new Date(`${recorrenciaFim}T00:00:00`)
    : (() => {
        const d = new Date(current)
        switch (recorrencia) {
          case 'semanal':
            d.setDate(d.getDate() + 7 * 11)
            break
          case 'quinzenal':
            d.setDate(d.getDate() + 14 * 11)
            break
          case 'mensal':
            d.setMonth(d.getMonth() + 11)
            break
          case 'anual':
            d.setFullYear(d.getFullYear() + 11)
            break
        }
        return d
      })()

  const dates: string[] = []
  while (true) {
    addRecurrenceDate(current, recorrencia)
    if (current > limitDate) break
    dates.push(current.toISOString().slice(0, 10))
    if (dates.length >= 120) break
  }

  return dates
}

// GET /api/pagamentos
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const { tipo, status, pessoa_id, vencidos } = req.query
    // Prepara filtros tipados apenas com strings
    const filtros = {
      tipo: typeof tipo === 'string' ? tipo : undefined,
      status: typeof status === 'string' ? status : undefined,
      pessoa_id: typeof pessoa_id === 'string' ? pessoa_id : undefined,
      vencidos: typeof vencidos === 'string' ? vencidos : undefined,
    }
    // Delegar ao service para listagem. O service se encarrega de consultar o repositório.
    const pagamentos = await PaymentService.listPayments(orgId, filtros)
    res.json({ pagamentos })
  } catch (err) {
    console.error('[PAG] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar pagamentos.' })
  }
})

// GET /api/pagamentos/resumo
router.get('/resumo', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    // Delegar ao serviço para cálculo do resumo financeiro
    const resumo = await PaymentService.getResumo(orgId)
    res.json({ resumo })
  } catch (err) {
    console.error('[PAG] Erro ao buscar resumo:', err)
    res.status(500).json({ error: 'Erro ao buscar resumo financeiro.' })
  }
})

// GET /api/pagamentos/por-pessoa — visão bidirecional por pessoa
router.get('/por-pessoa', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    // Utiliza o serviço para obter agregações por pessoa
    const rows = await PaymentService.getPorPessoa(orgId)
    // Converte campos numéricos de string para number, mantendo compatibilidade
    const por_pessoa = (rows as any[]).map((r) => ({
      pessoa_id: r.pessoa_id,
      pessoa_nome: r.pessoa_nome,
      devo: Number(r.devo || 0),
      me_devem: Number(r.me_devem || 0),
      devo_pendente: Number(r.devo_pendente || 0),
      me_devem_pendente: Number(r.me_devem_pendente || 0),
      devo_pago: Number(r.devo_pago || 0),
      me_devem_pago: Number(r.me_devem_pago || 0),
      total_lancamentos: Number(r.total_lancamentos || 0),
    }))
    res.json({ por_pessoa })
  } catch (err) {
    console.error('[PAG] Erro por-pessoa:', err)
    res.status(500).json({ error: 'Erro ao calcular por pessoa.' })
  }
})

// POST /api/pagamentos
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const {
      titulo,
      descricao,
      valor,
      tipo,
      status = 'pendente',
      vencimento,
      pago_em,
      pessoa_id,
      pessoa_nome,
      categoria,
      comprovante_url,
      obs,
      recorrencia = 'nenhum',
      recorrencia_fim,
      datas_personalizadas,
    } = req.body

    if (!titulo?.trim()) {
      res.status(400).json({ error: 'Título é obrigatório.' })
      return
    }

    if (!valor || isNaN(parseFloat(String(valor)))) {
      res.status(400).json({ error: 'Valor inválido.' })
      return
    }

    if (!['pagamento', 'recebimento'].includes(tipo)) {
      res.status(400).json({ error: 'Tipo inválido.' })
      return
    }

    if (!isRecorrencia(recorrencia)) {
      res.status(400).json({ error: 'Recorrência inválida.' })
      return
    }

    const customDates = normalizeDateList(datas_personalizadas)
    const mainVencimento = vencimento || customDates[0] || null

    const pag = await queryOne(
      `INSERT INTO pagamentos (
         org_id,
         criado_por,
         titulo,
         descricao,
         valor,
         tipo,
         status,
         vencimento,
         pago_em,
         pessoa_id,
         pessoa_nome,
         categoria,
         comprovante_url,
         obs,
         recorrencia,
         recorrencia_fim
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        orgId,
        userId,
        titulo.trim(),
        descricao || null,
        parseFloat(String(valor)),
        tipo,
        status,
        mainVencimento,
        pago_em || null,
        pessoa_id || null,
        pessoa_nome || null,
        categoria || null,
        comprovante_url || null,
        obs || null,
        recorrencia,
        recorrencia_fim || null,
      ]
    )

    const generatedDates = new Set<string>()

    for (const date of customDates) {
      if (date !== mainVencimento) generatedDates.add(date)
    }

    for (const date of buildRecurringDates(mainVencimento || undefined, recorrencia, recorrencia_fim || undefined)) {
      if (date !== mainVencimento) generatedDates.add(date)
    }

    for (const venc of Array.from(generatedDates).sort()) {
      await queryOne(
        `INSERT INTO pagamentos (
           org_id,
           criado_por,
           titulo,
           descricao,
           valor,
           tipo,
           status,
           vencimento,
           pessoa_id,
           pessoa_nome,
           categoria,
           comprovante_url,
           obs,
           recorrencia
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nenhum')
         RETURNING id`,
        [
          orgId,
          userId,
          titulo.trim(),
          descricao || null,
          parseFloat(String(valor)),
          tipo,
          status,
          venc,
          pessoa_id || null,
          pessoa_nome || null,
          categoria || null,
          comprovante_url || null,
          obs || null,
        ]
      )
    }

    res.status(201).json({ pagamento: pag })
  } catch (err) {
    console.error('[PAG] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar pagamento.' })
  }
})

// PATCH /api/pagamentos/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!

    const allowed = [
      'titulo',
      'descricao',
      'valor',
      'tipo',
      'status',
      'vencimento',
      'pago_em',
      'pessoa_id',
      'pessoa_nome',
      'categoria',
      'comprovante_url',
      'obs',
      'recorrencia',
      'recorrencia_fim',
    ]

    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`)
        params.push(req.body[key] === '' ? null : req.body[key])
      }
    }

    if (req.body.status === 'pago' && !req.body.pago_em) {
      sets.push(`pago_em = $${idx++}`)
      params.push(new Date().toISOString())
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar.' })
      return
    }

    sets.push(`updated_at = NOW()`)

    params.push(req.params.id, orgId)

    const pag = await queryOne(
      `UPDATE pagamentos
       SET ${sets.join(', ')}
       WHERE id = $${idx++}
         AND org_id = $${idx}
       RETURNING *`,
      params
    )

    if (!pag) {
      res.status(404).json({ error: 'Pagamento não encontrado.' })
      return
    }

    res.json({ pagamento: pag })
  } catch (err) {
    console.error('[PAG] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar pagamento.' })
  }
})

// DELETE /api/pagamentos/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    await query('DELETE FROM pagamentos WHERE id=$1 AND org_id=$2', [req.params.id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[PAG] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir pagamento.' })
  }
})

export default router
