import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './app-styles.css'
import App from './App.tsx'
import { ThemeProvider } from './lib/ThemeContext'
import { AuthProvider } from './lib/AuthContext.tsx'

// ═══ APLICA TEMA ANTES DO REACT PARA EVITAR FLASH E ESTADO QUEBRADO ═══
const savedTheme = localStorage.getItem('nexus-theme')
const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme
  : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
document.documentElement.setAttribute('data-theme', initialTheme)
document.documentElement.style.colorScheme = initialTheme

// ═══ RECUPERAÇÃO CONTRA CACHE ANTIGO DE CHUNKS ═══
// Se o navegador tentar carregar um arquivo /assets/*.js antigo e receber erro,
// limpamos caches e recarregamos uma única vez. Isso evita tela branca pós-deploy.
const RELOAD_FLAG = 'nexus-reloaded-after-chunk-error'
async function clearOldPwaCaches() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(reg => reg.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
    }
  } catch (err) {
    console.warn('[CACHE] Falha ao limpar caches antigos:', err)
  }
}

window.addEventListener('error', (event) => {
  const target = event.target as HTMLElement | null
  const src = (target as HTMLScriptElement | null)?.src || ''
  const href = (target as HTMLLinkElement | null)?.href || ''
  const asset = src || href

  if (asset.includes('/assets/') && !sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, '1')
    clearOldPwaCaches().finally(() => window.location.reload())
  }
}, true)

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '')
  if (
    !sessionStorage.getItem(RELOAD_FLAG) &&
    (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed'))
  ) {
    sessionStorage.setItem(RELOAD_FLAG, '1')
    clearOldPwaCaches().finally(() => window.location.reload())
  }
})

// Limpeza proativa: remove SW/caches antigos deixados pelo vite-plugin-pwa.
// Mantemos isso por segurança para todos os usuários que já instalaram/cachearam a versão anterior.
if ('serviceWorker' in navigator || 'caches' in window) {
  window.addEventListener('load', () => {
    clearOldPwaCaches()
  })
}

// ═══ PREVINE ZOOM DUPLO-TOQUE iOS (fallback JS) ═══
let lastTouchEnd = 0
document.addEventListener('touchend', (e) => {
  const now = Date.now()
  if (now - lastTouchEnd <= 300) {
    e.preventDefault()
  }
  lastTouchEnd = now
}, { passive: false })

// ═══ PREVINE PULL-TO-REFRESH no body ═══
document.addEventListener('touchmove', (e) => {
  // Permite scroll nos elementos que precisam
  const target = e.target as Element
  const scrollable = target.closest('.page-content, .sheet, .sidebar, [data-scroll]')
  if (!scrollable) {
    e.preventDefault()
  }
}, { passive: false })

// ═══ Esconde splash quando React montar ═══
const rootEl = document.getElementById('root')!
createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Esconde splash após render
if (typeof window.__hideSplash === 'function') {
  setTimeout(window.__hideSplash, 300)
}

declare global {
  interface Window {
    __hideSplash?: () => void
  }
}
