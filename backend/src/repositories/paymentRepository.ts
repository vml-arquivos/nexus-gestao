import { query, queryOne } from '../db/pool'

export interface PaymentFilter {
  tipo?: string
  status?: string
  pessoa_id?: string
  vencidos?: string
}

export interface PaymentCreateInput {
  orgId: string
  userId: string
  titulo: string
  descricao?: string | null
  valor: number | string
  tipo: string
  status: string
  vencimento?: string | null
  pago_em?: string | null
  pessoa_id?: string | null
  pessoa_nome?: string | null
  categoria?: string | null
  comprovante_url?: string | null
  obs?: string | null
  recorrencia?: string
  recorrencia_fim?: string | null
  datas_personalizadas?: string[]
  grupo_id?: string | null
}

export interface PaymentUpdateInput {
  titulo?: string | null
  descricao?: string | null
  valor?: number | null
  tipo?: string | null
  status?: string | null
  vencimento?: string | null
  pago_em?: string | null
  pessoa_id?: string | null
  pessoa_nome?: string | null
  categoria?: string | null
  comprovante_url?: string | null
  obs?: string | null
  recorrencia?: string | null
  recorrencia_fim?: string | null
  grupo_id?: string | null
}

export const PaymentRepository = {
  async list(orgId: string, filters: PaymentFilter) {
    let sql = `
      SELECT pg.*, p.nome AS pessoa_nome_atual
      FROM pagamentos pg
      LEFT JOIN pessoas p ON p.id = pg.pessoa_id AND p.org_id = pg.org_id
      WHERE pg.org_id = $1
    `
    const params: unknown[] = [orgId]
    let idx = 2

    if (filters?.tipo)      { sql += ` AND pg.tipo = $${idx++}`;      params.push(filters.tipo) }
    if (filters?.status)    { sql += ` AND pg.status = $${idx++}`;    params.push(filters.status) }
    if (filters?.pessoa_id) { sql += ` AND pg.pessoa_id = $${idx++}`; params.push(filters.pessoa_id) }
    if (filters?.vencidos === 'true') {
      sql += ` AND pg.status = 'pendente' AND pg.vencimento < CURRENT_DATE`
    }

    sql += ' ORDER BY pg.vencimento ASC NULLS LAST, pg.created_at DESC'
    return await query(sql, params)
  },

  // CORRIGIDO: vencidos_pagar e vencidos_receber separados (não mais total_vencido genérico)
  async getResumo(orgId: string) {
    return queryOne(
      `SELECT
         COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pago'),0)     AS receita_paga,
         COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente'),0) AS receita_pendente,
         COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pago'),0)     AS despesa_paga,
         COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pendente'),0) AS despesa_pendente,
         COALESCE(SUM(valor) FILTER (
           WHERE tipo='pagamento' AND status='pendente' AND vencimento < CURRENT_DATE
         ),0) AS vencidos_pagar,
         COALESCE(SUM(valor) FILTER (
           WHERE tipo='recebimento' AND status='pendente' AND vencimento < CURRENT_DATE
         ),0) AS vencidos_receber,
         COALESCE(SUM(valor) FILTER (
           WHERE status='pendente' AND vencimento < CURRENT_DATE
         ),0) AS total_vencido
       FROM pagamentos
       WHERE org_id = $1`,
      [orgId]
    )
  },

  async getPorPessoa(orgId: string) {
    return query(
      `SELECT
         pg.pessoa_id,
         COALESCE(p.nome, pg.pessoa_nome, 'Sem pessoa') AS pessoa_nome,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'pagamento'),   0) AS devo,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'recebimento'), 0) AS me_devem,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'pagamento'   AND pg.status = 'pendente'), 0) AS devo_pendente,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'recebimento' AND pg.status = 'pendente'), 0) AS me_devem_pendente,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'pagamento'   AND pg.status = 'pago'),     0) AS devo_pago,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'recebimento' AND pg.status = 'pago'),     0) AS me_devem_pago,
         COUNT(*) AS total_lancamentos
       FROM pagamentos pg
       LEFT JOIN pessoas p ON p.id = pg.pessoa_id AND p.org_id = pg.org_id
       WHERE pg.org_id = $1
         AND (pg.pessoa_id IS NOT NULL OR pg.pessoa_nome IS NOT NULL)
       GROUP BY pg.pessoa_id, p.nome, pg.pessoa_nome
       ORDER BY COALESCE(SUM(pg.valor) FILTER (WHERE pg.status = 'pendente'), 0) DESC, pessoa_nome ASC`,
      [orgId]
    )
  },

  async create(data: PaymentCreateInput) {
    const {
      orgId, userId, titulo, descricao, valor, tipo, status,
      vencimento, pago_em, pessoa_id, pessoa_nome, categoria,
      comprovante_url, obs, recorrencia, recorrencia_fim, grupo_id,
    } = data
    return queryOne(
      `INSERT INTO pagamentos
         (org_id, criado_por, titulo, descricao, valor, tipo, status,
          vencimento, pago_em, pessoa_id, pessoa_nome, categoria,
          comprovante_url, obs, recorrencia, recorrencia_fim, grupo_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        orgId, userId, titulo.trim(), descricao || null,
        parseFloat(String(valor)), tipo, status,
        vencimento || null, pago_em || null,
        pessoa_id || null, pessoa_nome || null, categoria || null,
        comprovante_url || null, obs || null,
        recorrencia || 'nenhum', recorrencia_fim || null, grupo_id || null,
      ]
    )
  },

  async update(id: string, orgId: string, updates: PaymentUpdateInput) {
    const allowed = [
      'titulo','descricao','valor','tipo','status','vencimento','pago_em',
      'pessoa_id','pessoa_nome','categoria','comprovante_url','obs',
      'recorrencia','recorrencia_fim','grupo_id',
    ]
    const setParts: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const key of allowed) {
      const val = (updates as Record<string, unknown>)[key]
      if (val !== undefined) {
        setParts.push(`${key} = $${idx++}`)
        params.push(val)
      }
    }

    if (setParts.length === 0) return null

    params.push(id, orgId)
    return queryOne(
      `UPDATE pagamentos SET ${setParts.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} AND org_id = $${idx + 1}
       RETURNING *`,
      params
    )
  },

  async remove(id: string, orgId: string) {
    await query('DELETE FROM pagamentos WHERE id = $1 AND org_id = $2', [id, orgId])
    return { ok: true }
  },
}
