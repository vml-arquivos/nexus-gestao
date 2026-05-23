import React, { useState } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, CheckCircle2, Calendar,
  DollarSign, FileText, BarChart3, Bell,
  Menu, Zap, Plus, Grid3X3, X, LogOut
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'

// Navegação principal. Renomeamos "Equipe" para "Pessoas" para refletir que o módulo
// gerencia todos os contatos (membros, clientes, credores, devedores etc.)
const NAV = [
  { path: '/',            icon: LayoutDashboard, label: 'Início',      emoji: '🏠' },
  { path: '/pessoas',     icon: Users,            label: 'Pessoas',     emoji: '👥' },
  { path: '/tarefas',     icon: CheckCircle2,     label: 'Tarefas',     emoji: '✅' },
  { path: '/agenda',      icon: Calendar,         label: 'Agenda',      emoji: '📅' },
  { path: '/financeiro',  icon: DollarSign,       label: 'Financeiro',  emoji: '💳' },
  { path: '/documentos',  icon: FileText,         label: 'Docs',        emoji: '🗂️' },
  { path: '/relatorios',  icon: BarChart3,        label: 'Relatórios',  emoji: '📊' },
]

// Ações rápidas do botão "+"
const QUICK_ACTIONS = [
  { path: '/tarefas',    label: 'Nova Tarefa',     emoji: '✅', color: '#6C3BFF' },
  { path: '/agenda',     label: 'Novo Evento',     emoji: '📅', color: '#06B6D4' },
  { path: '/financeiro', label: 'Novo Lançamento', emoji: '💳', color: '#10B981' },
  { path: '/pessoas',    label: 'Novo Contato',    emoji: '👥', color: '#F59E0B' },
  { path: '/documentos', label: 'Novo Documento',  emoji: '🗂️', color: '#EF4444' },
]

// Bottom nav: 4 itens fixos + botão "+" central + botão "Mais"
const BOTTOM_MAIN = [
  NAV[0], // Início
  NAV[2], // Tarefas
  NAV[4], // Financeiro
  NAV[3], // Agenda
]

