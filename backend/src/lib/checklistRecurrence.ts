export type ChecklistRecurrence = 'unica' | 'diaria' | 'semanal' | 'mensal'

export function normalizeChecklistRecurrence(value: unknown): ChecklistRecurrence {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'diaria' || normalized === 'diario') return 'diaria'
  if (normalized === 'semanal') return 'semanal'
  if (normalized === 'mensal') return 'mensal'
  return 'unica'
}

export function normalizeRecurrenceWeekday(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : undefined
}

export function normalizeRecurrenceMonthday(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : undefined
}

function parseDateOnly(value: unknown): Date | null {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(result.getTime()) ? null : result
}

/**
 * Decide se um item recorrente deve ser lembrado no dia informado. A função
 * nunca cria outra tarefa: recorrência é somente cadência de lembrete do mesmo
 * item. A data do item funciona como início da cadência, não como gerador de
 * cópias.
 */
export function checklistReminderIsDue(
  item: {
    recorrencia?: unknown
    recorrencia_dia_semana?: unknown
    recorrencia_dia_mes?: unknown
    data?: unknown
    criado_em?: unknown
  },
  today = new Date(),
): boolean {
  const recurrence = normalizeChecklistRecurrence(item.recorrencia)
  if (recurrence === 'unica') return false

  const start = parseDateOnly(item.data) || parseDateOnly(item.criado_em)
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (start && start.getTime() > current.getTime()) return false
  if (recurrence === 'diaria') return true

  if (recurrence === 'semanal') {
    const target = normalizeRecurrenceWeekday(item.recorrencia_dia_semana)
      ?? start?.getDay()
      ?? current.getDay()
    return current.getDay() === target
  }

  const requestedDay = normalizeRecurrenceMonthday(item.recorrencia_dia_mes)
    ?? start?.getDate()
    ?? current.getDate()
  const lastDayOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
  return current.getDate() === Math.min(requestedDay, lastDayOfMonth)
}
