// Nexus Gestão — Service Worker para Push Notifications, PWA e suporte offline básico.
// Cache leve: mantém o shell do app disponível sem prender versões antigas por muito tempo.
// VERSÃO: FIX55 — navegação de página nunca passa pelo Service Worker (nginx já
// serve certo); cache.addAll() trocado por cache.add() independente por item.

const CACHE_NAME = 'nexus-shell-fix55-2026-08-05'
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    // cache.addAll() é tudo-ou-nada: se UM único recurso falhar (ex: rede
    // instável durante o deploy), NENHUM dos três fica salvo -- e o app
    // ficava sem plano B nenhum bem na hora que mais precisaria dele.
    // Cada recurso agora é cacheado (ou falha) de forma independente.
    await Promise.all(SHELL_URLS.map((shellUrl) => cache.add(shellUrl).catch(() => undefined)))
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    // Remove somente versões antigas do próprio shell. O cache independente
    // do painel offline é uma carga operacional do usuário e deve sobreviver.
    await Promise.all(names.filter(name => name.startsWith('nexus-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)))
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

  // Nunca intercepta API, SSE ou uploads autenticados. Cachear a resposta
  // infinita de /api/notificacoes/stream mantinha um clone aberto para sempre,
  // acumulava conexões e terminava em ERR_QUIC_PROTOCOL_ERROR. Respostas de
  // tarefas também não podem ser compartilhadas entre sessões no Cache Storage.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return

  // Navegação de página (abrir/recarregar uma rota como /tarefas, /agenda...)
  // NUNCA passa pelo Service Worker. O nginx já serve essas rotas direto e
  // corretamente (try_files .../index.html, sem cache). Antes, o SW refazia
  // o fetch() por conta própria (linha "fresh = await fetch(req, ...)") e, se
  // isso falhasse por qualquer motivo, cara a cara com um fallback frágil:
  // cache.addAll() na instalação é tudo-ou-nada (um único arquivo faltando
  // fazia NENHUM dos três ficar salvo) e o catch() engolia esse erro em
  // silêncio -- então o fallback ficava vazio bem quando mais precisava dele,
  // resultando no "network error" que aparecia no console ao abrir /tarefas.
  // Deixar a navegação ir direto pro navegador/nginx elimina essa classe
  // inteira de falha: não existe mais um "refetch" do SW pra dar errado.
  if (req.mode === 'navigate') return

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
      // Proteção extra: se até a leitura do cache falhar (quota, corrupção),
      // não deixa a exceção subir sem tratamento -- isso também produzia o
      // mesmo tipo de "network error" que estamos eliminando aqui.
      try {
        return (await caches.match(req)) || (await caches.match('/index.html')) || Response.error()
      } catch {
        return Response.error()
      }
    }
  })())
})
