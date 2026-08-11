import type { MembroEquipe, Tarefa } from './api'
import { daysBetweenIso, isoLocalDate, isTaskFinal, taskDueDate } from './taskFocus'

export type CapacityLevel = 'disponivel' | 'equilibrada' | 'elevada' | 'critica'

export type MemberCapacity = {
  member: MembroEquipe
  active: number
  overdue: number
  highPriority: number
  returned: number
  score: number
  level: CapacityLevel
}

export function taskExecutorIds(task: Tarefa) {
  const ids = new Set<string>()
  if (task.responsavel_id) ids.add(task.responsavel_id)
  if (task.aceita_por) ids.add(task.aceita_por)
  for (const item of task.checklist || []) {
    const id = item.responsavel_id || item.assumido_por || item.executor_id || item.aceita_por
    if (id) ids.add(id)
  }
  return ids
}

export function isOverdueTask(task: Tarefa, today = isoLocalDate()) {
  if (isTaskFinal(task) || task.status === 'concluida') return false
  const due = taskDueDate(task)
  return !!due && (daysBetweenIso(today, due) ?? 0) < 0
}

export function capacityLevel(score: number): CapacityLevel {
  if (score <= 3) return 'disponivel'
  if (score <= 7) return 'equilibrada'
  if (score <= 12) return 'elevada'
  return 'critica'
}

export function buildMemberCapacity(tasks: Tarefa[], members: MembroEquipe[], today = isoLocalDate()) {
  return members
    .filter(member => member.ativo !== false && member.role === 'membro')
    .map(member => {
      const owned = tasks.filter(task => !isTaskFinal(task) && task.status !== 'concluida' && taskExecutorIds(task).has(member.id))
      const overdue = owned.filter(task => isOverdueTask(task, today)).length
      const highPriority = owned.filter(task => task.prioridade === 'alta').length
      const returned = owned.filter(task => task.status === 'devolvida').length
      const score = owned.length + overdue * 2 + highPriority + returned * 2
      return { member, active: owned.length, overdue, highPriority, returned, score, level: capacityLevel(score) }
    })
    .sort((a, b) => b.score - a.score || a.member.nome.localeCompare(b.member.nome, 'pt-BR'))
}

export function managementSummary(tasks: Tarefa[], today = isoLocalDate()) {
  const active = tasks.filter(task => !isTaskFinal(task))
  return {
    active: active.length,
    approvals: active.filter(task => task.status === 'concluida').length,
    overdue: active.filter(task => isOverdueTask(task, today)).length,
    returned: active.filter(task => task.status === 'devolvida').length,
    highRisk: active.filter(task => task.status !== 'concluida' && task.prioridade === 'alta' && (isOverdueTask(task, today) || (taskDueDate(task) ? (daysBetweenIso(today, taskDueDate(task)!) ?? 99) <= 3 : false))).length,
  }
}

