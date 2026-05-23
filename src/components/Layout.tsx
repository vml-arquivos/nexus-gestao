import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, CheckCircle2, Calendar,
  DollarSign, FileText, BarChart3, Bell, Settings,
  Menu, X, Zap
} from 'lucide-react'
import { store } from '../lib/store'

const NAV = [
  { path: '/', icon: LayoutDashboard, label: 'Início', emoji: '🏠' },
  { path: '/equipe', icon: Users, label: 'Equipe', emoji: '👥' },
  { path: '/tarefas', icon: CheckCircle2, label: 'Tarefas', emoji: '✅' },
  { path: '/agenda', icon: Calendar, label: 'Agenda', emoji: '📅' },
  { path: '/financeiro', icon: DollarSign, label: 'Financeiro', emoji: '💳' },
  { path: '/documentos', icon: FileText, label: 'Docs', emoji: '🗂️' },
  { path: '/relatorios', icon: BarChart3, label: 'Relatórios', emoji: '📊' },
]

const BOTTOM_NAV = NAV.slice(0, 5) // 5 itens no bottom nav mobile

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const pendingTasks = store.tarefas.filter(t => t.status === 'pendente').length
  const overduePayments = store.pagamentos.filter(p => {
    if (p.status !== 'pendente' || !p.vencimento) return false
    return new Date(p.vencimento + 'T12:00') < new Date()
  }).length
  const notifCount = pendingTasks + overduePayments

  return (
    <div className="app-shell">
      {/* Sidebar overlay mobile */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 49, backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
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
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: '#fff'
            }}>
              {(store.config.nome || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {store.config.nome || 'Usuário'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Administrador</div>
            </div>
            <Link to="/configuracoes" style={{ color: 'var(--text3)' }} onClick={() => setSidebarOpen(false)}>
              <Settings size={16} />
            </Link>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main-content">
        {/* TOPBAR */}
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon"
            style={{ display: 'none' }}
            id="menu-toggle"
            onClick={() => setSidebarOpen(true)}
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
              onClick={() => setNotifOpen(!notifOpen)}
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
        </header>

        {/* PAGE CONTENT */}
        <main className="page-content">
          {children}
        </main>
      </div>

      {/* BOTTOM NAV (mobile) */}
      <nav className="bottom-nav">
        {BOTTOM_NAV.map(({ path, emoji, label }) => (
          <Link
            key={path}
            to={path}
            className={`nav-btn ${pathname === path ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <span className="nav-btn-icon">{emoji}</span>
            <span className="nav-btn-label">{label}</span>
            <div className="nav-dot" />
          </Link>
        ))}
      </nav>
    </div>
  )
}
