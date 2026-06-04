import webpush from 'web-push'
import { query, queryOne } from '../db/pool'

let schemaReady: Promise<void> | null = null

function subject() {
  return process.env.WEB_PUSH_SUBJECT || process.env.VAPID_SUBJECT || 'mailto:admin@nexus.local'
}

export function pushConfigured() {
  return Boolean((process.env.WEB_PUSH_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY) && (process.env.WEB_PUSH_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY))
}

export function getVapidPublicKey() {
  return process.env.WEB_PUSH_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
}

function configureWebPush() {
  const publicKey = getVapidPublicKey()
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject(), publicKey, privateKey)
  return true
}

export async function ensurePushSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)
      await query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL,
          user_id UUID NOT NULL,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT,
          device_label TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          last_seen_at TIMESTAMPTZ DEFAULT NOW(),
          last_sent_at TIMESTAMPTZ,
          fail_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (user_id, endpoint)
        )
      `)
      await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(org_id, user_id, active)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint)`)
    })().catch(err => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

export async function upsertPushSubscription(input: {
  orgId: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
  deviceLabel?: string
}) {
  await ensurePushSchema()
  return queryOne(
    `INSERT INTO push_subscriptions
       (org_id, user_id, endpoint, p256dh, auth, user_agent, device_label, active, last_seen_at, fail_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW(),0,NOW())
     ON CONFLICT (user_id, endpoint) DO UPDATE SET
       org_id = EXCLUDED.org_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       device_label = EXCLUDED.device_label,
       active = TRUE,
       last_seen_at = NOW(),
       fail_count = 0,
       updated_at = NOW()
     RETURNING id`,
    [input.orgId, input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent || null, input.deviceLabel || null]
  )
}

export async function deactivatePushSubscription(input: { userId: string; endpoint: string }) {
  await ensurePushSchema()
  await query(`UPDATE push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = $1 AND endpoint = $2`, [input.userId, input.endpoint])
}

export async function sendPushToUser(input: {
  orgId: string
  userId: string
  title: string
  body?: string | null
  tipo?: string
  referenciaId?: string | null
  referenciaTipo?: string | null
}) {
  if (!configureWebPush()) return { ok: false, disabled: true, sent: 0 }
  await ensurePushSchema()
  const rows = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE org_id = $1 AND user_id = $2 AND active = TRUE`,
    [input.orgId, input.userId]
  )
  let sent = 0
  for (const sub of rows) {
    const payload = JSON.stringify({
      title: input.title || 'Nexus Gestão',
      body: input.body || 'Você tem uma nova notificação.',
      tipo: input.tipo || 'info',
      referenciaId: input.referenciaId || undefined,
      referenciaTipo: input.referenciaTipo || undefined,
      url: input.referenciaTipo === 'tarefa' && input.referenciaId ? `/tarefas?task=${input.referenciaId}`
        : input.referenciaTipo === 'pagamento' ? '/financeiro'
        : input.referenciaTipo === 'agenda' ? '/agenda'
        : '/notificacoes',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `${input.tipo || 'nexus'}-${input.referenciaId || Date.now()}`,
      timestamp: Date.now(),
    })
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'high' as any })
      await query(`UPDATE push_subscriptions SET last_sent_at = NOW(), fail_count = 0, updated_at = NOW() WHERE id = $1`, [sub.id])
      sent++
    } catch (err: any) {
      const statusCode = Number(err?.statusCode || err?.status || 0)
      if (statusCode === 404 || statusCode === 410) {
        await query(`UPDATE push_subscriptions SET active = FALSE, fail_count = fail_count + 1, updated_at = NOW() WHERE id = $1`, [sub.id])
      } else {
        await query(`UPDATE push_subscriptions SET fail_count = fail_count + 1, updated_at = NOW() WHERE id = $1`, [sub.id]).catch(() => {})
        console.warn('[PUSH] Falha ao enviar push:', statusCode || err?.message || err)
      }
    }
  }
  return { ok: true, sent }
}
