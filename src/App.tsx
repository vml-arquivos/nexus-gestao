import { useState } from 'react'
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
} from 'lucide-react'

// ── tipos ────────────────────────────────────────────
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

interface StatCard {
  label: string
  value: string
  change: string
  positive: boolean
  icon: React.ReactNode
  accent: string
}

// ── dados mock ───────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',    label: 'Dashboard',    icon: <LayoutDashboard size={18} /> },
  { id: 'equipe',       label: 'Equipe',        icon: <Users size={18} /> },
  { id: 'tarefas',      label: 'Tarefas',       icon: <CheckSquare size={18} /> },
  { id: 'agenda',       label: 'Agenda',        icon: <Calendar size={18} /> },
  { id: 'financeiro',   label: 'Financeiro',    icon: <DollarSign size={18} /> },
  { id: 'documentos',   label: 'Documentos',    icon: <FileText size={18} /> },
  { id: 'relatorios',   label: 'Relatórios',    icon: <BarChart3 size={18} /> },
  { id: 'configuracoes',label: 'Configurações', icon: <Settings size={18} /> },
]

const STATS: StatCard[] = [
  {
    label: 'Receita do Mês',
    value: 'R$ 48.250',
    change: '+12,4%',
    positive: true,
    icon: <DollarSign size={20} />,
    accent: '#6C3BFF',
  },
  {
    label: 'Tarefas Concluídas',
    value: '87 / 104',
    change: '+8 hoje',
    positive: true,
    icon: <CheckCircle2 size={20} />,
    accent: '#00D4AA',
  },
  {
    label: 'Membros Ativos',
    value: '24',
    change: '3 online',
    positive: true,
    icon: <Users size={20} />,
    accent: '#F5A623',
  },
  {
    label: 'Pendências',
    value: '17',
    change: '+3 hoje',
    positive: false,
    icon: <AlertCircle size={20} />,
    accent: '#EF4444',
  },
]

const TASKS = [
  { id: 1, title: 'Revisar contratos Q3 2025',        priority: 'Alta',   status: 'Em andamento', assignee: 'MR', due: 'Hoje' },
  { id: 2, title: 'Reunião de alinhamento semanal',   priority: 'Média',  status: 'Agendado',     assignee: 'JS', due: 'Amanhã' },
  { id: 3, title: 'Atualizar planilha financeira',    priority: 'Alta',   status: 'Pendente',     assignee: 'AL', due: 'Hj 17h' },
  { id: 4, title: 'Onboarding novos colaboradores',   priority: 'Baixa',  status: 'Concluído',    assignee: 'TC', due: 'Concluído' },
  { id: 5, title: 'Deploy sistema de notificações',   priority: 'Alta',   status: 'Em andamento', assignee: 'MR', due: 'Sex' },
]

const EVENTS = [
  { time: '09:00', title: 'Stand-up diário',         type: 'reuniao' },
  { time: '11:30', title: 'Review sprint',            type: 'reuniao' },
  { time: '14:00', title: 'Entrevista candidato Dev', type: 'entrevista' },
  { time: '16:00', title: 'Fechamento financeiro',    type: 'financeiro' },
]

// ── helpers ──────────────────────────────────────────
function priorityBadge(p: string) {
  const map: Record<string, string> = {
    Alta:  'nexus-badge nexus-badge-red',
    Média: 'nexus-badge nexus-badge-gold',
    Baixa: 'nexus-badge nexus-badge-green',
  }
  return map[p] ?? 'nexus-badge nexus-badge-purple'
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    'Em andamento': 'nexus-badge nexus-badge-purple',
    Agendado:       'nexus-badge nexus-badge-gold',
    Pendente:       'nexus-badge nexus-badge-red',
    Concluído:      'nexus-badge nexus-badge-green',
  }
  return map[s] ?? 'nexus-badge nexus-badge-purple'
}

function eventColor(type: string) {
  const map: Record<string, string> = {
    reuniao:     '#6C3BFF',
    entrevista:  '#F5A623',
    financeiro:  '#00D4AA',
  }
  return map[type] ?? '#6C3BFF'
}

// ── componentes ──────────────────────────────────────

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
  return (
    <>
      {/* overlay mobile */}
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

          {/* Busca */}
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
            <div className="nexus-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>VM</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f0eeff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Usuário Nexus
              </div>
              <div style={{ fontSize: 11, color: 'rgba(176,153,255,0.5)' }}>Admin · Premium</div>
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

function TopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
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
      {/* menu mobile */}
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

      {/* notificações */}
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

      <div className="nexus-avatar">VM</div>
    </header>
  )
}

