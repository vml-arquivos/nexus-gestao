import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './app-styles.css'
import App from './App.tsx'
import { AuthProvider } from './lib/AuthContext.tsx'

// Registra o Service Worker para funcionalidade PWA (offline, instalação iOS/Android)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => console.info('[PWA] Service Worker registrado:', reg.scope))
      .catch(err => console.warn('[PWA] Falha ao registrar SW:', err))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
