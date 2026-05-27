import { useEffect, useMemo, useState } from 'react'
import { Plus, Loader, CheckCircle2, Clock, AlertTriangle, XCircle, Play, ThumbsUp, RotateCcw, History, Mic, MicOff, X } from 'lucide-react'
import { tarefasApi, equipeApi, type Tarefa, type MembroEquipe, type ChecklistItem } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { nanoid } from '../lib/utils'

type StatusFiltro = '' | Tarefa['status']

type ModalAcao =
  | { tipo: 'concluir'; tarefa: Tarefa }
  | { tipo: 'nao_concluida'; tarefa: Tarefa }
  | { tipo: 'devolver'; tarefa: Tarefa }
  | { tipo: 'historico'; tarefa: Tarefa }
  | null

const STATUS_LABEL: Record<Tarefa['status'], string> = {
  pendente: 'Pendente',
  em_progresso: 'Em progresso',
  concluida: 'Concluída aguardando',
  nao_concluida: 'Não concluída',
  devolvida: 'Devolvida',
  aprovada: 'Aprovada',
  cancelada: 'Cancelada',
}

const STATUS_COLOR: Record<Tarefa['status'], string> = {
  pendente: '#F59E0B',
  em_progresso: '#06B6D4',
  concluida: '#10B981',
  nao_concluida: '#EF4444',
  devolvida: '#8B5CF6',
  aprovada: '#22C55E',
  cancelada: '#6B7280',
}

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = `toast ${type}`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function fmtDate(d?: string) {
  if (!d) return 'Sem prazo'
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function Pill({ status }: { status: Tarefa['status'] }) {
  return <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '4px 8px', color: STATUS_COLOR[status], background: `${STATUS_COLOR[status]}18` }}>{STATUS_LABEL[status]}</span>
}

function MicButton({ mic }: { mic: ReturnType<typeof useSpeechToText> }) {
  return <button type="button" className={`mic-btn${mic.listening ? ' listening' : ''}`} onClick={mic.toggle} title={mic.listening ? 'Parar ditado' : 'Ditar'} style={{ width: 42, minWidth: 42 }}>{mic.listening ? <MicOff size={16} /> : <Mic size={16} />}</button>
}

