export function nanoid(size = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const arr = new Uint8Array(size)
  crypto.getRandomValues(arr)
  arr.forEach(n => (result += chars[n % chars.length]))
  return result
}

export function fmtCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtDate(d: string): string {
  return new Date(d + (d.length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateShort(d: string): string {
  return new Date(d + (d.length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Retorna a data civil local em YYYY-MM-DD, sem conversão para UTC. */
export function localTodayIso(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isOverdue(dateStr: string): boolean {
  return new Date(dateStr + 'T23:59') < new Date()
}
