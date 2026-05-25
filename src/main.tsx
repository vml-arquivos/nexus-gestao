import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './app-styles.css'
import App from './App.tsx'
import { ThemeProvider } from './lib/ThemeContext'
import { AuthProvider } from './lib/AuthContext.tsx'

// ═══ PWA: Service Worker para offline + instalação ═══
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => console.info('[PWA] SW registrado:', reg.scope))
      .catch(err => console.warn('[PWA] Falha SW:', err))
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
