export type NaturalDateSuggestion = {
  isoDate: string
  phrase: string
}

function isoFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(12, 0, 0, 0)
  return result
}

function nextWeekday(date: Date, weekday: number) {
  const result = startOfDay(date)
  const delta = (weekday - result.getDay() + 7) % 7 || 7
  result.setDate(result.getDate() + delta)
  return result
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  terça: 2,
  'terca-feira': 2,
  'terça-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
  sábado: 6,
}

function dateFromDayMonth(day: number, month: number, year: number | undefined, now: Date) {
  const targetYear = year ?? now.getFullYear()
  const result = new Date(targetYear, month - 1, day, 12)
  if (result.getFullYear() !== targetYear || result.getMonth() !== month - 1 || result.getDate() !== day) return null
  if (year === undefined && result < startOfDay(now)) result.setFullYear(now.getFullYear() + 1)
  return result
}

export function parseNaturalDate(text: string, now = new Date()): NaturalDateSuggestion | null {
  const normalized = String(text || '').trim().toLocaleLowerCase('pt-BR')
  if (!normalized) return null

  const explicit = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/)
  if (explicit) {
    const day = Number(explicit[1])
    const month = Number(explicit[2])
    const rawYear = explicit[3]
    const year = rawYear ? (rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)) : undefined
    const date = dateFromDayMonth(day, month, year, now)
    if (date) return { isoDate: isoFromDate(date), phrase: explicit[0] }
  }

  const iso = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const date = dateFromDayMonth(Number(iso[3]), Number(iso[2]), Number(iso[1]), now)
    if (date) return { isoDate: isoFromDate(date), phrase: iso[0] }
  }

  const relativeDays = normalized.match(/\b(?:em|daqui a)\s+(\d{1,3})\s+dias?\b/)
  if (relativeDays) {
    const date = startOfDay(now)
    date.setDate(date.getDate() + Number(relativeDays[1]))
    return { isoDate: isoFromDate(date), phrase: relativeDays[0] }
  }

  const hasWord = (word: string) => new RegExp(`(?:^|[^\\p{L}])${word}(?=$|[^\\p{L}])`, 'iu').test(normalized)
  if (hasWord('hoje')) return { isoDate: isoFromDate(startOfDay(now)), phrase: 'hoje' }
  if (hasWord('amanhã') || hasWord('amanha')) return { isoDate: isoFromDate(new Date(startOfDay(now).setDate(now.getDate() + 1))), phrase: hasWord('amanhã') ? 'amanhã' : 'amanha' }

  const weekday = Object.entries(WEEKDAYS).sort((a, b) => b[0].length - a[0].length).find(([label]) => hasWord(label))
  if (weekday) {
    const date = nextWeekday(now, weekday[1])
    return { isoDate: isoFromDate(date), phrase: weekday[0] }
  }

  return null
}
