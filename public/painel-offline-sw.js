const CACHE_NAME = 'nexus-painel-offline-v2'
const PANEL_URL = '/painel-offline/'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([PANEL_URL, '/painel-offline.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nexus-painel-offline-') && key !== CACHE_NAME).map(key => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) return
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request)
      if (response.ok && event.request.method === 'GET') {
        const cache = await caches.open(CACHE_NAME)
        cache.put(event.request, response.clone())
      }
      return response
    } catch {
      const cached = await caches.match(event.request)
      if (cached) return cached
      if (event.request.mode === 'navigate') return (await caches.match(PANEL_URL)) || Response.error()
      return Response.error()
    }
  })())
})
