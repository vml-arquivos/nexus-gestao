import { apiJson } from './api'

type PushStatus = {
  supported: boolean
  configured: boolean
  permission: NotificationPermission | 'unsupported'
  publicKey?: string
  subscriptions?: number
  error?: string
  instructions?: string
  platform?: 'ios-safari-browser' | 'ios-pwa' | 'safari' | 'android' | 'desktop' | 'unsupported'
  canRequest?: boolean
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua)
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return navStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

export function getPushPlatform(): PushStatus['platform'] {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  if (isIosDevice() && isSafariBrowser() && !isStandalonePwa()) return 'ios-safari-browser'
  if (isIosDevice() && isStandalonePwa()) return 'ios-pwa'
  if (isSafariBrowser()) return 'safari'
  if (/Android/i.test(navigator.userAgent || '')) return 'android'
  return 'desktop'
}

export function browserSupportsPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function pushSetupInstructions(): string {
  const platform = getPushPlatform()
  if (platform === 'ios-safari-browser') {
    return 'No iPhone/iPad, as notificações web só aparecem depois de instalar o Nexus na Tela de Início. Abra no Safari, toque em Compartilhar, escolha “Adicionar à Tela de Início”, abra pelo ícone do Nexus e então toque em Ativar notificações.'
  }
  if (platform === 'ios-pwa') {
    return 'No iPhone/iPad, toque em Ativar notificações e permita os alertas. Se já bloqueou antes, abra Ajustes > Notificações > Nexus e permita notificações.'
  }
  if (platform === 'safari') {
    return 'No Safari, toque em Ativar notificações e permita. Se estiver bloqueado, ajuste em Safari > Ajustes do site > Notificações.'
  }
  if (platform === 'android') {
    return 'No Android, toque em Ativar notificações e permita no Chrome/PWA. Se não chegar, confira Configurações > Apps > Chrome/Nexus > Notificações.'
  }
  return 'Toque em Ativar notificações e permita no navegador. Se estiver bloqueado, libere nas configurações do site.'
}

export async function registerNexusServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  return reg
}

export async function getPushNotificationStatus(): Promise<PushStatus> {
  const platform = getPushPlatform()
  const baseUnsupported: PushStatus = {
    supported: false,
    configured: false,
    permission: 'unsupported',
    platform,
    canRequest: false,
    instructions: pushSetupInstructions(),
  }

  if (platform === 'ios-safari-browser') {
    return {
      ...baseUnsupported,
      error: 'Instale o Nexus na Tela de Início para ativar notificações no iPhone/iPad.',
    }
  }

  if (!browserSupportsPush()) return baseUnsupported

  try {
    const server = await apiJson<{ configured: boolean; publicKey: string; subscriptions: number }>('/notificacoes/push/status')
    return {
      supported: true,
      configured: !!server.configured,
      publicKey: server.publicKey,
      subscriptions: Number(server.subscriptions || 0),
      permission: Notification.permission,
      platform,
      canRequest: !!server.configured && Notification.permission !== 'denied',
      instructions: pushSetupInstructions(),
    }
  } catch (e) {
    return {
      supported: true,
      configured: false,
      permission: Notification.permission,
      platform,
      canRequest: false,
      instructions: pushSetupInstructions(),
      error: e instanceof Error ? e.message : 'Erro ao consultar push.',
    }
  }
}

export async function enablePushNotifications(): Promise<PushStatus> {
  const status = await getPushNotificationStatus()
  if (!status.supported) return status
  if (!status.configured || !status.publicKey) return status

  let permission = Notification.permission
  if (permission !== 'granted') permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ...status, permission, canRequest: permission !== 'denied' }

  const reg = await registerNexusServiceWorker()
  if (!reg || !('pushManager' in reg)) {
    return { ...status, permission, error: 'Service Worker/Push Manager não disponível neste navegador.' }
  }

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
