// ── MIDDLEWARE DE AUTENTICAÇÃO JWT ────────────────────────────────────────────
// Exporta: authMiddleware, gestorOnly, gestorOrSubGestorOnly, canManageTeam, canDelegateTask, generateTokens, JwtPayload

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { NEXUS_RELEASE } from '../release'

const JWT_SECRET             = process.env.JWT_SECRET             || 'nexus-secret-dev'
const JWT_REFRESH_SECRET     = process.env.JWT_REFRESH_SECRET     || 'nexus-refresh-secret-dev'
const JWT_EXPIRES_IN         = process.env.JWT_EXPIRES_IN         || '15m'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '365d'

// FIX63: opção (desligada por padrão) para forçar todo mundo a logar de novo
// quando uma atualização de verdade sobe -- ver comentário completo em
// db/migrate.ts, onde a decisão de "isso é uma release nova?" é tomada. Aqui
// só embutimos a release em todo token emitido e, se a opção estiver ligada,
// recusamos qualquer token de uma release diferente da atual. Desligada
// (padrão), o comportamento é idêntico ao de sempre -- zero mudança.
const FORCE_RELOGIN_ON_DEPLOY = process.env.FORCE_RELOGIN_ON_DEPLOY === 'true'

export type UserRole = 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'

export interface JwtPayload {
  userId: string
  orgId:  string
  role:   UserRole
  nome?:  string
  email?: string
  rel?:   string
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
  const payloadComRelease = { ...payload, rel: NEXUS_RELEASE }
  const accessToken  = jwt.sign(payloadComRelease, JWT_SECRET,         { expiresIn: JWT_EXPIRES_IN as any })
  const refreshToken = jwt.sign(payloadComRelease, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN as any })
  return { accessToken, refreshToken }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido.' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    if (!decoded?.userId || !decoded?.orgId || !decoded?.role) {
      res.status(401).json({ error: 'Token inválido.' })
      return
    }
    if (FORCE_RELOGIN_ON_DEPLOY && decoded.rel !== NEXUS_RELEASE) {
      res.status(401).json({ error: 'O sistema foi atualizado. Faça login novamente.', code: 'RELOGIN_REQUIRED' })
      return
    }
    req.user = decoded
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expirado. Faça login novamente.' })
    } else {
      res.status(401).json({ error: 'Token inválido.' })
    }
  }
}

// ── TICKET DE CONEXÃO SSE ─────────────────────────────────────────────────────
// EventSource não manda header Authorization, então a conexão precisa de
// autenticação via query string. Antes isso era o access token completo
// (15 min, válido em qualquer rota) direto na URL -- exposto em logs de
// proxy/CDN, histórico do navegador e header Referer. Em vez disso, emitimos
// um ticket de vida curtíssima (60s) e com escopo único (só serve para abrir
// o /stream), que reduz drasticamente a janela e o raio de exposição, sem
// precisar de um store compartilhado entre réplicas (verificação é stateless,
// com o mesmo JWT_SECRET já usado pelos outros tokens).
const SSE_TICKET_TTL_SECONDS = 60

export function generateSseTicket(payload: { userId: string; orgId: string; role: UserRole }): string {
  return jwt.sign({ ...payload, scope: 'sse' }, JWT_SECRET, { expiresIn: SSE_TICKET_TTL_SECONDS })
}

export function sseTicketMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : null
  if (!ticket) {
    res.status(401).json({ error: 'Ticket de conexão não fornecido.' })
    return
  }
  try {
    const decoded = jwt.verify(ticket, JWT_SECRET) as JwtPayload & { scope?: string }
    if (!decoded?.userId || !decoded?.orgId || !decoded?.role || decoded.scope !== 'sse') {
      res.status(401).json({ error: 'Ticket inválido.' })
      return
    }
    req.user = decoded
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Ticket expirado. Solicite um novo antes de reconectar.' })
    } else {
      res.status(401).json({ error: 'Ticket inválido.' })
    }
  }
}

function requireRoles(roles: UserRole[], message: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado.' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: message })
      return
    }
    next()
  }
}

export const gestorOnly = requireRoles(['admin','dev','gestor'], 'Acesso restrito a gestores.')
export const gestorOrSubGestorOnly = requireRoles(['admin','dev','gestor','sub_gestor'], 'Acesso restrito a gestores ou subgestores.')
export const canManageTeam = requireRoles(['admin','dev','gestor'], 'Acesso restrito para gerenciar equipes.')
export const canDelegateTask = requireRoles(['admin','dev','gestor','sub_gestor'], 'Acesso restrito para delegar tarefas.')

export function isSuperAdmin(role: string | undefined): boolean {
  // No modelo atual, `dev` é o papel exibido na interface como Super Admin.
  return role === 'dev'
}

export function isAdminOrDev(role: string | undefined): boolean {
  return role === 'admin' || isSuperAdmin(role)
}

export const adminOrDevOnly = requireRoles(['admin','dev'], 'Acesso restrito ao administrador ou desenvolvedor.')


export function canDeleteOrgRecords(role: string | undefined): boolean {
  return role === 'admin' || isSuperAdmin(role) || role === 'gestor'
}
