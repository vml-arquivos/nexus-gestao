import { apiJson } from './api'

type PushStatus = {
  supported: boolean
  configured: boolean
  permission: NotificationPermission | 'unsupported'
  publicKey?: string
  subscriptions?: number
  error?: string
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function browserSupportsPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export async function registerNexusServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!browserSupportsPush()) return null
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  return reg
}

export async function getPushNotificationStatus(): Promise<PushStatus> {
  if (!browserSupportsPush()) return { supported: false, configured: false, permission: 'unsupported' }
  try {
    const server = await apiJson<{ configured: boolean; publicKey: string; subscriptions: number }>('/notificacoes/push/status')
    return {
      supported: true,
      configured: !!server.configured,
      publicKey: server.publicKey,
      subscriptions: Number(server.subscriptions || 0),
      permission: Notification.permission,
    }
  } catch (e) {
    return { supported: true, configured: false, permission: Notification.permission, error: e instanceof Error ? e.message : 'Erro ao consultar push.' }
  }
}

export async function enablePushNotifications(): Promise<PushStatus> {
  if (!browserSupportsPush()) return { supported: false, configured: false, permission: 'unsupported' }
  const status = await getPushNotificationStatus()
  if (!status.configured || !status.publicKey) return status

  let permission = Notification.permission
  if (permission !== 'granted') permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ...status, permission }

  const reg = await registerNexusServiceWorker()
  if (!reg) return { ...status, permission, error: 'Service Worker não disponível.' }

  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    })
  }

  await apiJson('/notificacoes/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription, device_label: navigator.userAgent || 'Dispositivo' }),
  })

  return getPushNotificationStatus()
}

export async function disablePushNotifications(): Promise<void> {
  if (!browserSupportsPush()) return
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await apiJson('/notificacoes/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined)
    await sub.unsubscribe().catch(() => undefined)
  }
}
