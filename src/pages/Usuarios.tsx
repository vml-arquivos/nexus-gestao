import { useState, useEffect, useCallback } from 'react'
import {
  UserPlus, Loader, Mail, Shield, ShieldOff,
  Trash2, Eye, EyeOff, X, Check, Crown, User
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { apiJson } from '../lib/api'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface UsuarioPerfil {
  id: string
  nome: string
  email: string
  role: 'gestor' | 'sub_gestor' | 'membro'
  ativo: boolean
  cargo?: string
  avatar_url?: string
  criado_por_nome?: string
  created_at: string
  tarefas_pendentes?: number
  tarefas_concluidas?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);pointer-events:none;`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function Av({ nome, size = 38 }: { nome: string; size?: number }) {
  const i = nome.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: 'linear-gradient(135deg,#6C3BFF,#06B6D4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: '#fff',
      fontFamily: 'var(--font-heading)', flexShrink: 0,
    }}>{i}</div>
  )
}

// ── Modal: convidar novo usuário ──────────────────────────────────────────────
function ModalConvidar({ onSave, onClose }: {
  onSave: (u: UsuarioPerfil) => void
  onClose: () => void
}) {
  const [nome, setNome]       = useState('')
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!nome.trim() || !email.trim() || !senha.trim()) {
      toast('Preencha todos os campos', 'error'); return
    }
    if (senha.length < 6) {
      toast('Senha deve ter pelo menos 6 caracteres', 'error'); return
    }
    setLoading(true)
    try {
      const data = await apiJson<{ usuario: UsuarioPerfil }>('/auth/invite', {
        method: 'POST',
        body: JSON.stringify({ nome: nome.trim(), email: email.trim().toLowerCase(), senha }),
      })
      onSave(data.usuario)
      toast(`✅ ${data.usuario.nome} adicionado com sucesso!`)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao criar usuário', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', width: '100%', maxWidth: 480, animation: 'slideUp 0.22s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>
              <UserPlus size={16} style={{ display: 'inline', marginRight: 8, color: 'var(--primary-light)' }} />
              Novo Usuário
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
              O usuário terá acesso ao sistema com papel de membro
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Nome completo *</label>
            <input className="form-input" placeholder="Ex: João Silva" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">E-mail *</label>
            <input className="form-input" type="email" placeholder="joao@empresa.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Senha de acesso *</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showSenha ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowSenha(!showSenha)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}
              >
                {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ padding: '10px 12px', background: 'rgba(108,59,255,0.08)', borderRadius: 8, borderLeft: '3px solid var(--primary-light)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            💡 O usuário poderá acessar o sistema com este e-mail e senha. Compartilhe as credenciais com ele com segurança.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2, gap: 8 }}>
            {loading
              ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Criando…</>
              : <><UserPlus size={15} /> Criar Usuário</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Usuarios() {
  const { user: eu } = useAuth()
  const isGestor = eu?.role === 'gestor'

  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([])
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Rota correta: /api/equipe/membros
      const data = await apiJson<{ membros: UsuarioPerfil[] }>('/equipe/membros')
      setUsuarios(data.membros)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao listar usuários.', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRemover(id: string, nome: string) {
    if (!confirm(`Remover o acesso de ${nome}? Esta ação não pode ser desfeita.`)) return
    try {
      await apiJson(`/auth/users/${id}`, { method: 'DELETE' })
      setUsuarios(p => p.filter(u => u.id !== id))
      toast(`${nome} removido do sistema.`)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao remover usuário', 'error')
    }
  }

  function handleCriado(novo: UsuarioPerfil) {
    setUsuarios(p => [...p, novo])
    setModalOpen(false)
  }

  const gestores = usuarios.filter(u => u.role === 'gestor' || u.role === 'sub_gestor')
  const membros  = usuarios.filter(u => u.role === 'membro')

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>👥 Usuários</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Gerencie acessos e permissões da equipe</p>
        </div>
        {isGestor && (
          <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ gap: 6 }}>
            <UserPlus size={16} /> Novo Usuário
          </button>
        )}
      </div>

      {/* Stats rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(108,59,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={18} color="var(--primary-light)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{gestores.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Gestor{gestores.length !== 1 ? 'es' : ''}</div>
          </div>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,182,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={18} color="var(--secondary)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{membros.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Membro{membros.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}>
          <Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Gestores */}
          {gestores.map(u => (
            <div key={u.id} style={{
              background: 'var(--bg2)', border: '1px solid rgba(108,59,255,0.25)',
              borderRadius: 'var(--radius)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <Av nome={u.nome} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{u.nome}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-light)', background: 'rgba(108,59,255,0.15)', padding: '2px 8px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Crown size={9} /> {u.role === 'gestor' ? 'GESTOR' : 'SUB-GESTOR'}
                  </span>
                  {u.id === eu?.id && (
                    <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600 }}>você</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 12, color: 'var(--text3)' }}>
                  <Mail size={11} /> {u.email}
                </div>
              </div>
            </div>
          ))}

          {/* Membros */}
          {membros.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>Membros da equipe</div>
              {membros.map(u => (
                <div key={u.id} style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
                }}>
                  <Av nome={u.nome} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{u.nome}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--secondary)', background: 'rgba(6,182,212,0.12)', padding: '2px 8px', borderRadius: 99 }}>
                        MEMBRO
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 12, color: 'var(--text3)' }}>
                      <Mail size={11} /> {u.email}
                    </div>
                    {(u.tarefas_pendentes !== undefined) && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 11 }}>
                        <span style={{ color: '#F59E0B' }}>⏳ {u.tarefas_pendentes} pendente{u.tarefas_pendentes !== 1 ? 's' : ''}</span>
                        <span style={{ color: '#10B981' }}>✅ {u.tarefas_concluidas} concluída{u.tarefas_concluidas !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>

                  {/* Ações — apenas para gestores e não para si mesmo */}
                  {isGestor && u.id !== eu?.id && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleRemover(u.id, u.nome)}
                        className="btn btn-danger btn-sm btn-icon"
                        title="Remover usuário"
                        style={{ width: 32, height: 32 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Vazio */}
          {usuarios.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <UserPlus size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum usuário encontrado</div>
              {isGestor && (
                <div style={{ fontSize: 13 }}>
                  Adicione membros à sua equipe clicando em{' '}
                  <button
                    onClick={() => setModalOpen(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Novo Usuário
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <ModalConvidar onSave={handleCriado} onClose={() => setModalOpen(false)} />
      )}

      {/* Rota de remoção no backend: precisa existir */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  )
}
