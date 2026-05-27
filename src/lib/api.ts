// ── CLIENTE DE API — Nexus Gestão ─────────────────────────────────────────────
// Conecta ao backend Express/PostgreSQL via REST.
// Gerencia automaticamente o token JWT e o refresh.

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

// ── STORAGE DE TOKENS ─────────────────────────────────────────────────────────
const TOKEN_KEY   = 'nx_access_token'
const REFRESH_KEY = 'nx_refresh_token'

export function getAccessToken(): string | null  { return localStorage.getItem(TOKEN_KEY) }
export function getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY) }

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// ── TIPOS ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string
  nome: string
  email: string
  role: 'gestor' | 'sub_gestor' | 'membro'
  cargo?: string
  orgId: string
  org_nome?: string
  avatar_url?: string
  criado_por?: string
  criado_por_nome?: string
  ativo?: boolean
}

export interface ChecklistItem { id: string; texto: string; feito: boolean }

export interface Tarefa {
  id: string
  org_id: string
  criado_por: string
  criado_por_nome?: string
  responsavel_id?: string
  responsavel_nome?: string
  responsavel_nome_perfil?: string
  responsavel_cargo?: string
  titulo: string
  descricao?: string
  data?: string
  prazo?: string
  prioridade: 'baixa' | 'media' | 'alta'
  status: 'pendente' | 'em_progresso' | 'concluida' | 'cancelada'
  checklist?: ChecklistItem[]
  obs?: string
  // Resposta de execução do responsável
  resposta_status?: 'concluida' | 'nao_concluida'
  resposta_obs?: string
  resposta_em?: string
  created_at: string
  updated_at?: string
}