export default function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [notifOpen, setNotifOpen]       = useState(false)
  const [moreOpen, setMoreOpen]         = useState(false)
  const [fabOpen, setFabOpen]           = useState(false)

  const notifCount = 0
  const pendingTasks = 0
  const overduePayments = 0

  const initials = user?.nome
    ? user.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NX'

  function closeAll() {
    setMoreOpen(false)
    setFabOpen(false)
    setNotifOpen(false)
  }

  function handleQuickAction(path: string) {
    navigate(path)
    closeAll()
    setTimeout(() => window.dispatchEvent(new CustomEvent('nexus:open-new')), 120)
  }

  async function handleSignOut() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      {/* Overlay: fecha menus mobile */}
      {(sidebarOpen || moreOpen || fabOpen) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49, backdropFilter: 'blur(3px)' }}
          onClick={closeAll}
        />
      )}

      {/* ══════════════════════════════════════════
          SIDEBAR (desktop + hamburguer mobile)
      ══════════════════════════════════════════ */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--grad-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Zap size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em' }}>
                <span className="text-gradient">Nexus</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>Gestão Inteligente</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          <div style={{ padding: '8px 8px 4px' }}>
            <div className="section-title" style={{ padding: '0 8px' }}>Menu</div>
          </div>
          {NAV.map(({ path, icon: Icon, label }) => (
            <Link
              key={path}
              to={path}
              className={`sidebar-item ${pathname === path ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg,#6C3BFF,#06B6D4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: '#fff',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nome || 'Usuário'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {user?.role === 'gestor' ? '👑 Gestor' : '👤 Membro'}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <div className="main-content">
        {/* TOPBAR */}
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon"
            style={{ display: 'none' }}
            id="menu-toggle"
            onClick={() => { closeAll(); setSidebarOpen(true) }}
          >
            <Menu size={20} />
          </button>
          <style>{`@media(max-width:768px){#menu-toggle{display:flex}}`}</style>

          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} id="mobile-logo">
            <style>{`@media(min-width:769px){#mobile-logo{display:none}}`}</style>
            <Zap size={18} color="var(--primary-light)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }} className="text-gradient">
              Nexus
            </span>
          </div>

          {/* Page title desktop */}
          <div style={{ flex: 1 }} id="desktop-breadcrumb">
            <style>{`@media(max-width:768px){#desktop-breadcrumb{display:none}}`}</style>
            <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>
              {NAV.find(n => n.path === pathname)?.label ?? 'Nexus'}
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Notifications */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => { closeAll(); setNotifOpen(!notifOpen) }}
              style={{ position: 'relative' }}
            >
              <Bell size={18} />
              {notifCount > 0 && (
                <span className="notif-badge">{notifCount > 9 ? '9+' : notifCount}</span>
              )}
            </button>
            {notifOpen && (
              <div style={{
                position: 'absolute', top: '110%', right: 0,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 12, minWidth: 280,
                boxShadow: 'var(--shadow-lg)', zIndex: 60
              }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                  Notificações
                </div>
                {pendingTasks > 0 && (
                  <div style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                    ✅ <strong>{pendingTasks}</strong> tarefa{pendingTasks > 1 ? 's' : ''} pendente{pendingTasks > 1 ? 's' : ''}
                  </div>
                )}
                {overduePayments > 0 && (
                  <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                    💸 <strong>{overduePayments}</strong> pagamento{overduePayments > 1 ? 's' : ''} vencido{overduePayments > 1 ? 's' : ''}
                  </div>
                )}
                {notifCount === 0 && (
                  <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
                    Tudo em dia! 🎉
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg,#6C3BFF,#06B6D4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, color: '#fff',
            cursor: 'pointer', flexShrink: 0,
          }}>
            {initials}
          </div>
        </header>

        {/* PAGE CONTENT — Outlet renderiza a rota filha */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* ══════════════════════════════════════════
          BOTTOM NAV MOBILE — 4 itens + FAB + Mais
      ══════════════════════════════════════════ */}
      <nav className="bottom-nav">
        {/* Itens da esquerda: Início e Tarefas */}
        {BOTTOM_MAIN.slice(0, 2).map(({ path, emoji, label }) => (
          <Link
            key={path}
            to={path}
            className={`nav-btn ${pathname === path ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
            onClick={closeAll}
          >
            <span className="nav-btn-icon">{emoji}</span>
            <span className="nav-btn-label">{label}</span>
            <div className="nav-dot" />
          </Link>
        ))}

        {/* FAB central "+" com ações rápidas */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          {fabOpen && (
            <div style={{
              position: 'absolute',
              bottom: 68,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'center',
              zIndex: 55,
            }}>
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={action.path}
                  onClick={() => handleQuickAction(action.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 40,
                    padding: '8px 16px 8px 10px',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    animation: `fabItemIn 0.18s ease ${i * 0.04}s both`,
                  }}
                >
                  <span style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: action.color + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}>{action.emoji}</span>
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => { setMoreOpen(false); setNotifOpen(false); setFabOpen(!fabOpen) }}
            style={{
              width: 52, height: 52,
              borderRadius: 16,
              background: 'var(--grad-primary)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(108,59,255,0.5)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              transform: fabOpen ? 'rotate(45deg) scale(1.05)' : 'scale(1)',
              position: 'relative',
              zIndex: 51,
              marginBottom: 4,
            }}
          >
            <Plus size={24} color="#fff" />
          </button>
        </div>

        {/* Itens da direita: Financeiro e Agenda */}
        {BOTTOM_MAIN.slice(2, 4).map(({ path, emoji, label }) => (
          <Link
            key={path}
            to={path}
            className={`nav-btn ${pathname === path ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
            onClick={closeAll}
          >
            <span className="nav-btn-icon">{emoji}</span>
            <span className="nav-btn-label">{label}</span>
            <div className="nav-dot" />
          </Link>
        ))}

        {/* Botão "Mais" */}
        <button
          className={`nav-btn ${moreOpen ? 'active' : ''}`}
          onClick={() => { setFabOpen(false); setNotifOpen(false); setMoreOpen(!moreOpen) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="nav-btn-icon">
            {moreOpen ? <X size={20} color="var(--primary-light)" /> : <Grid3X3 size={20} color={moreOpen ? 'var(--primary-light)' : 'var(--text3)'} />}
          </span>
          <span className="nav-btn-label" style={{ color: moreOpen ? 'var(--primary-light)' : undefined }}>Mais</span>
          <div className="nav-dot" />
        </button>
      </nav>

      {/* ══════════════════════════════════════════
          DRAWER "MAIS" — páginas extras no mobile
      ══════════════════════════════════════════ */}
      {moreOpen && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(60px + var(--safe-bot, 0px))',
          left: 0, right: 0,
          background: 'var(--bg2)',
          borderTop: '1px solid var(--border)',
          borderRadius: '20px 20px 0 0',
          padding: '16px 20px 20px',
          zIndex: 50,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
          animation: 'drawerSlideUp 0.22s ease both',
        }}>
          <div style={{
            width: 36, height: 4, borderRadius: 99,
            background: 'var(--border)', margin: '0 auto 16px',
          }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', marginBottom: 12 }}>
            MAIS OPÇÕES
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {NAV.map(({ path, emoji, label }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMoreOpen(false)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '14px 8px',
                  background: pathname === path ? 'rgba(108,59,255,0.15)' : 'var(--bg3)',
                  border: pathname === path ? '1px solid rgba(108,59,255,0.3)' : '1px solid var(--border)',
                  borderRadius: 14,
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 24 }}>{emoji}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: pathname === path ? 'var(--primary-light)' : 'var(--text2)',
                  textAlign: 'center',
                }}>
                  {label}
                </span>
              </Link>
            ))}

            <Link
              to="/configuracoes"
              onClick={() => setMoreOpen(false)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '14px 8px',
                background: pathname === '/configuracoes' ? 'rgba(108,59,255,0.15)' : 'var(--bg3)',
                border: pathname === '/configuracoes' ? '1px solid rgba(108,59,255,0.3)' : '1px solid var(--border)',
                borderRadius: 14,
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 24 }}>⚙️</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: pathname === '/configuracoes' ? 'var(--primary-light)' : 'var(--text2)' }}>
                Config.
              </span>
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @keyframes drawerSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes fabItemIn {
          from { transform: translateY(12px) scale(0.9); opacity: 0; }
          to   { transform: translateY(0)    scale(1);   opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
