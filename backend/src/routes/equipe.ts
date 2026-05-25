import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware } from '../middleware/auth'

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
        (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = p.id AND t.status NOT IN ('concluida','cancelada')) AS tarefas_pendentes,
        (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = p.id AND t.status = 'concluida') AS tarefas_concluidas
      FROM profiles p
      LEFT JOIN profiles c ON c.id = p.criado_por
      WHERE p.org_id = $1 AND p.ativo = TRUE
    `
    const params: unknown[] = [orgId]

    if (role === 'sub_gestor') {
      sql += ' AND (p.id = $2 OR p.criado_por = $2)'
      params.push(userId)
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
    const { orgId } = req.user!
    const { tipo, search } = req.query
    let sql = 'SELECT * FROM pessoas WHERE org_id = $1'
    const params: unknown[] = [orgId]
    let idx = 2
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
    const { orgId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Membros não podem criar pessoas.' }); return
    }
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
router.patch('/pessoas/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Membros não podem editar pessoas.' }); return
    }
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
router.delete('/pessoas/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, role } = req.user!
    if (role !== 'gestor') {
      res.status(403).json({ error: 'Apenas o gestor pode remover pessoas.' }); return
    }
    await query('DELETE FROM pessoas WHERE id = $1 AND org_id = $2', [req.params.id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[EQUIPE] Erro ao excluir pessoa:', err)
    res.status(500).json({ error: 'Erro ao excluir pessoa.' })
  }
})

export default router
