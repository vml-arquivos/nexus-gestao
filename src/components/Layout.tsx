import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, CheckCircle2, Calendar, DollarSign,
  FileText, BarChart3, Bell, Menu, Zap, Plus, Grid3X3, X,
  LogOut, Settings, Sun, Moon, UserCog, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'

// ── Rotas de navegação ────────────────────────────────────────────────────────
const NAV = [
  { path: '/',             icon: LayoutDashboard, label: 'Início'      },
  { path: '/equipe',       icon: Users,           label: 'Equipe'      },
  { path: '/tarefas',      icon: CheckCircle2,    label: 'Tarefas'     },
  { path: '/agenda',       icon: Calendar,        label: 'Agenda'      },
  { path: '/financeiro',   icon: DollarSign,      label: 'Financeiro'  },
  { path: '/pessoas',      icon: Users,           label: 'Pessoas'     },
  { path: '/documentos',   icon: FileText,        label: 'Arquivos'    },
  { path: '/relatorios',   icon: BarChart3,       label: 'Relatórios'  },
  { path: '/usuarios',     icon: UserCog,         label: 'Usuários'    },
  { path: '/configuracoes',icon: Settings,        label: 'Config.'     },
]

// Bottom nav: 4 itens + FAB + Mais
const BOTTOM_MAIN = [NAV[0], NAV[1], NAV[2], NAV[3]]

