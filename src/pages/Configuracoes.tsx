import { useState } from 'react'
import { Settings, Save, Bell, Palette, User, Shield, Info, LogOut } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { api } from '../lib/api'
import { useTheme } from '../lib/ThemeContext'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

export default function Configuracoes() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()

  const [nome, setNome]           = useState(user?.nome || '')
  const [email, setEmail]         = useState(user?.email || '')
  const [senhaAtual, setSenhaAtual]   = useState('')
  const [novaSenha, setNovaSenha]     = useState('')
  const [confirmSenha, setConfirmSenha] = useState('')
  const [savingPerfil, setSavingPerfil]   = useState(false)
  const [savingSenha, setSavingSenha]     = useState(false)
  const [notifEnabled, setNotifEnabled]   = useState(Notification.permission === 'granted')

  function aplicarTema(t: 'dark' | 'light') {
    setTheme(t)
  }

  async function salvarPerfil() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSavingPerfil(true)
    try {
      await api.patch('/auth/me', { nome: nome.trim() })
      toast('Perfil atualizado!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar', 'error')
    } finally { setSavingPerfil(false) }
  }

  async function alterarSenha() {
    if (!senhaAtual || !novaSenha) { toast('Preencha todos os campos', 'error'); return }
    if (novaSenha.length < 6) { toast('Nova senha deve ter ao menos 6 caracteres', 'error'); return }
    if (novaSenha !== confirmSenha) { toast('As senhas não coincidem', 'error'); return }
    setSavingSenha(true)
    try {
      await api.patch('/auth/me/password', { senhaAtual, novaSenha })
      setSenhaAtual(''); setNovaSenha(''); setConfirmSenha('')
      toast('Senha alterada com sucesso!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao alterar senha', 'error')
    } finally { setSavingSenha(false) }
  }

  async function ativarNotificacoes() {
    if (!('Notification' in window)) { toast('Notificações não suportadas neste dispositivo', 'error'); return }
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setNotifEnabled(true)
      toast('Notificações ativadas!')
    } else {
      toast('Permissão negada. Ative nas configurações do navegador.', 'error')
    }
  }

  const roleLabel = user?.role === 'gestor' ? '👑 Gestor' : user?.role === 'sub_gestor' ? '👑 Sub‑gestor' : '👤 Membro'
  const roleColor = user?.role === 'gestor' ? '#6C3BFF' : user?.role === 'sub_gestor' ? '#8B5CF6' : '#06B6D4'

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 580, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>⚙️ Configurações</h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Gerencie seu perfil e preferências</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Perfil */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <User size={16} color="#6C3BFF" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Meu Perfil</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: roleColor, background: roleColor + '18', padding: '3px 8px', borderRadius: 99 }}>{roleLabel}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" value={email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>O e-mail não pode ser alterado</span>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={salvarPerfil} disabled={savingPerfil}>
            <Save size={14} /> {savingPerfil ? 'Salvando…' : 'Salvar Perfil'}
          </button>
        </div>

        {/* Segurança */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Shield size={16} color="#F59E0B" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Segurança</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Senha atual</label>
              <input className="form-input" type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="form-group">
              <label className="form-label">Nova senha</label>
              <input className="form-input" type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar nova senha</label>
              <input className="form-input" type="password" value={confirmSenha} onChange={e => setConfirmSenha(e.target.value)} placeholder="Repita a nova senha" />
            </div>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 16 }} onClick={alterarSenha} disabled={savingSenha}>
            <Shield size={14} /> {savingSenha ? 'Alterando…' : 'Alterar Senha'}
          </button>
        </div>

        {/* Aparência */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Palette size={16} color="#EC4899" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Aparência</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([['dark', '🌙 Escuro'], ['light', '☀️ Claro']] as const).map(([k, l]) => (
              <button key={k} onClick={() => aplicarTema(k)} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${theme === k ? '#6C3BFF' : 'var(--border)'}`, background: theme === k ? 'rgba(108,59,255,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: theme === k ? '#6C3BFF' : 'var(--text3)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Notificações */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Bell size={16} color="#F59E0B" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Notificações Push</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
            Receba alertas para tarefas com prazo próximo, compromissos do dia e pagamentos vencidos.
          </p>
          <div style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
            Status: {notifEnabled
              ? <span style={{ color: '#10B981' }}>✅ Ativadas</span>
              : <span style={{ color: 'var(--text3)' }}>⭕ Não ativadas</span>
            }
          </div>
          {!notifEnabled && (
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={ativarNotificacoes}>
              <Bell size={14} /> Ativar Notificações
            </button>
          )}
        </div>

        {/* Sobre */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Info size={16} color="var(--text3)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Sobre o Nexus</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['Versão', '3.0.0'], ['Plataforma', 'PWA'], ['Backend', 'PostgreSQL 17'], ['Deploy', 'Coolify / VPS']].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sair */}
        <button className="btn btn-danger" style={{ width: '100%', gap: 8 }} onClick={logout}>
          <LogOut size={16} /> Sair da Conta
        </button>

        <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text3)', fontSize: 11 }}>
          nexus.permupay.com.br · {new Date().getFullYear()}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
