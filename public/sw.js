// Nexus Gestão — Service Worker para Push Notifications e PWA.
// Não faz cache agressivo para evitar regressão/tela branca após deploy.

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Nexus Gestão', body: event.data ? event.data.text() : 'Nova notificação.' }
  }

  const title = data.title || 'Nexus Gestão'
  const options = {
    body: data.body || 'Você recebeu uma nova notificação.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || `nexus-${Date.now()}`,
    renotify: true,
    requireInteraction: ['tarefa_atrasada', 'financeiro_cobranca', 'financeiro_vencido'].includes(data.tipo),
    data: {
      url: data.url || '/',
      referenciaId: data.referenciaId,
      referenciaTipo: data.referenciaTipo,
      tipo: data.tipo,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) return client.navigate(targetUrl)
        return
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
  })())
})

self.addEventListener('fetch', () => {
  // Sem interceptação de rede: evita cache antigo e regressão pós-deploy.
})
