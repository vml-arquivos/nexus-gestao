export const SCORE_MAX = 20

export function parseChecklist(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      if (Array.isArray(parsed?.items)) return parsed.items
      if (Array.isArray(parsed?.checklist)) return parsed.checklist
    } catch {
      return []
    }
  }
  if (value && typeof value === 'object') {
    const parsed = value as any
    if (Array.isArray(parsed.items)) return parsed.items
    if (Array.isArray(parsed.checklist)) return parsed.checklist
  }
  return []
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function assignmentId(item: any): string | null {
  for (const value of [item?.responsavel_id, item?.assumido_por, item?.executor_id, item?.aceita_por]) {
    if (isUuid(value)) return value
  }
  return null
}

export function itemExecutorId(item: any, task: any): string | null {
  const candidates = item?.feito
    ? [item?.concluido_por, item?.feito_por, assignmentId(item), task?.aceita_por, task?.responsavel_id]
    : [assignmentId(item), item?.concluido_por, item?.feito_por, task?.aceita_por, task?.responsavel_id]
  for (const value of candidates) if (isUuid(value)) return value
  return null
}

export function executorIds(task: any): Set<string> {
  const ids = new Set<string>()
  const items = parseChecklist(task?.checklist)
  if (items.length) {
    for (const item of items) {
      const id = itemExecutorId(item, task)
      if (id) ids.add(id)
    }
  } else {
    const id = task?.aceita_por || task?.responsavel_id
    if (isUuid(id)) ids.add(id)
  }
  return ids
}

export function isMultiExecutor(task: any): boolean {
  return executorIds(task).size > 1
}

export function officialScore(value: unknown, fallback = 3): number {
  const raw = Number(value)
  const score = Number.isFinite(raw) ? raw : fallback
  if (score <= 0) return 0
  if (score <= 1) return 1
  if (score <= 3) return 3
  if (score <= 5) return 5
  return 20
}

export function difficultyScore(value: unknown): number {
  const raw = String(value || '').trim().toLowerCase()
  if (['nivel_1', 'iniciante'].includes(raw)) return 0
  if (['nivel_2', 'facil'].includes(raw)) return 1
  if (['nivel_3', 'medio'].includes(raw)) return 3
  if (['nivel_4', 'dificil'].includes(raw)) return 5
  if (['nivel_5', 'hard'].includes(raw)) return 20
  return 3
}

export function itemPoints(item: any): number {
  const fallback = difficultyScore(item?.dificuldade)
  return Math.max(0, Math.min(SCORE_MAX, officialScore(item?.pontuacao, fallback)))
}

export function taskPoints(task: any): number {
  return Math.max(0, Math.min(SCORE_MAX, officialScore(task?.pontuacao, 3)))
}

export function periodMonth(value: unknown = new Date()): string {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 7) : date.toISOString().slice(0, 7)
}

export function periodRange(raw: string) {
  const now = new Date()
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  if (raw === 'semana') {
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const day = start.getUTCDay() || 7
    start.setUTCDate(start.getUTCDate() - day + 1)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)
    return { label: 'semana', start: iso(start), end: iso(end) }
  }
  if (raw === 'mes') {
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    return { label: 'mes', start: iso(start), end: iso(end) }
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const start = new Date(`${raw}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
    return { label: raw, start: iso(start), end: iso(end) }
  }
  return { label: 'todos', start: null as string | null, end: null as string | null }
}

export function inPeriod(value: unknown, range: ReturnType<typeof periodRange>): boolean {
  if (range.label === 'todos') return true
  const date = String(value || '').slice(0, 10)
  return Boolean(date && range.start && range.end && date >= range.start && date < range.end)
}
