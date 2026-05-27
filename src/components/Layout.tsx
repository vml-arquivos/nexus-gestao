import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CheckCircle2,
  Calendar,
  DollarSign,
  FileText,
  BarChart3,
  Bell,
  Menu,
  Zap,
  Plus,
  Grid3X3,
  X,
  LogOut,
  Crown,
  UserRound,
  CalendarPlus,
  WalletCards,
  UploadCloud,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from '../lib/ThemeContext'

const NAV = [
  { path: "/", icon: LayoutDashboard, label: "Início" },
  { path: "/pessoas", icon: Users, label: "Pessoas" },
  { path: "/equipe", icon: Users, label: "Equipe" },
  // Novo menu para gestão de usuários (apenas gestores e sub-gestores)
  { path: "/usuarios", icon: Users, label: "Usuários" },
  { path: "/tarefas", icon: CheckCircle2, label: "Tarefas" },
  { path: "/agenda", icon: Calendar, label: "Agenda" },
  { path: "/financeiro", icon: DollarSign, label: "Financeiro" },
  { path: "/documentos", icon: FileText, label: "Arquivos" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

const QUICK_ACTIONS = [
  { path: "/tarefas",    label: "Nova Tarefa",     icon: CheckCircle2, color: "#7C3AED" },
  { path: "/agenda",     label: "Novo Evento",     icon: CalendarPlus, color: "#0891B2" },
  { path: "/financeiro", label: "Novo Pagamento",  icon: WalletCards,  color: "#059669" },
  { path: "/pessoas",    label: "Novo Contato",    icon: Users,        color: "#D97706" },
  { path: "/documentos", label: "Novo Arquivo",    icon: UploadCloud,  color: "#DC2626" },
  { path: "/compartilhar", label: "Compartilhar",  icon: UploadCloud,  color: "#4F46E5" },
];

// Bottom nav: 4 itens fixos + FAB central + Mais
const BOTTOM_MAIN = [NAV[0], NAV[2], NAV[4], NAV[3]];

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  // Controla a barra de status iOS via meta tag dinâmica
  const [, setScrolled] = useState(false);

  const notifCount = 0;
  const pendingTasks = 0;
  const overduePayments = 0;

  // Lida com tema claro/escuro usando ThemeContext
  const { theme, toggleTheme } = useTheme();

  const initials = user?.nome
    ? user.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "NX";

  // Fecha menus ao mudar de rota
  useEffect(() => {
    closeAll();
  }, [pathname]);

  // Detecta scroll para glassmorphism na topbar
  useEffect(() => {
    const el = document.querySelector('.page-content');
    if (!el) return;
    const handler = () => setScrolled(el.scrollTop > 10);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  function closeAll() {
    setMoreOpen(false);
    setFabOpen(false);
    setNotifOpen(false);
    setSidebarOpen(false);
  }

  function handleQuickAction(path: string) {
    navigate(path);
    closeAll();
    setTimeout(() => window.dispatchEvent(new CustomEvent("nexus:open-new")), 120);
  }

  async function handleSignOut() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      {/* ── Overlay: fecha menus mobile ── */}
      {(sidebarOpen || moreOpen || fabOpen) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.60)",
            zIndex: 54,
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={closeAll}
        />
      )}

      {/* ═══════════════════════════════════════════
          SIDEBAR (desktop + drawer mobile)
      ═══════════════════════════════════════════ */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        {/* Logo */}
        <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: "var(--grad-primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(108,59,255,0.4)",
            }}>
              <Zap size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-0.03em" }}>
                <span className="text-gradient">Nexus</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 500 }}>Gestão Inteligente</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "10px 0", overflowY: "auto" }}>
          <div style={{ padding: "6px 8px 2px" }}>
            <div className="section-title" style={{ padding: "0 8px" }}>Menu</div>
          </div>
          {NAV.map(({ path, icon: Icon, label }) => (
            <Link
              key={path}
              to={path}
              className={`sidebar-item ${pathname === path ? "active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          ))}
          <div style={{ margin: "8px 16px 0", borderTop: "1px solid var(--border)" }} />
          <Link
            to="/configuracoes"
            className={`sidebar-item ${pathname === "/configuracoes" ? "active" : ""}`}
            onClick={() => setSidebarOpen(false)}
          >
            <Settings size={17} />
            <span>Configurações</span>
          </Link>
        </nav>

        {/* User */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg,#6C3BFF,#06B6D4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 13, color: "#fff",
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.nome || "Usuário"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", display: "flex", alignItems: "center", gap: 4 }}>
                {user?.role === 'gestor'
                  ? (<><Crown size={11} /> Gestor</>)
                  : user?.role === 'sub_gestor'
                    ? (<><Crown size={11} /> Sub‑gestor</>)
                    : (<><UserRound size={11} /> Membro</>)}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 4, borderRadius: 6 }}
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════ */}
      <div className="main-content">
        {/* TOPBAR */}
        <header className="topbar">
          {/* Hamburguer — só mobile */}
          <button
            className="btn btn-ghost btn-icon"
            style={{ display: "none" }}
            id="menu-toggle"
            onClick={() => { closeAll(); setSidebarOpen(true); }}
          >
            <Menu size={20} />
          </button>
          <style>{`@media(max-width:768px){#menu-toggle{display:flex!important}}`}</style>

          {/* Logo mobile */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }} id="mobile-logo">
            <style>{`@media(min-width:769px){#mobile-logo{display:none!important}}`}</style>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--grad-primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Zap size={14} color="#fff" />
            </div>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 16 }} className="text-gradient">
              Nexus
            </span>
          </div>

          {/* Título da página — desktop */}
          <div style={{ flex: 1 }} id="desktop-breadcrumb">
            <style>{`@media(max-width:768px){#desktop-breadcrumb{display:none!important}}`}</style>
            <span style={{ fontSize: 13, color: "var(--text3)", fontWeight: 500 }}>
              {NAV.find((n) => n.path === pathname)?.label ?? "Nexus"}
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Notificações */}
          <div style={{ position: "relative" }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => { closeAll(); setNotifOpen(!notifOpen); }}
              style={{ position: "relative" }}
            >
              <Bell size={18} />
              {notifCount > 0 && (
                <span className="notif-badge">{notifCount > 9 ? "9+" : notifCount}</span>
              )}
            </button>
            {notifOpen && (
              <div style={{
                position: "absolute", top: "110%", right: 0,
                background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", padding: 12, minWidth: 280,
                boxShadow: "var(--shadow-lg)", zIndex: 60,
                animation: "slideDown 0.18s ease both",
              }}>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                  Notificações
                </div>
                {notifCount === 0 && (
                  <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "8px 0" }}>
                    Tudo em dia ✓
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Alternância de tema claro/escuro */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => { toggleTheme(); }}
            style={{ marginLeft: 4 }}
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg,#6C3BFF,#06B6D4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 12,
            color: "#fff", cursor: "pointer", flexShrink: 0,
          }}>
            {initials}
          </div>
        </header>

        {/* CONTEÚDO DA PÁGINA */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* ═══════════════════════════════════════════
          BOTTOM NAV — ESTILO APP NATIVO iOS/Android
      ═══════════════════════════════════════════ */}
      <nav className="bottom-nav">
        {/* Itens esquerda */}
        {BOTTOM_MAIN.slice(0, 2).map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={`nav-btn ${pathname === path ? "active" : ""}`}
            style={{ textDecoration: "none" }}
            onClick={closeAll}
          >
            <span className="nav-btn-icon"><Icon size={21} /></span>
            <span className="nav-btn-label">{label}</span>
            <div className="nav-dot" />
          </Link>
        ))}

        {/* FAB central */}
        <div style={{
          position: "relative", display: "flex",
          alignItems: "center", justifyContent: "center", flex: 1,
        }}>
          {fabOpen && (
            <div style={{
              position: "absolute", bottom: 68, left: "50%",
              transform: "translateX(-50%)",
              display: "flex", flexDirection: "column",
              gap: 9, alignItems: "center", zIndex: 55,
            }}>
              {QUICK_ACTIONS.map((action, i) => {
                const ActionIcon = action.icon;
                return (
                  <button
                    key={action.path}
                    onClick={() => handleQuickAction(action.path)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "var(--bg2)", border: "1px solid var(--border)",
                      borderRadius: 40, padding: "9px 18px 9px 10px",
                      cursor: "pointer", color: "var(--text)",
                      fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
                      animation: `fabItemIn 0.18s ease ${i * 0.04}s both`,
                    }}
                  >
                    <span style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: action.color + "22",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <ActionIcon size={16} color={action.color} />
                    </span>
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => { setMoreOpen(false); setNotifOpen(false); setFabOpen(!fabOpen); }}
            style={{
              width: 54, height: 54, borderRadius: 17,
              background: "var(--grad-primary)", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: fabOpen
                ? "0 6px 28px rgba(108,59,255,0.7)"
                : "0 4px 20px rgba(108,59,255,0.5)",
              transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s",
              transform: fabOpen ? "rotate(45deg) scale(1.06)" : "scale(1)",
              position: "relative", zIndex: 51, marginBottom: 4,
              touchAction: "manipulation",
            }}
          >
            <Plus size={24} color="#fff" />
          </button>
        </div>

        {/* Itens direita */}
        {BOTTOM_MAIN.slice(2, 4).map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={`nav-btn ${pathname === path ? "active" : ""}`}
            style={{ textDecoration: "none" }}
            onClick={closeAll}
          >
            <span className="nav-btn-icon"><Icon size={21} /></span>
            <span className="nav-btn-label">{label}</span>
            <div className="nav-dot" />
          </Link>
        ))}

        {/* Botão Mais */}
        <button
          className={`nav-btn ${moreOpen ? "active" : ""}`}
          onClick={() => { setFabOpen(false); setNotifOpen(false); setMoreOpen(!moreOpen); }}
          style={{ background: "none", border: "none", cursor: "pointer", touchAction: "manipulation" }}
        >
          <span className="nav-btn-icon">
            {moreOpen
              ? <X size={21} color="var(--primary-light)" />
              : <Grid3X3 size={21} color="var(--text3)" />}
          </span>
          <span className="nav-btn-label" style={{ color: moreOpen ? "var(--primary-light)" : undefined }}>Mais</span>
          <div className="nav-dot" />
        </button>
      </nav>

      {/* ═══════════════════════════════════════════
          DRAWER "MAIS" — páginas extras mobile
      ═══════════════════════════════════════════ */}
      {moreOpen && (
        <div style={{
          position: "fixed",
          bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
          left: 0, right: 0,
          background: "rgba(22,16,43,0.97)",
          borderTop: "1px solid var(--border)",
          borderRadius: "22px 22px 0 0",
          padding: "16px 20px 22px",
          zIndex: 52,
          boxShadow: "0 -8px 48px rgba(0,0,0,0.5)",
          animation: "drawerSlideUp 0.22s cubic-bezier(0.4,0,0.2,1) both",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}>
          {/* Handle */}
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--border2)", margin: "0 auto 16px" }} />

          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.1em", marginBottom: 14 }}>
            MAIS OPÇÕES
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[...NAV, { path: "/configuracoes", icon: Settings, label: "Config." }].map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMoreOpen(false)}
                style={{
                  display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 7,
                  padding: "16px 8px",
                  background: pathname === path ? "rgba(108,59,255,0.15)" : "var(--bg3)",
                  border: pathname === path ? "1px solid rgba(108,59,255,0.3)" : "1px solid var(--border)",
                  borderRadius: 16, textDecoration: "none",
                  transition: "background 0.15s",
                }}
              >
                <Icon size={22} color={pathname === path ? "var(--primary-light)" : "var(--text2)"} />
                <span style={{
                  fontSize: 11, fontWeight: 600, textAlign: "center",
                  color: pathname === path ? "var(--primary-light)" : "var(--text2)",
                }}>
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
