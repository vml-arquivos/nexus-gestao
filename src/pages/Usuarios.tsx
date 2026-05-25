import { useEffect, useState } from 'react'
import { Plus, X, Check, Loader, Mail, Crown, UserRound, Shield } from 'lucide-react'
import { usersApi, type UserProfile } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function roleLabel(role: UserProfile['role']) {
  if (role === 'gestor') return 'Gestor'
  if (role === 'sub_gestor') return 'Sub-gestor'
  return 'Membro'
}

function UsuarioAvatar({ nome, role }: { nome: string; role: UserProfile['role'] }) {
  const initials = nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: 42, height: 42, borderRadius: 14, background: role === 'gestor' ? 'linear-gradient(135deg,#6C3BFF,#9B59B6)' : role === 'sub_gestor' ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'linear-gradient(135deg,#06B6D4,#0EA5E9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>
      {initials || 'U'}
    </div>
  )
}

function ModalUsuario({ onClose, onCreated, currentRole }: { onClose: () => void; onCreated: (user: UserProfile) => void; currentRole: UserProfile['role'] }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState<'sub_gestor' | 'membro'>('membro')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!nome.trim() || !email.trim()) {
      toast('Nome e e-mail são obrigatórios.', 'error')
      return
    }
    if (senha && senha.length < 6) {
      toast('A senha deve ter pelo menos 6 caracteres.', 'error')
      return
    }
    setLoading(true)
    try {
      const result = await usersApi.create({ nome: nome.trim(), email: email.trim().toLowerCase(), role, senha: senha || undefined })
      onCreated(result.user)
      toast(result.senha ? `Usuário criado. Senha provisória: ${result.senha}` : 'Usuário criado.')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar usuário.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 12 }} onClick={e => e.currentTarget === e.target && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)', maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'var(--font-heading)', fontWeight: 800 }}>Novo usuário</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>Crie acesso para um membro da sua equipe.</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" /></div>
          <div className="form-group"><label className="form-label">E-mail *</label><input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@empresa.com" /></div>
          <div className="form-group">
            <label className="form-label">Nível de acesso</label>
            <select className="form-input" value={role} onChange={e => setRole(e.target.value as 'sub_gestor' | 'membro')}>
              <option value="membro">Membro da equipe</option>
              {currentRole === 'gestor' && <option value="sub_gestor">Sub-gestor</option>}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Senha provisória</label><input className="form-input" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Deixe em branco para gerar automaticamente" /></div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(108,59,255,0.08)', color: 'var(--text3)', fontSize: 12, lineHeight: 1.5 }}>O usuário acessa o mesmo sistema. Se for membro de equipe, verá suas tarefas delegadas e poderá criar suas próprias tarefas pessoais.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2, gap: 8 }}>
            {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Criando…</> : <><Check size={14} /> Criar usuário</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Usuarios() {
  const { user } = useAuth()
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const canManage = user?.role === 'gestor' || user?.role === 'sub_gestor'

  async function loadUsers() {
    setLoading(true)
    try {
      const list = await usersApi.list()
      setUsuarios(list)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar usuários.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const gestores = usuarios.filter(u => u.role === 'gestor').length
  const subGestores = usuarios.filter(u => u.role === 'sub_gestor').length
  const membros = usuarios.filter(u => u.role === 'membro').length

  return (
    <div style={{ padding: 20, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Usuários</h1>
          <p style={{ margin: '3px 0 0', color: 'var(--text3)', fontSize: 13 }}>Acessos, permissões e equipe do sistema.</p>
        </div>
        {canManage && <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ gap: 6 }}><Plus size={16} /> Novo usuário</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 18 }}>
        {[['Gestores', gestores, Crown], ['Sub-gestores', subGestores, Shield], ['Membros', membros, UserRound]].map(([label, value, Icon]) => {
          const IconComp = Icon as typeof Crown
          return <div key={String(label)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}><IconComp size={17} color="var(--primary-light)" /><div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{String(value)}</div><div style={{ color: 'var(--text3)', fontSize: 12 }}>{String(label)}</div></div>
        })}
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {usuarios.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px' }}>
              <UsuarioAvatar nome={u.nome} role={u.role} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong style={{ fontSize: 14 }}>{u.nome}</strong><span style={{ fontSize: 11, borderRadius: 999, padding: '2px 8px', background: 'rgba(108,59,255,0.12)', color: 'var(--primary-light)', fontWeight: 700 }}>{roleLabel(u.role)}</span>{u.id === user?.id && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>você</span>}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: 'var(--text3)', fontSize: 12 }}><Mail size={11} /> {u.email}</div>
              </div>
            </div>
          ))}
          {!usuarios.length && <div style={{ padding: 50, textAlign: 'center', color: 'var(--text3)' }}>Nenhum usuário encontrado.</div>}
        </div>
      )}
      {modalOpen && user && <ModalUsuario currentRole={user.role} onClose={() => setModalOpen(false)} onCreated={novo => setUsuarios(prev => [novo, ...prev])} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
