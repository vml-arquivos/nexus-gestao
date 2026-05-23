import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
// Substitui a antiga página de equipe por Pessoas (contatos)
import Pessoas from './pages/Pessoas'
import Tarefas from './pages/Tarefas'
import Agenda from './pages/Agenda'
import Financeiro from './pages/Financeiro'
import Documentos from './pages/Documentos'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'

// ── Loader de tela cheia ──────────────────────────────────────────────────────
function FullScreenLoader() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: 'var(--grad-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <span style={{ fontSize: 22 }}>⚡</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>Carregando Nexus…</div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.95); }
        }
      `}</style>
    </div>
  )
}

// ── Rota protegida ────────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <FullScreenLoader />

  return (
    <Routes>
      {/* Rota pública: Login */}
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      {/* Rotas protegidas dentro do Layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        {/* Rota de contatos (antes era /equipe) */}
        <Route path="pessoas" element={<Pessoas />} />
        <Route path="tarefas" element={<Tarefas />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="configuracoes" element={<Configuracoes />} />
      </Route>

      {/* Fallback: redireciona para home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
