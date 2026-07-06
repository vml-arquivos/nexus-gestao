import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode, DragEvent } from 'react'
import {
  Plus, Search, Calendar, User, CheckCircle2, Clock, AlertCircle, XCircle,
  RotateCcw, Trash2, Edit3, X, Loader, MessageSquare, History, Send,
  Paperclip, Upload, Download, FileText, Copy, Trophy, Printer,
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


const SCORE_MAX = 20

const CHECKLIST_DIFFICULTY_OPTIONS: Array<{ value: ChecklistDifficulty; label: string; points: number; hint: string }> = [
  { value: 'nivel_1', label: 'Nível 1', points: 0, hint: 'Ação simples, apenas registro ou acompanhamento' },
  { value: 'nivel_2', label: 'Nível 2', points: 1, hint: 'Baixa complexidade' },
  { value: 'nivel_3', label: 'Nível 3', points: 3, hint: 'Exige atenção e conferência' },
  { value: 'nivel_4', label: 'Nível 4', points: 5, hint: 'Exige análise ou validação detalhada' },
  { value: 'nivel_5', label: 'Nível 5', points: 20, hint: 'Alta complexidade e impacto' },
]

function normalizeDifficultyValue(value?: ChecklistDifficulty | string): ChecklistDifficulty {
  if (value === 'facil') return 'nivel_2'
  if (value === 'medio') return 'nivel_3'
  if (value === 'dificil') return 'nivel_4'
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

function taskPointsFromDifficulty(value?: ChecklistDifficulty | string) {
  return difficultyPoints(value)
}

type PontuacaoEscopo = 'tarefa' | 'subtarefas' | 'ambos'

function normalizePontuacaoEscopo(value?: unknown): PontuacaoEscopo {
  const raw = String(value || '').trim().toLowerCase()
  if (['tarefa', 'task', 'somente_tarefa', 'apenas_tarefa'].includes(raw)) return 'tarefa'
  if (['subtarefa', 'subtarefas', 'checklist', 'checklists', 'somente_subtarefas', 'apenas_subtarefas'].includes(raw)) return 'subtarefas'
  if (['ambos', 'both', 'tarefa_e_subtarefas', 'tarefa_subtarefas', 'task_and_checklist', 'task_checklist'].includes(raw)) return 'ambos'
  // Tarefas antigas sem configuração explícita seguem a mesma regra do backend.
  return 'tarefa'
}

function taskPontuacaoEscopo(tarefa?: Tarefa | null): PontuacaoEscopo {
  // Nova lista mantém a escolha padrão atual; registros antigos sem metadado
  // explícito são interpretados de forma idêntica no frontend e no backend.
  if (!tarefa) return 'ambos'
  const payload = (tarefa.origem_payload || {}) as Record<string, any>
  return normalizePontuacaoEscopo((tarefa as any)?.pontuacao_escopo || payload?.nexus_pontuacao_escopo || payload?.pontuacao_escopo || payload?.pontuacao_tipo)
}

function pontuacaoIncluiTarefa(scope: PontuacaoEscopo) {
  return scope === 'tarefa' || scope === 'ambos'
}

function pontuacaoIncluiSubtarefas(scope: PontuacaoEscopo) {
  return scope === 'subtarefas' || scope === 'ambos'
}

function taskIsSurprise(tarefa?: Tarefa | null) {
  const payload = (tarefa?.origem_payload || {}) as Record<string, any>
  return Boolean(payload?.nexus_tarefa_surpresa || payload?.tarefa_surpresa || payload?.surpresa_tarefa)
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

type ObjectiveSubitem = { id: string; texto: string; feito?: boolean }

function normalizeObjectiveSubitems(value?: unknown): ObjectiveSubitem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item: any) => ({
      id: item?.id || nanoid(),
      texto: String(item?.texto || item?.title || item?.label || '').trim(),
      feito: Boolean(item?.feito),
    }))
    .filter(item => item.texto)
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
    assumido_por: item.assumido_por || undefined,
    executor_id: item.executor_id || undefined,
    aceita_por: item.aceita_por || undefined,
    concluido_por: item.concluido_por || undefined,
    feito_por: item.feito_por || undefined,
    dificuldade: (item as any).dificuldade || difficultyFromPoints(Number((item as any).pontuacao ?? 3)),
    pontuacao: Math.max(0, Math.min(SCORE_MAX, Number((item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)))),
    subtarefas: normalizeObjectiveSubitems((item as any).subtarefas || (item as any).subtasks),
    revelar_apos_assumir: Boolean((item as any).revelar_apos_assumir),
    oculta_ate_assumir: Boolean((item as any).oculta_ate_assumir),
    feito: Boolean(item.feito),
  }))
}

function checklistExecutorName(item: ChecklistItem, tarefa: Tarefa) {
  if (item.responsavel_nome) return item.responsavel_nome
  if (tarefa.responsavel_nome_perfil || tarefa.responsavel_nome) return tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'Executor'
  if (tarefa.modo_distribuicao === 'livre_equipe') return tarefa.aceita_por_nome || 'Livre para quem assumir'
  return tarefa.criado_por_nome || 'Executor'
}

function checklistItemBelongsToUser(item: ChecklistItem, userId?: string) {
  if (!userId) return false
  const anyItem = item as any
  return item.responsavel_id === userId || anyItem.assumido_por === userId || anyItem.executor_id === userId || anyItem.aceita_por === userId || anyItem.concluido_por === userId || anyItem.feito_por === userId
}

function checklistItemAssignmentId(item: ChecklistItem) {
  return item.responsavel_id || item.assumido_por || item.executor_id || item.aceita_por
}

function isChecklistItemExecutor(item: ChecklistItem, tarefa: Tarefa, userId?: string) {
  if (!userId) return false
  const currentOwner = checklistItemAssignmentId(item)
  if (currentOwner) return currentOwner === userId
  const completionOwner = item.concluido_por || item.feito_por
  if (item.feito && completionOwner) return completionOwner === userId
  return tarefa.aceita_por === userId || tarefa.responsavel_id === userId || (!tarefa.responsavel_id && tarefa.criado_por === userId)
}

function taskHasChecklistForUser(tarefa: Tarefa, userId?: string) {
  if (!userId) return false
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => checklistItemBelongsToUser(item, userId))
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
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => {
    const owner = checklistItemAssignmentId(item)
    return !!owner && owner !== userId
  })
}

function taskHasDistributedChecklist(tarefa: Tarefa) {
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => !!checklistItemAssignmentId(item))
}

function maskSurpriseChecklistItemForViewer(item: ChecklistItem, tarefa: Tarefa, userId?: string) {
  if (!isSurpriseChecklistItem(item)) return item
  if (isChecklistItemExecutor(item, tarefa, userId)) return item
  const pts = Number((item as any).pontuacao ?? difficultyPoints((item as any).dificuldade || 'nivel_3'))
  return {
    ...item,
    texto: `Tarefa valendo ${pts} ponto${pts === 1 ? '' : 's'} — assuma para revelar`,
    descricao: undefined,
    oculta_ate_assumir: true,
  }
}

function visibleChecklistItems(tarefa: Tarefa, userId: string, isGestor: boolean) {
  const items = normalizeChecklistItems(tarefa.checklist)
  if (isGestor) return items
  const assigned = items.filter(item => isChecklistItemExecutor(item, tarefa, userId))
  // Depois de assumir/receber uma subtarefa, o membro vê somente a parte dele.
  if (assigned.length) return assigned
  // Antes de assumir, ele vê apenas subtarefas livres em aberto. As surpresas ficam mascaradas.
  return items
    .filter(item => !item.feito && !checklistItemAssignmentId(item))
    .map(item => maskSurpriseChecklistItemForViewer(item, tarefa, userId))
}

function isSurpriseChecklistItem(item: ChecklistItem) {
  return Boolean((item as any).revelar_apos_assumir || (item as any).oculta_ate_assumir)
}

function checklistDisplayText(item: ChecklistItem) {
  if ((item as any).oculta_ate_assumir) {
    const pts = Number((item as any).pontuacao ?? difficultyPoints((item as any).dificuldade || 'nivel_3'))
    return `Tarefa valendo ${pts} ponto${pts === 1 ? '' : 's'} — assuma para revelar`
  }
  return item.texto
}

function checklistDisplayDesc(item: ChecklistItem) {
  if ((item as any).oculta_ate_assumir) return undefined
  return item.descricao
}

function checklistExecutorSummary(tarefa: Tarefa) {
  const map = new Map<string, { id: string; nome: string; total: number; feitos: number }>()
  normalizeChecklistItems(tarefa.checklist).forEach(item => {
    const key = item.responsavel_id || tarefa.responsavel_id || tarefa.criado_por || 'sem-responsavel'
    const nome = checklistExecutorName(item, tarefa)
    const current = map.get(key) || { id: key, nome, total: 0, feitos: 0 }
    current.total += 1
    if (item.feito) current.feitos += 1
    map.set(key, current)
  })
  return Array.from(map.values())
}

function memberMatchesTask(tarefa: Tarefa, memberId: string) {
  return tarefa.responsavel_id === memberId || tarefa.criado_por === memberId || tarefa.aceita_por === memberId || (tarefa.checklist || []).some(item => checklistItemBelongsToUser(item, memberId))
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
  return Array.isArray(tarefa.checklist) && tarefa.checklist.some(item => !item.feito && !checklistItemAssignmentId(item))
}

function isAvailableFreeTask(tarefa: Tarefa) {
  if (!isFreeTeamTask(tarefa) || ['concluida', 'aprovada', 'cancelada'].includes(String(tarefa.status))) return false
  // Regra: se qualquer membro já assumiu a tarefa inteira (aceita_por preenchido), ela não fica disponível para outros.
  // Tarefas surpresa também seguem essa regra (assumida = não disponível).
  if (tarefa.aceita_por) return false
  // Sem aceita_por: tarefa disponível para assumir
  return true
}

function firstOpenChecklistItemForCurrentUser(tarefa: Tarefa, userId?: string) {
  const items = normalizeChecklistItems(tarefa.checklist)
  return items.find(item =>
    !item.feito &&
    Boolean(item.id) &&
    (!checklistItemAssignmentId(item) || checklistItemBelongsToUser(item, userId))
  )
}

/** Tarefa livre já aceita por outro membro (não pelo usuário atual) */
function isAcceptedByOtherMember(tarefa: Tarefa, userId: string) {
  return isFreeTeamTask(tarefa) && !!tarefa.aceita_por && tarefa.aceita_por !== userId
}

