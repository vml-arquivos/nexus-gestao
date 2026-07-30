import type { Response } from 'express'
import { isTransientDatabaseError } from '../db/pool'

/**
 * Converte indisponibilidade transitória do PostgreSQL em 503 curto e
 * recuperável. Isso evita deixar o proxy aguardando até o Cloudflare gerar 524.
 */
export function respondTransientDatabaseError(
  res: Response,
  error: unknown,
): boolean {
  if (!isTransientDatabaseError(error)) return false
  res.setHeader('Retry-After', '3')
  res.status(503).json({
    error: 'Banco temporariamente ocupado. O Nexus tentará novamente em instantes.',
    retryable: true,
  })
  return true
}

export function respondRouteError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): void {
  if (respondTransientDatabaseError(res, error)) return
  res.status(500).json({ error: fallbackMessage })
}
