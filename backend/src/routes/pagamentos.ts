import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { PaymentService } from '../services/paymentService'
import { randomUUID } from 'crypto'

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
    case 'semanal':    base.setDate(base.getDate() + 7); break
    case 'quinzenal':  base.setDate(base.getDate() + 14); break
    case 'mensal':     base.setMonth(base.getMonth() + 1); break
    case 'anual':      base.setFullYear(base.getFullYear() + 1); break
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
          case 'semanal':   d.setDate(d.getDate() + 7 * 11); break
          case 'quinzenal': d.setDate(d.getDate() + 14 * 11); break
          case 'mensal':    d.setMonth(d.getMonth() + 11); break
          case 'anual':     d.setFullYear(d.getFullYear() + 11); break
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


function normalizeDateValue(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  const parsed = new Date(value as any)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function compareNullableDates(a: unknown, b: unknown): number {
  const dateA = normalizeDateValue(a)
  const dateB = normalizeDateValue(b)

  if (!dateA && !dateB) return 0
  if (!dateA) return 1
  if (!dateB) return -1

  return dateA.localeCompare(dateB)
}


function normalizeGroupPart(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function buildNaturalGroupKey(row: any): string {
  const pessoa = row.pessoa_id || row.pessoa_nome_atual || row.pessoa_nome || 'sem-pessoa'
  const valor = Number(row.valor || 0).toFixed(2)
  return [
    'natural',
    normalizeGroupPart(row.titulo),
    normalizeGroupPart(row.tipo),
    normalizeGroupPart(row.categoria || 'sem-categoria'),
    normalizeGroupPart(pessoa),
    valor,
  ].join('|')
}

// ── GET /api/pagamentos ──────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { tipo, status, pessoa_id, vencidos } = req.query
    const filtros = {
      tipo: typeof tipo === 'string' ? tipo : undefined,
      status: typeof status === 'string' ? status : undefined,
      pessoa_id: typeof pessoa_id === 'string' ? pessoa_id : undefined,
      vencidos: typeof vencidos === 'string' ? vencidos : undefined,
    }
    const pagamentos = await PaymentService.listPayments(orgId, userId, filtros)
    res.json({ pagamentos })
  } catch (err) {
    console.error('[PAG] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar pagamentos.' })
  }
})


// ── GET /api/pagamentos/resumo ───────────────────────────────────────────────
router.get('/resumo', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const resumo = await PaymentService.getResumo(orgId, userId)
    res.json({ resumo })
  } catch (err) {
    console.error('[PAG] Erro ao buscar resumo:', err)
    res.status(500).json({ error: 'Erro ao buscar resumo financeiro.' })
  }
})


