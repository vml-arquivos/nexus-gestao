import { Router, Request, Response } from 'express'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
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

function normalizeMoneyList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const raw = typeof item === 'string' ? item.replace(/\./g, '').replace(',', '.') : item
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
  })
}

function moneyAt(values: number[], index: number, fallback: number): number {
  const n = values[index]
  return Number.isFinite(n) && n > 0 ? n : fallback
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


function isSystemFinancialMovement(row: any): boolean {
  const title = normalizeGroupPart(row?.titulo)
  const obs = normalizeGroupPart(row?.obs)
  return (
    title.startsWith('abatimento —') ||
    title.startsWith('abatimento -') ||
    title.startsWith('abatimento ') ||
    title.startsWith('acrescimo —') ||
    title.startsWith('acrescimo -') ||
    title.startsWith('acrescimo ') ||
    title.startsWith('acréscimo —') ||
    title.startsWith('acréscimo -') ||
    title.startsWith('acréscimo ') ||
    obs.includes('abatimento sobre divida') ||
    obs.includes('abatimento sobre dívida') ||
    obs.includes('acrescimo sobre divida') ||
    obs.includes('acréscimo sobre dívida')
  )
}

function buildNaturalGroupKey(row: any): string {
  const pessoa = row.pessoa_id || row.pessoa_nome_atual || row.pessoa_nome || 'sem-pessoa'
  // Chave natural estável: não usa valor da parcela.
  // O valor pode mudar após abatimento/recalculo, mas a dívida continua sendo a mesma.
  return [
    'natural',
    normalizeGroupPart(normalizeBaseTitleForHistory(row.titulo)),
    normalizeGroupPart(row.tipo),
    normalizeGroupPart(row.categoria || 'sem-categoria'),
    normalizeGroupPart(pessoa),
  ].join('|')
}

function normalizeBaseTitleForHistory(title: unknown): string {
  return String(title || '')
    .replace(/^(Abatimento|Acréscimo|Acrescimo|Pagamento|Baixa|Recalculo|Recálculo)\s+[—-]\s+/i, '')
    .trim()
}

function buildHistoryGroupKey(input: any): string {
  const pessoa = input.pessoa_id || input.pessoa_nome_atual || input.pessoa_nome || 'sem-pessoa'
  // Mesma regra estável da listagem: não usar valor.
  return [
    'natural',
    normalizeGroupPart(normalizeBaseTitleForHistory(input.titulo)),
    normalizeGroupPart(input.tipo),
    normalizeGroupPart(input.categoria || 'sem-categoria'),
    normalizeGroupPart(pessoa),
  ].join('|')
}

function historicoFromParcela(row: any) {
  if (row.status !== 'pago') return null
  return {
    id: `parcela:${row.id}`,
    pagamento_id: row.id,
    grupo_id: row.grupo_id || null,
    group_key: buildNaturalGroupKey(row),
    tipo_evento: 'pagamento',
    titulo: row.num_parcela ? `Parcela ${row.num_parcela} paga` : 'Pagamento registrado',
    descricao: row.obs || null,
    valor: Number(row.valor || 0),
    data_evento: normalizeDateValue(row.pago_em || row.vencimento || row.updated_at || row.created_at),
    forma_pagamento: null,
    created_at: row.updated_at || row.created_at,
  }
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
    const pagamentoIdToKey = new Map<string, string>()

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
      historico: any[]
    }>()

    for (const row of rows) {
      // Movimentos financeiros de histórico (abatimento/acréscimo) não são cards independentes.
      // Eles aparecem somente no extrato do grupo/dívida correspondente.
      if (isSystemFinancialMovement(row)) continue

      // Registros novos possuem grupo_id. Registros antigos podem não ter.
      // Para eles, agrupamos por chave natural: título + pessoa + tipo + categoria + valor.
      const chave = row.grupo_id ? `grupo:${row.grupo_id}` : buildNaturalGroupKey(row)
      if (row.id) pagamentoIdToKey.set(String(row.id), chave)
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
          historico: [],
        })
      }

      const g = gruposMap.get(chave)!
      g.parcelas.push(row)
      const eventoParcela = historicoFromParcela(row)
      if (eventoParcela) g.historico.push(eventoParcela)
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

    // Carrega movimentos manuais do extrato financeiro e vincula por grupo_id ou chave natural.
    const histRows = await query(
      `SELECT h.*, p.nome AS user_nome
       FROM pagamentos_historico h
       LEFT JOIN profiles p ON p.id = h.user_id
       WHERE h.org_id = $1 AND h.user_id = $2
       ORDER BY h.created_at DESC`,
      [orgId, userId]
    ).catch(() => []) as any[]

    for (const h of histRows) {
      const keys: string[] = []
      if (h.grupo_id) keys.push(`grupo:${h.grupo_id}`)
      if (h.pagamento_id && pagamentoIdToKey.has(String(h.pagamento_id))) keys.push(pagamentoIdToKey.get(String(h.pagamento_id))!)
      if (h.group_key) keys.push(String(h.group_key))
      for (const key of keys) {
        const g = gruposMap.get(key)
        if (!g) continue
        g.historico.push({
          id: h.id,
          pagamento_id: h.pagamento_id || null,
          grupo_id: h.grupo_id || null,
          group_key: h.group_key || null,
          tipo_evento: h.tipo_evento,
          titulo: h.titulo,
          descricao: h.descricao,
          valor: h.valor !== null && h.valor !== undefined ? Number(h.valor) : null,
          data_evento: normalizeDateValue(h.data_evento),
          forma_pagamento: h.forma_pagamento || null,
          saldo_anterior: h.saldo_anterior !== null && h.saldo_anterior !== undefined ? Number(h.saldo_anterior) : null,
          saldo_posterior: h.saldo_posterior !== null && h.saldo_posterior !== undefined ? Number(h.saldo_posterior) : null,
          user_nome: h.user_nome || null,
          created_at: h.created_at,
        })
        break
      }
    }

    // Converte para array e ordena: vencidos primeiro, depois por próxima parcela
    const grupos = Array.from(gruposMap.values()).map(g => ({
      ...g,
      parcelas: g.parcelas.sort((a: any, b: any) =>
        (a.num_parcela || 0) - (b.num_parcela || 0) ||
        compareNullableDates(a.vencimento, b.vencimento)
      ),
      historico: g.historico.sort((a: any, b: any) => {
        const da = new Date(a.created_at || a.data_evento || 0).getTime()
        const db = new Date(b.created_at || b.data_evento || 0).getTime()
        return db - da
      }),
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



// ── POST /api/pagamentos/historico ───────────────────────────────────────────
// Registra evento/extrato de uma dívida ou recebimento agrupado.
router.post('/historico', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const {
      pagamento_id,
      grupo_id,
      group_key,
      tipo_evento = 'movimento',
      titulo,
      descricao,
      valor,
      data_evento,
      forma_pagamento,
      saldo_anterior,
      saldo_posterior,
      metadata,
      referencia,
    } = req.body || {}

    if (!titulo?.trim()) { res.status(400).json({ error: 'Título do histórico é obrigatório.' }); return }

    let finalGroupKey = group_key || (referencia ? buildHistoryGroupKey(referencia) : null)
    let finalGrupoId = grupo_id || null

    // Se veio pagamento_id, usa o próprio lançamento para calcular a chave estável do grupo.
    // Isso evita histórico perdido quando o valor da parcela muda após abatimento/recalculo.
    if (pagamento_id) {
      const pagRef = await queryOne<any>(
        `SELECT p.*, COALESCE(pe.nome, p.pessoa_nome) AS pessoa_nome_atual
         FROM pagamentos p
         LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
         WHERE p.id = $1 AND p.org_id = $2 AND p.criado_por = $3`,
        [pagamento_id, orgId, userId]
      )
      if (pagRef) {
        finalGrupoId = finalGrupoId || pagRef.grupo_id || null
        finalGroupKey = pagRef.grupo_id ? `grupo:${pagRef.grupo_id}` : buildNaturalGroupKey(pagRef)
      }
    }

    const row = await queryOne(
      `INSERT INTO pagamentos_historico
        (org_id, user_id, pagamento_id, grupo_id, group_key, tipo_evento, titulo, descricao, valor,
         data_evento, forma_pagamento, saldo_anterior, saldo_posterior, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        orgId,
        userId,
        pagamento_id || null,
        finalGrupoId || null,
        finalGroupKey || null,
        tipo_evento,
        titulo.trim(),
        descricao || null,
        valor === undefined || valor === '' ? null : Number(valor),
        data_evento || null,
        forma_pagamento || null,
        saldo_anterior === undefined || saldo_anterior === '' ? null : Number(saldo_anterior),
        saldo_posterior === undefined || saldo_posterior === '' ? null : Number(saldo_posterior),
        metadata ? JSON.stringify(metadata) : '{}',
      ]
    )
    res.status(201).json({ historico: row })
  } catch (err) {
    console.error('[PAG] Erro ao registrar histórico:', err)
    res.status(500).json({ error: 'Erro ao registrar histórico financeiro.' })
  }
})

function isUuidLike(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ── GET /api/pagamentos/grupo/:grupo_id ──────────────────────────────────────
// Retorna todas as parcelas de um grupo específico.
// Aceita tanto grupo_id UUID quanto chave natural encoded (natural|titulo|tipo|categoria|pessoa).
router.get('/grupo/:grupo_id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const rawGrupoId = decodeURIComponent(String(req.params.grupo_id || ''))

    if (isUuidLike(rawGrupoId)) {
      const parcelas = await query(
        `SELECT p.*, COALESCE(pe.nome, p.pessoa_nome) AS pessoa_nome_atual
         FROM pagamentos p
         LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
         WHERE p.org_id = $1 AND p.grupo_id = $2 AND p.criado_por = $3
         ORDER BY p.num_parcela ASC NULLS LAST, p.vencimento ASC`,
        [orgId, rawGrupoId, userId]
      )
      res.json({ parcelas })
      return
    }

    const rows = await query(
      `SELECT p.*, COALESCE(pe.nome, p.pessoa_nome) AS pessoa_nome_atual
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.org_id = $1 AND p.criado_por = $2
       ORDER BY p.vencimento ASC NULLS LAST, p.created_at ASC`,
      [orgId, userId]
    ) as any[]

    const parcelas = rows
      .filter(row => !isSystemFinancialMovement(row))
      .filter(row => buildNaturalGroupKey(row) === rawGrupoId)
      .sort((a, b) => {
        const nA = Number(a.num_parcela || 0)
        const nB = Number(b.num_parcela || 0)
        if (nA !== nB) return nA - nB
        return compareNullableDates(a.vencimento, b.vencimento)
      })

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
      parcelas_valores,
    } = req.body

    if (!titulo?.trim()) { res.status(400).json({ error: 'Título é obrigatório.' }); return }
    if (!valor || isNaN(parseFloat(String(valor)))) { res.status(400).json({ error: 'Valor inválido.' }); return }
    if (!['pagamento', 'recebimento'].includes(tipo)) { res.status(400).json({ error: 'Tipo inválido.' }); return }
    if (!isRecorrencia(recorrencia)) { res.status(400).json({ error: 'Recorrência inválida.' }); return }

    const customDates = normalizeDateList(datas_personalizadas)
    const customValues = normalizeMoneyList(parcelas_valores)
    const baseValor = Math.round(parseFloat(String(valor)) * 100) / 100
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
        moneyAt(customValues, 0, baseValor), tipo, status,
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
          moneyAt(customValues, i + 1, baseValor), tipo, status,
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

// ── DELETE /api/pagamentos/grupo/:grupo_id ───────────────────────────────────
// Remove todas as parcelas de um grupo (cancela a dívida inteira).
// Aceita grupo_id UUID e chave natural. Isso evita 500 quando o frontend envia
// uma chave como natural|financiamento|pagamento|divida|pessoa.
router.delete('/grupo/:grupo_id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const canDeleteAny = canDeleteOrgRecords(role)
    if (!canDeleteAny && role !== 'membro' && role !== 'sub_gestor') {
      res.status(403).json({ error: 'Você não tem permissão para apagar este grupo financeiro.' })
      return
    }

    const rawGrupoId = decodeURIComponent(String(req.params.grupo_id || ''))

    if (isUuidLike(rawGrupoId)) {
      const deleted = await query(
        `DELETE FROM pagamentos
         WHERE grupo_id = $1 AND org_id = $2 AND ($3::boolean = TRUE OR criado_por = $4)
         RETURNING id`,
        [rawGrupoId, orgId, canDeleteAny, userId]
      ) as any[]

      await query(
        'DELETE FROM pagamentos_historico WHERE org_id = $1 AND grupo_id = $2',
        [orgId, rawGrupoId]
      )

      res.json({ ok: true, deletados: deleted.length })
      return
    }

    // Chave natural: carrega os registros da organização, calcula a mesma chave
    // da listagem e remove somente os IDs pertencentes ao card financeiro.
    const rows = await query(
      `SELECT p.*, COALESCE(pe.nome, p.pessoa_nome) AS pessoa_nome_atual
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.org_id = $1 AND ($2::boolean = TRUE OR p.criado_por = $3)`,
      [orgId, canDeleteAny, userId]
    ) as any[]

    const ids = rows
      .filter(row => !isSystemFinancialMovement(row))
      .filter(row => buildNaturalGroupKey(row) === rawGrupoId)
      .map(row => row.id)

    if (ids.length === 0) {
      res.status(404).json({ error: 'Grupo financeiro não encontrado.' })
      return
    }

    const deleted = await query(
      `DELETE FROM pagamentos
       WHERE org_id = $1 AND id = ANY($2::uuid[]) AND ($3::boolean = TRUE OR criado_por = $4)
       RETURNING id`,
      [orgId, ids, canDeleteAny, userId]
    ) as any[]

    await query(
      'DELETE FROM pagamentos_historico WHERE org_id = $1 AND group_key = $2',
      [orgId, rawGrupoId]
    )

    res.json({ ok: true, deletados: deleted.length })
  } catch (err) {
    console.error('[PAG] Erro ao excluir grupo:', err)
    res.status(500).json({ error: 'Erro ao excluir grupo.' })
  }
})


// ── DELETE /api/pagamentos/:id ───────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const canDeleteAny = canDeleteOrgRecords(role)
    const deleted = await query(
      `DELETE FROM pagamentos
       WHERE id = $1 AND org_id = $2 AND ($3::boolean = TRUE OR criado_por = $4)
       RETURNING id`,
      [req.params.id, orgId, canDeleteAny, userId]
    ) as any[]
    if (deleted.length === 0) { res.status(404).json({ error: 'Pagamento não encontrado ou sem permissão.' }); return }
    await query('DELETE FROM pagamentos_historico WHERE org_id = $1 AND pagamento_id = $2', [orgId, req.params.id]).catch(() => {})
    res.json({ ok: true })
  } catch (err) {
    console.error('[PAG] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir pagamento.' })
  }
})

export default router