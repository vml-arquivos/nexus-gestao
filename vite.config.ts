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
      includeAssets: ['icon-192.png', 'icon-512.png', 'favicon.svg'],
      manifest: {
        name: 'Nexus — Gestão Inteligente',
        short_name: 'Nexus',
        description: 'Gestão de equipe, tarefas, agenda, financeiro e documentos em um só lugar',
        theme_color: '#0F0A1E',
        background_color: '#0F0A1E',
        // standalone = sem barra de navegador — ESSENCIAL para parecer app nativo
        display: 'standalone',
        // Bloqueia em retrato (igual app mobile nativo)
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        categories: ['productivity', 'finance', 'business'],
        // Cor da barra de status iOS/Android
        id: '/nexus-gestao',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
        ],
        shortcuts: [
          { name: 'Nova Tarefa',    url: '/?action=task',    icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Novo Pagamento', url: '/?action=payment', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Novo Arquivo',   url: '/?action=upload',  icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
        // Cor dos screenshots / screenshots para install prompt
        screenshots: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Pré-cache tudo para funcionamento offline
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/nexus\.permupay\.com\.br\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nexus-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/nexus\.permupay\.com\.br\/uploads\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nexus-uploads-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Cache fontes Google — essencial para offline
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      // Gera SW customizado
      devOptions: {
        enabled: false,
      },
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
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
        },
      },
    },
  },
})
