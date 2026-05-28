// Nexus Gestão — Service Worker kill switch.
// Remove caches antigos do PWA para evitar tela branca por chunks/assets obsoletos após deploy.
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        for (const client of clients) client.navigate(client.url)
      })
  )
})

self.addEventListener('fetch', () => {
  // Não intercepta nenhuma requisição.
})
