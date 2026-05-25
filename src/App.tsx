import { Routes, Route, Navigate } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pessoas from './pages/Pessoas'
import Equipe from './pages/Equipe'
import Tarefas from './pages/Tarefas'
import MinhasTarefas from './pages/MinhasTarefas'
import Agenda from './pages/Agenda'
import Financeiro from './pages/Financeiro'
import Documentos from './pages/Documentos'
import Compartilhar from './pages/Compartilhar'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'
import PessoaDetalhe from './pages/PessoaDetalhe'
import Usuarios from './pages/Usuarios'

function FullScreenLoader() {
  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', flexDirection:'column', gap:16 }}>
      <div style={{ width:48, height:48, borderRadius:14, background:'var(--grad-primary)', display:'flex', alignItems:'center', justifyContent:'center', animation:'pulse 1.5s ease-in-out infinite' }}>
        <Zap size={22} color="#fff" />
      </div>
      <div style={{ fontSize:13, color:'var(--text3)', fontWeight:500 }}>Carregando Nexus…</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.95)} }`}</style>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user)   return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index            element={<Dashboard />} />
        <Route path="pessoas"   element={<Pessoas />} />
        <Route path="pessoas/:id" element={<PessoaDetalhe />} />
        <Route path="equipe"    element={<Equipe />} />
        <Route path="tarefas"   element={<Tarefas />} />
        <Route path="minhas-tarefas" element={<MinhasTarefas />} />
        <Route path="agenda"    element={<Agenda />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="compartilhar" element={<Compartilhar />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="usuarios"  element={<Usuarios />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
