import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode, DragEvent } from 'react'
import {
  Plus, Search, Calendar, User, CheckCircle2, Clock, AlertCircle, XCircle,
  RotateCcw, Trash2, Edit3, X, Loader, MessageSquare, History, Send,
  Paperclip, Upload, Download, FileText, Copy, Trophy,
} from 'lucide-react'
import { tarefasApi, equipeApi, destravaApi, type Tarefa, type TarefaAnexo, type MembroEquipe, type ChecklistItem, type DestravaCatalogoItem, type ChecklistDifficulty } from '../lib/api'
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


const CHECKLIST_DIFFICULTY_OPTIONS: Array<{ value: ChecklistDifficulty; label: string; points: number; hint: string }> = [
  { value: 'nivel_1', label: 'Nível 1', points: 0, hint: 'Ação simples, apenas registro ou acompanhamento' },
  { value: 'nivel_2', label: 'Nível 2', points: 1, hint: 'Baixa complexidade' },
  { value: 'nivel_3', label: 'Nível 3', points: 3, hint: 'Exige atenção e conferência' },
  { value: 'nivel_4', label: 'Nível 4', points: 5, hint: 'Exige análise ou validação detalhada' },
  { value: 'nivel_5', label: 'Nível 5', points: 20, hint: 'Alta complexidade e impacto' },
]

function normalizeDifficultyValue(value?: ChecklistDifficulty | string): ChecklistDifficulty {
  if (value === 'facil') return 'nivel_4'
  if (value === 'medio') return 'nivel_4'
  if (value === 'dificil') return 'nivel_5'
  if (value === 'hard') return 'nivel_5'
  if (value === 'iniciante') return 'nivel_1' as ChecklistDifficulty
  return (CHECKLIST_DIFFICULTY_OPTIONS.find(opt => opt.value === value)?.value || 'nivel_3') as ChecklistDifficulty
}

function difficultyPoints(value?: ChecklistDifficulty | string) {
  const normalized = normalizeDifficultyValue(value)
  return CHECKLIST_DIFFICULTY_OPTIONS.find(opt => opt.value === normalized)?.points ?? 3
}

function difficultyLabel(value?: ChecklistDifficulty | string) {
  const normalized = normalizeDifficultyValue(value)
  return CHECKLIST_DIFFICULTY_OPTIONS.find(opt => opt.value === normalized)?.label || 'Nível 3'
}

function difficultyFromPoints(points?: number): ChecklistDifficulty {
  const n = Number(points || 0)
  if (n <= 0) return 'nivel_1'
  if (n <= 1) return 'nivel_2'
  if (n <= 3) return 'nivel_3'
  if (n <= 5) return 'nivel_4'
  return 'nivel_5'
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
    dificuldade: (item as any).dificuldade || difficultyFromPoints(Number((item as any).pontuacao ?? 3)),
    pontuacao: Math.max(0, Math.min(20, Number((item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)))),
    feito: Boolean(item.feito),
  }))
}

function checklistExecutorName(item: ChecklistItem, tarefa: Tarefa) {
  if (item.responsavel_nome) return item.responsavel_nome
  if (tarefa.responsavel_nome_perfil || tarefa.responsavel_nome) return tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'Executor'
  if (tarefa.modo_distribuicao === 'livre_equipe') return tarefa.aceita_por_nome || 'Livre para quem assumir'
  return tarefa.criado_por_nome || 'Executor'
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
  return tarefa.responsavel_id === memberId || tarefa.criado_por === memberId || tarefa.aceita_por === memberId || (tarefa.checklist || []).some(item => item.responsavel_id === memberId)
}

function taskScope(tarefa: Tarefa): 'pessoal' | 'equipe' {
  return tarefa.escopo === 'equipe' ? 'equipe' : 'pessoal'
}

function taskDistribution(tarefa: Tarefa): 'normal' | 'livre_equipe' {
  return tarefa.modo_distribuicao === 'livre_equipe' ? 'livre_equipe' : 'normal'
}

function isFreeTeamTask(tarefa: Tarefa) {
  return taskDistribution(tarefa) === 'livre_equipe'
}

function taskHasUnassignedChecklist(tarefa: Tarefa) {
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => !item.feito && !item.responsavel_id)
}

