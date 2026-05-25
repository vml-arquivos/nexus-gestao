import { useState, useEffect } from 'react'
import { Plus, Users, X, Check, Loader } from 'lucide-react'
import { teamsApi, equipeApi, type Equipe, type MembroEquipe, type MembroEquipeDetalhe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

// Página de gerenciamento de equipes (times)
// Permite a um gestor criar novas equipes, visualizar todas as equipes da organização
// e adicionar membros existentes a uma equipe. Membros comuns podem apenas
// visualizar as equipes às quais pertencem.

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

interface CreateModalProps {
  open: boolean
  onClose: () => void
  onCreate: (nome: string, descricao?: string | null) => void
}

function CreateTeamModal({ open, onClose, onCreate }: CreateModalProps) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSaving(true)
    await onCreate(nome.trim(), descricao.trim() || null)
    setSaving(false)
    setNome(''); setDescricao('')
  }
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems: 'center', justifyContent:'center', backdropFilter:'blur(4px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--bg2)', borderRadius: '20px', padding:'24px 20px 32px', width:'100%', maxWidth:540, maxHeight:'92dvh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontFamily:'var(--font-heading)', fontWeight:800, fontSize:18 }}>Nova Equipe</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da equipe" /></div>
          <div className="form-group"><label className="form-label">Descrição</label><textarea className="form-input" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} style={{ resize:'vertical' }} placeholder="Objetivo ou área da equipe (opcional)" /></div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} style={{ flex:2 }} disabled={saving}>
            {saving ? 'Criando…' : (<><Check size={14} /> Criar</>)}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AddMembersModalProps {
  open: boolean
  onClose: () => void
  team: Equipe
  onAdded: () => void
}

function AddMembersModal({ open, onClose, team, onAdded }: AddMembersModalProps) {
  const [members, setMembers] = useState<MembroEquipe[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    async function load() {
      try {
        setLoading(true)
        const mems = await equipeApi.membros()
        setMembers(mems)
      } catch (e) {
        toast('Erro ao buscar membros', 'error')
      } finally { setLoading(false) }
    }
    load()
    // reset selection when reopened
    setSelected(new Set())
  }, [open])

  async function handleAdd() {
    if (!selected.size) { toast('Selecione pelo menos um membro', 'error'); return }
    setSaving(true)
    try {
      await teamsApi.addMembers(team.id, Array.from(selected))
      toast('Membros adicionados!')
      onAdded()
      onClose()
    } catch (e) { toast('Erro ao adicionar membros', 'error') }
    finally { setSaving(false) }
  }
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems: 'center', justifyContent:'center', backdropFilter:'blur(4px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--bg2)', borderRadius: '20px', padding:'24px 20px 32px', width:'100%', maxWidth:540, maxHeight:'92dvh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontFamily:'var(--font-heading)', fontWeight:800, fontSize:18 }}>Adicionar membros</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer' }}><X size={20} /></button>
        </div>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:'var(--text3)' }}><Loader size={22} style={{ animation:'spin 1s linear infinite', marginRight:10 }} /> Carregando…</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'50vh', overflowY:'auto' }}>
            {members.map(m => (
              <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg3)', padding:'8px 12px', borderRadius:8, cursor:'pointer' }}>
                <input type="checkbox" checked={selected.has(m.id)} onChange={e => {
                  const newSet = new Set(selected)
                  if (e.target.checked) newSet.add(m.id); else newSet.delete(m.id)
                  setSelected(newSet)
                }} />
                <span>{m.nome} <span style={{ fontSize:11, color:'var(--text3)' }}>({m.email})</span></span>
              </label>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleAdd} style={{ flex:2 }} disabled={saving}>
            {saving ? 'Adicionando…' : (<><Check size={14} /> Adicionar</>)}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Equipes() {
  const { user } = useAuth()
  const isGestor = user?.role === 'gestor'
  const [teams, setTeams] = useState<Equipe[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Equipe | null>(null)

  async function load() {
    setLoading(true)
    try {
      const t = await teamsApi.list()
      setTeams(t)
    } catch (e) { toast('Erro ao carregar equipes', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(nome: string, descricao?: string | null) {
    try {
      const newTeam = await teamsApi.create({ nome, descricao })
      setTeams(prev => [...prev, { ...newTeam, total_membros: 0 }])
      toast('Equipe criada!')
      setCreateOpen(false)
    } catch (e) { toast('Erro ao criar equipe', 'error') }
  }

  function openAddMembers(team: Equipe) {
    setSelectedTeam(team)
    setAddOpen(true)
  }

  async function onMembersAdded() {
    // reload count of members for selectedTeam
    if (!selectedTeam) return
    try {
      const members = await teamsApi.members(selectedTeam.id)
      setTeams(prev => prev.map(t => t.id === selectedTeam.id ? { ...t, total_membros: members.length } : t))
    } catch (e) { /* ignore */ }
  }

  return (
    <div style={{ padding: 20, maxWidth: 720, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-heading)', fontWeight:900, fontSize:22 }}>Equipes</h1>
          <p style={{ color:'var(--text3)', fontSize:13, marginTop:2 }}>Gerencie grupos de trabalho</p>
        </div>
        {isGestor && (
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)} style={{ gap:6 }}><Plus size={16} /> Nova Equipe</button>
        )}
      </div>
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:'var(--text3)' }}><Loader size={22} style={{ animation:'spin 1s linear infinite', marginRight:10 }} /> Carregando…</div>
      ) : teams.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>
          <p>Nenhuma equipe encontrada.</p>
          {isGestor && <p>Clique em "Nova Equipe" para criar a primeira.</p>}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {teams.map(team => (
            <div key={team.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg2)', padding:'14px 16px', border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
              <div>
                <div style={{ fontFamily:'var(--font-heading)', fontWeight:700, fontSize:16 }}>{team.nome}</div>
                {team.descricao && <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{team.descricao}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:12, color:'var(--text3)' }}>{team.total_membros ?? 0} membro{(team.total_membros ?? 0) === 1 ? '' : 's'}</span>
                {isGestor && (
                  <button className="btn btn-secondary" style={{ gap:6 }} onClick={() => openAddMembers(team)}><Users size={14} /> Adicionar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <CreateTeamModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      {selectedTeam && <AddMembersModal open={addOpen} onClose={() => setAddOpen(false)} team={selectedTeam} onAdded={onMembersAdded} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}