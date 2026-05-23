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
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.ico'],
      manifest: {
        name: 'Nexus — Gestão Inteligente',
        short_name: 'Nexus',
        description: 'Gestão de equipe, tarefas, agenda, financeiro e documentos em um só lugar',
        theme_color: '#6C3BFF',
        background_color: '#0F0A1E',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        categories: ['productivity', 'finance', 'business'],
        icons: [
          { src: 'icon-192.png',       sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png',       sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
        shortcuts: [
          { name: 'Nova Tarefa',      url: '/?action=task',    icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Novo Pagamento',   url: '/?action=payment', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Enviar Arquivo',   url: '/?action=upload',  icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Cache da própria API — Network First com fallback
            urlPattern: /^https:\/\/nexus\.permupay\.com\.br\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nexus-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Cache de uploads/imagens — Cache First
            urlPattern: /^https:\/\/nexus\.permupay\.com\.br\/uploads\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nexus-uploads-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
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