function isAvailableFreeTask(tarefa: Tarefa) {
  return isFreeTeamTask(tarefa) && !['concluida', 'aprovada', 'cancelada'].includes(String(tarefa.status)) && (!tarefa.aceita_por || taskHasUnassignedChecklist(tarefa))
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
  return tarefa.data_reabertura || tarefa.updated_at || tarefa.prazo || tarefa.data || tarefa.created_at || ''
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
        style={{ width: 'min(96vw, 980px)', maxWidth: '96vw' }}
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
  const [modoDistribuicao, setModoDistribuicao] = useState<'normal' | 'livre_equipe'>(() => tarefa?.modo_distribuicao === 'livre_equipe' ? 'livre_equipe' : 'normal')
  const [pontuacao, setPontuacao] = useState(String(tarefa?.pontuacao ?? 3))
  const [contaRanking, setContaRanking] = useState(tarefa?.conta_ranking !== false)
  const [responsavelId, setResponsavelId] = useState(tarefa?.id ? (tarefa?.responsavel_id || '') : (user?.id || ''))
  const [checklist, setChecklist] = useState<ChecklistItem[]>(normalizeChecklistItems(tarefa?.checklist))
  const [novoItem, setNovoItem] = useState('')
  const [novoItemDescricao, setNovoItemDescricao] = useState('')
  const [novoItemData, setNovoItemData] = useState('')
  const [novoItemResponsavelId, setNovoItemResponsavelId] = useState('')
  const [novoItemPontuacao, setNovoItemPontuacao] = useState('10')
  const [novoItemDificuldade, setNovoItemDificuldade] = useState<ChecklistDifficulty>('nivel_3')
  const [obs, setObs] = useState(tarefa?.obs || '')
  const [destravaBusca, setDestravaBusca] = useState('')
  const [destravaLoading, setDestravaLoading] = useState(false)
  const [destravaItens, setDestravaItens] = useState<DestravaCatalogoItem[]>([])
  const [destravaSelecionado, setDestravaSelecionado] = useState<DestravaCatalogoItem | null>(() => {
    if (tarefa?.origem_sistema === 'destrava' && tarefa?.origem_id) {
      return {
        id: tarefa.origem_id,
        tipo: tarefa.origem_tipo || 'empresa',
        nome: tarefa.origem_nome || 'Registro do Destrava',
        url: tarefa.origem_url || undefined,
        metadata: tarefa.origem_payload || undefined,
      }
    }
    return null
  })
  const [loading, setLoading] = useState(false)
  const canMarkChecklistInEdit = !tarefa?.id || tarefa.responsavel_id === user?.id || (!tarefa.responsavel_id && tarefa.criado_por === user?.id)
  const responsaveisChecklist = assigneeOptions(membros, user || undefined)
  const gestoresParaSolicitar = responsaveisChecklist.filter(m => m.id !== user?.id && ['admin','dev','gestor','sub_gestor'].includes(String(m.role || '')))
  const isMemberRequest = !isGestor && tipoTarefa === 'equipe' && !!responsavelId && responsavelId !== user?.id

  useEffect(() => {
    let alive = true
    if (!isGestor) {
      setDestravaItens([])
      setDestravaLoading(false)
      return () => { alive = false }
    }

    setDestravaLoading(true)
    destravaApi.catalogo({ tipo: 'empresa', q: '', limit: 120 })
      .then(items => { if (alive) setDestravaItens(Array.isArray(items) ? items : []) })
      .catch(() => { if (alive) setDestravaItens([]) })
      .finally(() => { if (alive) setDestravaLoading(false) })

    return () => { alive = false }
  }, [isGestor])

  function changeTipoTarefa(next: 'pessoal' | 'equipe') {
    setTipoTarefa(next)
    if (next === 'pessoal') {
      setModoDistribuicao('normal')
      setResponsavelId(user?.id || '')
    }
    if (next === 'equipe' && responsavelId === user?.id) setResponsavelId('')
  }

  function changeModoDistribuicao(next: 'normal' | 'livre_equipe') {
    setModoDistribuicao(next)
    if (next === 'livre_equipe') {
      setTipoTarefa('equipe')
      setResponsavelId('')
    }
  }

  function checklistResponsibleName(id?: string) {
    if (!id) return undefined
    return responsaveisChecklist.find(m => m.id === id)?.nome
  }
  function applyNovoItemDifficulty(next: ChecklistDifficulty) {
    setNovoItemDificuldade(next)
    setNovoItemPontuacao(String(difficultyPoints(next)))
  }


  function addItem() {
    if (!novoItem.trim()) { toast('Informe a ação do checklist.', 'error'); return }
    if (novoItemPontuacao === '' || Number.isNaN(Number(novoItemPontuacao)) || Number(novoItemPontuacao) < 0 || Number(novoItemPontuacao) > 20) { toast('Informe a pontuação desta subtarefa entre 0 e 20 pontos.', 'error'); return }
    setChecklist(prev => [...prev, {
      id: nanoid(),
      texto: novoItem.trim(),
      descricao: novoItemDescricao.trim() || undefined,
      data: novoItemData || undefined,
      responsavel_id: novoItemResponsavelId || undefined,
      responsavel_nome: checklistResponsibleName(novoItemResponsavelId),
      dificuldade: novoItemDificuldade,
      pontuacao: Math.max(0, Math.min(20, Number(novoItemPontuacao || 0))),
      feito: false,
    }])
    setNovoItem('')
    setNovoItemDescricao('')
    setNovoItemData('')
    setNovoItemResponsavelId('')
    setNovoItemDificuldade('medio')
    setNovoItemPontuacao('10')
  }

  const destravaSelectOptions = useMemo(() => {
    const map = new Map<string, DestravaCatalogoItem>()
    if (destravaSelecionado) map.set(`${destravaSelecionado.tipo}-${destravaSelecionado.id}`, destravaSelecionado)
    destravaItens.forEach(item => map.set(`${item.tipo}-${item.id}`, item))
    return Array.from(map.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  }, [destravaItens, destravaSelecionado])

  async function salvar() {
    if (loading) return
    if (!titulo.trim()) { toast('Informe o título da tarefa.', 'error'); return }
    if (tipoTarefa === 'equipe' && checklist.length === 0) { toast('Adicione pelo menos uma subtarefa/checklist para tarefa da equipe.', 'error'); return }
    const invalidItem = checklist.find(item => !String(item.texto || '').trim() || (item as any).pontuacao === undefined || (item as any).pontuacao === null || Number.isNaN(Number((item as any).pontuacao)))
    if (invalidItem) { toast('Cada checklist precisa ter ação e pontuação.', 'error'); return }
    setLoading(true)
    try {
      const payload: Partial<Tarefa> = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: isGestor ? ((modoDistribuicao === 'livre_equipe' ? null : (tipoTarefa === 'pessoal' ? (user?.id || null) : (responsavelId || null))) as any) : (isMemberRequest ? responsavelId : user?.id),
        escopo: isGestor ? tipoTarefa : (isMemberRequest ? 'equipe' : 'pessoal'),
        modo_distribuicao: isGestor ? modoDistribuicao : 'normal',
        pontuacao: tipoTarefa === 'equipe' ? Number(pontuacao || 0) : 0,
        conta_ranking: tipoTarefa === 'equipe' ? contaRanking : false,
        checklist: tipoTarefa === 'equipe' ? checklist : [],
        obs: obs.trim() || undefined,
        origem_sistema: destravaSelecionado ? 'destrava' : undefined,
        origem_tipo: destravaSelecionado?.tipo || undefined,
        origem_id: destravaSelecionado?.id || undefined,
        origem_nome: destravaSelecionado?.nome || undefined,
        origem_url: destravaSelecionado?.url || undefined,
        origem_payload: destravaSelecionado?.metadata || undefined,
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
        {isGestor && (
          <div className="form-group">
            <label className="form-label">Empresa Destrava <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(opcional)</span></label>
            <select
              className="form-input"
              value={destravaSelecionado ? `${destravaSelecionado.tipo}-${destravaSelecionado.id}` : ''}
              onChange={e => {
                const value = e.target.value
                if (!value) { setDestravaSelecionado(null); setDestravaBusca(''); return }
                const item = destravaSelectOptions.find(i => `${i.tipo}-${i.id}` === value) || null
                setDestravaSelecionado(item)
                setDestravaBusca(item?.nome || '')
              }}
            >
              <option value="">Selecione a empresa, se esta tarefa for para uma empresa do Destrava</option>
              {destravaLoading && <option value="" disabled>Carregando empresas...</option>}
              {!destravaLoading && destravaSelectOptions.map(item => (
                <option key={`${item.tipo}-${item.id}`} value={`${item.tipo}-${item.id}`}>
                  {item.nome}{item.documento ? ` · ${item.documento}` : ''}
                </option>
              ))}
            </select>
            {destravaSelecionado && (
              <div className="integration-help">
                Vinculada ao Destrava: {destravaSelecionado.documento || destravaSelecionado.subtitulo || destravaSelecionado.tipo}. Ao executar ou anexar arquivos, o histórico da empresa no Destrava será atualizado.
              </div>
            )}
          </div>
        )}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Prazo</label>
            <input
              className="form-input"
              type="date"
              value={prazo}
              onFocus={e => {
                try { (e.target as HTMLInputElement).showPicker?.() } catch {}
              }}
              onChange={e => setPrazo(e.target.value)}
            />
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
        {!isGestor && (
          <div className="form-group">
            <label className="form-label">Destino da tarefa</label>
            <div className="task-type-selector compact" role="radiogroup" aria-label="Destino da tarefa">
              <button
                type="button"
                className={tipoTarefa === 'pessoal' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => { setTipoTarefa('pessoal'); setResponsavelId(user?.id || '') }}
              >
                <strong>Minha tarefa</strong>
                <span>Fica para minha execução.</span>
              </button>
              <button
                type="button"
                className={tipoTarefa === 'equipe' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => { setTipoTarefa('equipe'); if (!responsavelId || responsavelId === user?.id) setResponsavelId(gestoresParaSolicitar[0]?.id || '') }}
              >
                <strong>Solicitar ao gestor</strong>
                <span>Envia uma demanda para o responsável conferir ou executar.</span>
              </button>
            </div>
            {tipoTarefa === 'equipe' && (
              <select className="form-input" style={{ marginTop: 8 }} value={responsavelId} onChange={e => setResponsavelId(e.target.value)}>
                <option value="">Selecione o gestor</option>
                {gestoresParaSolicitar.map(m => <option key={m.id} value={m.id}>{m.nome}{m.role ? ` · ${m.role}` : ''}</option>)}
              </select>
            )}
          </div>
        )}
        {isGestor && tipoTarefa === 'equipe' && (
          <div className="form-group">
            <label className="form-label">Modelo de distribuição</label>
            <div className="task-type-selector" role="radiogroup" aria-label="Modelo de distribuição da tarefa">
              <button
                type="button"
                className={modoDistribuicao === 'normal' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => changeModoDistribuicao('normal')}
              >
                <strong>Direcionar</strong>
                <span>Escolha um responsável ou distribua pelos checklists.</span>
              </button>
              <button
                type="button"
                className={modoDistribuicao === 'livre_equipe' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => changeModoDistribuicao('livre_equipe')}
              >
                <strong>Livre para o time</strong>
                <span>Fica disponível para qualquer membro assumir.</span>
              </button>
            </div>
          </div>
        )}
        {isGestor && tipoTarefa === 'equipe' && modoDistribuicao === 'livre_equipe' && (
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Pontuação no ranking</label>
              <input className="form-input" type="number" min="0" max="20" value={pontuacao} onWheel={e => (e.target as HTMLInputElement).blur()} onChange={e => setPontuacao(e.target.value)} />
            </div>
            <label className="form-group" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 22 }}>
              <input type="checkbox" checked={contaRanking} onChange={e => setContaRanking(e.target.checked)} />
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Contar no ranking após aprovação</span>
            </label>
          </div>
        )}
        {isGestor && tipoTarefa === 'equipe' && modoDistribuicao !== 'livre_equipe' && (
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
        {tipoTarefa === 'equipe' && (
        <div className="form-group">
          <label className="form-label">Checklist / subtarefas da equipe</label>
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
                  onFocus={e => {
                    try { (e.target as HTMLInputElement).showPicker?.() } catch {}
                  }}
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
                  <option value="">Livre / usar responsável principal</option>
                  {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}{m.role ? ` · ${m.role}` : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Grau de dificuldade *</label>
                <select className="form-input" value={novoItemDificuldade} onChange={e => applyNovoItemDifficulty(e.target.value as ChecklistDifficulty)}>
                  {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Pontuação *</label>
                <input className="form-input" type="number" min="0" max="20" value={novoItemPontuacao} onWheel={e => (e.target as HTMLInputElement).blur()} onChange={e => { setNovoItemPontuacao(e.target.value); setNovoItemDificuldade(difficultyFromPoints(Number(e.target.value || 0))) }} />
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
                <select
                  className="form-input"
                  value={(item as any).dificuldade || difficultyFromPoints(Number((item as any).pontuacao ?? 3))}
                  onChange={e => {
                    const dificuldade = e.target.value as ChecklistDifficulty
                    setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, dificuldade, pontuacao: difficultyPoints(dificuldade) } : i))
                  }}
                  title="Grau de dificuldade"
                >
                  {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                </select>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="20"
                  value={(item as any).pontuacao ?? 0}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, pontuacao: Math.max(0, Math.min(20, Number(e.target.value || 0))), dificuldade: difficultyFromPoints(Number(e.target.value || 0)) } : i))}
                  title="Pontuação obrigatória desta subtarefa"
                />
                <input
                  className="form-input"
                  type="date"
                  value={item.data || ''}
                  onFocus={e => {
                    try { (e.target as HTMLInputElement).showPicker?.() } catch {}
                  }}
                  onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, data: e.target.value || undefined } : i))}
                  title="Data desta ação opcional"
                />
                <select
                  className="form-input"
                  value={item.responsavel_id || ''}
                  onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, responsavel_id: e.target.value || undefined, responsavel_nome: checklistResponsibleName(e.target.value) } : i))}
                  title="Executor deste checklist"
                >
                  <option value="">Livre / responsável principal</option>
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
        )}
        {tipoTarefa === 'pessoal' && (
          <div className="personal-task-note">Tarefa pessoal: privada para você, sem pontuação e sem ranking. Mesmo vinculada ao Destrava, não aparece para membros da equipe.</div>
        )}
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
            <input
              className="form-input"
              type="date"
              value={prazo}
              onFocus={e => {
                try { (e.target as HTMLInputElement).showPicker?.() } catch {}
              }}
              onChange={e => setPrazo(e.target.value)}
            />
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


