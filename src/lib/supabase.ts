import { createClient, SupabaseClient, User } from '@supabase/supabase-js'

// ── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────
// As credenciais são lidas das variáveis de ambiente (VITE_SUPABASE_URL e
// VITE_SUPABASE_ANON_KEY) definidas no .env e embutidas no build pelo Vite.
// O usuário final não precisa fornecer essas credenciais — ele apenas faz login.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ── SINGLETON ─────────────────────────────────────────────────────────────────
let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas. ' +
        'Crie o arquivo .env com as credenciais do seu projeto Supabase.'
      )
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return _client
}

/** Retorna true se as variáveis de ambiente estão configuradas */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY)
}

/** Retorna o usuário atual da sessão ativa (ou null) */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data } = await getSupabase().auth.getUser()
    return data.user
  } catch {
    return null
  }
}

// ── TIPOS ─────────────────────────────────────────────────────────────────────

export type UserRole = 'gestor' | 'membro'

export interface UserProfile {
  id: string           // auth.users.id
  nome: string
  email: string
  role: UserRole
  org_id: string       // ID da organização (empresa/equipe)
  avatar_url?: string
  created_at: string
}

export interface ChecklistItem {
  id: string
  texto: string
  feito: boolean
}

export interface Tarefa {
  id: string
  org_id: string
  criado_por: string        // user_id do gestor que criou
  responsavel_id?: string   // user_id do membro responsável
  responsavel_nome?: string
  titulo: string
  descricao?: string
  data?: string
  prazo?: string
  prioridade: 'baixa' | 'media' | 'alta'
  status: 'pendente' | 'em_progresso' | 'concluida' | 'cancelada'
  checklist?: ChecklistItem[]
  obs?: string
  created_at: string
  updated_at?: string
}

export interface Pessoa {
  id: string
  org_id: string
  user_id?: string          // Se a pessoa tiver conta no sistema
  nome: string
  tipo: 'funcionario' | 'prestador' | 'credor' | 'devedor' | 'cliente'
  cargo?: string
  contato?: string
  email?: string
  valor?: number
  obs?: string
  avatar_url?: string
  created_at: string
}

export interface Evento {
  id: string
  org_id: string
  criado_por: string
  titulo: string
  descricao?: string
  data_inicio: string
  data_fim?: string
  local?: string
  tipo: 'reuniao' | 'compromisso' | 'prazo' | 'outro'
  participantes?: { id: string; nome: string }[]
  lembrete_minutos?: number
  lembrete_enviado?: boolean
  cor?: string
  created_at: string
}

export interface Pagamento {
  id: string
  org_id: string
  criado_por: string
  descricao: string
  valor: number
  tipo: 'pagamento' | 'recebimento'
  vencimento?: string
  pago_dia?: string
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado'
  categoria?: string
  pessoa_id?: string
  pessoa_nome?: string
  obs?: string
  comprovante_url?: string
  comprovante_key?: string
  created_at: string
}

export interface Documento {
  id: string
  org_id: string
  criado_por: string
  titulo: string
  descricao?: string
  tipo: 'comprovante' | 'contrato' | 'nota_fiscal' | 'outro'
  arquivo_url: string
  arquivo_key: string
  mime_type?: string
  tamanho?: number
  pessoa_id?: string
  pessoa_nome?: string
  pagamento_id?: string
  created_at: string
}

export interface Notificacao {
  id: string
  tipo: 'tarefa' | 'agenda' | 'pagamento' | 'sistema'
  titulo: string
  mensagem: string
  lida: boolean
  created_at: string
}

// ── HELPERS DE AUTENTICAÇÃO ───────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string, nome: string, orgId?: string) {
  const sb = getSupabase()
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { nome, org_id: orgId || null },
    },
  })
  return { data, error }
}

export async function signOut() {
  return getSupabase().auth.signOut()
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  return getSupabase().auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
}
