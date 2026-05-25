import { useState, useEffect } from 'react'
import { Plus, X, Users, Check } from 'lucide-react'
import { teamsApi, equipeApi, type Equipe, type MembroEquipe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { MicBtn } from '../components/ui'

// Util simples para exibir toasts. Centraliza brevemente mensagens de
// feedback na parte inferior da tela. Aceita tipos 'success' ou 'error'.
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ── Modal de criação de equipe ─────────────────────────────────────────────
function CreateTeamModal({ onSave, onClose }: {
  onSave: (equipe: Equipe) => void
  onClose: () => void
}) {
  const [nome, setNome]       = useState('')
  const [descricao, setDesc]  = useState('')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSaving(true)
    try {
      const equipe = await teamsApi.create({ nome: nome.trim(), descricao: descricao || undefined })
      onSave(equipe)
      toast('Equipe criada!')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar equipe', 'error')
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Nova Equipe</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <div className="mic-row"><input className="form-input" placeholder="Nome da equipe" value={nome} onChange={e => setNome(e.target.value)} /><MicBtn onResult={t => setNome(prev => (prev + ' ' + t).trim())} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <div className="mic-row"><textarea className="form-input" rows={2} placeholder="Opcional" value={descricao} onChange={e => setDesc(e.target.value)} style={{ resize: 'vertical' }} /><MicBtn onResult={t => setDesc(prev => (prev + ' ' + t).trim())} /></div>
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

// ── Modal para adicionar membros à equipe ──────────────────────────────────
function AddMembersModal({ equipe, onAdded, onClose }: {
  equipe: Equipe
  onAdded: () => void
  onClose: () => void
}) {
  const [members, setMembers] = useState<MembroEquipe[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const ms = await equipeApi.membros()
        setMembers(ms)
      } catch (e) {
        toast('Erro ao carregar membros', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  async function handleAdd() {
    if (selected.length === 0) { toast('Selecione ao menos um membro', 'error'); return }
    setSaving(true)
    try {
      await teamsApi.addMembers(equipe.id, selected)
      toast('Membros adicionados!')
      onAdded()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao adicionar membros', 'error')
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Adicionar membros</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Carregando...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(m => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: selected.includes(m.id) ? 'var(--bg3)' : 'transparent', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
                <span style={{ flex: 1 }}>{m.nome}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{m.role === 'gestor' ? 'Gestor' : 'Membro'}</span>
              </label>
            ))}
            {members.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhum membro disponível</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || selected.length === 0} style={{ flex: 2 }}>
            {saving ? 'Adicionando...' : (<><Check size={14} /> Adicionar</>)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal de Equipes ────────────────────────────────────────────
export default function Equipes() {
  const { user } = useAuth()
  const isGestor = user?.role === 'gestor'
  const [teams, setTeams]     = useState<Equipe[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [addOpen, setAddOpen]       = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Equipe | null>(null)

  async function loadTeams() {
    setLoading(true)
    try {
      const ts = await teamsApi.list()
      setTeams(ts)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar equipes', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTeams() }, [])

  function handleCreated(equipe: Equipe) {
    setTeams(t => [...t, { ...equipe, members_count: 0 }])
  }

  function openAddMembers(team: Equipe) {
    setSelectedTeam(team)
    setAddOpen(true)
  }

  async function onMembersAdded() {
    // Após adicionar membros, recarrega o contador de membros
    await loadTeams()
  }

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Equipes</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Gerencie grupos de trabalho</p>
        </div>
        {isGestor && (
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Nova equipe
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}>Carregando...</div>
      ) : teams.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 14, padding: 40, textAlign: 'center' }}>
          Nenhuma equipe cadastrada.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {teams.map(team => (
            <div key={team.id} style={{ padding: 16, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(108,59,255,0.3)' }}>
                  <Users size={18} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{team.nome}</div>
                  {team.descricao && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.descricao}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--text3)', minWidth: 60, textAlign: 'right' }}>{team.members_count || 0} membro{(team.members_count || 0) !== 1 ? 's' : ''}</div>
                {isGestor && (
                  <button className="btn btn-secondary" onClick={() => openAddMembers(team)} style={{ padding: '6px 10px', fontSize: 12 }}>
                    Adicionar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && <CreateTeamModal onSave={handleCreated} onClose={() => setCreateOpen(false)} />}
      {addOpen && selectedTeam && <AddMembersModal equipe={selectedTeam} onAdded={onMembersAdded} onClose={() => setAddOpen(false)} />}
    </div>
  )
}