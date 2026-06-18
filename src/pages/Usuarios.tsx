import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, Check, Copy, Eye, EyeOff, KeyRound, Link as LinkIcon, Loader,
  Pencil, Power, PowerOff, Save, Trash2, UserCircle2, UserPlus, X,
} from 'lucide-react'
import { usersApi, type UserProfile } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useVisualTexts } from '../hooks/useVisualTexts'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);pointer-events:none;max-width:min(90vw,520px);text-align:center;`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3200)
}

function gerarSenha() {
  return Math.random().toString(36).slice(-6) + 'A1'
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
  toast('Copiado!')
}

type CriavelRole = 'admin' | 'gestor' | 'sub_gestor' | 'membro'

function roleOptionsFor(currentRole?: string | null): Array<{ value: CriavelRole; label: string }> {
  if (currentRole === 'dev') return [
    { value: 'admin', label: 'Admin' }, { value: 'gestor', label: 'Gestor' },
    { value: 'sub_gestor', label: 'Subgestor' }, { value: 'membro', label: 'Membro' },
  ]
  if (currentRole === 'admin') return [
    { value: 'gestor', label: 'Gestor' }, { value: 'sub_gestor', label: 'Subgestor' }, { value: 'membro', label: 'Membro' },
  ]
  if (currentRole === 'gestor') return [
    { value: 'sub_gestor', label: 'Subgestor' }, { value: 'membro', label: 'Membro' },
  ]
  return [{ value: 'membro', label: 'Membro' }]
}

function roleLabel(role: UserProfile['role']) {
  if (role === 'admin') return 'Admin'
  if (role === 'dev') return 'Dev'
  if (role === 'gestor') return 'Gestor'
  if (role === 'sub_gestor') return 'Subgestor'
  return 'Membro'
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U'
}

function Avatar({ user, size = 52 }: { user: UserProfile; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flex: '0 0 auto', overflow: 'hidden',
      display: 'grid', placeItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)',
      fontWeight: 900, color: 'var(--primary)', fontSize: Math.max(12, size * .3),
    }}>
      {user.avatar_url
        ? <img src={user.avatar_url} alt={`Foto de ${user.nome}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(user.nome)}
    </div>
  )
}

