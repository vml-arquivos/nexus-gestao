import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware, gestorOnly } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// ── LISTAR MEMBROS DA ORGANIZAÇÃO ─────────────────────────────────────────────
// GET /api/equipe
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const membros = await query(
      `SELECT p.id, p.nome, p.email, p.role, p.avatar_url, p.created_at,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'concluida') AS tarefas_pendentes,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'concluida') AS tarefas_concluidas
       FROM profiles p
       LEFT JOIN tarefas t ON t.responsavel_id = p.id AND t.org_id = $1
       WHERE p.org_id = $1 AND p.ativo = TRUE
       GROUP BY p.id
       ORDER BY p.role DESC, p.nome ASC`,
      [orgId]
    )
    res.json({ membros })
  } catch (err) {
    console.error('[EQUIPE] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar equipe.' })
  }
})

// ── LISTAR PESSOAS (contatos, clientes, credores) ─────────────────────────────
// GET /api/equipe/pessoas
router.get('/pessoas', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const { tipo } = req.query
    let sql = 'SELECT * FROM pessoas WHERE org_id = $1'
    const params: unknown[] = [orgId]
    if (tipo) { sql += ' AND tipo = $2'; params.push(tipo) }
    sql += ' ORDER BY nome ASC'
    const pessoas = await query(sql, params)
    res.json({ pessoas })
  } catch (err) {
    console.error('[EQUIPE] Erro ao listar pessoas:', err)
    res.status(500).json({ error: 'Erro ao buscar pessoas.' })
  }
})

// ── CRIAR PESSOA ──────────────────────────────────────────────────────────────
// POST /api/equipe/pessoas  (somente gestor)
router.post('/pessoas', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const { nome, tipo, cargo, contato, email, valor, obs } = req.body
    if (!nome || !tipo) {
      res.status(400).json({ error: 'Nome e tipo são obrigatórios.' })
      return
    }
    const pessoa = await queryOne(
      `INSERT INTO pessoas (org_id, nome, tipo, cargo, contato, email, valor, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orgId, nome.trim(), tipo, cargo || null, contato || null, email || null, valor || null, obs || null]
    )
    res.status(201).json({ pessoa })
  } catch (err) {
    console.error('[EQUIPE] Erro ao criar pessoa:', err)
    res.status(500).json({ error: 'Erro ao criar pessoa.' })
  }
})

// ── ATUALIZAR PESSOA ──────────────────────────────────────────────────────────
// PATCH /api/equipe/pessoas/:id  (somente gestor)
router.patch('/pessoas/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const { id } = req.params
    const { nome, tipo, cargo, contato, email, valor, obs } = req.body
    const pessoa = await queryOne(
      `UPDATE pessoas SET
         nome = COALESCE($1, nome), tipo = COALESCE($2, tipo),
         cargo = COALESCE($3, cargo), contato = COALESCE($4, contato),
         email = COALESCE($5, email), valor = COALESCE($6, valor), obs = COALESCE($7, obs)
       WHERE id = $8 AND org_id = $9 RETURNING *`,
      [nome || null, tipo || null, cargo || null, contato || null, email || null, valor || null, obs || null, id, orgId]
    )
    if (!pessoa) { res.status(404).json({ error: 'Pessoa não encontrada.' }); return }
    res.json({ pessoa })
  } catch (err) {
    console.error('[EQUIPE] Erro ao atualizar pessoa:', err)
    res.status(500).json({ error: 'Erro ao atualizar pessoa.' })
  }
})

// ── EXCLUIR PESSOA ────────────────────────────────────────────────────────────
// DELETE /api/equipe/pessoas/:id  (somente gestor)
router.delete('/pessoas/:id', gestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    await query('DELETE FROM pessoas WHERE id = $1 AND org_id = $2', [req.params.id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[EQUIPE] Erro ao excluir pessoa:', err)
    res.status(500).json({ error: 'Erro ao excluir pessoa.' })
  }
})

export default router
