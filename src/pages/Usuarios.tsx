import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { buildUploadUrl, createSecureMulterUpload, removeUploadByUrl, uploadErrorMessage } from '../lib/uploadSecurity'

const router = Router()
router.use(authMiddleware)

function gerarSenhaProvisoria() {
  return crypto.randomBytes(6).toString('base64url') + 'A1'
}

function gerarTokenConvite() {
  return crypto.randomBytes(32).toString('hex')
}

function baseUrl(req: Request) {
  return process.env.FRONTEND_URL || `${req.protocol}://${req.get('host') || 'localhost:5173'}`
}

type Role = 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'

function normalizeRole(role: unknown): Role {
  if (role === 'admin' || role === 'dev' || role === 'gestor' || role === 'sub_gestor' || role === 'membro') return role
  return 'membro'
}

function isGlobalDeleteRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'dev' || role === 'gestor'
}

function canCreateRole(currentRole: string | undefined, targetRole: Role): boolean {
  if (currentRole === 'dev') return ['admin', 'gestor', 'sub_gestor', 'membro'].includes(targetRole)
  if (currentRole === 'admin') return ['gestor', 'sub_gestor', 'membro'].includes(targetRole)
  if (currentRole === 'gestor') return ['sub_gestor', 'membro'].includes(targetRole)
  if (currentRole === 'sub_gestor') return targetRole === 'membro'
  // Membro não possui papel abaixo dele; mantemos criação de membro subordinado para cumprir a regra de criar usuários abaixo sem dar acesso global.
  if (currentRole === 'membro') return targetRole === 'membro'
  return false
}

function canManageTarget(currentRole: string | undefined, targetRole: string, isOwnSubordinate = true): boolean {
  if (currentRole === 'dev') return targetRole !== 'dev'
  if (currentRole === 'admin') return targetRole !== 'dev' && targetRole !== 'admin'
  // Gestor administra membros e subgestores da organização, sem acessar admin/dev/outro gestor.
  if (currentRole === 'gestor') return targetRole === 'sub_gestor' || targetRole === 'membro'
  if (currentRole === 'sub_gestor') return targetRole === 'membro' && isOwnSubordinate
  if (currentRole === 'membro') return targetRole === 'membro' && isOwnSubordinate
  return false
}

const avatarUpload = createSecureMulterUpload({ limits: { fileSize: 5 * 1024 * 1024 } })
const uploadAvatar = (req: Request, res: Response, next: NextFunction) => {
  avatarUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: uploadErrorMessage(err) }); return }
    next()
  })
}

interface AvatarRequest extends Request {
  file?: Express.Multer.File
}

async function getTargetForManagement(id: string, orgId: string) {
  return queryOne<{ id: string; role: string; criado_por: string | null; avatar_url: string | null }>(
    'SELECT id, role, criado_por, avatar_url FROM profiles WHERE id = $1 AND org_id = $2',
    [id, orgId],
  )
}

function mayEditTarget(currentUserId: string, currentRole: string | undefined, target: { id: string; role: string; criado_por: string | null }) {
  if (target.id === currentUserId) return true
  return canManageTarget(currentRole, target.role, target.criado_por === currentUserId)
}

