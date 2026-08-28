import type { Request } from 'express'
import jwt from 'jsonwebtoken'
import { filenameFromUploadUrl } from './uploadSecurity'
import type { UserRole } from '../middleware/auth'

const JWT_SECRET = process.env.JWT_SECRET || 'nexus-secret-dev'
const PRIVATE_FILE_TTL_SECONDS = 5 * 60

export type PrivateFileResource = 'documento' | 'avatar' | 'tarefa_anexo'

export interface PrivateFileTicket {
  userId: string
  orgId: string
  role: UserRole
  resource: PrivateFileResource
  resourceId: string
  filename: string
  parentId?: string
  scope: 'private-file'
}

export function generatePrivateFileTicket(payload: Omit<PrivateFileTicket, 'scope'>): string {
  return jwt.sign({ ...payload, scope: 'private-file' }, JWT_SECRET, {
    expiresIn: PRIVATE_FILE_TTL_SECONDS,
  })
}

export function buildPrivateFileUrl(
  req: Request,
  storedUrl: string | null | undefined,
  resource: PrivateFileResource,
  resourceId: string,
  parentId?: string,
): string | null {
  const filename = filenameFromUploadUrl(storedUrl)
  if (!filename) return null

  const baseUrl = String(
    process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host') || 'localhost:3001'}`,
  ).replace(/\/$/, '')
  const ticket = generatePrivateFileTicket({
    userId: req.user!.userId,
    orgId: req.user!.orgId,
    role: req.user!.role,
    resource,
    resourceId,
    filename,
    parentId,
  })
  return `${baseUrl}/api/uploads/file/${encodeURIComponent(filename)}?ticket=${encodeURIComponent(ticket)}`
}

export function verifyPrivateFileTicket(
  rawTicket: unknown,
  filename: string,
): PrivateFileTicket | null {
  if (typeof rawTicket !== 'string' || !rawTicket.trim()) return null
  try {
    const decoded = jwt.verify(rawTicket, JWT_SECRET) as Partial<PrivateFileTicket>
    if (
        decoded.scope !== 'private-file' ||
      !decoded.userId ||
      !decoded.orgId ||
      !decoded.role ||
      !['documento', 'avatar', 'tarefa_anexo'].includes(String(decoded.resource)) ||
      !decoded.resourceId ||
      !decoded.filename ||
      decoded.filename !== filename
    ) return null
    return decoded as PrivateFileTicket
  } catch {
    return null
  }
}

export const PRIVATE_FILE_TTL = PRIVATE_FILE_TTL_SECONDS