// ── GET /api/pagamentos/por-pessoa ───────────────────────────────────────────
router.get('/por-pessoa', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const rows = await PaymentService.getPorPessoa(orgId, userId)
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


// ── GET /api/pagamentos/grupos ───────────────────────────────────────────────
// Retorna um card por dívida/crédito agrupado:
//   - Lançamentos com grupo_id → um card por grupo
//   - Lançamentos sem grupo_id (avulsos) → um card cada
router.get('/grupos', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const hoje = new Date().toISOString().slice(0, 10)

    // Busca todos os pagamentos da org ordenados por vencimento
    const rows = await query(
      `SELECT
         p.*,
         COALESCE(pe.nome, p.pessoa_nome) AS pessoa_nome_atual
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.org_id = $1
         AND p.criado_por = $2
       ORDER BY p.vencimento ASC NULLS LAST, p.created_at ASC`,
      [orgId, userId]
    ) as any[]

    // Agrupa por grupo_id (para parcelados/recorrentes) ou por id (avulsos)
    const gruposMap = new Map<string, {
      grupo_id: string | null
      titulo: string
      tipo: string
      categoria: string | null
      pessoa_id: string | null
      pessoa_nome: string | null
      recorrencia: string
      parcelas: any[]
      valor_total: number
      valor_pago: number
      valor_pendente: number
      num_parcelas: number
      parcelas_pagas: number
      parcelas_pendentes: number
      proxima_parcela: string | null
      ultima_parcela: string | null
      vencido: boolean
      is_grupo: boolean
    }>()

    for (const row of rows) {
      // Registros novos possuem grupo_id. Registros antigos podem não ter.
      // Para eles, agrupamos por chave natural: título + pessoa + tipo + categoria + valor.
      const chave = row.grupo_id ? `grupo:${row.grupo_id}` : buildNaturalGroupKey(row)
      const isGrupo = !!row.grupo_id

      if (!gruposMap.has(chave)) {
        gruposMap.set(chave, {
          grupo_id: row.grupo_id || null,
          titulo: row.titulo,
          tipo: row.tipo,
          categoria: row.categoria || null,
          pessoa_id: row.pessoa_id || null,
          pessoa_nome: row.pessoa_nome_atual || row.pessoa_nome || null,
          recorrencia: row.recorrencia || 'nenhum',
          parcelas: [],
          valor_total: 0,
          valor_pago: 0,
          valor_pendente: 0,
          num_parcelas: 0,
          parcelas_pagas: 0,
          parcelas_pendentes: 0,
          proxima_parcela: null,
          ultima_parcela: null,
          vencido: false,
          is_grupo: isGrupo,
        })
      }

      const g = gruposMap.get(chave)!
      g.parcelas.push(row)
      const valor = Number(row.valor || 0)

      if (row.status !== 'cancelado') {
        g.valor_total += valor
        if (row.status === 'pago') {
          g.valor_pago += valor
          g.parcelas_pagas++
        } else if (row.status === 'pendente') {
          g.valor_pendente += valor
          g.parcelas_pendentes++
          // Próxima parcela pendente
          const vencimento = normalizeDateValue(row.vencimento)
          if (vencimento) {
            if (!g.proxima_parcela || vencimento < g.proxima_parcela) {
              g.proxima_parcela = vencimento
            }
            if (!g.ultima_parcela || vencimento > g.ultima_parcela) {
              g.ultima_parcela = vencimento
            }
            if (vencimento < hoje) g.vencido = true
          }
        }
      }
      g.num_parcelas++
    }

    // Converte para array e ordena: vencidos primeiro, depois por próxima parcela
    const grupos = Array.from(gruposMap.values()).map(g => ({
      ...g,
      parcelas: g.parcelas.sort((a: any, b: any) =>
        (a.num_parcela || 0) - (b.num_parcela || 0) ||
        compareNullableDates(a.vencimento, b.vencimento)
      ),
    }))

    grupos.sort((a, b) => {
      if (a.vencido !== b.vencido) return a.vencido ? -1 : 1
      return compareNullableDates(a.proxima_parcela, b.proxima_parcela)
    })

    res.json({ grupos })
  } catch (err) {
    console.error('[PAG] Erro ao buscar grupos:', err)
    res.status(500).json({ error: 'Erro ao buscar grupos de pagamentos.' })
  }
})


// ── GET /api/pagamentos/grupo/:grupo_id ──────────────────────────────────────
// Retorna todas as parcelas de um grupo específico
router.get('/grupo/:grupo_id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const parcelas = await query(
      `SELECT p.*, COALESCE(pe.nome, p.pessoa_nome) AS pessoa_nome_atual
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.org_id = $1 AND p.grupo_id = $2 AND p.criado_por = $3
       ORDER BY p.num_parcela ASC NULLS LAST, p.vencimento ASC`,
      [orgId, req.params.grupo_id, userId]
    )
    res.json({ parcelas })
  } catch (err) {
    console.error('[PAG] Erro ao buscar grupo:', err)
    res.status(500).json({ error: 'Erro ao buscar parcelas do grupo.' })
  }
})