function TarefaDetalheModal({ tarefa, membros, isGestor, userId, onClose, onSaved, onAnexos, onResponder, onApprove, onReturn, onComplemento, onReminder }: {
  tarefa: Tarefa
  membros: MembroEquipe[]
  isGestor: boolean
  userId: string
  onClose: () => void
  onSaved: (t: Tarefa) => void
  onAnexos: (t: Tarefa) => void
  onResponder: (t: Tarefa) => void
  onApprove: (t: Tarefa) => void
  onReturn: (t: Tarefa) => void
  onComplemento: (t: Tarefa) => void
  onReminder: (t: Tarefa) => void
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(normalizeChecklistItems(tarefa.checklist))
  const [obs, setObs] = useState(tarefa.observacao_conclusao || tarefa.resposta_membro || '')
  const [motivo, setMotivo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editTitulo, setEditTitulo] = useState(tarefa.titulo || '')
  const [editDescricao, setEditDescricao] = useState(tarefa.descricao || '')
  const [editPrazo, setEditPrazo] = useState(tarefa.prazo?.slice(0, 10) || '')
  const [editPrioridade, setEditPrioridade] = useState<Priority>(tarefa.prioridade || 'media')
  const [newSubtask, setNewSubtask] = useState('')
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('')
  const [newSubtaskDate, setNewSubtaskDate] = useState('')
  const [newSubtaskResp, setNewSubtaskResp] = useState('')
  const [newSubtaskPoints, setNewSubtaskPoints] = useState('10')
  const [newSubtaskDifficulty, setNewSubtaskDifficulty] = useState<ChecklistDifficulty>('nivel_3')
  const anexosCount = Number((tarefa as any).anexos_count || 0)
  const isResponsavel = tarefa.responsavel_id === userId
  const isCriador = tarefa.criado_por === userId
  const isCriadorSemResponsavel = !tarefa.responsavel_id && isCriador
  const isTaskFinalizada = ['aprovada', 'cancelada'].includes(tarefa.status)
  const livreDisponivel = isAvailableFreeTask(tarefa)
  const livreAceita = isFreeTeamTask(tarefa) && !!tarefa.aceita_por
  const isPersonal = taskScope(tarefa) === 'pessoal'

  // Checklist marcável somente pelo executor real da tarefa.
  // Gestor/admin/dev conferem, aprovam e devolvem, mas não marcam execução de outra pessoa.
  const hasChecklistForMe = checklist.some(item => isChecklistItemExecutor(item, tarefa, userId))
  const myProgress = checklistProgressForUser({ ...tarefa, checklist }, userId)
  const geralProgress = checklistProgress(checklist)
  const distributedTask = taskHasDistributedChecklist({ ...tarefa, checklist })
  const canExecuteTask = (isResponsavel || isCriadorSemResponsavel || hasChecklistForMe) && !isTaskFinalizada
  const canToggleChecklist = canExecuteTask && !isTaskFinalizada
  // Gestor precisa aprovar/devolver mesmo quando também é criador/responsável.
  // A aprovação do gestor é a etapa que libera pontuação no ranking.
  const canReviewTask = !isPersonal && isGestor && !['aprovada', 'cancelada'].includes(String(tarefa.status || ''))
  const allChecklistDone = geralProgress.total === 0 || geralProgress.complete
  const myChecklistDone = myProgress.total === 0 || myProgress.complete
  const displayChecklist = visibleChecklistItems({ ...tarefa, checklist }, userId, isGestor)
  const executorSummary = checklistExecutorSummary({ ...tarefa, checklist })
  const responsaveisChecklist = assigneeOptions(membros, undefined)

  function checklistResponsibleName(id?: string) {
    if (!id) return undefined
    return responsaveisChecklist.find(m => m.id === id)?.nome
  }
  function applyNewSubtaskDifficulty(next: ChecklistDifficulty) {
    setNewSubtaskDifficulty(next)
    setNewSubtaskPoints(String(difficultyPoints(next)))
  }


  function addInlineSubtask() {
    if (!newSubtask.trim()) { toast('Informe a ação do checklist.', 'error'); return }
    if (newSubtaskPoints === '' || Number.isNaN(Number(newSubtaskPoints)) || Number(newSubtaskPoints) < 0 || Number(newSubtaskPoints) > 20) { toast('Informe a pontuação da subtarefa entre 0 e 20 pontos.', 'error'); return }
    setChecklist(prev => [...prev, {
      id: nanoid(),
      texto: newSubtask.trim(),
      descricao: newSubtaskDesc.trim() || undefined,
      data: newSubtaskDate || undefined,
      responsavel_id: newSubtaskResp || undefined,
      responsavel_nome: checklistResponsibleName(newSubtaskResp),
      dificuldade: newSubtaskDifficulty,
      pontuacao: Math.max(0, Math.min(20, Number(newSubtaskPoints || 0))),
      feito: false,
    }])
    setNewSubtask('')
    setNewSubtaskDesc('')
    setNewSubtaskDate('')
    setNewSubtaskResp('')
    setNewSubtaskDifficulty('medio')
    setNewSubtaskPoints('10')
    setEditMode(true)
  }

  async function saveInlineEdit() {
    if (!editTitulo.trim()) { toast('Informe o título da tarefa.', 'error'); return }
    if (!checklist.length) { toast('A tarefa precisa ter pelo menos uma subtarefa/checklist.', 'error'); return }
    const invalid = checklist.find(item => !String(item.texto || '').trim() || (item as any).pontuacao === undefined || (item as any).pontuacao === null || Number.isNaN(Number((item as any).pontuacao)))
    if (invalid) { toast('Cada subtarefa precisa ter ação e pontuação.', 'error'); return }
    setSaving(true)
    try {
      const saved = await tarefasApi.update(tarefa.id, {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim() || undefined,
        prazo: editPrazo || undefined,
        prioridade: editPrioridade,
        checklist,
      })
      const next = normalizeChecklistItems(saved.checklist)
      setChecklist(next)
      onSaved(saved)
      toast('Tarefa atualizada. Se estava concluída/aprovada, voltou para execução.')
      setEditMode(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar tarefa.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function persistChecklist(next: ChecklistItem[]) {
    setChecklist(next)
    try {
      const saved = await tarefasApi.update(tarefa.id, { checklist: next })
      onSaved(saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar checklist.', 'error')
    }
  }


  async function assumirChecklistItem(item: ChecklistItem) {
    if (!item.id) return
    setSaving(true)
    try {
      const saved = await tarefasApi.assumirChecklist(tarefa.id, item.id)
      const nextChecklist = normalizeChecklistItems(saved.checklist)
      setChecklist(nextChecklist)
      onSaved(saved)
      toast('Subtarefa assumida. Ela continua no quadro da equipe e agora aparece como sua execução.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao assumir subtarefa.', 'error')
    } finally {
      setSaving(false)
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
      ...checklist.map((item, index) => `${index + 1}. ${item.feito ? '[x]' : '[ ]'} ${item.texto}${(item as any).pontuacao ? `\n   Dificuldade: ${difficultyLabel((item as any).dificuldade)} · Pontos: ${(item as any).pontuacao}` : ''}${item.data ? `\n   Data: ${fmtDate(item.data)}` : ''}${(item.responsavel_nome || tarefa.responsavel_nome_perfil || tarefa.responsavel_nome) ? `\n   Executor: ${checklistExecutorName(item, tarefa)}` : ''}${item.descricao ? `\n   Como executar: ${item.descricao}` : ''}`),
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
              <span>Criada: {fmtDateTime(tarefa.created_at)}</span>
              {tarefa.data_reabertura && <span>Reaberta: {fmtDateTime(tarefa.data_reabertura)}</span>}
              {tarefa.updated_at && <span>Última atualização: {fmtDateTime(tarefa.updated_at)}</span>}
            </div>
          </div>
          <div className="task-detail-hero-actions">
            {isGestor && <button className="btn btn-secondary" type="button" onClick={() => setEditMode(v => !v)}><Edit3 size={14} /> {editMode ? 'Ocultar edição' : 'Editar / incluir subtarefa'}</button>}
            {isGestor && <button className="btn btn-secondary" type="button" onClick={() => onReminder(tarefa)}><MessageSquare size={14} /> Enviar lembrete</button>}
            <button className="btn btn-secondary" type="button" onClick={() => onAnexos(tarefa)}><Paperclip size={14} /> Arquivos {anexosCount ? `(${anexosCount})` : ''}</button>
          </div>
        </section>

        {isGestor && editMode && (
          <section className="task-detail-section task-inline-editor">
            <div className="task-detail-section-head">
              <h3>Editar tarefa e subtarefas</h3>
              <button className="btn btn-primary btn-sm" type="button" onClick={saveInlineEdit} disabled={saving}>{saving ? <Loader size={14} /> : <Send size={14} />} Salvar alterações</button>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Título *</label>
                <input className="form-input" value={editTitulo} onChange={e => setEditTitulo(e.target.value)} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Prazo</label>
                  <input
                    className="form-input"
                    type="date"
                    value={editPrazo}
                    onFocus={e => {
                      try { (e.target as HTMLInputElement).showPicker?.() } catch {}
                    }}
                    onChange={e => setEditPrazo(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Prioridade</label>
                  <select className="form-input" value={editPrioridade} onChange={e => setEditPrioridade(e.target.value as Priority)}>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição da tarefa</label>
              <textarea className="form-input" rows={3} value={editDescricao} onChange={e => setEditDescricao(e.target.value)} />
            </div>

            <div className="task-inline-add-subtask">
              <div className="form-group">
                <label className="form-label">Nova subtarefa/checklist *</label>
                <input className="form-input" value={newSubtask} onChange={e => setNewSubtask(e.target.value)} placeholder="Ex.: Conferir contrato social" />
              </div>
              <div className="form-group">
                <label className="form-label">Grau de dificuldade *</label>
                <select className="form-input" value={newSubtaskDifficulty} onChange={e => applyNewSubtaskDifficulty(e.target.value as ChecklistDifficulty)}>
                  {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Pontuação *</label>
                <input className="form-input" type="number" min="0" max="20" value={newSubtaskPoints} onWheel={e => (e.target as HTMLInputElement).blur()} onChange={e => { setNewSubtaskPoints(e.target.value); setNewSubtaskDifficulty(difficultyFromPoints(Number(e.target.value || 0))) }} />
              </div>
              <div className="form-group">
                <label className="form-label">Data de execução <span>(opcional)</span></label>
                <input
                  className="form-input"
                  type="date"
                  value={newSubtaskDate}
                  onFocus={e => {
                    try { (e.target as HTMLInputElement).showPicker?.() } catch {}
                  }}
                  onChange={e => setNewSubtaskDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Executor <span>(opcional)</span></label>
                <select className="form-input" value={newSubtaskResp} onChange={e => setNewSubtaskResp(e.target.value)}>
                  <option value="">Livre / responsável principal</option>
                  {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div className="form-group task-inline-desc">
                <label className="form-label">Descrição/instrução <span>(opcional)</span></label>
                <textarea className="form-input" rows={2} value={newSubtaskDesc} onChange={e => setNewSubtaskDesc(e.target.value)} placeholder="Explique como executar, se necessário." />
              </div>
              <button className="btn btn-secondary" type="button" onClick={addInlineSubtask}><Plus size={14} /> Incluir subtarefa</button>
            </div>

            <div className="task-inline-checklist-editor">
              {checklist.map(item => (
                <div key={item.id} className="task-inline-checklist-row">
                  <input className="form-input" value={item.texto} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, texto: e.target.value } : i))} placeholder="Ação do checklist" />
                  <select className="form-input" value={(item as any).dificuldade || difficultyFromPoints(Number((item as any).pontuacao ?? 3))} onChange={e => { const dificuldade = e.target.value as ChecklistDifficulty; setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, dificuldade, pontuacao: difficultyPoints(dificuldade) } : i)) }} title="Grau de dificuldade">
                    {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                  </select>
                  <input className="form-input" type="number" min="0" max="20" value={(item as any).pontuacao ?? 0} onWheel={e => (e.target as HTMLInputElement).blur()} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, pontuacao: Math.max(0, Math.min(20, Number(e.target.value || 0))), dificuldade: difficultyFromPoints(Number(e.target.value || 0)) } : i))} title="Pontuação" />
                  <input className="form-input" type="date" value={item.data || ''} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, data: e.target.value || undefined } : i))} title="Data opcional" />
                  <select className="form-input" value={item.responsavel_id || ''} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, responsavel_id: e.target.value || undefined, responsavel_nome: checklistResponsibleName(e.target.value) } : i))}>
                    <option value="">Livre / responsável principal</option>
                    {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <button className="btn btn-ghost danger" type="button" onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))}><Trash2 size={14} /></button>
                  <textarea className="form-input task-inline-row-desc" rows={2} value={item.descricao || ''} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, descricao: e.target.value || undefined } : i))} placeholder="Descrição opcional desta subtarefa" />
                </div>
              ))}
            </div>
          </section>
        )}

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
                  {checklistByDate[dateKey].map(item => {
                    const canAssumeThisItem = !isGestor && isFreeTeamTask(tarefa) && !item.feito && !item.responsavel_id
                    const canToggleThisItem = canToggleChecklist && isChecklistItemExecutor(item, tarefa, userId) && !saving
                    return (
                      <div key={item.id} className={item.feito ? 'task-check-item done' : 'task-check-item'}>
                        <button
                          type="button"
                          className="task-check-main-button"
                          disabled={!canToggleThisItem}
                          onClick={() => toggleCheck(item.id)}
                          aria-pressed={!!item.feito}
                        >
                          <span className="task-check-box" aria-hidden="true">{item.feito ? '✓' : ''}</span>
                          <span className="task-check-content">
                            <span className="task-check-text">{item.texto}</span>
                            <span className="task-check-points">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>
                            <span className="task-check-desc"><User size={12} /> Executor: {checklistExecutorName(item, tarefa)}</span>
                            {item.data && <span className="task-check-desc"><Calendar size={12} /> Execução: {fmtDate(item.data)}</span>}
                            {item.descricao && <span className="task-check-desc">{item.descricao}</span>}
                          </span>
                        </button>
                        {canAssumeThisItem && (
                          <button className="btn btn-primary btn-sm task-check-assume" type="button" onClick={() => assumirChecklistItem(item)} disabled={saving}>
                            Assumir subtarefa
                          </button>
                        )}
                      </div>
                    )
                  })}
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
          {isGestor && <button className="btn btn-secondary" type="button" onClick={() => onReminder(tarefa)}><MessageSquare size={14} /> Enviar lembrete</button>}
          <button className="btn btn-ghost" type="button" onClick={onClose}>Fechar</button>
          {canReviewTask && tarefa.status === 'concluida' && <button className="btn btn-primary" type="button" onClick={() => onApprove(tarefa)}>Aprovar</button>}
          {canReviewTask && ['concluida', 'nao_concluida'].includes(tarefa.status) && <button className="btn btn-secondary" type="button" onClick={() => onReturn(tarefa)}>Devolver</button>}
          {canReviewTask && (tarefa.status === 'aprovada' || (distributedTask && tarefa.status === 'concluida')) && <button className="btn btn-secondary" type="button" onClick={() => onComplemento(tarefa)}>Complementar</button>}
          {canExecuteTask && tarefa.status === 'devolvida' && <button className="btn btn-primary" type="button" onClick={reenviarCorrecao} disabled={saving}>{saving ? <Loader size={14} /> : <RotateCcw size={14} />} Reenviar correção</button>}
          {canExecuteTask && tarefa.status !== 'devolvida' && <button className="btn btn-secondary" type="button" onClick={naoConcluir} disabled={saving}>Não concluí</button>}
          {canExecuteTask && tarefa.status !== 'devolvida' && <button className="btn btn-primary" type="button" onClick={concluir} disabled={saving}>{saving ? <Loader size={14} /> : <CheckCircle2 size={14} />} {allChecklistDone ? 'Enviar tarefa' : myChecklistDone ? 'Enviar minha parte' : 'Enviar minha parte'}</button>}
        </div>
      </div>
    </ModalBase>
  )
}

