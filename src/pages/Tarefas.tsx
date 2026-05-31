import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode, DragEvent } from 'react'
import {
  Plus, Search, Calendar, User, CheckCircle2, Clock, AlertCircle, XCircle,
  RotateCcw, Trash2, Edit3, X, Loader, MessageSquare, History, Send,
  Paperclip, Upload, Download, FileText, Copy,
} from 'lucide-react'
import { tarefasApi, equipeApi, type Tarefa, type TarefaAnexo, type MembroEquipe, type ChecklistItem } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useVisualTexts } from '../hooks/useVisualTexts'
import { isGestorLike } from '../lib/roles'
import { nanoid } from '../lib/utils'

type Priority = Tarefa['prioridade']

function canDeleteTarefa(tarefa: Tarefa, userId: string, isGestor: boolean) {
  if (isGestor) return true
  return tarefa.criado_por === userId
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pendente:      { label: 'Pendente',      color: '#F59E0B', bg: 'rgba(245,158,11,.12)', icon: Clock },
  em_progresso:  { label: 'Em progresso',  color: '#F59E0B', bg: 'rgba(245,158,11,.12)', icon: AlertCircle },
  concluida:     { label: 'Concluída',     color: '#10B981', bg: 'rgba(16,185,129,.12)', icon: CheckCircle2 },
  nao_concluida: { label: 'Não concluída', color: '#EF4444', bg: 'rgba(239,68,68,.12)', icon: XCircle },
  devolvida:     { label: 'Devolvida',     color: '#F59E0B', bg: 'rgba(245,158,11,.12)', icon: RotateCcw },
  reenviada:     { label: 'Reenviada',     color: '#10B981', bg: 'rgba(16,185,129,.12)', icon: RotateCcw },
  aprovada:      { label: 'Aprovada',      color: '#059669', bg: 'rgba(5,150,105,.12)', icon: CheckCircle2 },
  cancelada:     { label: 'Cancelada',     color: '#6B7280', bg: 'rgba(107,114,128,.12)', icon: XCircle },
}

const PRIORIDADE_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: '#10B981' },
  media: { label: 'Média', color: '#F59E0B' },
  alta: { label: 'Alta', color: '#EF4444' },
}

const ACCEPTED_EVIDENCE_TYPES = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"

