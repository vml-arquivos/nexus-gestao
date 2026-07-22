/**
 * webhookClient.ts
 *
 * Espelha server/services/automation/webhookClient.ts do Destrava. Cliente
 * HTTP para o Nexus assinar e enviar eventos (hoje: TarefaConcluidaNexus)
 * de volta para o Destrava.
 */
import crypto from 'crypto'
import { assinarPayload } from '../../middleware/webhookAuth'

export interface RespostaWebhook {
  ok: boolean
  status: number
  body: string
}

function destravaBaseUrl(): string {
  return String(
    process.env.DESTRAVA_API_URL || process.env.DESTRAVA_INTERNAL_API_URL || process.env.DESTRAVA_PUBLIC_URL || ''
  ).replace(/\/$/, '')
}

function segredoCompartilhado(): string {
  return String(
    process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET || process.env.NEXUS_INTEGRATION_SECRET || ''
  ).trim()
}

export function destravaConfigurado(): boolean {
  return Boolean(destravaBaseUrl() && segredoCompartilhado())
}

export async function enviarWebhookDestrava(
  caminho: string,
  payload: Record<string, unknown>,
  idempotencyKey: string
): Promise<RespostaWebhook> {
  const base = destravaBaseUrl()
  if (!base) throw new Error('DESTRAVA_API_URL não configurado')

  const body = JSON.stringify(payload)
  const timestamp = String(Date.now())
  const nonce = crypto.randomBytes(16).toString('hex')
  const assinatura = assinarPayload(body, timestamp, nonce)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Signature': assinatura,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Idempotency-Key': idempotencyKey,
    'x-integration-secret': segredoCompartilhado(),
    'X-Source': 'nexus-gestao',
  }

  const res = await fetch(`${base}${caminho}`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  })

  const responseBody = await res.text().catch(() => '')
  return { ok: res.ok, status: res.status, body: responseBody }
}
