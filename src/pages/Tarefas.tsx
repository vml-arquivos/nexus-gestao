import { useState, useEffect, useCallback } from 'react'
import { Plus, CheckCircle2, Clock, AlertCircle, XCircle, Loader, ChevronDown, User, Calendar, Trash2, Edit3, Check, X, Search, MessageSquare } from 'lucide-react'
import { tarefasApi, equipeApi, type Tarefa, type MembroEquipe, type ChecklistItem } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { nanoid } from '../lib/utils'

const STATUS_CONFIG = {
  pendente:     { label: 'Pendente',      color: '#F59E0B', icon: Clock,        bg: 'rgba(245,158,11,0.12)' },
  em_progresso: { label: 'Em Progresso',  color: '#06B6D4', icon: AlertCircle,  bg: 'rgba(6,182,212,0.12)'  },
  concluida:    { label: 'Concluída',     color: '#10B981', icon: CheckCircle2, bg: 'rgba(16,185,129,0.12)' },
  cancelada:    { label: 'Cancelada',     color: '#6B7280', icon: XCircle,      bg: 'rgba(107,114,128,0.12)'},
} as const

const PRIORIDADE_CONFIG = {
  baixa: { label: 'Baixa', color: '#10B981' },
  media: { label: 'Média', color: '#F59E0B' },
  alta:  { label: 'Alta',  color: '#EF4444' },
} as const