function NovaTarefaModal({ membros, presetResponsavel, onClose, onSaved }: { membros: MembroEquipe[]; presetResponsavel?: string; onClose: () => void; onSaved: (t: Tarefa, manterAberto?: boolean) => void }) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState<Tarefa['prioridade']>('media')
  const [responsavel, setResponsavel] = useState(presetResponsavel || '')
  const [obs, setObs] = useState('')
  const [novoItem, setNovoItem] = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(false)
  const micTitulo = useSpeechToText(t => setTitulo(p => `${p}${p ? ' ' : ''}${t}`))
  const micDesc = useSpeechToText(t => setDescricao(p => `${p}${p ? ' ' : ''}${t}`))
  const micItem = useSpeechToText(t => setNovoItem(p => `${p}${p ? ' ' : ''}${t}`))

  function addChecklist() {
    if (!novoItem.trim()) return
    setChecklist(p => [...p, { id: nanoid(), texto: novoItem.trim(), feito: false }])
    setNovoItem('')
  }

  function reset() {
    setTitulo(''); setDescricao(''); setPrazo(''); setPrioridade('media'); setObs(''); setNovoItem(''); setChecklist([])
    if (!presetResponsavel) setResponsavel('')
  }

  async function salvar(manterAberto = false) {
    if (!titulo.trim()) { toast('Título é obrigatório.', 'error'); return }
    setLoading(true)
    try {
      const tarefa = await tarefasApi.create({ titulo, descricao, prazo, prioridade, responsavel_id: responsavel || undefined, checklist, obs })
      onSaved(tarefa, manterAberto)
      toast('Tarefa enviada com sucesso!')
      if (manterAberto) reset(); else onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar tarefa.', 'error')
    } finally { setLoading(false) }
  }

  return <div className="modal-overlay" onClick={e => e.currentTarget === e.target && onClose()}>
    <div className="modal-box" style={{ maxWidth: 620 }}>
      <div className="modal-header"><div className="modal-title">Enviar nova tarefa</div><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
      <div style={{ display: 'grid', gap: 12 }}>
        <label className="form-group"><span className="form-label">Título *</span><div style={{ display: 'flex', gap: 8 }}><input className="form-input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="O que precisa ser feito?" /><MicButton mic={micTitulo} /></div></label>
        <label className="form-group"><span className="form-label">Descrição</span><div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><textarea className="form-input" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes da tarefa" /><MicButton mic={micDesc} /></div></label>
        <div className="grid-2">
          <label className="form-group"><span className="form-label">Responsável</span><select className="form-input" value={responsavel} onChange={e => setResponsavel(e.target.value)}><option value="">Eu mesmo</option>{membros.map(m => <option key={m.id} value={m.id}>{m.nome} — {m.email}</option>)}</select></label>
          <label className="form-group"><span className="form-label">Prazo</span><input className="form-input" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} /></label>
        </div>
        <div className="grid-2">
          <label className="form-group"><span className="form-label">Prioridade</span><select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value as Tarefa['prioridade'])}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></label>
          <label className="form-group"><span className="form-label">Observação</span><input className="form-input" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação interna" /></label>
        </div>
        <div className="form-group"><span className="form-label">Checklist</span>{checklist.map(item => <div key={item.id} className="checklist-item"><CheckCircle2 size={14} /> <span style={{ flex: 1 }}>{item.texto}</span><button className="btn btn-ghost btn-icon" onClick={() => setChecklist(p => p.filter(i => i.id !== item.id))}><X size={12} /></button></div>)}<div style={{ display: 'flex', gap: 8 }}><input className="form-input" value={novoItem} onChange={e => setNovoItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChecklist()} placeholder="Item do checklist" /><MicButton mic={micItem} /><button className="btn btn-secondary" onClick={addChecklist}>Adicionar</button></div></div>
      </div>
      <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>Fechar</button><button className="btn btn-secondary" disabled={loading} onClick={() => salvar(true)}>Salvar e adicionar outra</button><button className="btn btn-primary" disabled={loading} onClick={() => salvar(false)}>{loading ? <Loader size={14} /> : <Plus size={14} />} Enviar tarefa</button></div>
    </div>
  </div>
}