function duplicateTaskVisualKey(tarefa: Tarefa) {
  // Tarefas de equipe devem aparecer como uma única entidade no painel do gestor.
  // Quando houver registros legados/repetidos com o mesmo título, descrição e prazo,
  // agrupamos visualmente sem apagar dados. O responsável principal não entra na chave
  // de tarefa da equipe, porque a execução pode estar distribuída nas tarefas da lista.
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
      checklistItemAssignmentId(item) || '',
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


function uniqueById<T extends { id?: string }>(items: T[]) {
  const map = new Map<string, T>()
  items.forEach(item => {
    if (!item?.id) return
    if (!map.has(item.id)) map.set(item.id, item)
  })
  return Array.from(map.values())
}

function helpForCurrentUser(items: any[], userId?: string) {
  if (!userId) return []
  return uniqueById(items || []).filter((a: any) => a.destinatario_id === userId && a.solicitante_id !== userId && a.status === 'pendente')
}

function helpRequestedByCurrentUser(items: any[], userId?: string) {
  if (!userId) return []
  return uniqueById(items || []).filter((a: any) => a.solicitante_id === userId && a.destinatario_id !== userId && ['pendente', 'respondida'].includes(String(a.status || '')))
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
  const [pontuacaoEscopo, setPontuacaoEscopo] = useState<PontuacaoEscopo>(() => taskPontuacaoEscopo(tarefa))
  const [tarefaSurpresa, setTarefaSurpresa] = useState(Boolean(taskIsSurprise(tarefa)))
  const [contaRanking, setContaRanking] = useState(tarefa?.conta_ranking !== false)
  const [responsavelId, setResponsavelId] = useState(tarefa?.id ? (tarefa?.responsavel_id || '') : (user?.id || ''))
  const [checklist, setChecklist] = useState<ChecklistItem[]>(normalizeChecklistItems(tarefa?.checklist))
  const [novoItem, setNovoItem] = useState('')
  const [novoItemDescricao, setNovoItemDescricao] = useState('')
  const [novoItemData, setNovoItemData] = useState('')
  const [novoItemResponsavelId, setNovoItemResponsavelId] = useState('')
  const [novoItemPontuacao, setNovoItemPontuacao] = useState('3')
  const [novoItemDificuldade, setNovoItemDificuldade] = useState<ChecklistDifficulty>('nivel_3')
  const [novoItemSurpresa, setNovoItemSurpresa] = useState(false)
  const [acoesListaTexto, setAcoesListaTexto] = useState('')
  const [obs, setObs] = useState(tarefa?.obs || '')
  const [destravaBusca, setDestravaBusca] = useState('')
  const [destravaTipo, setDestravaTipo] = useState<'empresa' | 'pessoa_fisica'>(() => {
    const origemTipo = String(tarefa?.origem_tipo || '').toLowerCase()
    return ['pessoa_fisica', 'pf', 'cliente', 'cliente_pf', 'clientes_pf'].includes(origemTipo) ? 'pessoa_fisica' : 'empresa'
  })
  const [destravaLoading, setDestravaLoading] = useState(false)
  const [destravaItens, setDestravaItens] = useState<DestravaCatalogoItem[]>([])
  const [destravaPesquisaExecutada, setDestravaPesquisaExecutada] = useState(false)
  const [destravaTotalResultados, setDestravaTotalResultados] = useState(0)
  const [destravaTotalCatalogo, setDestravaTotalCatalogo] = useState(0)
  const [destravaSelecionado, setDestravaSelecionado] = useState<DestravaCatalogoItem | null>(() => {
    if (tarefa?.origem_sistema === 'destrava' && tarefa?.origem_id) {
      return {
        id: tarefa.origem_id,
        tipo: ['pessoa_fisica', 'pf', 'cliente', 'cliente_pf', 'clientes_pf'].includes(String(tarefa.origem_tipo || '').toLowerCase())
          ? 'pessoa_fisica'
          : 'empresa',
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

  async function buscarCadastroDestrava() {
    const termo = destravaBusca.trim()
    if (termo.length < 2) {
      toast('Digite pelo menos 2 caracteres para pesquisar por nome, CPF/CNPJ, e-mail ou telefone.', 'error')
      return
    }

    setDestravaLoading(true)
    setDestravaPesquisaExecutada(true)
    try {
      const data = await destravaApi.empresasSincronizadas({
        tipo: destravaTipo,
        q: termo,
        limit: 50,
      })
      setDestravaItens(Array.isArray(data.items) ? data.items : [])
      setDestravaTotalResultados(Number(data.total || 0))
      setDestravaTotalCatalogo(Number(data.total_catalogo || 0))
    } catch (e) {
      setDestravaItens([])
      setDestravaTotalResultados(0)
      toast(e instanceof Error ? e.message : 'Erro ao pesquisar cadastros da Destrava.', 'error')
    } finally {
      setDestravaLoading(false)
    }
  }

  function selecionarTipoDestrava(tipo: 'empresa' | 'pessoa_fisica') {
    setDestravaTipo(tipo)
    setDestravaItens([])
    setDestravaPesquisaExecutada(false)
    setDestravaTotalResultados(0)
    if (destravaSelecionado && destravaSelecionado.tipo !== tipo) {
      setDestravaSelecionado(null)
    }
  }

  function limparPesquisaDestrava() {
    setDestravaBusca('')
    setDestravaItens([])
    setDestravaPesquisaExecutada(false)
    setDestravaTotalResultados(0)
  }

  function changeTipoTarefa(next: 'pessoal' | 'equipe') {
    setTipoTarefa(next)
    if (next === 'pessoal') {
      setModoDistribuicao('normal')
      setResponsavelId(user?.id || '')
      setPontuacao('0')
      setPontuacaoEscopo('tarefa')
      setContaRanking(false)
      setTarefaSurpresa(false)
      setNovoItemSurpresa(false)
      setNovoItemResponsavelId(user?.id || '')
      setNovoItemDificuldade('nivel_1')
      setNovoItemPontuacao('0')
      setChecklist(prev => prev.map(item => ({
        ...item,
        responsavel_id: user?.id || undefined,
        responsavel_nome: user?.nome || item.responsavel_nome,
        dificuldade: 'nivel_1',
        pontuacao: 0,
        revelar_apos_assumir: false,
      })))
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

  function parseAcoesLista(raw: string) {
    const linhas = String(raw || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)

    const acoes: string[] = []
    const possiveisTitulos: string[] = []

    linhas.forEach(line => {
      const semMarcador = line
        .replace(/^\(?\s*aç(?:ão|oes|ões)\s+da\s+(?:tarefa|lista)\s*\)?\s*:?$/i, '')
        .trim()
      if (!semMarcador) return

      const numerada = semMarcador.match(/^(?:[-*•]|\d{1,3}[\).\-–—])\s*(.+)$/)
      if (numerada?.[1]?.trim()) {
        acoes.push(numerada[1].trim())
        return
      }

      if (!acoes.length && possiveisTitulos.length === 0 && semMarcador.length > 8) {
        possiveisTitulos.push(semMarcador)
        return
      }

      acoes.push(semMarcador)
    })

    return { tituloSugerido: possiveisTitulos[0] || '', acoes }
  }

  function gerarChecklistAutomatico() {
    const { tituloSugerido, acoes } = parseAcoesLista(acoesListaTexto)
    if (!acoes.length) {
      toast('Cole as ações numeradas ou uma ação por linha para gerar o checklist.', 'error')
      return
    }

    if (!titulo.trim() && tituloSugerido) setTitulo(tituloSugerido)

    const novosItens: ChecklistItem[] = acoes.map(texto => ({
      id: nanoid(),
      texto,
      descricao: undefined,
      data: novoItemData || undefined,
      responsavel_id: tipoTarefa === 'pessoal' ? (user?.id || undefined) : (novoItemResponsavelId || undefined),
      responsavel_nome: tipoTarefa === 'pessoal' ? (user?.nome || undefined) : checklistResponsibleName(novoItemResponsavelId),
      dificuldade: tipoTarefa === 'pessoal' ? 'nivel_1' : novoItemDificuldade,
      pontuacao: tipoTarefa === 'pessoal' ? 0 : Math.max(0, Math.min(SCORE_MAX, Number(novoItemPontuacao || difficultyPoints(novoItemDificuldade)))),
      subtarefas: [],
      revelar_apos_assumir: tipoTarefa === 'pessoal' ? false : Boolean(tarefaSurpresa || novoItemSurpresa),
      feito: false,
    }))

    setChecklist(prev => [...prev, ...novosItens])
    setAcoesListaTexto('')
    toast(`${novosItens.length} ação${novosItens.length > 1 ? 'ões' : ''} adicionada${novosItens.length > 1 ? 's' : ''} ao checklist de execução.`)
  }

  function applyNovoItemDifficulty(next: ChecklistDifficulty) {
    setNovoItemDificuldade(next)
    setNovoItemPontuacao(String(difficultyPoints(next)))
  }


  function addItem() {
    if (!novoItem.trim()) { toast('Informe o nome da tarefa.', 'error'); return }
    if (tipoTarefa === 'equipe' && (novoItemPontuacao === '' || Number.isNaN(Number(novoItemPontuacao)) || Number(novoItemPontuacao) < 0 || Number(novoItemPontuacao) > SCORE_MAX)) { toast(`Informe a pontuação da tarefa entre 0 e ${SCORE_MAX} pontos.`, 'error'); return }
    setChecklist(prev => [...prev, {
      id: nanoid(),
      texto: novoItem.trim(),
      descricao: novoItemDescricao.trim() || undefined,
      data: novoItemData || undefined,
      responsavel_id: tipoTarefa === 'pessoal' ? (user?.id || undefined) : (novoItemResponsavelId || undefined),
      responsavel_nome: tipoTarefa === 'pessoal' ? (user?.nome || undefined) : checklistResponsibleName(novoItemResponsavelId),
      dificuldade: tipoTarefa === 'pessoal' ? 'nivel_1' : novoItemDificuldade,
      pontuacao: tipoTarefa === 'pessoal' ? 0 : Math.max(0, Math.min(SCORE_MAX, Number(novoItemPontuacao || 0))),
      subtarefas: [],
      revelar_apos_assumir: tipoTarefa === 'pessoal' ? false : Boolean(tarefaSurpresa || novoItemSurpresa),
      feito: false,
    }])
    setNovoItem('')
    setNovoItemDescricao('')
    setNovoItemData('')
    setNovoItemResponsavelId('')
    setNovoItemDificuldade('nivel_3')
    setNovoItemPontuacao('3')
    setNovoItemSurpresa(false)
  }

  const destravaSelectOptions = useMemo(() => {
    const map = new Map<string, DestravaCatalogoItem>()
    if (destravaSelecionado) map.set(`${destravaSelecionado.tipo}-${destravaSelecionado.id}`, destravaSelecionado)
    destravaItens.forEach(item => map.set(`${item.tipo}-${item.id}`, item))
    return Array.from(map.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  }, [destravaItens, destravaSelecionado])

  async function salvar() {
    if (loading) return
    const tituloFinal = titulo.trim() || (tipoTarefa === 'equipe' ? 'Lista de tarefas da equipe' : 'Lista pessoal')
    if (tipoTarefa === 'equipe' && checklist.length === 0) { toast('Adicione pelo menos uma tarefa na lista.', 'error'); return }
    const exigePontosNasTarefas = tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopo)
    const invalidItem = checklist.find(item => !String(item.texto || '').trim() || (exigePontosNasTarefas && ((item as any).pontuacao === undefined || (item as any).pontuacao === null || Number.isNaN(Number((item as any).pontuacao)))))
    if (invalidItem) { toast(exigePontosNasTarefas ? 'Cada tarefa precisa ter nome e pontuação.' : 'Cada ação do checklist precisa ter nome.', 'error'); return }
    const invalidSubitem = checklist.some(item => Array.isArray((item as any).subtarefas) && (item as any).subtarefas.some((sub: any) => !String(sub?.texto || '').trim()))
    if (invalidSubitem) { toast('Cada item dentro da tarefa precisa ter nome.', 'error'); return }
    const checklistFinal = checklist.map(item => tipoTarefa === 'pessoal'
      ? {
          ...item,
          responsavel_id: user?.id || undefined,
          responsavel_nome: user?.nome || item.responsavel_nome,
          dificuldade: 'nivel_1' as ChecklistDifficulty,
          pontuacao: 0,
          revelar_apos_assumir: false,
        }
      : { ...item, revelar_apos_assumir: tarefaSurpresa ? true : Boolean((item as any).revelar_apos_assumir) })
    setLoading(true)
    try {
      const payload: Partial<Tarefa> = {
        titulo: tituloFinal,
        descricao: descricao.trim() || undefined,
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: isGestor ? ((modoDistribuicao === 'livre_equipe' ? null : (tipoTarefa === 'pessoal' ? (user?.id || null) : (responsavelId || null))) as any) : (isMemberRequest ? responsavelId : user?.id),
        escopo: isGestor ? tipoTarefa : (isMemberRequest ? 'equipe' : 'pessoal'),
        modo_distribuicao: isGestor ? modoDistribuicao : 'normal',
        pontuacao: tipoTarefa === 'equipe' && pontuacaoIncluiTarefa(pontuacaoEscopo) ? Number(pontuacao || 0) : 0,
        pontuacao_escopo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,
        pontuacao_tipo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,
        conta_ranking: tipoTarefa === 'equipe' ? contaRanking : false,
        checklist: checklistFinal,
        obs: obs.trim() || undefined,
        origem_sistema: destravaSelecionado ? 'destrava' : undefined,
        origem_tipo: destravaSelecionado?.tipo || undefined,
        origem_id: destravaSelecionado?.id || undefined,
        origem_nome: destravaSelecionado?.nome || undefined,
        origem_url: destravaSelecionado?.url || undefined,
        tarefa_surpresa: tipoTarefa === 'equipe' ? tarefaSurpresa : false,
        origem_payload: tipoTarefa === 'equipe'
          ? { ...(destravaSelecionado?.metadata || {}), nexus_tarefa_surpresa: Boolean(tarefaSurpresa), nexus_pontuacao_escopo: pontuacaoEscopo }
          : (destravaSelecionado?.metadata || undefined),
      }
      const saved = tarefa?.id ? await tarefasApi.update(tarefa.id, payload) : await tarefasApi.create(payload)
      onSaved(saved)
      onClose()
      toast(tarefa?.id ? 'Lista atualizada.' : 'Lista criada com sucesso.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar tarefa.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalBase title={tarefa?.id ? 'Editar lista de tarefas' : 'Nova lista de tarefas'} onClose={onClose}>
      <div className="task-form-modal">
        <div className="form-group">
          <label className="form-label">Título da lista <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(opcional)</span></label>
          <input className="form-input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Organização da demanda da empresa / Deixe vazio para gerar automático" />
        </div>
        <div className="form-group">
          <label className="form-label">Descrição da lista</label>
          <textarea className="form-input" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes e instruções" />
        </div>
        {isGestor && (
          <div className="form-group">
            <label className="form-label">Cliente da Destrava <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(opcional)</span></label>

            <div className="task-type-selector" role="radiogroup" aria-label="Tipo de cliente da Destrava" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={destravaTipo === 'empresa' ? 'active' : ''}
                aria-pressed={destravaTipo === 'empresa'}
                onClick={() => selecionarTipoDestrava('empresa')}
              >
                Clientes PJ
              </button>
              <button
                type="button"
                className={destravaTipo === 'pessoa_fisica' ? 'active' : ''}
                aria-pressed={destravaTipo === 'pessoa_fisica'}
                onClick={() => selecionarTipoDestrava('pessoa_fisica')}
              >
                Clientes PF
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input"
                value={destravaBusca}
                onChange={e => {
                  setDestravaBusca(e.target.value)
                  setDestravaPesquisaExecutada(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void buscarCadastroDestrava()
                  }
                }}
                placeholder={destravaTipo === 'pessoa_fisica'
                  ? 'Digite nome, CPF, e-mail ou telefone'
                  : 'Digite razão social, nome fantasia, CNPJ, e-mail ou telefone'}
                autoComplete="off"
              />
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={destravaLoading || destravaBusca.trim().length < 2}
                onClick={() => void buscarCadastroDestrava()}
              >
                {destravaLoading ? <Loader size={14} /> : <Search size={14} />} Pesquisar
              </button>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              A pesquisa inicia somente após 2 caracteres e retorna até 50 resultados, mantendo o formulário rápido mesmo com milhares de cadastros.
            </div>

            {(destravaPesquisaExecutada || destravaSelecionado) && (
              <select
                className="form-input"
                style={{ marginTop: 10 }}
                value={destravaSelecionado ? `${destravaSelecionado.tipo}-${destravaSelecionado.id}` : ''}
                onChange={e => {
                  const value = e.target.value
                  if (!value) { setDestravaSelecionado(null); return }
                  const item = destravaSelectOptions.find(i => `${i.tipo}-${i.id}` === value) || null
                  setDestravaSelecionado(item)
                  if (item) setDestravaTipo(item.tipo === 'pessoa_fisica' ? 'pessoa_fisica' : 'empresa')
                }}
              >
                <option value="">
                  {destravaLoading
                    ? 'Pesquisando cadastros...'
                    : destravaItens.length
                      ? `Selecione um cliente ${destravaTipo === 'pessoa_fisica' ? 'PF' : 'PJ'}`
                      : 'Nenhum cadastro selecionado'}
                </option>
                {destravaSelectOptions.map(item => (
                  <option key={`${item.tipo}-${item.id}`} value={`${item.tipo}-${item.id}`}>
                    {item.tipo === 'pessoa_fisica' ? 'PF' : 'PJ'} · {item.nome}{item.documento ? ` · ${item.documento}` : ''}
                  </option>
                ))}
              </select>
            )}

            {destravaPesquisaExecutada && !destravaLoading && (
              <div className="muted" style={{ marginTop: 7 }}>
                {destravaTotalResultados > 0
                  ? `${destravaTotalResultados} resultado(s) encontrado(s). ${destravaItens.length < destravaTotalResultados ? `Exibindo os primeiros ${destravaItens.length}. Refine a busca para localizar mais rápido.` : ''}`
                  : destravaTotalCatalogo === 0
                    ? 'O catálogo local ainda está vazio. Sincronize PJ e PF antes da primeira pesquisa.'
                    : 'Nenhum cadastro encontrado para os filtros informados.'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" type="button" disabled={destravaLoading} onClick={async () => {
                setDestravaLoading(true)
                try {
                  const sync = await destravaApi.sincronizarEmpresas()
                  toast(`${sync.sincronizadas} cadastro(s) de PJ e PF sincronizado(s) com a Destrava.`)
                  if (destravaBusca.trim().length >= 2) {
                    const data = await destravaApi.empresasSincronizadas({ tipo: destravaTipo, q: destravaBusca.trim(), limit: 50 })
                    setDestravaItens(data.items || [])
                    setDestravaTotalResultados(Number(data.total || 0))
                    setDestravaTotalCatalogo(Number(data.total_catalogo || sync.sincronizadas || 0))
                    setDestravaPesquisaExecutada(true)
                  } else {
                    setDestravaTotalCatalogo(Number(sync.sincronizadas || 0))
                  }
                } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao sincronizar clientes da Destrava.', 'error') }
                finally { setDestravaLoading(false) }
              }}>{destravaLoading ? <Loader size={13} /> : <RotateCcw size={13} />} Sincronizar PJ e PF</button>
              {(destravaBusca || destravaPesquisaExecutada) && (
                <button className="btn btn-ghost btn-sm" type="button" disabled={destravaLoading} onClick={limparPesquisaDestrava}>
                  <X size={13} /> Limpar busca
                </button>
              )}
            </div>

            {destravaSelecionado && (
              <div className="integration-help">
                <strong>{destravaSelecionado.tipo === 'pessoa_fisica' ? 'Cliente PF' : 'Cliente PJ'}:</strong> {destravaSelecionado.nome}
                {destravaSelecionado.documento ? ` · ${destravaSelecionado.documento}` : ''}. Ao executar ou anexar arquivos, o histórico do cadastro na Destrava será atualizado.
              </div>
            )}
          </div>
        )}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Prazo <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(pode ser prorrogado pelo gestor)</span></label>
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
            <label className="form-label">Tipo da lista</label>
            <div className="task-type-selector" role="radiogroup" aria-label="Tipo da lista">
              <button
                type="button"
                className={tipoTarefa === 'pessoal' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => changeTipoTarefa('pessoal')}
              >
                <strong>Lista pessoal</strong>
                <span>Minha execução, separada das tarefas do time.</span>
              </button>
              <button
                type="button"
                className={tipoTarefa === 'equipe' ? 'task-type-option active' : 'task-type-option'}
                onClick={() => changeTipoTarefa('equipe')}
              >
                <strong>Lista de tarefas da equipe</strong>
                <span>Controle do gestor, com ações do tarefas para membros.</span>
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
                <span>Escolha um responsável ou distribua pelas tarefas da lista.</span>
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
        {isGestor && tipoTarefa === 'equipe' && (
          <div className="task-points-box">
            <div className="form-group">
              <label className="form-label">Onde a pontuação será contabilizada?</label>
              <select
                className="form-input"
                value={pontuacaoEscopo}
                onChange={e => setPontuacaoEscopo(e.target.value as PontuacaoEscopo)}
              >
                <option value="tarefa">Somente pontuação da lista</option>
                <option value="subtarefas">Somente pontuação das tarefas da lista</option>
                <option value="ambos">Pontuação da lista e das tarefas</option>
              </select>
            </div>
            {pontuacaoIncluiTarefa(pontuacaoEscopo) && (
              <>
                <div className="form-group">
                  <label className="form-label">Pontuação da lista de tarefas</label>
                  <select
                    className="form-input"
                    value={difficultyFromPoints(Number(pontuacao || 0))}
                    onChange={e => setPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}
                  >
                    {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                  </select>
                </div>
              </>
            )}
            <label className="task-surprise-toggle task-surprise-toggle--task">
              <input type="checkbox" checked={tarefaSurpresa} onChange={e => { const checked = e.target.checked; setTarefaSurpresa(checked); if (checked) { setNovoItemSurpresa(true); setChecklist(prev => prev.map(item => ({ ...item, revelar_apos_assumir: true }))) } }} />
              <span>Lista surpresa: antes de assumir, o membro vê somente quantos pontos vale. Título da lista, descrição e todas as tarefas da lista ficam escondidos.</span>
            </label>
            <div className="team-ranking-note">
              O ranking respeita a escolha acima: pode pontuar só a lista, só as tarefas da lista ou os dois, sempre somente após aprovação do gestor.
            </div>
          </div>
        )}
        {isGestor && tipoTarefa === 'equipe' && modoDistribuicao !== 'livre_equipe' && (
          <div className="form-group">
            <label className="form-label">Responsável principal da lista</label>
            <select className="form-input" value={responsavelId} onChange={e => setResponsavelId(e.target.value)}>
              <option value="">Lista de tarefas da equipe sem responsável único</option>
              {user?.id && <option value={user.id}>Eu como responsável principal</option>}
              {membros.filter(m => m.id !== user?.id).map(m => <option key={m.id} value={m.id}>{m.nome} · {m.role}</option>)}
            </select>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Você pode direcionar a lista para um membro ou deixar sem responsável principal e distribuir as tarefas internas.</div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">{tipoTarefa === 'pessoal' ? 'Minhas tarefas / checklist pessoal' : 'Ações da lista / checklist de execução'}</label>
          <div className="task-smart-actions">
            <div>
              <strong>{tipoTarefa === 'pessoal' ? 'Gerar minha lista automaticamente' : 'Gerar checklist automático'}</strong>
              <p>{tipoTarefa === 'pessoal' ? 'Cole uma ação por linha ou uma lista numerada. Todas serão criadas como tarefas pessoais marcáveis, privadas e sem pontuação.' : 'Cole o título e as ações numeradas. O sistema transforma cada ação em uma tarefa marcável para comprovação da execução.'}</p>
            </div>
            <textarea
              className="form-input"
              rows={6}
              value={acoesListaTexto}
              onChange={e => setAcoesListaTexto(e.target.value)}
              placeholder={`Ex.: ENVIAR CERTIDÃO SIMPLIFICADA DA JUNTA COMERCIAL PARA AGÊNCIA SICOOB\n\n1- Entrar em contato com Fernanda e informar a solicitação.\n2- Solicitar a certidão na Junta Comercial e enviar a taxa.\n3- Anexar a certidão no sistema.\n4- Enviar a certidão para a Fernanda.\n5- Enviar a certidão para o e-mail da gerente responsável.`}
            />
            <div className="task-smart-actions-footer">
              <span>{tipoTarefa === 'pessoal' ? 'As tarefas pessoais ficam privadas, sem pontuação e podem ser marcadas por você a qualquer momento.' : (pontuacaoIncluiSubtarefas(pontuacaoEscopo) ? 'As ações geradas podem ter nível/pontos pela escala oficial.' : 'Como a pontuação é somente pela lista, as ações serão checklist de execução sem pontos individuais visíveis.')}</span>
              <button className="btn btn-secondary" type="button" onClick={gerarChecklistAutomatico}><Plus size={16} /> Gerar checklist</button>
            </div>
          </div>
          <div className="task-checklist-builder">
            <div className="task-checklist-builder-fields">
              <div className="form-group">
                <label className="form-label">Tarefa *</label>
                <input
                  className="form-input"
                  value={novoItem}
                  onChange={e => setNovoItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                  placeholder="Ex.: Conferir contrato social"
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
              {tipoTarefa === 'equipe' && (
                <div className="form-group">
                  <label className="form-label">Executor desta tarefa</label>
                  <select
                    className="form-input"
                    value={novoItemResponsavelId}
                    onChange={e => setNovoItemResponsavelId(e.target.value)}
                  >
                    <option value="">Livre / usar responsável principal</option>
                    {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}{m.role ? ` · ${m.role}` : ''}</option>)}
                  </select>
                </div>
              )}
              {tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopo) && (
                <div className="form-group">
                  <label className="form-label">Grau de dificuldade *</label>
                  <select className="form-input" value={novoItemDificuldade} onChange={e => applyNovoItemDifficulty(e.target.value as ChecklistDifficulty)}>
                    {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                  </select>
                </div>
              )}
              {tipoTarefa === 'equipe' && !tarefaSurpresa && (
                <label className="task-surprise-toggle">
                  <input type="checkbox" checked={novoItemSurpresa} onChange={e => setNovoItemSurpresa(e.target.checked)} />
                  <span>Tarefa surpresa: antes de assumir, mostra só os pontos desta tarefa.</span>
                </label>
              )}
              {tipoTarefa === 'equipe' && tarefaSurpresa && (
                <div className="team-ranking-note">Lista surpresa ativa: todas as tarefas internas serão surpresa e a pessoa assume a lista completa para revelar.</div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Descrição da tarefa <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(opcional)</span></label>
              <textarea
                className="form-input"
                rows={2}
                value={novoItemDescricao}
                onChange={e => setNovoItemDescricao(e.target.value)}
                placeholder="Descreva detalhes, padrão esperado, onde buscar informações ou deixe vazio."
              />
            </div>
            <button className="btn btn-secondary" type="button" onClick={addItem}><Plus size={16} /> Adicionar tarefa</button>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {tipoTarefa === 'pessoal'
                ? 'Cada item será uma tarefa pessoal privada. Você poderá marcar e desmarcar conforme executar, sem pontuação e sem aprovação.'
                : <>Cada ação descreve uma entrega real dentro desta lista. {pontuacaoIncluiSubtarefas(pontuacaoEscopo) ? 'A pontuação das tarefas da lista entra no ranking após aprovação.' : 'Nesta lista, as ações funcionam como checklist de execução/comprovação; a pontuação fica somente na lista.'}</>}
            </div>
          </div>
          {!canMarkChecklistInEdit && checklist.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              A edição da estrutura das tarefas está liberada, mas a marcação dos itens é exclusiva do executor.
            </div>
          )}
          {checklist.map(item => (
            <div key={item.id} className="task-checklist-edit-card">
              <div className="task-checklist-edit-row">
                <button
                  type="button"
                  title={canMarkChecklistInEdit ? 'Marcar item' : 'Somente o executor pode marcar esta tarefa'}
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
                  placeholder="Nome da tarefa"
                />
                {tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopo) && (
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
                )}
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
                {tipoTarefa === 'equipe' && (
                  <select
                    className="form-input"
                    value={item.responsavel_id || ''}
                    onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, responsavel_id: e.target.value || undefined, responsavel_nome: checklistResponsibleName(e.target.value) } : i))}
                    title="Executor desta tarefa"
                  >
                    <option value="">Livre / responsável principal</option>
                    {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))} style={{ background: 'none', border: 0, color: '#EF4444', padding: 6 }}><X size={14} /></button>
              </div>
              <textarea
                className="form-input"
                rows={2}
                value={item.descricao || ''}
                onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, descricao: e.target.value || undefined } : i))}
                placeholder="Observação, comprovação esperada ou instrução opcional desta ação"
              />
              <div className="objective-subtasks-editor">
                <div className="objective-subtasks-title">Etapas desta tarefa</div>
                {((item as any).subtarefas || []).map((sub: ObjectiveSubitem) => (
                  <div key={sub.id} className="objective-subtask-row">
                    <input
                      className="form-input"
                      value={sub.texto}
                      onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, subtarefas: ((i as any).subtarefas || []).map((s: ObjectiveSubitem) => s.id === sub.id ? { ...s, texto: e.target.value } : s) } : i))}
                      placeholder="Ex.: Separar documentos, conferir dados, enviar comprovante..."
                    />
                    <button className="btn btn-ghost danger" type="button" onClick={() => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, subtarefas: ((i as any).subtarefas || []).filter((s: ObjectiveSubitem) => s.id !== sub.id) } : i))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, subtarefas: [...((i as any).subtarefas || []), { id: nanoid(), texto: 'Nova etapa', feito: false }] } : i))}>
                  <Plus size={14} /> Adicionar etapa nesta tarefa
                </button>
              </div>
            </div>
          ))}
        </div>
        {tipoTarefa === 'pessoal' && (
          <div className="personal-task-note">Lista pessoal: privada para você. Crie várias tarefas, gere o checklist automático e marque cada item conforme executar. Não possui pontuação, ranking, surpresa nem delegação para a equipe.</div>
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

function ComplementoModal({ tarefa, membros, onClose, onSaved }: { tarefa: Tarefa; membros: MembroEquipe[]; onClose: () => void; onSaved: (t: Tarefa) => void }) {
  const [complemento, setComplemento] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState<Priority>(tarefa.prioridade || 'media')
  const [responsavelId, setResponsavelId] = useState('')
  const [loading, setLoading] = useState(false)

  async function salvar() {
    if (!complemento.trim()) { toast('Informe o complemento que o membro deve executar.', 'error'); return }
    setLoading(true)
    try {
      const saved = await tarefasApi.reabrir(tarefa.id, {
        complemento: complemento.trim(),
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: responsavelId || undefined,
      })
      onSaved(saved)
      toast('Complemento solicitado. A tarefa voltou para pendente.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao solicitar complemento.', 'error')
    } finally { setLoading(false) }
  }

  const responsaveisOpts = useMemo(() => {
    const map = new Map<string, string>()
    if (tarefa.responsavel_id && tarefa.responsavel_nome) map.set(tarefa.responsavel_id, tarefa.responsavel_nome)
    ;(tarefa.checklist || []).forEach(item => { if (item.responsavel_id && item.responsavel_nome) map.set(item.responsavel_id, item.responsavel_nome) })
    membros.forEach(m => map.set(m.id, m.nome))
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [tarefa, membros])

  return (
    <ModalBase title="Solicitar complemento na lista" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg3)', padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{tarefa.titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Use essa opção para adicionar uma nova tarefa na lista e devolvê-la para o membro executar. Não cria uma nova lista — continua a mesma.
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Nova tarefa a executar *</label>
          <textarea
            className="form-input"
            rows={4}
            value={complemento}
            onChange={e => setComplemento(e.target.value)}
            placeholder="Ex.: Pegar nova certidão no cartório, revisar contrato X, anexar comprovante atualizado..."
            autoFocus
          />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Executor desta tarefa <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
            <select className="form-input" value={responsavelId} onChange={e => setResponsavelId(e.target.value)}>
              <option value="">Mesmo responsável da lista</option>
              {responsaveisOpts.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Novo prazo <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
            <input
              className="form-input"
              type="date"
              value={prazo}
              onFocus={e => { try { (e.target as HTMLInputElement).showPicker?.() } catch {} }}
              onChange={e => setPrazo(e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Prioridade</label>
          <select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value as Priority)}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={loading} type="button">
            {loading ? <Loader size={14} /> : <RotateCcw size={14} />} Solicitar complemento
          </button>
        </div>
      </div>
    </ModalBase>
  )
}

// ── MODAL DE DEVOLVER ─────────────────────────────────────────────────────────
function DevolverModal({ tarefa, onClose, onSaved }: { tarefa: Tarefa; onClose: () => void; onSaved: (t: Tarefa) => void }) {
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  async function salvar() {
    if (!motivo.trim()) { toast('Informe a ressalva/correção necessária.', 'error'); return }
    setLoading(true)
    try {
      const saved = await tarefasApi.devolver(tarefa.id, motivo.trim())
      onSaved(saved)
      onClose()
      toast('Lista devolvida. O membro será notificado.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao devolver.', 'error')
    } finally { setLoading(false) }
  }

  return (
    <ModalBase title="Devolver lista" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>📋 {tarefa.titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
            Informe o que precisa ser corrigido. O membro receberá uma notificação com esta ressalva.
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Ressalva / O que precisa ser corrigido *</label>
          <textarea
            className="form-input"
            rows={4}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ex.: O documento X está incompleto. Por favor revise a seção 3 e reenvie com o comprovante anexado."
            autoFocus
            maxLength={1000}
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', marginTop: 3 }}>{motivo.length}/1000</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={loading} type="button" style={{ background: '#F59E0B', borderColor: '#F59E0B' }}>
            {loading ? <Loader size={14} /> : <RotateCcw size={14} />} Devolver lista
          </button>
        </div>
      </div>
    </ModalBase>
  )
}

// ── MODAL DE LEMBRETE ─────────────────────────────────────────────────────────
function LembreteModal({ tarefa, membros, onClose }: { tarefa: Tarefa; membros: MembroEquipe[]; onClose: () => void }) {
  const mensagemPadrao = `A lista "${tarefa.titulo}" precisa de atenção. Verifique o prazo e execute ou atualize sua parte.`
  const [mensagem, setMensagem] = useState(mensagemPadrao)
  const [loading, setLoading] = useState(false)

  // Destinatários possíveis baseados na lista
  const destinatarios = useMemo(() => {
    const nomes: string[] = []
    if (tarefa.responsavel_nome_perfil || tarefa.responsavel_nome) nomes.push(tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || '')
    if ((tarefa as any).aceita_por_nome) nomes.push((tarefa as any).aceita_por_nome)
    ;(tarefa.checklist || []).forEach(item => { if (item.responsavel_nome && !nomes.includes(item.responsavel_nome)) nomes.push(item.responsavel_nome) })
    return nomes.filter(Boolean)
  }, [tarefa])

  async function enviar() {
    if (!mensagem.trim()) { toast('Informe a mensagem do lembrete.', 'error'); return }
    setLoading(true)
    try {
      const result = await tarefasApi.enviarLembrete(tarefa.id, mensagem.trim())
      onClose()
      toast(`Lembrete enviado para ${result.enviados || 0} destinatário(s).`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao enviar lembrete.', 'error')
    } finally { setLoading(false) }
  }

  return (
    <ModalBase title="Enviar lembrete" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>📋 {tarefa.titulo}</div>
          {destinatarios.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
              Destinatários: {destinatarios.join(', ')}
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Mensagem do lembrete *</label>
          <textarea
            className="form-input"
            rows={4}
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            autoFocus
            maxLength={500}
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', marginTop: 3 }}>{mensagem.length}/500</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="btn btn-primary" onClick={enviar} disabled={loading} type="button">
            {loading ? <Loader size={14} /> : <MessageSquare size={14} />} Enviar lembrete
          </button>
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
        <label className="form-label">Descrição da lista do anexo</label>
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


function TarefaDetalheModal({ tarefa, membros, isGestor, userId, allTasks = [], onClose, onSaved, onAnexos, onResponder, onApprove, onReturn, onComplemento, onReminder, onPedirAjuda, onPainelAjuda }: {
  tarefa: Tarefa
  membros: MembroEquipe[]
  isGestor: boolean
  userId: string
  allTasks?: Tarefa[]
  onClose: () => void
  onSaved: (t: Tarefa) => void
  onAnexos: (t: Tarefa) => void
  onResponder: (t: Tarefa) => void
  onApprove: (t: Tarefa) => void
  onReturn: (t: Tarefa) => void
  onComplemento: (t: Tarefa) => void
  onReminder: (t: Tarefa) => void
  onPedirAjuda: (t: Tarefa) => void
  onPainelAjuda: (t: Tarefa) => void
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(normalizeChecklistItems(tarefa.checklist))
  const [obs, setObs] = useState(tarefa.observacao_conclusao || tarefa.resposta_membro || '')
  const [motivo, setMotivo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [execHistory, setExecHistory] = useState<any[]>([])
  const [execHistoryLoading, setExecHistoryLoading] = useState(false)
  const [comentarios, setComentarios] = useState<any[]>([])
  const [comentarioTexto, setComentarioTexto] = useState('')
  const [comentarioItemId, setComentarioItemId] = useState('')
  const [comentariosLoading, setComentariosLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editTitulo, setEditTitulo] = useState(tarefa.titulo || '')
  const [editDescricao, setEditDescricao] = useState(tarefa.descricao || '')
  const [editPrazo, setEditPrazo] = useState(tarefa.prazo?.slice(0, 10) || '')
  const [editPrioridade, setEditPrioridade] = useState<Priority>(tarefa.prioridade || 'media')
  const [editPontuacao, setEditPontuacao] = useState(String(tarefa.pontuacao ?? 3))
  const [editPontuacaoEscopo, setEditPontuacaoEscopo] = useState<PontuacaoEscopo>(() => taskPontuacaoEscopo(tarefa))
  const [newSubtask, setNewSubtask] = useState('')
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('')
  const [newSubtaskDate, setNewSubtaskDate] = useState('')
  const [newSubtaskResp, setNewSubtaskResp] = useState('')
  const [newSubtaskPoints, setNewSubtaskPoints] = useState('3')
  const [newSubtaskDifficulty, setNewSubtaskDifficulty] = useState<ChecklistDifficulty>('nivel_3')
  const [newSubtaskSurprise, setNewSubtaskSurprise] = useState(false)
  const [gestorDelegarId, setGestorDelegarId] = useState(tarefa.responsavel_id || '')
  const anexosCount = Number((tarefa as any).anexos_count || 0)
  const isResponsavel = tarefa.responsavel_id === userId
  const isCriador = tarefa.criado_por === userId
  const isCriadorSemResponsavel = !tarefa.responsavel_id && isCriador
  const isTaskFinalizada = ['aprovada', 'cancelada'].includes(tarefa.status)
  const livreDisponivel = isAvailableFreeTask(tarefa)
  const livreAceita = isFreeTeamTask(tarefa) && !!tarefa.aceita_por
  const aceitaPorOutro = isAcceptedByOtherMember(tarefa, userId)
  const isPersonal = taskScope(tarefa) === 'pessoal'
  const listSurprise = taskIsSurprise(tarefa)
  const hasHelpPending = Boolean((tarefa as any).pedido_ajuda_pendente)

  useEffect(() => {
    if (!isGestor) {
      setExecHistory([])
      return
    }
    let ativo = true
    setExecHistoryLoading(true)
    tarefasApi.historico(tarefa.id)
      .then(items => {
        if (!ativo) return
        setExecHistory(Array.isArray(items) ? items : [])
      })
      .catch(() => {
        if (ativo) setExecHistory([])
      })
      .finally(() => {
        if (ativo) setExecHistoryLoading(false)
      })
    return () => { ativo = false }
  }, [isGestor, tarefa.id, tarefa.updated_at, tarefa.status])

  useEffect(() => {
    let ativo = true
    setComentariosLoading(true)
    tarefasApi.comentarios(tarefa.id)
      .then(items => { if (ativo) setComentarios(items) })
      .catch(() => { if (ativo) setComentarios([]) })
      .finally(() => { if (ativo) setComentariosLoading(false) })
    return () => { ativo = false }
  }, [tarefa.id, tarefa.updated_at])

  async function enviarComentario() {
    const texto = comentarioTexto.trim()
    if (!texto) { toast('Escreva um comentário.', 'error'); return }
    setSaving(true)
    try {
      const salvo = await tarefasApi.comentar(tarefa.id, { comentario: texto, checklist_id: comentarioItemId || undefined })
      setComentarios(prev => [...prev, { ...salvo, autor_nome: salvo.autor_nome || 'Você' }])
      setComentarioTexto('')
      toast('Comentário registrado no histórico da tarefa.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao comentar.', 'error') }
    finally { setSaving(false) }
  }

  async function revisarItem(item: ChecklistItem, decisao: 'aprovar' | 'devolver') {
    const ressalva = decisao === 'devolver' ? (window.prompt('Descreva o que precisa ser corrigido:') || '').trim() : ''
    if (decisao === 'devolver' && !ressalva) return
    setSaving(true)
    try {
      const atualizada = await tarefasApi.revisarChecklistItem(tarefa.id, item.id, decisao, ressalva)
      setChecklist(normalizeChecklistItems(atualizada.checklist))
      onSaved(atualizada)
      const novos = await tarefasApi.comentarios(tarefa.id)
      setComentarios(novos)
      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada.' : 'Item devolvido ao executor para correção.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao revisar item.', 'error') }
    finally { setSaving(false) }
  }

  async function imprimirRelatorio() {
    try {
      const r = await tarefasApi.relatorio(tarefa.id)
      const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c))
      const itens = (r.tarefa.checklist || []).map((i:any) => `<tr><td>${esc(i.texto)}</td><td>${esc(i.responsavel_nome || i.concluido_por || 'Não definido')}</td><td>${i.feito ? 'Executado' : 'Pendente'}</td><td>${esc(i.aprovacao_status || 'Aguardando')}</td><td>${Number(i.pontuacao || 0)}</td></tr>`).join('')
      const comentariosHtml = (r.comentarios || []).map((c:any) => `<li><strong>${esc(c.autor_nome || 'Usuário')}</strong> — ${new Date(c.criado_em).toLocaleString('pt-BR')}<br>${esc(c.comentario)}</li>`).join('') || '<li>Nenhum comentário.</li>'
      const pontos = (r.pontuacoes || []).reduce((a:number,p:any)=>a+Number(p.pontos||0),0)
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório - ${esc(r.tarefa.titulo)}</title><style>body{font-family:Arial,sans-serif;color:#172033;padding:28px}h1{margin-bottom:4px}.meta{color:#667085;margin-bottom:24px}.box{border:1px solid #d0d5dd;border-radius:8px;padding:14px;margin:14px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d0d5dd;padding:8px;text-align:left;font-size:12px}th{background:#f2f4f7}li{margin:10px 0}@media print{button{display:none}}</style></head><body><h1>${esc(r.tarefa.titulo)}</h1><div class="meta">Empresa: ${esc(r.tarefa.origem_nome || 'Não vinculada')} · Criada por: ${esc(r.tarefa.criado_por_nome || '')} · Gerado em ${new Date(r.gerado_em).toLocaleString('pt-BR')}</div><div class="box"><strong>Status:</strong> ${esc(r.tarefa.status)} &nbsp; <strong>Prioridade:</strong> ${esc(r.tarefa.prioridade)} &nbsp; <strong>Pontos aprovados:</strong> ${pontos}<p>${esc(r.tarefa.descricao || '')}</p></div><h2>Execução por item</h2><table><thead><tr><th>Item</th><th>Executor</th><th>Execução</th><th>Aval do gestor</th><th>Pontos</th></tr></thead><tbody>${itens}</tbody></table><h2>Comentários e relatos</h2><ul>${comentariosHtml}</ul><p class="meta">Relatório auditável gerado pelo Nexus Gestão.</p><script>window.onload=()=>window.print()<\/script></body></html>`
      const w = window.open('', '_blank')
      if (!w) throw new Error('Permita pop-ups para imprimir o relatório.')
      w.document.open(); w.document.write(html); w.document.close()
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao gerar relatório.', 'error') }
  }

  // Checklist marcável somente pelo executor real da tarefa.
  // Gestor/admin/dev conferem, aprovam e devolvem, mas não marcam execução de outra pessoa.
  const hasChecklistForMe = checklist.some(item => isChecklistItemExecutor(item, tarefa, userId))
  const myProgress = checklistProgressForUser({ ...tarefa, checklist }, userId)
  const geralProgress = checklistProgress(checklist)
  const distributedTask = taskHasDistributedChecklist({ ...tarefa, checklist })
  const isAssigneeByFreeTask = tarefa.aceita_por === userId
  const canExecuteTask = !isTaskFinalizada && (isPersonal
    ? (isResponsavel || isCriador)
    : (!isGestor && (isResponsavel || isAssigneeByFreeTask || hasChecklistForMe)))
  const canToggleChecklist = canExecuteTask && !isTaskFinalizada
  // Gestor precisa aprovar/devolver mesmo quando também é criador/responsável.
  // A aprovação do gestor é a etapa que libera pontuação no ranking.
  const canReviewTask = !isPersonal && isGestor && !['aprovada', 'cancelada'].includes(String(tarefa.status || ''))
  const allChecklistDone = geralProgress.total === 0 || geralProgress.complete
  const myChecklistDone = myProgress.total === 0 || myProgress.complete
  const displayChecklist = visibleChecklistItems({ ...tarefa, checklist }, userId, isGestor)
  const executorSummary = checklistExecutorSummary({ ...tarefa, checklist })
  const responsaveisChecklist = assigneeOptions(membros, undefined)
  const executionNotes = useMemo(() => {
    if (!isGestor) return [] as Array<{ id: string; origem: string; autor?: string; data?: string; texto: string; tipo?: string }>
    const seen = new Set<string>()
    const notes: Array<{ id: string; origem: string; autor?: string; data?: string; texto: string; tipo?: string }> = []
    const pushNote = (note: { id: string; origem: string; autor?: string; data?: string; texto?: unknown; tipo?: string }) => {
      const texto = String(note.texto || '').trim()
      if (!texto) return
      const key = `${note.origem}|${note.autor || ''}|${note.data || ''}|${texto}`
      if (seen.has(key)) return
      seen.add(key)
      notes.push({ ...note, texto })
    }
    pushNote({ id: 'resposta_membro', origem: 'Resposta do membro', autor: tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || tarefa.aceita_por_nome, data: tarefa.resposta_em || tarefa.data_conclusao, texto: tarefa.resposta_membro, tipo: tarefa.resposta_status })
    pushNote({ id: 'observacao_conclusao', origem: 'Observação de conclusão', autor: tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || tarefa.aceita_por_nome, data: tarefa.data_conclusao || tarefa.resposta_em, texto: tarefa.observacao_conclusao, tipo: 'concluida' })
    pushNote({ id: 'resposta_obs', origem: tarefa.resposta_status === 'nao_concluida' ? 'Justificativa de não conclusão' : 'Observação enviada', autor: tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || tarefa.aceita_por_nome, data: tarefa.resposta_em, texto: tarefa.resposta_obs, tipo: tarefa.resposta_status })
    pushNote({ id: 'motivo_nao_conclusao', origem: 'Motivo de não conclusão', autor: tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || tarefa.aceita_por_nome, data: tarefa.updated_at, texto: tarefa.motivo_nao_conclusao, tipo: 'nao_concluida' })

    const executionActions = new Set(['parte_enviada', 'objetivos_completos', 'concluida', 'nao_concluida', 'reenviada'])
    execHistory
      .filter(h => executionActions.has(String(h?.acao || '')) && String(h?.observacao || '').trim())
      .forEach((h, idx) => pushNote({
        id: h.id || `historico_${idx}`,
        origem: h.acao === 'parte_enviada'
          ? 'Parte enviada'
          : h.acao === 'objetivos_completos'
            ? 'Conclusão da lista'
            : h.acao === 'reenviada'
              ? 'Correção reenviada'
              : h.acao === 'nao_concluida'
                ? 'Justificativa de não conclusão'
                : 'Conclusão enviada',
        autor: h.usuario_nome || h.user_id,
        data: h.created_at,
        texto: h.observacao,
        tipo: h.acao,
      }))

    return notes.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
  }, [isGestor, execHistory, tarefa.resposta_membro, tarefa.observacao_conclusao, tarefa.resposta_obs, tarefa.motivo_nao_conclusao, tarefa.resposta_status, tarefa.resposta_em, tarefa.data_conclusao, tarefa.updated_at, tarefa.responsavel_nome_perfil, tarefa.responsavel_nome, tarefa.aceita_por_nome])

  const openSubtasksForMe = useMemo(() => {
    if (!userId || isGestor) return [] as Array<{ tarefa: Tarefa; item: ChecklistItem }>
    return (allTasks || []).flatMap(task => normalizeChecklistItems(task.checklist)
      .filter(item => !item.feito && checklistItemBelongsToUser(item, userId) && !['concluida','aprovada','cancelada'].includes(String(task.status)))
      .map(item => ({ tarefa: task, item })))
  }, [allTasks, userId, isGestor])
  const hasOpenSubtaskElsewhere = false

  function checklistResponsibleName(id?: string) {
    if (!id) return undefined
    return responsaveisChecklist.find(m => m.id === id)?.nome
  }
  function applyNewSubtaskDifficulty(next: ChecklistDifficulty) {
    setNewSubtaskDifficulty(next)
    setNewSubtaskPoints(String(difficultyPoints(next)))
  }


  function addInlineSubtask() {
    if (!newSubtask.trim()) { toast('Informe o nome da tarefa.', 'error'); return }
    if (!isPersonal && (newSubtaskPoints === '' || Number.isNaN(Number(newSubtaskPoints)) || Number(newSubtaskPoints) < 0 || Number(newSubtaskPoints) > SCORE_MAX)) { toast(`Informe a pontuação da tarefa entre 0 e ${SCORE_MAX} pontos.`, 'error'); return }
    setChecklist(prev => [...prev, {
      id: nanoid(),
      texto: newSubtask.trim(),
      descricao: newSubtaskDesc.trim() || undefined,
      data: newSubtaskDate || undefined,
      responsavel_id: isPersonal ? (userId || undefined) : (newSubtaskResp || undefined),
      responsavel_nome: isPersonal ? (checklistResponsibleName(userId) || tarefa.responsavel_nome || undefined) : checklistResponsibleName(newSubtaskResp),
      dificuldade: isPersonal ? 'nivel_1' : newSubtaskDifficulty,
      pontuacao: isPersonal ? 0 : Math.max(0, Math.min(SCORE_MAX, Number(newSubtaskPoints || 0))),
      subtarefas: [],
      revelar_apos_assumir: isPersonal ? false : Boolean(listSurprise || newSubtaskSurprise),
      feito: false,
    }])
    setNewSubtask('')
    setNewSubtaskDesc('')
    setNewSubtaskDate('')
    setNewSubtaskResp('')
    setNewSubtaskDifficulty('nivel_3')
    setNewSubtaskPoints('3')
    setNewSubtaskSurprise(false)
    setEditMode(true)
  }

  async function saveInlineEdit() {
    const editTituloFinal = editTitulo.trim() || (taskScope(tarefa) === 'equipe' ? 'Lista de tarefas da equipe' : 'Lista pessoal')
    const invalid = checklist.find(item => !String(item.texto || '').trim() || (!isPersonal && ((item as any).pontuacao === undefined || (item as any).pontuacao === null || Number.isNaN(Number((item as any).pontuacao)))))
    if (invalid) { toast(isPersonal ? 'Cada tarefa pessoal precisa ter um nome.' : 'Cada tarefa precisa ter nome e pontuação.', 'error'); return }
    const checklistFinal = checklist.map(item => isPersonal
      ? {
          ...item,
          responsavel_id: userId || undefined,
          responsavel_nome: checklistResponsibleName(userId) || tarefa.responsavel_nome || item.responsavel_nome,
          dificuldade: 'nivel_1' as ChecklistDifficulty,
          pontuacao: 0,
          revelar_apos_assumir: false,
        }
      : { ...item, revelar_apos_assumir: listSurprise ? true : Boolean((item as any).revelar_apos_assumir) })
    setSaving(true)
    try {
      const saved = await tarefasApi.update(tarefa.id, {
        titulo: editTituloFinal,
        descricao: editDescricao.trim() || undefined,
        prazo: editPrazo || undefined,
        prioridade: editPrioridade,
        pontuacao: isPersonal ? 0 : (pontuacaoIncluiTarefa(editPontuacaoEscopo) ? Number(editPontuacao || 0) : 0),
        pontuacao_escopo: isPersonal ? undefined : editPontuacaoEscopo,
        pontuacao_tipo: isPersonal ? undefined : editPontuacaoEscopo,
        conta_ranking: isPersonal ? false : tarefa.conta_ranking,
        origem_payload: isPersonal ? tarefa.origem_payload : { ...((tarefa.origem_payload || {}) as Record<string, unknown>), nexus_pontuacao_escopo: editPontuacaoEscopo },
        checklist: checklistFinal,
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

  async function persistChecklistItem(itemId: string, feito: boolean) {
    const previous = checklist
    setChecklist(prev => prev.map(item => item.id === itemId ? { ...item, feito } : item))
    setSaving(true)
    try {
      const saved = await tarefasApi.atualizarChecklistItem(tarefa.id, itemId, feito)
      setChecklist(normalizeChecklistItems(saved.checklist))
      onSaved(saved)
    } catch (e) {
      setChecklist(previous)
      toast(e instanceof Error ? e.message : 'Erro ao salvar tarefa da lista.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function colocarListaComoLivre() {
    if (!isGestor) return
    if (!window.confirm('Colocar esta lista novamente como livre para a equipe? O executor principal atual será removido da lista, mas o histórico será preservado.')) return
    setSaving(true)
    try {
      const saved = await tarefasApi.update(tarefa.id, {
        modo_distribuicao: 'livre_equipe',
        responsavel_id: undefined,
        escopo: 'equipe',
      } as Partial<Tarefa>)
      onSaved(saved)
      setGestorDelegarId('')
      toast('Lista colocada novamente como livre para a equipe.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao liberar lista.', 'error')
    } finally { setSaving(false) }
  }

  async function delegarListaParaMembro() {
    if (!isGestor) return
    if (!gestorDelegarId) { toast('Escolha um membro para delegar a lista.', 'error'); return }
    setSaving(true)
    try {
      const saved = await tarefasApi.update(tarefa.id, {
        modo_distribuicao: 'normal',
        escopo: 'equipe',
        responsavel_id: gestorDelegarId,
      } as Partial<Tarefa>)
      onSaved(saved)
      toast('Lista delegada ao membro selecionado. Ela não ficará disponível para outros assumirem.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao delegar lista.', 'error')
    } finally { setSaving(false) }
  }

  async function removerExecutorDasTarefas(memberId: string, nome?: string) {
    if (!isGestor) return
    if (!window.confirm(`Remover ${nome || 'este membro'} das tarefas desta lista? As tarefas dele voltarão a ficar livres para correção/delegação pelo gestor.`)) return
    const next = checklist.map(item => checklistItemBelongsToUser(item, memberId)
      ? { ...item, responsavel_id: undefined, responsavel_nome: undefined, assumido_por: undefined, executor_id: undefined, aceita_por: undefined, feito: false, concluido_por: undefined, feito_por: undefined }
      : item)
    setSaving(true)
    try {
      const payload: Partial<Tarefa> = { checklist: next }
      if (tarefa.responsavel_id === memberId || tarefa.aceita_por === memberId) {
        payload.modo_distribuicao = 'livre_equipe'
        payload.responsavel_id = undefined
        payload.escopo = 'equipe'
      }
      const saved = await tarefasApi.update(tarefa.id, payload)
      setChecklist(normalizeChecklistItems(saved.checklist))
      onSaved(saved)
      toast('Executor removido. O gestor pode delegar novamente ou deixar livre.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover executor.', 'error')
    } finally { setSaving(false) }
  }


  async function assumirChecklistItem(item: ChecklistItem) {
    if (!item.id) return
    setSaving(true)
    try {
      const saved = await tarefasApi.assumirChecklist(tarefa.id, item.id)
      const nextChecklist = normalizeChecklistItems(saved.checklist)
      setChecklist(nextChecklist)
      onSaved(saved)
      toast('Tarefa assumida. Ela continua no quadro da equipe e agora aparece como sua execução.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao assumir tarefa.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function toggleCheck(id: string) {
    const item = checklist.find(i => i.id === id)
    if (!item || !isChecklistItemExecutor(item, tarefa, userId) || isTaskFinalizada) {
      toast('Apenas o executor desta tarefa pode marcar este item.', 'error')
      return
    }
    void persistChecklistItem(id, !item.feito)
  }

  async function copiarChecklist() {
    if (!checklist.length) {
      toast('Esta lista não possui tarefas para copiar.', 'error')
      return
    }

    const texto = [
      `Lista de tarefas: ${tarefa.titulo}`,
      ...checklist.map((item, index) => `${index + 1}. ${item.feito ? '[x]' : '[ ]'} ${checklistDisplayText(item)}${(item as any).pontuacao ? `\n   Dificuldade: ${difficultyLabel((item as any).dificuldade)} · Pontos: ${(item as any).pontuacao}` : ''}${item.data ? `\n   Data: ${fmtDate(item.data)}` : ''}${(item.responsavel_nome || tarefa.responsavel_nome_perfil || tarefa.responsavel_nome) ? `\n   Executor: ${checklistExecutorName(item, tarefa)}` : ''}${checklistDisplayDesc(item) ? `\n   Como executar: ${checklistDisplayDesc(item)}` : ''}`),
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
      toast('Lista copiada.')
    } catch {
      toast('Não foi possível copiar o tarefas.', 'error')
    }
  }

  async function anexarArquivosExecucao(nextFiles: File[]) {
    setFiles(nextFiles)
    if (!nextFiles.length) return
    setSaving(true)
    try {
      for (const file of nextFiles) {
        await tarefasApi.uploadAnexo(tarefa.id, file, {
          titulo: file.name || 'Arquivo da tarefa',
          descricao: obs.trim() || motivo.trim() || 'Evidência anexada durante a execução.',
          tipo: 'evidencia',
        })
      }
      setFiles([])
      toast(`${nextFiles.length} arquivo(s) salvo(s) na tarefa.`)
      const refreshed = await tarefasApi.list().then(list => list.find(t => t.id === tarefa.id)).catch(() => undefined)
      if (refreshed) onSaved(refreshed)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao anexar arquivo.', 'error')
    } finally { setSaving(false) }
  }

  async function uploadPendentes() {
    for (const file of files) {
      await tarefasApi.uploadAnexo(tarefa.id, file, {
        titulo: file.name || 'Arquivo da tarefa',
        descricao: obs.trim() || motivo.trim() || undefined,
        tipo: 'evidencia',
      })
    }
    if (files.length) setFiles([])
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
              {livreDisponivel && <span style={{ color: '#10B981', fontWeight: 600 }}>Livre para assumir</span>}
              {aceitaPorOutro && <span style={{ color: '#F59E0B', fontWeight: 600 }}>⏳ Esta tarefa já foi assumida e está em execução por outro membro.</span>}
              {livreAceita && !aceitaPorOutro && <span style={{ color: '#10B981', fontWeight: 600 }}>✅ Assumida por você</span>}
              <span>Criada: {fmtDateTime(tarefa.created_at)}</span>
              {tarefa.data_reabertura && <span>Reaberta: {fmtDateTime(tarefa.data_reabertura)}</span>}
              {tarefa.updated_at && <span>Última atualização: {fmtDateTime(tarefa.updated_at)}</span>}
            </div>
          </div>
          <div className="task-detail-hero-actions">
            {isGestor && <button className="btn btn-secondary" type="button" onClick={() => setEditMode(v => !v)}><Edit3 size={14} /> {editMode ? 'Ocultar edição' : 'Editar / incluir tarefa'}</button>}
            {isGestor && <button className="btn btn-secondary" type="button" onClick={() => onReminder(tarefa)}><MessageSquare size={14} /> Enviar lembrete</button>}
            {isGestor && <button className="btn btn-secondary" type="button" onClick={() => onPainelAjuda(tarefa)}><MessageSquare size={14} /> Ver pedidos de ajuda</button>}
            {!isGestor && canExecuteTask && <button className="btn btn-secondary" type="button" onClick={() => onPedirAjuda(tarefa)}><MessageSquare size={14} /> Pedir ajuda</button>}
            {!isGestor && (canExecuteTask || (tarefa as any).pedido_ajuda_pendente) && <button className="btn btn-secondary" type="button" onClick={() => onPainelAjuda(tarefa)}><MessageSquare size={14} /> Ajuda / respostas</button>}
            <button className="btn btn-secondary" type="button" onClick={() => onAnexos(tarefa)}><Paperclip size={14} /> Arquivos {anexosCount ? `(${anexosCount})` : ''}</button>
          </div>
        </section>

        {isGestor && !isPersonal && (
          <section className="task-detail-section task-executors-panel">
            <div className="task-detail-section-head">
              <h3>Membros executando</h3>
              <span className="muted">Acompanhe quem assumiu ou recebeu tarefas desta lista. O gestor pode corrigir a delegação sem apagar o histórico.</span>
            </div>
            <div className="task-executors-grid">
              {tarefa.aceita_por && (
                <div className="task-executor-card">
                  <strong>{tarefa.aceita_por_nome || tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'Membro executor'}</strong>
                  <span>Responsável principal da lista</span>
                  <span>{done}/{total || 1} tarefas concluídas</span>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={saving} onClick={() => colocarListaComoLivre()}>Colocar lista como livre</button>
                </div>
              )}
              {executorSummary.length > 0 ? executorSummary.map(exec => (
                <div key={exec.id} className="task-executor-card">
                  <strong>{exec.nome}</strong>
                  <span>{exec.feitos}/{exec.total} tarefa(s) concluída(s)</span>
                  {exec.id !== 'sem-responsavel' && exec.id !== tarefa.criado_por && (
                    <button className="btn btn-ghost danger btn-sm" type="button" disabled={saving} onClick={() => removerExecutorDasTarefas(exec.id, exec.nome)}>Remover das tarefas</button>
                  )}
                </div>
              )) : <p className="muted">Nenhum membro assumiu ou recebeu tarefa nesta lista.</p>}
            </div>
            <div className="task-delegation-controls">
              <select className="form-input" value={gestorDelegarId} onChange={e => setGestorDelegarId(e.target.value)}>
                <option value="">Escolher membro para delegar a lista inteira</option>
                {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" type="button" disabled={saving || !gestorDelegarId} onClick={delegarListaParaMembro}>Delegar lista</button>
              <button className="btn btn-secondary btn-sm" type="button" disabled={saving} onClick={colocarListaComoLivre}>Deixar lista livre</button>
            </div>
          </section>
        )}

        {isGestor && editMode && (
          <section className="task-detail-section task-inline-editor">
            <div className="task-detail-section-head">
              <h3>Editar lista de tarefas e tarefas</h3>
              <button className="btn btn-primary btn-sm" type="button" onClick={saveInlineEdit} disabled={saving}>{saving ? <Loader size={14} /> : <Send size={14} />} Salvar alterações</button>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Título da lista <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(opcional)</span></label>
                <input className="form-input" value={editTitulo} onChange={e => setEditTitulo(e.target.value)} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Prazo <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(pode ser prorrogado pelo gestor)</span></label>
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
              <label className="form-label">Descrição da tarefa <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(opcional)</span></label>
              <textarea className="form-input" rows={3} value={editDescricao} onChange={e => setEditDescricao(e.target.value)} />
            </div>

            {!isPersonal && <div className="task-points-box">
              <div className="form-group">
                <label className="form-label">Onde a pontuação será contabilizada?</label>
                <select className="form-input" value={editPontuacaoEscopo} onChange={e => setEditPontuacaoEscopo(e.target.value as PontuacaoEscopo)}>
                  <option value="tarefa">Somente pontuação da lista</option>
                  <option value="subtarefas">Somente pontuação das tarefas da lista</option>
                  <option value="ambos">Pontuação da lista e das tarefas</option>
                </select>
              </div>
              {pontuacaoIncluiTarefa(editPontuacaoEscopo) && (
                <>
                  <div className="form-group">
                    <label className="form-label">Pontuação da lista de tarefas</label>
                    <select className="form-input" value={difficultyFromPoints(Number(editPontuacao || 0))} onChange={e => setEditPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}>
                      {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>}

            <div className="task-inline-add-subtask">
              <div className="form-group">
                <label className="form-label">Nova tarefa *</label>
                <input className="form-input" value={newSubtask} onChange={e => setNewSubtask(e.target.value)} placeholder="Ex.: Conferir contrato social" />
              </div>
              {!isPersonal && (
                <div className="form-group">
                  <label className="form-label">Grau de dificuldade *</label>
                  <select className="form-input" value={newSubtaskDifficulty} onChange={e => applyNewSubtaskDifficulty(e.target.value as ChecklistDifficulty)}>
                    {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                  </select>
                </div>
              )}
              {!isPersonal && !listSurprise && (
                <label className="task-surprise-toggle">
                  <input type="checkbox" checked={newSubtaskSurprise} onChange={e => setNewSubtaskSurprise(e.target.checked)} />
                  <span>Surpresa: mostra só os pontos até alguém assumir</span>
                </label>
              )}
              {!isPersonal && listSurprise && <div className="team-ranking-note">Lista surpresa ativa: esta nova tarefa também será surpresa.</div>}
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
              {!isPersonal && (
                <div className="form-group">
                  <label className="form-label">Executor <span>(opcional)</span></label>
                  <select className="form-input" value={newSubtaskResp} onChange={e => setNewSubtaskResp(e.target.value)}>
                    <option value="">Livre / responsável principal</option>
                    {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
                </div>
              )}
              <div className="form-group task-inline-desc">
                <label className="form-label">Descrição da lista/instrução <span>(opcional)</span></label>
                <textarea className="form-input" rows={2} value={newSubtaskDesc} onChange={e => setNewSubtaskDesc(e.target.value)} placeholder="Explique como executar, se necessário." />
              </div>
              <button className="btn btn-secondary" type="button" onClick={addInlineSubtask}><Plus size={14} /> Incluir tarefa</button>
            </div>

            <div className="task-inline-checklist-editor">
              {checklist.map(item => (
                <div key={item.id} className="task-inline-checklist-row">
                  <input className="form-input" value={item.texto} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, texto: e.target.value } : i))} placeholder="Nome da tarefa" />
                  {!isPersonal && (
                    <select className="form-input" value={(item as any).dificuldade || difficultyFromPoints(Number((item as any).pontuacao ?? 3))} onChange={e => { const dificuldade = e.target.value as ChecklistDifficulty; setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, dificuldade, pontuacao: difficultyPoints(dificuldade) } : i)) }} title="Grau de dificuldade">
                      {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}</select>
                  )}
                  <input className="form-input" type="date" value={item.data || ''} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, data: e.target.value || undefined } : i))} title="Data opcional" />
                  {!isPersonal && (
                    <select className="form-input" value={item.responsavel_id || ''} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, responsavel_id: e.target.value || undefined, responsavel_nome: checklistResponsibleName(e.target.value) } : i))}>
                      <option value="">Livre / responsável principal</option>
                      {responsaveisChecklist.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
                  )}
                  {!isPersonal && !listSurprise && (
                    <label className="task-surprise-toggle compact" title="Revelar conteúdo apenas após assumir">
                      <input type="checkbox" checked={Boolean((item as any).revelar_apos_assumir)} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, revelar_apos_assumir: e.target.checked } : i))} />
                      <span>Surpresa</span>
                    </label>
                  )}
                  {!isPersonal && listSurprise && <span className="task-surprise-badge">Surpresa</span>}
                  <button className="btn btn-ghost danger" type="button" onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))}><Trash2 size={14} /></button>
                  <textarea className="form-input task-inline-row-desc" rows={2} value={item.descricao || ''} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, descricao: e.target.value || undefined } : i))} placeholder="Descrição opcional desta tarefa" />
                  <div className="objective-subtasks-editor task-inline-row-desc">
                    <div className="objective-subtasks-title">Etapas desta tarefa</div>
                    {((item as any).subtarefas || []).map((sub: ObjectiveSubitem) => (
                      <div key={sub.id} className="objective-subtask-row">
                        <input className="form-input" value={sub.texto} onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, subtarefas: ((i as any).subtarefas || []).map((s: ObjectiveSubitem) => s.id === sub.id ? { ...s, texto: e.target.value } : s) } : i))} placeholder="Subtarefa interna" />
                        <button className="btn btn-ghost danger" type="button" onClick={() => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, subtarefas: ((i as any).subtarefas || []).filter((s: ObjectiveSubitem) => s.id !== sub.id) } : i))}><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, subtarefas: [...((i as any).subtarefas || []), { id: nanoid(), texto: 'Nova etapa', feito: false }] } : i))}><Plus size={14} /> Adicionar etapa nesta tarefa</button>
                  </div>
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
            <h3>Tarefas da lista</h3>
            <div className="task-checklist-head-actions">
              {total > 0 && (
                <button className="btn btn-secondary btn-sm" type="button" onClick={copiarChecklist}>
                  <Copy size={14} /> Copiar tarefas
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
                    const canAssumeThisItem = !isGestor && isFreeTeamTask(tarefa) && !item.feito && !checklistItemAssignmentId(item)
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
                            <span className="task-check-text">{checklistDisplayText(item)} {isSurpriseChecklistItem(item) && <em className="task-surprise-badge">Surpresa</em>}</span>
                            {!isPersonal && <span className="task-check-points">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}
                            {!isPersonal && <span className="task-check-desc"><User size={12} /> Executor: {checklistExecutorName(item, tarefa)}</span>}
                            {item.data && <span className="task-check-desc"><Calendar size={12} /> Execução: {fmtDate(item.data)}</span>}
                            {checklistDisplayDesc(item) && <span className="task-check-desc">{checklistDisplayDesc(item)}</span>}
                            {Array.isArray((item as any).subtarefas) && (item as any).subtarefas.length > 0 && (
                              <span className="objective-subtasks-view">
                                <strong>Etapas desta tarefa:</strong>
                                {((item as any).subtarefas as ObjectiveSubitem[]).map(sub => <em key={sub.id}>• {sub.texto}</em>)}
                              </span>
                            )}
                          </span>
                        </button>
                        {isGestor && item.feito && (item as any).aprovacao_status !== 'aprovada' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-primary btn-sm" type="button" onClick={() => revisarItem(item, 'aprovar')} disabled={saving}>Aprovar parte</button>
                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => revisarItem(item, 'devolver')} disabled={saving}>Devolver</button>
                          </div>
                        )}
                        {isGestor && (item as any).aprovacao_status === 'aprovada' && <span className="badge badge-success">Aprovada · pontos liberados</span>}
                        {canAssumeThisItem && (
                          <button className="btn btn-primary btn-sm task-check-assume" type="button" onClick={() => assumirChecklistItem(item)} disabled={saving}>
                            Assumir tarefa
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{isGestor ? 'Esta lista não possui tarefas.' : 'Nenhuma tarefa desta lista está atribuída a você.'}</p>
          )}
          {total > 0 && (
            <div className="task-execution-summary">
              <strong>{isPersonal ? 'Progresso pessoal:' : 'Fluxo da lista:'}</strong> {isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : 'cada membro conclui somente suas tarefas e envia sua parte. O gestor visualiza os arquivos enviados e aprova ou devolve a lista inteira.'}
              {myProgress.total > 0 && <span>{isPersonal ? 'Seu progresso' : 'Sua parte'}: {myProgress.done}/{myProgress.total} tarefas.</span>}
              <span>Total da lista: {done}/{total} tarefas.</span>
              {isGestor && executorSummary.length > 0 && <span>Execução por membro: {executorSummary.map(e => `${e.nome} ${e.feitos}/${e.total}`).join(' · ')}</span>}
            </div>
          )}
          {total > 0 && !canToggleChecklist && (
            <p className="muted" style={{ marginTop: 8 }}>{isPersonal ? 'Esta lista pessoal só pode ser marcada pelo próprio criador.' : 'Tarefas bloqueadas. Cada tarefa só pode ser marcada pelo executor definido nela; se não houver executor na tarefa, vale o responsável principal da lista.'}</p>
          )}
        </section>

        {canExecuteTask && (
          <section className="task-detail-section">
            <h3>{allChecklistDone ? 'Arquivos da conclusão geral' : 'Arquivos da sua parte'}</h3>
            <FileDropzone
              id={`concluir-evidencias-${tarefa.id}`}
              files={files}
              onFiles={anexarArquivosExecucao}
              label={allChecklistDone ? 'Anexar arquivos da conclusão geral' : 'Anexar arquivos da sua parte'}
              help="Fotos, PDFs, comprovantes, planilhas ou documentos que comprovem a execução. O arquivo fica salvo imediatamente, mesmo antes de enviar a tarefa."
            />
            <label className="form-label">Observação de conclusão</label>
            <textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: executei os itens marcados e anexei os comprovantes..." />
            <label className="form-label">Motivo caso não tenha concluído</label>
            <textarea className="form-input" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Obrigatório somente se clicar em Não concluí." />
          </section>
        )}

        <section className="task-detail-section">
          <div className="task-detail-section-head">
            <h3>Comentários e acompanhamento</h3>
            <span className="muted">Conversa auditável da lista ou de uma tarefa específica.</span>
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <select className="form-input" value={comentarioItemId} onChange={e => setComentarioItemId(e.target.value)}>
              <option value="">Comentário geral da lista</option>
              {displayChecklist.map(i => <option key={i.id} value={i.id}>Item: {checklistDisplayText(i)}</option>)}
            </select>
            <textarea className="form-input" rows={2} value={comentarioTexto} onChange={e => setComentarioTexto(e.target.value)} placeholder="Registre o que foi feito, uma dúvida, orientação ou devolutiva..." />
            <button className="btn btn-secondary" type="button" onClick={enviarComentario} disabled={saving}><Send size={14} /> Registrar comentário</button>
          </div>
          {comentariosLoading ? <p className="muted">Carregando comentários...</p> : comentarios.length ? (
            <div className="task-member-justification-list">{comentarios.map((c:any) => (
              <div className="task-member-justification-card" key={c.id}>
                <div className="task-member-justification-head"><strong>{c.autor_nome || 'Usuário'}</strong><span>{c.tipo}</span></div>
                <p>{c.comentario}</p>
                <div className="task-member-justification-meta"><span>{c.checklist_id ? `Item ${c.checklist_id}` : 'Lista geral'}</span><span>{fmtDateTime(c.criado_em)}</span></div>
              </div>
            ))}</div>
          ) : <p className="muted">Nenhum comentário registrado.</p>}
        </section>

        {isGestor && (
          <section className="task-detail-section task-member-justifications">
            <div className="task-detail-section-head">
              <h3>Justificativas e observações dos membros</h3>
              <span className="muted">Tudo que o executor escreveu ao enviar, reenviar ou justificar aparece aqui para conferência do gestor.</span>
            </div>
            {execHistoryLoading ? (
              <p className="muted">Carregando justificativas...</p>
            ) : executionNotes.length > 0 ? (
              <div className="task-member-justification-list">
                {executionNotes.map(note => (
                  <div key={note.id} className="task-member-justification-card">
                    <div className="task-member-justification-head">
                      <strong>{note.origem}</strong>
                      {note.tipo && <span>{note.tipo}</span>}
                    </div>
                    <p>{note.texto}</p>
                    <div className="task-member-justification-meta">
                      {note.autor && <span>Por: {note.autor}</span>}
                      {note.data && <span>{fmtDateTime(note.data)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Nenhuma justificativa ou observação de execução enviada ainda.</p>
            )}
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
          <button className="btn btn-secondary" type="button" onClick={imprimirRelatorio}><Printer size={14} /> Relatório / PDF</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Fechar</button>
          {canReviewTask && tarefa.status === 'concluida' && <button className="btn btn-primary" type="button" onClick={() => onApprove(tarefa)}>Aprovar</button>}
          {canReviewTask && ['concluida', 'nao_concluida'].includes(tarefa.status) && <button className="btn btn-secondary" type="button" onClick={() => onReturn(tarefa)}>Devolver</button>}
          {canReviewTask && (tarefa.status === 'aprovada' || (distributedTask && tarefa.status === 'concluida')) && <button className="btn btn-secondary" type="button" onClick={() => onComplemento(tarefa)}>Complementar</button>}
          {canExecuteTask && tarefa.status === 'devolvida' && <button className="btn btn-primary" type="button" onClick={reenviarCorrecao} disabled={saving}>{saving ? <Loader size={14} /> : <RotateCcw size={14} />} Reenviar correção</button>}
          {canExecuteTask && tarefa.status !== 'devolvida' && <button className="btn btn-secondary" type="button" onClick={naoConcluir} disabled={saving}>Não concluí</button>}
          {canExecuteTask && tarefa.status !== 'devolvida' && <button className="btn btn-primary" type="button" onClick={concluir} disabled={saving}>{saving ? <Loader size={14} /> : <CheckCircle2 size={14} />} {distributedTask && myProgress.total > 0 && myProgress.total < geralProgress.total ? 'Enviar minha parte' : 'Enviar tarefa'}</button>}
        </div>
      </div>
    </ModalBase>
  )
}

// ── PEDIR AJUDA — modal do executor ──────────────────────────────────────────
function PedirAjudaModal({ tarefa, membros, userId, onClose, onSent }: {
  tarefa: Tarefa
  membros: MembroEquipe[]
  userId: string
  onClose: () => void
  onSent?: () => void
}) {
  const [mensagem, setMensagem] = useState('')
  const [destinatarioId, setDestinatarioId] = useState('')
  const [loading, setLoading] = useState(false)

  // Opções: gestor da org + outros membros (exceto o próprio usuário)
  const opcoes = useMemo(() => {
    return membros.filter(m => m.id !== userId)
  }, [membros, userId])

  async function enviar() {
    if (!mensagem.trim()) { toast('Descreva o que você precisa.', 'error'); return }
    if (!destinatarioId) { toast('Escolha para quem pedir ajuda.', 'error'); return }
    setLoading(true)
    try {
      await tarefasApi.criarAjuda(tarefa.id, { mensagem: mensagem.trim(), destinatario_id: destinatarioId })
      toast('Pedido de ajuda enviado. A pessoa será notificada.')
      await onSent?.()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao enviar pedido.', 'error')
    } finally { setLoading(false) }
  }

  return (
    <ModalBase title="Pedir ajuda" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>📋 {tarefa.titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
            Pedir ajuda não transfere a responsabilidade. A lista continua sendo sua.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Pedir ajuda para *</label>
          <select className="form-input" value={destinatarioId} onChange={e => setDestinatarioId(e.target.value)}>
            <option value="">Escolha quem pode ajudar...</option>
            {opcoes.map(m => (
              <option key={m.id} value={m.id}>
                {m.nome}{m.role ? ` · ${m.role}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">O que você precisa? *</label>
          <textarea
            className="form-input"
            rows={4}
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            placeholder="Ex.: Estou com dificuldade em acessar o documento X. Pode me ajudar a entender o passo 3 desta tarefa?"
            autoFocus
            maxLength={500}
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', marginTop: 3 }}>{mensagem.length}/500</div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancelar</button>
          <button className="btn btn-primary" onClick={enviar} disabled={loading} type="button">
            {loading ? <Loader size={14} /> : <MessageSquare size={14} />} Enviar pedido
          </button>
        </div>
      </div>
    </ModalBase>
  )
}

// ── PAINEL DE AJUDA — visualizar e responder pedidos ─────────────────────────
function PainelAjudaModal({ tarefa, userId, isGestor, onClose, onChanged }: {
  tarefa: Tarefa
  userId: string
  isGestor: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const [ajudas, setAjudas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [resposta, setResposta] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    tarefasApi.listarAjuda(tarefa.id)
      .then(setAjudas)
      .catch(() => toast('Erro ao carregar pedidos de ajuda.', 'error'))
      .finally(() => setLoading(false))
  }, [tarefa.id])

  async function responder(ajudaId: string) {
    const texto = resposta[ajudaId]?.trim()
    if (!texto) { toast('Informe a resposta.', 'error'); return }
    setSaving(ajudaId)
    try {
      const updated = await tarefasApi.responderAjuda(ajudaId, texto)
      setAjudas(prev => prev.map(a => a.id === ajudaId ? updated : a))
      toast('Resposta enviada.')
      onChanged?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao responder.', 'error')
    } finally { setSaving(null) }
  }

  async function resolver(ajudaId: string) {
    setSaving(ajudaId)
    try {
      const updated = await tarefasApi.resolverAjuda(ajudaId)
      setAjudas(prev => prev.map(a => a.id === ajudaId ? updated : a))
      toast('Pedido marcado como resolvido.')
      onChanged?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao resolver.', 'error')
    } finally { setSaving(null) }
  }

  const STATUS_AJUDA: Record<string, { label: string; color: string }> = {
    pendente:   { label: 'Aguardando resposta', color: '#F59E0B' },
    respondida: { label: 'Respondida',          color: '#3B82F6' },
    resolvida:  { label: 'Resolvida',           color: '#10B981' },
  }

  return (
    <ModalBase title="Ajuda da lista" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 10, padding: '8px 12px' }}>
          📋 {tarefa.titulo}
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center' }}><Loader size={20} className="spin-icon" /></div>
        ) : ajudas.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Nenhum pedido de ajuda nesta lista.
          </div>
        ) : (
          ajudas.map(a => {
            const sc = STATUS_AJUDA[a.status] || STATUS_AJUDA.pendente
            const podeResponder = a.destinatario_id === userId && a.status === 'pendente'
            const podeResolver = (a.solicitante_id === userId || isGestor) && a.status === 'respondida'
            return (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{a.solicitante_nome}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>pediu ajuda para</span>
                    <strong style={{ fontSize: 13, marginLeft: 4 }}>{a.destinatario_nome}</strong>
                  </div>
                  <span style={{ fontSize: 11, color: sc.color, background: `${sc.color}18`, borderRadius: 999, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {sc.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {a.mensagem}
                </div>
                {a.resposta ? (
                  <div style={{ fontSize: 12.5, color: '#3B82F6', background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.15)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    <strong>Resposta de {a.destinatario_nome || 'quem ajudou'}:</strong> {a.resposta}
                  </div>
                ) : a.solicitante_id === userId ? (
                  <div style={{ fontSize: 12.5, color: '#F59E0B', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.20)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
                    Aguardando resposta de {a.destinatario_nome || 'quem recebeu o pedido'}. Quando responder, aparecerá aqui e no topo em “Respostas de ajuda recebidas”.
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {fmtDateTime(a.created_at)}
                  {a.respondida_em && ` · Respondido em ${fmtDateTime(a.respondida_em)}`}
                  {a.resolvida_em && ` · Resolvido em ${fmtDateTime(a.resolvida_em)}`}
                </div>
                {podeResponder && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <textarea
                      className="form-input"
                      rows={3}
                      placeholder="Sua resposta..."
                      value={resposta[a.id] || ''}
                      onChange={e => setResposta(prev => ({ ...prev, [a.id]: e.target.value }))}
                    />
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => responder(a.id)} disabled={saving === a.id}>
                      {saving === a.id ? <Loader size={13} /> : <Send size={13} />} Enviar resposta
                    </button>
                  </div>
                )}
                {podeResolver && (
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => resolver(a.id)} disabled={saving === a.id} style={{ alignSelf: 'flex-start' }}>
                    {saving === a.id ? <Loader size={13} /> : <CheckCircle2 size={13} />} Marcar como resolvido
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </ModalBase>
  )
}

function TarefaCard({ tarefa, userId, isGestor, actionBusy = false, helpPendingForMe = false, helpRequestedByMe = null, onOpen, onEdit, onDelete, onStart, onPegar, onResponder, onApprove, onReturn, onComplemento, onHistory, onAnexos, onReminder, onPedirAjuda, onPainelAjuda }: {
  tarefa: Tarefa
  userId: string
  isGestor: boolean
  actionBusy?: boolean
  helpPendingForMe?: boolean
  helpRequestedByMe?: any | null
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
  onPedirAjuda: (t: Tarefa) => void
  onPainelAjuda: (t: Tarefa) => void
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
  const aceitaPorOutro = isAcceptedByOtherMember(tarefa, userId)
  const isPersonal = taskScope(tarefa) === 'pessoal'
  const listSurprise = taskIsSurprise(tarefa)
  const rawHelpPending = Boolean((tarefa as any).pedido_ajuda_pendente)
  const canAnswerHelp = Boolean(helpPendingForMe)
  const hasMyHelpRequest = Boolean(helpRequestedByMe)
  const hasHelpPending = isGestor ? rawHelpPending : (canAnswerHelp || hasMyHelpRequest)

  // Checklist marcável somente pelo executor real da tarefa.
  // Gestor/admin/dev conferem, aprovam e devolvem, mas não marcam execução de outra pessoa.
  const hasChecklistForMe = taskHasChecklistForUser(tarefa, userId)
  const isAssigneeByFreeTask = tarefa.aceita_por === userId
  const canExecuteTask = !isTaskFinalizada && (isPersonal
    ? (isResponsavel || isCriador)
    : (!isGestor && (isResponsavel || isAssigneeByFreeTask || hasChecklistForMe)))
  const canReviewTask = !isPersonal && isGestor && !['aprovada', 'cancelada'].includes(String(tarefa.status || ''))
  const ultimaEvidencia = (tarefa as any).ultima_evidencia_em as string | undefined
  const responsavelLabel = livreDisponivel
    ? 'Livre para assumir'
    : aceitaPorOutro
      ? `Em execução por outro membro`
      : tarefa.responsavel_id
        ? (tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'Responsável')
        : taskScope(tarefa) === 'equipe'
          ? 'Lista de tarefas da equipe'
          : 'Lista pessoal'
  const checklistLabel = checkTotal > 0
    ? `${checkDone}/${checkTotal}${!isGestor && geralProgress.total !== checkTotal ? ' da sua parte' : ''}`
    : 'Sem tarefas'
  const progressWidth = checkTotal > 0 ? Math.max(6, Math.round((checkDone / Math.max(checkTotal, 1)) * 100)) : 0

  return (
    <article
      className={[
        'task-report-row',
        tarefa.data_reabertura && !isTaskFinalizada ? 'task-report-row--reaberta' : '',
        listSurprise ? 'task-report-row--surpresa' : '',
      ].filter(Boolean).join(' ')}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return; onOpen(tarefa) }}
      title="Clique para abrir a lista"
    >
      {/* COLUNA PRINCIPAL — título + meta */}
      <div className="task-report-main">
        <button className="task-report-title" type="button" onClick={() => onOpen(tarefa)}>
          <Icon size={16} color={sc.color} />
          <span>{tarefa.titulo}</span>
          {listSurprise && <span className="task-surprise-pill">🎲 Surpresa</span>}
          {taskScope(tarefa) === 'equipe'
            ? <span className="task-scope-badge task-scope-badge--equipe">Equipe</span>
            : <span className="task-scope-badge task-scope-badge--pessoal">Pessoal</span>
          }
        </button>
        <div className="task-report-meta">
          <span><User size={12} /> {responsavelLabel}</span>
          {livreAceita && !aceitaPorOutro && <span>Assumida por {(tarefa as any).aceita_por_nome || tarefa.responsavel_nome_perfil || tarefa.responsavel_nome || 'membro'}</span>}
          {aceitaPorOutro && <span className="outro-membro">⏳ Em execução por outro membro</span>}
          {tarefa.prazo
            ? <span className={overdue ? 'danger' : undefined}><Calendar size={12} /> {overdue ? '⚠ ' : ''}Prazo {fmtDate(tarefa.prazo)}</span>
            : null}
          {tarefa.data_reabertura && <span><RotateCcw size={12} /> Reaberta {fmtDate(tarefa.data_reabertura)}</span>}
          {anexosCount > 0 && <span><Paperclip size={12} /> {anexosCount} arquivo{anexosCount > 1 ? 's' : ''}</span>}
          {(tarefa as any).origem_sistema === 'destrava' && (
            <span className="task-destrava-badge">⚡ Destrava{(tarefa as any).origem_nome ? ` · ${(tarefa as any).origem_nome}` : ''}</span>
          )}
        </div>
        {distributedTask && isGestor && executorSummary.length > 0 && (
          <div className="task-report-team-line">
            {executorSummary.map(e => `${e.nome} ${e.feitos}/${e.total}`).join(' · ')}
          </div>
        )}
        {hasHelpPending && (
          <div className="task-report-team-line" style={{ color: '#F59E0B', fontWeight: 700 }}>
            💬 Pedido de ajuda pendente nesta lista
          </div>
        )}
      </div>

      {/* COLUNA STATUS */}
      <div className="task-report-cell task-report-status">
        <span style={{ color: sc.color, background: sc.bg }}><Icon size={12} /> {sc.label}</span>
        {livreDisponivel && <em>Livre para assumir</em>}
        {livreAceita && !aceitaPorOutro && <em>Assumida</em>}
        {aceitaPorOutro && <em className="outro-membro">Outro membro</em>}
        {overdue && !isTaskFinalizada && <em style={{ color: '#EF4444', background: 'rgba(239,68,68,.1)', borderColor: 'rgba(239,68,68,.2)' }}>Atrasada</em>}
      </div>

      {/* COLUNA PRIORIDADE */}
      <div className="task-report-cell task-report-priority">
        <span style={{ color: pc.color, background: `${pc.color}18` }}>{pc.label}</span>
      </div>

      {/* COLUNA PROGRESSO */}
      <div className="task-report-cell task-report-progress">
        <strong>{checklistLabel}</strong>
        {checkTotal > 0 && (
          <div className="task-progress-line compact">
            <span style={{ width: `${progressWidth}%` }} />
          </div>
        )}
      </div>

      {/* COLUNA AÇÕES */}
      <div className="task-report-actions">
        {/* Membro: assumir lista livre */}
        {livreDisponivel && !isGestor && (
          <button className="btn btn-primary btn-sm task-action-btn task-btn-assumir" onClick={() => onPegar(tarefa)} type="button" disabled={actionBusy}>
            {actionBusy ? 'Assumindo...' : 'Assumir'}
          </button>
        )}
        {/* Info: em execução por outro */}
        {aceitaPorOutro && !isGestor && (
          <span className="task-outro-membro-badge">⏳ Outro membro</span>
        )}

        {/* Ver lista */}
        <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onOpen(tarefa)} type="button">Ver lista</button>

        {canAnswerHelp && !isPersonal && (
          <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onPainelAjuda(tarefa)} type="button">
            Responder ajuda
          </button>
        )}

        {!canAnswerHelp && hasMyHelpRequest && !isPersonal && (
          <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onPainelAjuda(tarefa)} type="button">
            {String(helpRequestedByMe?.status || '') === 'respondida' ? 'Ver resposta' : 'Ajuda'}
          </button>
        )}

        {!canAnswerHelp && !hasMyHelpRequest && canExecuteTask && !isPersonal && !isGestor && (
          <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onPedirAjuda(tarefa)} type="button">
            Pedir ajuda
          </button>
        )}

        {!canAnswerHelp && !hasMyHelpRequest && isGestor && !isPersonal && rawHelpPending && (
          <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onPainelAjuda(tarefa)} type="button">
            Ver ajuda
          </button>
        )}

        {isPersonal ? (
          <>
            <button className="btn btn-ghost btn-sm task-action-btn" onClick={() => onEdit(tarefa)} type="button"><Edit3 size={12} /> Editar</button>
            {canDeleteTarefa(tarefa, userId, isGestor) && (
              <button className="btn btn-ghost btn-sm task-action-icon danger" title="Apagar lista" onClick={() => onDelete(tarefa.id)} type="button"><Trash2 size={13} /></button>
            )}
          </>
        ) : (
          <>
            {/* Membro: iniciar / executar */}
            {canExecuteTask && ['pendente', 'devolvida'].includes(tarefa.status) && (
              <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onStart(tarefa)} type="button">Iniciar</button>
            )}
            {canExecuteTask && ['em_progresso','reenviada'].includes(tarefa.status) && (
              <button className="btn btn-primary btn-sm task-action-btn" onClick={() => onOpen(tarefa)} type="button">Executar</button>
            )}

            {/* Gestor: aprovar / devolver */}
            {canReviewTask && tarefa.status === 'concluida' && (
              <button className="btn btn-primary btn-sm task-action-btn" onClick={() => onApprove(tarefa)} type="button">Aprovar</button>
            )}
            {canReviewTask && ['concluida', 'nao_concluida'].includes(tarefa.status) && (
              <button className="btn btn-secondary btn-sm task-action-btn" onClick={() => onReturn(tarefa)} type="button">Devolver</button>
            )}

            {/* Gestor: ações secundárias */}
            {isGestor && (
              <>
                <button className="btn btn-ghost btn-sm task-action-icon" title="Arquivos" onClick={() => onAnexos(tarefa)} type="button"><Paperclip size={13} /></button>
                <button className="btn btn-ghost btn-sm task-action-icon" title="Histórico" onClick={() => onHistory(tarefa)} type="button"><History size={13} /></button>
                {canReviewTask && (
                  <button className="btn btn-ghost btn-sm task-action-icon" title="Enviar lembrete" onClick={() => onReminder(tarefa)} type="button"><MessageSquare size={13} /></button>
                )}
                {(tarefa.status === 'aprovada' || (distributedTask && tarefa.status === 'concluida')) && (
                  <button className="btn btn-ghost btn-sm task-action-icon" title="Solicitar complemento" onClick={() => onComplemento(tarefa)} type="button"><RotateCcw size={13} /></button>
                )}
              </>
            )}
            {canDeleteTarefa(tarefa, userId, isGestor) && (
              <button className="btn btn-ghost btn-sm task-action-icon danger" title="Apagar lista" onClick={() => onDelete(tarefa.id)} type="button"><Trash2 size={13} /></button>
            )}
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
          const tarefasInternas = Number(membro.subtarefas_executadas || 0)
          const listasExecutadas = Number(membro.tarefas_executadas || 0)
          const totalAprovadas = tarefasInternas + listasExecutadas
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
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>{totalAprovadas ? `${totalAprovadas} lançamento(s) aprovado(s)` : 'Nenhuma pontuação aprovada no período'}</span>
                <div style={{ marginTop: 6, height: 5, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pontos > 0 ? 'linear-gradient(90deg, var(--primary), #10B981)' : 'var(--border)', borderRadius: 999, transition: 'width .4s ease' }} />
                </div>
                {historico.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600 }}>Ver extrato completo de pontos ({historico.length})</summary>
                    <div className="ranking-history-list">
                      {historico.map((h: any, i: number) => (
                        <div key={`${h.tarefa_id || i}-${i}`} className="ranking-history-item">
                          <div className="ranking-history-main">
                            <strong>{h.subtarefa_titulo || h.tarefa_titulo || 'Tarefa aprovada'}</strong>
                            {h.subtarefa_titulo && <span>{h.tarefa_titulo}</span>}
                            <em>{[h.tarefa_excluida ? 'Tarefa excluída — pontuação preservada' : '', h.dificuldade ? `Dificuldade: ${String(h.dificuldade)}` : '', h.aprovado_em ? `Aprovada em ${fmtDateTime(h.aprovado_em)}` : ''].filter(Boolean).join(' · ')}</em>
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


function FilterPanel({
  membroFiltro, setMembroFiltro,
  mesFiltro, setMesFiltro,
  anoFiltro, setAnoFiltro,
  prioridade, setPrioridade,
  membroOptions, anoOptions,
  onLimpar, activeCount
}: {
  membroFiltro: string; setMembroFiltro: (v: string) => void
  mesFiltro: string; setMesFiltro: (v: string) => void
  anoFiltro: string; setAnoFiltro: (v: string) => void
  prioridade: string; setPrioridade: (v: string) => void
  membroOptions: Array<{ id: string; nome: string; role?: string }>
  anoOptions: string[]
  onLimpar: () => void
  activeCount: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="tarefas-filter-dropdown">
      <button className={`btn btn-secondary tarefas-filter-btn${activeCount > 0 ? ' active' : ''}`} type="button" onClick={() => setOpen(v => !v)}>
        <Search size={14} /> Filtros {activeCount > 0 && <span className="filter-active-badge">{activeCount}</span>}
      </button>
      {open && (
        <div className="tarefas-filter-panel">
          <div className="tarefas-filter-header">
            <strong>Filtros avançados</strong>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => { onLimpar(); setOpen(false) }}>Limpar</button>
          </div>
          <div className="tarefas-filter-grid">
            <div className="form-group">
              <label className="form-label">Membro</label>
              <select className="form-input" value={membroFiltro} onChange={e => setMembroFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                {membroOptions.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Mês</label>
              <select className="form-input" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => (
                  <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ano</label>
              <select className="form-input" value={anoFiltro} onChange={e => setAnoFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                {anoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value)}>
                <option value="todos">Todas</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8 }} type="button" onClick={() => setOpen(false)}>Aplicar</button>
        </div>
      )}
    </div>
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
  const [ajuda, setAjuda] = useState<Tarefa | null>(null)
  const [painelAjuda, setPainelAjuda] = useState<Tarefa | null>(null)
  const [ajudasPendentes, setAjudasPendentes] = useState<any[]>([])
  const [minhasAjudas, setMinhasAjudas] = useState<any[]>([])
  const [devolverTarget, setDevolverTarget] = useState<Tarefa | null>(null)
  const [lembreteTarget, setLembreteTarget] = useState<Tarefa | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('todos')
  const [prioridade, setPrioridade] = useState('todos')
  const [membroFiltro, setMembroFiltro] = useState('todos')
  const [mesFiltro, setMesFiltro] = useState('todos')
  const [anoFiltro, setAnoFiltro] = useState('todos')
  const [escopo, setEscopo] = useState<'pessoais' | 'equipe' | 'disponiveis' | 'ranking' | 'todas' | 'recentes'>('todas')
  const [statusTab, setStatusTab] = useState<'todos' | 'pendentes' | 'execucao' | 'concluidas' | 'atrasadas' | 'ultimas'>('todos')
  const [ranking, setRanking] = useState<{ periodo: string; ranking: any[]; resumo: any } | null>(null)
  const [periodoRanking, setPeriodoRanking] = useState(() =>
    localStorage.getItem('nexus:ranking-periodo') || 'todos'
  )
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => Number(localStorage.getItem('nexus:offline-queue-count') || '0'))
  const [actionTaskId, setActionTaskId] = useState<string | null>(null)

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
      const [ts, ms, rk, aj, minhasAj] = await Promise.all([
        tarefasApi.list(),
        // Membros também precisam da equipe para o fluxo de "Pedir ajuda".
        // Antes carregava apenas para gestor, deixando o select vazio para membro.
        equipeApi.membros().catch(() => []),
        tarefasApi.ranking(periodoRanking).catch(() => null),
        tarefasApi.ajudaPendentes()
          .then(a => helpForCurrentUser(Array.isArray(a) ? a : [], user?.id))
          .catch(() => []),
        tarefasApi.minhasAjudas()
          .then(a => helpRequestedByCurrentUser(Array.isArray(a) ? a : [], user?.id))
          .catch(() => []),
      ])
      setTarefas(Array.isArray(ts) ? uniqueById(ts) : [])
      setMembros(Array.isArray(ms) ? ms : [])
      setRanking(rk)
      setAjudasPendentes(Array.isArray(aj) ? aj : [])
      setMinhasAjudas(Array.isArray(minhasAj) ? minhasAj : [])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar tarefas.', 'error')
    } finally { setLoading(false) }
  }, [periodoRanking, user?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const id = params.get('task')
    const openHelp = params.get('help') === '1'
    if (!id) return

    const found = tarefas.find(t => t.id === id)
    if (found) {
      if (openHelp) setPainelAjuda(found)
      else setDetalhe(found)
      return
    }

    // Pedido de ajuda pode ser enviado para alguém que não é executor da lista.
    // Nesse caso a lista pode não aparecer no GET /tarefas do destinatário,
    // mas o GET /tarefas/ajuda/pendentes traz a pendência autorizada.
    // Este fallback garante que o clique na notificação sempre tenha destino útil,
    // sem ampliar acesso à lista: o modal carrega somente a conversa de ajuda.
    if (openHelp) {
      const pendencia = ajudasPendentes.find(a => a.tarefa_id === id)
      if (pendencia) {
        abrirPainelAjudaDaPendencia(pendencia)
        return
      }
      const minhaSolicitacao = minhasAjudas.find((a: any) => a.tarefa_id === id)
      if (minhaSolicitacao) abrirPainelAjudaDaMinhaSolicitacao(minhaSolicitacao)
    }
  }, [location.search, tarefas, ajudasPendentes, minhasAjudas])
  useEffect(() => {
    const h = () => { setEdit(null); setModalOpen(true) }
    window.addEventListener('nexus:open-new', h)
    return () => window.removeEventListener('nexus:open-new', h)
  }, [])

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine)
      setOfflineQueueCount(Number(localStorage.getItem('nexus:offline-queue-count') || '0'))
      if (navigator.onLine) setTimeout(() => load(), 900)
    }
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    window.addEventListener('nexus:offline-queue-changed', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      window.removeEventListener('nexus:offline-queue-changed', refresh)
    }
  }, [load])

  const tarefasVisiveis = useMemo(() => consolidateVisualTasks(tarefas), [tarefas])

  const isPersonalTask = useCallback((t: Tarefa) => {
    const uid = user?.id || ''
    if (!uid) return false
    // Tarefas da equipe nunca entram em Minhas tarefas pessoais, mesmo quando
    // o usuário assumiu a execução ou recebeu um item de tarefas. Elas ficam
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
        if (item.responsavel_id) map.set(item.responsavel_id, { id: item.responsavel_id, nome: item.responsavel_nome || 'Executor da tarefa' })
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
    if (actionTaskId) return
    setActionTaskId(t.id)
    try {
      let saved: Tarefa | null = null
      let pegarError: unknown = null
      try {
        saved = await tarefasApi.pegar(t.id)
      } catch (e) {
        pegarError = e
      }

      // Defesa de navegação: em algumas listas livres, o botão interno assume o objetivo
      // corretamente, mas o botão do card usa o endpoint da lista inteira. Quando a lista
      // tem objetivo livre visível para o membro, fazemos fallback seguro para o mesmo
      // fluxo interno, sem quebrar tarefa surpresa nem tarefa já assumida por outro.
      if (!saved) {
        const item = firstOpenChecklistItemForCurrentUser(t, user?.id)
        if (item?.id) {
          saved = await tarefasApi.assumirChecklist(t.id, item.id)
        } else {
          throw pegarError instanceof Error ? pegarError : new Error('Não foi possível assumir esta tarefa.')
        }
      }

      updateSaved(saved)
      await load()
      toast('Tarefa assumida. Você já pode executar sua parte.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao assumir tarefa.', 'error')
    } finally {
      setActionTaskId(null)
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
    setDevolverTarget(t)
  }

  async function enviarLembreteManual(t: Tarefa) {
    setLembreteTarget(t)
  }

  async function remove(id: string) {
    if (!confirm('Apagar esta tarefa definitivamente?')) return
    try { await tarefasApi.remove(id); setTarefas(prev => prev.filter(t => t.id !== id)); toast('Tarefa apagada.') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro ao apagar.', 'error') }
  }

  const atualizarAjudas = useCallback(async () => {
    const [pendentes, minhas] = await Promise.all([
      tarefasApi.ajudaPendentes().then(a => helpForCurrentUser(Array.isArray(a) ? a : [], user?.id)).catch(() => []),
      tarefasApi.minhasAjudas().then(a => helpRequestedByCurrentUser(Array.isArray(a) ? a : [], user?.id)).catch(() => []),
    ])
    setAjudasPendentes(Array.isArray(pendentes) ? pendentes : [])
    setMinhasAjudas(Array.isArray(minhas) ? minhas : [])
  }, [user?.id])


  const ajudaPendenteMinhaPorTarefa = useMemo(() => {
    const ids = new Set<string>()
    ajudasPendentes.forEach((a: any) => {
      if (a?.tarefa_id && a.destinatario_id === user?.id && a.solicitante_id !== user?.id) ids.add(a.tarefa_id)
    })
    return ids
  }, [ajudasPendentes, user?.id])


  const minhasAjudasPorTarefa = useMemo(() => {
    const map = new Map<string, any>()
    minhasAjudas.forEach((a: any) => {
      if (!a?.tarefa_id || a.solicitante_id !== user?.id || a.destinatario_id === user?.id) return
      const current = map.get(a.tarefa_id)
      const currentTime = current ? new Date(current.respondida_em || current.updated_at || current.created_at || 0).getTime() : -1
      const nextTime = new Date(a.respondida_em || a.updated_at || a.created_at || 0).getTime()
      if (!current || nextTime >= currentTime) map.set(a.tarefa_id, a)
    })
    return map
  }, [minhasAjudas, user?.id])

  function abrirPainelAjudaDaMinhaSolicitacao(a: any) {
    abrirPainelAjudaDaPendencia(a)
  }

  function abrirPainelAjudaDaPendencia(a: any) {
    const tarefaDaLista = tarefas.find(t => t.id === a.tarefa_id)
    if (tarefaDaLista) {
      setPainelAjuda(tarefaDaLista)
      return
    }
    setPainelAjuda({
      id: a.tarefa_id,
      titulo: a.tarefa_titulo || 'Pedido de ajuda',
      status: 'pendente',
      prioridade: 'media',
      checklist: [],
      created_at: a.created_at,
      updated_at: a.created_at,
    } as unknown as Tarefa)
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '16px 16px calc(var(--bottom-nav-h, 72px) + env(safe-area-inset-bottom) + 24px)' }}>

      {/* ── CABEÇALHO ─────────────────────────────────────── */}
      <header className="tarefas-page-header">
        <div>
          <h1 className="tarefas-page-title">{t('tasks.pageTitle')}</h1>
          <p className="tarefas-page-sub">
            {escopo === 'pessoais' ? 'Minhas listas pessoais'
              : escopo === 'equipe' ? 'Listas da equipe'
              : escopo === 'disponiveis' ? 'Disponíveis para assumir'
              : escopo === 'ranking' ? 'Pontuação e reconhecimento'
              : 'Todas as listas de tarefas'}
          </p>
        </div>
        <button className="btn btn-primary tarefas-new-btn" onClick={() => { setEdit(null); setModalOpen(true) }} type="button">
          <Plus size={17} /> Nova lista
        </button>
      </header>

      {/* ── OFFLINE BANNER ────────────────────────────────── */}
      {(!online || offlineQueueCount > 0) && (
        <div className="offline-sync-banner">
          <strong>{online ? 'Sincronização pendente' : 'Modo offline ativo'}</strong>
          <span>{online ? `${offlineQueueCount} atualização(ões) aguardando envio.` : 'Você pode consultar dados salvos e registrar alterações simples. Ao voltar a internet, o Nexus sincroniza automaticamente.'}</span>
        </div>
      )}

      {ajudasPendentes.length > 0 && (
        <section style={{ background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.28)', borderRadius: 16, padding: 12, marginBottom: 12, display: 'grid', gap: 8 }}>
          <strong style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} /> Pedidos de ajuda pendentes</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            {ajudasPendentes.slice(0, 3).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}><strong>{a.solicitante_nome || 'Um membro'}</strong> precisa da sua ajuda{a.tarefa_titulo ? ` · ${a.tarefa_titulo}` : ''}</span>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => abrirPainelAjudaDaPendencia(a)}>Responder agora</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {minhasAjudas.some((a: any) => a.status === 'respondida') && (
        <section style={{ background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.22)', borderRadius: 16, padding: 12, marginBottom: 12, display: 'grid', gap: 8 }}>
          <strong style={{ color: '#3B82F6', display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} /> Respostas de ajuda recebidas</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            {minhasAjudas.filter((a: any) => a.status === 'respondida').slice(0, 3).map((a: any) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}><strong>{a.destinatario_nome || 'A pessoa'}</strong> respondeu sua ajuda{a.tarefa_titulo ? ` · ${a.tarefa_titulo}` : ''}</span>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => abrirPainelAjudaDaMinhaSolicitacao(a)}>Ver resposta</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── ABAS PRINCIPAIS ───────────────────────────────── */}
      <section className="task-smart-tabs" aria-label="Tipo de lista">
        {([
          { id: 'pessoais',    label: 'Minhas',   count: pessoalCount,      hint: 'Pessoais' },
          { id: 'equipe',      label: 'Equipe',   count: equipeCount,       hint: 'Time' },
          { id: 'disponiveis', label: 'Livres',   count: disponiveisCount,  hint: 'Assumir' },
          { id: 'ranking',     label: 'Ranking',  count: Array.isArray(ranking?.ranking) ? ranking!.ranking.length : 0, hint: 'Pontos' },
          { id: 'todas',       label: 'Todas',    count: tarefasVisiveis.length, hint: 'Geral' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            className={escopo === tab.id ? 'task-smart-tab active' : 'task-smart-tab'}
            onClick={() => setEscopo(tab.id as typeof escopo)}
          >
            <span className="task-smart-tab-main">
              <strong>{tab.label}</strong>
              <em>{tab.count}</em>
            </span>
            <span className="task-smart-tab-hint">{tab.hint}</span>
          </button>
        ))}
      </section>

      {/* ── ABAS DE STATUS ────────────────────────────────── */}
      {escopo !== 'ranking' && (
        <section className="task-flow-tabs" aria-label="Filtrar por status">
          {([
            { id: 'todos',      label: 'Tudo',        count: quickCounts.todos },
            { id: 'pendentes',  label: 'Pendentes',   count: quickCounts.pendentes },
            { id: 'execucao',   label: 'Em execução', count: quickCounts.execucao },
            { id: 'concluidas', label: 'Concluídas',  count: quickCounts.concluidas },
            { id: 'atrasadas',  label: '⚠ Atrasadas', count: quickCounts.atrasadas },
          ] as const).map(tab => (
            <button
              key={tab.id}
              type="button"
              className={statusTab === tab.id ? 'task-flow-tab active' : 'task-flow-tab'}
              onClick={() => { setStatusTab(tab.id as typeof statusTab); setStatus('todos') }}
            >
              <strong>{tab.label}</strong>
              <span className={tab.id === 'atrasadas' && tab.count > 0 ? 'tab-count danger' : 'tab-count'}>{tab.count}</span>
            </button>
          ))}
        </section>
      )}

      {/* ── BUSCA + FILTROS ───────────────────────────────── */}
      {escopo !== 'ranking' && (
        <div className="tarefas-search-row">
          <div className="tarefas-search-wrap">
            <Search size={15} className="tarefas-search-icon" />
            <input
              className="form-input tarefas-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar lista, tarefa, membro..."
            />
            {search && (
              <button className="tarefas-search-clear" type="button" onClick={() => setSearch('')}><X size={14} /></button>
            )}
          </div>
          {isGestor && (
            <FilterPanel
              membroFiltro={membroFiltro} setMembroFiltro={setMembroFiltro}
              mesFiltro={mesFiltro} setMesFiltro={setMesFiltro}
              anoFiltro={anoFiltro} setAnoFiltro={setAnoFiltro}
              prioridade={prioridade} setPrioridade={setPrioridade}
              membroOptions={membroOptions}
              anoOptions={anoOptions}
              onLimpar={limparFiltros}
              activeCount={[membroFiltro, mesFiltro, anoFiltro, prioridade].filter(v => v !== 'todos').length}
            />
          )}
        </div>
      )}

      {/* ── LISTA / RANKING / VAZIO ───────────────────────── */}
      {loading ? (
        <div className="tarefas-loading"><Loader size={26} className="spin-icon" /></div>
      ) : escopo === 'ranking' ? (
        <RankingEquipe ranking={ranking} onChangePeriodo={p => { setPeriodoRanking(p); localStorage.setItem('nexus:ranking-periodo', p); loadRanking(p) }} />
      ) : filtered.length === 0 ? (
        <div className="tarefas-empty">
          <div className="tarefas-empty-icon">📋</div>
          <strong>Nenhuma lista encontrada</strong>
          <span>
            {search ? `Nenhum resultado para "${search}".` :
              statusTab === 'atrasadas' ? 'Ótimo! Nenhuma lista atrasada.' :
              statusTab === 'pendentes' ? 'Nenhuma lista pendente.' :
              escopo === 'disponiveis' ? 'Nenhuma lista livre disponível no momento.' :
              'Nenhuma lista encontrada com os filtros atuais.'}
          </span>
          {(search || membroFiltro !== 'todos' || mesFiltro !== 'todos' || anoFiltro !== 'todos' || prioridade !== 'todos' || statusTab !== 'todos') && (
            <button className="btn btn-ghost" type="button" onClick={limparFiltros}>Limpar filtros</button>
          )}
        </div>
      ) : (
        <div className="task-report-list">
          {filtered.map(t => (
            <TarefaCard
              key={t.id} tarefa={t} userId={user?.id || ''} isGestor={!!isGestor} actionBusy={actionTaskId === t.id}
              helpPendingForMe={ajudaPendenteMinhaPorTarefa.has(t.id)}
              helpRequestedByMe={minhasAjudasPorTarefa.get(t.id) || null}
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
              onPedirAjuda={setAjuda}
              onPainelAjuda={setPainelAjuda}
            />
          ))}
        </div>
      )}
      {/* ── MODAIS ────────────────────────────────────────── */}
      {modalOpen && <TarefaModal tarefa={edit} membros={membros} onClose={() => { setModalOpen(false); setEdit(null) }} onSaved={(t) => { updateSaved(t); setModalOpen(false); setEdit(null) }} />}
      {responder && <RespostaModal tarefa={responder} onClose={() => setResponder(null)} onSaved={(t) => { updateSaved(t); setResponder(null) }} />}
      {historico && <HistoricoModal tarefa={historico} onClose={() => setHistorico(null)} />}
      {detalhe && <TarefaDetalheModal tarefa={detalhe} membros={membros} isGestor={isGestor} userId={user?.id || ''} allTasks={tarefas} onClose={() => { setDetalhe(null); if (new URLSearchParams(location.search).get('task')) navigate('/tarefas', { replace: true }) }} onSaved={updateSaved} onAnexos={setAnexos} onResponder={setDetalhe} onApprove={approve} onReturn={devolver} onComplemento={setComplemento} onReminder={enviarLembreteManual} onPedirAjuda={setAjuda} onPainelAjuda={setPainelAjuda} />}
      {complemento && <ComplementoModal tarefa={complemento} membros={membros} onClose={() => setComplemento(null)} onSaved={(t) => { updateSaved(t); setComplemento(null); setDetalhe(prev => prev?.id === t.id ? t : prev) }} />}
      {ajuda && <PedirAjudaModal tarefa={ajuda} membros={membros} userId={user?.id || ''} onClose={() => setAjuda(null)} onSent={atualizarAjudas} />}
      {painelAjuda && <PainelAjudaModal tarefa={painelAjuda} userId={user?.id || ''} isGestor={!!isGestor} onClose={() => setPainelAjuda(null)} onChanged={atualizarAjudas} />}
      {devolverTarget && <DevolverModal tarefa={devolverTarget} onClose={() => setDevolverTarget(null)} onSaved={(t) => { updateSaved(t); setDevolverTarget(null); setDetalhe(prev => prev?.id === t.id ? t : prev) }} />}
      {lembreteTarget && <LembreteModal tarefa={lembreteTarget} membros={membros} onClose={() => setLembreteTarget(null)} />}
      {anexos && <AnexosModal tarefa={anexos} onClose={() => setAnexos(null)} onChanged={load} />}
    </div>
  )
}