function FileDropzone({
  id,
  files,
  onFiles,
  label = 'Anexar arquivos ou fotos',
  help = 'PDF, imagem, planilha, documento, TXT ou CSV.',
}: {
  id: string
  files: File[]
  onFiles: (files: File[]) => void
  label?: string
  help?: string
}) {
  const [dragActive, setDragActive] = useState(false)

  function appendFiles(list: FileList | File[]) {
    const next = Array.from(list || [])
    if (!next.length) return
    onFiles([...files, ...next])
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    appendFiles(e.dataTransfer.files)
  }

  function onDrag(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    if (e.type === 'dragleave') setDragActive(false)
  }

  return (
    <div className="task-upload-block">
      <label
        htmlFor={id}
        className={dragActive ? 'task-upload-dropzone active' : 'task-upload-dropzone'}
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
      >
        <span className="task-upload-icon"><Upload size={22} /></span>
        <span className="task-upload-title">{label}</span>
        <span className="task-upload-subtitle">Clique para anexar arquivos ou fotos, ou arraste para cá</span>
        <span className="task-upload-help">{help}</span>
      </label>
      <input
        id={id}
        className="task-upload-input"
        type="file"
        multiple
        onChange={e => { appendFiles(e.target.files || []); e.currentTarget.value = '' }}
        accept={ACCEPTED_EVIDENCE_TYPES}
      />
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((f, i) => (
            <span key={`${f.name}-${f.size}-${i}`}><Paperclip size={13} /> {f.name} {formatSize(f.size)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 18px;border-radius:12px;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.25);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function fmtDate(value?: string) {
  if (!value) return ''
  const d = new Date(String(value).slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

function fmtDateTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR')
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function checklistItemDate(item: ChecklistItem) {
  return (item.data || '').slice(0, 10)
}

function checklistDateLabel(value?: string) {
  const key = (value || '').slice(0, 10)
  if (!key) return 'Sem data definida'
  if (key === todayIso()) return `Hoje · ${fmtDate(key)}`
  return fmtDate(key)
}

function normalizeChecklistItems(items?: ChecklistItem[] | null): ChecklistItem[] {
  if (!Array.isArray(items)) return []
  return items.map(item => ({
    id: item.id || nanoid(),
    texto: item.texto || '',
    descricao: item.descricao || undefined,
    data: item.data ? String(item.data).slice(0, 10) : undefined,
    responsavel_id: item.responsavel_id || undefined,
    responsavel_nome: item.responsavel_nome || undefined,
    feito: Boolean(item.feito),
  }))
}

function checklistExecutorName(item: ChecklistItem, tarefa: Tarefa) {
  return item.responsavel_nome || tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || tarefa.criado_por_nome || 'Executor'
}

function isChecklistItemExecutor(item: ChecklistItem, tarefa: Tarefa, userId?: string) {
  if (!userId) return false
  if (item.responsavel_id) return item.responsavel_id === userId
  return tarefa.responsavel_id === userId || (!tarefa.responsavel_id && tarefa.criado_por === userId)
}

function taskHasChecklistForUser(tarefa: Tarefa, userId?: string) {
  if (!userId) return false
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => item.responsavel_id === userId)
}


function checklistProgress(items?: ChecklistItem[]) {
  const list = Array.isArray(items) ? items : []
  const total = list.length
  const done = list.filter(item => item.feito).length
  return { total, done, complete: total > 0 && done === total }
}

function checklistProgressForUser(tarefa: Tarefa, userId?: string) {
  const list = (tarefa.checklist || []).filter(item => isChecklistItemExecutor(item, tarefa, userId))
  const total = list.length
  const done = list.filter(item => item.feito).length
  return { items: list, total, done, complete: total > 0 && done === total }
}

function taskHasChecklistForOtherMember(tarefa: Tarefa, userId?: string) {
  if (!userId) return false
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => !!item.responsavel_id && item.responsavel_id !== userId)
}

function taskHasDistributedChecklist(tarefa: Tarefa) {
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => !!item.responsavel_id)
}

function visibleChecklistItems(tarefa: Tarefa, userId: string, isGestor: boolean) {
  const items = normalizeChecklistItems(tarefa.checklist)
  if (isGestor) return items
  const assigned = items.filter(item => isChecklistItemExecutor(item, tarefa, userId))
  return assigned.length ? assigned : items
}

function checklistExecutorSummary(tarefa: Tarefa) {
  const map = new Map<string, { nome: string; total: number; feitos: number }>()
  normalizeChecklistItems(tarefa.checklist).forEach(item => {
    const key = item.responsavel_id || tarefa.responsavel_id || tarefa.criado_por || 'sem-responsavel'
    const nome = checklistExecutorName(item, tarefa)
    const current = map.get(key) || { nome, total: 0, feitos: 0 }
    current.total += 1
    if (item.feito) current.feitos += 1
    map.set(key, current)
  })
  return Array.from(map.values())
}

function memberMatchesTask(tarefa: Tarefa, memberId: string) {
  return tarefa.responsavel_id === memberId || tarefa.criado_por === memberId || (tarefa.checklist || []).some(item => item.responsavel_id === memberId)
}

function taskScope(tarefa: Tarefa): 'pessoal' | 'equipe' {
  return tarefa.escopo === 'equipe' ? 'equipe' : 'pessoal'
}

function duplicateTaskVisualKey(tarefa: Tarefa) {
  // Tarefas de equipe devem aparecer como uma única entidade no painel do gestor.
  // Quando houver registros legados/repetidos com o mesmo título, descrição e prazo,
  // agrupamos visualmente sem apagar dados. O responsável principal não entra na chave
  // de tarefa da equipe, porque a execução pode estar distribuída nos checklists.
  const escopo = taskScope(tarefa)
  return [
    escopo,
    tarefa.criado_por || '',
    escopo === 'equipe' ? 'tarefa-equipe-unificada' : (tarefa.responsavel_id || ''),
    (tarefa.titulo || '').trim().toLowerCase(),
    (tarefa.descricao || '').trim().toLowerCase(),
    (tarefa.prazo || '').slice(0, 10),
    tarefa.prioridade || '',
  ].join('::')
}

function mergeChecklistVisual(base: ChecklistItem[] = [], incoming: ChecklistItem[] = []) {
  const map = new Map<string, ChecklistItem>()
  ;[...base, ...incoming].forEach(item => {
    const key = [
      (item.texto || '').trim().toLowerCase(),
      (item.data || '').slice(0, 10),
      (item.descricao || '').trim().toLowerCase(),
      item.responsavel_id || '',
    ].join('::')
    const current = map.get(key)
    if (!current) {
      map.set(key, { ...item })
    } else {
      map.set(key, {
        ...current,
        feito: Boolean(current.feito || item.feito),
        responsavel_nome: current.responsavel_nome || item.responsavel_nome,
      })
    }
  })
  return Array.from(map.values())
}

function consolidateVisualTasks(tasks: Tarefa[]) {
  const map = new Map<string, Tarefa & { __merged_count?: number }>()
  tasks.forEach(task => {
    const key = duplicateTaskVisualKey(task)
    const current = map.get(key)
    if (!current) {
      map.set(key, { ...task, checklist: normalizeChecklistItems(task.checklist), __merged_count: 1 })
      return
    }
    current.checklist = mergeChecklistVisual(current.checklist || [], normalizeChecklistItems(task.checklist))
    current.anexos_count = Number(current.anexos_count || 0) + Number(task.anexos_count || 0)
    current.__merged_count = Number(current.__merged_count || 1) + 1
    const currentUpdated = new Date(current.updated_at || current.created_at || 0).getTime()
    const taskUpdated = new Date(task.updated_at || task.created_at || 0).getTime()
    if (taskUpdated > currentUpdated) {
      current.status = task.status
      current.status_gestor = task.status_gestor
      current.updated_at = task.updated_at
    }
  })
  return Array.from(map.values())
}

function taskHasTeamExecution(tarefa: Tarefa, currentUserId?: string) {
  if (taskScope(tarefa) === 'equipe') return true
  if (!currentUserId) return !!tarefa.responsavel_id || taskHasChecklistForOtherMember(tarefa, '')
  return (!!tarefa.responsavel_id && tarefa.responsavel_id !== currentUserId) || taskHasChecklistForOtherMember(tarefa, currentUserId)
}

function assigneeOptions(membros: MembroEquipe[], user?: { id?: string; nome?: string; role?: string }) {
  const map = new Map<string, { id: string; nome: string; role?: string }>()
  if (user?.id) map.set(user.id, { id: user.id, nome: user.nome || 'Eu', role: user.role })
  membros.forEach(m => map.set(m.id, { id: m.id, nome: m.nome, role: m.role_na_equipe || m.role }))
  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function checklistMatchesMonthYear(items: ChecklistItem[] | undefined, mes: string, ano: string) {
  const list = Array.isArray(items) ? items : []
  return list.some(item => {
    const data = checklistItemDate(item)
    if (!data) return false
    if (mes !== 'todos' && getMonthValue(data) !== mes) return false
    if (ano !== 'todos' && getYearValue(data) !== ano) return false
    return true
  })
}

function formatSize(bytes?: number) {
  const n = Number(bytes || 0)
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function isOverdue(value?: string, status?: string) {
  if (!value || ['concluida', 'aprovada', 'cancelada'].includes(String(status))) return false
  const d = new Date(String(value).slice(0, 10) + 'T23:59:59')
  return !Number.isNaN(d.getTime()) && d < new Date()
}

function taskReferenceDate(tarefa: Tarefa) {
  return tarefa.prazo || tarefa.data || tarefa.created_at || ''
}

function getMonthValue(value?: string) {
  if (!value) return ''
  const d = new Date(String(value).slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return String(d.getMonth() + 1).padStart(2, '0')
}

function getYearValue(value?: string) {
  if (!value) return ''
  const d = new Date(String(value).slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return String(d.getFullYear())
}

function statusCfg(status?: string) {
  return STATUS_CONFIG[status || 'pendente'] || STATUS_CONFIG.pendente
}

function prioridadeCfg(prioridade?: string) {
  return PRIORIDADE_CONFIG[prioridade || 'media'] || PRIORIDADE_CONFIG.media
}

function ModalBase({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    document.documentElement.classList.add('modal-open')
    document.body.classList.add('modal-open')

    return () => {
      document.documentElement.classList.remove('modal-open')
      document.body.classList.remove('modal-open')
    }
  }, [])

  return (
    <div className="modal-overlay" role="presentation" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box tarefa-modal-box"
        role="dialog"
        aria-modal="true"
        data-modal="true"
        style={{ width: 'min(100%, 720px)' }}
      >
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="modal-content" data-scroll>
          {children}
        </div>
      </div>
    </div>
  )
}

function TarefaModal({ tarefa, membros, onClose, onSaved }: {
  tarefa?: Tarefa | null
  membros: MembroEquipe[]
  onClose: () => void
  onSaved: (t: Tarefa) => void
}) {
  const { user } = useAuth()
  const isGestor = isGestorLike(user?.role)
  const [titulo, setTitulo] = useState(tarefa?.titulo || '')
  const [descricao, setDescricao] = useState(tarefa?.descricao || '')
  const [prazo, setPrazo] = useState(tarefa?.prazo?.slice(0, 10) || '')
  const [prioridade, setPrioridade] = useState<Priority>(tarefa?.prioridade || 'media')
  const [tipoTarefa, setTipoTarefa] = useState<'pessoal' | 'equipe'>(() => tarefa?.id ? taskScope(tarefa) : 'pessoal')
  const [responsavelId, setResponsavelId] = useState(tarefa?.id ? (tarefa?.responsavel_id || '') : (user?.id || ''))
  const [checklist, setChecklist] = useState<ChecklistItem[]>(normalizeChecklistItems(tarefa?.checklist))
  const [novoItem, setNovoItem] = useState('')
  const [novoItemDescricao, setNovoItemDescricao] = useState('')
  const [novoItemData, setNovoItemData] = useState('')
  const [novoItemResponsavelId, setNovoItemResponsavelId] = useState('')
  const [obs, setObs] = useState(tarefa?.obs || '')
  const [loading, setLoading] = useState(false)
  const canMarkChecklistInEdit = !tarefa?.id || tarefa.responsavel_id === user?.id || (!tarefa.responsavel_id && tarefa.criado_por === user?.id)
  const responsaveisChecklist = assigneeOptions(membros, user || undefined)

  function changeTipoTarefa(next: 'pessoal' | 'equipe') {
    setTipoTarefa(next)
    if (next === 'pessoal') setResponsavelId(user?.id || '')
    if (next === 'equipe' && responsavelId === user?.id) setResponsavelId('')
  }

  function checklistResponsibleName(id?: string) {
    if (!id) return undefined
    return responsaveisChecklist.find(m => m.id === id)?.nome
  }

  function addItem() {
    if (!novoItem.trim()) return
    setChecklist(prev => [...prev, {
      id: nanoid(),
      texto: novoItem.trim(),
      descricao: novoItemDescricao.trim() || undefined,
      data: novoItemData || undefined,
      responsavel_id: novoItemResponsavelId || undefined,
      responsavel_nome: checklistResponsibleName(novoItemResponsavelId),
      feito: false,
    }])
    setNovoItem('')
    setNovoItemDescricao('')
    setNovoItemData('')
    setNovoItemResponsavelId('')
  }

  async function salvar() {
    if (loading) return
    if (!titulo.trim()) { toast('Informe o título da tarefa.', 'error'); return }
    setLoading(true)
    try {
      const payload: Partial<Tarefa> = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: isGestor ? ((tipoTarefa === 'pessoal' ? (user?.id || null) : (responsavelId || null)) as any) : user?.id,
        escopo: isGestor ? tipoTarefa : 'pessoal',
        checklist,
        obs: obs.trim() || undefined,
      }
      const saved = tarefa?.id ? await tarefasApi.update(tarefa.id, payload) : await tarefasApi.create(payload)
      onSaved(saved)
      toast(tarefa?.id ? 'Tarefa atualizada.' : 'Tarefa criada.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar tarefa.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalBase title={tarefa?.id ? 'Editar tarefa' : 'Nova tarefa'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="form-input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="O que precisa ser feito?" />
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <textarea className="form-input" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes e instruções" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Prazo</label>
            <input className="form-input" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Prioridade</label>
            <select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value as Priority)}>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </div>
        </div>
        {isGestor && (
          <div className="form-group">
            <label className="form-label">Tipo da tarefa</label>
            <div className="task-type-selector" role="radiogroup" aria-label="Tipo da tarefa">
              <button
                type="button"
                className={tipoTarefa === 'pessoal' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => changeTipoTarefa('pessoal')}
              >
                <strong>Tarefa pessoal</strong>
                <span>Minha execução, separada das tarefas do time.</span>
              </button>
              <button
                type="button"
                className={tipoTarefa === 'equipe' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => changeTipoTarefa('equipe')}
              >
                <strong>Tarefa da equipe</strong>
                <span>Controle do gestor, com ações do checklist para membros.</span>
              </button>
            </div>
          </div>
        )}
        {isGestor && tipoTarefa === 'equipe' && (
          <div className="form-group">
            <label className="form-label">Responsável principal da tarefa</label>
            <select className="form-input" value={responsavelId} onChange={e => setResponsavelId(e.target.value)}>
              <option value="">Tarefa da equipe sem responsável único</option>
              {user?.id && <option value={user.id}>Eu como responsável principal</option>}
              {membros.filter(m => m.id !== user?.id).map(m => <option key={m.id} value={m.id}>{m.nome} · {m.role}</option>)}
            </select>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>A função antiga de direcionar a tarefa para um membro continua disponível. Você também pode deixar sem responsável principal e direcionar apenas os checklists.</div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Checklist</label>
          <div className="task-checklist-builder">
            <div className="task-checklist-builder-fields">
              <div className="form-group">
                <label className="form-label">Ação do checklist</label>
                <input
                  className="form-input"
                  value={novoItem}
                  onChange={e => setNovoItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                  placeholder="Ex: Conferir contrato social"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Data desta ação</label>
                <input
                  className="form-input"
                  type="date"
                  value={novoItemData}
                  onChange={e => setNovoItemData(e.target.value)}
                  title="Data desta ação"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Executor deste checklist</label>
                <select
                  className="form-input"
                  value={novoItemResponsavelId}
                  onChange={e => setNovoItemResponsavelId(e.target.value)}
                >
                  <option value="">Usar responsável principal da tarefa</option>
                  {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}{m.role ? ` · ${m.role}` : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição/instrução da ação</label>
              <textarea
                className="form-input"
                rows={2}
                value={novoItemDescricao}
                onChange={e => setNovoItemDescricao(e.target.value)}
                placeholder="Explique como executar, onde buscar informação, padrão esperado, observações..."
              />
            </div>
            <button className="btn btn-secondary" type="button" onClick={addItem}><Plus size={16} /> Adicionar ao checklist</button>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Use data e executor para dividir a mesma tarefa em ações de dias diferentes e membros diferentes, sem criar outra tarefa.
            </div>
          </div>
          {!canMarkChecklistInEdit && checklist.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              A edição da estrutura do checklist está liberada, mas a marcação dos itens é exclusiva do executor da tarefa.
            </div>
          )}
          {checklist.map(item => (
            <div key={item.id} className="task-checklist-edit-card">
              <div className="task-checklist-edit-row">
                <button
                  type="button"
                  title={canMarkChecklistInEdit ? 'Marcar item' : 'Somente o executor pode marcar o checklist'}
                  onClick={() => {
                    if (!canMarkChecklistInEdit) return
                    setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, feito: !i.feito } : i))
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: item.feito ? '#10B981' : 'transparent',
                    cursor: canMarkChecklistInEdit ? 'pointer' : 'not-allowed',
                    opacity: canMarkChecklistInEdit ? 1 : 0.65,
                    flexShrink: 0,
                  }}
                />
                <input
                  className="form-input"
                  value={item.texto}
                  onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, texto: e.target.value } : i))}
                  placeholder="Ação do checklist"
                />
                <input
                  className="form-input"
                  type="date"
                  value={item.data || ''}
                  onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, data: e.target.value || undefined } : i))}
                  title="Data desta ação"
                />
                <select
                  className="form-input"
                  value={item.responsavel_id || ''}
                  onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, responsavel_id: e.target.value || undefined, responsavel_nome: checklistResponsibleName(e.target.value) } : i))}
                  title="Executor deste checklist"
                >
                  <option value="">Responsável principal</option>
                  {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <button type="button" onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))} style={{ background: 'none', border: 0, color: '#EF4444', padding: 6 }}><X size={14} /></button>
              </div>
              <textarea
                className="form-input"
                rows={2}
                value={item.descricao || ''}
                onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, descricao: e.target.value || undefined } : i))}
                placeholder="Descrição/instrução opcional para esta ação"
              />
            </div>
          ))}
        </div>
        <div className="form-group">
          <label className="form-label">Observação interna</label>
          <textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <div className="modal-actions" data-modal-actions style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg2)', paddingTop: 10 }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={loading} type="button">{loading ? <Loader size={14} /> : <Send size={14} />} Salvar</button>
        </div>
      </div>
    </ModalBase>
  )
}

