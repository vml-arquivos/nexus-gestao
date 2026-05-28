import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, X, Mic, MicOff, Calendar, ChevronDown, ChevronUp,
  CheckCircle2, Clock, Crown, Shield, User, Trash2, Edit3, Check,
  Send, Copy, Share2, Link, RefreshCw,
} from 'lucide-react'
import { equipeApi, usersApi, tarefasApi, type MembroEquipe, type UserProfile, type Tarefa, type ChecklistItem } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { nanoid } from '../lib/utils'
import { useSpeechToText } from '../hooks/useSpeechToText'

// ── Helpers ───────────────────────────────────────────────────────────────────
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = `toast ${type}`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function Avatar({ nome, size = 40, color = 'var(--primary)' }: { nome: string; size?: number; color?: string }) {
  const initials = nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.35, color: '#fff', flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

const ROLE_CONFIG = {
  admin:      { label: 'Admin',      icon: Crown,  color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  dev:        { label: 'Dev',        icon: Shield, color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
  gestor:     { label: 'Gestor',     icon: Crown,  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  sub_gestor: { label: 'Gerente',    icon: Shield, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  membro:     { label: 'Membro',     icon: User,   color: '#06B6D4', bg: 'rgba(6,182,212,0.12)'  },
}

// ── Modal de Nova Tarefa para Membro ──────────────────────────────────────────
function ModalNovaTarefa({ membro, onClose }: { membro: MembroEquipe; onClose: () => void }) {
  const [titulo, setTitulo]         = useState('')
  const [descricao, setDescricao]   = useState('')
  const [prazo, setPrazo]           = useState('')
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media')
  const [recorrencia, setRecorrencia] = useState<'nenhuma' | 'diaria' | 'semanal' | 'mensal'>('nenhuma')
  const [checklist, setChecklist]   = useState<ChecklistItem[]>([])
  const [novoItem, setNovoItem]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [enviadas, setEnviadas]     = useState(0)

  const micTitulo = useSpeechToText(t => setTitulo(p => p + t))
  const micDesc   = useSpeechToText(t => setDescricao(p => p + t))
  const micItem   = useSpeechToText(t => setNovoItem(p => p + t))

  function addItem() {
    if (!novoItem.trim()) return
    setChecklist(p => [...p, { id: nanoid(), texto: novoItem.trim(), feito: false }])
    setNovoItem('')
  }

  function resetForm() {
    setTitulo(''); setDescricao(''); setPrazo(''); setPrioridade('media')
    setRecorrencia('nenhuma'); setChecklist([]); setNovoItem('')
  }

  async function handleEnviar(fecharApos = false) {
    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    setLoading(true)
    try {
      await tarefasApi.create({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: membro.id,
        checklist,
        obs: recorrencia !== 'nenhuma' ? `Recorrência: ${recorrencia}` : undefined,
      })
      setEnviadas(p => p + 1)
      toast(`Tarefa enviada para ${membro.nome}!`)
      resetForm()
      if (fecharApos) onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao enviar tarefa', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Nova Tarefa</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text3)', marginTop: 2 }}>
              Para: <strong>{membro.nome}</strong>
              {enviadas > 0 && <span style={{ marginLeft: 8, color: 'var(--success)', fontWeight: 700 }}>✓ {enviadas} enviada{enviadas > 1 ? 's' : ''}</span>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Título */}
          <div className="form-group">
            <label className="form-label">Título *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                placeholder="O que precisa ser feito?"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className={`mic-btn${micTitulo.listening ? ' listening' : ''}`}
                onClick={micTitulo.toggle}
                title={micTitulo.listening ? 'Parar' : 'Ditar título'}
                style={{ padding: '0 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              >
                {micTitulo.listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </div>

          {/* Descrição */}
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <textarea
                className="form-input"
                placeholder="Detalhes, instruções ou contexto..."
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={3}
                style={{ flex: 1 }}
              />
              <button
                className={`mic-btn${micDesc.listening ? ' listening' : ''}`}
                onClick={micDesc.toggle}
                title={micDesc.listening ? 'Parar' : 'Ditar descrição'}
                style={{ padding: '0 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', height: 40 }}
              >
                {micDesc.listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </div>

          {/* Prazo + Prioridade */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label"><Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />Prazo</label>
              <input type="date" className="form-input" value={prazo} onChange={e => setPrazo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value as 'baixa' | 'media' | 'alta')}>
                <option value="baixa">🟢 Baixa</option>
                <option value="media">🟡 Média</option>
                <option value="alta">🔴 Alta</option>
              </select>
            </div>
          </div>

          {/* Recorrência */}
          <div className="form-group">
            <label className="form-label">Recorrência</label>
            <select className="form-input" value={recorrencia} onChange={e => setRecorrencia(e.target.value as typeof recorrencia)}>
              <option value="nenhuma">Uma vez</option>
              <option value="diaria">Diária</option>
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
          </div>

          {/* Checklist */}
          <div className="form-group">
            <label className="form-label">Checklist ({checklist.length} itens)</label>
            {checklist.map((item, i) => (
              <div key={item.id} className="checklist-item">
                <CheckCircle2 size={14} color="var(--success)" />
                <span style={{ flex: 1, fontSize: 'var(--text-sm)' }}>{item.texto}</span>
                <button
                  onClick={() => setChecklist(p => p.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                placeholder="Adicionar item ao checklist..."
                value={novoItem}
                onChange={e => setNovoItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                style={{ flex: 1 }}
              />
              <button
                className={`mic-btn${micItem.listening ? ' listening' : ''}`}
                onClick={micItem.toggle}
                style={{ padding: '0 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              >
                {micItem.listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button className="btn btn-secondary btn-icon" onClick={addItem}><Plus size={16} /></button>
            </div>
          </div>

          {/* Botões */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => handleEnviar(false)}
              disabled={loading}
            >
              {loading ? 'Enviando…' : '+ Enviar e criar outra'}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => handleEnviar(true)}
              disabled={loading}
            >
              <Send size={15} />
              {loading ? 'Enviando…' : 'Enviar e fechar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal de Convite ──────────────────────────────────────────────────────────
function ModalConvite({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState<'membro' | 'sub_gestor'>('membro')
  const [cargo, setCargo]   = useState('')
  const [loading, setLoading] = useState(false)
  const [link, setLink]     = useState('')

  async function gerarLink() {
    setLoading(true)
    try {
      const res = await fetch('/api/convites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('nx_access_token')}` },
        body: JSON.stringify({ email: email.trim() || undefined, novoRole: role, cargo: cargo.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar convite')
      setLink(data.link)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao gerar convite', 'error')
    } finally {
      setLoading(false)
    }
  }

  function copiarLink() {
    navigator.clipboard.writeText(link).then(() => toast('Link copiado!'))
  }

  function compartilharWhatsApp() {
    const msg = encodeURIComponent(`Olá! Você foi convidado para a equipe no Nexus Gestão. Acesse o link para criar sua conta:\n\n${link}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">Convidar Membro</div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {!link ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">E-mail (opcional)</label>
              <input className="form-input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Se informado, o link será pré-vinculado ao e-mail.</span>
            </div>
            {user?.role === 'gestor' && (
              <div className="form-group">
                <label className="form-label">Nível de acesso</label>
                <select className="form-input" value={role} onChange={e => setRole(e.target.value as 'membro' | 'sub_gestor')}>
                  <option value="membro">Membro</option>
                  <option value="sub_gestor">Gerente / Sub-Gestor</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Cargo (opcional)</label>
              <input className="form-input" placeholder="Ex: Gerente de Vendas, Financeiro..." value={cargo} onChange={e => setCargo(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={gerarLink} disabled={loading} style={{ width: '100%' }}>
              <Link size={15} />
              {loading ? 'Gerando…' : 'Gerar Link de Convite'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'var(--success-dim)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 'var(--radius)', padding: 14, textAlign: 'center',
            }}>
              <CheckCircle2 size={24} color="var(--success)" style={{ marginBottom: 6 }} />
              <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>Link gerado com sucesso!</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text3)' }}>Válido por 7 dias. Compartilhe com o convidado.</div>
            </div>

            <div style={{
              background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px',
              fontSize: 'var(--text-xs)', color: 'var(--text3)', wordBreak: 'break-all',
              border: '1px solid var(--border)',
            }}>
              {link}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={copiarLink}>
                <Copy size={15} /> Copiar Link
              </button>
              <button
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: '#25D366', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
                  padding: '9px 16px', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
                }}
                onClick={compartilharWhatsApp}
              >
                <Share2 size={15} /> WhatsApp
              </button>
            </div>

            <button className="btn btn-ghost" onClick={() => { setLink(''); setEmail(''); setCargo('') }}>
              <RefreshCw size={14} /> Gerar novo link
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card de Membro ────────────────────────────────────────────────────────────
function CardMembro({
  membro, canManage, onEnviarTarefa, onEditar, onRemover
}: {
  membro: MembroEquipe
  canManage: boolean
  onEnviarTarefa: (m: MembroEquipe) => void
  onEditar: (m: MembroEquipe) => void
  onRemover: (m: MembroEquipe) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const rc = ROLE_CONFIG[membro.role] || ROLE_CONFIG.membro
  const RoleIcon = rc.icon
  const total = membro.tarefas_pendentes + membro.tarefas_concluidas
  const pct = total > 0 ? Math.round((membro.tarefas_concluidas / total) * 100) : 0

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header do card */}
      <div
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
        onClick={() => setExpanded(p => !p)}
      >
        <Avatar nome={membro.nome} size={44} color={rc.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {membro.nome}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: rc.bg, color: rc.color,
              padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
            }}>
              <RoleIcon size={10} />
              {membro.cargo || rc.label}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canManage && (
            <button
              className="btn btn-primary btn-icon"
              onClick={e => { e.stopPropagation(); onEnviarTarefa(membro) }}
              title="Enviar tarefa"
              style={{ padding: '7px 10px' }}
            >
              <Send size={14} />
            </button>
          )}
          {expanded ? <ChevronUp size={16} color="var(--text3)" /> : <ChevronDown size={16} color="var(--text3)" />}
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>
          <span><Clock size={10} style={{ marginRight: 3 }} />{membro.tarefas_pendentes} pendente{membro.tarefas_pendentes !== 1 ? 's' : ''}</span>
          <span><CheckCircle2 size={10} style={{ marginRight: 3 }} />{membro.tarefas_concluidas} concluída{membro.tarefas_concluidas !== 1 ? 's' : ''}</span>
          <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--text2)' }}>{pct}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--primary)' }} />
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text3)' }}>
            <strong>E-mail:</strong> {membro.email}
          </div>
          {membro.criado_por_nome && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text3)' }}>
              <strong>Adicionado por:</strong> {membro.criado_por_nome}
            </div>
          )}
          {canManage && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-secondary btn-icon" onClick={() => onEditar(membro)} title="Editar">
                <Edit3 size={14} />
              </button>
              <button className="btn btn-danger btn-icon" onClick={() => onRemover(membro)} title="Remover">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────────────────────
export default function Equipe() {
  const { user } = useAuth()
  const [membros, setMembros] = useState<MembroEquipe[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState('')
  const [tab, setTab]         = useState<'membros' | 'pessoas'>('membros')

  const [modalTarefa, setModalTarefa]   = useState<MembroEquipe | null>(null)
  const [modalConvite, setModalConvite] = useState(false)
  const [modalEditar, setModalEditar]   = useState<MembroEquipe | null>(null)
  const [editNome, setEditNome]         = useState('')
  const [editCargo, setEditCargo]       = useState('')
  const [editRole, setEditRole]         = useState('')
  const [editLoading, setEditLoading]   = useState(false)

  const canManage = user?.role === 'gestor' || user?.role === 'sub_gestor'

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      const data = await equipeApi.membros()
      setMembros(data)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao buscar membros.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function handleRemover(m: MembroEquipe) {
    if (!confirm(`Remover ${m.nome} da equipe?`)) return
    try {
      await usersApi.remove(m.id)
      toast(`${m.nome} removido.`)
      carregar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao remover', 'error')
    }
  }

  async function handleSalvarEdicao() {
    if (!modalEditar) return
    setEditLoading(true)
    try {
      await usersApi.update(modalEditar.id, {
        nome: editNome,
        cargo: editCargo,
        novoRole: user?.role === 'gestor' ? editRole : undefined,
      })
      toast('Perfil atualizado.')
      setModalEditar(null)
      carregar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar', 'error')
    } finally {
      setEditLoading(false)
    }
  }

  // Separar membros por nível
  const gestores    = membros.filter(m => m.role === 'gestor')
  const subGestores = membros.filter(m => m.role === 'sub_gestor')
  const membrosList = membros.filter(m => m.role === 'membro')

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Equipe</h1>
          <p className="page-subtitle">{membros.length} membro{membros.length !== 1 ? 's' : ''}</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setModalConvite(true)}>
            <Plus size={16} /> Convidar
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab-btn${tab === 'membros' ? ' active' : ''}`} onClick={() => setTab('membros')}>
          Membros
        </button>
        <button className={`tab-btn${tab === 'pessoas' ? ' active' : ''}`} onClick={() => setTab('pessoas')}>
          Pessoas
        </button>
      </div>

      {/* Conteúdo */}
      {tab === 'membros' && (
        <div style={{ padding: '0 16px 16px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius)' }} />)}
            </div>
          )}

          {!loading && erro && (
            <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: 16, color: 'var(--danger)', textAlign: 'center' }}>
              {erro}
              <button className="btn btn-danger" style={{ marginTop: 10 }} onClick={carregar}>Tentar novamente</button>
            </div>
          )}

          {!loading && !erro && membros.length === 0 && (
            <div className="empty-state">
              <Users size={48} className="empty-state-icon" />
              <div className="empty-state-title">Nenhum membro ainda</div>
              <div className="empty-state-desc">Convide pessoas para sua equipe usando o botão acima.</div>
            </div>
          )}

          {!loading && !erro && membros.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Gestores */}
              {gestores.length > 0 && (
                <div>
                  <div className="section-label" style={{ padding: 0, marginBottom: 10 }}>
                    <Crown size={11} style={{ marginRight: 4 }} /> Direção / Gestão
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {gestores.map(m => (
                      <CardMembro key={m.id} membro={m} canManage={false}
                        onEnviarTarefa={() => {}} onEditar={() => {}} onRemover={() => {}} />
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-gestores */}
              {subGestores.length > 0 && (
                <div>
                  <div className="section-label" style={{ padding: 0, marginBottom: 10 }}>
                    <Shield size={11} style={{ marginRight: 4 }} /> Gerentes / Líderes
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {subGestores.map(m => (
                      <CardMembro key={m.id} membro={m}
                        canManage={canManage && m.id !== user?.id}
                        onEnviarTarefa={setModalTarefa}
                        onEditar={mb => { setModalEditar(mb); setEditNome(mb.nome); setEditCargo(mb.cargo || ''); setEditRole(mb.role) }}
                        onRemover={handleRemover}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Membros */}
              {membrosList.length > 0 && (
                <div>
                  <div className="section-label" style={{ padding: 0, marginBottom: 10 }}>
                    <User size={11} style={{ marginRight: 4 }} /> Equipe / Colaboradores
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {membrosList.map(m => (
                      <CardMembro key={m.id} membro={m}
                        canManage={canManage}
                        onEnviarTarefa={setModalTarefa}
                        onEditar={mb => { setModalEditar(mb); setEditNome(mb.nome); setEditCargo(mb.cargo || ''); setEditRole(mb.role) }}
                        onRemover={handleRemover}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'pessoas' && (
        <div style={{ padding: '0 16px' }}>
          <div className="empty-state">
            <Users size={40} className="empty-state-icon" />
            <div className="empty-state-title">Contatos / Pessoas</div>
            <div className="empty-state-desc">Gerencie seus contatos na aba Pessoas do menu.</div>
          </div>
        </div>
      )}

      {/* Modal de tarefa */}
      {modalTarefa && <ModalNovaTarefa membro={modalTarefa} onClose={() => setModalTarefa(null)} />}

      {/* Modal de convite */}
      {modalConvite && <ModalConvite onClose={() => { setModalConvite(false); carregar() }} />}

      {/* Modal de edição */}
      {modalEditar && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalEditar(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Editar Membro</div>
              <button className="modal-close" onClick={() => setModalEditar(null)}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="form-input" value={editNome} onChange={e => setEditNome(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Cargo</label>
                <input className="form-input" placeholder="Ex: Gerente de Vendas" value={editCargo} onChange={e => setEditCargo(e.target.value)} />
              </div>
              {user?.role === 'gestor' && (
                <div className="form-group">
                  <label className="form-label">Nível de acesso</label>
                  <select className="form-input" value={editRole} onChange={e => setEditRole(e.target.value)}>
                    <option value="membro">Membro</option>
                    <option value="sub_gestor">Gerente / Sub-Gestor</option>
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalEditar(null)}>Cancelar</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSalvarEdicao} disabled={editLoading}>
                  {editLoading ? 'Salvando…' : <><Check size={15} /> Salvar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
