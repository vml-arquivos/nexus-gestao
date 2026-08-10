import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import TaskWorkflowEffects from './components/TaskWorkflowEffects'

// ── Code splitting por rota ───────────────────────────────────────────────────
// Login e Layout continuam com import estático (necessários imediatamente no
// primeiro carregamento). As demais páginas são carregadas sob demanda: o
// navegador só baixa o código de uma página quando o usuário navega até ela,
// em vez de baixar o app inteiro (20 páginas) de uma vez só.
const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Inteligencia   = lazy(() => import('./pages/Inteligencia'))
const Pessoas        = lazy(() => import('./pages/Pessoas'))
const Equipe         = lazy(() => import('./pages/Equipe'))
const Equipes        = lazy(() => import('./pages/Equipes'))
const Tarefas        = lazy(() => import('./pages/Tarefas'))
const MinhasTarefas  = lazy(() => import('./pages/MinhasTarefas'))
const Agenda         = lazy(() => import('./pages/Agenda'))
const Financeiro     = lazy(() => import('./pages/Financeiro'))
const Documentos     = lazy(() => import('./pages/Documentos'))
const Compartilhar   = lazy(() => import('./pages/Compartilhar'))
const Relatorios     = lazy(() => import('./pages/Relatorios'))
const Configuracoes  = lazy(() => import('./pages/Configuracoes'))
const PessoaDetalhe  = lazy(() => import('./pages/PessoaDetalhe'))
const Usuarios       = lazy(() => import('./pages/Usuarios'))
const AceitarConvite = lazy(() => import('./pages/AceitarConvite'))
const DesignEditor   = lazy(() => import('./pages/DesignEditor'))
const Notificacoes   = lazy(() => import('./pages/Notificacoes'))
const PainelOffline  = lazy(() => import('./pages/PainelOffline'))

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
    <Suspense fallback={<FullScreenLoader />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index            element={<Dashboard />} />
        <Route path="inteligencia" element={<Inteligencia />} />
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
              : <><TaskWorkflowEffects /><Tarefas /></>
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
        {/* Notificações: página com todas as notificações (paginada), além do dropdown do sininho */}
        <Route path="notificacoes" element={<Notificacoes />} />
        <Route path="painel-offline/*" element={<PainelOffline />} />
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
    </Suspense>
  )
}
