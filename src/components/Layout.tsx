import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, CheckCircle2, Calendar, DollarSign,
  FileText, BarChart3, Bell, Menu, Zap, Plus, Grid3X3, X,
  LogOut, Settings, Sun, Moon, UserCog, ChevronRight,
  CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { useNotificacoes } from '../hooks/useNotificacoes'
import { NotificacaoToast } from './NotificacaoToast'
import { isGestorLike, roleLabel } from '../lib/roles'
import { useVisualTexts, type VisualTextKey } from '../hooks/useVisualTexts'

// ── Rotas de navegação ────────────────────────────────────────────────────────
const NAV: { path: string; icon: typeof LayoutDashboard; labelKey: VisualTextKey }[] = [
  { path: '/',             icon: LayoutDashboard, labelKey: 'nav.home'      },
  { path: '/equipe',       icon: Users,           labelKey: 'nav.team'      },
  { path: '/equipes',      icon: Grid3X3,          labelKey: 'nav.teams'     },
  { path: '/tarefas',      icon: CheckCircle2,    labelKey: 'nav.tasks'     },
  { path: '/agenda',       icon: Calendar,        labelKey: 'nav.agenda'    },
  { path: '/financeiro',   icon: DollarSign,      labelKey: 'nav.finance'   },
  { path: '/pessoas',      icon: Users,           labelKey: 'nav.people'    },
  { path: '/documentos',   icon: FileText,        labelKey: 'nav.files'     },
  { path: '/relatorios',   icon: BarChart3,       labelKey: 'nav.reports'   },
  { path: '/usuarios',     icon: UserCog,         labelKey: 'nav.users'     },
  { path: '/configuracoes',icon: Settings,        labelKey: 'nav.settings'  },
]

// Mantemos NAV no escopo global. BOTTOM_MAIN será calculado dentro do componente Layout.

function iconeNotif(tipo: string) {
  if (tipo === 'tarefa_concluida')     return <CheckCircle size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
  if (tipo === 'tarefa_nao_concluida') return <XCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
  if (tipo === 'tarefa_vencida')       return <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />
  return <Bell size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
}

function tempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function Layout() {
  const { pathname }           = useLocation()
  const navigate               = useNavigate()
  const { user, logout }       = useAuth()
  const { t }                  = useVisualTexts()
  const { theme, toggleTheme } = useTheme()
  const { notificacoes, naoLidas, toasts, marcarLida, marcarTodasLidas, fecharToast } = useNotificacoes()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen]       = useState(false)
  const [fabOpen, setFabOpen]         = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const initials = user?.nome
    ? user.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NX'

  function closeAll() {
    setSidebarOpen(false)
    setMoreOpen(false)
    setFabOpen(false)
    setNotifOpen(false)
  }

  // Calcula itens principais do bottom nav conforme o papel do usuário
  const bottomMain = NAV.filter(n => {
    if (!user) return false
    // Membro não vê equipe no bottom nav
    if (!isGestorLike(user.role) && (n.path === '/equipe' || n.path === '/equipes')) return false
    return ['/', '/equipe', '/tarefas', '/agenda'].includes(n.path)
  }).map(item => {
    // Se membro, redireciona /tarefas para /minhas-tarefas
    const adjusted = !isGestorLike(user?.role) && item.path === '/tarefas'
      ? { ...item, path: '/minhas-tarefas' }
      : item
    return { ...adjusted, label: t(adjusted.labelKey) }
  })

  useEffect(() => { closeAll() }, [pathname])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Fecha painel de notificações ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [notifOpen])

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path)

  return (
    <div className="app-shell">
      {/* ── TOASTS DE NOTIFICAÇÃO ──────────────────────────────────────── */}
      <NotificacaoToast toasts={toasts} onFechar={fecharToast} />

      {/* ── SIDEBAR ───────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div style={{
          padding: '16px 16px 12px',
          paddingTop: `calc(16px + var(--safe-top))`,
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--grad-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Zap size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, lineHeight: 1 }}>{t('app.name')}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>{t('app.subtitle')}</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {NAV.map(({ path, icon: Icon, labelKey }) => {
            const label = t(labelKey)
            if (!user) return null
            // Esconde entradas restritas para membros
            if (!isGestorLike(user.role)) {
              // Membros não gerenciam equipes/relatórios, mas acessam usuários abaixo deles
              // e módulos pessoais de financeiro, pessoas e documentos, filtrados pelo backend.
              if ([
                '/equipe',
                '/equipes',
                '/relatorios',
              ].includes(path)) return null
            }
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

        <div style={{
          padding: '12px 16px',
          paddingBottom: `calc(12px + var(--safe-bot))`,
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
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
                {roleLabel(user?.role)}
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

      {/* ── ÁREA PRINCIPAL ────────────────────────────────────────────── */}
      <div className="main-content">
        <header className="topbar">
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <Menu size={22} />
          </button>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={toggleTheme}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex' }}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* ── SINO DE NOTIFICAÇÕES ──────────────────────────────── */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setFabOpen(false); setMoreOpen(false); setNotifOpen(v => !v) }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text3)',
                  cursor: 'pointer', padding: 6, borderRadius: 8,
                  position: 'relative', display: 'flex',
                }}
                title="Notificações"
              >
                <Bell size={18} />
                {naoLidas > 0 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 2,
                    width: naoLidas > 9 ? 18 : 16,
                    height: 16,
                    borderRadius: 99,
                    background: 'var(--danger)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                    border: '2px solid var(--bg2)',
                    animation: naoLidas > 0 ? 'pulse 2s infinite' : 'none',
                  }}>
                    {naoLidas > 99 ? '99+' : naoLidas}
                  </span>
                )}
              </button>

              {/* Painel de notificações */}
              {notifOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 'min(340px, calc(100vw - 24px))',
                  maxHeight: 'min(480px, calc(100dvh - var(--topbar-h) - var(--safe-top) - 24px))',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}>
                  {/* Header do painel */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px 10px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      Notificações
                      {naoLidas > 0 && (
                        <span style={{
                          marginLeft: 8, background: 'var(--danger)',
                          color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: 11,
                        }}>
                          {naoLidas}
                        </span>
                      )}
                    </div>
                    {naoLidas > 0 && (
                      <button
                        onClick={marcarTodasLidas}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--primary)', fontSize: 12, fontWeight: 600,
                        }}
                      >
                        Marcar todas lidas
                      </button>
                    )}
                  </div>

                  {/* Lista */}
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {notificacoes.length === 0 ? (
                      <div style={{
                        padding: '32px 16px', textAlign: 'center',
                        color: 'var(--text3)', fontSize: '0.85rem',
                      }}>
                        <Bell size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                        <div>Nenhuma notificação</div>
                      </div>
                    ) : (
                      notificacoes.map(n => (
                        <div
                          key={n.id}
                          onClick={() => {
                            marcarLida(n.id)
                            if (n.referencia_tipo === 'tarefa' && n.referencia_id) {
                              navigate('/tarefas')
                              setNotifOpen(false)
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border)',
                            background: n.lida ? 'transparent' : 'var(--primary-dim)',
                            cursor: n.referencia_id ? 'pointer' : 'default',
                            transition: 'background 0.15s',
                          }}
                        >
                          <div style={{ marginTop: 2 }}>{iconeNotif(n.tipo)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontWeight: n.lida ? 500 : 700,
                              fontSize: '0.82rem',
                              color: 'var(--text)',
                              marginBottom: 2,
                            }}>
                              {n.titulo}
                            </div>
                            {n.body && (
                              <div style={{
                                fontSize: '0.77rem',
                                color: 'var(--text3)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {n.body}
                              </div>
                            )}
                          </div>
                          <div style={{
                            fontSize: 11, color: 'var(--text3)',
                            flexShrink: 0, marginTop: 2,
                          }}>
                            {tempoRelativo(n.created_at)}
                          </div>
                          {!n.lida && (
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: 'var(--primary)',
                              flexShrink: 0, marginTop: 4,
                            }} />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

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

        <main className="page-scroll">
          <Outlet />
        </main>
      </div>

      {/* ── BOTTOM NAV (mobile) ──────────────────────────────────────── */}
      <nav className="bottom-nav">
        {bottomMain.slice(0, 2).map(({ path, icon: Icon, label }) => (
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
          {fabOpen && (
            <div style={{
              position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
              animation: 'slideUp 0.2s ease',
            }}>
              {(() => {
                const actions: { path: string; label: string; color: string }[] = []
                if (user) {
                  // Todos podem criar tarefas pessoais
                  actions.push({ path: user.role === 'membro' ? '/tarefas' : '/tarefas', label: 'Tarefa', color: '#2563EB' })
                  // Agenda: todos têm agenda pessoal
                  actions.push({ path: '/agenda', label: 'Evento', color: '#0891B2' })
                  // Financeiro: apenas gestores e subgestores
                  actions.push({ path: '/financeiro', label: 'Pagamento', color: '#059669' })
                  // Pessoas/Contato: apenas gestores e subgestores
                  actions.push({ path: '/pessoas', label: 'Contato', color: '#D97706' })
                }
                return actions.map(a => (
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
                ))
              })()}
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

        {bottomMain.slice(2, 4).map(({ path, icon: Icon, label }) => (
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

        {/* Sino mobile com badge */}
        <button
          onClick={() => { setFabOpen(false); setMoreOpen(false); setNotifOpen(v => !v) }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 12px', color: notifOpen ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: 10, fontWeight: 600, flex: 1, background: 'none', border: 'none',
            cursor: 'pointer', position: 'relative',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Bell size={21} />
            {naoLidas > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 16, height: 16, borderRadius: 99,
                background: 'var(--danger)', color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--bg2)',
              }}>
                {naoLidas > 9 ? '9+' : naoLidas}
              </span>
            )}
          </div>
          <span>Avisos</span>
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
              {NAV.slice(4).map(({ path, icon: Icon, labelKey }) => {
                const label = t(labelKey)
                // Usuários fica disponível para todos; permissões são filtradas por hierarquia no backend
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

      {fabOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 48 }}
          onClick={() => setFabOpen(false)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