function RespostaModal({ tarefa, onClose, onSaved }: { tarefa: Tarefa; onClose: () => void; onSaved: (t: Tarefa) => void }) {
  const [tipo, setTipo] = useState<'concluida' | 'nao_concluida'>('concluida')
  const [obs, setObs] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)


  async function salvar() {
    if (tipo === 'nao_concluida' && !obs.trim()) { toast('Informe o motivo da não conclusão.', 'error'); return }
    setLoading(true)
    try {
      const saved = await tarefasApi.updateStatus(tarefa.id, tipo === 'concluida'
        ? { status: 'concluida', observacao_conclusao: obs.trim() || undefined, resposta_membro: obs.trim() || undefined }
        : { status: 'nao_concluida', motivo_nao_conclusao: obs.trim(), resposta_membro: obs.trim() }
      )

      if (files.length > 0) {
        for (const file of files) {
          await tarefasApi.uploadAnexo(tarefa.id, file, {
            titulo: file.name || 'Anexo da tarefa',
            descricao: tipo === 'concluida' ? 'Arquivo de conclusão enviado pelo responsável.' : 'Arquivo/motivo enviado pelo responsável.',
            tipo: tipo === 'concluida' ? 'evidencia' : 'correcao',
          })
        }
      }

      onSaved(saved)
      toast(files.length > 0 ? 'Resposta e anexos enviados.' : 'Resposta enviada.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao responder.', 'error')
    } finally { setLoading(false) }
  }

  return (
    <ModalBase title="Responder tarefa" onClose={onClose}>
      <p style={{ marginTop: 0, color: 'var(--text2)' }}><strong>{tarefa.titulo}</strong></p>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <button className="btn" style={{ borderColor: tipo === 'concluida' ? '#10B981' : 'var(--border)', color: '#10B981' }} onClick={() => setTipo('concluida')} type="button"><CheckCircle2 size={16} /> Concluída</button>
        <button className="btn" style={{ borderColor: tipo === 'nao_concluida' ? '#EF4444' : 'var(--border)', color: '#EF4444' }} onClick={() => setTipo('nao_concluida')} type="button"><XCircle size={16} /> Não concluí</button>
      </div>
      <div className="form-group">
        <label className="form-label">{tipo === 'nao_concluida' ? 'Motivo obrigatório' : 'Observação opcional'}</label>
        <textarea className="form-input" rows={4} value={obs} onChange={e => setObs(e.target.value)} placeholder={tipo === 'nao_concluida' ? 'Explique o motivo...' : 'Observação sobre a conclusão...'} />
      </div>
      <div className="form-group">
        <label className="form-label">Anexar arquivo da tarefa</label>
        <FileDropzone
          id={`resposta-arquivos-${tarefa.id}`}
          files={files}
          onFiles={setFiles}
          label="Anexar arquivo da tarefa"
          help="Envie PDF, imagem, planilha, documento, TXT ou CSV para o gestor verificar o que foi feito."
        />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onClose} type="button">Cancelar</button>
        <button className="btn btn-primary" onClick={salvar} disabled={loading} type="button">{loading ? <Loader size={14} /> : <Upload size={14} />} Enviar resposta</button>
      </div>
    </ModalBase>
  )
}

function ComplementoModal({ tarefa, onClose, onSaved }: { tarefa: Tarefa; onClose: () => void; onSaved: (t: Tarefa) => void }) {
  const [complemento, setComplemento] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState<Priority>(tarefa.prioridade || 'media')
  const [loading, setLoading] = useState(false)

  async function salvar() {
    if (!complemento.trim()) { toast('Informe o complemento que o membro deve executar.', 'error'); return }
    setLoading(true)
    try {
      const saved = await tarefasApi.reabrir(tarefa.id, {
        complemento: complemento.trim(),
        prazo: prazo || undefined,
        prioridade,
      })
      onSaved(saved)
      toast('Complemento solicitado. A tarefa voltou para pendente.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao solicitar complemento.', 'error')
    } finally { setLoading(false) }
  }

  return (
    <ModalBase title="Solicitar complemento na tarefa" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg3)', padding: 12 }}>
          <div style={{ fontWeight: 500 }}>{tarefa.titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Use essa opção para continuar a mesma tarefa sem criar cards soltos. O membro receberá a tarefa novamente como pendente.
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">O que precisa ser feito agora? *</label>
          <textarea className="form-input" rows={5} value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Ex.: complementar documentação, anexar novo comprovante, refazer uma parte, enviar nova versão..." />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Novo prazo</label>
            <input className="form-input" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Prioridade</label>
            <select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value as Priority)}>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={loading} type="button">{loading ? <Loader size={14} /> : <RotateCcw size={14} />} Solicitar complemento</button>
        </div>
      </div>
    </ModalBase>
  )
}

function HistoricoModal({ tarefa, onClose }: { tarefa: Tarefa; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    tarefasApi.historico(tarefa.id).then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }, [tarefa.id])
  return (
    <ModalBase title="Histórico da tarefa" onClose={onClose}>
      {loading ? <p>Carregando...</p> : items.length === 0 ? <p style={{ color: 'var(--text3)' }}>Nenhum histórico registrado.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((h, i) => <div key={h.id || i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg3)' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{h.acao}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{h.usuario_nome || h.user_id} · {h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}</div>
            {h.observacao && <div style={{ fontSize: 13, marginTop: 4 }}>{h.observacao}</div>}
          </div>)}
        </div>
      )}
    </ModalBase>
  )
}

