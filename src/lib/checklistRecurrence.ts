import type { ChecklistItem } from './api'

export type ChecklistRecurrence = 'unica' | 'diaria' | 'semanal' | 'mensal'

export const CHECKLIST_RECURRENCE_OPTIONS: Array<{ value: ChecklistRecurrence; label: string; short: string }> = [
  { value: 'unica', label: 'Uma vez', short: 'Única' },
  { value: 'diaria', label: 'Todos os dias', short: 'Diária' },
  { value: 'semanal', label: 'Toda semana', short: 'Semanal' },
  { value: 'mensal', label: 'Todo mês', short: 'Mensal' },
]

export function normalizeChecklistRecurrence(value: unknown): ChecklistRecurrence {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'diaria' || normalized === 'diario') return 'diaria'
  if (normalized === 'semanal') return 'semanal'
  if (normalized === 'mensal') return 'mensal'
  return 'unica'
}

export function checklistRecurrenceLabel(item: Pick<ChecklistItem, 'recorrencia' | 'recorrencia_dia_semana' | 'recorrencia_dia_mes'>): string {
  const recurrence = normalizeChecklistRecurrence(item.recorrencia)
  if (recurrence === 'diaria') return 'Diária'
  if (recurrence === 'semanal') {
    const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
    return `Semanal · ${days[Number(item.recorrencia_dia_semana ?? 0)] || 'dia definido'}`
  }
  if (recurrence === 'mensal') return `Mensal · dia ${Number(item.recorrencia_dia_mes || 1)}`
  return 'Única'
}

function dateOnly(value?: string): Date | null {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function checklistReminderIsDue(item: ChecklistItem, todayKey: string): boolean {
  const recurrence = normalizeChecklistRecurrence(item.recorrencia)
  if (recurrence === 'unica') return false
  const today = dateOnly(todayKey)
  if (!today) return false
  const start = dateOnly(item.data) || dateOnly(item.criado_em)
  if (start && start.getTime() > today.getTime()) return false
  if (recurrence === 'diaria') return true
  if (recurrence === 'semanal') return today.getDay() === Number(item.recorrencia_dia_semana ?? start?.getDay() ?? today.getDay())
  const requested = Number(item.recorrencia_dia_mes ?? start?.getDate() ?? today.getDate())
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return today.getDate() === Math.min(Math.max(1, Math.min(31, requested)), last)
}

export function hasRecurringChecklistItem(items?: ChecklistItem[]): boolean {
  return (items || []).some(item => normalizeChecklistRecurrence(item.recorrencia) !== 'unica')
}