function DashboardView() {
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
              Bom dia, bem-vindo ao{' '}
              <span style={{
                background: 'linear-gradient(135deg, #6C3BFF, #00D4AA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Nexus</span> ⚡
            </h1>
            <p style={{ color: 'rgba(176,153,255,0.55)', fontSize: 14 }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button className="nexus-btn-primary" style={{ gap: 8 }}>
            <Plus size={16} /> Nova Tarefa
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {STATS.map((stat, i) => (
          <div
            key={i}
            className="nexus-stat-card"
            style={{ animationDelay: `${i * 0.07}s` }}
          >
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
              <span style={{ color: 'rgba(176,153,255,0.4)' }}>vs. mês anterior</span>
            </div>
          </div>
        ))}
      </div>

      {/* Conteúdo principal: tarefas + agenda */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }}>

        {/* Tarefas recentes */}
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
            <button
              className="nexus-btn-ghost"
              style={{ padding: '5px 12px', fontSize: 12, gap: 4 }}
            >
              Ver todas <ChevronRight size={13} />
            </button>
          </div>

          <div>
            {TASKS.map((task, i) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 20px',
                  borderBottom: i < TASKS.length - 1 ? '1px solid rgba(108,59,255,0.08)' : 'none',
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(108,59,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="nexus-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                  {task.assignee}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: '#f0eeff',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    marginBottom: 3,
                  }}>
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={11} color="rgba(176,153,255,0.4)" />
                    <span style={{ fontSize: 11, color: 'rgba(176,153,255,0.4)' }}>{task.due}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={priorityBadge(task.priority)}>{task.priority}</span>
                  <span className={statusBadge(task.status)}>{task.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agenda do dia */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              {EVENTS.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 20px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(108,59,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    width: 3, height: 36, borderRadius: 3,
                    background: eventColor(ev.type),
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: eventColor(ev.type), marginBottom: 2 }}>
                      {ev.time}
                    </div>
                    <div style={{ fontSize: 13, color: '#f0eeff', fontWeight: 500 }}>{ev.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mini progresso */}
          <div className="nexus-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <BarChart3 size={16} color="#6C3BFF" />
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: '#f0eeff' }}>
                Progresso Mensal
              </span>
            </div>
            {[
              { label: 'Tarefas', value: 84 },
              { label: 'Metas',   value: 67 },
              { label: 'Receita', value: 91 },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: 'rgba(176,153,255,0.55)' }}>{item.label}</span>
                  <span style={{ color: '#f0eeff', fontWeight: 600 }}>{item.value}%</span>
                </div>
                <div style={{
                  height: 6, background: 'rgba(108,59,255,0.15)',
                  borderRadius: 99, overflow: 'hidden',
                }}>
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

function PlaceholderView({ section }: { section: Section }) {
  const item = NAV_ITEMS.find(n => n.id === section)
  return (
    <div className="nexus-animate-in" style={{ padding: 28 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 800,
          fontSize: 26,
          color: '#f0eeff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ color: '#6C3BFF' }}>{item?.icon}</span>
          {item?.label}
        </h1>
      </div>
      <div className="nexus-card" style={{
        padding: 48,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        minHeight: 300,
      }}>
        <div style={{
          width: 64, height: 64,
          borderRadius: 20,
          background: 'rgba(108,59,255,0.15)',
          border: '1px solid rgba(108,59,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6C3BFF',
        }}>
          {item?.icon && <span style={{ transform: 'scale(1.7)' }}>{item.icon}</span>}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, color: '#f0eeff', marginBottom: 6 }}>
            Módulo {item?.label}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(176,153,255,0.5)', maxWidth: 320 }}>
            Esta seção está em desenvolvimento. Configure a integração com o Supabase para ativar todos os recursos.
          </div>
        </div>
        <button className="nexus-btn-primary" style={{ marginTop: 8 }}>
          <Plus size={15} /> Começar configuração
        </button>
      </div>
    </div>
  )
}

// ── App principal ─────────────────────────────────────
export default function App() {
  const [section, setSection] = useState<Section>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#0F0A1E' }}>
      <Sidebar
        active={section}
        onNav={setSection}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="nexus-main" style={{ flex: 1 }}>
        <TopBar onMenuOpen={() => setSidebarOpen(true)} />
        <main>
          {section === 'dashboard'
            ? <DashboardView />
            : <PlaceholderView section={section} />
          }
        </main>
      </div>
    </div>
  )
}