export interface Pessoa {
  id: string
  org_id: string
  user_id?: string
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

export interface MembroEquipe {
  id: string
  nome: string
  email: string
  role: 'gestor' | 'sub_gestor' | 'membro'
  cargo?: string
  avatar_url?: string
  tarefas_pendentes: number
  tarefas_concluidas: number
  tarefas_nao_concluidas?: number
  tarefas_devolvidas?: number
  criado_por?: string
  criado_por_nome?: string
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
  cor?: string
  created_at: string
}

export interface Pagamento {
  id: string
  org_id: string
  criado_por: string
  titulo: string
  descricao?: string
  valor: number
  tipo: 'pagamento' | 'recebimento'
  vencimento?: string
  pago_em?: string
  status: 'pendente' | 'pago' | 'cancelado'
  categoria?: string
  pessoa_id?: string
  pessoa_nome?: string
  pessoa_nome_atual?: string
  obs?: string
  comprovante_url?: string
  /**
   * Recorrência deste lançamento. "nenhum" indica lançamento único.
   * Pode ser 'nenhum', 'semanal', 'quinzenal', 'mensal', 'anual'.
   */
  recorrencia?: string
  /**
   * Data final da recorrência (ISO YYYY-MM-DD). Opcional.
   */
  recorrencia_fim?: string
  /** Datas avulsas para gerar vários lançamentos na criação. */
  datas_personalizadas?: string[]
  /** UUID que agrupa parcelas de um mesmo financiamento/parcelamento */
  grupo_id?: string
  /** Total de parcelas do grupo */
  num_parcelas?: number
  /** Número desta parcela dentro do grupo */
  num_parcela?: number
  created_at: string
  updated_at?: string
}

/** Card consolidado de uma dívida ou crédito (agrupado por grupo_id ou avulso) */
export interface GrupoPagamento {
  grupo_id: string | null
  titulo: string
  tipo: 'pagamento' | 'recebimento'
  categoria: string | null
  pessoa_id: string | null
  pessoa_nome: string | null
  recorrencia: string
  parcelas: Pagamento[]
  valor_total: number
  valor_pago: number
  valor_pendente: number
  num_parcelas: number
  parcelas_pagas: number
  parcelas_pendentes: number
  proxima_parcela: string | null
  ultima_parcela: string | null
  vencido: boolean
  is_grupo: boolean
}

export interface ResumoPorPessoa {
  pessoa_id: string
  pessoa_nome: string
  devo: number
  me_devem: number
  devo_pendente: number
  me_devem_pendente: number
  devo_pago: number
  me_devem_pago: number
}

export interface ResumoFinanceiro {
  receita_paga: number
  receita_pendente: number
  despesa_paga: number
  despesa_pendente: number
  saldo: number
  vencidos_pagar: number
  vencidos_receber: number
}


export interface Equipe {
  id: string;
  org_id: string;
  nome: string;
  descricao?: string;
  criado_por?: string;
  created_at: string;
  members_count?: number;
}
export interface Documento {
  id: string
  org_id: string
  criado_por: string
  titulo: string
  descricao?: string
  tipo: 'comprovante' | 'contrato' | 'nota_fiscal' | 'recibo' | 'foto' | 'outro'
  arquivo_url: string
  mime_type?: string
  tamanho?: number
  pessoa_id?: string
  pessoa_nome?: string
  pessoa_nome_atual?: string
  pagamento_id?: string
  created_at: string
}

export interface HistoricoPessoa {
  pessoa: Pessoa
  documentos: Documento[]
  pagamentos: Pagamento[]
  tarefas: Tarefa[]
  resumo: {
    totalDevo: number
    totalMeDevem: number
    totalPago: number
    totalPendente: number
  }
}

// ── FETCH COM AUTH ────────────────────────────────────────────────────────────
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  // Não define Content-Type para FormData (o browser define automaticamente com boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearTokens()
      window.location.href = '/login'
      return res
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push(async (newToken: string) => {
          headers['Authorization'] = `Bearer ${newToken}`
          resolve(await fetch(`${BASE_URL}${path}`, { ...options, headers }))
        })
      })
    }

    isRefreshing = true
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!refreshRes.ok) {
        clearTokens()
        window.location.href = '/login'
        return res
      }
      const { accessToken, refreshToken: newRefresh } = await refreshRes.json()
      setTokens(accessToken, newRefresh)
      refreshQueue.forEach(cb => cb(accessToken))
      refreshQueue = []
      headers['Authorization'] = `Bearer ${accessToken}`
      return fetch(`${BASE_URL}${path}`, { ...options, headers })
    } finally {
      isRefreshing = false
    }
  }

  return res
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erro ${res.status}`)
  }
  return res.json()
}

// ── API GENÉRICO ─────────────────────────────────────────────────────────────
export const api = {
  async get<T>(path: string): Promise<T> {
    return apiJson<T>(path)
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    return apiJson<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return apiJson<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
  },
  async delete<T>(path: string): Promise<T> {
    return apiJson<T>(path, { method: 'DELETE' })
  },
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const auth = {
  async login(email: string, senha: string) {
    const data = await apiJson<{ user: UserProfile; accessToken: string; refreshToken: string }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) }
    )
    setTokens(data.accessToken, data.refreshToken)
    return data
  },

  async register(payload: { nome: string; email: string; senha: string; role: 'gestor' | 'membro'; orgNome?: string }) {
    const data = await apiJson<{ user: UserProfile; accessToken: string; refreshToken: string }>(
      '/auth/register', { method: 'POST', body: JSON.stringify(payload) }
    )
    setTokens(data.accessToken, data.refreshToken)
    return data
  },

  async me(): Promise<{ user: UserProfile }> {
    return apiJson('/auth/me')
  },

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken()
    await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {})
    clearTokens()
  },

  async invite(payload: { nome?: string; email?: string; role?: 'sub_gestor' | 'membro'; cargo?: string; senha?: string }): Promise<{ convite: any; link: string }> {
    return apiJson('/auth/invite', { method: 'POST', body: JSON.stringify(payload) })
  },

  async getInvite(token: string): Promise<{ convite: any }> {
    return apiJson(`/auth/invite/${token}`)
  },

  async acceptInvite(payload: { token: string; nome?: string; email?: string; senha: string }) {
    const data = await apiJson<{ user: UserProfile; accessToken: string; refreshToken: string }>('/auth/accept-invite', { method: 'POST', body: JSON.stringify(payload) })
    setTokens(data.accessToken, data.refreshToken)
    return data
  },
}

// ── TAREFAS ───────────────────────────────────────────────────────────────────
export const tarefasApi = {
  async list(params?: { status?: string; prioridade?: string; responsavel_id?: string }): Promise<Tarefa[]> {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    const data = await apiJson<{ tarefas: Tarefa[] }>(`/tarefas${qs}`)
    return data.tarefas
  },

  async stats() {
    const data = await apiJson<{ stats: Record<string, string> }>('/tarefas/stats')
    const s = data.stats || {}
    return {
      total: parseInt(s.total || '0'),
      pendente: parseInt(s.pendente || '0'),
      em_progresso: parseInt(s.em_progresso || '0'),
      concluida: parseInt(s.concluida || '0'),
      cancelada: parseInt(s.cancelada || '0'),
    }
  },

  async create(payload: Partial<Tarefa>): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>('/tarefas', { method: 'POST', body: JSON.stringify(payload) })
    return data.tarefa
  },

  async update(id: string, payload: Partial<Tarefa>): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.tarefa
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/tarefas/${id}`, { method: 'DELETE' })
  },

  // Resposta de execução: membro informa se concluiu ou não + observação
  async responder(id: string, payload: { resposta_status: 'concluida' | 'nao_concluida'; resposta_obs?: string }): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/resposta`, { method: 'POST', body: JSON.stringify(payload) })
    return data.tarefa
  },
}

// ── EQUIPE ────────────────────────────────────────────────────────────────────
export const equipeApi = {
  async membros(): Promise<MembroEquipe[]> {
    const data = await apiJson<{ membros: MembroEquipe[] }>('/equipe/membros')
    return data.membros
  },

  async pessoas(tipo?: string): Promise<Pessoa[]> {
    const qs = tipo ? `?tipo=${tipo}` : ''
    const data = await apiJson<{ pessoas: Pessoa[] }>(`/equipe/pessoas${qs}`)
    return data.pessoas
  },

  async createPessoa(payload: Partial<Pessoa>): Promise<Pessoa> {
    const data = await apiJson<{ pessoa: Pessoa }>('/equipe/pessoas', { method: 'POST', body: JSON.stringify(payload) })
    return data.pessoa
  },

  async updatePessoa(id: string, payload: Partial<Pessoa>): Promise<Pessoa> {
    const data = await apiJson<{ pessoa: Pessoa }>(`/equipe/pessoas/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.pessoa
  },

  async removePessoa(id: string): Promise<void> {
    await apiJson(`/equipe/pessoas/${id}`, { method: 'DELETE' })
  },
}

