import type { Tarefa, UserProfile } from './api'

export type FocusReason = 'devolvida' | 'atrasada' | 'hoje' | 'em_progresso' | 'alta' | 'proxima' | 'revisao'

export type FocusTask = {
  task: Tarefa
  score: number
  reason: FocusReason
  daysUntilDue: number | null
}

const FINAL_STATUSES = new Set(['aprovada', 'cancelada'])
const MANAGER_ROLES = new Set(['admin', 'dev', 'gestor', 'sub_gestor'])

export function isoLocalDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function taskDueDate(task: Tarefa) {
  return String(task.prazo || task.data || '').slice(0, 10) || null
}

export function daysBetweenIso(from: string, to: string) {
  const fromParts = from.split('-').map(Number)
  const toParts = to.split('-').map(Number)
  if (fromParts.length !== 3 || toParts.length !== 3 || fromParts.some(Number.isNaN) || toParts.some(Number.isNaN)) return null
  const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2])
  const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2])
  return Math.round((toUtc - fromUtc) / 86_400_000)
}

export function isTaskFinal(task: Tarefa) {
  return FINAL_STATUSES.has(String(task.status || ''))
}

export function isTaskAssignedToUser(task: Tarefa, userId?: string) {
  if (!userId) return false
  if (task.responsavel_id === userId || task.aceita_por === userId) return true
  return (task.checklist || []).some(item => {
    const assigned = item.responsavel_id || item.assumido_por || item.executor_id || item.aceita_por
    return assigned === userId
  })
}

export function isPersonalTaskForUser(task: Tarefa, userId?: string) {
  if (!userId) return false
  const personal = task.escopo === 'pessoal' || task.contexto_tipo === 'pessoal'
  return personal && (task.responsavel_id === userId || task.criado_por === userId)
}

export function isManagerUser(user?: UserProfile | null) {
  return !!user && MANAGER_ROLES.has(user.role)
}

export function userCanActOnTask(task: Tarefa, user?: UserProfile | null) {
  if (!user || isTaskFinal(task)) return false
  if (isPersonalTaskForUser(task, user.id)) return true
  if (task.status === 'concluida') return isManagerUser(user)
  if (isManagerUser(user)) return false
  return isTaskAssignedToUser(task, user.id)
}

export function focusReason(task: Tarefa, today = isoLocalDate()): { reason: FocusReason; score: number; daysUntilDue: number | null } {
  const due = taskDueDate(task)
  const daysUntilDue = due ? daysBetweenIso(today, due) : null
  if (task.status === 'devolvida') return { reason: 'devolvida', score: 1000, daysUntilDue }
  if (task.status === 'concluida') return { reason: 'revisao', score: 950, daysUntilDue }
  if (daysUntilDue !== null && daysUntilDue < 0) return { reason: 'atrasada', score: 900 + Math.min(Math.abs(daysUntilDue), 30), daysUntilDue }
  if (daysUntilDue === 0) return { reason: 'hoje', score: 800, daysUntilDue }
  if (task.status === 'em_progresso' || task.status === 'reenviada') return { reason: 'em_progresso', score: 700, daysUntilDue }
  if (task.prioridade === 'alta') return { reason: 'alta', score: 600, daysUntilDue }
  return { reason: 'proxima', score: 400 - Math.min(Math.max(daysUntilDue ?? 30, 0), 30), daysUntilDue }
}

export function buildFocusTasks(tasks: Tarefa[], user?: UserProfile | null, today = isoLocalDate()) {
  return tasks
    .filter(task => userCanActOnTask(task, user))
    .map(task => ({ task, ...focusReason(task, today) }))
    .sort((a, b) => b.score - a.score || String(a.task.titulo).localeCompare(String(b.task.titulo), 'pt-BR'))
}