function AcaoModal({ acao, onClose, onDone }: { acao: ModalAcao; onClose: () => void; onDone: (t: Tarefa) => void }) {
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(false)
  const [historico, setHistorico] = useState<any[]>([])
  const mic = useSpeechToText(t => setTexto(p => `${p}${p ? ' ' : ''}${t}`))

  useEffect(() => {
    if (acao?.tipo === 'historico') tarefasApi.historico(acao.tarefa.id).then(setHistorico).catch(() => setHistorico([]))
  }, [acao])

  if (!acao) return null
  async function executar() {
    if (!acao) return
    if ((acao.tipo === 'nao_concluida' || acao.tipo === 'devolver') && !texto.trim()) { toast('Observação obrigatória.', 'error'); return }
    setLoading(true)
    try {
      const tarefa = acao.tipo === 'concluir'
        ? await tarefasApi.setStatus(acao.tarefa.id, { status: 'concluida', observacao_conclusao: texto })
        : acao.tipo === 'nao_concluida'
          ? await tarefasApi.setStatus(acao.tarefa.id, { status: 'nao_concluida', motivo_nao_conclusao: texto })
          : await tarefasApi.devolver(acao.tarefa.id, texto)
      onDone(tarefa)
      toast('Tarefa atualizada!')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro na tarefa.', 'error')
    } finally { setLoading(false) }
  }

  const titulo = acao.tipo === 'concluir' ? 'Concluir tarefa' : acao.tipo === 'nao_concluida' ? 'Marcar como não concluída' : acao.tipo === 'devolver' ? 'Devolver com ressalva' : 'Histórico da tarefa'
  return <div className="modal-overlay" onClick={e => e.currentTarget === e.target && onClose()}>
    <div className="modal-box" style={{ maxWidth: 560 }}>
      <div className="modal-header"><div><div className="modal-title">{titulo}</div><div style={{ color: 'var(--text3)', fontSize: 12 }}>{acao.tarefa.titulo}</div></div><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
      {acao.tipo === 'historico' ? <div style={{ display: 'grid', gap: 8 }}>{historico.length === 0 ? <p style={{ color: 'var(--text3)' }}>Sem histórico registrado.</p> : historico.map(h => <div key={h.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}><strong>{h.acao}</strong><div style={{ fontSize: 12, color: 'var(--text3)' }}>{h.status_anterior || '—'} → {h.status_novo || '—'} · {h.user_nome || 'Usuário'} · {new Date(h.created_at).toLocaleString('pt-BR')}</div>{h.observacao && <div style={{ marginTop: 6 }}>{h.observacao}</div>}</div>)}</div> : <label className="form-group"><span className="form-label">{acao.tipo === 'concluir' ? 'Observação opcional' : 'Observação obrigatória'}</span><div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><textarea className="form-input" rows={4} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Digite ou use o microfone" /><MicButton mic={mic} /></div></label>}
      <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>Fechar</button>{acao.tipo !== 'historico' && <button className="btn btn-primary" disabled={loading} onClick={executar}>{loading ? <Loader size={14} /> : <CheckCircle2 size={14} />} Confirmar</button>}</div>
    </div>
  </div>
}

export default function Tarefas() {
  const { user } = useAuth()
  const isMembro = user?.role === 'membro'
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [membros, setMembros] = useState<MembroEquipe[]>([])
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [modalNova, setModalNova] = useState(false)
  const [acao, setAcao] = useState<ModalAcao>(null)
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('')
  const [filtroPrioridade, setFiltroPrioridade] = useState('')
  const [filtroMembro, setFiltroMembro] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [ts, dash, ms] = await Promise.all([tarefasApi.list(), tarefasApi.dashboard(), !isMembro ? equipeApi.membros() : Promise.resolve([])])
      setTarefas(ts); setDashboard(dash); setMembros(ms)
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao carregar tarefas.', 'error') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [user?.role])

  const filtradas = useMemo(() => tarefas.filter(t => {
    if (filtroStatus && t.status !== filtroStatus) return false
    if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false
    if (filtroMembro && t.responsavel_id !== filtroMembro) return false
    return true
  }), [tarefas, filtroStatus, filtroPrioridade, filtroMembro])

  async function iniciar(t: Tarefa) {
    try { const up = await tarefasApi.setStatus(t.id, { status: 'em_progresso' }); setTarefas(p => p.map(x => x.id === up.id ? up : x)); toast('Tarefa iniciada!') } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao iniciar.', 'error') }
  }
  async function aprovar(t: Tarefa) {
    try { const up = await tarefasApi.aprovar(t.id); setTarefas(p => p.map(x => x.id === up.id ? up : x)); toast('Tarefa aprovada!') } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao aprovar.', 'error') }
  }
  function upsert(t: Tarefa) { setTarefas(p => p.some(x => x.id === t.id) ? p.map(x => x.id === t.id ? t : x) : [t, ...p]) }

  const resumo = dashboard?.resumo || {}

  return <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 980, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      <div><h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 900 }}>{isMembro ? 'Minhas tarefas' : 'Tarefas delegadas'}</h1><p style={{ color: 'var(--text3)', fontSize: 13 }}>{isMembro ? 'Execute e responda suas tarefas' : 'Acompanhe retornos, aprove ou devolva com ressalva'}</p></div>
      <button className="btn btn-primary" onClick={() => setModalNova(true)}><Plus size={16} /> Nova tarefa</button>
    </div>

    <div className="grid-auto" style={{ marginBottom: 16 }}>
      {[['Total', resumo.total], ['Pendentes', resumo.pendentes], ['Em progresso', resumo.em_progresso], ['Aguardando aprovação', resumo.aguardando_aprovacao], ['Não concluídas', resumo.nao_concluidas], ['Devolvidas', resumo.devolvidas], ['Aprovadas', resumo.aprovadas]].map(([label, value]) => <div key={label} className="stat-card"><div style={{ color: 'var(--text3)', fontSize: 12 }}>{label}</div><div style={{ fontSize: 24, fontWeight: 900 }}>{Number(value || 0)}</div></div>)}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
      <select className="form-input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusFiltro)}><option value="">Todos os status</option>{Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s as Tarefa['status']]}</option>)}</select>
      <select className="form-input" value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}><option value="">Todas prioridades</option><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select>
      {!isMembro && <select className="form-input" value={filtroMembro} onChange={e => setFiltroMembro(e.target.value)}><option value="">Todos membros</option>{membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>}
    </div>

    {loading ? <div style={{ color: 'var(--text3)', padding: 40, textAlign: 'center' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…</div> : <div style={{ display: 'grid', gap: 12 }}>
      {filtradas.map(t => <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div style={{ minWidth: 0 }}><h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>{t.titulo}</h3><p style={{ color: 'var(--text3)', fontSize: 13 }}>{t.descricao || 'Sem descrição'}</p></div><Pill status={t.status} /></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text3)' }}><span><Clock size={13} /> Prazo: {fmtDate(t.prazo)}</span><span>Prioridade: {t.prioridade}</span>{t.responsavel_nome_perfil && <span>Responsável: {t.responsavel_nome_perfil}</span>}</div>
        {t.ressalva_gestor && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(139,92,246,.10)', color: 'var(--text2)', fontSize: 13 }}><strong>Ressalva:</strong> {t.ressalva_gestor}</div>}
        {t.motivo_nao_conclusao && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(239,68,68,.10)', fontSize: 13 }}><strong>Motivo:</strong> {t.motivo_nao_conclusao}</div>}
        {t.observacao_conclusao && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(16,185,129,.10)', fontSize: 13 }}><strong>Observação:</strong> {t.observacao_conclusao}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {isMembro ? <>
            {t.status === 'pendente' && <button className="btn btn-secondary" onClick={() => iniciar(t)}><Play size={14} /> Iniciar</button>}
            {(t.status === 'pendente' || t.status === 'em_progresso' || t.status === 'devolvida') && <button className="btn btn-primary" onClick={() => setAcao({ tipo: 'concluir', tarefa: t })}><CheckCircle2 size={14} /> {t.status === 'devolvida' ? 'Reenviar após correção' : 'Concluir'}</button>}
            {(t.status === 'pendente' || t.status === 'em_progresso') && <button className="btn btn-danger" onClick={() => setAcao({ tipo: 'nao_concluida', tarefa: t })}><XCircle size={14} /> Não concluí</button>}
          </> : <>
            {(t.status === 'concluida' || t.status === 'nao_concluida') && <button className="btn btn-primary" onClick={() => aprovar(t)}><ThumbsUp size={14} /> Aprovar</button>}
            {(t.status === 'concluida' || t.status === 'nao_concluida') && <button className="btn btn-secondary" onClick={() => setAcao({ tipo: 'devolver', tarefa: t })}><RotateCcw size={14} /> Devolver</button>}
          </>}
          <button className="btn btn-ghost" onClick={() => setAcao({ tipo: 'historico', tarefa: t })}><History size={14} /> Histórico</button>
        </div>
      </div>)}
      {filtradas.length === 0 && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 40 }}>Nenhuma tarefa encontrada.</div>}
    </div>}

    {modalNova && <NovaTarefaModal membros={membros} onClose={() => setModalNova(false)} onSaved={(t, manter) => { upsert(t); if (!manter) setModalNova(false) }} />}
    <AcaoModal acao={acao} onClose={() => setAcao(null)} onDone={upsert} />
  </div>
}
