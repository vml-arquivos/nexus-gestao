import { useEffect, useState } from 'react'
import { Plus, Users, X, Trash2, Edit2, UserPlus } from 'lucide-react'
import { equipeApi, teamsApi, type Equipe, type MembroEquipe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { isGestorLike, isGestorOwner, roleLabel } from '../lib/roles'
import { useVisualTexts } from '../hooks/useVisualTexts'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function TeamModal({ team, onClose, onSaved }: { team?: Equipe | null; onClose: () => void; onSaved: (t: Equipe) => void }) {
  const [nome, setNome] = useState(team?.nome || '')
  const [descricao, setDescricao] = useState(team?.descricao || '')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!nome.trim()) { toast('Nome é obrigatório.', 'error'); return }
    setSaving(true)
    try {
      const saved = team ? await teamsApi.update(team.id, { nome, descricao }) : await teamsApi.create({ nome, descricao })
      onSaved(saved); onClose(); toast(team ? 'Equipe atualizada.' : 'Equipe criada.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao salvar equipe.', 'error') }
    finally { setSaving(false) }
  }
  return <div className="modal-backdrop" onClick={e=>e.currentTarget===e.target && onClose()}><div className="modal-card" style={{ width:'min(100%,520px)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:16 }}><h2 style={{ fontFamily:'var(--font-heading)' }}>{team ? 'Editar equipe' : 'Nova equipe'}</h2><button className="btn btn-ghost" onClick={onClose}><X size={16}/></button></div>
    <label className="form-group"><span className="form-label">Nome</span><input className="form-input" value={nome} onChange={e=>setNome(e.target.value)} /></label>
    <label className="form-group"><span className="form-label">Descrição</span><textarea className="form-input" rows={3} value={descricao} onChange={e=>setDescricao(e.target.value)} /></label>
    <div style={{ display:'flex', gap:10, marginTop:16 }}><button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex:2 }}>{saving ? 'Salvando...' : 'Salvar'}</button></div>
  </div></div>
}

