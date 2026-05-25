import { useEffect, useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { usersApi, type UserProfile } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

// Toast simples reutilizado em várias páginas. Exibe mensagem temporária na parte inferior.
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ── Modal para criação de usuário ────────────────────────────────────────────
function CreateUserModal({ onCreated, onClose }: {
  onCreated: (user: UserProfile) => void
  onClose: () => void
}) {
  const [nome, setNome]   = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole]   = useState<'sub_gestor' | 'membro'>('membro')
  const [senha, setSenha] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!nome.trim() || !email.trim()) {
      toast('Nome e e-mail são obrigatórios', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await usersApi.create({ nome: nome.trim(), email: email.trim(), role, senha: senha || undefined })
      onCreated(result.user)
      toast('Usuário criado!')
      if (!senha && result.senha) {
        toast(`Senha provisória: ${result.senha}`, 'success')
      }
      onClose()
    } catch (e: any) {
      toast(e instanceof Error ? e.message : 'Erro ao criar usuário', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 32px', width: '100%', maxWidth: 540, maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Novo Usuário</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <input className="form-input" placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">E‑mail *</label>
            <input className="form-input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Papel *</label>
            <select className="form-input" value={role} onChange={e => setRole(e.target.value as 'sub_gestor' | 'membro') }>
              <option value="membro">Membro</option>
              <option value="sub_gestor">Sub‑gestor</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Senha provisória</label>
            <input className="form-input" type="text" placeholder="(opcional)" value={senha} onChange={e => setSenha(e.target.value)} />
            <small style={{ fontSize: 11, color: 'var(--text3)' }}>Se não definida, será gerada automaticamente</small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'Criando...' : (<><Check size={14} /> Criar</>)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal de Usuários ─────────────────────────────────────────────
export default function Usuarios() {
  const { user } = useAuth()
  const isAllowed = user?.role === 'gestor' || user?.role === 'sub_gestor'
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  async function loadUsers() {
    setLoading(true)
    try {
      const list = await usersApi.list()
      setUsers(list)
    } catch (e: any) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar usuários', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  function handleCreated(newUser: UserProfile) {
    setUsers(prev => [...prev, newUser])
  }

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Usuários</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Gerencie acessos e permissões</p>
        </div>
        {isAllowed && (
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Novo usuário
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg2)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.nome}</span>
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>{u.email}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
                {u.role === 'gestor' ? 'Gestor' : u.role === 'sub_gestor' ? 'Sub‑gestor' : 'Membro'}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhum usuário encontrado</div>
          )}
        </div>
      )}
      {createOpen && isAllowed && (
        <CreateUserModal onCreated={handleCreated} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  )
}