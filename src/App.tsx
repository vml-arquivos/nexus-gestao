import { Routes, Route, Navigate } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pessoas from './pages/Pessoas'
import Equipe from './pages/Equipe'
import Equipes from './pages/Equipes'
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
import AceitarConvite from './pages/AceitarConvite'
import DesignEditor from './pages/DesignEditor'

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
        {/* Pessoas são privadas por usuário; membros também podem usar seus próprios contatos */}
        <Route path="pessoas"   element={<Pessoas />} />
        <Route path="pessoas/:id" element={<PessoaDetalhe />} />
        {/* Equipe/Equipes: apenas gestor ou subgestor visualiza. Membro não acessa */}
        <Route
          path="equipe"
          element={
            user && ['admin', 'dev', 'gestor', 'sub_gestor'].includes(user.role)
              ? <Equipe />
              : <Navigate to="/" replace />
          }
        />
        <Route
          path="equipes"
          element={
            user && ['admin', 'dev', 'gestor'].includes(user.role)
              ? <Equipes />
              : <Navigate to="/" replace />
          }
        />
        {/* Tarefas: membros acessam somente suas tarefas pessoais; demais roles acessam gerenciamento completo */}
        <Route
          path="tarefas"
          element={
            user?.role === 'membro'
              ? <Navigate to="/minhas-tarefas" replace />
              : <Tarefas />
          }
        />
        <Route
          path="minhas-tarefas"
          element={
            user?.role === 'membro'
              ? <MinhasTarefas />
              : <Navigate to="/tarefas" replace />
          }
        />
        {/* Agenda: cada usuário tem sua agenda pessoal; todos os usuários autenticados acessam a própria agenda */}
        <Route path="agenda" element={<Agenda />} />
        {/* Financeiro e documentos: visíveis a todos os usuários autenticados; o backend filtra pelo usuário */}
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="documentos" element={<Documentos />} />
        {/* Compartilhar: recurso público/interno; sem restrição adicional aqui */}
        <Route path="compartilhar" element={<Compartilhar />} />
        {/* Relatórios: permitido para admin, dev, gestor e subgestor */}
        <Route
          path="relatorios"
          element={
            user && ['admin', 'dev', 'gestor', 'sub_gestor'].includes(user.role)
              ? <Relatorios />
              : <Navigate to="/" replace />
          }
        />
        <Route path="configuracoes" element={<Configuracoes />} />
        {/* Usuários: todos acessam; a tela e o backend limitam criação/listagem por hierarquia */}
        <Route path="usuarios" element={<Usuarios />} />
        <Route
          path="design-editor"
          element={
            user && ['admin', 'dev', 'gestor'].includes(user.role)
              ? <DesignEditor />
              : <Navigate to="/" replace />
          }
        />
      </Route>

      {/* Convite público — não requer autenticação */}
      <Route path="/convite/:token" element={<AceitarConvite />} />

      {/* Fallback: redireciona para home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
