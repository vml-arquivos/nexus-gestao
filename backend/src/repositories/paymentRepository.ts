import { query, queryOne } from '../db/pool'

// Types used by PaymentRepository
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
}

/**
 * PaymentRepository encapsula a lógica de acesso a dados para pagamentos.
 * Cada função recebe os parâmetros necessários e executa a query apropriada.
 * As rotas e serviços devem utilizar essas funções para interação com o banco.
 */
export const PaymentRepository = {
  /**
   * Lista pagamentos de uma organização aplicando filtros.
   */
  async list(orgId: string, userId: string, filters: PaymentFilter) {
    // Lista apenas pagamentos criados pelo usuário na organização
    let sql = `
      SELECT pg.*, p.nome AS pessoa_nome_atual
      FROM pagamentos pg
      LEFT JOIN pessoas p
        ON p.id = pg.pessoa_id
       AND p.org_id = pg.org_id
      WHERE pg.org_id = $1
        AND pg.criado_por = $2
    `
    const params: unknown[] = [orgId, userId]
    let idx = 3
    if (filters?.tipo) {
      sql += ` AND pg.tipo = $${idx++}`
      params.push(filters.tipo)
    }
    if (filters?.status) {
      sql += ` AND pg.status = $${idx++}`
      params.push(filters.status)
    }
    if (filters?.pessoa_id) {
      sql += ` AND pg.pessoa_id = $${idx++}`
      params.push(filters.pessoa_id)
    }
    if (filters?.vencidos === 'true') {
      sql += ` AND pg.status = 'pendente' AND pg.vencimento < CURRENT_DATE`
    }
    sql += ' ORDER BY pg.vencimento ASC NULLS LAST, pg.created_at DESC'
    return await query(sql, params)
  },
  /**
   * Obtém resumo financeiro para uma organização.
   */
  async getResumo(orgId: string, userId: string) {
    // Resumo financeiro apenas dos pagamentos criados pelo usuário
    const resumo = await queryOne(
      `SELECT
         COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pago'),0)     AS receita_paga,
         COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente'),0) AS receita_pendente,
         COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pago'),0)     AS despesa_paga,
         COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pendente'),0) AS despesa_pendente,
         COALESCE(SUM(valor) FILTER (WHERE status='pendente' AND vencimento < CURRENT_DATE),0) AS total_vencido
       FROM pagamentos
       WHERE org_id = $1 AND criado_por = $2`,
      [orgId, userId]
    )
    return resumo
  },
  /**
   * Obtém valores agregados por pessoa para uma organização.
   */
  async getPorPessoa(orgId: string, userId: string) {
    // Valores agregados por pessoa apenas dos pagamentos criados pelo usuário
    const rows = await query(
      `SELECT
         pg.pessoa_id,
         COALESCE(p.nome, pg.pessoa_nome, 'Sem pessoa') AS pessoa_nome,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'pagamento'), 0) AS devo,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'recebimento'), 0) AS me_devem,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'pagamento' AND pg.status = 'pendente'), 0) AS devo_pendente,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'recebimento' AND pg.status = 'pendente'), 0) AS me_devem_pendente,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'pagamento' AND pg.status = 'pago'), 0) AS devo_pago,
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.tipo = 'recebimento' AND pg.status = 'pago'), 0) AS me_devem_pago,
         COUNT(*) AS total_lancamentos
       FROM pagamentos pg
       LEFT JOIN pessoas p
         ON p.id = pg.pessoa_id
        AND p.org_id = pg.org_id
       WHERE pg.org_id = $1
         AND pg.criado_por = $2
         AND (pg.pessoa_id IS NOT NULL OR pg.pessoa_nome IS NOT NULL)
       GROUP BY pg.pessoa_id, p.nome, pg.pessoa_nome
       ORDER BY
         COALESCE(SUM(pg.valor) FILTER (WHERE pg.status = 'pendente'), 0) DESC,
         pessoa_nome ASC`,
      [orgId, userId]
    )
    return rows
  },
  /**
   * Cria pagamento. Recebe dados já validados.
   * Retorna o pagamento criado.
   */
  async create(data: PaymentCreateInput) {
    const {
      orgId,
      userId,
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
      recorrencia_fim,
    } = data
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
        vencimento || null,
        pago_em || null,
        pessoa_id || null,
        pessoa_nome || null,
        categoria || null,
        comprovante_url || null,
        obs || null,
        recorrencia || 'nenhum',
        recorrencia_fim || null,
      ]
    )
    return pag
  },
  /**
   * Atualiza pagamento. Retorna registro atualizado.
   */
  async update(id: string, orgId: string, userId: string, updates: PaymentUpdateInput) {
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
    if (setParts.length === 0) {
      return null
    }
    params.push(id, orgId, userId)
    const sql = `UPDATE pagamentos SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND org_id = $${idx + 1} AND criado_por = $${idx + 2} RETURNING *`
    const updated = await queryOne(sql, params)
    return updated
  },
  /**
   * Remove pagamento por id e orgId.
   */
  async remove(id: string, orgId: string, userId: string) {
    await query('DELETE FROM pagamentos WHERE id = $1 AND org_id = $2 AND criado_por = $3', [id, orgId, userId])
    return { ok: true }
  },
}