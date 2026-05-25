import { useState, useEffect, useCallback } from 'react'
import { Plus, Users, UserPlus, Loader, X, CheckCircle2, XCircle, Crown, Star, User, Trash2, Edit3, Eye, EyeOff, ChevronDown, MessageSquare, Calendar, Flag } from 'lucide-react'
import { equipeApi, usersApi, tarefasApi, type MembroEquipe, type UserProfile, type Tarefa, type ChecklistItem } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { nanoid } from '../lib/utils'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:toastIn 0.2s ease;`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const ROLE_CONFIG = {
  gestor:     { label: 'Gestor',     icon: Crown, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  sub_gestor: { label: 'Sub-Gestor', icon: Star,  color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  membro:     { label: 'Membro',     icon: User,  color: '#06B6D4', bg: 'rgba(6,182,212,0.12)'  },
} as const

// ── Modal: Convidar / Criar usuário ──────────────────────────────────────────
function ConvidarModal({ onSave, onClose, gestorId }: {
  onSave: (u: UserProfile) => void
  onClose: () => void
  gestorId: string
}) {
  const { user } = useAuth()
  const [nome, setNome]       = useState('')
  const [email, setEmail]     = useState('')
  const [cargo, setCargo]     = useState('')
  const [role, setRole]       = useState<'sub_gestor' | 'membro'>('membro')
  const [senha, setSenha]     = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading] = useState(false)

  // sub_gestor só pode criar membros
  const podecriarSubGestor = user?.role === 'gestor'

  async function handleSave() {
    if (!nome.trim() || !email.trim()) { toast('Nome e e-mail são obrigatórios', 'error'); return }
    setLoading(true)
    try {
      const result = await usersApi.create({ nome: nome.trim(), email: email.trim(), role, cargo: cargo || undefined, senha: senha || undefined })
      toast(`Usuário criado! Senha: ${result.senha}`)
      onSave(result.user)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao criar usuário', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 28px', width: '100%', maxWidth: 460, animation: 'slideUp 0.22s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Adicionar à Equipe</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <input className="form-input" placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">E-mail *</label>
            <input className="form-input" type="email" placeholder="email@empresa.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Cargo</label>
              <input className="form-input" placeholder="Ex: Gerente de Vendas" value={cargo} onChange={e => setCargo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Nível de acesso</label>
              <select className="form-input" value={role} onChange={e => setRole(e.target.value as 'sub_gestor' | 'membro')} disabled={!podecriarSubGestor}>
                <option value="membro">Membro</option>
                {podecriarSubGestor && <option value="sub_gestor">Sub-Gestor</option>}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Senha (opcional — será gerada automaticamente)</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" type={showSenha ? 'text' : 'password'} placeholder="Deixe em branco para gerar" value={senha} onChange={e => setSenha(e.target.value)} style={{ paddingRight: 40 }} />
              <button onClick={() => setShowSenha(!showSenha)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
                {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2 }}>
            {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Criando…</> : <><UserPlus size={15} /> Adicionar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Atribuir tarefa a membro ──────────────────────────────────────────
function AtribuirTarefaModal({ membro, onSave, onClose }: {
  membro: MembroEquipe
  onSave: (t: Tarefa) => void
  onClose: () => void
}) {
  const [titulo, setTitulo]         = useState('')
  const [descricao, setDescricao]   = useState('')
  const [prazo, setPrazo]           = useState('')
  const [prioridade, setPrioridade] = useState<Tarefa['prioridade']>('media')
  const [checklist, setChecklist]   = useState<ChecklistItem[]>([])
  const [novoItem, setNovoItem]     = useState('')
  const [loading, setLoading]       = useState(false)

  function addItem() {
    if (!novoItem.trim()) return
    setChecklist(p => [...p, { id: nanoid(), texto: novoItem.trim(), feito: false }])
    setNovoItem('')
  }

  async function handleSave() {
    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    setLoading(true)
    try {
      const saved = await tarefasApi.create({
        titulo: titulo.trim(), descricao: descricao || undefined,
        prazo: prazo || undefined, prioridade,
        responsavel_id: membro.id, checklist,
      })
      onSave(saved)
      toast(`Tarefa atribuída a ${membro.nome}!`)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao criar tarefa', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 28px', width: '100%', maxWidth: 500, maxHeight: '90dvh', overflowY: 'auto', animation: 'slideUp 0.22s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Atribuir Tarefa</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18 }}>
          Para: <strong style={{ color: 'var(--text)' }}>{membro.nome}</strong>{membro.cargo && ` · ${membro.cargo}`}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-input" placeholder="Descreva a tarefa…" value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-input" rows={2} placeholder="Detalhes…" value={descricao} onChange={e => setDescricao(e.target.value)} style={{ resize: 'vertical', minHeight: 60 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Prazo</label>
              <input className="form-input" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value as Tarefa['prioridade'])}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Checklist</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="Adicionar item…" value={novoItem}
                onChange={e => setNovoItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem())} />
              <button className="btn btn-secondary" onClick={addItem}><Plus size={16} /></button>
            </div>
            {checklist.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{item.texto}</span>
                <button onClick={() => setChecklist(p => p.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={13} /></button>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2 }}>
            {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</> : <><Flag size={14} /> Atribuir Tarefa</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de membro ────────────────────────────────────────────────────────────
function MembroCard({ membro, podeGerenciar, onAtribuir, onRemover, onEditar }: {
  membro: MembroEquipe
  podeGerenciar: boolean
  onAtribuir: (m: MembroEquipe) => void
  onRemover: (id: string) => void
  onEditar: (m: MembroEquipe) => void
}) {
  const rc = ROLE_CONFIG[membro.role]
  const Icon = rc.icon
  const total = membro.tarefas_pendentes + membro.tarefas_concluidas
  const pct = total > 0 ? Math.round((membro.tarefas_concluidas / total) * 100) : 0

  return (
    <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Avatar */}
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: rc.bg, border: `2px solid ${rc.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {membro.avatar_url
          ? <img src={membro.avatar_url} alt={membro.nome} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
          : <span style={{ fontWeight: 800, fontSize: 16, color: rc.color }}>{membro.nome.charAt(0).toUpperCase()}</span>
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{membro.nome}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: rc.color, background: rc.bg, padding: '2px 7px', borderRadius: 99 }}>
            <Icon size={10} /> {rc.label}
          </span>
        </div>
        {membro.cargo && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{membro.cargo}</div>}
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{membro.email}</div>
        {/* Barra de progresso */}
        {total > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>
              <span>{membro.tarefas_pendentes} pendente{membro.tarefas_pendentes !== 1 ? 's' : ''}</span>
              <span>{pct}% concluído</span>
            </div>
            <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99 }}>
              <div style={{ height: '100%', borderRadius: 99, background: '#10B981', width: `${pct}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Ações */}
      {podeGerenciar && membro.role !== 'gestor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <button
            onClick={() => onAtribuir(membro)}
            title="Atribuir tarefa"
            style={{ background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 10px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Flag size={13} /> Tarefa
          </button>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onEditar(membro)} title="Editar" style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer', padding: '4px 0' }}>
              <Edit3 size={13} />
            </button>
            <button onClick={() => onRemover(membro.id)} title="Remover" style={{ flex: 1, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', padding: '4px 0' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal editar membro ───────────────────────────────────────────────────────
function EditarMembroModal({ membro, onSave, onClose, podePromover }: {
  membro: MembroEquipe
  onSave: (u: UserProfile) => void
  onClose: () => void
  podePromover: boolean
}) {
  const [nome, setNome]   = useState(membro.nome)
  const [cargo, setCargo] = useState(membro.cargo || '')
  const [role, setRole]   = useState<string>(membro.role)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      const updated = await usersApi.update(membro.id, { nome: nome.trim(), cargo: cargo || undefined, novoRole: role !== membro.role ? role : undefined })
      toast('Membro atualizado!')
      onSave(updated)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 28px', width: '100%', maxWidth: 420, animation: 'slideUp 0.22s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Editar Membro</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="form-input" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Cargo</label>
            <input className="form-input" placeholder="Ex: Gerente Financeiro" value={cargo} onChange={e => setCargo(e.target.value)} />
          </div>
          {podePromover && (
            <div className="form-group">
              <label className="form-label">Nível de acesso</label>
              <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
                <option value="membro">Membro</option>
                <option value="sub_gestor">Sub-Gestor</option>
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2 }}>
            {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Equipe() {
  const { user } = useAuth()
  const isGestor    = user?.role === 'gestor'
  const isSubGestor = user?.role === 'sub_gestor'
  const podeGerenciar = isGestor || isSubGestor

  const [membros, setMembros]   = useState<MembroEquipe[]>([])
  const [loading, setLoading]   = useState(true)
  const [aba, setAba]           = useState<'membros' | 'pessoas'>('membros')

  // Modais
  const [convidarOpen, setConvidarOpen]     = useState(false)
  const [atribuirMembro, setAtribuirMembro] = useState<MembroEquipe | null>(null)
  const [editarMembro, setEditarMembro]     = useState<MembroEquipe | null>(null)

  // Pessoas (aba)
  const [pessoas, setPessoas] = useState<{ id: string; nome: string; tipo: string; cargo?: string; email?: string; contato?: string }[]>([])
  const [pessoaForm, setPessoaForm] = useState(false)
  const [pNome, setPNome]   = useState('')
  const [pTipo, setPTipo]   = useState('funcionario')
  const [pCargo, setPCargo] = useState('')
  const [pEmail, setPEmail] = useState('')
  const [pContato, setPContato] = useState('')
  const [pLoading, setPLoading] = useState(false)

  const loadMembros = useCallback(async () => {
    setLoading(true)
    try {
      const m = await equipeApi.membros()
      setMembros(m)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar membros', 'error')
    } finally { setLoading(false) }
  }, [])

  const loadPessoas = useCallback(async () => {
    try {
      const p = await equipeApi.pessoas()
      setPessoas(p)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { loadMembros() }, [loadMembros])
  useEffect(() => { if (aba === 'pessoas') loadPessoas() }, [aba, loadPessoas])

  async function handleRemover(id: string) {
    if (!confirm('Remover este membro da equipe?')) return
    try {
      await usersApi.remove(id)
      setMembros(p => p.filter(m => m.id !== id))
      toast('Membro removido')
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  async function handleCriarPessoa() {
    if (!pNome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setPLoading(true)
    try {
      const p = await equipeApi.createPessoa({ nome: pNome.trim(), tipo: pTipo as never, cargo: pCargo || undefined, email: pEmail || undefined, contato: pContato || undefined })
      setPessoas(prev => [...prev, p])
      setPNome(''); setPTipo('funcionario'); setPCargo(''); setPEmail(''); setPContato('')
      setPessoaForm(false)
      toast('Contato adicionado!')
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setPLoading(false) }
  }

  // Separar por hierarquia para exibição
  const gestores    = membros.filter(m => m.role === 'gestor')
  const subGestores = membros.filter(m => m.role === 'sub_gestor')
  const membrosSimples = membros.filter(m => m.role === 'membro')

  return (
    <div style={{ padding: '0 0 calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 20px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, margin: 0 }}>Equipe</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>{membros.length} membro{membros.length !== 1 ? 's' : ''}</p>
        </div>
        {podeGerenciar && (
          <button className="btn btn-primary" onClick={() => setConvidarOpen(true)} style={{ gap: 6 }}>
            <UserPlus size={16} /> Adicionar
          </button>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 14px' }}>
        {(['membros', 'pessoas'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: aba === a ? 'var(--primary)' : 'var(--bg2)',
              color: aba === a ? '#fff' : 'var(--text2)' }}>
            {a === 'membros' ? 'Membros' : 'Pessoas'}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* ABA MEMBROS */}
        {aba === 'membros' && (
          loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}>
              <Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando…
            </div>
          ) : membros.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <Users size={48} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum membro ainda</div>
              {podeGerenciar && <div style={{ fontSize: 13 }}>Adicione membros à sua equipe</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Gestores */}
              {gestores.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    <Crown size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Direção / Gestão
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {gestores.map(m => (
                      <MembroCard key={m.id} membro={m} podeGerenciar={false}
                        onAtribuir={() => {}} onRemover={() => {}} onEditar={() => {}} />
                    ))}
                  </div>
                </div>
              )}
              {/* Sub-gestores */}
              {subGestores.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    <Star size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Gerentes / Líderes
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {subGestores.map(m => (
                      <MembroCard key={m.id} membro={m} podeGerenciar={isGestor}
                        onAtribuir={setAtribuirMembro}
                        onRemover={handleRemover}
                        onEditar={setEditarMembro} />
                    ))}
                  </div>
                </div>
              )}
              {/* Membros */}
              {membrosSimples.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#06B6D4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    <User size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Equipe / Colaboradores
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {membrosSimples.map(m => (
                      <MembroCard key={m.id} membro={m} podeGerenciar={podeGerenciar}
                        onAtribuir={setAtribuirMembro}
                        onRemover={handleRemover}
                        onEditar={setEditarMembro} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ABA PESSOAS */}
        {aba === 'pessoas' && (
          <div>
            {podeGerenciar && (
              <button className="btn btn-secondary" onClick={() => setPessoaForm(!pessoaForm)} style={{ width: '100%', marginBottom: 14, gap: 6 }}>
                <Plus size={15} /> {pessoaForm ? 'Cancelar' : 'Novo Contato'}
              </button>
            )}
            {pessoaForm && (
              <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Nome *</label>
                    <input className="form-input" placeholder="Nome completo" value={pNome} onChange={e => setPNome(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-input" value={pTipo} onChange={e => setPTipo(e.target.value)}>
                      <option value="funcionario">Funcionário</option>
                      <option value="prestador">Prestador</option>
                      <option value="cliente">Cliente</option>
                      <option value="credor">Credor</option>
                      <option value="devedor">Devedor</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cargo</label>
                    <input className="form-input" placeholder="Cargo" value={pCargo} onChange={e => setPCargo(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">E-mail</label>
                    <input className="form-input" type="email" placeholder="email@" value={pEmail} onChange={e => setPEmail(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contato</label>
                    <input className="form-input" placeholder="Telefone / WhatsApp" value={pContato} onChange={e => setPContato(e.target.value)} />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleCriarPessoa} disabled={pLoading} style={{ width: '100%' }}>
                  {pLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Salvar Contato'}
                </button>
              </div>
            )}
            {pessoas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
                <Users size={40} style={{ marginBottom: 10 }} />
                <div style={{ fontWeight: 700 }}>Nenhum contato cadastrado</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pessoas.map(p => (
                  <div key={p.id} style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nome}</div>
                    {p.cargo && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.cargo}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{p.tipo}{p.email ? ` · ${p.email}` : ''}{p.contato ? ` · ${p.contato}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modais */}
      {convidarOpen && (
        <ConvidarModal
          gestorId={user?.id || ''}
          onSave={u => { loadMembros(); setConvidarOpen(false) }}
          onClose={() => setConvidarOpen(false)}
        />
      )}
      {atribuirMembro && (
        <AtribuirTarefaModal
          membro={atribuirMembro}
          onSave={() => setAtribuirMembro(null)}
          onClose={() => setAtribuirMembro(null)}
        />
      )}
      {editarMembro && (
        <EditarMembroModal
          membro={editarMembro}
          podePromover={isGestor}
          onSave={() => { loadMembros(); setEditarMembro(null) }}
          onClose={() => setEditarMembro(null)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(30px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  )
}