// ── AGENDA ────────────────────────────────────────────────────────────────────
export const agendaApi = {
  async list(mes?: number, ano?: number): Promise<Evento[]> {
    const qs = mes && ano ? `?mes=${mes}&ano=${ano}` : ''
    const data = await apiJson<{ eventos: Evento[] }>(`/agenda${qs}`)
    return data.eventos
  },

  async create(payload: Partial<Evento>): Promise<Evento> {
    const data = await apiJson<{ evento: Evento }>('/agenda', { method: 'POST', body: JSON.stringify(payload) })
    return data.evento
  },

  async update(id: string, payload: Partial<Evento>): Promise<Evento> {
    const data = await apiJson<{ evento: Evento }>(`/agenda/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.evento
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/agenda/${id}`, { method: 'DELETE' })
  },
}

// ── PAGAMENTOS ────────────────────────────────────────────────────────────────
export const pagamentosApi = {
  async list(params?: { status?: string; tipo?: string; pessoa_id?: string; vencidos?: string }): Promise<Pagamento[]> {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    const data = await apiJson<{ pagamentos: Pagamento[] }>(`/pagamentos${qs}`)
    return data.pagamentos
  },

  async resumo(): Promise<ResumoFinanceiro> {
    const data = await apiJson<{ resumo: Record<string, string> }>('/pagamentos/resumo')
    const r = data.resumo || {}
    return {
      receita_paga:      parseFloat(r.receita_paga      || '0'),
      receita_pendente:  parseFloat(r.receita_pendente  || '0'),
      despesa_paga:      parseFloat(r.despesa_paga      || '0'),
      despesa_pendente:  parseFloat(r.despesa_pendente  || '0'),
      saldo:             parseFloat(r.receita_paga || '0') - parseFloat(r.despesa_paga || '0'),
      vencidos_pagar:    parseFloat(r.total_vencido     || '0'),
      vencidos_receber:  0,
    }
  },

  async porPessoa(): Promise<ResumoPorPessoa[]> {
    const data = await apiJson<{ por_pessoa: ResumoPorPessoa[] }>('/pagamentos/por-pessoa')
    return data.por_pessoa
  },

  async create(payload: Partial<Pagamento>): Promise<Pagamento> {
    const data = await apiJson<{ pagamento: Pagamento }>('/pagamentos', { method: 'POST', body: JSON.stringify(payload) })
    return data.pagamento
  },

  async update(id: string, payload: Partial<Pagamento>): Promise<Pagamento> {
    const data = await apiJson<{ pagamento: Pagamento }>(`/pagamentos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.pagamento
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/pagamentos/${id}`, { method: 'DELETE' })
  },

  async grupos(): Promise<GrupoPagamento[]> {
    const data = await apiJson<{ grupos: GrupoPagamento[] }>('/pagamentos/grupos')
    return data.grupos
  },

  async grupoParcelas(grupoId: string): Promise<Pagamento[]> {
    const data = await apiJson<{ parcelas: Pagamento[] }>(`/pagamentos/grupo/${grupoId}`)
    return data.parcelas
  },

  async removeGrupo(grupoId: string): Promise<void> {
    await apiJson(`/pagamentos/grupo/${grupoId}`, { method: 'DELETE' })
  },
}