function AnexosModal({ tarefa, onClose, onChanged }: { tarefa: Tarefa; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth()
  const isGestor = isGestorLike(user?.role)
  const [anexos, setAnexos] = useState<TarefaAnexo[]>([])
  const [descricao, setDescricao] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showGestorUpload, setShowGestorUpload] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setAnexos(await tarefasApi.anexos(tarefa.id)) }
    catch { setAnexos([]) }
    finally { setLoading(false) }
  }, [tarefa.id])

  useEffect(() => { load() }, [load])


  async function enviar() {
    if (files.length === 0) { toast('Selecione pelo menos um arquivo.', 'error'); return }
    setSaving(true)
    try {
      for (const file of files) {
        await tarefasApi.uploadAnexo(tarefa.id, file, {
          titulo: file.name || 'Anexo da tarefa',
          descricao: descricao.trim() || undefined,
          tipo: isGestor ? 'referencia' : 'evidencia',
        })
      }
      setDescricao('')
      setFiles([])
      setShowGestorUpload(false)
      await load()
      onChanged?.()
      toast(isGestor ? 'Arquivo do gestor enviado.' : 'Arquivo enviado.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao anexar arquivo.', 'error')
    } finally { setSaving(false) }
  }

  async function apagar(anexo: TarefaAnexo) {
    if (!confirm('Apagar este arquivo da tarefa?')) return
    try {
      await tarefasApi.deleteAnexo(tarefa.id, anexo.id)
      setAnexos(prev => prev.filter(a => a.id !== anexo.id))
      onChanged?.()
      toast('Arquivo apagado.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao apagar arquivo.', 'error')
    }
  }

  async function abrirArquivo(anexo: TarefaAnexo) {
    try {
      const { blob } = await tarefasApi.arquivoAnexo(tarefa.id, anexo.id, false)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao abrir arquivo.', 'error')
    }
  }

  async function baixarArquivo(anexo: TarefaAnexo) {
    try {
      const { blob, filename } = await tarefasApi.arquivoAnexo(tarefa.id, anexo.id, true)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || anexo.nome_original || anexo.titulo || 'arquivo-da-tarefa'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao baixar arquivo.', 'error')
    }
  }

  const anexosDoMembro = anexos.filter(a => a.enviado_por !== tarefa.criado_por)
  const anexosDoGestor = anexos.filter(a => a.enviado_por === tarefa.criado_por)

  const uploadForm = (
    <div style={{ display: 'grid', gap: 12, border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--bg3)' }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Selecionar arquivos</label>
        <FileDropzone
          id={`anexos-tarefa-${tarefa.id}`}
          files={files}
          onFiles={setFiles}
          label={isGestor ? 'Anexar arquivo de referência' : 'Anexar arquivo da tarefa'}
          help={isGestor ? 'Use PDF, imagem ou documento para referência, validação ou orientação.' : 'Use PDF, foto, comprovante, planilha ou documento da execução.'}
        />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Descrição do anexo</label>
        <textarea className="form-input" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder={isGestor ? 'Ex.: referência, validação ou orientação...' : 'Ex.: foto do serviço finalizado, comprovante, relatório entregue...'} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" type="button" onClick={enviar} disabled={saving}>{saving ? <Loader size={14} /> : <Upload size={14} />} {isGestor ? 'Enviar arquivo do gestor' : 'Enviar arquivo'}</button>
      </div>
    </div>
  )

  function renderLista(items: TarefaAnexo[], emptyText: string) {
    if (loading) return <div style={{ color: 'var(--text3)' }}>Carregando...</div>
    if (items.length === 0) return <div style={{ color: 'var(--text3)', fontSize: 13, padding: 14, border: '1px dashed var(--border)', borderRadius: 12 }}>{emptyText}</div>
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(anexo => (
          <div key={anexo.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--bg2)', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere', display: 'flex', gap: 6, alignItems: 'center' }}><FileText size={14} /> {anexo.titulo || anexo.nome_original || 'Anexo'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{anexo.enviado_por_nome || anexo.enviado_por} · {fmtDateTime(anexo.created_at)} {anexo.tamanho ? `· ${formatSize(anexo.tamanho)}` : ''}</div>
                {anexo.descricao && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{anexo.descricao}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" type="button" onClick={() => abrirArquivo(anexo)} style={{ padding: '6px 10px', fontSize: 12 }}><FileText size={13} /> Visualizar</button>
                <button className="btn btn-secondary" type="button" onClick={() => baixarArquivo(anexo)} style={{ padding: '6px 10px', fontSize: 12 }}><Download size={13} /> Baixar</button>
                <button className="btn btn-ghost" type="button" onClick={() => apagar(anexo)} style={{ padding: '6px 10px', fontSize: 12, color: '#EF4444' }}><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <ModalBase title="Arquivos da tarefa" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--bg3)' }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{tarefa.titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {isGestor
              ? 'Confira aqui os arquivos enviados pelos membros e acompanhe a execução da tarefa.'
              : 'Aqui ficam os arquivos já enviados. Para anexar e concluir tudo de uma vez, abra a tarefa completa e use Enviar conclusão.'}
          </div>
        </div>

        {isGestor ? (
          <>
            <section style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 500 }}>Arquivos enviados pelo membro</div>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{anexosDoMembro.length} arquivo(s)</span>
              </div>
              {renderLista(anexosDoMembro, 'O membro ainda não enviou nenhum arquivo para esta tarefa.')}
            </section>

            <section style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Anexos do gestor</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Opcional: use para referência, validação ou devolução.</div>
                </div>
                <button className="btn btn-secondary" type="button" onClick={() => setShowGestorUpload(v => !v)}><Paperclip size={14} /> {showGestorUpload ? 'Ocultar envio' : 'Adicionar anexo'}</button>
              </div>
              {showGestorUpload && uploadForm}
              {renderLista(anexosDoGestor, 'Nenhum arquivo do gestor.')}
            </section>
          </>
        ) : (
          <>
            <div style={{ color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, fontSize: 13 }}>
              Para enviar novos arquivos, abra a tarefa completa, selecione os arquivos e clique em <strong>Enviar conclusão</strong>. Assim os arquivos e a resposta seguem juntos para o gestor.
            </div>
            <section style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Arquivos enviados</div>
              {renderLista(anexos, 'Nenhum anexo enviado ainda.')}
            </section>
          </>
        )}
      </div>
    </ModalBase>
  )
}


