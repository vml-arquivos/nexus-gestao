import { Request, Response, NextFunction } from 'express'
import jwt, { SignOptions } from 'jsonwebtoken'

export type UserRole = 'gestor' | 'sub_gestor' | 'membro'

export interface JwtPayload {
  userId: string
  orgId: string
  role: UserRole
  nome: string
  email: string
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido.' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' })
  }
}

export function gestorOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'gestor') {
    res.status(403).json({ error: 'Acesso restrito a gestores.' })
    return
  }
  next()
}

export function gestorOrSubGestorOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'gestor' && req.user?.role !== 'sub_gestor') {
    res.status(403).json({ error: 'Acesso restrito a gestores e sub-gestores.' })
    return
  }
  next()
}

export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
  const accessOpts: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) || '8h',
  }
  const refreshOpts: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn']) || '30d',
  }

  const accessToken = jwt.sign(payload as object, process.env.JWT_SECRET!, accessOpts)
  const refreshToken = jwt.sign(
    { userId: payload.userId } as object,
    process.env.JWT_REFRESH_SECRET!,
    refreshOpts,
  )
  return { accessToken, refreshToken }
}
