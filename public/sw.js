// Nexus Gestão — Service Worker para Push Notifications, PWA e suporte offline básico.
// Cache leve: mantém o shell do app disponível sem prender versões antigas por muito tempo.
// VERSÃO: 2026-06-11-v10 — incrementar este número a cada deploy para invalidar cache CSS/JS.

const CACHE_NAME = 'nexus-shell-v10-2026-06-11'
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(SHELL_URLS).catch(() => undefined)
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    // Remove todos os caches antigos; qualquer nome diferente de CACHE_NAME é obsoleto.
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
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

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Recursos de API: network-first, fallback para cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        const cache = await caches.open(CACHE_NAME)
        cache.put(req, fresh.clone()).catch(() => undefined)
        return fresh
      } catch {
        const cached = await caches.match(req)
        return cached || new Response(
          JSON.stringify({ offline: true, error: 'Sem internet e sem cache local para esta consulta.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })())
    return
  }

  // Assets de build (JS/CSS com hash): sempre network-first para garantir versão nova após deploy.
  // Só cai para cache se estiver offline.
  event.respondWith((async () => {
    try {
      // cache: 'reload' força buscar sempre a versão mais recente do servidor para assets de build
      const isBuildAsset = url.pathname.startsWith('/assets/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')
      const fresh = await fetch(req, isBuildAsset ? { cache: 'reload' } : undefined)
      const cache = await caches.open(CACHE_NAME)
      cache.put(req, fresh.clone()).catch(() => undefined)
      return fresh
    } catch {
      return (await caches.match(req)) || (await caches.match('/index.html')) || Response.error()
    }
  })())
})
