/**
 * webhookAuth.ts
 *
 * Espelha o middleware equivalente do Destrava (server/middleware/webhookAuth.ts).
 * Endurece o segredo estático já existente (NEXUS_DESTRAVA_INTEGRATION_SECRET /
 * requireIntegrationSecret em routes/integracoes.ts) com assinatura HMAC-SHA256
 * + janela de replay + nonce de uso único, sem substituir o mecanismo antigo.
 */
import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

const REPLAY_WINDOW_MS = 5 * 60 * 1000 // ±5 min

const noncesUsados = new Map<string, number>()

function limparNoncesExpirados(agora: number) {
  for (const [nonce, expiraEm] of noncesUsados) {
    if (expiraEm < agora) noncesUsados.delete(nonce)
  }
}

function segredoCompartilhado(): string {
  return (
    process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET ||
    process.env.NEXUS_INTEGRATION_SECRET ||
    process.env.INTEGRATION_SECRET ||
    ''
  ).trim()
}

export function assinarPayload(body: string, timestamp: string, nonce: string): string {
  const base = `${timestamp}.${nonce}.${body}`
  return crypto.createHmac('sha256', segredoCompartilhado()).update(base).digest('hex')
}

export function requireWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const segredo = segredoCompartilhado()
  if (!segredo) {
    res.status(503).json({ error: 'Integração Destrava/Nexus não configurada (segredo ausente).' })
    return
  }

  const assinatura = String(req.headers['x-signature'] || '')
  const timestamp = String(req.headers['x-timestamp'] || '')
  const nonce = String(req.headers['x-nonce'] || '')

  if (!assinatura || !timestamp || !nonce) {
    res.status(401).json({ error: 'Cabeçalhos de assinatura ausentes (X-Signature/X-Timestamp/X-Nonce).' })
    return
  }

  const agora = Date.now()
  const timestampNum = Number(timestamp)
  if (!Number.isFinite(timestampNum) || Math.abs(agora - timestampNum) > REPLAY_WINDOW_MS) {
    res.status(401).json({ error: 'Timestamp fora da janela permitida.' })
    return
  }

  limparNoncesExpirados(agora)
  if (noncesUsados.has(nonce)) {
    res.status(401).json({ error: 'Requisição já processada (nonce reutilizado).' })
    return
  }

  const rawBody = (req as any).rawBody ? String((req as any).rawBody) : JSON.stringify(req.body || {})
  const esperada = assinarPayload(rawBody, timestamp, nonce)

  const assinaturaBuf = Buffer.from(assinatura, 'hex')
  const esperadaBuf = Buffer.from(esperada, 'hex')
  const valida =
    assinaturaBuf.length === esperadaBuf.length && crypto.timingSafeEqual(assinaturaBuf, esperadaBuf)

  if (!valida) {
    res.status(401).json({ error: 'Assinatura inválida.' })
    return
  }

  noncesUsados.set(nonce, agora + REPLAY_WINDOW_MS)
  next()
}
