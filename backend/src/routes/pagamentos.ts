import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'

const router = Router()
router.use(authMiddleware)

// GET /api/pagamentos
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const { tipo, status, pessoa_id, vencidos } = req.query
    let sql = `
      SELECT pg.*, p.nome AS pessoa_nome_atual
      FROM pagamentos pg
      LEFT JOIN pessoas p ON p.id = pg.pessoa_id
      WHERE pg.org_id = $1
    `
    const params: unknown[] = [orgId]
    let idx = 2
    if (tipo)      { sql += ` AND pg.tipo = $${idx++}`;      params.push(tipo) }
    if (status)    { sql += ` AND pg.status = $${idx++}`;    params.push(status) }
    if (pessoa_id) { sql += ` AND pg.pessoa_id = $${idx++}`; params.push(pessoa_id) }
    if (vencidos === 'true') sql += ` AND pg.status = 'pendente' AND pg.vencimento < NOW()`
    sql += ' ORDER BY pg.vencimento ASC NULLS LAST, pg.created_at DESC'
    const pagamentos = await query(sql, params)
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
    const resumo = await queryOne(
      `SELECT
         COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pago'),0)     AS receita_paga,
         COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente'),0) AS receita_pendente,
         COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pago'),0)     AS despesa_paga,
         COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pendente'),0) AS despesa_pendente,
         COALESCE(SUM(valor) FILTER (WHERE status='pendente' AND vencimento < NOW()),0) AS total_vencido
       FROM pagamentos WHERE org_id = $1`,
      [orgId]
    )
    res.json({ resumo })
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar resumo financeiro.' })
  }
})

// GET /api/pagamentos/por-pessoa — visão bidirecional por pessoa
router.get('/por-pessoa', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const rows = await query<{
      pessoa_id: string; pessoa_nome: string; tipo: string; status: string; total: string
    }>(
      `SELECT pg.pessoa_id,
              COALESCE(p.nome, pg.pessoa_nome, 'Sem nome') AS pessoa_nome,
              pg.tipo, pg.status, SUM(pg.valor) AS total
       FROM pagamentos pg
       LEFT JOIN pessoas p ON p.id = pg.pessoa_id
       WHERE pg.org_id = $1 AND pg.pessoa_id IS NOT NULL
       GROUP BY pg.pessoa_id, pessoa_nome, pg.tipo, pg.status`,
      [orgId]
    )
    const map = new Map<string, {
      pessoa_id: string; pessoa_nome: string;
      devo: number; me_devem: number;
      devo_pendente: number; me_devem_pendente: number;
      devo_pago: number; me_devem_pago: number;
    }>()
    for (const r of rows) {
      if (!map.has(r.pessoa_id)) {
        map.set(r.pessoa_id, { pessoa_id: r.pessoa_id, pessoa_nome: r.pessoa_nome, devo: 0, me_devem: 0, devo_pendente: 0, me_devem_pendente: 0, devo_pago: 0, me_devem_pago: 0 })
      }
      const e = map.get(r.pessoa_id)!
      const v = parseFloat(r.total)
      if (r.tipo === 'pagamento') {
        e.devo += v
        if (r.status === 'pendente') e.devo_pendente += v
        if (r.status === 'pago')     e.devo_pago     += v
      } else {
        e.me_devem += v
        if (r.status === 'pendente') e.me_devem_pendente += v
        if (r.status === 'pago')     e.me_devem_pago     += v
      }
    }
    const por_pessoa = Array.from(map.values()).sort((a, b) =>
      (b.devo_pendente + b.me_devem_pendente) - (a.devo_pendente + a.me_devem_pendente)
    )
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
    const { titulo, descricao, valor, tipo, status = 'pendente', vencimento, pago_em, pessoa_id, pessoa_nome, categoria, comprovante_url, obs } = req.body
    if (!titulo?.trim()) { res.status(400).json({ error: 'Título é obrigatório.' }); return }
    if (!valor || isNaN(parseFloat(String(valor)))) { res.status(400).json({ error: 'Valor inválido.' }); return }
    if (!['pagamento','recebimento'].includes(tipo)) { res.status(400).json({ error: 'Tipo inválido.' }); return }
    const pag = await queryOne(
      `INSERT INTO pagamentos (org_id, criado_por, titulo, descricao, valor, tipo, status, vencimento, pago_em, pessoa_id, pessoa_nome, categoria, comprovante_url, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [orgId, userId, titulo.trim(), descricao||null, parseFloat(String(valor)), tipo, status, vencimento||null, pago_em||null, pessoa_id||null, pessoa_nome||null, categoria||null, comprovante_url||null, obs||null]
    )
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
    const allowed = ['titulo','descricao','valor','tipo','status','vencimento','pago_em','pessoa_id','pessoa_nome','categoria','comprovante_url','obs']
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
    if (sets.length === 0) { res.status(400).json({ error: 'Nenhum campo para atualizar.' }); return }
    sets.push(`updated_at = NOW()`)
    params.push(req.params.id, orgId)
    const pag = await queryOne(
      `UPDATE pagamentos SET ${sets.join(', ')} WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`,
      params
    )
    if (!pag) { res.status(404).json({ error: 'Pagamento não encontrado.' }); return }
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
    res.status(500).json({ error: 'Erro ao excluir pagamento.' })
  }
})

export default router