function MembersModal({ equipe, onClose }: { equipe: Equipe; onClose: () => void }) {
  const [membros, setMembros] = useState<MembroEquipe[]>([])
  const [todos, setTodos] = useState<MembroEquipe[]>([])
  const [selected, setSelected] = useState<string>('')
  const [roleNaEquipe, setRoleNaEquipe] = useState<'membro' | 'sub_gestor' | 'gestor'>('membro')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [ms, disponiveis] = await Promise.all([teamsApi.members(equipe.id), equipeApi.membros()])
      setMembros(ms)
      setTodos(disponiveis.filter(m => m.ativo !== false))
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao carregar membros.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(()=>{ load() }, [equipe.id])

  async function add() {
    if (!selected) return
    try {
      await teamsApi.addMembers(equipe.id, [{ user_id: selected, role_na_equipe: roleNaEquipe }])
      setSelected('')
      setRoleNaEquipe('membro')
      await load()
      toast('Membro adicionado.')
    }
    catch(e){ toast(e instanceof Error ? e.message : 'Erro ao adicionar.', 'error') }
  }
  async function remove(userId: string) {
    try { await teamsApi.removeMember(equipe.id, userId); await load(); toast('Membro removido.') }
    catch(e){ toast(e instanceof Error ? e.message : 'Erro ao remover.', 'error') }
  }

  return <div className="modal-backdrop" onClick={e=>e.currentTarget===e.target && onClose()}><div className="modal-card" style={{ width:'min(100%,680px)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:16 }}><div><h2 style={{ fontFamily:'var(--font-heading)' }}>{equipe.nome}</h2><p style={{ color:'var(--text3)', fontSize:13 }}>Membros da equipe</p></div><button className="btn btn-ghost" onClick={onClose}><X size={16}/></button></div>
    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(170px,220px) auto', gap:8, marginBottom:16, alignItems:'end' }}>
      <label className="form-group" style={{ margin:0 }}>
        <span className="form-label">Membro existente</span>
        <select className="form-input" value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="">Selecionar membro existente</option>
          {todos.map(m=><option key={m.id} value={m.id}>{m.nome} — {m.email} · {roleLabel(m.role)}</option>)}
        </select>
      </label>
      <label className="form-group" style={{ margin:0 }}>
        <span className="form-label">Cargo na equipe</span>
        <select className="form-input" value={roleNaEquipe} onChange={e=>setRoleNaEquipe(e.target.value as 'membro' | 'sub_gestor' | 'gestor')}>
          <option value="membro">Membro executor</option>
          <option value="sub_gestor">Líder / Subgestor</option>
          <option value="gestor">Gestor da equipe</option>
        </select>
      </label>
      <button className="btn btn-primary" onClick={add} disabled={!selected}><UserPlus size={16}/> Adicionar</button>
    </div>
    {loading ? <div>Carregando...</div> : <div style={{ display:'grid', gap:10 }}>{membros.map(m=><div key={m.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:12, border:'1px solid var(--border)', borderRadius:12, background:'var(--bg3)' }}><div><b>{m.nome}</b><div style={{ fontSize:12, color:'var(--text3)' }}>{m.email} · {m.role_na_equipe || roleLabel(m.role)}</div></div><button className="btn btn-ghost" onClick={()=>remove(m.id)}><Trash2 size={15}/></button></div>)}{membros.length===0 && <div style={{ color:'var(--text3)' }}>Nenhum membro nesta equipe.</div>}</div>}
  </div></div>
}

export default function Equipes() {
  const { t } = useVisualTexts()
  const { user } = useAuth()
  const [teams, setTeams] = useState<Equipe[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Equipe | null | undefined>(undefined)
  const [membersTeam, setMembersTeam] = useState<Equipe | null>(null)
  const canManageTeams = isGestorLike(user?.role)

  async function loadTeams() { setLoading(true); try { setTeams(await teamsApi.list()) } catch(e){ toast(e instanceof Error ? e.message : 'Erro ao carregar equipes.', 'error') } finally { setLoading(false) } }
  useEffect(()=>{ if (canManageTeams) loadTeams() }, [canManageTeams])
  if (!canManageTeams) return <div className="page-container"><h1>Acesso restrito</h1><p>Somente perfis de gestão gerenciam equipes.</p></div>

  return <div className="page-container" style={{ maxWidth:920 }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:22 }}><div><h1 style={{ fontFamily:'var(--font-heading)', fontWeight:900 }}>{t('teams.pageTitle')}</h1><p style={{ color:'var(--text3)' }}>{t('teams.pageSubtitle')}</p></div><button className="btn btn-primary" onClick={()=>setModal(null)}><Plus size={16}/> Nova equipe</button></div>
    {loading ? <div>Carregando...</div> : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:14 }}>{teams.map(t=><div key={t.id} style={{ padding:16, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:18 }}><div style={{ display:'flex', gap:12, alignItems:'center' }}><div style={{ width:40, height:40, borderRadius:12, background:'var(--grad-primary)', display:'grid', placeItems:'center' }}><Users size={20} color="#fff"/></div><div style={{ minWidth:0 }}><b>{t.nome}</b><div style={{ color:'var(--text3)', fontSize:13 }}>{t.members_count || 0} membro(s)</div></div></div>{t.descricao && <p style={{ color:'var(--text3)', fontSize:13 }}>{t.descricao}</p>}<div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}><button className="btn btn-secondary" onClick={()=>setMembersTeam(t)}><Users size={15}/> Membros</button><button className="btn btn-ghost" onClick={()=>setModal(t)}><Edit2 size={15}/> Editar</button></div></div>)}{teams.length===0 && <div style={{ color:'var(--text3)' }}>Nenhuma equipe cadastrada.</div>}</div>}
    {modal !== undefined && <TeamModal team={modal} onClose={()=>setModal(undefined)} onSaved={(saved)=>{ setTeams(ts=> modal ? ts.map(t=>t.id===saved.id?saved:t) : [...ts,saved]) }} />}
    {membersTeam && <MembersModal equipe={membersTeam} onClose={()=>{ setMembersTeam(null); loadTeams() }} />}
  </div>
}
