// ── MIDDLEWARE DE AUTENTICAÇÃO JWT ────────────────────────────────────────────
// Exporta: authMiddleware, gestorOnly, generateTokens, JwtPayload
// Usado por todas as rotas da API

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET             = process.env.JWT_SECRET             || 'nexus-secret-dev'
const JWT_REFRESH_SECRET     = process.env.JWT_REFRESH_SECRET     || 'nexus-refresh-secret-dev'
const JWT_EXPIRES_IN         = process.env.JWT_EXPIRES_IN         || '15m'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'

// ── TIPOS ─────────────────────────────────────────────────────────────────────
export interface JwtPayload {
  userId: string
  orgId:  string
  role:   'gestor' | 'sub_gestor' | 'membro'
  nome?:  string
  email?: string
}

// Extende o tipo Request do Express para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

// ── GERAR TOKENS ──────────────────────────────────────────────────────────────
export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
  const accessToken  = jwt.sign(payload, JWT_SECRET,         { expiresIn: JWT_EXPIRES_IN as any })
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN as any })
  return { accessToken, refreshToken }
}

// ── MIDDLEWARE: verifica JWT no header Authorization ──────────────────────────
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido.' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
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

// ── MIDDLEWARE: apenas gestor ou sub_gestor ───────────────────────────────────
export function gestorOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }
  if (req.user.role !== 'gestor' && req.user.role !== 'sub_gestor') {
    res.status(403).json({ error: 'Acesso restrito a gestores.' })
    return
  }
  next()
}
