import { getSupabase, isSupabaseConfigured, type Pessoa, type Tarefa, type Evento, type Pagamento, type Documento, type UserProfile } from './supabase'

// ── ESTADO GLOBAL ─────────────────────────────────────────────────────────────
// O store mantém os dados em memória para renderização rápida.
// A fonte de verdade é sempre o Supabase.

export interface AppState {
  user: UserProfile | null
  pessoas: Pessoa[]
  tarefas: Tarefa[]
  agenda: Evento[]
  pagamentos: Pagamento[]
  documentos: Documento[]
}

export const store: AppState = {
  user: null,
  pessoas: [],
  tarefas: [],
  agenda: [],
  pagamentos: [],
  documentos: [],
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

export function isGestor(): boolean {
  return ['admin','dev','gestor'].includes(store.user?.role || '')
}

export function getCurrentOrgId(): string | null {
  return store.user?.org_id ?? null
}

export function getCurrentUserId(): string | null {
  return store.user?.id ?? null
}

// ── PERFIL DO USUÁRIO ─────────────────────────────────────────────────────────

export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error || !data) return null
    store.user = data as UserProfile
    return data as UserProfile
  } catch {
    return null
  }
}

// ── SINCRONIZAÇÃO DO SUPABASE ─────────────────────────────────────────────────

export async function syncFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const orgId = getCurrentOrgId()
  if (!orgId) return

  const sb = getSupabase()
  const userId = getCurrentUserId()
  const gestor = isGestor()

  try {
    const [p, a, pg, d] = await Promise.all([
      sb.from('pessoas').select('*').eq('org_id', orgId),
      sb.from('agenda').select('*').eq('org_id', orgId),
      sb.from('pagamentos').select('*').eq('org_id', orgId),
      sb.from('documentos').select('*').eq('org_id', orgId),
    ])

    // Tarefas: gestor vê todas, membro vê apenas as suas
    const tarefasQuery = gestor
      ? sb.from('tarefas').select('*').eq('org_id', orgId)
      : sb.from('tarefas').select('*').eq('org_id', orgId).eq('responsavel_id', userId)

    const t = await tarefasQuery

    if (p.data)  store.pessoas    = p.data as Pessoa[]
    if (t.data)  store.tarefas    = t.data as Tarefa[]
    if (a.data)  store.agenda     = a.data as Evento[]
    if (pg.data) store.pagamentos = pg.data as Pagamento[]
    if (d.data)  store.documentos = d.data as Documento[]
  } catch (e) {
    console.warn('Supabase sync failed:', e)
    throw e
  }
}

// ── OPERAÇÕES CRUD ────────────────────────────────────────────────────────────

export async function upsertRecord<T extends Record<string, unknown>>(
  table: string,
  data: T
): Promise<T | null> {
  try {
    const { data: result, error } = await getSupabase()
      .from(table)
      .upsert(data)
      .select()
      .single()
    if (error) throw error
    return result as T
  } catch (e) {
    console.warn(`Supabase upsert failed on ${table}:`, e)
    throw e
  }
}

export async function deleteRecord(table: string, id: string): Promise<void> {
  try {
    const { error } = await getSupabase().from(table).delete().eq('id', id)
    if (error) throw error
  } catch (e) {
    console.warn(`Supabase delete failed on ${table}:`, e)
    throw e
  }
}

// ── NOTIFICAÇÕES PUSH ─────────────────────────────────────────────────────────

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

  store.tarefas.forEach(t => {
    if (t.status === 'concluida' || t.status === 'cancelada' || !t.prazo) return
    const prazo = new Date(t.prazo)
    if (prazo > now && prazo <= in30min) {
      scheduleNotification('⏰ Tarefa com prazo próximo', `"${t.titulo}" vence em breve!`, 1000)
    }
  })

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
