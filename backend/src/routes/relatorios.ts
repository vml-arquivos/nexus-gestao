import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'

const router = Router()
router.use(authMiddleware)

// GET /api/relatorios/resumo-geral
router.get('/resumo-geral', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const dataIni = (req.query.data_inicio as string) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
    const dataFim = (req.query.data_fim as string)    || new Date().toISOString().slice(0, 10)

    // Resumo financeiro apenas para dados criados pelo usuário logado
    const [financeiro, tarefas, pessoas] = await Promise.all([
      queryOne(
        `SELECT
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pago'),0)     AS receita_paga,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente'),0) AS receita_pendente,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pago'),0)     AS despesa_paga,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pendente'),0) AS despesa_pendente,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pendente' AND vencimento < CURRENT_DATE),0) AS vencidos_pagar,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente' AND vencimento < CURRENT_DATE),0) AS vencidos_receber
         FROM pagamentos
         WHERE org_id=$1 AND criado_por=$2
           AND COALESCE(pago_em, vencimento, created_at::date) BETWEEN $3 AND $4`,
        [orgId, userId, dataIni, dataFim]
      ),
      queryOne(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='pendente')     AS pendentes,
           COUNT(*) FILTER (WHERE status='em_progresso') AS em_progresso,
           COUNT(*) FILTER (WHERE status='concluida')    AS concluidas,
           COUNT(*) FILTER (WHERE status='cancelada')    AS canceladas,
           COUNT(*) FILTER (WHERE prioridade='alta' AND status NOT IN ('concluida','cancelada')) AS urgentes
         FROM tarefas
         WHERE org_id=$1 AND (criado_por=$2 OR responsavel_id=$2)`,
        [orgId, userId]
      ),
      queryOne(`SELECT COUNT(*) AS total FROM pessoas WHERE org_id=$1 AND user_id=$2`, [orgId, userId]),
    ])

    res.json({ financeiro, tarefas, pessoas, periodo: { inicio: dataIni, fim: dataFim } })
  } catch (err) {
    console.error('[REL] Erro resumo-geral:', err)
    res.status(500).json({ error: 'Erro ao buscar resumo.' })
  }
})

// GET /api/relatorios/mensal
router.get('/mensal', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const meses = parseInt((req.query.meses as string) || '12')

    const rows = await query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', COALESCE(pago_em, vencimento, created_at::date)), 'YYYY-MM') AS mes,
         COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pago'),0) AS receita,
         COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pago'),0) AS despesa,
         COUNT(*) AS total_lancamentos
       FROM pagamentos
       WHERE org_id=$1 AND criado_por=$2
         AND COALESCE(pago_em, vencimento, created_at::date) >= (CURRENT_DATE - ($3 || ' months')::INTERVAL)
       GROUP BY mes
       ORDER BY mes ASC`,
      [orgId, userId, meses]
    )

    res.json({ mensal: rows })
  } catch (err) {
    console.error('[REL] Erro mensal:', err)
    res.status(500).json({ error: 'Erro ao buscar dados mensais.' })
  }
})

// GET /api/relatorios/aging
router.get('/aging', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!

    const [aging, proximos] = await Promise.all([
      queryOne(
        `SELECT
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento' AND status='pendente' AND vencimento < CURRENT_DATE - 30),0)   AS pagar_vencido_30_mais,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento' AND status='pendente' AND vencimento >= CURRENT_DATE - 30 AND vencimento < CURRENT_DATE),0) AS pagar_vencido_30,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento' AND status='pendente' AND vencimento = CURRENT_DATE),0)         AS pagar_hoje,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento' AND status='pendente' AND vencimento > CURRENT_DATE AND vencimento <= CURRENT_DATE + 7),0)  AS pagar_7d,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento' AND status='pendente' AND vencimento > CURRENT_DATE + 7 AND vencimento <= CURRENT_DATE + 30),0) AS pagar_30d,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente' AND vencimento < CURRENT_DATE - 30),0) AS receber_vencido_30_mais,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente' AND vencimento >= CURRENT_DATE - 30 AND vencimento < CURRENT_DATE),0) AS receber_vencido_30,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente' AND vencimento = CURRENT_DATE),0)       AS receber_hoje,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente' AND vencimento > CURRENT_DATE AND vencimento <= CURRENT_DATE + 7),0)  AS receber_7d,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente' AND vencimento > CURRENT_DATE + 7 AND vencimento <= CURRENT_DATE + 30),0) AS receber_30d
         FROM pagamentos WHERE org_id=$1 AND criado_por=$2`,
        [orgId, userId]
      ),
      query(
        `SELECT pg.id, pg.titulo, pg.valor, pg.tipo, pg.vencimento, pg.status,
                COALESCE(p.nome, pg.pessoa_nome, 'Sem pessoa') AS pessoa_nome
         FROM pagamentos pg
         LEFT JOIN pessoas p ON p.id = pg.pessoa_id AND p.org_id = pg.org_id
         WHERE pg.org_id=$1 AND pg.status='pendente'
           AND pg.criado_por=$2
           AND pg.vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
         ORDER BY pg.vencimento ASC
         LIMIT 20`,
        [orgId, userId]
      ),
    ])

    res.json({ aging, proximos })
  } catch (err) {
    console.error('[REL] Erro aging:', err)
    res.status(500).json({ error: 'Erro ao buscar aging.' })
  }
})

