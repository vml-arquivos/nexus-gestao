// ── MIDDLEWARE DE AUTENTICAÇÃO JWT ────────────────────────────────────────────
// Exporta: authMiddleware, gestorOnly, gestorOrSubGestorOnly, canManageTeam, canDelegateTask, generateTokens, JwtPayload

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET             = process.env.JWT_SECRET             || 'nexus-secret-dev'
const JWT_REFRESH_SECRET     = process.env.JWT_REFRESH_SECRET     || 'nexus-refresh-secret-dev'
const JWT_EXPIRES_IN         = process.env.JWT_EXPIRES_IN         || '15m'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'

export type UserRole = 'gestor' | 'sub_gestor' | 'membro'

export interface JwtPayload {
  userId: string
  orgId:  string
  role:   UserRole
  nome?:  string
  email?: string
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
  const accessToken  = jwt.sign(payload, JWT_SECRET,         { expiresIn: JWT_EXPIRES_IN as any })
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN as any })
  return { accessToken, refreshToken }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  const queryToken = typeof req.query._t === 'string' ? req.query._t : null

  if (!authHeader?.startsWith('Bearer ') && !queryToken) {
    res.status(401).json({ error: 'Token de autenticação não fornecido.' })
    return
  }

  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken!

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    if (!decoded?.userId || !decoded?.orgId || !decoded?.role) {
      res.status(401).json({ error: 'Token inválido.' })
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

export const gestorOnly = requireRoles(['gestor'], 'Acesso restrito a gestores.')
export const gestorOrSubGestorOnly = requireRoles(['gestor','sub_gestor'], 'Acesso restrito a gestores ou subgestores.')
export const canManageTeam = requireRoles(['gestor'], 'Acesso restrito para gerenciar equipes.')
export const canDelegateTask = requireRoles(['gestor','sub_gestor'], 'Acesso restrito para delegar tarefas.')