// ── POST /api/pagamentos ─────────────────────────────────────────────────────
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

    if (!titulo?.trim()) { res.status(400).json({ error: 'Título é obrigatório.' }); return }
    if (!valor || isNaN(parseFloat(String(valor)))) { res.status(400).json({ error: 'Valor inválido.' }); return }
    if (!['pagamento', 'recebimento'].includes(tipo)) { res.status(400).json({ error: 'Tipo inválido.' }); return }
    if (!isRecorrencia(recorrencia)) { res.status(400).json({ error: 'Recorrência inválida.' }); return }

    const customDates = normalizeDateList(datas_personalizadas)
    const mainVencimento = vencimento || customDates[0] || null

    // Calcula todas as datas extras (recorrência ou personalizadas)
    const extraDates = new Set<string>()
    for (const date of customDates) {
      if (date !== mainVencimento) extraDates.add(date)
    }
    for (const date of buildRecurringDates(mainVencimento || undefined, recorrencia, recorrencia_fim || undefined)) {
      if (date !== mainVencimento) extraDates.add(date)
    }
    const allExtraDates = Array.from(extraDates).sort()

    // Se há múltiplas datas (parcelado/recorrente), gera grupo_id
    const hasMultiple = allExtraDates.length > 0
    const grupoId = hasMultiple ? randomUUID() : null
    const totalParcelas = hasMultiple ? allExtraDates.length + 1 : null

    // Insere a parcela principal (ou lançamento avulso)
    const pag = await queryOne(
      `INSERT INTO pagamentos (
         org_id, criado_por, titulo, descricao, valor, tipo, status,
         vencimento, pago_em, pessoa_id, pessoa_nome, categoria,
         comprovante_url, obs, recorrencia, recorrencia_fim,
         grupo_id, num_parcelas, num_parcela
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        orgId, userId, titulo.trim(), descricao || null,
        parseFloat(String(valor)), tipo, status,
        mainVencimento, pago_em || null,
        pessoa_id || null, pessoa_nome || null,
        categoria || null, comprovante_url || null, obs || null,
        recorrencia, recorrencia_fim || null,
        grupoId, totalParcelas, hasMultiple ? 1 : null,
      ]
    )

    // Insere as parcelas filhas com grupo_id e num_parcela
    for (let i = 0; i < allExtraDates.length; i++) {
      await queryOne(
        `INSERT INTO pagamentos (
           org_id, criado_por, titulo, descricao, valor, tipo, status,
           vencimento, pessoa_id, pessoa_nome, categoria,
           comprovante_url, obs, recorrencia,
           grupo_id, num_parcelas, num_parcela
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nenhum',$14,$15,$16)
         RETURNING id`,
        [
          orgId, userId, titulo.trim(), descricao || null,
          parseFloat(String(valor)), tipo, status,
          allExtraDates[i],
          pessoa_id || null, pessoa_nome || null,
          categoria || null, comprovante_url || null, obs || null,
          grupoId, totalParcelas, i + 2,
        ]
      )
    }

    res.status(201).json({ pagamento: pag })
  } catch (err) {
    console.error('[PAG] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar pagamento.' })
  }
})

// ── PATCH /api/pagamentos/:id ────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const allowed = [
      'titulo', 'descricao', 'valor', 'tipo', 'status', 'vencimento',
      'pago_em', 'pessoa_id', 'pessoa_nome', 'categoria',
      'comprovante_url', 'obs', 'recorrencia', 'recorrencia_fim',
    ] as const
    const updates: Record<string, any> = {}
    for (const key of allowed) {
      const val = (req.body as any)[key]
      if (val !== undefined) {
        updates[key] = val === '' ? null : val
      }
    }
    // Se status foi marcado como pago e não foi enviado pago_em, define a data atual
    if (updates.status === 'pago' && !updates.pago_em) {
      updates.pago_em = new Date().toISOString().slice(0, 10)
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar.' })
      return
    }
    const pag = await PaymentService.updatePayment(req.params.id, orgId, userId, updates)
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

// ── DELETE /api/pagamentos/:id ───────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    await PaymentService.deletePayment(req.params.id, orgId, userId)
    res.json({ ok: true })
  } catch (err) {
    console.error('[PAG] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir pagamento.' })
  }
})

// ── DELETE /api/pagamentos/grupo/:grupo_id ───────────────────────────────────
// Remove todas as parcelas de um grupo (cancela a dívida inteira)
router.delete('/grupo/:grupo_id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    await query('DELETE FROM pagamentos WHERE grupo_id=$1 AND org_id=$2 AND criado_por = $3', [req.params.grupo_id, orgId, userId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[PAG] Erro ao excluir grupo:', err)
    res.status(500).json({ error: 'Erro ao excluir grupo.' })
  }
})

export default router