// GET /api/relatorios/por-categoria
router.get('/por-categoria', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!

    const rows = await query(
      `SELECT
         COALESCE(categoria, 'Sem categoria') AS categoria,
         tipo,
         COALESCE(SUM(valor) FILTER (WHERE status='pago'),0)    AS total_pago,
         COALESCE(SUM(valor) FILTER (WHERE status='pendente'),0) AS total_pendente,
         COUNT(*) AS quantidade
       FROM pagamentos
       WHERE org_id=$1 AND criado_por=$2
       GROUP BY categoria, tipo
       ORDER BY total_pago DESC`,
      [orgId, userId]
    )

    res.json({ por_categoria: rows })
  } catch (err) {
    console.error('[REL] Erro por-categoria:', err)
    res.status(500).json({ error: 'Erro.' })
  }
})

// GET /api/relatorios/tarefas-por-membro
router.get('/tarefas-por-membro', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    // Tarefas por membro apenas considerando tarefas criadas pelo usuário logado (gestor ou subgestor) ou onde ele é responsável
    const rows = await query(
      `SELECT
         p.id AS user_id, p.nome,
         COUNT(t.id) AS total,
         COUNT(t.id) FILTER (WHERE t.status = 'pendente')     AS pendentes,
         COUNT(t.id) FILTER (WHERE t.status = 'em_progresso') AS em_progresso,
         COUNT(t.id) FILTER (WHERE t.status = 'concluida')    AS concluidas,
         COUNT(t.id) FILTER (WHERE t.prioridade = 'alta' AND t.status NOT IN ('concluida','cancelada')) AS urgentes,
         COUNT(t.id) FILTER (WHERE t.prazo < CURRENT_DATE AND t.status NOT IN ('concluida','cancelada')) AS vencidas,
         ROUND(
           CASE WHEN COUNT(t.id) > 0
             THEN COUNT(t.id) FILTER (WHERE t.status='concluida')::numeric / NULLIF(COUNT(t.id),0) * 100
             ELSE 0 END, 1
         ) AS taxa_conclusao
       FROM profiles p
       LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = p.org_id
         AND (t.criado_por = $2 OR t.responsavel_id = $2)
       WHERE p.org_id=$1 AND p.ativo=true
       GROUP BY p.id, p.nome
       ORDER BY total DESC`,
      [orgId, userId]
    )

    res.json({ por_membro: rows })
  } catch (err) {
    console.error('[REL] Erro tarefas-por-membro:', err)
    res.status(500).json({ error: 'Erro.' })
  }
})

// GET /api/relatorios/pessoa/:id — relatório consolidado por pessoa
router.get('/pessoa/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const pessoaId = req.params.id

    // Carrega apenas a pessoa pertencente ao usuário
    const pessoa = await queryOne('SELECT * FROM pessoas WHERE id=$1 AND org_id=$2 AND user_id=$3', [pessoaId, orgId, userId])
    if (!pessoa) { res.status(404).json({ error: 'Pessoa não encontrada.' }); return }

    const [pagamentos, documentos, resumoFin] = await Promise.all([
      query(
        `SELECT * FROM pagamentos WHERE org_id=$1 AND pessoa_id=$2 AND criado_por=$3 ORDER BY vencimento DESC NULLS LAST`,
        [orgId, pessoaId, userId]
      ),
      query(
        `SELECT * FROM documentos WHERE org_id=$1 AND pessoa_id=$2 AND criado_por=$3 ORDER BY created_at DESC`,
        [orgId, pessoaId, userId]
      ),
      queryOne(
        `SELECT
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'),0)   AS total_devo,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento'),0) AS total_me_devem,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pago'),0)     AS devo_pago,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pago'),0)     AS me_devem_pago,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pendente'),0) AS devo_pendente,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente'),0) AS me_devem_pendente,
           COALESCE(SUM(valor) FILTER (WHERE tipo='pagamento'   AND status='pendente' AND vencimento < CURRENT_DATE),0) AS devo_vencido,
           COALESCE(SUM(valor) FILTER (WHERE tipo='recebimento' AND status='pendente' AND vencimento < CURRENT_DATE),0) AS me_devem_vencido
         FROM pagamentos WHERE org_id=$1 AND pessoa_id=$2 AND criado_por=$3`,
        [orgId, pessoaId, userId]
      ),
    ])

    res.json({ pessoa, pagamentos, documentos, resumo: resumoFin })
  } catch (err) {
    console.error('[REL] Erro pessoa/:id:', err)
    res.status(500).json({ error: 'Erro ao buscar relatório da pessoa.' })
  }
})

export default router