// ── DOCUMENTOS / UPLOADS ──────────────────────────────────────────────────────
export const documentosApi = {
  async list(params?: { pessoa_id?: string; tipo?: string; search?: string }): Promise<Documento[]> {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    const data = await apiJson<{ documentos: Documento[] }>(`/documentos${qs}`)
    return data.documentos
  },

  async historicoPessoa(pessoaId: string): Promise<HistoricoPessoa> {
    return apiJson(`/uploads/historico/${pessoaId}`)
  },

  /**
   * Upload de arquivo — usa FormData para envio multipart
   * @param file Arquivo a ser enviado
   * @param meta Metadados: titulo, descricao, tipo, pessoa_id, pagamento_id
   * @param onProgress Callback de progresso (0-100)
   */
  async upload(
    file: File,
    meta: { titulo: string; descricao?: string; tipo?: string; pessoa_id?: string; pagamento_id?: string },
    onProgress?: (pct: number) => void
  ): Promise<{ documento: Documento; arquivo_url: string }> {
    const token = getAccessToken()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('titulo', meta.titulo)
    if (meta.descricao)    formData.append('descricao', meta.descricao)
    if (meta.tipo)         formData.append('tipo', meta.tipo)
    if (meta.pessoa_id)    formData.append('pessoa_id', meta.pessoa_id)
    if (meta.pagamento_id) formData.append('pagamento_id', meta.pagamento_id)

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE_URL}/uploads`)
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          const body = JSON.parse(xhr.responseText || '{}')
          reject(new Error(body.error || `Erro ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error('Erro de rede ao fazer upload.'))
      xhr.send(formData)
    })
  },

  async update(id: string, payload: Partial<Documento>): Promise<Documento> {
    const data = await apiJson<{ documento: Documento }>(`/documentos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.documento
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/uploads/${id}`, { method: 'DELETE' })
  },
}

// ── EQUIPES ─────────────────────────────────────────────────────────────
export const teamsApi = {
  async list(): Promise<Equipe[]> {
    const data = await apiJson<{ equipes: Equipe[] }>('/teams')
    return data.equipes
  },
  async create(payload: { nome: string; descricao?: string }): Promise<Equipe> {
    const data = await apiJson<{ equipe: Equipe }>('/teams', { method: 'POST', body: JSON.stringify(payload) })
    return data.equipe
  },
  async members(id: string): Promise<MembroEquipe[]> {
    const data = await apiJson<{ membros: MembroEquipe[] }>(`/teams/${id}/members`)
    return data.membros
  },
  async addMembers(id: string, members: string[]): Promise<void> {
    await apiJson(`/teams/${id}/members`, { method: 'POST', body: JSON.stringify({ members }) })
  },
  async detail(id: string): Promise<Equipe> {
    const data = await apiJson<{ equipe: Equipe }>(`/teams/${id}`)
    return data.equipe
  },
  async update(id: string, payload: { nome?: string; descricao?: string }): Promise<Equipe> {
    const data = await apiJson<{ equipe: Equipe }>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.equipe
  },
  async removeMember(id: string, userId: string): Promise<void> {
    await apiJson(`/teams/${id}/members/${userId}`, { method: 'DELETE' })
  },
}

// ── USUÁRIOS ───────────────────────────────────────────────────────────────
/**
 * API para gerenciamento de usuários (profiles). Disponível apenas para gestores e sub-gestores.
 */
export const usersApi = {
  /**
   * Lista os usuários da organização atual. Membros veem apenas seu próprio perfil.
   */
  async list(): Promise<UserProfile[]> {
    const data = await apiJson<{ users: UserProfile[] }>('/users')
    return data.users
  },
  /**
   * Cria um novo usuário. Role pode ser 'sub_gestor' ou 'membro'.
   * Retorna o usuário criado e a senha provisória (caso tenha sido gerada no servidor).
   */
  async create(payload: { nome: string; email: string; role: 'sub_gestor' | 'membro'; cargo?: string; senha?: string }): Promise<{ user: UserProfile; senha: string; senha_provisoria?: string }> {
    const data = await apiJson<{ user: UserProfile; senha: string; senha_provisoria?: string }>('/users', { method: 'POST', body: JSON.stringify(payload) })
    return data
  },

  async update(id: string, payload: { nome?: string; cargo?: string; novoRole?: string; ativo?: boolean }): Promise<UserProfile> {
    const data = await apiJson<{ user: UserProfile }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.user
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/users/${id}`, { method: 'DELETE' })
  },

  async resetPassword(id: string): Promise<{ user: UserProfile; senha: string; senha_provisoria: string }> {
    return apiJson(`/users/${id}/reset-password`, { method: 'POST' })
  },

  async invite(payload: { nome?: string; email?: string; role?: 'sub_gestor' | 'membro'; cargo?: string; senha?: string }): Promise<{ convite: any; link: string }> {
    return apiJson('/users/invite', { method: 'POST', body: JSON.stringify(payload) })
  },

  // Lista apenas os comandados diretos do sub_gestor autenticado
  async meusComandados(): Promise<UserProfile[]> {
    const data = await apiJson<{ users: UserProfile[] }>('/users/meus-comandados')
    return data.users
  },
}
