import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// ── LISTAR MEMBROS DA EQUIPE ──────────────────────────────────────────────────
// GET /api/equipe/membros
// gestor:     vê todos da organização
// sub_gestor: vê a si mesmo + seus comandados
// membro:     vê todos (para saber com quem trabalha)
router.get('/membros', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!

    let sql = `
      SELECT
        p.id, p.nome, p.email, p.role, p.cargo, p.avatar_url, p.criado_por,
        c.nome AS criado_por_nome,
        (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = p.id AND t.criado_por = $2 AND t.status NOT IN ('concluida','cancelada')) AS tarefas_pendentes,
        (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = p.id AND t.criado_por = $2 AND t.status = 'concluida') AS tarefas_concluidas,
        (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = p.id AND t.criado_por = $2 AND t.status = 'nao_concluida') AS tarefas_nao_concluidas,
        (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = p.id AND t.criado_por = $2 AND t.status = 'devolvida') AS tarefas_devolvidas
      FROM profiles p
      LEFT JOIN profiles c ON c.id = p.criado_por
      WHERE p.org_id = $1 AND p.ativo = TRUE
    `
    const params: unknown[] = [orgId, userId]

    if (role === 'membro') {
      // Membro precisa enxergar a equipe da organização para escolher destinatário
      // em "Pedir ajuda". Retornamos somente dados mínimos para não expor
      // painel operacional, contagens e e-mails de outros membros.
      const membros = await query(`
        SELECT
          p.id, p.nome, NULL::text AS email, p.role, p.cargo, p.avatar_url, p.criado_por,
          NULL::text AS criado_por_nome,
          0::int AS tarefas_pendentes,
          0::int AS tarefas_concluidas,
          0::int AS tarefas_nao_concluidas,
          0::int AS tarefas_devolvidas
        FROM profiles p
        WHERE p.org_id = $1 AND p.ativo = TRUE
        ORDER BY p.role, p.nome
      `, [orgId])
      res.json({ membros })
      return
    } else if (role === 'gestor' || role === 'sub_gestor') {
      // Gestor/subgestor vê a si, comandados criados por ele e membros vinculados às equipes dele.
      // Isto corrige o regresso onde membros convidados/adicionados por equipe sumiam quando criado_por estava nulo/diferente.
      sql += ` AND (
        p.id = $2
        OR p.criado_por = $2
        OR EXISTS (
          SELECT 1
          FROM equipes e
          JOIN equipes_membros em ON em.equipe_id = e.id AND em.org_id = e.org_id
          WHERE e.org_id = p.org_id
            AND e.criado_por = $2
            AND em.user_id = p.id
            AND COALESCE(em.ativo, TRUE) = TRUE
        )
      )`
    }

    sql += ' ORDER BY p.role, p.nome'
    const membros = await query(sql, params)
    res.json({ membros })
  } catch (err) {
    console.error('[EQUIPE] Erro ao listar membros:', err)
    res.status(500).json({ error: 'Erro ao buscar membros.' })
  }
})

// ── LISTAR PESSOAS ────────────────────────────────────────────────────────────
// GET /api/equipe/pessoas
router.get('/pessoas', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { tipo, search } = req.query
    // Cada usuário enxerga apenas pessoas vinculadas a ele (user_id)
    let sql = 'SELECT * FROM pessoas WHERE org_id = $1 AND user_id = $2'
    const params: unknown[] = [orgId, userId]
    let idx = 3
    if (tipo)   { sql += ` AND tipo = $${idx++}`;                    params.push(tipo) }
    if (search) { sql += ` AND nome ILIKE $${idx++}`;                params.push(`%${search}%`) }
    sql += ' ORDER BY nome'
    const pessoas = await query(sql, params)
    res.json({ pessoas })
  } catch (err) {
    console.error('[EQUIPE] Erro ao listar pessoas:', err)
    res.status(500).json({ error: 'Erro ao buscar pessoas.' })
  }
})

// ── CRIAR PESSOA ──────────────────────────────────────────────────────────────
// POST /api/equipe/pessoas  (gestor e sub_gestor)
router.post('/pessoas', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Membros não podem criar pessoas.' }); return
    }
    const { nome, tipo, cargo, contato, email, valor, obs } = req.body
    if (!nome || !tipo) {
      res.status(400).json({ error: 'Nome e tipo são obrigatórios.' })
      return
    }
    const pessoa = await queryOne(
      `INSERT INTO pessoas (org_id, user_id, nome, tipo, cargo, contato, email, valor, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [orgId, userId, nome.trim(), tipo, cargo || null, contato || null, email || null, valor || null, obs || null]
    )
    res.status(201).json({ pessoa })
  } catch (err) {
    console.error('[EQUIPE] Erro ao criar pessoa:', err)
    res.status(500).json({ error: 'Erro ao criar pessoa.' })
  }
})

// ── ATUALIZAR PESSOA ──────────────────────────────────────────────────────────
router.patch('/pessoas/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { id } = req.params
    const { nome, tipo, cargo, contato, email, valor, obs } = req.body
    // Atualiza somente registros do próprio usuário
    const pessoa = await queryOne(
      `UPDATE pessoas SET
         nome = COALESCE($1, nome), tipo = COALESCE($2, tipo),
         cargo = COALESCE($3, cargo), contato = COALESCE($4, contato),
         email = COALESCE($5, email), valor = COALESCE($6, valor), obs = COALESCE($7, obs)
       WHERE id = $8 AND org_id = $9 AND user_id = $10 RETURNING *`,
      [nome || null, tipo || null, cargo || null, contato || null, email || null, valor || null, obs || null, id, orgId, userId]
    )
    if (!pessoa) { res.status(404).json({ error: 'Pessoa não encontrada ou sem permissão.' }); return }
    res.json({ pessoa })
  } catch (err) {
    console.error('[EQUIPE] Erro ao atualizar pessoa:', err)
    res.status(500).json({ error: 'Erro ao atualizar pessoa.' })
  }
})

// ── EXCLUIR PESSOA ────────────────────────────────────────────────────────────
router.delete('/pessoas/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const canDeleteAny = canDeleteOrgRecords(role)
    const deleted = await query(
      `DELETE FROM pessoas
       WHERE id = $1 AND org_id = $2 AND ($3::boolean = TRUE OR user_id = $4)
       RETURNING id`,
      [req.params.id, orgId, canDeleteAny, userId]
    ) as any[]
    if (deleted.length === 0) { res.status(404).json({ error: 'Pessoa não encontrada ou sem permissão.' }); return }
    res.json({ ok: true })
  } catch (err) {
    console.error('[EQUIPE] Erro ao excluir pessoa:', err)
    res.status(500).json({ error: 'Erro ao excluir pessoa.' })
  }
})

export default router