// GET /api/users
// dev/admin/gestor: todos da organização. sub_gestor e membro: ele + usuários criados por ele.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    let sql = `
      SELECT p.id, p.org_id, p.nome, p.email, p.role, p.cargo, p.avatar_url, p.ativo,
             p.primeiro_acesso, p.criado_por, p.created_at, p.updated_at,
             c.nome AS criado_por_nome
      FROM profiles p
      LEFT JOIN profiles c ON c.id = p.criado_por
      WHERE p.org_id = $1
    `
    const params: unknown[] = [orgId]
    if (role === 'membro' || role === 'sub_gestor') {
      sql += ' AND (p.id = $2 OR p.criado_por = $2)'
      params.push(userId)
    }
    sql += ' ORDER BY p.ativo DESC, p.role, p.nome'
    const users = await query(sql, params)
    res.json({ users })
  } catch (err) {
    console.error('[USERS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao listar usuários.' })
  }
})

// POST /api/users
// todos criam usuários conforme hierarquia: dev até admin; admin até gestor; gestor até sub_gestor; sub_gestor/membro apenas membro.
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { nome, email, senha, cargo } = req.body
    const novoRole = normalizeRole(req.body.role)

    if (!canCreateRole(role, novoRole)) {
      res.status(403).json({ error: 'Você só pode criar usuários abaixo do seu nível de acesso.' })
      return
    }
    if (!nome?.trim() || !email?.trim()) {
      res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' })
      return
    }

    const normalizedEmail = String(email).toLowerCase().trim()
    const exists = await queryOne('SELECT id FROM profiles WHERE email = $1', [normalizedEmail])
    if (exists) {
      res.status(409).json({ error: 'E-mail já cadastrado.' })
      return
    }

    const senhaProvisoria = senha?.trim() || gerarSenhaProvisoria()
    const senhaHash = await bcrypt.hash(senhaProvisoria, 12)

    const user = await queryOne(
      `INSERT INTO profiles (org_id, nome, email, senha_hash, role, cargo, criado_por, ativo, primeiro_acesso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,TRUE)
       RETURNING id, org_id, nome, email, role, cargo, avatar_url, ativo, primeiro_acesso, criado_por, created_at, updated_at`,
      [orgId, nome.trim(), normalizedEmail, senhaHash, novoRole, cargo || null, userId]
    )

    res.status(201).json({ user, senha: senhaProvisoria, senha_provisoria: senhaProvisoria })
  } catch (err) {
    console.error('[USERS] Erro ao criar:', err)
    res.status(500).json({ error: 'Erro ao criar usuário.' })
  }
})

// POST /api/users/invite
// Cria convite por link. Opcionalmente pode já criar placeholder inativo se email informado.
router.post('/invite', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const conviteRole = normalizeRole(req.body.role)
    const { nome, email, cargo } = req.body

    if (!canCreateRole(role, conviteRole)) {
      res.status(403).json({ error: 'Você só pode convidar usuários abaixo do seu nível de acesso.' })
      return
    }

    const token = gerarTokenConvite()
    const normalizedEmail = email ? String(email).toLowerCase().trim() : null
    if (normalizedEmail) {
      const exists = await queryOne('SELECT id FROM profiles WHERE email = $1', [normalizedEmail])
      if (exists) {
        res.status(409).json({ error: 'E-mail já cadastrado.' })
        return
      }
    }

    const convite = await queryOne(
      `INSERT INTO convites (org_id, criado_por, nome, email, role, cargo, token, usado, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,NOW() + INTERVAL '7 days')
       RETURNING id, org_id, nome, email, role, cargo, token, expires_at, created_at`,
      [orgId, userId, nome?.trim() || null, normalizedEmail, conviteRole, cargo || null, token]
    )
    const link = `${baseUrl(req).replace(/\/$/, '')}/convite/${token}`
    res.status(201).json({ convite, link })
  } catch (err) {
    console.error('[USERS] Erro ao gerar convite:', err)
    res.status(500).json({ error: 'Erro ao gerar convite.' })
  }
})

// PATCH /api/users/:id
router.patch('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const { nome, cargo, role: bodyRole, novoRole, ativo } = req.body
    const requestedRole = bodyRole ?? novoRole

    const target = await queryOne<{ id: string; role: string; criado_por: string | null }>(
      'SELECT id, role, criado_por FROM profiles WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }

    const isOwnSubordinate = id === userId || target.criado_por === userId
    if (id !== userId && !canManageTarget(role, target.role, isOwnSubordinate)) {
      res.status(403).json({ error: 'Você não tem permissão para alterar este usuário.' })
      return
    }
    if (requestedRole !== undefined) {
      if (id === userId) {
        res.status(403).json({ error: 'Você não pode alterar sua própria permissão.' })
        return
      }
      const nextRole = normalizeRole(requestedRole)
      if (!canCreateRole(role, nextRole)) {
        res.status(403).json({ error: 'Você só pode definir permissões abaixo do seu nível de acesso.' })
        return
      }
    }

    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (nome !== undefined) {
      const normalizedName = String(nome).trim()
      if (!normalizedName) { res.status(400).json({ error: 'Nome é obrigatório.' }); return }
      updates.push(`nome = $${idx++}`); params.push(normalizedName)
    }
    if (cargo !== undefined) { updates.push(`cargo = $${idx++}`); params.push(cargo || null) }
    if (requestedRole !== undefined) {
      const r = normalizeRole(requestedRole)
      updates.push(`role = $${idx++}`); params.push(r)
    }
    if (ativo !== undefined && id !== userId) {
      updates.push(`ativo = $${idx++}`); params.push(Boolean(ativo))
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar.' })
      return
    }
    params.push(id, orgId)
    const user = await queryOne(
      `UPDATE profiles SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND org_id = $${idx}
       RETURNING id, org_id, nome, email, role, cargo, avatar_url, ativo, primeiro_acesso, criado_por, created_at, updated_at`,
      params
    )
    res.json({ user })
  } catch (err) {
    console.error('[USERS] Erro ao atualizar:', err)
    res.status(500).json({ error: 'Erro ao atualizar usuário.' })
  }
})

// POST /api/users/:id/avatar — envia ou substitui foto de perfil
router.post('/:id/avatar', uploadAvatar, async (req: AvatarRequest, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const target = await getTargetForManagement(id, orgId)
    if (!target) {
      if (req.file) removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(404).json({ error: 'Usuário não encontrado.' })
      return
    }
    if (!mayEditTarget(userId, role, target)) {
      if (req.file) removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(403).json({ error: 'Você não tem permissão para alterar a foto deste usuário.' })
      return
    }
    if (!req.file) { res.status(400).json({ error: 'Selecione uma imagem.' }); return }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(req.file.mimetype)) {
      removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(400).json({ error: 'Use uma imagem PNG, JPG, JPEG ou WEBP.' })
      return
    }

    const avatarUrl = buildUploadUrl(req.file.filename)
    const user = await queryOne(
      `UPDATE profiles SET avatar_url = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3
       RETURNING id, org_id, nome, email, role, cargo, avatar_url, ativo, primeiro_acesso, criado_por, created_at, updated_at`,
      [avatarUrl, id, orgId],
    )
    if (target.avatar_url && target.avatar_url !== avatarUrl) removeUploadByUrl(target.avatar_url)
    res.json({ user })
  } catch (err) {
    if (req.file) removeUploadByUrl(buildUploadUrl(req.file.filename))
    console.error('[USERS] Erro ao atualizar avatar:', err)
    res.status(500).json({ error: 'Erro ao atualizar foto do usuário.' })
  }
})

// DELETE /api/users/:id/avatar — remove foto de perfil
router.delete('/:id/avatar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const target = await getTargetForManagement(req.params.id, orgId)
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }
    if (!mayEditTarget(userId, role, target)) {
      res.status(403).json({ error: 'Você não tem permissão para remover a foto deste usuário.' })
      return
    }
    const user = await queryOne(
      `UPDATE profiles SET avatar_url = NULL, updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING id, org_id, nome, email, role, cargo, avatar_url, ativo, primeiro_acesso, criado_por, created_at, updated_at`,
      [req.params.id, orgId],
    )
    removeUploadByUrl(target.avatar_url)
    res.json({ user })
  } catch (err) {
    console.error('[USERS] Erro ao remover avatar:', err)
    res.status(500).json({ error: 'Erro ao remover foto do usuário.' })
  }
})

// PATCH /api/users/:id/password — o próprio usuário altera com senha atual;
// gestor/admin/dev autorizado pode definir uma senha nova para subordinado.
router.patch('/:id/password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const novaSenha = String(req.body.novaSenha || '')
    const senhaAtual = String(req.body.senhaAtual || '')
    if (novaSenha.length < 6) {
      res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' })
      return
    }
    const target = await queryOne<{ id: string; role: string; criado_por: string | null; senha_hash: string }>(
      'SELECT id, role, criado_por, senha_hash FROM profiles WHERE id = $1 AND org_id = $2',
      [id, orgId],
    )
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }

    if (id === userId) {
      if (!senhaAtual || !(await bcrypt.compare(senhaAtual, target.senha_hash))) {
        res.status(401).json({ error: 'Senha atual incorreta.' })
        return
      }
    } else if (!canManageTarget(role, target.role, target.criado_por === userId)) {
      res.status(403).json({ error: 'Você não tem permissão para alterar a senha deste usuário.' })
      return
    }

    const senhaHash = await bcrypt.hash(novaSenha, 12)
    await query(
      `UPDATE profiles SET senha_hash = $1, primeiro_acesso = FALSE, updated_at = NOW()
       WHERE id = $2 AND org_id = $3`,
      [senhaHash, id, orgId],
    )
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error('[USERS] Erro ao alterar senha:', err)
    res.status(500).json({ error: 'Erro ao alterar senha.' })
  }
})

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const target = await queryOne<{ id: string; role: string; criado_por: string | null }>(
      'SELECT id, role, criado_por FROM profiles WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }
    if (id === userId) { res.status(400).json({ error: 'Use a tela de configurações para alterar sua própria senha.' }); return }
    if (!canManageTarget(role, target.role, target.criado_por === userId)) {
      res.status(403).json({ error: 'Você não tem permissão para redefinir senha deste usuário.' })
      return
    }
    const senhaProvisoria = gerarSenhaProvisoria()
    const senhaHash = await bcrypt.hash(senhaProvisoria, 12)
    const user = await queryOne(
      `UPDATE profiles SET senha_hash = $1, primeiro_acesso = TRUE, updated_at = NOW()
       WHERE id = $2 AND org_id = $3
       RETURNING id, org_id, nome, email, role, cargo, ativo, primeiro_acesso`,
      [senhaHash, id, orgId]
    )
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id])
    res.json({ user, senha: senhaProvisoria, senha_provisoria: senhaProvisoria })
  } catch (err) {
    console.error('[USERS] Erro ao resetar senha:', err)
    res.status(500).json({ error: 'Erro ao resetar senha.' })
  }
})

// DELETE /api/users/:id -> apaga permanentemente usuário e dados privados vinculados
router.delete('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params

    if (id === userId) {
      res.status(400).json({ error: 'Você não pode apagar a si mesmo.' })
      return
    }

    const target = await queryOne<{ id: string; role: string; criado_por: string | null; email?: string }>(
      'SELECT id, role, criado_por, email FROM profiles WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }

    // Admin/dev/gestor têm poder de exclusão dentro da organização.
    // Subgestor/membro só apagam usuários criados por eles e abaixo do seu nível.
    if (!isGlobalDeleteRole(role) && !canManageTarget(role, target.role, target.criado_por === userId)) {
      res.status(403).json({ error: 'Você não tem permissão para apagar este usuário.' })
      return
    }
    if (role === 'gestor' && (target.role === 'admin' || target.role === 'dev')) {
      res.status(403).json({ error: 'Gestor não pode apagar admin ou dev.' })
      return
    }

    const taskFilesToRemove = await query<{ arquivo_url?: string }>(
      `SELECT arquivo_url FROM tarefa_anexos
       WHERE org_id = $1
         AND tarefa_id IN (SELECT id FROM tarefas WHERE org_id = $1 AND (criado_por = $2 OR responsavel_id = $2))`,
      [orgId, id]
    ).catch(() => []) as { arquivo_url?: string }[]
    const docFilesToRemove = await query<{ arquivo_url?: string }>(
      'SELECT arquivo_url FROM documentos WHERE criado_por = $1 AND org_id = $2',
      [id, orgId]
    ).catch(() => []) as { arquivo_url?: string }[]

    // Limpeza intencional para permitir apagar usuário sem violar FKs e sem manter dados privados órfãos.
    // Mantemos tudo dentro de uma transação para evitar exclusão parcial.
    await query('BEGIN')
    try {
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id])
      await query('DELETE FROM notificacoes WHERE user_id = $1 AND org_id = $2', [id, orgId]).catch(() => {})
      await query('DELETE FROM equipes_membros WHERE user_id = $1 AND org_id = $2', [id, orgId]).catch(() => {})
      await query('DELETE FROM equipes_membros WHERE profile_id = $1', [id]).catch(() => {})

      // Histórico e anexos vinculados às tarefas do usuário antes de apagar as tarefas.
      await query(
        `DELETE FROM tarefa_anexos
         WHERE org_id = $1
           AND tarefa_id IN (SELECT id FROM tarefas WHERE org_id = $1 AND (criado_por = $2 OR responsavel_id = $2))`,
        [orgId, id]
      ).catch(() => {})
      await query(
        `DELETE FROM tarefas_historico
         WHERE org_id = $1
           AND (user_id = $2 OR tarefa_id IN (SELECT id FROM tarefas WHERE org_id = $1 AND (criado_por = $2 OR responsavel_id = $2)))`,
        [orgId, id]
      ).catch(() => {})
      await query('DELETE FROM tarefa_historico WHERE org_id = $1 AND usuario_id = $2', [orgId, id]).catch(() => {})

      // Apaga tarefas criadas por ele ou atribuídas a ele.
      await query('DELETE FROM tarefas WHERE org_id = $1 AND (criado_por = $2 OR responsavel_id = $2)', [orgId, id]).catch(() => {})

      // Apaga dados privados do usuário removido.
      await query('DELETE FROM documentos WHERE criado_por = $1 AND org_id = $2', [id, orgId]).catch(() => {})
      await query('DELETE FROM pagamentos_historico WHERE user_id = $1 AND org_id = $2', [id, orgId]).catch(() => {})
      await query('DELETE FROM pagamentos WHERE criado_por = $1 AND org_id = $2', [id, orgId]).catch(() => {})
      await query('DELETE FROM agenda WHERE criado_por = $1 AND org_id = $2', [id, orgId]).catch(() => {})
      await query('DELETE FROM pessoas WHERE user_id = $1 AND org_id = $2', [id, orgId]).catch(() => {})

      // Convites criados por ele deixam de apontar para usuário apagado.
      await query('DELETE FROM convites WHERE org_id = $1 AND criado_por = $2', [orgId, id]).catch(() => {})
      await query('UPDATE profiles SET criado_por = NULL WHERE criado_por = $1 AND org_id = $2', [id, orgId]).catch(() => {})

      await query('DELETE FROM profiles WHERE id = $1 AND org_id = $2', [id, orgId])
      await query('COMMIT')
      for (const file of [...taskFilesToRemove, ...docFilesToRemove]) removeUploadByUrl(file.arquivo_url)
    } catch (cleanupErr) {
      await query('ROLLBACK').catch(() => {})
      throw cleanupErr
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[USERS] Erro ao apagar:', err)
    res.status(500).json({ error: 'Erro ao apagar usuário.' })
  }
})

// GET /api/users/meus-comandados
router.get('/meus-comandados', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const users = await query(
      `SELECT id, org_id, nome, email, role, cargo, avatar_url, ativo, primeiro_acesso, criado_por
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
