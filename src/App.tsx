import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Calendar,
  DollarSign,
  FileText,
  BarChart3,
  Bell,
  Settings,
  Search,
  Plus,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Menu,
  X,
  Zap,
  Target,
  Activity,
  LogOut,
  RefreshCw,
} from 'lucide-react'

// ── Páginas reais ─────────────────────────────────────────
import Equipe        from './pages/Equipe'
import Tarefas       from './pages/Tarefas'
import Agenda        from './pages/Agenda'
import Financeiro    from './pages/Financeiro'
import Documentos    from './pages/Documentos'
import Relatorios    from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'
import Setup         from './components/Setup'

// ── Store e sync ──────────────────────────────────────────
import { store, isConfigured, isSupabaseConfigured, syncFromSupabase } from './lib/store'

// ── Tipos ────────────────────────────────────────────────
type Section =
  | 'dashboard'
  | 'equipe'
  | 'tarefas'
  | 'agenda'
  | 'financeiro'
  | 'documentos'
  | 'relatorios'
  | 'configuracoes'

interface NavItem {
  id: Section
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',    icon: <LayoutDashboard size={18} /> },
  { id: 'equipe',        label: 'Equipe',        icon: <Users size={18} /> },
  { id: 'tarefas',       label: 'Tarefas',       icon: <CheckSquare size={18} /> },
  { id: 'agenda',        label: 'Agenda',        icon: <Calendar size={18} /> },
  { id: 'financeiro',    label: 'Financeiro',    icon: <DollarSign size={18} /> },
  { id: 'documentos',    label: 'Documentos',    icon: <FileText size={18} /> },
  { id: 'relatorios',    label: 'Relatórios',    icon: <BarChart3 size={18} /> },
  { id: 'configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
]

// ── Helpers ───────────────────────────────────────────────
function priorityBadge(p: string) {
  const map: Record<string, string> = {
    alta:  'nexus-badge nexus-badge-red',
    media: 'nexus-badge nexus-badge-gold',
    baixa: 'nexus-badge nexus-badge-green',
  }
  return map[p] ?? 'nexus-badge nexus-badge-purple'
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    em_progresso: 'nexus-badge nexus-badge-purple',
    pendente:     'nexus-badge nexus-badge-red',
    concluida:    'nexus-badge nexus-badge-green',
    cancelada:    'nexus-badge nexus-badge-gold',
  }
  return map[s] ?? 'nexus-badge nexus-badge-purple'
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    em_progresso: 'Em andamento',
    pendente:     'Pendente',
    concluida:    'Concluída',
    cancelada:    'Cancelada',
  }
  return map[s] ?? s
}

function eventColor(tipo: string) {
  const map: Record<string, string> = {
    reuniao:      '#6C3BFF',
    compromisso:  '#F5A623',
    prazo:        '#EF4444',
    outro:        '#00D4AA',
  }
  return map[tipo] ?? '#6C3BFF'
}

// ── Componentes de layout ─────────────────────────────────

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'linear-gradient(135deg, #6C3BFF, #00D4AA)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 16px rgba(108,59,255,0.4)',
      }}>
        <Zap size={18} color="#fff" />
      </div>
      <div>
        <div style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 800,
          fontSize: 18,
          background: 'linear-gradient(135deg, #6C3BFF, #00D4AA)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1.1,
        }}>
          NEXUS
        </div>
        <div style={{ fontSize: 9, color: 'rgba(176,153,255,0.6)', letterSpacing: '0.12em', fontWeight: 500 }}>
          GESTÃO INTELIGENTE
        </div>
      </div>
    </div>
  )
}

