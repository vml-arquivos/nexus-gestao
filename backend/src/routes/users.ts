import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'

const router = Router()
router.use(authMiddleware)

// ── LISTAR USUÁRIOS ───────────────────────────────────────────────────────────
// GET /api/users
// gestor:     vê todos da organização
// sub_gestor: vê a si mesmo + seus comandados diretos
// membro:     vê apenas a si mesmo
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!

    let sql = `
      SELECT p.id, p.nome, p.email, p.role, p.cargo, p.avatar_url, p.ativo, p.criado_por,
             p.created_at,
             c.nome AS criado_por_nome
      FROM profiles p
      LEFT JOIN profiles c ON c.id = p.criado_por
      WHERE p.org_id = $1 AND p.ativo = TRUE
    `
    const params: unknown[] = [orgId]

    if (role === 'membro') {
      sql += ' AND p.id = $2'
      params.push(userId)
    } else if (role === 'sub_gestor') {
      sql += ' AND (p.id = $2 OR p.criado_por = $2)'
      params.push(userId)
    }

    sql += ' ORDER BY p.role, p.nome'
    const users = await query(sql, params)
    res.json({ users })
  } catch (err) {
    console.error('[USERS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao listar usuários.' })
  }
})

// ── CRIAR USUÁRIO ─────────────────────────────────────────────────────────────
// POST /api/users
// gestor:     pode criar sub_gestor e membro
// sub_gestor: pode criar apenas membro (seus comandados)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!

    if (role === 'membro') {
      res.status(403).json({ error: 'Membros não podem criar usuários.' })
      return
    }

    const { nome, email, role: novoRole, senha, cargo } = req.body
    if (!nome?.trim() || !email?.trim() || !novoRole) {
      res.status(400).json({ error: 'Nome, e-mail e role são obrigatórios.' })
      return
    }

    // sub_gestor não pode criar outro sub_gestor ou gestor
    if (role === 'sub_gestor' && (novoRole === 'sub_gestor' || novoRole === 'gestor')) {
      res.status(403).json({ error: 'Sub-gestor só pode criar membros.' })
      return
    }

    const existing = await queryOne('SELECT id FROM profiles WHERE email = $1', [email.toLowerCase().trim()])
    if (existing) {
      res.status(409).json({ error: 'E-mail já cadastrado.' })
      return
    }

    const plainPassword = senha?.trim() || Math.random().toString(36).slice(-8)
    const senha_hash = await bcrypt.hash(plainPassword, 10)

    const user = await queryOne<{ id: string; nome: string; email: string; role: string; cargo: string }>(
      `INSERT INTO profiles (org_id, nome, email, senha_hash, role, cargo, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nome, email, role, cargo`,
      [orgId, nome.trim(), email.toLowerCase().trim(), senha_hash, novoRole, cargo || null, userId]
    )

    res.status(201).json({ user, senha: plainPassword })
  } catch (err: any) {
    console.error('[USERS] Erro ao criar:', err)
    res.status(400).json({ error: err.message || 'Erro ao criar usuário.' })
  }
})

// ── ATUALIZAR USUÁRIO ─────────────────────────────────────────────────────────
// PATCH /api/users/:id
// gestor: pode alterar role, cargo, nome de qualquer usuário da org
// sub_gestor: pode alterar nome e cargo dos seus comandados
// membro: pode alterar apenas o próprio nome e cargo
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const { nome, cargo, novoRole, ativo } = req.body

    const target = await queryOne<{ id: string; criado_por: string; role: string }>(
      'SELECT id, criado_por, role FROM profiles WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }

    // Membro só edita a si mesmo
    if (role === 'membro' && id !== userId) {
      res.status(403).json({ error: 'Membros só podem editar o próprio perfil.' }); return
    }
    // Sub-gestor só edita seus comandados ou a si mesmo
    if (role === 'sub_gestor' && id !== userId && target.criado_por !== userId) {
      res.status(403).json({ error: 'Sub-gestor só pode editar seus comandados.' }); return
    }
    // Ninguém muda o role do gestor principal
    if (target.role === 'gestor' && novoRole && novoRole !== 'gestor') {
      res.status(403).json({ error: 'Não é possível alterar o role do gestor principal.' }); return
    }

    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (nome !== undefined)    { updates.push(`nome = $${idx++}`);  params.push(nome.trim()) }
    if (cargo !== undefined)   { updates.push(`cargo = $${idx++}`); params.push(cargo || null) }
    if (novoRole !== undefined && role === 'gestor') {
      updates.push(`role = $${idx++}`)
      params.push(novoRole)
    }
    if (ativo !== undefined && role === 'gestor') {
      updates.push(`ativo = $${idx++}`)
      params.push(ativo)
    }

    if (updates.length === 0) { res.status(400).json({ error: 'Nenhum campo para atualizar.' }); return }

    params.push(id, orgId)
    const user = await queryOne(
      `UPDATE profiles SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx++} AND org_id = $${idx} RETURNING id, nome, email, role, cargo, ativo`,
      params
    )
    res.json({ user })
  } catch (err) {
    console.error('[USERS] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar usuário.' })
  }
})

// ── DESATIVAR / REMOVER USUÁRIO ───────────────────────────────────────────────
// DELETE /api/users/:id  (somente gestor)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role !== 'gestor') {
      res.status(403).json({ error: 'Apenas o gestor pode remover usuários.' }); return
    }
    const { id } = req.params
    if (id === userId) {
      res.status(400).json({ error: 'Você não pode remover a si mesmo.' }); return
    }
    const target = await queryOne<{ id: string; role: string }>(
      'SELECT id, role FROM profiles WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }
    if (target.role === 'gestor') {
      res.status(403).json({ error: 'Não é possível remover o gestor principal.' }); return
    }

    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id])
    await query('UPDATE profiles SET ativo = FALSE WHERE id = $1 AND org_id = $2', [id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[USERS] Erro ao remover:', err)
    res.status(500).json({ error: 'Erro ao remover usuário.' })
  }
})

// ── LISTAR COMANDADOS (para sub_gestor montar equipe) ─────────────────────────
// GET /api/users/meus-comandados
router.get('/meus-comandados', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const users = await query(
      `SELECT id, nome, email, role, cargo, avatar_url, ativo
       FROM profiles
       WHERE org_id = $1 AND criado_por = $2 AND ativo = TRUE
       ORDER BY nome`,
      [orgId, userId]
    )
    res.json({ users })
  } catch (err) {
    console.error('[USERS] Erro ao listar comandados:', err)
    res.status(500).json({ error: 'Erro ao listar comandados.' })
  }
})

export default router
