import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Link as LinkIcon, Loader, Power, PowerOff, UserPlus, X } from 'lucide-react'
import { usersApi, type UserProfile } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);pointer-events:none;`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function gerarSenha() {
  return Math.random().toString(36).slice(-6) + 'A1'
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
  toast('Copiado!')
}

function ModalUsuario({ onClose, onCreated }: { onClose: () => void; onCreated: (u: UserProfile) => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'membro' | 'sub_gestor'>('membro')
  const [senha, setSenha] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSenha, setLastSenha] = useState('')
  const [lastLink, setLastLink] = useState('')

  async function criar() {
    if (!nome.trim() || !email.trim()) { toast('Nome e e-mail são obrigatórios.', 'error'); return }
    setSaving(true)
    try {
      const res = await usersApi.create({ nome: nome.trim(), email: email.trim().toLowerCase(), role, senha: senha || undefined })
      onCreated(res.user)
      setLastSenha(res.senha || res.senha_provisoria || '')
      toast('Usuário criado.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar usuário.', 'error')
    } finally { setSaving(false) }
  }

  async function gerarConvite() {
    if (!email.trim()) { toast('Informe o e-mail para gerar convite.', 'error'); return }
    setSaving(true)
    try {
      const res = await usersApi.invite({ nome: nome.trim() || undefined, email: email.trim().toLowerCase(), role })
      setLastLink(res.link)
      toast('Link de convite criado.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao gerar convite.', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="modal-card" style={{ width: 'min(100%, 520px)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:18 }}>
          <div>
            <h2 style={{ fontFamily:'var(--font-heading)', fontSize:20, fontWeight:900 }}>Novo usuário</h2>
            <p style={{ fontSize:13, color:'var(--text3)', marginTop:4 }}>Crie acesso com senha provisória ou gere link de convite.</p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding:8 }}><X size={18}/></button>
        </div>

        <div className="form-grid" style={{ display:'grid', gap:12 }}>
          <label className="form-group"><span className="form-label">Nome</span><input className="form-input" value={nome} onChange={e=>setNome(e.target.value)} /></label>
          <label className="form-group"><span className="form-label">E-mail</span><input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
          <label className="form-group"><span className="form-label">Permissão</span><select className="form-input" value={role} onChange={e=>setRole(e.target.value as any)}><option value="membro">Membro</option><option value="sub_gestor">Subgestor</option></select></label>
          <label className="form-group"><span className="form-label">Senha provisória opcional</span><div style={{ position:'relative' }}><input className="form-input" type={show ? 'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)} style={{ paddingRight:76 }} /><button type="button" onClick={()=>setShow(s=>!s)} style={{ position:'absolute', right:42, top:'50%', transform:'translateY(-50%)', background:'none', border:0, color:'var(--text3)' }}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button><button type="button" onClick={()=>setSenha(gerarSenha())} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:0, color:'var(--primary)' }} title="Gerar senha"><KeyRound size={16}/></button></div></label>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginTop:18 }}>
          <button className="btn btn-primary" onClick={criar} disabled={saving}>{saving ? <Loader size={16} className="spin"/> : <UserPlus size={16}/>} Criar usuário</button>
          <button className="btn btn-secondary" onClick={gerarConvite} disabled={saving}><LinkIcon size={16}/> Criar convite</button>
        </div>

        {lastSenha && <div style={{ marginTop:14, padding:12, background:'var(--bg3)', borderRadius:12 }}><b>Senha provisória:</b> <code>{lastSenha}</code> <button className="btn btn-ghost" onClick={()=>copy(lastSenha)} style={{ marginLeft:8, padding:'4px 8px' }}><Copy size={14}/> Copiar</button></div>}
        {lastLink && <div style={{ marginTop:10, padding:12, background:'var(--bg3)', borderRadius:12, overflowWrap:'anywhere' }}><b>Link de convite:</b> {lastLink}<br/><button className="btn btn-ghost" onClick={()=>copy(lastLink)} style={{ marginTop:8, padding:'4px 8px' }}><Copy size={14}/> Copiar link para WhatsApp</button></div>}
      </div>
    </div>
  )
}

export default function Usuarios() {
  const { user: eu } = useAuth()
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const canManage = ['admin','dev','gestor','sub_gestor'].includes(eu?.role || '')

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsuarios(await usersApi.list()) }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao carregar usuários.', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const grupos = useMemo(() => ({
    gestores: usuarios.filter(u => ['admin','dev','gestor','sub_gestor'].includes(u.role)),
    membros: usuarios.filter(u => u.role === 'membro'),
  }), [usuarios])

  async function resetar(id: string) {
    try {
      const res = await usersApi.resetPassword(id)
      toast('Senha provisória gerada.')
      alert(`Nova senha provisória: ${res.senha || res.senha_provisoria}`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao resetar senha.', 'error') }
  }

  async function alternar(u: UserProfile) {
    try {
      const updated = await usersApi.update(u.id, { ativo: !u.ativo })
      setUsuarios(list => list.map(x => x.id === u.id ? { ...x, ativo: updated.ativo } : x))
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao alterar status.', 'error') }
  }

  function row(u: UserProfile) {
    return <div key={u.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'center', padding:14, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16 }}>
      <div style={{ minWidth:0 }}><div style={{ fontWeight:800 }}>{u.nome}</div><div style={{ color:'var(--text3)', fontSize:13, overflow:'hidden', textOverflow:'ellipsis' }}>{u.email}</div><div style={{ marginTop:6, fontSize:12, color:'var(--text3)' }}>{u.role === 'admin' ? 'Admin' : u.role === 'dev' ? 'Dev' : u.role === 'gestor' ? 'Gestor' : u.role === 'sub_gestor' ? 'Subgestor' : 'Membro'} · {u.ativo === false ? 'Inativo' : 'Ativo'}</div></div>
      {canManage && u.id !== eu?.id && <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}><button className="btn btn-ghost" onClick={()=>resetar(u.id)} style={{ padding:'8px 10px' }}><KeyRound size={15}/></button><button className="btn btn-ghost" onClick={()=>alternar(u)} style={{ padding:'8px 10px' }}>{u.ativo === false ? <Power size={15}/> : <PowerOff size={15}/>}</button></div>}
    </div>
  }

  if (!canManage) return <div className="page-container"><h1>Acesso restrito</h1><p>Você não tem permissão para gerenciar usuários.</p></div>

  return <div className="page-container" style={{ maxWidth:920 }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:22 }}><div><h1 style={{ fontFamily:'var(--font-heading)', fontWeight:900 }}>Usuários</h1><p style={{ color:'var(--text3)' }}>Crie membros, gere convites e gerencie acessos.</p></div><button className="btn btn-primary" onClick={()=>setOpen(true)}><UserPlus size={16}/> Novo usuário</button></div>
    {loading ? <div>Carregando...</div> : <div style={{ display:'grid', gap:20 }}><section><h2 style={{ fontSize:16, marginBottom:10 }}>Gestão</h2><div style={{ display:'grid', gap:10 }}>{grupos.gestores.map(row)}</div></section><section><h2 style={{ fontSize:16, marginBottom:10 }}>Membros</h2><div style={{ display:'grid', gap:10 }}>{grupos.membros.map(row)}{grupos.membros.length===0 && <div style={{ color:'var(--text3)' }}>Nenhum membro cadastrado.</div>}</div></section></div>}
    {open && <ModalUsuario onClose={()=>setOpen(false)} onCreated={(u)=>{setUsuarios(v=>[...v,u]);}}/>}
  </div>
}