function Sidebar({ active, onNav, open, onClose }: {
  active: Section
  onNav: (s: Section) => void
  open: boolean
  onClose: () => void
}) {
  // Iniciais do nome do usuário
  const initials = store.config.nome
    ? store.config.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NX'

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 39, backdropFilter: 'blur(4px)',
          }}
        />
      )}

      <aside
        className="nexus-sidebar"
        style={{ transform: open ? 'translateX(0)' : undefined }}
      >
        {/* Header */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(108,59,255,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo />
            <button
              onClick={onClose}
              style={{ display: 'none', background: 'none', border: 'none', color: 'rgba(176,153,255,0.6)', cursor: 'pointer' }}
              className="mobile-close-btn"
              aria-label="Fechar menu"
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ marginTop: 16, position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute', left: 10, top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(176,153,255,0.4)',
              }}
            />
            <input
              className="nexus-input"
              placeholder="Buscar..."
              style={{ paddingLeft: 32, fontSize: 13, padding: '8px 10px 8px 32px' }}
            />
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 12px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(176,153,255,0.35)', padding: '4px 4px 8px', textTransform: 'uppercase' }}>
            Principal
          </div>
          {NAV_ITEMS.slice(0, 7).map(item => (
            <button
              key={item.id}
              onClick={() => { onNav(item.id); onClose() }}
              className={`nexus-nav-item ${active === item.id ? 'active' : ''}`}
              style={{ width: '100%', background: 'none', border: active === item.id ? undefined : 'none', textAlign: 'left', marginBottom: 2 }}
            >
              <span style={{ color: active === item.id ? '#6C3BFF' : 'rgba(176,153,255,0.5)', flexShrink: 0 }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}

          <div className="nexus-divider" />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(176,153,255,0.35)', padding: '4px 4px 8px', textTransform: 'uppercase' }}>
            Sistema
          </div>
          {NAV_ITEMS.slice(7).map(item => (
            <button
              key={item.id}
              onClick={() => { onNav(item.id); onClose() }}
              className={`nexus-nav-item ${active === item.id ? 'active' : ''}`}
              style={{ width: '100%', background: 'none', border: active === item.id ? undefined : 'none', textAlign: 'left', marginBottom: 2 }}
            >
              <span style={{ color: active === item.id ? '#6C3BFF' : 'rgba(176,153,255,0.5)', flexShrink: 0 }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer usuário */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(108,59,255,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="nexus-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f0eeff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {store.config.nome || 'Usuário Nexus'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(176,153,255,0.5)' }}>
                {isSupabaseConfigured() ? '☁️ Nuvem ativa' : '💾 Local'}
              </div>
            </div>
            <button style={{ background: 'none', border: 'none', color: 'rgba(176,153,255,0.4)', cursor: 'pointer' }} aria-label="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function TopBar({ onMenuOpen, onSync, syncing }: { onMenuOpen: () => void; onSync: () => void; syncing: boolean }) {
  const initials = store.config.nome
    ? store.config.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NX'

  return (
    <header style={{
      height: 64,
      background: 'rgba(22, 16, 43, 0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(108,59,255,0.12)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 16,
      position: 'sticky',
      top: 0,
      zIndex: 30,
    }}>
      <button
        onClick={onMenuOpen}
        className="nexus-btn-ghost"
        style={{ padding: '8px', display: 'none' }}
        id="menu-toggle"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      <div style={{ flex: 1 }} />

      {/* Botão sync (aparece só se Supabase configurado) */}
      {isSupabaseConfigured() && (
        <button
          className="nexus-btn-ghost"
          style={{ padding: '8px', gap: 6, fontSize: 12 }}
          onClick={onSync}
          disabled={syncing}
          title="Sincronizar com Supabase"
        >
          <RefreshCw size={15} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      )}

      <button
        className="nexus-btn-ghost"
        style={{ padding: '8px', position: 'relative' }}
        aria-label="Notificações"
      >
        <Bell size={18} />
        <span style={{
          position: 'absolute', top: 6, right: 6,
          width: 8, height: 8, borderRadius: '50%',
          background: '#6C3BFF',
          border: '2px solid #16102B',
        }} />
      </button>

      <div className="nexus-avatar">{initials}</div>
    </header>
  )
}

// ── Dashboard com dados reais ─────────────────────────────
function DashboardView({ onNav }: { onNav: (s: Section) => void }) {
  // Calcula métricas reais a partir do store
  const hoje = new Date().toISOString().slice(0, 10)

  const tarefasTotal = store.tarefas.length
  const tarefasConcluidas = store.tarefas.filter(t => t.status === 'concluida').length
  const tarefasPendentes = store.tarefas.filter(t => t.status === 'pendente' || t.status === 'em_progresso').length

  const receita = store.pagamentos
    .filter(p => p.tipo === 'recebimento' && p.status === 'pago')
    .reduce((s, p) => s + Number(p.valor), 0)
  const despesas = store.pagamentos
    .filter(p => p.tipo === 'pagamento' && p.status === 'pago')
    .reduce((s, p) => s + Number(p.valor), 0)

  const membros = store.pessoas.filter(p => p.tipo === 'funcionario' || p.tipo === 'prestador').length

  const tarefasRecentes = [...store.tarefas]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const eventosHoje = store.agenda
    .filter(e => e.data_inicio.startsWith(hoje))
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
    .slice(0, 4)

  const progresso = tarefasTotal > 0 ? Math.round((tarefasConcluidas / tarefasTotal) * 100) : 0
  const saldo = receita - despesas

  const stats = [
    {
      label: 'Receita Recebida',
      value: `R$ ${receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      change: `Saldo: R$ ${saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      positive: saldo >= 0,
      icon: <DollarSign size={20} />,
      accent: '#6C3BFF',
    },
    {
      label: 'Tarefas Concluídas',
      value: `${tarefasConcluidas} / ${tarefasTotal}`,
      change: `${tarefasPendentes} pendentes`,
      positive: tarefasPendentes === 0,
      icon: <CheckCircle2 size={20} />,
      accent: '#00D4AA',
    },
    {
      label: 'Membros da Equipe',
      value: String(membros),
      change: `${store.pessoas.length} cadastrado(s)`,
      positive: true,
      icon: <Users size={20} />,
      accent: '#F5A623',
    },
    {
      label: 'Pendências',
      value: String(tarefasPendentes),
      change: `${store.pagamentos.filter(p => p.status === 'pendente').length} pag. pendentes`,
      positive: tarefasPendentes === 0,
      icon: <AlertCircle size={20} />,
      accent: '#EF4444',
    },
  ]

  return (
    <div className="nexus-animate-in" style={{ padding: '28px 28px' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize: 26,
              color: '#f0eeff',
              marginBottom: 4,
            }}>
              Bom dia, <span style={{ color: '#6C3BFF' }}>{store.config.nome || 'bem-vindo'}</span>! ⚡
            </h1>
            <p style={{ color: 'rgba(176,153,255,0.55)', fontSize: 14 }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button className="nexus-btn-primary" style={{ gap: 8 }} onClick={() => onNav('tarefas')}>
            <Plus size={16} /> Nova Tarefa
          </button>
        </div>
      </div>

      {/* Stats grid — dados reais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {stats.map((stat, i) => (
          <div key={i} className="nexus-stat-card" style={{ animationDelay: `${i * 0.07}s` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'rgba(176,153,255,0.55)', fontWeight: 500 }}>{stat.label}</div>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: `${stat.accent}20`,
                border: `1px solid ${stat.accent}35`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: stat.accent, flexShrink: 0,
              }}>
                {stat.icon}
              </div>
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24, color: '#f0eeff', marginBottom: 8 }}>
              {stat.value}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              {stat.positive
                ? <TrendingUp size={13} color="#00D4AA" />
                : <TrendingDown size={13} color="#EF4444" />
              }
              <span style={{ color: stat.positive ? '#00D4AA' : '#EF4444', fontWeight: 600 }}>
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Conteúdo principal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }}>

        {/* Tarefas recentes — dados reais */}
        <div className="nexus-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(108,59,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Target size={16} color="#6C3BFF" />
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: '#f0eeff' }}>
                Tarefas Recentes
              </span>
            </div>
            <button className="nexus-btn-ghost" style={{ padding: '5px 12px', fontSize: 12, gap: 4 }} onClick={() => onNav('tarefas')}>
              Ver todas <ChevronRight size={13} />
            </button>
          </div>

          {tarefasRecentes.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'rgba(176,153,255,0.4)', fontSize: 13 }}>
              Nenhuma tarefa cadastrada ainda.{' '}
              <button onClick={() => onNav('tarefas')} style={{ background: 'none', border: 'none', color: '#6C3BFF', cursor: 'pointer', fontSize: 13 }}>
                Criar primeira tarefa →
              </button>
            </div>
          ) : (
            <div>
              {tarefasRecentes.map((task, i) => {
                const initials = task.responsavel_nome
                  ? task.responsavel_nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                  : '?'
                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 20px',
                      borderBottom: i < tarefasRecentes.length - 1 ? '1px solid rgba(108,59,255,0.08)' : 'none',
                      transition: 'background 0.15s', cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(108,59,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="nexus-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#f0eeff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>
                        {task.titulo}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={11} color="rgba(176,153,255,0.4)" />
                        <span style={{ fontSize: 11, color: 'rgba(176,153,255,0.4)' }}>
                          {task.prazo ? new Date(task.prazo + 'T12:00').toLocaleDateString('pt-BR') : 'Sem prazo'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span className={priorityBadge(task.prioridade)}>{task.prioridade}</span>
                      <span className={statusBadge(task.status)}>{statusLabel(task.status)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Agenda de hoje — dados reais */}
          <div className="nexus-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(108,59,255,0.12)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Activity size={16} color="#6C3BFF" />
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: '#f0eeff' }}>
                Agenda de Hoje
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {eventosHoje.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(176,153,255,0.4)', fontSize: 12 }}>
                  Sem compromissos hoje.{' '}
                  <button onClick={() => onNav('agenda')} style={{ background: 'none', border: 'none', color: '#6C3BFF', cursor: 'pointer', fontSize: 12 }}>
                    Agendar →
                  </button>
                </div>
              ) : (
                eventosHoje.map((ev, i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(108,59,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 3, height: 36, borderRadius: 3, background: eventColor(ev.tipo), flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: eventColor(ev.tipo), marginBottom: 2 }}>
                        {ev.data_inicio.slice(11, 16)}
                      </div>
                      <div style={{ fontSize: 13, color: '#f0eeff', fontWeight: 500 }}>{ev.titulo}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Progresso mensal — dados reais */}
          <div className="nexus-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <BarChart3 size={16} color="#6C3BFF" />
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: '#f0eeff' }}>
                Progresso Geral
              </span>
            </div>
            {[
              { label: 'Tarefas', value: progresso },
              {
                label: 'Financeiro',
                value: receita > 0
                  ? Math.min(100, Math.round((receita / (receita + despesas)) * 100))
                  : 0
              },
              {
                label: 'Equipe',
                value: store.pessoas.length > 0
                  ? Math.min(100, Math.round((membros / store.pessoas.length) * 100))
                  : 0
              },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: 'rgba(176,153,255,0.55)' }}>{item.label}</span>
                  <span style={{ color: '#f0eeff', fontWeight: 600 }}>{item.value}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(108,59,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${item.value}%`,
                    background: 'linear-gradient(90deg, #6C3BFF, #00D4AA)',
                    borderRadius: 99,
                    transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mapa de seções → componentes ─────────────────────────
const PAGE_MAP: Partial<Record<Section, React.ComponentType>> = {
  equipe:        Equipe,
  tarefas:       Tarefas,
  agenda:        Agenda,
  financeiro:    Financeiro,
  documentos:    Documentos,
  relatorios:    Relatorios,
  configuracoes: Configuracoes,
}

// ── App principal ─────────────────────────────────────────
export default function App() {
  const [ready, setReady] = useState(isConfigured())
  const [section, setSection] = useState<Section>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Sincronização inicial ao montar
  useEffect(() => {
    if (ready && isSupabaseConfigured()) {
      syncFromSupabase().catch(console.warn)
    }
  }, [ready])

  async function handleSync() {
    setSyncing(true)
    try {
      await syncFromSupabase()
    } catch (e) {
      console.warn('Sync failed:', e)
    } finally {
      setSyncing(false)
    }
  }

  // Tela de setup (primeiro acesso)
  if (!ready) {
    return <Setup onDone={() => setReady(true)} />
  }

  // Renderiza o componente de página correto
  const PageComponent = PAGE_MAP[section]

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#0F0A1E' }}>
      <Sidebar
        active={section}
        onNav={setSection}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="nexus-main" style={{ flex: 1 }}>
        <TopBar
          onMenuOpen={() => setSidebarOpen(true)}
          onSync={handleSync}
          syncing={syncing}
        />
        <main>
          {section === 'dashboard'
            ? <DashboardView onNav={setSection} />
            : PageComponent
              ? <PageComponent />
              : null
          }
        </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