function TarefaCard({ tarefa, userId, isGestor, onOpen, onEdit, onDelete, onStart, onPegar, onResponder, onApprove, onReturn, onComplemento, onHistory, onAnexos, onReminder }: {
  tarefa: Tarefa
  userId: string
  isGestor: boolean
  onOpen: (t: Tarefa) => void
  onEdit: (t: Tarefa) => void
  onDelete: (id: string) => void
  onStart: (t: Tarefa) => void
  onPegar: (t: Tarefa) => void
  onResponder: (t: Tarefa) => void
  onApprove: (t: Tarefa) => void
  onReturn: (t: Tarefa) => void
  onComplemento: (t: Tarefa) => void
  onHistory: (t: Tarefa) => void
  onAnexos: (t: Tarefa) => void
  onReminder: (t: Tarefa) => void
}) {
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
  const livreDisponivel = isAvailableFreeTask(tarefa)
  const livreAceita = isFreeTeamTask(tarefa) && !!tarefa.aceita_por
  const isPersonal = taskScope(tarefa) === 'pessoal'

  // Checklist marcável somente pelo executor real da tarefa.
  // Gestor/admin/dev conferem, aprovam e devolvem, mas não marcam execução de outra pessoa.
  const hasChecklistForMe = taskHasChecklistForUser(tarefa, userId)
  const canExecuteTask = (isResponsavel || isCriadorSemResponsavel || hasChecklistForMe) && !isTaskFinalizada
  const canReviewTask = !isPersonal && isGestor && !['aprovada', 'cancelada'].includes(String(tarefa.status || ''))
  const ultimaEvidencia = (tarefa as any).ultima_evidencia_em as string | undefined
  const responsavelLabel = livreDisponivel
    ? 'Livre para assumir'
    : tarefa.responsavel_id
      ? (tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'Responsável')
      : taskScope(tarefa) === 'equipe'
        ? 'Tarefa da equipe'
        : 'Tarefa pessoal'
  const checklistLabel = checkTotal > 0
    ? `${checkDone}/${checkTotal}${!isGestor && geralProgress.total !== checkTotal ? ' da sua parte' : ''}`
    : 'Sem checklist'
  const progressWidth = checkTotal > 0 ? Math.max(6, Math.round((checkDone / Math.max(checkTotal, 1)) * 100)) : 0

  return (
    <article
      className={`task-report-row${tarefa.data_reabertura && tarefa.status !== 'concluida' && tarefa.status !== 'aprovada' ? ' task-report-row--reaberta' : ''}`}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return; onOpen(tarefa) }}
      title="Clique para abrir a tarefa"
    >
      <div className="task-report-main">
        <button className="task-report-title" type="button" onClick={() => onOpen(tarefa)}>
          <Icon size={16} color={sc.color} />
          <span>{tarefa.titulo}</span>
          {taskScope(tarefa) === 'equipe'
            ? <span className="task-scope-badge task-scope-badge--equipe">Equipe</span>
            : <span className="task-scope-badge task-scope-badge--pessoal">Pessoal</span>
          }
        </button>
        <div className="task-report-meta">
          <span><User size={12} /> {responsavelLabel}</span>
          {livreAceita && <span>Assumida por {(tarefa as any).aceita_por_nome || tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'membro'}</span>}
          {!isPersonal && isFreeTeamTask(tarefa) && <span>{Number(tarefa.pontuacao || 0)} ponto(s)</span>}
          {tarefa.prazo ? <span className={overdue ? 'danger' : undefined}><Calendar size={12} /> Prazo {fmtDate(tarefa.prazo)}{overdue ? ' · vencida' : ''}</span> : <span><Calendar size={12} /> Sem prazo</span>}
          {tarefa.data_reabertura && <span><RotateCcw size={12} /> Reaberta {fmtDateTime(tarefa.data_reabertura)}</span>}
          {tarefa.updated_at && <span>Atualizada {fmtDateTime(tarefa.updated_at)}</span>}
          {anexosCount > 0 && <span><Paperclip size={12} /> {anexosCount} arquivo(s)</span>}
          {ultimaEvidencia && <span>Envio {fmtDateTime(ultimaEvidencia)}</span>}
          {(tarefa as any).origem_sistema === 'destrava' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#7C3AED', background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.25)', borderRadius: 999, padding: '1px 7px' }}>
              ⚡ Destrava{(tarefa as any).origem_nome ? ` · ${(tarefa as any).origem_nome}` : ''}
            </span>
          )}
        </div>
        {distributedTask && isGestor && executorSummary.length > 0 && (
          <div className="task-report-team-line">Equipe: {executorSummary.map(e => `${e.nome} ${e.feitos}/${e.total}`).join(' · ')}</div>
        )}
      </div>

      <div className="task-report-cell task-report-status">
        <span style={{ color: sc.color, background: sc.bg }}><Icon size={12} /> {sc.label}</span>
        {livreDisponivel && <em>Livre</em>}
        {livreAceita && <em>Assumida</em>}
      </div>

      <div className="task-report-cell task-report-priority">
        <span style={{ color: pc.color, background: `${pc.color}18` }}>{pc.label}</span>
      </div>

      <div className="task-report-cell task-report-progress">
        <strong>{checklistLabel}</strong>
        <div className="task-progress-line compact"><span style={{ width: `${progressWidth}%` }} /></div>
      </div>

      <div className="task-report-actions">
        {livreDisponivel && !isGestor && (taskHasUnassignedChecklist(tarefa)
          ? <button className="btn btn-primary btn-sm task-action-btn" onClick={() => onOpen(tarefa)} type="button">Ver/assumir subtarefa</button>
          : <button className="btn btn-primary btn-sm task-action-btn" onClick={() => onPegar(tarefa)} type="button">Assumir</button>
        )}
        <button className="btn btn-primary btn-sm task-action-btn" onClick={() => onOpen(tarefa)} type="button">Ver tarefa</button>
        {isPersonal ? (
          <>
            <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onEdit(tarefa)} type="button"><Edit3 size={12} /> Editar</button>
            {canDeleteTarefa(tarefa, userId, isGestor) && <button className="btn btn-ghost btn-sm task-action-icon danger" title="Apagar" onClick={() => onDelete(tarefa.id)} type="button"><Trash2 size={13} /></button>}
          </>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onAnexos(tarefa)} type="button"><Paperclip size={12} /> Arquivos</button>
            {isGestor && <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onReminder(tarefa)} type="button"><MessageSquare size={12} /> Lembrete</button>}
            {isGestor && <button className="btn btn-ghost btn-sm task-action-icon" title="Histórico" onClick={() => onHistory(tarefa)} type="button"><History size={13} /></button>}
            {isGestor && <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onEdit(tarefa)} type="button"><Edit3 size={12} /> Editar</button>}
            {canExecuteTask && ['pendente', 'devolvida'].includes(tarefa.status) && <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onStart(tarefa)} type="button">Iniciar</button>}
            {canExecuteTask && ['em_progresso','reenviada'].includes(tarefa.status) && <button className="btn btn-primary btn-sm task-action-btn" onClick={() => onOpen(tarefa)} type="button">Executar</button>}
            {canReviewTask && tarefa.status === 'concluida' && <button className="btn btn-primary btn-sm task-action-btn" onClick={() => onApprove(tarefa)} type="button">Aprovar</button>}
            {canReviewTask && ['concluida', 'nao_concluida'].includes(tarefa.status) && <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onReturn(tarefa)} type="button">Devolver</button>}
            {canReviewTask && (tarefa.status === 'aprovada' || (distributedTask && tarefa.status === 'concluida')) && <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onComplemento(tarefa)} type="button"><RotateCcw size={12} /> Complementar</button>}
            {canDeleteTarefa(tarefa, userId, isGestor) && <button className="btn btn-ghost btn-sm task-action-icon danger" title="Apagar" onClick={() => onDelete(tarefa.id)} type="button"><Trash2 size={13} /></button>}
          </>
        )}
      </div>
    </article>
  )
}