// ── Componente ────────────────────────────────────────────────────────────────
export default function Layout() {
  const { pathname }          = useLocation()
  const navigate              = useNavigate()
  const { user, logout }      = useAuth()
  const { theme, toggleTheme }= useTheme()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen]       = useState(false)
  const [fabOpen, setFabOpen]         = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)

  const initials = user?.nome
    ? user.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NX'

  function closeAll() {
    setSidebarOpen(false)
    setMoreOpen(false)
    setFabOpen(false)
    setNotifOpen(false)
  }

  useEffect(() => { closeAll() }, [pathname])

  // Fecha sidebar ao redimensionar para desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path)

  return (
    <div className="app-shell">
      {/* ── SIDEBAR (desktop always visible, mobile drawer) ─────────── */}
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div style={{
          padding: '16px 16px 12px',
          paddingTop: `calc(16px + var(--safe-top))`,
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--grad-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Zap size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, lineHeight: 1 }}>NEXUS</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>GESTÃO</div>
          </div>
          {/* Fechar sidebar no mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}
            className="lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {NAV.map(({ path, icon: Icon, label }) => {
            // Oculta "Usuários" para membros
            if (path === '/usuarios' && user?.role === 'membro') return null
            return (
              <Link
                key={path}
                to={path}
                className={`nav-item${isActive(path) ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {isActive(path) && <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
              </Link>
            )
          })}
        </nav>

        {/* Footer: user + tema */}
        <div style={{
          padding: '12px 16px',
          paddingBottom: `calc(12px + var(--safe-bot))`,
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Tema */}
          <button
            onClick={toggleTheme}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg3)', border: 'none', borderRadius: 'var(--radius-sm)',
              padding: '8px 12px', cursor: 'pointer', color: 'var(--text2)',
              fontSize: 'var(--text-sm)', fontWeight: 600, width: '100%',
              transition: 'background var(--transition-fast)',
            }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          </button>

          {/* Usuário */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--primary-dim)', border: '2px solid var(--primary-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13, color: 'var(--primary)', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nome || 'Usuário'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>
                {user?.role === 'gestor' ? 'Gestor' : user?.role === 'sub_gestor' ? 'Sub-Gestor' : 'Membro'}
              </div>
            </div>
            <button
              onClick={logout}
              title="Sair"
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, borderRadius: 6 }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── ÁREA PRINCIPAL ──────────────────────────────────────────── */}
      <div className="main-content">
        {/* Topbar */}
        <header className="topbar">
          {/* Hambúrguer (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <Menu size={22} />
          </button>

          {/* Logo mobile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--grad-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={14} color="#fff" />
            </div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14 }}>NEXUS</span>
          </div>

          {/* Ações topbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Tema */}
            <button
              onClick={toggleTheme}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex' }}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notificações */}
            <button
              onClick={() => { closeAll(); setNotifOpen(!notifOpen) }}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6, borderRadius: 8, position: 'relative', display: 'flex' }}
            >
              <Bell size={18} />
            </button>

            {/* Avatar */}
            <button
              onClick={logout}
              title="Sair"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--primary-dim)', border: '2px solid var(--primary-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12, color: 'var(--primary)', cursor: 'pointer',
              }}
            >
              {initials}
            </button>
          </div>
        </header>

        {/* Conteúdo da página */}
        <main className="page-scroll">
          <Outlet />
        </main>
      </div>

      {/* ── BOTTOM NAV (mobile) ──────────────────────────────────────── */}
      <nav className="bottom-nav">
        {BOTTOM_MAIN.slice(0, 2).map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '6px 12px', color: isActive(path) ? 'var(--primary)' : 'var(--text-muted)',
              fontSize: 10, fontWeight: 600, flex: 1, textDecoration: 'none',
              transition: 'color var(--transition-fast)',
            }}
          >
            <Icon size={21} />
            <span>{label}</span>
          </Link>
        ))}

        {/* FAB central */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* FAB actions */}
          {fabOpen && (
            <div style={{
              position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
              animation: 'slideUp 0.2s ease',
            }}>
              {[
                { path: '/tarefas',    label: 'Tarefa',    color: '#7C3AED' },
                { path: '/agenda',     label: 'Evento',    color: '#0891B2' },
                { path: '/financeiro', label: 'Pagamento', color: '#059669' },
                { path: '/pessoas',    label: 'Contato',   color: '#D97706' },
              ].map(a => (
                <button
                  key={a.path}
                  onClick={() => { closeAll(); navigate(a.path) }}
                  style={{
                    background: a.color, color: '#fff', border: 'none', borderRadius: 20,
                    padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
                  }}
                >
                  + {a.label}
                </button>
              ))}
            </div>
          )}
          <button
            className="fab"
            onClick={() => { setMoreOpen(false); setNotifOpen(false); setFabOpen(!fabOpen) }}
            style={{ transform: fabOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}
          >
            <Plus size={24} />
          </button>
        </div>

        {/* Itens direita */}
        {BOTTOM_MAIN.slice(2, 4).map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '6px 12px', color: isActive(path) ? 'var(--primary)' : 'var(--text-muted)',
              fontSize: 10, fontWeight: 600, flex: 1, textDecoration: 'none',
              transition: 'color var(--transition-fast)',
            }}
          >
            <Icon size={21} />
            <span>{label}</span>
          </Link>
        ))}

        {/* Mais */}
        <button
          onClick={() => { setFabOpen(false); setNotifOpen(false); setMoreOpen(!moreOpen) }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 12px', color: moreOpen ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: 10, fontWeight: 600, flex: 1, background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          {moreOpen ? <X size={21} /> : <Grid3X3 size={21} />}
          <span>Mais</span>
        </button>
      </nav>

      {/* Drawer "Mais" */}
      {moreOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={() => setMoreOpen(false)}
          />
          <div style={{
            position: 'fixed',
            bottom: `calc(var(--bottom-nav-h) + var(--safe-bot))`,
            left: 0, right: 0,
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--border)',
            borderRadius: '20px 20px 0 0',
            padding: '16px 20px 20px',
            zIndex: 99,
            boxShadow: 'var(--shadow-xl)',
            animation: 'slideUp 0.22s ease',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border2)', margin: '0 auto 16px' }} />
            <div className="section-label" style={{ padding: 0, marginBottom: 14 }}>Mais opções</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {NAV.slice(4).map(({ path, icon: Icon, label }) => {
                if (path === '/usuarios' && user?.role === 'membro') return null
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setMoreOpen(false)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                      padding: '14px 8px',
                      background: isActive(path) ? 'var(--primary-dim)' : 'var(--bg3)',
                      border: `1px solid ${isActive(path) ? 'var(--primary-dim)' : 'var(--border)'}`,
                      borderRadius: 14, textDecoration: 'none',
                    }}
                  >
                    <Icon size={20} color={isActive(path) ? 'var(--primary)' : 'var(--text2)'} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: isActive(path) ? 'var(--primary)' : 'var(--text2)', textAlign: 'center' }}>
                      {label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Overlay FAB */}
      {fabOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 48 }}
          onClick={() => setFabOpen(false)}
        />
      )}
    </div>
  )
}
