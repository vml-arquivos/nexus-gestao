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
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Nexus — Gestão Inteligente',
        short_name: 'Nexus',
        description: 'Gestão de equipe, tarefas, agenda e financeiro em um só lugar',
        theme_color: '#6C3BFF',
        background_color: '#0F0A1E',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        categories: ['productivity', 'finance', 'business'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        shortcuts: [
          { name: 'Nova Tarefa', url: '/?action=task', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Novo Pagamento', url: '/?action=payment', icons: [{ src: 'icon-192.png', sizes: '192x192' }] }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', networkTimeoutSeconds: 10 }
          }
        ]
      }
    })
  ]
})