const MEDALHAS = ['🥇', '🥈', '🥉']

function RankingEquipe({ ranking, onChangePeriodo }: {
  ranking: { periodo: string; ranking: any[]; resumo: any } | null
  onChangePeriodo: (p: string) => void
}) {
  const lista = Array.isArray(ranking?.ranking) ? ranking!.ranking : []
  const resumo = ranking?.resumo || {}
  const maxPontos = Math.max(1, ...lista.map((m: any) => Number(m.pontos || 0)))
  const periodoOpcoes = (() => {
    const opts: { value: string; label: string }[] = [
      { value: 'todos', label: 'Geral' },
      { value: 'semana', label: 'Semana atual' },
      { value: 'mes', label: 'Mês atual' },
    ]
    const now = new Date()
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
    }
    return opts
  })()

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}><Trophy size={17} /> Desafio da equipe</strong>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>Pontuação só entra após aprovação do gestor. Ranking exclusivo para membros executores.</span>
          </div>
          <select className="form-input" style={{ width: 'auto', minWidth: 180, fontSize: 13 }} value={ranking?.periodo || 'todos'} onChange={e => onChangePeriodo(e.target.value)}>
            {periodoOpcoes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <span className="badge badge-primary">{Number(resumo.disponiveis || 0)} para pegar</span>
          <span className="badge badge-warning">{Number(resumo.em_execucao || 0)} em execução</span>
          <span className="badge badge-success">{Number(resumo.concluidas || 0)} aprovadas/concluídas</span>
          <span className="badge badge-primary">{Number(resumo.pontos || 0)} pts</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {lista.length === 0 ? (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 26, textAlign: 'center', color: 'var(--text3)' }}>
            Ainda não há membros no ranking.
          </div>
        ) : lista.map((membro: any, index: number) => {
          const pontos = Number(membro.pontos || 0)
          const subtarefas = Number(membro.subtarefas_executadas || 0)
          const tarefas = Number(membro.tarefas_executadas || 0)
          const pct = Math.max(4, Math.round((pontos / maxPontos) * 100))
          const isTop3 = index < 3
          const medalha = MEDALHAS[index] || null
          const historico = Array.isArray(membro.historico) ? membro.historico : []

          return (
            <div key={membro.id || index} style={{ background: 'var(--bg2)', border: `1px solid ${isTop3 && pontos > 0 ? 'rgba(245,158,11,.35)' : 'var(--border)'}`, borderRadius: 14, padding: '12px 14px', display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 12, alignItems: 'start' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: isTop3 && pontos > 0 ? 'rgba(245,158,11,.14)' : 'var(--bg3)', color: isTop3 && pontos > 0 ? '#F59E0B' : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: medalha ? 18 : 13 }}>
                {medalha && pontos > 0 ? medalha : `${index + 1}º`}
              </div>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 14, overflowWrap: 'anywhere' }}>{membro.nome || 'Membro'}</strong>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>{subtarefas || tarefas ? `${subtarefas} subtarefa(s) · ${tarefas} tarefa(s)` : 'Nenhuma pontuação aprovada no período'}</span>
                <div style={{ marginTop: 6, height: 5, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pontos > 0 ? 'linear-gradient(90deg, var(--primary), #10B981)' : 'var(--border)', borderRadius: 999, transition: 'width .4s ease' }} />
                </div>
                {historico.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600 }}>Ver histórico de pontos</summary>
                    <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                      {historico.slice(0, 12).map((h: any, i: number) => (
                        <div key={`${h.tarefa_id || i}-${i}`} className="ranking-history-item">
                          <div className="ranking-history-main">
                            <strong>{h.subtarefa_titulo || h.tarefa_titulo || 'Tarefa aprovada'}</strong>
                            {h.subtarefa_titulo && <span>{h.tarefa_titulo}</span>}
                            <em>{[h.dificuldade ? `Dificuldade: ${String(h.dificuldade)}` : '', h.aprovado_em ? `Aprovada em ${fmtDateTime(h.aprovado_em)}` : ''].filter(Boolean).join(' · ')}</em>
                          </div>
                          <strong className="ranking-history-points">+{Number(h.pontos || 0)} pts</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <strong style={{ display: 'block', fontSize: 20, color: pontos > 0 ? 'var(--success)' : 'var(--text3)', lineHeight: 1 }}>{pontos}</strong>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>pontos</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
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
  const [escopo, setEscopo] = useState<'pessoais' | 'equipe' | 'disponiveis' | 'ranking' | 'todas' | 'recentes'>('pessoais')
  const [statusTab, setStatusTab] = useState<'todos' | 'pendentes' | 'execucao' | 'concluidas' | 'atrasadas' | 'ultimas'>('todos')
  const [ranking, setRanking] = useState<{ periodo: string; ranking: any[]; resumo: any } | null>(null)
  const [periodoRanking, setPeriodoRanking] = useState(() =>
    localStorage.getItem('nexus:ranking-periodo') || 'todos'
  )

  // Permite abrir diretamente a aba de ranking via query param (?tab=ranking)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab') || params.get('escopo')
    if (tab === 'ranking') {
      setEscopo('ranking')
    }
  }, [location.search])

  const loadRanking = useCallback(async (periodo: string) => {
    try {
      const rk = await tarefasApi.ranking(periodo).catch(() => null)
      setRanking(rk)
    } catch {}
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ts, ms, rk] = await Promise.all([
        tarefasApi.list(),
        isGestor ? equipeApi.membros() : Promise.resolve([]),
        tarefasApi.ranking(periodoRanking).catch(() => null),
      ])
      setTarefas(Array.isArray(ts) ? ts : [])
      setMembros(Array.isArray(ms) ? ms : [])
      setRanking(rk)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar tarefas.', 'error')
    } finally { setLoading(false) }
  }, [isGestor, periodoRanking])

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
    // Tarefas da equipe nunca entram em Minhas tarefas pessoais, mesmo quando
    // o usuário assumiu a execução ou recebeu um item de checklist. Elas ficam
    // no quadro da equipe, como solicitado para a operação do Nexus/Destrava.
    if (taskScope(t) === 'equipe' || isFreeTeamTask(t)) return false
    const executorForMe = t.responsavel_id === uid || taskHasChecklistForUser(t, uid)
    return executorForMe || (!t.responsavel_id && t.criado_por === uid)
  }, [user?.id])

  const isTeamAssignedTask = useCallback((t: Tarefa) => {
    const uid = user?.id || ''
    if (!uid) return false
    if (taskScope(t) === 'equipe' || isFreeTeamTask(t)) return true
    return (!!t.responsavel_id && t.responsavel_id !== uid) || taskHasChecklistForOtherMember(t, uid)
  }, [user?.id])

  const recentesIds = useMemo(() => new Set(
    [...tarefasVisiveis]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, 12)
      .map(t => t.id)
  ), [tarefasVisiveis])

  const scoped = useMemo(() => tarefasVisiveis.filter(t => {
    if (escopo === 'pessoais') return isPersonalTask(t)
    if (escopo === 'equipe') return isTeamAssignedTask(t) || isAvailableFreeTask(t)
    if (escopo === 'disponiveis') return isAvailableFreeTask(t)
    if (escopo === 'ranking') return true
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
    if (statusTab === 'pendentes' && !['pendente', 'devolvida', 'reenviada'].includes(String(t.status))) return false
    if (statusTab === 'execucao' && String(t.status) !== 'em_progresso') return false
    if (statusTab === 'concluidas' && !['concluida', 'aprovada'].includes(String(t.status))) return false
    if (statusTab === 'atrasadas' && !isOverdue(t.prazo, t.status)) return false
    if (statusTab === 'ultimas' && !recentesIds.has(t.id)) return false
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
    if (q && !`${t.titulo} ${t.descricao || ''} ${t.criado_por_nome || ''} ${t.responsavel_nome_perfil || t.responsavel_nome || ''} ${t.origem_nome || ''} ${(t.checklist || []).map(i => `${i.texto} ${i.descricao || ''} ${i.responsavel_nome || ''}`).join(' ')}`.toLowerCase().includes(q)) return false
    return true
  }).sort((a, b) => new Date(taskReferenceDate(b) || 0).getTime() - new Date(taskReferenceDate(a) || 0).getTime()), [scoped, search, status, statusTab, prioridade, membroFiltro, mesFiltro, anoFiltro, recentesIds])

  const pessoalCount = useMemo(() => tarefasVisiveis.filter(isPersonalTask).length, [tarefasVisiveis, isPersonalTask])
  const equipeCount = useMemo(() => tarefasVisiveis.filter(t => isTeamAssignedTask(t) || isAvailableFreeTask(t)).length, [tarefasVisiveis, isTeamAssignedTask])
  const recentesCount = recentesIds.size
  const disponiveisCount = useMemo(() => tarefasVisiveis.filter(isAvailableFreeTask).length, [tarefasVisiveis])
  const quickCounts = useMemo(() => ({
    todos: scoped.length,
    pendentes: scoped.filter(t => ['pendente', 'devolvida', 'reenviada'].includes(String(t.status))).length,
    execucao: scoped.filter(t => t.status === 'em_progresso').length,
    concluidas: scoped.filter(t => ['concluida', 'aprovada'].includes(String(t.status))).length,
    atrasadas: scoped.filter(t => isOverdue(t.prazo, t.status)).length,
    ultimas: scoped.filter(t => recentesIds.has(t.id)).length,
  }), [scoped, recentesIds])

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
    setStatusTab('todos')
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

  async function pegarTarefa(t: Tarefa) {
    try {
      const saved = await tarefasApi.pegar(t.id)
      updateSaved(saved)
      await load()
      toast('Tarefa assumida. Conclua esta antes de assumir outra tarefa livre.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao assumir tarefa.', 'error')
    }
  }

  async function approve(t: Tarefa) {
    if (!confirm('Aprovar esta tarefa? Verifique os arquivos da tarefa antes de aprovar.')) return
    try {
      updateSaved(await tarefasApi.aprovar(t.id))
      await Promise.all([load(), loadRanking(periodoRanking)])
      toast('Tarefa aprovada e pontuação do ranking atualizada.')
    }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao aprovar.', 'error') }
  }

  async function devolver(t: Tarefa) {
    const motivo = prompt('Informe a ressalva/correção necessária:')
    if (!motivo?.trim()) return
    try { updateSaved(await tarefasApi.devolver(t.id, motivo.trim())); toast('Tarefa devolvida.') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao devolver.', 'error') }
  }

  async function enviarLembreteManual(t: Tarefa) {
    const mensagem = prompt('Mensagem do lembrete para responsável/equipe:', `A tarefa "${t.titulo}" precisa de atenção. Verifique o prazo e execute ou atualize sua parte.`)
    if (mensagem === null) return
    try {
      const result = await tarefasApi.enviarLembrete(t.id, mensagem.trim())
      toast(`Lembrete enviado para ${result.enviados || 0} destinatário(s).`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao enviar lembrete.', 'error')
    }
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
          <p style={{ margin: 0, color: 'var(--text3)', fontSize: 13 }}>{escopo === 'pessoais' ? 'Minhas tarefas' : escopo === 'equipe' ? 'Tarefas do time' : escopo === 'recentes' ? 'Últimas movimentações' : escopo === 'ranking' ? 'Histórico e pontuação dos membros' : 'Todas as tarefas'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEdit(null); setModalOpen(true) }} type="button"><Plus size={16} /> {t('tasks.newButton')}</button>
      </header>

      <section className="task-smart-tabs" aria-label="Tipo de tarefas">
        {[
          { id: 'pessoais', label: 'Tarefas pessoais', count: pessoalCount, hint: 'Minhas' },
          { id: 'equipe', label: 'Tarefas do time', count: equipeCount, hint: 'Equipe' },
          { id: 'recentes', label: 'Últimas tarefas', count: recentesCount, hint: 'Recentes' },
          { id: 'ranking', label: 'Ranking', count: Array.isArray(ranking?.ranking) ? ranking!.ranking.length : 0, hint: 'Pontos' },
          { id: 'todas', label: 'Todas', count: tarefasVisiveis.length, hint: 'Geral' },
        ].map(tab => {
          const active = escopo === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              className={active ? 'task-smart-tab active' : 'task-smart-tab'}
              onClick={() => setEscopo(tab.id as 'pessoais' | 'equipe' | 'disponiveis' | 'ranking' | 'todas' | 'recentes')}
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

      <section className="task-flow-tabs" aria-label="Visão rápida das tarefas">
        {[
          { id: 'todos', label: 'Todas', count: quickCounts.todos, hint: 'Visão geral' },
          { id: 'pendentes', label: 'Pendentes', count: quickCounts.pendentes, hint: 'Aguardando ação' },
          { id: 'execucao', label: 'Em execução', count: quickCounts.execucao, hint: 'Em andamento' },
          { id: 'concluidas', label: 'Concluídas', count: quickCounts.concluidas, hint: 'Entregues/aprovadas' },
          { id: 'atrasadas', label: 'Atrasadas', count: quickCounts.atrasadas, hint: 'Cobrança' },
          { id: 'ultimas', label: 'Últimas', count: quickCounts.ultimas, hint: 'Movimentadas' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            className={statusTab === tab.id ? 'task-flow-tab active' : 'task-flow-tab'}
            onClick={() => {
              setStatusTab(tab.id as typeof statusTab)
              setStatus('todos')
              if (tab.id === 'ultimas') setEscopo('recentes')
              if (tab.id !== 'ultimas' && escopo === 'recentes') setEscopo('todas')
            }}
          >
            <strong>{tab.label}</strong>
            <span>{tab.count}</span>
            <em>{tab.hint}</em>
          </button>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
        {stats.map(([label, value, color]) => <div key={String(label)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 21, fontWeight: 600, color: String(color) }}>{String(value)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 650 }}>{String(label)}</div>
        </div>)}
      </section>

      <section className="task-filters-panel" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14, fontWeight: 750 }}>{t('tasks.filters.title')}</strong>
          <button className="btn btn-ghost" type="button" onClick={limparFiltros} style={{ minHeight: 34, padding: '7px 10px', fontSize: 12 }}>{t('tasks.filters.clear')}</button>
        </div>
        <div className="task-filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, max-content))', gap: 8 }}>
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
        <div className="task-report-list">
          {escopo === 'ranking' ? <RankingEquipe ranking={ranking} onChangePeriodo={p => { setPeriodoRanking(p); localStorage.setItem('nexus:ranking-periodo', p); loadRanking(p) }} /> : filtered.length === 0 ? <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 30, textAlign: 'center', color: 'var(--text3)' }}>{escopo === 'pessoais' ? 'Nenhuma tarefa pessoal encontrada.' : escopo === 'equipe' ? 'Nenhuma tarefa do time encontrada.' : statusTab !== 'todos' ? 'Nenhuma tarefa encontrada nesta aba.' : escopo === 'recentes' ? 'Nenhuma tarefa recente encontrada.' : 'Nenhuma tarefa encontrada.'}</div> : filtered.map(t => (
            <TarefaCard key={t.id} tarefa={t} userId={user?.id || ''} isGestor={!!isGestor}
              onOpen={setDetalhe}
              onEdit={(x) => { setEdit(x); setModalOpen(true) }}
              onDelete={remove}
              onStart={startTask}
              onPegar={pegarTarefa}
              onResponder={setDetalhe}
              onApprove={approve}
              onReturn={devolver}
              onComplemento={setComplemento}
              onHistory={setHistorico}
              onAnexos={setAnexos}
              onReminder={enviarLembreteManual}
            />
          ))}
        </div>
      )}

      {modalOpen && <TarefaModal tarefa={edit} membros={membros} onClose={() => { setModalOpen(false); setEdit(null) }} onSaved={(t) => { updateSaved(t); setModalOpen(false); setEdit(null) }} />}
      {responder && <RespostaModal tarefa={responder} onClose={() => setResponder(null)} onSaved={(t) => { updateSaved(t); setResponder(null) }} />}
      {historico && <HistoricoModal tarefa={historico} onClose={() => setHistorico(null)} />}
      {detalhe && <TarefaDetalheModal tarefa={detalhe} membros={membros} isGestor={isGestor} userId={user?.id || ''} onClose={() => { setDetalhe(null); if (new URLSearchParams(location.search).get('task')) navigate('/tarefas', { replace: true }) }} onSaved={updateSaved} onAnexos={setAnexos} onResponder={setDetalhe} onApprove={approve} onReturn={devolver} onComplemento={setComplemento} onReminder={enviarLembreteManual} />}
      {complemento && <ComplementoModal tarefa={complemento} onClose={() => setComplemento(null)} onSaved={(t) => { updateSaved(t); setComplemento(null); setDetalhe(prev => prev?.id === t.id ? t : prev) }} />}
      {anexos && <AnexosModal tarefa={anexos} onClose={() => setAnexos(null)} onChanged={load} />}
    </div>
  )
}