function ModalUsuario({ onClose, onCreated, currentRole }: {
  onClose: () => void
  onCreated: (u: UserProfile) => void
  currentRole?: string | null
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const roleOptions = roleOptionsFor(currentRole)
  const [role, setRole] = useState<CriavelRole>(roleOptions[0]?.value || 'membro')
  const [cargo, setCargo] = useState('')
  const [senha, setSenha] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSenha, setLastSenha] = useState('')
  const [lastLink, setLastLink] = useState('')

  async function criar() {
    if (!nome.trim() || !email.trim()) { toast('Nome e e-mail são obrigatórios.', 'error'); return }
    setSaving(true)
    try {
      const res = await usersApi.create({ nome: nome.trim(), email: email.trim().toLowerCase(), role, cargo: cargo.trim() || undefined, senha: senha || undefined })
      onCreated(res.user)
      setLastSenha(res.senha || res.senha_provisoria || '')
      toast('Usuário criado.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao criar usuário.', 'error') }
    finally { setSaving(false) }
  }

  async function gerarConvite() {
    if (!email.trim()) { toast('Informe o e-mail para gerar convite.', 'error'); return }
    setSaving(true)
    try {
      const res = await usersApi.invite({ nome: nome.trim() || undefined, email: email.trim().toLowerCase(), role, cargo: cargo.trim() || undefined })
      setLastLink(res.link)
      toast('Link de convite criado.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao gerar convite.', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="modal-card" style={{ width: 'min(100%, 560px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:18 }}>
          <div><h2 style={{ fontFamily:'var(--font-heading)', fontSize:20, fontWeight:900 }}>Novo usuário</h2><p style={{ fontSize:13, color:'var(--text3)', marginTop:4 }}>Crie o acesso ou gere um link de convite.</p></div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding:8 }} aria-label="Fechar"><X size={18}/></button>
        </div>
        <div style={{ display:'grid', gap:12 }}>
          <label className="form-group"><span className="form-label">Nome</span><input className="form-input" value={nome} onChange={e=>setNome(e.target.value)} /></label>
          <label className="form-group"><span className="form-label">E-mail</span><input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
          <label className="form-group"><span className="form-label">Cargo/função opcional</span><input className="form-input" value={cargo} onChange={e=>setCargo(e.target.value)} placeholder="Ex.: Atendimento, Financeiro, Comercial" /></label>
          <label className="form-group"><span className="form-label">Permissão</span><select className="form-input" value={role} onChange={e=>setRole(e.target.value as CriavelRole)}>{roleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
          <label className="form-group"><span className="form-label">Senha provisória opcional</span><div style={{ position:'relative' }}><input className="form-input" type={show ? 'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)} style={{ paddingRight:76 }} /><button type="button" onClick={()=>setShow(s=>!s)} style={{ position:'absolute', right:42, top:'50%', transform:'translateY(-50%)', background:'none', border:0, color:'var(--text3)' }}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button><button type="button" onClick={()=>setSenha(gerarSenha())} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:0, color:'var(--primary)' }} title="Gerar senha"><KeyRound size={16}/></button></div></label>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginTop:18 }}>
          <button className="btn btn-primary" onClick={criar} disabled={saving}>{saving ? <Loader size={16} className="spin"/> : <UserPlus size={16}/>} Criar usuário</button>
          <button className="btn btn-secondary" onClick={gerarConvite} disabled={saving}><LinkIcon size={16}/> Criar convite</button>
        </div>
        {lastSenha && <div style={{ marginTop:14, padding:12, background:'var(--bg3)', borderRadius:12 }}><b>Senha provisória:</b> <code>{lastSenha}</code> <button className="btn btn-ghost" onClick={()=>copy(lastSenha)} style={{ marginLeft:8, padding:'4px 8px' }}><Copy size={14}/> Copiar</button></div>}
        {lastLink && <div style={{ marginTop:10, padding:12, background:'var(--bg3)', borderRadius:12, overflowWrap:'anywhere' }}><b>Link de convite:</b> {lastLink}<br/><button className="btn btn-ghost" onClick={()=>copy(lastLink)} style={{ marginTop:8, padding:'4px 8px' }}><Copy size={14}/> Copiar link</button></div>}
      </div>
    </div>
  )
}

function ModalEditarUsuario({ target, currentUser, onClose, onUpdated }: {
  target: UserProfile
  currentUser: UserProfile
  onClose: () => void
  onUpdated: (u: UserProfile) => void
}) {
  const isSelf = target.id === currentUser.id
  const [nome, setNome] = useState(target.nome)
  const [cargo, setCargo] = useState(target.cargo || '')
  const [role, setRole] = useState(target.role)
  const [ativo, setAtivo] = useState(target.ativo !== false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(target.avatar_url || '')
  const [saving, setSaving] = useState(false)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const roleOptions = roleOptionsFor(currentUser.role)
  const canChangeRole = !isSelf && roleOptions.some(opt => opt.value === role)
  const canChangeStatus = !isSelf

  function chooseAvatar(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast('Use uma imagem PNG, JPG, JPEG ou WEBP.', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { toast('A foto deve ter no máximo 5 MB.', 'error'); return }
    setAvatarFile(file)
    setPreview(URL.createObjectURL(file))
  }

  async function removerFoto() {
    setRemovingPhoto(true)
    try {
      const updated = await usersApi.removeAvatar(target.id)
      setPreview('')
      setAvatarFile(null)
      onUpdated(updated)
      toast('Foto removida.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao remover foto.', 'error') }
    finally { setRemovingPhoto(false) }
  }

  async function salvar() {
    if (!nome.trim()) { toast('Nome é obrigatório.', 'error'); return }
    if (novaSenha && novaSenha.length < 6) { toast('A nova senha deve ter pelo menos 6 caracteres.', 'error'); return }
    if (novaSenha && novaSenha !== confirmarSenha) { toast('A confirmação da senha não confere.', 'error'); return }
    if (isSelf && novaSenha && !senhaAtual) { toast('Informe sua senha atual.', 'error'); return }

    setSaving(true)
    try {
      let updated = await usersApi.update(target.id, {
        nome: nome.trim(), cargo: cargo.trim(),
        ...(canChangeRole && role !== target.role ? { role } : {}),
        ...(canChangeStatus && ativo !== (target.ativo !== false) ? { ativo } : {}),
      })
      if (avatarFile) updated = await usersApi.uploadAvatar(target.id, avatarFile)
      if (novaSenha) await usersApi.changePassword(target.id, { senhaAtual: isSelf ? senhaAtual : undefined, novaSenha })
      onUpdated(updated)
      toast(novaSenha ? 'Perfil e senha atualizados.' : 'Perfil atualizado.')
      onClose()
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao atualizar usuário.', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="modal-card" style={{ width:'min(100%, 620px)', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div><h2 style={{ fontFamily:'var(--font-heading)', fontSize:20, fontWeight:900 }}>{isSelf ? 'Editar meu perfil' : 'Editar usuário'}</h2><p style={{ fontSize:13, color:'var(--text3)', marginTop:4 }}>{isSelf ? 'Atualize seus dados, foto e senha.' : 'Atualize os dados e o acesso deste usuário.'}</p></div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding:8 }} aria-label="Fechar"><X size={18}/></button>
        </div>

        <section style={{ display:'grid', gridTemplateColumns:'auto minmax(0,1fr)', gap:16, alignItems:'center', padding:'18px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ width:84, height:84, borderRadius:'50%', overflow:'hidden', background:'var(--bg3)', border:'1px solid var(--border)', display:'grid', placeItems:'center', fontSize:24, fontWeight:900, color:'var(--primary)' }}>
            {preview ? <img src={preview} alt="Prévia da foto" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials(nome)}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:800, marginBottom:8 }}>Foto do perfil</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              <button type="button" className="btn btn-secondary" onClick={()=>inputRef.current?.click()}><Camera size={16}/> {preview ? 'Trocar foto' : 'Adicionar foto'}</button>
              {preview && <button type="button" className="btn btn-ghost" onClick={removerFoto} disabled={removingPhoto}>{removingPhoto ? <Loader size={16} className="spin"/> : <Trash2 size={16}/>} Remover</button>}
            </div>
            <div style={{ color:'var(--text3)', fontSize:12, marginTop:7 }}>PNG, JPG ou WEBP, até 5 MB.</div>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>chooseAvatar(e.target.files?.[0])}/>
          </div>
        </section>

        <div style={{ display:'grid', gap:12, paddingTop:18 }}>
          <label className="form-group"><span className="form-label">Nome</span><input className="form-input" value={nome} onChange={e=>setNome(e.target.value)} /></label>
          <label className="form-group"><span className="form-label">E-mail</span><input className="form-input" value={target.email} disabled /><small style={{ color:'var(--text3)' }}>O e-mail de acesso é mantido para evitar perda de login e vínculos.</small></label>
          <label className="form-group"><span className="form-label">Cargo/função opcional</span><input className="form-input" value={cargo} onChange={e=>setCargo(e.target.value)} placeholder="Ex.: Atendimento, Financeiro, Comercial" /></label>
          {canChangeRole && <label className="form-group"><span className="form-label">Permissão</span><select className="form-input" value={role} onChange={e=>setRole(e.target.value as UserProfile['role'])}>{roleOptions.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>}
          {canChangeStatus && <label style={{ display:'flex', alignItems:'center', gap:10, padding:12, border:'1px solid var(--border)', borderRadius:12 }}><input type="checkbox" checked={ativo} onChange={e=>setAtivo(e.target.checked)} /><span><b>Usuário ativo</b><div style={{ fontSize:12, color:'var(--text3)' }}>Desmarque para bloquear o acesso sem apagar os dados.</div></span></label>}
        </div>

        <section style={{ marginTop:20, paddingTop:18, borderTop:'1px solid var(--border)' }}>
          <h3 style={{ fontSize:15, marginBottom:4 }}>Alterar senha</h3>
          <p style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>{isSelf ? 'Para sua segurança, informe a senha atual.' : 'Opcional. Defina uma nova senha para este usuário.'}</p>
          <div style={{ display:'grid', gap:10 }}>
            {isSelf && <label className="form-group"><span className="form-label">Senha atual</span><input className="form-input" type={showPasswords?'text':'password'} value={senhaAtual} onChange={e=>setSenhaAtual(e.target.value)} /></label>}
            <label className="form-group"><span className="form-label">Nova senha</span><input className="form-input" type={showPasswords?'text':'password'} value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} placeholder="Deixe vazio para não alterar" /></label>
            <label className="form-group"><span className="form-label">Confirmar nova senha</span><input className="form-input" type={showPasswords?'text':'password'} value={confirmarSenha} onChange={e=>setConfirmarSenha(e.target.value)} /></label>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text3)' }}><input type="checkbox" checked={showPasswords} onChange={e=>setShowPasswords(e.target.checked)} /> Mostrar senhas</label>
          </div>
        </section>

        <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'flex-end', gap:10, marginTop:22 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? <Loader size={16} className="spin"/> : <Save size={16}/>} Salvar alterações</button>
        </div>
      </div>
    </div>
  )
}

export default function Usuarios() {
  const { t } = useVisualTexts()
  const { user: eu, refreshUser } = useAuth()
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserProfile | null>(null)

  const canCreate = !!eu
  const canDeleteUsers = eu?.role === 'admin' || eu?.role === 'dev' || eu?.role === 'gestor'

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsuarios(await usersApi.list()) }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao carregar usuários.', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const grupos = useMemo(() => ({
    gestores: usuarios.filter(u => u.role === 'admin' || u.role === 'dev' || u.role === 'gestor' || u.role === 'sub_gestor'),
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
      setUsuarios(list => list.map(x => x.id === u.id ? updated : x))
      toast(updated.ativo === false ? 'Usuário desativado.' : 'Usuário ativado.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao alterar status.', 'error') }
  }

  async function apagar(u: UserProfile) {
    if (!canDeleteUsers) { toast('Apenas admin, dev ou gestor podem apagar usuários.', 'error'); return }
    if (u.id === eu?.id) { toast('Você não pode apagar seu próprio usuário.', 'error'); return }
    const ok = window.confirm(`Apagar definitivamente o usuário ${u.nome}?\n\nA ação não pode ser desfeita.`)
    if (!ok) return
    try {
      await usersApi.remove(u.id)
      setUsuarios(list => list.filter(x => x.id !== u.id))
      toast('Usuário apagado com sucesso.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao apagar usuário.', 'error') }
  }

  async function applyUpdated(updated: UserProfile) {
    setUsuarios(list => list.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    if (updated.id === eu?.id) await refreshUser()
  }

  function canEditUser(u: UserProfile) {
    if (!eu) return false
    if (u.id === eu.id) return true
    if (eu.role === 'dev') return u.role !== 'dev'
    if (eu.role === 'admin') return u.role !== 'dev' && u.role !== 'admin'
    if (eu.role === 'gestor') return u.role === 'sub_gestor' || u.role === 'membro'
    if (eu.role === 'sub_gestor' || eu.role === 'membro') return u.role === 'membro' && u.criado_por === eu.id
    return false
  }

  function row(u: UserProfile) {
    const isSelf = u.id === eu?.id
    return (
      <div key={u.id} style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:14, alignItems:'center', padding:14, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
          <Avatar user={u}/>
          <div style={{ minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:7 }}><span style={{ fontWeight:800 }}>{u.nome}</span>{isSelf && <span style={{ fontSize:11, padding:'2px 7px', borderRadius:999, background:'var(--bg3)', color:'var(--text3)' }}>Você</span>}</div>
            <div style={{ color:'var(--text3)', fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
            <div style={{ marginTop:5, fontSize:12, color:'var(--text3)' }}>{roleLabel(u.role)}{u.cargo ? ` · ${u.cargo}` : ''} · {u.ativo === false ? 'Inativo' : 'Ativo'}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {canEditUser(u) && <button className="btn btn-secondary" style={{ padding:9 }} onClick={()=>setEditing(u)} title={isSelf ? 'Editar meu perfil' : 'Editar usuário'}><Pencil size={16}/></button>}
          {!isSelf && <button className="btn btn-secondary" style={{ padding:9 }} onClick={()=>resetar(u.id)} title="Gerar senha provisória"><KeyRound size={16}/></button>}
          {!isSelf && <button className="btn btn-secondary" style={{ padding:9 }} onClick={()=>alternar(u)} title={u.ativo === false ? 'Ativar usuário' : 'Desativar usuário'}>{u.ativo === false ? <Power size={16}/> : <PowerOff size={16}/>}</button>}
          {!isSelf && canDeleteUsers && <button className="btn btn-secondary" style={{ padding:9, color:'var(--danger)' }} onClick={()=>apagar(u)} title="Apagar usuário"><Trash2 size={16}/></button>}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container" style={{ maxWidth:980 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:22, flexWrap:'wrap' }}>
        <div><h1 style={{ fontFamily:'var(--font-heading)', fontWeight:900 }}>{t('users.pageTitle')}</h1><p style={{ color:'var(--text3)' }}>{t('users.pageSubtitle')}</p></div>
        {canCreate && <button className="btn btn-primary" onClick={()=>setOpen(true)}><UserPlus size={16}/> {t('users.newButton')}</button>}
      </div>

      {loading ? <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text3)' }}><Loader size={17} className="spin"/> Carregando usuários...</div> : (
        <div style={{ display:'grid', gap:20 }}>
          <section><h2 style={{ fontSize:16, marginBottom:10 }}>Gestão</h2><div style={{ display:'grid', gap:10 }}>{grupos.gestores.map(row)}{grupos.gestores.length===0 && <div style={{ color:'var(--text3)' }}>Nenhum usuário de gestão cadastrado.</div>}</div></section>
          <section><h2 style={{ fontSize:16, marginBottom:10 }}>Membros</h2><div style={{ display:'grid', gap:10 }}>{grupos.membros.map(row)}{grupos.membros.length===0 && <div style={{ color:'var(--text3)' }}>Nenhum membro cadastrado.</div>}</div></section>
        </div>
      )}

      {open && <ModalUsuario currentRole={eu?.role} onClose={()=>setOpen(false)} onCreated={(u)=>{setUsuarios(v=>[...v,u]); setOpen(false)}}/>}
      {editing && eu && <ModalEditarUsuario target={editing} currentUser={eu} onClose={()=>setEditing(null)} onUpdated={applyUpdated}/>} 
    </div>
  )
}
