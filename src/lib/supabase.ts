import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── SINGLETON DINÂMICO ────────────────────────────────────────────────────────
// O cliente NÃO é criado na inicialização do módulo.
// Ele é criado sob demanda via getSupabase(), usando as credenciais salvas no
// localStorage pelo usuário. Assim, configurar a URL/chave na tela de Setup ou
// Configurações funciona sem precisar recarregar a página.

let _client: SupabaseClient | null = null
let _currentUrl = ''
let _currentKey = ''

export function getSupabase(): SupabaseClient | null {
  try {
    const raw = localStorage.getItem('nx_cfg')
    if (!raw) return null
    const cfg = JSON.parse(raw)
    const url: string = cfg.sbUrl ?? ''
    const key: string = cfg.sbKey ?? ''
    if (!url || !key) return null

    // Recria o cliente se as credenciais mudaram
    if (!_client || url !== _currentUrl || key !== _currentKey) {
      _client = createClient(url, key)
      _currentUrl = url
      _currentKey = key
    }

    return _client
  } catch {
    return null
  }
}

/** Chame após salvar novas credenciais para forçar reconexão */
export function resetSupabaseClient(): void {
  _client = null
  _currentUrl = ''
  _currentKey = ''
}

/** Retorna true se há credenciais salvas */
export function isSupabaseReady(): boolean {
  return getSupabase() !== null
}

// ── TIPOS ─────────────────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      pessoas: {
        Row: Pessoa
        Insert: Omit<Pessoa, 'id' | 'created_at'>
        Update: Partial<Omit<Pessoa, 'id' | 'created_at'>>
      }
      tarefas: {
        Row: Tarefa
        Insert: Omit<Tarefa, 'id' | 'created_at'>
        Update: Partial<Omit<Tarefa, 'id' | 'created_at'>>
      }
      agenda: {
        Row: Evento
        Insert: Omit<Evento, 'id' | 'created_at'>
        Update: Partial<Omit<Evento, 'id' | 'created_at'>>
      }
      pagamentos: {
        Row: Pagamento
        Insert: Omit<Pagamento, 'id' | 'created_at'>
        Update: Partial<Omit<Pagamento, 'id' | 'created_at'>>
      }
      documentos: {
        Row: Documento
        Insert: Omit<Documento, 'id' | 'created_at'>
        Update: Partial<Omit<Documento, 'id' | 'created_at'>>
      }
    }
  }
}

export interface Pessoa {
  id: string
  user_id: string
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

export interface ChecklistItem {
  id: string
  texto: string
  feito: boolean
}

export interface Tarefa {
  id: string
  user_id: string
  titulo: string
  descricao?: string
  data?: string
  prazo?: string
  prioridade: 'baixa' | 'media' | 'alta'
  status: 'pendente' | 'em_progresso' | 'concluida' | 'cancelada'
  responsavel_id?: string
  responsavel_nome?: string
  checklist?: ChecklistItem[]
  obs?: string
  created_at: string
}

export interface Evento {
  id: string
  user_id: string
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
  user_id: string
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
  user_id: string
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
