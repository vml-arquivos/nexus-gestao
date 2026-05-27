import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      // ── Apenas os assets que EXISTEM de facto no /public ──────────────────
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],

      manifest: {
        name: 'Nexus — Gestão Inteligente',
        short_name: 'Nexus',
        description: 'Gestão de equipe, tarefas, agenda, financeiro e documentos',
        theme_color: '#0F0A1E',
        background_color: '#0F0A1E',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        id: '/nexus-gestao',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Nova Tarefa',    url: '/?action=task',    icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Novo Pagamento', url: '/?action=payment', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Novo Arquivo',   url: '/?action=upload',  icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
        screenshots: [],
      },

      workbox: {
        // ── Apenas arquivos que o build gera de facto ─────────────────────
        globPatterns: ['**/*.{js,css,html,png,svg}'],

        // ── CRÍTICO: exclui SSE e rotas de API do cache do SW ─────────────
        // O SW nunca deve interceptar EventSource nem chamadas de API
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,       // todas as APIs
          /\/stream/,       // SSE streams
          /\/uploads\//,    // uploads dinâmicos
        ],

        // ── Exclui do precache o que não existe ───────────────────────────
        globIgnores: [
          '**/icons.svg',   // não está no manifest — evita 404 no precache
          '**/*.map',
        ],

        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,

        runtimeCaching: [
          // ── API: NetworkFirst (tenta rede, fallback cache) ───────────────
          {
            // NUNCA cacheia /stream — é SSE
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.startsWith('/api/') &&
              !url.pathname.includes('/stream'),
            handler: 'NetworkFirst' as const,
            options: {
              cacheName: 'nexus-api-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              // Só cacheia respostas válidas
              cacheableResponse: { statuses: [200] },
            },
          },
          // ── Uploads: CacheFirst ──────────────────────────────────────────
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst' as const,
            options: {
              cacheName: 'nexus-uploads-cache',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // ── Google Fonts ─────────────────────────────────────────────────
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate' as const,
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst' as const,
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },

      devOptions: { enabled: false },
    }),
  ],

  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) return 'vendor'
          if (id.includes('node_modules/lucide-react')) return 'icons'
        },
      },
    },
  },
})
