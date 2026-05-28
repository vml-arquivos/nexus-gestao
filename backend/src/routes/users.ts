import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { authMiddleware, gestorOrSubGestorOnly } from '../middleware/auth'
import { query, queryOne } from '../db/pool'

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

function normalizeRole(role: unknown): 'sub_gestor' | 'membro' {
  return role === 'sub_gestor' ? 'sub_gestor' : 'membro'
}

function isAdminOrDev(role: string | undefined): boolean {
  return role === 'admin' || role === 'dev'
}

function isHighAccess(role: string | undefined): boolean {
  return role === 'admin' || role === 'dev' || role === 'gestor' || role === 'sub_gestor'
}

// GET /api/users
// gestor: todos da organização. sub_gestor: ele + comandados. membro: somente ele.
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
    if (role === 'membro') {
      sql += ' AND p.id = $2'
      params.push(userId)
    } else if (role === 'sub_gestor') {
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
// gestor cria sub_gestor ou membro. sub_gestor cria apenas membro. membro não cria.
router.post('/', gestorOrSubGestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { nome, email, senha, cargo } = req.body
    const novoRole = normalizeRole(req.body.role)

    if (role === 'sub_gestor' && novoRole !== 'membro') {
      res.status(403).json({ error: 'Subgestor só pode criar membros.' })
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
router.post('/invite', gestorOrSubGestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const conviteRole = normalizeRole(req.body.role)
    const { nome, email, cargo } = req.body

    if (role === 'sub_gestor' && conviteRole !== 'membro') {
      res.status(403).json({ error: 'Subgestor só pode convidar membros.' })
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
router.patch('/:id', gestorOrSubGestorOnly, async (req: Request, res: Response): Promise<void> => {
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

    if (role === 'sub_gestor') {
      if (id !== userId && target.criado_por !== userId) {
        res.status(403).json({ error: 'Subgestor só edita seus comandados.' })
        return
      }
      if (requestedRole && requestedRole !== 'membro') {
        res.status(403).json({ error: 'Subgestor não pode promover usuários.' })
        return
      }
    }

    if (target.role === 'gestor' && id !== userId) {
      res.status(403).json({ error: 'Não é possível alterar outro gestor.' })
      return
    }

    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (nome !== undefined) { updates.push(`nome = $${idx++}`); params.push(String(nome).trim()) }
    if (cargo !== undefined) { updates.push(`cargo = $${idx++}`); params.push(cargo || null) }
    if (requestedRole !== undefined && role === 'gestor') {
      const r = normalizeRole(requestedRole)
      updates.push(`role = $${idx++}`); params.push(r)
    }
    if (ativo !== undefined && role === 'gestor' && id !== userId) {
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

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', gestorOrSubGestorOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { id } = req.params
    const target = await queryOne<{ id: string; role: string; criado_por: string | null }>(
      'SELECT id, role, criado_por FROM profiles WHERE id = $1 AND org_id = $2',
      [id, orgId]
    )
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado.' }); return }
    if (id === userId) { res.status(400).json({ error: 'Use a tela de configurações para alterar sua própria senha.' }); return }
    if (role === 'sub_gestor' && target.criado_por !== userId) {
      res.status(403).json({ error: 'Subgestor só redefine senha de seus comandados.' })
      return
    }
    if (target.role === 'gestor') {
      res.status(403).json({ error: 'Não é possível resetar senha de gestor.' })
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
router.delete('/:id', gestorOrSubGestorOnly, async (req: Request, res: Response): Promise<void> => {
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

    // Exclusão definitiva de usuários é uma ação sensível.
    // Admin/dev podem apagar qualquer usuário da própria organização, exceto a si mesmos.
    // Gestor/subgestor mantêm compatibilidade antiga, mas não podem apagar perfis altos.
    if (!isAdminOrDev(role)) {
      if (target.role === 'admin' || target.role === 'dev' || target.role === 'gestor' || target.role === 'sub_gestor') {
        res.status(403).json({ error: 'Apenas admin ou dev podem apagar este usuário.' })
        return
      }
      if (role === 'sub_gestor' && target.criado_por !== userId) {
        res.status(403).json({ error: 'Subgestor só apaga seus comandados.' })
        return
      }
    }

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
