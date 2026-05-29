import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../db/pool'
import { generateTokens, authMiddleware, JwtPayload } from '../middleware/auth'

const router = Router()

type Role = 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'
function normalizeRole(role: unknown): Role {
  if (role === 'admin' || role === 'dev' || role === 'gestor' || role === 'sub_gestor' || role === 'membro') return role
  return 'membro'
}
function canCreateRole(currentRole: string | undefined, targetRole: Role): boolean {
  if (currentRole === 'dev') return ['admin', 'gestor', 'sub_gestor', 'membro'].includes(targetRole)
  if (currentRole === 'admin') return ['gestor', 'sub_gestor', 'membro'].includes(targetRole)
  if (currentRole === 'gestor') return ['sub_gestor', 'membro'].includes(targetRole)
  if (currentRole === 'sub_gestor') return targetRole === 'membro'
  if (currentRole === 'membro') return targetRole === 'membro'
  return false
}


// ── REGISTRO ──────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { nome, email, senha, role: 'gestor'|'membro', orgNome? (obrigatório para gestor) }
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, email, senha, role = 'membro', orgNome } = req.body

    if (!nome || !email || !senha) {
      res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' })
      return
    }
    if (senha.length < 6) {
      res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' })
      return
    }
    if (role === 'gestor' && !orgNome) {
      res.status(400).json({ error: 'Nome da organização é obrigatório para gestores.' })
      return
    }

    // A partir desta versão, somente gestores podem registrar-se diretamente. Membros
    // devem ser adicionados via convite por um gestor existente. Se alguém tentar
    // registrar um membro sem convite, retornaremos erro.
    if (role === 'membro') {
      res.status(403).json({ error: 'O registro de membros é feito via convite de um gestor. Solicite acesso ao seu gestor.' })
      return
    }

    // Verifica e-mail duplicado
    const existing = await queryOne('SELECT id FROM profiles WHERE email = $1', [email.toLowerCase()])
    if (existing) {
      res.status(409).json({ error: 'E-mail já cadastrado.' })
      return
    }

    const senhaHash = await bcrypt.hash(senha, 12)
    let orgId: string | null = null

    if (role === 'gestor') {
      // Cria a organização
      const orgRows = await query<{ id: string }>(
        'INSERT INTO organizacoes (nome) VALUES ($1) RETURNING id',
        [orgNome.trim()]
      )
      orgId = orgRows[0].id
    }

    // Cria o perfil
    const userRows = await query<{ id: string; nome: string; email: string; role: string; org_id: string }>(
      `INSERT INTO profiles (org_id, nome, email, senha_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, role, org_id`,
      [orgId, nome.trim(), email.toLowerCase().trim(), senhaHash, role]
    )
    const user = userRows[0]

    // Se gestor, atualiza criado_por na organização
    if (role === 'gestor' && orgId) {
      await query('UPDATE organizacoes SET criado_por = $1 WHERE id = $2', [user.id, orgId])
    }

    const payload: JwtPayload = {
      userId: user.id,
      orgId: user.org_id || '',
      role: user.role as any,
      nome: user.nome,
      email: user.email,
    }
    const { accessToken, refreshToken } = generateTokens(payload)

    // Salva refresh token
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken]
    )

    res.status(201).json({
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role, orgId: user.org_id },
      accessToken,
      refreshToken,
    })
  } catch (err) {
    console.error('[AUTH] Erro no registro:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// ── LOGIN ─────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, senha }
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, senha } = req.body
    if (!email || !senha) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
      return
    }

    const user = await queryOne<{
      id: string; nome: string; email: string; senha_hash: string;
      role: string; org_id: string; ativo: boolean
    }>(
      `SELECT p.id, p.nome, p.email, p.senha_hash, p.role, p.org_id, p.ativo
       FROM profiles p WHERE p.email = $1`,
      [email.toLowerCase().trim()]
    )

    if (!user || !user.ativo) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' })
      return
    }

    const senhaOk = await bcrypt.compare(senha, user.senha_hash)
    if (!senhaOk) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' })
      return
    }

    const payload: JwtPayload = {
      userId: user.id,
      orgId: user.org_id || '',
      role: user.role as any,
      nome: user.nome,
      email: user.email,
    }
    const { accessToken, refreshToken } = generateTokens(payload)

    // Salva refresh token (remove antigos do usuário)
    await query('DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < NOW()', [user.id])
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken]
    )

    res.json({
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role, orgId: user.org_id },
      accessToken,
      refreshToken,
    })
  } catch (err) {
    console.error('[AUTH] Erro no login:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// ── REFRESH TOKEN ─────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// Body: { refreshToken }
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token não fornecido.' })
      return
    }

    const stored = await queryOne<{ user_id: string; expires_at: string }>(
      'SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    )
    if (!stored || new Date(stored.expires_at) < new Date()) {
      res.status(401).json({ error: 'Refresh token inválido ou expirado.' })
      return
    }

    const user = await queryOne<{ id: string; nome: string; email: string; role: string; org_id: string }>(
      'SELECT id, nome, email, role, org_id FROM profiles WHERE id = $1 AND ativo = TRUE',
      [stored.user_id]
    )
    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado.' })
      return
    }

    const payload: JwtPayload = {
      userId: user.id,
      orgId: user.org_id || '',
      role: user.role as any,
      nome: user.nome,
      email: user.email,
    }
    const tokens = generateTokens(payload)

    // Rotaciona o refresh token
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken])
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, tokens.refreshToken]
    )

    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
  } catch (err) {
    console.error('[AUTH] Erro no refresh:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// ── ME ────────────────────────────────────────────────────────────────────────
// GET /api/auth/me  (requer Bearer token)
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await queryOne<{ id: string; nome: string; email: string; role: string; org_id: string; avatar_url: string }>(
      `SELECT p.id, p.nome, p.email, p.role, p.org_id, p.avatar_url,
              o.nome AS org_nome
       FROM profiles p
       LEFT JOIN organizacoes o ON o.id = p.org_id
       WHERE p.id = $1`,
      [req.user!.userId]
    )
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado.' })
      return
    }
    res.json({ user })
  } catch (err) {
    console.error('[AUTH] Erro no /me:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// ── ATUALIZAR PERFIL ─────────────────────────────────────────────────────────
// PATCH /api/auth/me
// Body: { nome }
router.patch('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome } = req.body
    if (!nome || !nome.trim()) {
      res.status(400).json({ error: 'Nome é obrigatório.' })
      return
    }
    const updated = await queryOne<{ id: string; nome: string; email: string; role: string; org_id: string; avatar_url: string }>(
      `UPDATE profiles SET nome = $1 WHERE id = $2
       RETURNING id, nome, email, role, org_id, avatar_url`,
      [nome.trim(), req.user!.userId]
    )
    res.json({ user: updated })
  } catch (err) {
    console.error('[AUTH] Erro no PATCH /me:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// ── ALTERAR SENHA ─────────────────────────────────────────────────────────────
// PATCH /api/auth/me/password
// Body: { senhaAtual, novaSenha }
router.patch('/me/password', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { senhaAtual, novaSenha } = req.body
    if (!senhaAtual || !novaSenha) {
      res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' })
      return
    }
    if (novaSenha.length < 6) {
      res.status(400).json({ error: 'Nova senha deve ter ao menos 6 caracteres.' })
      return
    }
    const profile = await queryOne<{ senha_hash: string }>(
      'SELECT senha_hash FROM profiles WHERE id = $1', [req.user!.userId]
    )
    if (!profile) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }
    const ok = await bcrypt.compare(senhaAtual, profile.senha_hash)
    if (!ok) { res.status(401).json({ error: 'Senha atual incorreta.' }); return }
    const novoHash = await bcrypt.hash(novaSenha, 12)
    await query('UPDATE profiles SET senha_hash = $1 WHERE id = $2', [novoHash, req.user!.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[AUTH] Erro no PATCH /me/password:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// ── LOGOUT ────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// Body: { refreshToken }
router.post('/logout', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken])
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[AUTH] Erro no logout:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})


// ── CONVITE POR LINK ─────────────────────────────────────────────────────────
// POST /api/auth/invite
// Body: { nome?, email?, role?, cargo? }
router.post('/invite', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const role = normalizeRole(req.body.role)
    if (!canCreateRole(req.user!.role, role)) {
      res.status(403).json({ error: 'Você só pode convidar usuários abaixo do seu nível de acesso.' })
      return
    }

    const email = req.body.email ? String(req.body.email).toLowerCase().trim() : null
    const nome = req.body.nome ? String(req.body.nome).trim() : null
    const cargo = req.body.cargo || null
    if (email) {
      const existing = await queryOne('SELECT id FROM profiles WHERE email = $1', [email])
      if (existing) {
        res.status(409).json({ error: 'E-mail já cadastrado.' })
        return
      }
    }

    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const convite = await queryOne(
      `INSERT INTO convites (org_id, criado_por, nome, email, role, cargo, token, usado, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,NOW() + INTERVAL '7 days')
       RETURNING id, org_id, nome, email, role, cargo, token, expires_at, created_at`,
      [req.user!.orgId, req.user!.userId, nome, email, role, cargo, token]
    )
    const base = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host') || 'localhost:5173'}`
    const link = `${base.replace(/\/$/, '')}/convite/${token}`
    res.status(201).json({ convite, link })
  } catch (err) {
    console.error('[AUTH] Erro no convite:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// GET /api/auth/invite/:token — dados públicos do convite
router.get('/invite/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const convite = await queryOne(
      `SELECT c.id, c.nome, c.email, c.role, c.cargo, c.expires_at, c.usado, o.nome AS org_nome
       FROM convites c
       JOIN organizacoes o ON o.id = c.org_id
       WHERE c.token = $1`,
      [req.params.token]
    )
    if (!convite || (convite as any).usado || new Date((convite as any).expires_at) < new Date()) {
      res.status(404).json({ error: 'Convite inválido ou expirado.' })
      return
    }
    res.json({ convite })
  } catch (err) {
    console.error('[AUTH] Erro ao consultar convite:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

// POST /api/auth/accept-invite
// Body: { token, nome?, email?, senha }
router.post('/accept-invite', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, senha } = req.body
    const nomeBody = req.body.nome ? String(req.body.nome).trim() : null
    const emailBody = req.body.email ? String(req.body.email).toLowerCase().trim() : null
    if (!token || !senha || String(senha).length < 6) {
      res.status(400).json({ error: 'Token e senha com pelo menos 6 caracteres são obrigatórios.' })
      return
    }

    const convite = await queryOne<any>(
      `SELECT * FROM convites WHERE token = $1`,
      [token]
    )
    if (!convite || convite.usado || new Date(convite.expires_at) < new Date()) {
      res.status(404).json({ error: 'Convite inválido ou expirado.' })
      return
    }

    const nome = nomeBody || convite.nome
    const email = emailBody || convite.email
    if (!nome || !email) {
      res.status(400).json({ error: 'Nome e e-mail são obrigatórios para aceitar o convite.' })
      return
    }

    const exists = await queryOne('SELECT id FROM profiles WHERE email = $1', [email])
    if (exists) {
      res.status(409).json({ error: 'E-mail já cadastrado.' })
      return
    }

    const senhaHash = await bcrypt.hash(String(senha), 12)
    const user = await queryOne<any>(
      `INSERT INTO profiles (org_id, nome, email, senha_hash, role, cargo, criado_por, ativo, primeiro_acesso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,FALSE)
       RETURNING id, org_id, nome, email, role, cargo, ativo, primeiro_acesso`,
      [convite.org_id, nome, email, senhaHash, convite.role || 'membro', convite.cargo || null, convite.criado_por]
    )
    await query('UPDATE convites SET usado = TRUE WHERE id = $1', [convite.id])

    const payload: JwtPayload = {
      userId: user.id,
      orgId: user.org_id || '',
      role: user.role as any,
      nome: user.nome,
      email: user.email,
    }
    const { accessToken, refreshToken } = generateTokens(payload)
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken]
    )
    res.status(201).json({ user: { id: user.id, nome: user.nome, email: user.email, role: user.role, orgId: user.org_id }, accessToken, refreshToken })
  } catch (err) {
    console.error('[AUTH] Erro ao aceitar convite:', err)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})

export default router
