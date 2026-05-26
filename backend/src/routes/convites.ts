/**
 * Rotas de convites — Nexus Gestão
 * Gestor ou sub_gestor geram um link de convite.
 * O convidado acessa o link, define a senha e cria a conta.
 */
import { Router, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'

const router = Router()

// ── CRIAR CONVITE ─────────────────────────────────────────────────────────────
// POST /api/convites
// Apenas gestor e sub_gestor podem convidar
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Membros não podem criar convites.' }); return
    }
    const { email, novoRole = 'membro', cargo } = req.body
    // sub_gestor só pode convidar membros
    if (role === 'sub_gestor' && novoRole !== 'membro') {
      res.status(403).json({ error: 'Sub-gestores só podem convidar membros.' }); return
    }
    const token = randomBytes(32).toString('hex')
    const convite = await queryOne(
      `INSERT INTO convites (org_id, criado_por, email, role, cargo, token)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, token, email, role, cargo, expires_at`,
      [orgId, userId, email?.toLowerCase().trim() || null, novoRole, cargo || null, token]
    )
    const baseUrl = process.env.FRONTEND_URL || 'https://nexus.permupay.com.br'
    const link = `${baseUrl}/convite/${token}`
    res.status(201).json({ convite, link })
  } catch (err) {
    console.error('[CONVITES] Erro ao criar convite:', err)
    res.status(500).json({ error: 'Erro ao criar convite.' })
  }
})

// ── LISTAR CONVITES ───────────────────────────────────────────────────────────
// GET /api/convites
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Acesso negado.' }); return
    }
    const convites = await query(
      `SELECT c.*, p.nome AS criado_por_nome
       FROM convites c
       JOIN profiles p ON p.id = c.criado_por
       WHERE c.org_id = $1
       ORDER BY c.created_at DESC
       LIMIT 50`,
      [orgId]
    )
    res.json({ convites })
  } catch (err) {
    console.error('[CONVITES] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao listar convites.' })
  }
})

// ── VERIFICAR CONVITE (público) ───────────────────────────────────────────────
// GET /api/convites/:token/verificar
router.get('/:token/verificar', async (req: Request, res: Response): Promise<void> => {
  try {
    const convite = await queryOne<{
      id: string; org_id: string; email: string | null; role: string; cargo: string | null;
      usado: boolean; expires_at: string; org_nome?: string
    }>(
      `SELECT c.*, o.nome AS org_nome
       FROM convites c
       JOIN organizacoes o ON o.id = c.org_id
       WHERE c.token = $1`,
      [req.params.token]
    )
    if (!convite) {
      res.status(404).json({ error: 'Convite não encontrado.' }); return
    }
    if (convite.usado) {
      res.status(410).json({ error: 'Este convite já foi utilizado.' }); return
    }
    if (new Date(convite.expires_at) < new Date()) {
      res.status(410).json({ error: 'Este convite expirou.' }); return
    }
    res.json({
      valido: true,
      email: convite.email,
      role: convite.role,
      cargo: convite.cargo,
      org_nome: convite.org_nome,
    })
  } catch (err) {
    console.error('[CONVITES] Erro ao verificar:', err)
    res.status(500).json({ error: 'Erro ao verificar convite.' })
  }
})

// ── ACEITAR CONVITE (público) ─────────────────────────────────────────────────
// POST /api/convites/:token/aceitar
// Body: { nome, senha, email? (se não foi pré-definido) }
router.post('/:token/aceitar', async (req: Request, res: Response): Promise<void> => {
  try {
    const convite = await queryOne<{
      id: string; org_id: string; email: string | null; role: string; cargo: string | null;
      usado: boolean; expires_at: string; criado_por: string;
    }>(
      'SELECT * FROM convites WHERE token = $1',
      [req.params.token]
    )
    if (!convite) {
      res.status(404).json({ error: 'Convite não encontrado.' }); return
    }
    if (convite.usado) {
      res.status(410).json({ error: 'Este convite já foi utilizado.' }); return
    }
    if (new Date(convite.expires_at) < new Date()) {
      res.status(410).json({ error: 'Este convite expirou.' }); return
    }
    const { nome, senha, email: emailBody } = req.body
    const emailFinal = (convite.email || emailBody || '').toLowerCase().trim()
    if (!nome || !senha || !emailFinal) {
      res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' }); return
    }
    if (senha.length < 6) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' }); return
    }
    // Verifica se e-mail já está em uso na org
    const existing = await queryOne(
      'SELECT id FROM profiles WHERE email = $1 AND org_id = $2',
      [emailFinal, convite.org_id]
    )
    if (existing) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado na organização.' }); return
    }
    const senha_hash = await bcrypt.hash(senha, 12)
    // Cria o perfil
    const profile = await queryOne(
      `INSERT INTO profiles (org_id, nome, email, senha_hash, role, cargo, criado_por, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, nome, email, role, cargo`,
      [convite.org_id, nome.trim(), emailFinal, senha_hash, convite.role, convite.cargo || null, convite.criado_por]
    )
    // Marca convite como usado
    await query('UPDATE convites SET usado = TRUE WHERE id = $1', [convite.id])
    res.status(201).json({ ok: true, user: profile })
  } catch (err) {
    console.error('[CONVITES] Erro ao aceitar convite:', err)
    res.status(500).json({ error: 'Erro ao aceitar convite.' })
  }
})

// ── REVOGAR CONVITE ───────────────────────────────────────────────────────────
// DELETE /api/convites/:id
router.delete('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, role } = req.user!
    if (role === 'membro') {
      res.status(403).json({ error: 'Acesso negado.' }); return
    }
    await query('DELETE FROM convites WHERE id = $1 AND org_id = $2', [req.params.id, orgId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[CONVITES] Erro ao revogar:', err)
    res.status(500).json({ error: 'Erro ao revogar convite.' })
  }
})

export default router