function parseDateSafe(d?: string) {
  if (!d) return null
  const raw = String(d).trim()
  const onlyDate = raw.slice(0, 10)
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(onlyDate)
    ? new Date(`${onlyDate}T12:00:00`)
    : new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
function fmtDate(d?: string) {
  const parsed = parseDateSafe(d)
  return parsed ? parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : ''
}
function fmtDateTime(d?: string) {
  const parsed = parseDateSafe(d)
  return parsed ? parsed.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
}
function isToday(d?: string) {
  const parsed = parseDateSafe(d)
  if (!parsed) return false
  const now = new Date()
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate()
}
function isOverdue(prazo?: string) {
  const parsed = parseDateSafe(prazo)
  if (!parsed) return false
  parsed.setHours(23, 59, 59, 999)
  return parsed < new Date()
}
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:toastIn 0.2s ease;`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ── Modal de criação/edição ───────────────────────────────────────────────────
function TarefaModal({ tarefa, membros, onSave, onClose }: {
  tarefa?: Tarefa | null; membros: MembroEquipe[];
  onSave: (t: Tarefa) => void; onClose: () => void
}) {
  const [titulo, setTitulo]         = useState(tarefa?.titulo || '')
  const [descricao, setDescricao]   = useState(tarefa?.descricao || '')
  const [prazo, setPrazo]           = useState(tarefa?.prazo?.slice(0,10) || '')
  const [prioridade, setPrioridade] = useState<Tarefa['prioridade']>(tarefa?.prioridade || 'media')
  const [responsavel, setResponsavel] = useState(tarefa?.responsavel_id || '')
  const [checklist, setChecklist]   = useState<ChecklistItem[]>(tarefa?.checklist || [])
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
      const payload: Partial<Tarefa> = {
        titulo: titulo.trim(), descricao: descricao || undefined,
        prazo: prazo || undefined, prioridade,
        responsavel_id: responsavel || undefined, checklist
      }
      const saved = tarefa?.id ? await tarefasApi.update(tarefa.id, payload) : await tarefasApi.create(payload)
      onSave(saved)
      toast(tarefa?.id ? 'Tarefa atualizada!' : 'Tarefa criada!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar', 'error')
    } finally { setLoading(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 32px', width: '100%', maxWidth: 540, maxHeight: '90dvh', overflowY: 'auto', animation: 'slideUp 0.22s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{tarefa?.id ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-input" placeholder="Descreva a tarefa…" value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-input" rows={2} placeholder="Detalhes…" value={descricao} onChange={e => setDescricao(e.target.value)} style={{ resize: 'vertical', minHeight: 60 }} />
          </div>
          {/* Os campos de prazo e prioridade usam uma grade responsiva: em telas menores
             cada campo ocupa uma linha, melhorando a experiência em dispositivos móveis */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
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
          {membros.length > 0 && (
            <div className="form-group">
              <label className="form-label">Responsável</label>
              <select className="form-input" value={responsavel} onChange={e => setResponsavel(e.target.value)}>
                <option value="">Sem responsável</option>
                {membros.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.role === 'gestor' ? '👑 ' : m.role === 'sub_gestor' ? '⭐ ' : ''}{m.nome}{m.cargo ? ` · ${m.cargo}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                <button onClick={() => setChecklist(p => p.map(i => i.id === item.id ? { ...i, feito: !i.feito } : i))}
                  style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer', background: item.feito ? '#10B981' : 'transparent', border: `2px solid ${item.feito ? '#10B981' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.feito && <Check size={11} color="#fff" />}
                </button>
                <span style={{ flex: 1, fontSize: 13, textDecoration: item.feito ? 'line-through' : 'none', color: item.feito ? 'var(--text3)' : 'var(--text)' }}>{item.texto}</span>
                <button onClick={() => setChecklist(p => p.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={13} /></button>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2, gap: 8 }}>
            {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : 'Salvar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de resposta de execução ─────────────────────────────────────────────
function RespostaModal({ tarefa, onSave, onClose }: {
  tarefa: Tarefa;
  onSave: (t: Tarefa) => void;
  onClose: () => void
}) {
  const [respostaStatus, setRespostaStatus] = useState<'concluida' | 'nao_concluida'>(
    tarefa.resposta_status || 'concluida'
  )
  const [respostaObs, setRespostaObs] = useState(tarefa.resposta_obs || '')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      const updated = await tarefasApi.responder(tarefa.id, {
        resposta_status: respostaStatus,
        resposta_obs: respostaObs || undefined,
      })
      onSave(updated)
      toast('Resposta registrada!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao registrar resposta', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 28px', width: '100%', maxWidth: 460, animation: 'slideUp 0.22s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Resposta de Execução</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.5 }}>
          <strong>{tarefa.titulo}</strong>
        </p>

        {/* Resultado */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => setRespostaStatus('concluida')}
            style={{
              padding: '12px 8px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: respostaStatus === 'concluida' ? 'rgba(16,185,129,0.15)' : 'var(--bg3)',
              border: respostaStatus === 'concluida' ? '2px solid #10B981' : '2px solid var(--border)',
              color: respostaStatus === 'concluida' ? '#10B981' : 'var(--text2)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
            <CheckCircle2 size={22} />
            Concluída
          </button>
          <button
            onClick={() => setRespostaStatus('nao_concluida')}
            style={{
              padding: '12px 8px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: respostaStatus === 'nao_concluida' ? 'rgba(239,68,68,0.15)' : 'var(--bg3)',
              border: respostaStatus === 'nao_concluida' ? '2px solid #EF4444' : '2px solid var(--border)',
              color: respostaStatus === 'nao_concluida' ? '#EF4444' : 'var(--text2)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
            <XCircle size={22} />
            Não Concluída
          </button>
        </div>

        {/* Observação */}
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Observação {respostaStatus === 'nao_concluida' ? '(motivo)' : '(opcional)'}</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder={respostaStatus === 'nao_concluida' ? 'Explique o motivo de não ter concluído…' : 'Alguma observação sobre a execução…'}
            value={respostaObs}
            onChange={e => setRespostaObs(e.target.value)}
            style={{ resize: 'vertical', minHeight: 70 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2 }}>
            {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</> : 'Enviar Resposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de tarefa ─────────────────────────────────────────────────────────────
function TarefaCard({ tarefa, userId, isGestor, onStatusChange, onEdit, onDelete, onChecklistToggle, onResponder }: {
  tarefa: Tarefa; userId: string; isGestor: boolean;
  onStatusChange: (id: string, status: Tarefa['status']) => void;
  onEdit: (t: Tarefa) => void;
  onDelete: (id: string) => void;
  onChecklistToggle: (tarefa: Tarefa, itemId: string) => void;
  onResponder: (t: Tarefa) => void;
}) {
  const [expanded, setExpanded] = useState(false)
  const pc = PRIORIDADE_CONFIG[tarefa.prioridade]
  const sc = STATUS_CONFIG[tarefa.status]
  const checkTotal = tarefa.checklist?.length || 0
  const checkDone  = tarefa.checklist?.filter(i => i.feito).length || 0
  const overdue    = isOverdue(tarefa.prazo) && tarefa.status !== 'concluida'
  const isMeuaTarefa = tarefa.responsavel_id === userId
  const temResposta = !!tarefa.resposta_status

  return (
    <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px' }}>
        {/* Ícone de status */}
        <div style={{ marginTop: 2, flexShrink: 0 }}>
          {(() => { const Icon = sc.icon; return <Icon size={16} color={sc.color} /> })()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, textDecoration: tarefa.status === 'concluida' ? 'line-through' : 'none', color: tarefa.status === 'concluida' ? 'var(--text3)' : 'var(--text)' }}>{tarefa.titulo}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: pc.color, background: pc.color + '18', padding: '2px 7px', borderRadius: 99 }}>{pc.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, background: sc.bg, padding: '2px 7px', borderRadius: 99 }}>{sc.label}</span>
            {/* Badge de resposta */}
            {temResposta && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: tarefa.resposta_status === 'concluida' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: tarefa.resposta_status === 'concluida' ? '#10B981' : '#EF4444',
              }}>
                {tarefa.resposta_status === 'concluida' ? '✓ Confirmada' : '✗ Não concluída'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            {(tarefa.responsavel_nome_perfil || tarefa.responsavel_nome) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}>
                <User size={12} /> {tarefa.responsavel_nome_perfil || tarefa.responsavel_nome}
                {tarefa.responsavel_cargo && <span style={{ color: 'var(--text3)', fontSize: 11 }}> · {tarefa.responsavel_cargo}</span>}
              </span>
            )}
            {tarefa.prazo && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: overdue ? '#EF4444' : 'var(--text3)', fontWeight: overdue ? 700 : 400 }}>
                <Calendar size={12} /> {fmtDate(tarefa.prazo)}{isToday(tarefa.prazo) && ' · hoje'}{overdue && ' · vencida'}
              </span>
            )}
            {checkTotal > 0 && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{checkDone}/{checkTotal} itens</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Botão responder: aparece para o responsável da tarefa */}
          {isMeuaTarefa && tarefa.status !== 'cancelada' && (
            <button
              onClick={() => onResponder(tarefa)}
              title="Responder execução"
              style={{ background: temResposta ? 'rgba(16,185,129,0.12)' : 'none', border: temResposta ? '1px solid #10B981' : 'none', borderRadius: 6, color: temResposta ? '#10B981' : 'var(--text3)', cursor: 'pointer', padding: 6 }}>
              <MessageSquare size={15} />
            </button>
          )}
          {isGestor && (
            <>
              <button onClick={() => onEdit(tarefa)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6 }}><Edit3 size={15} /></button>
              <button onClick={() => onDelete(tarefa.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 6 }}><Trash2 size={15} /></button>
            </>
          )}
          {(tarefa.descricao || checkTotal > 0 || temResposta) && (
            <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6 }}>
              <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          )}
        </div>
      </div>

      {/* Seletor de status para membro (somente sua tarefa) */}
      {!isGestor && isMeuaTarefa && (
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6 }}>
          {(Object.keys(STATUS_CONFIG) as Tarefa['status'][]).map(s => (
            <button key={s} onClick={() => onStatusChange(tarefa.id, s)}
              style={{ flex: 1, padding: '5px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: tarefa.status === s ? STATUS_CONFIG[s].bg : 'var(--bg3)',
                border: tarefa.status === s ? `1.5px solid ${STATUS_CONFIG[s].color}` : '1px solid var(--border)',
                color: tarefa.status === s ? STATUS_CONFIG[s].color : 'var(--text3)' }}>
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      )}

      {/* Expandido */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {tarefa.descricao && <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginTop: 12, marginBottom: checkTotal > 0 ? 12 : 0 }}>{tarefa.descricao}</p>}
          {checkTotal > 0 && (
            <div>
              {tarefa.checklist!.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <button onClick={() => onChecklistToggle(tarefa, item.id)}
                    style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer', background: item.feito ? '#10B981' : 'transparent', border: `2px solid ${item.feito ? '#10B981' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.feito && <Check size={11} color="#fff" />}
                  </button>
                  <span style={{ flex: 1, fontSize: 13, textDecoration: item.feito ? 'line-through' : 'none', color: item.feito ? 'var(--text3)' : 'var(--text)' }}>{item.texto}</span>
                </div>
              ))}
              <div style={{ marginTop: 10, height: 4, background: 'var(--bg3)', borderRadius: 99 }}>
                <div style={{ height: '100%', borderRadius: 99, background: '#10B981', width: `${checkTotal > 0 ? (checkDone / checkTotal) * 100 : 0}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {/* Resposta de execução (visível para gestor/sub_gestor) */}
          {temResposta && (
            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: tarefa.resposta_status === 'concluida' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${tarefa.resposta_status === 'concluida' ? '#10B981' : '#EF4444'}30` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: tarefa.resposta_obs ? 6 : 0 }}>
                <MessageSquare size={13} color={tarefa.resposta_status === 'concluida' ? '#10B981' : '#EF4444'} />
                <span style={{ fontSize: 12, fontWeight: 700, color: tarefa.resposta_status === 'concluida' ? '#10B981' : '#EF4444' }}>
                  {tarefa.resposta_status === 'concluida' ? 'Responsável confirmou conclusão' : 'Responsável informou não conclusão'}
                </span>
                {tarefa.resposta_em && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{fmtDateTime(tarefa.resposta_em)}</span>}
              </div>
              {tarefa.resposta_obs && <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>{tarefa.resposta_obs}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Tarefas() {
  const { user } = useAuth()
  const isGestor = user?.role === 'gestor' || user?.role === 'sub_gestor'
  const [tarefas, setTarefas]       = useState<Tarefa[]>([])
  const [membros, setMembros]       = useState<MembroEquipe[]>([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarefa, setEditTarefa] = useState<Tarefa | null>(null)
  const [respostaTarefa, setRespostaTarefa] = useState<Tarefa | null>(null)
  const [filtroStatus, setFiltroStatus]       = useState('todos')
  const [filtroPrioridade, setFiltroPrioridade] = useState('todos')
  const [search, setSearch]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, m] = await Promise.all([
        tarefasApi.list(),
        isGestor ? equipeApi.membros() : Promise.resolve([]),
      ])
      setTarefas(t)
      setMembros(m)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar tarefas', 'error')
    } finally { setLoading(false) }
  }, [isGestor])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = () => { setEditTarefa(null); setModalOpen(true) }
    window.addEventListener('nexus:open-new', h)
    return () => window.removeEventListener('nexus:open-new', h)
  }, [])

  async function handleStatusChange(id: string, status: Tarefa['status']) {
    try {
      const updated = await tarefasApi.update(id, { status })
      setTarefas(p => p.map(t => t.id === id ? updated : t))
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }
  async function handleDelete(id: string) {
    if (!confirm('Excluir esta tarefa?')) return
    try {
      await tarefasApi.remove(id)
      setTarefas(p => p.filter(t => t.id !== id))
      toast('Tarefa excluída')
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }
  async function handleChecklistToggle(tarefa: Tarefa, itemId: string) {
    const newChecklist = (tarefa.checklist || []).map(i => i.id === itemId ? { ...i, feito: !i.feito } : i)
    try {
      const updated = await tarefasApi.update(tarefa.id, { checklist: newChecklist })
      setTarefas(p => p.map(t => t.id === tarefa.id ? updated : t))
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }
  function handleSaved(saved: Tarefa) {
    setTarefas(p => {
      const idx = p.findIndex(t => t.id === saved.id)
      if (idx >= 0) { const n = [...p]; n[idx] = saved; return n }
      return [saved, ...p]
    })
    setModalOpen(false); setEditTarefa(null)
  }
  function handleRespostaSaved(updated: Tarefa) {
    setTarefas(p => p.map(t => t.id === updated.id ? updated : t))
    setRespostaTarefa(null)
  }

  const filtradas = tarefas.filter(t => {
    if (filtroStatus !== 'todos' && t.status !== filtroStatus) return false
    if (filtroPrioridade !== 'todos' && t.prioridade !== filtroPrioridade) return false
    if (search && !t.titulo.toLowerCase().includes(search.toLowerCase()) &&
        !(t.responsavel_nome_perfil || t.responsavel_nome || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statsData = [
    { label: 'Total',       value: tarefas.length,                                          color: 'var(--text)' },
    { label: 'Pendentes',   value: tarefas.filter(t => t.status === 'pendente').length,      color: '#F59E0B' },
    { label: 'Em Progresso',value: tarefas.filter(t => t.status === 'em_progresso').length,  color: '#06B6D4' },
    { label: 'Concluídas',  value: tarefas.filter(t => t.status === 'concluida').length,     color: '#10B981' },
  ]

  return (
    <div style={{ padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, margin: 0 }}>Tarefas</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>{tarefas.length} tarefa{tarefas.length !== 1 ? 's' : ''}</p>
        </div>
        {isGestor && (
          <button className="btn btn-primary" onClick={() => { setEditTarefa(null); setModalOpen(true) }} style={{ gap: 6 }}>
            <Plus size={16} /> Nova
          </button>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          {statsData.map(s => (
            <div key={s.label} style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'var(--font-heading)' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Relatório rápido */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Relatório rápido</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Hoje</div>
              <div style={{ fontWeight: 900, color: '#06B6D4' }}>{tarefas.filter(t => t.status !== 'concluida' && isToday(t.prazo)).length}</div>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Urgentes</div>
              <div style={{ fontWeight: 900, color: '#EF4444' }}>{tarefas.filter(t => t.status !== 'concluida' && t.prioridade === 'alta').length}</div>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Vencidas</div>
              <div style={{ fontWeight: 900, color: '#F59E0B' }}>{tarefas.filter(t => t.status !== 'concluida' && isOverdue(t.prazo)).length}</div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar tarefas…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="em_progresso">Em Progresso</option>
            <option value="concluida">Concluída</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}>
            <option value="todos">Todas prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}>
            <Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando…
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
            <CheckCircle2 size={48} style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhuma tarefa encontrada</div>
            <div style={{ fontSize: 13 }}>{isGestor ? 'Crie uma nova tarefa acima' : 'Nenhuma tarefa atribuída a você ainda'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtradas.map(tarefa => (
              <TarefaCard
                key={tarefa.id}
                tarefa={tarefa}
                userId={user?.id || ''}
                isGestor={isGestor}
                onStatusChange={handleStatusChange}
                onEdit={t => { setEditTarefa(t); setModalOpen(true) }}
                onDelete={handleDelete}
                onChecklistToggle={handleChecklistToggle}
                onResponder={t => setRespostaTarefa(t)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <TarefaModal tarefa={editTarefa} membros={membros} onSave={handleSaved} onClose={() => { setModalOpen(false); setEditTarefa(null) }} />
      )}
      {respostaTarefa && (
        <RespostaModal tarefa={respostaTarefa} onSave={handleRespostaSaved} onClose={() => setRespostaTarefa(null)} />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(30px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  )
}
