import { supabase, type Pessoa, type Tarefa, type Evento, type Pagamento, type Documento } from './supabase'

// ── LOCAL STORAGE KEYS ────────────────────────────────────
const KEYS = {
  config: 'nx_cfg',
  pessoas: 'nx_pes',
  tarefas: 'nx_tar',
  agenda: 'nx_age',
  pagamentos: 'nx_pag',
  documentos: 'nx_doc',
  notifs: 'nx_not',
}

export interface AppConfig {
  nome: string
  sbUrl?: string
  sbKey?: string
  userId?: string
  pushEnabled?: boolean
  theme?: 'dark' | 'light'
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    console.warn('localStorage save failed for', key)
  }
}

// ── STORE ─────────────────────────────────────────────────
export const store = {
  config: load<AppConfig>(KEYS.config, { nome: '' }),
  pessoas: load<Pessoa[]>(KEYS.pessoas, []),
  tarefas: load<Tarefa[]>(KEYS.tarefas, []),
  agenda: load<Evento[]>(KEYS.agenda, []),
  pagamentos: load<Pagamento[]>(KEYS.pagamentos, []),
  documentos: load<Documento[]>(KEYS.documentos, []),
}

export function saveStore(key: keyof typeof KEYS, data: unknown) {
  save(KEYS[key], data)
}

export function isConfigured(): boolean {
  return !!store.config.nome
}

export function isSupabaseConfigured(): boolean {
  return !!(store.config.sbUrl && store.config.sbKey)
}

// ── SUPABASE SYNC ─────────────────────────────────────────
export async function syncFromSupabase() {
  if (!isSupabaseConfigured()) return
  try {
    const uid = store.config.userId || 'local'
    const [p, t, a, pg, d] = await Promise.all([
      supabase.from('pessoas').select('*').eq('user_id', uid),
      supabase.from('tarefas').select('*').eq('user_id', uid),
      supabase.from('agenda').select('*').eq('user_id', uid),
      supabase.from('pagamentos').select('*').eq('user_id', uid),
      supabase.from('documentos').select('*').eq('user_id', uid),
    ])
    if (p.data) { store.pessoas = p.data as Pessoa[]; save(KEYS.pessoas, p.data) }
    if (t.data) { store.tarefas = t.data as Tarefa[]; save(KEYS.tarefas, t.data) }
    if (a.data) { store.agenda = a.data as Evento[]; save(KEYS.agenda, a.data) }
    if (pg.data) { store.pagamentos = pg.data as Pagamento[]; save(KEYS.pagamentos, pg.data) }
    if (d.data) { store.documentos = d.data as Documento[]; save(KEYS.documentos, d.data) }
  } catch (e) {
    console.warn('Supabase sync failed:', e)
  }
}

export async function pushToSupabase(table: string, data: Record<string, unknown>) {
  if (!isSupabaseConfigured()) return
  try {
    await supabase.from(table).upsert(data)
  } catch (e) {
    console.warn('Supabase push failed:', e)
  }
}

export async function deleteFromSupabase(table: string, id: string) {
  if (!isSupabaseConfigured()) return
  try {
    await supabase.from(table).delete().eq('id', id)
  } catch (e) {
    console.warn('Supabase delete failed:', e)
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────
export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function scheduleNotification(title: string, body: string, delayMs: number) {
  if (Notification.permission !== 'granted') return
  setTimeout(() => {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `nexus-${Date.now()}`,
    })
  }, delayMs)
}

export function checkUpcomingReminders() {
  const now = new Date()
  const in30min = new Date(now.getTime() + 30 * 60 * 1000)

  // Tarefas com prazo próximo
  store.tarefas.forEach(t => {
    if (t.status === 'concluida' || t.status === 'cancelada' || !t.prazo) return
    const prazo = new Date(t.prazo)
    if (prazo > now && prazo <= in30min) {
      scheduleNotification(
        '⏰ Tarefa com prazo próximo',
        `"${t.titulo}" vence em breve!`,
        1000
      )
    }
  })

  // Agenda do dia
  const hoje = now.toISOString().slice(0, 10)
  store.agenda.forEach(e => {
    if (!e.data_inicio.startsWith(hoje)) return
    const inicio = new Date(e.data_inicio)
    const diffMs = inicio.getTime() - now.getTime()
    const lembreteMs = (e.lembrete_minutos ?? 15) * 60 * 1000
    if (diffMs > 0 && diffMs <= lembreteMs) {
      scheduleNotification(
        '📅 Compromisso em breve',
        `"${e.titulo}" começa em ${Math.round(diffMs / 60000)} minutos`,
        1000
      )
    }
  })

  // Pagamentos vencidos
  store.pagamentos.forEach(p => {
    if (p.status === 'pago' || p.status === 'cancelado' || !p.vencimento) return
    const venc = new Date(p.vencimento + 'T12:00')
    if (venc < now && p.status === 'pendente') {
      scheduleNotification(
        '💸 Pagamento vencido',
        `"${p.descricao}" — R$ ${Number(p.valor).toFixed(2)}`,
        2000
      )
    }
  })
}
