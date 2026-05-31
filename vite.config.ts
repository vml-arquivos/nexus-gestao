import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Vite config estabilizado.
 *
 * IMPORTANTE:
 * O service worker anterior do vite-plugin-pwa estava mantendo HTML/assets antigos em cache.
 * Isso causava tela branca após deploy, com erros do tipo:
 *   - /assets/vendor-*.js 404
 *   - Unexpected token '<'
 *
 * Para estabilizar produção, removemos temporariamente o vite-plugin-pwa do build
 * e mantemos um public/sw.js "kill switch" que desregistra SWs antigos e limpa caches.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom')
          ) {
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