function TarefaDetalheModal({ tarefa, isGestor, userId, onClose, onSaved, onAnexos, onResponder, onApprove, onReturn, onComplemento }: {
  tarefa: Tarefa
  isGestor: boolean
  userId: string
  onClose: () => void
  onSaved: (t: Tarefa) => void
  onAnexos: (t: Tarefa) => void
  onResponder: (t: Tarefa) => void
  onApprove: (t: Tarefa) => void
  onReturn: (t: Tarefa) => void
  onComplemento: (t: Tarefa) => void
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(normalizeChecklistItems(tarefa.checklist))
  const [obs, setObs] = useState(tarefa.observacao_conclusao || tarefa.resposta_membro || '')
  const [motivo, setMotivo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const anexosCount = Number((tarefa as any).anexos_count || 0)
  const isResponsavel = tarefa.responsavel_id === userId
  const isCriador = tarefa.criado_por === userId
  const isCriadorSemResponsavel = !tarefa.responsavel_id && isCriador
  const isTaskFinalizada = ['aprovada', 'cancelada'].includes(tarefa.status)

  // Checklist marcável somente pelo executor real da tarefa.
  // Gestor/admin/dev conferem, aprovam e devolvem, mas não marcam execução de outra pessoa.
  const hasChecklistForMe = checklist.some(item => isChecklistItemExecutor(item, tarefa, userId))
  const myProgress = checklistProgressForUser({ ...tarefa, checklist }, userId)
  const geralProgress = checklistProgress(checklist)
  const distributedTask = taskHasDistributedChecklist({ ...tarefa, checklist })
  const canExecuteTask = (isResponsavel || isCriadorSemResponsavel || hasChecklistForMe) && !isTaskFinalizada
  const canToggleChecklist = canExecuteTask && !isTaskFinalizada
  const canReviewTask = isGestor && !canExecuteTask
  const allChecklistDone = geralProgress.total === 0 || geralProgress.complete
  const myChecklistDone = myProgress.total === 0 || myProgress.complete
  const displayChecklist = visibleChecklistItems({ ...tarefa, checklist }, userId, isGestor)
  const executorSummary = checklistExecutorSummary({ ...tarefa, checklist })

  async function persistChecklist(next: ChecklistItem[]) {
    setChecklist(next)
    try {
      const saved = await tarefasApi.update(tarefa.id, { checklist: next })
      onSaved(saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar checklist.', 'error')
    }
  }

  function toggleCheck(id: string) {
    const item = checklist.find(i => i.id === id)
    if (!item || !isChecklistItemExecutor(item, tarefa, userId) || isTaskFinalizada) {
      toast('Apenas o executor deste checklist pode marcar este item.', 'error')
      return
    }
    const next = checklist.map(item => item.id === id ? { ...item, feito: !item.feito } : item)
    persistChecklist(next)
  }

  async function copiarChecklist() {
    if (!checklist.length) {
      toast('Esta tarefa não possui checklist para copiar.', 'error')
      return
    }

    const texto = [
      `Checklist da tarefa: ${tarefa.titulo}`,
      ...checklist.map((item, index) => `${index + 1}. ${item.feito ? '[x]' : '[ ]'} ${item.texto}${item.data ? `\n   Data: ${fmtDate(item.data)}` : ''}${(item.responsavel_nome || tarefa.responsavel_nome_perfil || tarefa.responsavel_nome) ? `\n   Executor: ${checklistExecutorName(item, tarefa)}` : ''}${item.descricao ? `\n   Como executar: ${item.descricao}` : ''}`),
    ].join('\n')

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto)
      } else {
        const area = document.createElement('textarea')
        area.value = texto
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.focus()
        area.select()
        document.execCommand('copy')
        area.remove()
      }
      toast('Checklist copiado.')
    } catch {
      toast('Não foi possível copiar o checklist.', 'error')
    }
  }

  async function uploadPendentes() {
    for (const file of files) {
      await tarefasApi.uploadAnexo(tarefa.id, file, {
        titulo: file.name || 'Arquivo da tarefa',
        descricao: obs.trim() || motivo.trim() || undefined,
        tipo: 'evidencia',
      })
    }
  }

  async function concluir() {
    setSaving(true)
    try {
      if (files.length) await uploadPendentes()
      if (total > 0) {
        const result = await tarefasApi.registrarParte(tarefa.id, obs.trim() || undefined)
        if (result.tarefa) onSaved(result.tarefa)
        toast(result.completa
          ? 'Todas as partes foram concluídas. O gestor foi notificado para visualizar a tarefa.'
          : 'Sua parte foi enviada ao gestor. A tarefa segue aberta até o restante da equipe concluir.'
        )
        onClose()
        return
      }
      const saved = await tarefasApi.updateStatus(tarefa.id, {
        status: 'concluida',
        observacao_conclusao: obs.trim() || undefined,
        resposta_membro: obs.trim() || undefined,
      })
      onSaved(saved)
      toast('Tarefa enviada para conferência do gestor.')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao enviar sua parte.', 'error')
    } finally { setSaving(false) }
  }

  async function naoConcluir() {
    if (!motivo.trim()) { toast('Informe o motivo para não concluir.', 'error'); return }
    setSaving(true)
    try {
      if (files.length) await uploadPendentes()
      const saved = await tarefasApi.updateStatus(tarefa.id, {
        status: 'nao_concluida',
        motivo_nao_conclusao: motivo.trim(),
        resposta_membro: motivo.trim(),
      })
      onSaved(saved)
      toast('Retorno enviado ao gestor.')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao enviar retorno.', 'error')
    } finally { setSaving(false) }
  }

  async function reenviarCorrecao() {
    setSaving(true)
    try {
      if (files.length) await uploadPendentes()
      const saved = await tarefasApi.reenviar(tarefa.id, obs.trim() || 'Correção reenviada para conferência.')
      onSaved(saved)
      toast('Correção reenviada ao gestor.')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao reenviar correção.', 'error')
    } finally { setSaving(false) }
  }

  const done = checklist.filter(i => i.feito).length
  const total = checklist.length
  const percent = total ? Math.round((done / total) * 100) : 0
  const displayDone = displayChecklist.filter(i => i.feito).length
  const displayTotal = displayChecklist.length
  const checklistByDate = displayChecklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const key = checklistItemDate(item) || 'sem-data'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
  const checklistDateKeys = Object.keys(checklistByDate).sort((a, b) => {
    if (a === 'sem-data') return 1
    if (b === 'sem-data') return -1
    return a.localeCompare(b)
  })

  return (
    <ModalBase title="Tarefa" onClose={onClose}>
      <div className="task-detail-modal">
        <section className="task-detail-hero">
          <div>
            <h2>{tarefa.titulo}</h2>
            <div className="task-detail-meta">
              {tarefa.prazo && <span><Calendar size={14} /> Prazo: {fmtDate(tarefa.prazo)}</span>}
              <span style={{ color: prioridadeCfg(tarefa.prioridade).color }}>{prioridadeCfg(tarefa.prioridade).label}</span>
              <span>{statusCfg(tarefa.status).label}</span>
            </div>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => onAnexos(tarefa)}><Paperclip size={14} /> Arquivos {anexosCount ? `(${anexosCount})` : ''}</button>
        </section>

        {tarefa.descricao && (
          <section className="task-detail-section">
            <h3>Orientações</h3>
            <p>{tarefa.descricao}</p>
          </section>
        )}

        {tarefa.obs && (
          <section className="task-detail-section">
            <h3>Observações internas</h3>
            <p>{tarefa.obs}</p>
          </section>
        )}

        <section className="task-detail-section">
          <div className="task-detail-section-head">
            <h3>Passos da tarefa</h3>
            <div className="task-checklist-head-actions">
              {total > 0 && (
                <button className="btn btn-secondary btn-sm" type="button" onClick={copiarChecklist}>
                  <Copy size={14} /> Copiar passos
                </button>
              )}
              <strong>{isGestor ? `${done}/${total}` : `${displayDone}/${displayTotal}`} feitos · {percent}% geral</strong>
            </div>
          </div>
          {displayTotal > 0 ? (
            <div className="task-checklist-run">
              {checklistDateKeys.map(dateKey => (
                <div key={dateKey} className="task-checklist-date-group">
                  <div className="task-checklist-date-title">
                    <Calendar size={13} /> {checklistDateLabel(dateKey === 'sem-data' ? undefined : dateKey)}
                  </div>
                  {checklistByDate[dateKey].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.feito ? 'task-check-item done' : 'task-check-item'}
                      disabled={!canToggleChecklist || !isChecklistItemExecutor(item, tarefa, userId) || saving}
                      onClick={() => toggleCheck(item.id)}
                      aria-pressed={!!item.feito}
                    >
                      <span className="task-check-box" aria-hidden="true">{item.feito ? '✓' : ''}</span>
                      <span className="task-check-content">
                        <span className="task-check-text">{item.texto}</span>
                        <span className="task-check-desc"><User size={12} /> Executor: {checklistExecutorName(item, tarefa)}</span>
                        {item.descricao && <span className="task-check-desc">{item.descricao}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{isGestor ? 'Esta tarefa não possui checklist.' : 'Nenhuma parte desta tarefa está atribuída a você.'}</p>
          )}
          {total > 0 && (
            <div className="task-execution-summary">
              <strong>Fluxo da tarefa:</strong> cada membro conclui somente seus checklists e envia sua parte. O gestor é notificado para visualizar os arquivos enviados, sem etapa de aprovar/reprovar por checklist.
              {myProgress.total > 0 && <span>Sua parte: {myProgress.done}/{myProgress.total} checklists.</span>}
              <span>Total da tarefa: {done}/{total} checklists.</span>
              {isGestor && executorSummary.length > 0 && <span>Execução por membro: {executorSummary.map(e => `${e.nome} ${e.feitos}/${e.total}`).join(' · ')}</span>}
            </div>
          )}
          {total > 0 && !canToggleChecklist && (
            <p className="muted" style={{ marginTop: 8 }}>Checklist bloqueado. Cada item só pode ser marcado pelo executor definido nele; se não houver executor no item, vale o responsável principal da tarefa.</p>
          )}
        </section>

        {canExecuteTask && (
          <section className="task-detail-section">
            <h3>{allChecklistDone ? 'Arquivos da conclusão geral' : 'Arquivos da sua parte'}</h3>
            <FileDropzone
              id={`concluir-evidencias-${tarefa.id}`}
              files={files}
              onFiles={setFiles}
              label={allChecklistDone ? 'Anexar arquivos da conclusão geral' : 'Anexar arquivos da sua parte'}
              help="Fotos, PDFs, comprovantes, planilhas ou documentos que comprovem a execução."
            />
            <label className="form-label">Observação de conclusão</label>
            <textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: executei os itens marcados e anexei os comprovantes..." />
            <label className="form-label">Motivo caso não tenha concluído</label>
            <textarea className="form-input" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Obrigatório somente se clicar em Não concluí." />
          </section>
        )}

        {tarefa.ressalva_gestor && (
          <section className="task-detail-section warning-box">
            <h3>Ressalva do gestor</h3>
            <p>{tarefa.ressalva_gestor}</p>
          </section>
        )}

        <div className="modal-actions task-detail-actions" data-modal-actions>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Fechar</button>
          {canReviewTask && !distributedTask && tarefa.status === 'concluida' && <button className="btn btn-primary" type="button" onClick={() => onApprove(tarefa)}>Aprovar</button>}
          {canReviewTask && !distributedTask && ['concluida', 'nao_concluida'].includes(tarefa.status) && <button className="btn btn-secondary" type="button" onClick={() => onReturn(tarefa)}>Devolver</button>}
          {canReviewTask && (tarefa.status === 'aprovada' || (distributedTask && tarefa.status === 'concluida')) && <button className="btn btn-secondary" type="button" onClick={() => onComplemento(tarefa)}>Complementar</button>}
          {canExecuteTask && tarefa.status === 'devolvida' && <button className="btn btn-primary" type="button" onClick={reenviarCorrecao} disabled={saving}>{saving ? <Loader size={14} /> : <RotateCcw size={14} />} Reenviar correção</button>}
          {canExecuteTask && tarefa.status !== 'devolvida' && <button className="btn btn-secondary" type="button" onClick={naoConcluir} disabled={saving}>Não concluí</button>}
          {canExecuteTask && tarefa.status !== 'devolvida' && <button className="btn btn-primary" type="button" onClick={concluir} disabled={saving}>{saving ? <Loader size={14} /> : <CheckCircle2 size={14} />} {allChecklistDone ? 'Enviar tarefa' : myChecklistDone ? 'Enviar minha parte' : 'Enviar minha parte'}</button>}
        </div>
      </div>
    </ModalBase>
  )
}

function TarefaCard({ tarefa, userId, isGestor, onOpen, onEdit, onDelete, onStart, onResponder, onApprove, onReturn, onComplemento, onHistory, onAnexos }: {
  tarefa: Tarefa
  userId: string
  isGestor: boolean
  onOpen: (t: Tarefa) => void
  onEdit: (t: Tarefa) => void
  onDelete: (id: string) => void
  onStart: (t: Tarefa) => void
  onResponder: (t: Tarefa) => void
  onApprove: (t: Tarefa) => void
  onReturn: (t: Tarefa) => void
  onComplemento: (t: Tarefa) => void
  onHistory: (t: Tarefa) => void
  onAnexos: (t: Tarefa) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sc = statusCfg(tarefa.status)
  const pc = prioridadeCfg(tarefa.prioridade)
  const Icon = sc.icon
  const distributedTask = taskHasDistributedChecklist(tarefa)
  const checklistForCard = visibleChecklistItems(tarefa, userId, isGestor)
  const checkTotal = checklistForCard.length
  const checkDone = checklistForCard.filter(i => i.feito).length
  const geralProgress = checklistProgress(tarefa.checklist)
  const executorSummary = checklistExecutorSummary(tarefa)
  const overdue = isOverdue(tarefa.prazo, tarefa.status)
  const anexosCount = Number((tarefa as any).anexos_count || 0)
  const isResponsavel = tarefa.responsavel_id === userId
  const isCriador = tarefa.criado_por === userId
  const isCriadorSemResponsavel = !tarefa.responsavel_id && isCriador
  const isTaskFinalizada = ['aprovada', 'cancelada'].includes(tarefa.status)

  // Checklist marcável somente pelo executor real da tarefa.
  // Gestor/admin/dev conferem, aprovam e devolvem, mas não marcam execução de outra pessoa.
  const hasChecklistForMe = taskHasChecklistForUser(tarefa, userId)
  const canExecuteTask = (isResponsavel || isCriadorSemResponsavel || hasChecklistForMe) && !isTaskFinalizada
  const canReviewTask = isGestor && !canExecuteTask
  const ultimaEvidencia = (tarefa as any).ultima_evidencia_em as string | undefined

  return (
    <article className="task-card" onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return; onOpen(tarefa) }} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ display: 'flex', gap: 12, padding: 14, alignItems: 'flex-start' }}>
        <Icon size={18} color={sc.color} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14, overflowWrap: 'anywhere', textDecoration: tarefa.status === 'aprovada' ? 'line-through' : 'none' }}>{tarefa.titulo}</strong>
            <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, background: sc.bg, padding: '2px 8px', borderRadius: 99 }}>{sc.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: pc.color, background: `${pc.color}18`, padding: '2px 8px', borderRadius: 99 }}>{pc.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>
            <span><User size={12} /> {tarefa.responsavel_id ? (tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'Responsável') : taskScope(tarefa) === 'equipe' ? 'Tarefa da equipe' : 'Tarefa pessoal'}</span>
            {tarefa.prazo && <span style={{ color: overdue ? '#EF4444' : undefined, fontWeight: overdue ? 800 : 500 }}><Calendar size={12} /> {fmtDate(tarefa.prazo)}{overdue ? ' · vencida' : ''}</span>}
            {checkTotal > 0 && <span>{checkDone}/{checkTotal} checklist{!isGestor && geralProgress.total !== checkTotal ? ' da sua parte' : ''}</span>}
          </div>
          {tarefa.descricao && <div style={{ marginTop: 8, color: 'var(--text2)', fontSize: 13, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{tarefa.descricao}</div>}
          {checkTotal > 0 && <div className="task-progress-line"><span style={{ width: `${Math.max(6, Math.round((checkDone / Math.max(checkTotal, 1)) * 100))}%` }} /></div>}
          {tarefa.ressalva_gestor && <div style={{ marginTop: 8, color: 'var(--info)', background: 'var(--info-dim)', padding: 8, borderRadius: 8, fontSize: 12 }}><strong>Ressalva:</strong> {tarefa.ressalva_gestor}</div>}
          {(tarefa.motivo_nao_conclusao || tarefa.observacao_conclusao || tarefa.resposta_obs) && <div style={{ marginTop: 8, color: 'var(--text2)', background: 'var(--bg3)', padding: 8, borderRadius: 8, fontSize: 12 }}><strong>Resposta:</strong> {tarefa.motivo_nao_conclusao || tarefa.observacao_conclusao || tarefa.resposta_obs}</div>}
          {distributedTask && isGestor && executorSummary.length > 0 && <div className="task-team-summary"><strong>Execução da equipe:</strong> {executorSummary.map(e => `${e.nome} ${e.feitos}/${e.total}`).join(' · ')}</div>}
          {Number((tarefa as any).__merged_count || 1) > 1 && <div style={{ marginTop: 8, color: 'var(--text2)', background: 'var(--info-dim)', border: '1px solid var(--border)', padding: 8, borderRadius: 8, fontSize: 12 }}><strong>Tarefa única no painel:</strong> registros repetidos/legados foram agrupados visualmente. Os checklists ficam centralizados neste cartão.</div>}
          {canReviewTask && ['concluida', 'nao_concluida', 'devolvida', 'aprovada'].includes(tarefa.status) && (
            <button
              type="button"
              onClick={() => onAnexos(tarefa)}
              style={{
                marginTop: 8,
                width: '100%',
                textAlign: 'left',
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: anexosCount > 0 ? 'rgba(16,185,129,.10)' : 'var(--bg3)',
                color: 'var(--text2)',
                padding: 10,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'space-between',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Paperclip size={14} />
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{anexosCount > 0 ? 'Arquivos recebidos' : 'Nenhum arquivo anexado'}</strong>
                  {anexosCount > 0 ? ` · ${anexosCount} arquivo(s)` : ' · clique para visualizar ou baixar'}
                  {ultimaEvidencia ? ` · último envio ${fmtDateTime(ultimaEvidencia)}` : ''}
                </span>
              </span>
              <span style={{ color: '#10B981', fontWeight: 600, whiteSpace: 'nowrap' }}>Verificar</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button title="Anexos" onClick={() => onAnexos(tarefa)} style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer' }}><Paperclip size={15} /></button>
          <button title="Histórico" onClick={() => onHistory(tarefa)} style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer' }}><History size={15} /></button>
          {isGestor && <button title="Editar" onClick={() => onEdit(tarefa)} style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer' }}><Edit3 size={15} /></button>}
          {canDeleteTarefa(tarefa, userId, isGestor) && <button title="Apagar" onClick={() => onDelete(tarefa.id)} style={{ background: 'none', border: 0, color: '#EF4444', cursor: 'pointer' }}><Trash2 size={15} /></button>}
          {(tarefa.descricao || checkTotal > 0) && <button title="Detalhes" onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer' }}><MessageSquare size={15} /></button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => onOpen(tarefa)} type="button">Abrir tarefa</button>
        <button className="btn btn-secondary" onClick={() => onAnexos(tarefa)} type="button"><Paperclip size={14} /> {isGestor ? 'Ver arquivos' : 'Anexar arquivo'}</button>
        {canExecuteTask && ['pendente', 'devolvida'].includes(tarefa.status) && <button className="btn btn-secondary" onClick={() => onStart(tarefa)} type="button">Iniciar</button>}
        {canExecuteTask && !['aprovada', 'cancelada'].includes(tarefa.status) && <button className="btn btn-primary" onClick={() => onOpen(tarefa)} type="button">Abrir e executar</button>}
        {canReviewTask && !distributedTask && tarefa.status === 'concluida' && <button className="btn btn-primary" onClick={() => onApprove(tarefa)} type="button">Aprovar</button>}
        {canReviewTask && !distributedTask && ['concluida', 'nao_concluida'].includes(tarefa.status) && <button className="btn btn-secondary" onClick={() => onReturn(tarefa)} type="button">Devolver</button>}
        {canReviewTask && (tarefa.status === 'aprovada' || (distributedTask && tarefa.status === 'concluida')) && <button className="btn btn-secondary" onClick={() => onComplemento(tarefa)} type="button"><RotateCcw size={14} /> Complementar</button>}
      </div>

      {expanded && <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
        {tarefa.descricao && <p style={{ marginTop: 0, color: 'var(--text2)' }}>{tarefa.descricao}</p>}
        {tarefa.obs && <div style={{ margin: '8px 0', color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 13, whiteSpace: 'pre-wrap' }}><strong>Complementos/observações:</strong><br />{tarefa.obs}</div>}
        {checkTotal > 0 && checklistForCard.map(i => <div key={i.id} style={{ display: 'grid', gap: 3, padding: '7px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span>{i.feito ? '✅' : '⬜'}</span><strong>{i.texto}</strong></div>
          <div style={{ color: 'var(--text3)', fontSize: 12, paddingLeft: 24 }}>
            {i.data ? `${fmtDate(i.data)} · ` : ''}Executor: {checklistExecutorName(i, tarefa)}
          </div>
          {i.descricao && <div style={{ color: 'var(--text2)', fontSize: 12, paddingLeft: 24 }}>{i.descricao}</div>}
        </div>)}
      </div>}
    </article>
  )
}

export default function Tarefas() {
  const { user } = useAuth()
  const { t } = useVisualTexts()
  const location = useLocation()
  const navigate = useNavigate()
  const isGestor = isGestorLike(user?.role)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [membros, setMembros] = useState<MembroEquipe[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [edit, setEdit] = useState<Tarefa | null>(null)
  const [responder, setResponder] = useState<Tarefa | null>(null)
  const [historico, setHistorico] = useState<Tarefa | null>(null)
  const [anexos, setAnexos] = useState<Tarefa | null>(null)
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null)
  const [complemento, setComplemento] = useState<Tarefa | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('todos')
  const [prioridade, setPrioridade] = useState('todos')
  const [membroFiltro, setMembroFiltro] = useState('todos')
  const [mesFiltro, setMesFiltro] = useState('todos')
  const [anoFiltro, setAnoFiltro] = useState('todos')
  const [escopo, setEscopo] = useState<'pessoais' | 'equipe' | 'todas' | 'recentes'>('pessoais')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ts, ms] = await Promise.all([
        tarefasApi.list(),
        isGestor ? equipeApi.membros() : Promise.resolve([]),
      ])
      setTarefas(Array.isArray(ts) ? ts : [])
      setMembros(Array.isArray(ms) ? ms : [])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar tarefas.', 'error')
    } finally { setLoading(false) }
  }, [isGestor])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('task')
    if (!id || tarefas.length === 0) return
    const found = tarefas.find(t => t.id === id)
    if (found) setDetalhe(found)
  }, [location.search, tarefas])
  useEffect(() => {
    const h = () => { setEdit(null); setModalOpen(true) }
    window.addEventListener('nexus:open-new', h)
    return () => window.removeEventListener('nexus:open-new', h)
  }, [])

  const tarefasVisiveis = useMemo(() => consolidateVisualTasks(tarefas), [tarefas])

  const isPersonalTask = useCallback((t: Tarefa) => {
    const uid = user?.id || ''
    if (!uid) return false
    const executorForMe = t.responsavel_id === uid || taskHasChecklistForUser(t, uid)
    if (taskScope(t) === 'equipe') return executorForMe
    return executorForMe || (!t.responsavel_id && t.criado_por === uid)
  }, [user?.id])

  const isTeamAssignedTask = useCallback((t: Tarefa) => {
    const uid = user?.id || ''
    if (!uid) return false
    return taskScope(t) === 'equipe' || (!!t.responsavel_id && t.responsavel_id !== uid) || taskHasChecklistForOtherMember(t, uid)
  }, [user?.id])

  const recentesIds = useMemo(() => new Set(
    [...tarefasVisiveis]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, 12)
      .map(t => t.id)
  ), [tarefasVisiveis])

  const scoped = useMemo(() => tarefasVisiveis.filter(t => {
    if (escopo === 'pessoais') return isPersonalTask(t)
    if (escopo === 'equipe') return isTeamAssignedTask(t)
    if (escopo === 'recentes') return recentesIds.has(t.id)
    return true
  }), [tarefasVisiveis, escopo, isPersonalTask, isTeamAssignedTask, recentesIds])

  const membroOptions = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; role?: string }>()
    if (user?.id) map.set(user.id, { id: user.id, nome: user.nome || 'Eu', role: user.role })
    membros.forEach(m => map.set(m.id, { id: m.id, nome: m.nome, role: m.role_na_equipe || m.role }))
    tarefasVisiveis.forEach(t => {
      if (t.responsavel_id) map.set(t.responsavel_id, { id: t.responsavel_id, nome: t.responsavel_nome_perfil || t.responsavel_nome || 'Responsável' })
      if (t.criado_por) map.set(t.criado_por, { id: t.criado_por, nome: t.criado_por_nome || 'Criador' })
      ;(t.checklist || []).forEach(item => {
        if (item.responsavel_id) map.set(item.responsavel_id, { id: item.responsavel_id, nome: item.responsavel_nome || 'Executor do checklist' })
      })
    })
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [membros, tarefasVisiveis, user?.id, user?.nome, user?.role])

  const anoOptions = useMemo(() => {
    const years = new Set<string>()
    tarefasVisiveis.forEach(t => {
      const year = getYearValue(taskReferenceDate(t))
      if (year) years.add(year)
    })
    years.add(String(new Date().getFullYear()))
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [tarefasVisiveis])

  const filtered = useMemo(() => scoped.filter(t => {
    if (status !== 'todos' && t.status !== status) return false
    if (prioridade !== 'todos' && t.prioridade !== prioridade) return false
    if (membroFiltro !== 'todos' && !memberMatchesTask(t, membroFiltro)) return false
    const refDate = taskReferenceDate(t)
    if ((mesFiltro !== 'todos' || anoFiltro !== 'todos')) {
      const mainDateMatches = (mesFiltro === 'todos' || getMonthValue(refDate) === mesFiltro) && (anoFiltro === 'todos' || getYearValue(refDate) === anoFiltro)
      const checklistDateMatches = checklistMatchesMonthYear(t.checklist, mesFiltro, anoFiltro)
      if (!mainDateMatches && !checklistDateMatches) return false
    }
    const q = search.trim().toLowerCase()
    if (q && !`${t.titulo} ${t.descricao || ''} ${t.criado_por_nome || ''} ${t.responsavel_nome_perfil || t.responsavel_nome || ''} ${(t.checklist || []).map(i => `${i.texto} ${i.descricao || ''} ${i.responsavel_nome || ''}`).join(' ')}`.toLowerCase().includes(q)) return false
    return true
  }), [scoped, search, status, prioridade, membroFiltro, mesFiltro, anoFiltro])

  const pessoalCount = useMemo(() => tarefasVisiveis.filter(isPersonalTask).length, [tarefasVisiveis, isPersonalTask])
  const equipeCount = useMemo(() => tarefasVisiveis.filter(isTeamAssignedTask).length, [tarefasVisiveis, isTeamAssignedTask])
  const recentesCount = recentesIds.size

  const stats = [
    ['Total', scoped.length, 'var(--text)'],
    ['Pendentes', scoped.filter(t => t.status === 'pendente').length, '#F59E0B'],
    ['Em progresso', scoped.filter(t => t.status === 'em_progresso').length, '#F59E0B'],
    ['Concluídas', scoped.filter(t => t.status === 'concluida').length, '#10B981'],
    ['Não concluídas', scoped.filter(t => t.status === 'nao_concluida').length, '#EF4444'],
    ['Devolvidas', scoped.filter(t => t.status === 'devolvida').length, '#F59E0B'],
    ['Aprovadas', scoped.filter(t => t.status === 'aprovada').length, '#059669'],
  ]

  const dashboardStats = useMemo(() => {
    const total = filtered.length
    const done = filtered.filter(t => t.status === 'concluida' || t.status === 'aprovada').length
    const late = filtered.filter(t => isOverdue(t.prazo, t.status)).length
    const opened = filtered.filter(t => ['pendente', 'em_progresso', 'devolvida', 'reenviada'].includes(String(t.status))).length
    const percent = total ? Math.round((done / total) * 100) : 0
    const statusItems = [
      { key: 'pendente', label: 'Pendentes', value: filtered.filter(t => t.status === 'pendente').length, color: '#F59E0B' },
      { key: 'em_progresso', label: 'Em progresso', value: filtered.filter(t => t.status === 'em_progresso').length, color: '#F59E0B' },
      { key: 'concluida', label: 'Concluídas', value: filtered.filter(t => t.status === 'concluida').length, color: '#10B981' },
      { key: 'aprovada', label: 'Aprovadas', value: filtered.filter(t => t.status === 'aprovada').length, color: '#059669' },
      { key: 'devolvida', label: 'Devolvidas', value: filtered.filter(t => t.status === 'devolvida').length, color: '#F59E0B' },
      { key: 'nao_concluida', label: 'Não concluídas', value: filtered.filter(t => t.status === 'nao_concluida').length, color: '#EF4444' },
    ]
    return { total, done, late, opened, percent, statusItems }
  }, [filtered])

  function limparFiltros() {
    setSearch('')
    setStatus('todos')
    setPrioridade('todos')
    setMembroFiltro('todos')
    setMesFiltro('todos')
    setAnoFiltro('todos')
  }

  async function updateSaved(t: Tarefa) {
    setTarefas(prev => {
      const i = prev.findIndex(x => x.id === t.id)
      if (i >= 0) { const n = [...prev]; n[i] = t; return n }
      return [t, ...prev]
    })
  }

  async function startTask(t: Tarefa) {
    try { updateSaved(await tarefasApi.updateStatus(t.id, { status: 'em_progresso' })) }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao iniciar.', 'error') }
  }

  async function approve(t: Tarefa) {
    if (!confirm('Aprovar esta tarefa? Verifique os arquivos da tarefa antes de aprovar.')) return
    try { updateSaved(await tarefasApi.aprovar(t.id)); toast('Tarefa aprovada.') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao aprovar.', 'error') }
  }

  async function devolver(t: Tarefa) {
    const motivo = prompt('Informe a ressalva/correção necessária:')
    if (!motivo?.trim()) return
    try { updateSaved(await tarefasApi.devolver(t.id, motivo.trim())); toast('Tarefa devolvida.') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao devolver.', 'error') }
  }

  async function remove(id: string) {
    if (!confirm('Apagar esta tarefa definitivamente?')) return
    try { await tarefasApi.remove(id); setTarefas(prev => prev.filter(t => t.id !== id)); toast('Tarefa apagada.') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao apagar.', 'error') }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '16px 16px calc(var(--bottom-nav-h, 72px) + env(safe-area-inset-bottom) + 20px)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(21px, 4vw, 28px)', fontWeight: 600 }}>{t('tasks.pageTitle')}</h1>
          <p style={{ margin: 0, color: 'var(--text3)', fontSize: 13 }}>{escopo === 'pessoais' ? 'Minhas tarefas pessoais e recebidas' : escopo === 'equipe' ? 'Tarefas do time com execução por membros' : escopo === 'recentes' ? 'Últimas movimentações e execuções' : 'Todas as tarefas acessíveis'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEdit(null); setModalOpen(true) }} type="button"><Plus size={16} /> {t('tasks.newButton')}</button>
      </header>

      <section className="task-smart-tabs" aria-label="Tipo de tarefas">
        {[
          { id: 'pessoais', label: t('tasks.tabs.personal'), count: pessoalCount, hint: 'Minha execução' },
          { id: 'equipe', label: t('tasks.tabs.team'), count: equipeCount, hint: 'Time e delegações' },
          { id: 'recentes', label: t('tasks.tabs.recent'), count: recentesCount, hint: 'Movimentadas agora' },
          { id: 'todas', label: t('tasks.tabs.all'), count: tarefasVisiveis.length, hint: 'Visão geral' },
        ].map(tab => {
          const active = escopo === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              className={active ? 'task-smart-tab active' : 'task-smart-tab'}
              onClick={() => setEscopo(tab.id as 'pessoais' | 'equipe' | 'todas' | 'recentes')}
            >
              <span className="task-smart-tab-main">
                <strong>{tab.label}</strong>
                <em>{tab.count}</em>
              </span>
              <span className="task-smart-tab-hint">{tab.hint}</span>
            </button>
          )
        })}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
        {stats.map(([label, value, color]) => <div key={String(label)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 21, fontWeight: 600, color: String(color) }}>{String(value)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 650 }}>{String(label)}</div>
        </div>)}
      </section>

      <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14, fontWeight: 750 }}>{t('tasks.filters.title')}</strong>
          <button className="btn btn-ghost" type="button" onClick={limparFiltros} style={{ minHeight: 34, padding: '7px 10px', fontSize: 12 }}>{t('tasks.filters.clear')}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-input" style={{ paddingLeft: 34 }} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('tasks.search.placeholder')} />
          </div>
          <select className="form-input" value={membroFiltro} onChange={e => setMembroFiltro(e.target.value)}>
            <option value="todos">Todos membros</option>
            {membroOptions.map(m => <option key={m.id} value={m.id}>{m.nome}{m.id === user?.id ? ' (eu)' : ''}</option>)}
          </select>
          <select className="form-input" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}>
            <option value="todos">Todos os meses</option>
            <option value="01">Janeiro</option>
            <option value="02">Fevereiro</option>
            <option value="03">Março</option>
            <option value="04">Abril</option>
            <option value="05">Maio</option>
            <option value="06">Junho</option>
            <option value="07">Julho</option>
            <option value="08">Agosto</option>
            <option value="09">Setembro</option>
            <option value="10">Outubro</option>
            <option value="11">Novembro</option>
            <option value="12">Dezembro</option>
          </select>
          <select className="form-input" value={anoFiltro} onChange={e => setAnoFiltro(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
          <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="todos">Todos status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value)}>
            <option value="todos">Todas prioridades</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
        </div>
      </section>

      <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <strong style={{ display: 'block', fontSize: 14, fontWeight: 750 }}>Status das tarefas filtradas</strong>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>Conclusão, atrasos e volume considerando os filtros ativos.</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 850, color: dashboardStats.percent >= 70 ? '#10B981' : dashboardStats.percent >= 40 ? '#F59E0B' : '#EF4444' }}>{dashboardStats.percent}%</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>concluídas/aprovadas</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}><strong style={{ fontSize: 16 }}>{dashboardStats.total}</strong><div style={{ fontSize: 11, color: 'var(--text3)' }}>tarefas filtradas</div></div>
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}><strong style={{ fontSize: 16, color: '#10B981' }}>{dashboardStats.done}</strong><div style={{ fontSize: 11, color: 'var(--text3)' }}>concluídas/aprovadas</div></div>
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}><strong style={{ fontSize: 16, color: '#F59E0B' }}>{dashboardStats.opened}</strong><div style={{ fontSize: 11, color: 'var(--text3)' }}>em aberto</div></div>
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}><strong style={{ fontSize: 16, color: '#EF4444' }}>{dashboardStats.late}</strong><div style={{ fontSize: 11, color: 'var(--text3)' }}>vencidas</div></div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {dashboardStats.statusItems.map(item => {
            const width = dashboardStats.total ? Math.max(3, Math.round((item.value / dashboardStats.total) * 100)) : 0
            return (
              <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '105px 1fr 34px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{item.label}</span>
                <div style={{ height: 9, borderRadius: 999, background: 'rgba(148,163,184,.16)', overflow: 'hidden' }}>
                  <div style={{ width: `${width}%`, height: '100%', borderRadius: 999, background: item.color, transition: 'width .2s ease' }} />
                </div>
                <strong style={{ fontSize: 12, textAlign: 'right' }}>{item.value}</strong>
              </div>
            )
          })}
        </div>
      </section>

      {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /></div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.length === 0 ? <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 30, textAlign: 'center', color: 'var(--text3)' }}>{escopo === 'pessoais' ? 'Nenhuma tarefa pessoal encontrada.' : escopo === 'equipe' ? 'Nenhuma tarefa de equipe encontrada.' : escopo === 'recentes' ? 'Nenhuma movimentação recente encontrada.' : 'Nenhuma tarefa encontrada.'}</div> : filtered.map(t => (
            <TarefaCard key={t.id} tarefa={t} userId={user?.id || ''} isGestor={!!isGestor}
              onOpen={setDetalhe}
              onEdit={(x) => { setEdit(x); setModalOpen(true) }}
              onDelete={remove}
              onStart={startTask}
              onResponder={setDetalhe}
              onApprove={approve}
              onReturn={devolver}
              onComplemento={setComplemento}
              onHistory={setHistorico}
              onAnexos={setAnexos}
            />
          ))}
        </div>
      )}

      {modalOpen && <TarefaModal tarefa={edit} membros={membros} onClose={() => { setModalOpen(false); setEdit(null) }} onSaved={(t) => { updateSaved(t); setModalOpen(false); setEdit(null) }} />}
      {responder && <RespostaModal tarefa={responder} onClose={() => setResponder(null)} onSaved={(t) => { updateSaved(t); setResponder(null) }} />}
      {historico && <HistoricoModal tarefa={historico} onClose={() => setHistorico(null)} />}
      {detalhe && <TarefaDetalheModal tarefa={detalhe} isGestor={isGestor} userId={user?.id || ''} onClose={() => { setDetalhe(null); if (new URLSearchParams(location.search).get('task')) navigate('/tarefas', { replace: true }) }} onSaved={updateSaved} onAnexos={setAnexos} onResponder={setDetalhe} onApprove={approve} onReturn={devolver} onComplemento={setComplemento} />}
      {complemento && <ComplementoModal tarefa={complemento} onClose={() => setComplemento(null)} onSaved={(t) => { updateSaved(t); setComplemento(null); setDetalhe(prev => prev?.id === t.id ? t : prev) }} />}
      {anexos && <AnexosModal tarefa={anexos} onClose={() => setAnexos(null)} onChanged={load} />}
    </div>
  )
}
