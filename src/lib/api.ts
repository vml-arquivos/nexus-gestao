// ── CLIENTE DE API — Nexus Gestão ─────────────────────────────────────────────
// Conecta ao backend Express/PostgreSQL via REST.
// Gerencia automaticamente o token JWT e o refresh.

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

// ── STORAGE DE TOKENS ─────────────────────────────────────────────────────────
const TOKEN_KEY   = 'nx_access_token'
const REFRESH_KEY = 'nx_refresh_token'

export class ApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>

  constructor(status: number, message: string, body: unknown = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {}
  }
}

export function getAccessToken(): string | null  { return localStorage.getItem(TOKEN_KEY) }
export function getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY) }

function tokenOwner(token: string | null): string {
  try {
    if (!token) return 'anonymous'
    const part = token.split('.')[1] || ''
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return String(payload.userId || payload.sub || 'anonymous')
  } catch {
    return 'anonymous'
  }
}

// Decodifica o access token localmente (sem chamada de rede) para preencher
// um usuário "otimista" no primeiro render. Antes, a tela cheia de
// carregamento ficava presa esperando /api/auth/me responder -- em
// aberturas diretas isso chegou a ~17s (pool frio, deploy recente, etc.),
// bloqueando a aplicação inteira mesmo com um token local válido. Só os
// campos já presentes no JWT (ver JwtPayload no backend) ficam disponíveis
// até o /me real confirmar o perfil completo em segundo plano.
export function decodeOptimisticUser(token: string | null): UserProfile | null {
  try {
    if (!token) return null
    const part = token.split('.')[1] || ''
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as {
      userId?: string; orgId?: string; role?: UserProfile['role']; nome?: string; email?: string; exp?: number
    }
    if (!payload.userId || !payload.orgId || !payload.role) return null
    // Token já expirado localmente: não vale a pena otimizar, deixa o
    // fluxo normal (bloqueante) tratar o refresh/expulsão.
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null
    return {
      id: payload.userId,
      orgId: payload.orgId,
      role: payload.role,
      nome: payload.nome || '',
      email: payload.email || '',
    }
  } catch {
    return null
  }
}

function clearApiCaches() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('nexus:cache:')) localStorage.removeItem(key)
    }
  } catch {}
}

export function setTokens(access: string, refresh: string) {
  const previousOwner = tokenOwner(getAccessToken())
  const nextOwner = tokenOwner(access)
  if (previousOwner !== 'anonymous' && previousOwner !== nextOwner) clearApiCaches()
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  clearApiCaches()
}

// ── TIPOS ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string
  nome: string
  email: string
  role: 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'
  role_na_equipe?: 'membro' | 'sub_gestor' | 'gestor' | string
  cargo?: string
  orgId: string
  org_nome?: string
  avatar_url?: string
  criado_por?: string
  criado_por_nome?: string
  ativo?: boolean
}

export type ChecklistDifficulty = 'nivel_1' | 'nivel_2' | 'nivel_3' | 'nivel_4' | 'nivel_5' | 'facil' | 'medio' | 'dificil' | 'hard'

export interface ObjectiveSubtask {
  id: string
  texto: string
  feito?: boolean
}

export interface ChecklistItem {
  id: string
  texto: string
  feito: boolean
  /** Cadência de lembrete deste item. Nunca gera uma cópia da lista ou do item. */
  recorrencia?: 'unica' | 'diaria' | 'semanal' | 'mensal'
  /** 0=domingo ... 6=sábado, usado somente na recorrência semanal. */
  recorrencia_dia_semana?: number
  /** Dia 1..31, usado somente na recorrência mensal (ajusta ao último dia do mês). */
  recorrencia_dia_mes?: number
  descricao?: string
  data?: string
  /** Responsável específico por executar este item do checklist. */
  responsavel_id?: string
  responsavel_nome?: string
  /** Campos legados/operacionais preservados para identificar corretamente quem assumiu e quem concluiu. */
  assumido_por?: string
  executor_id?: string
  aceita_por?: string
  concluido_por?: string
  feito_por?: string
  /** Grau de dificuldade da subtarefa: controla a pontuação base definida por nível: 0, 1, 3, 5 ou 20 pontos. */
  dificuldade?: ChecklistDifficulty
  /** Pontos manuais deste objetivo. Obrigatório quando o ranking pontua objetivos. */
  pontuacao?: number
  /** Subtarefas internas deste objetivo. Não pontuam separadamente; servem para detalhar a execução. */
  subtarefas?: ObjectiveSubtask[]
  /** Quando verdadeiro, o objetivo aparece para a equipe só com pontuação; título e instruções são revelados apenas para quem assumir. */
  revelar_apos_assumir?: boolean
  /** Registro de quando este item foi criado (dia e hora), independente da
   * data de execução (que é quando deve ser feito). Preenchido automaticamente. */
  criado_em?: string
  /** Id de outro item da MESMA lista que precisa estar concluído antes deste
   * poder ser marcado como feito. Opcional — sem isso, o item funciona como
   * sempre funcionou, sem nenhuma trava de sequência. Mantido por
   * compatibilidade; para depender de VÁRIOS itens, use depende_de_todos. */
  depende_de?: string
  /** Lista de ids de outros itens da MESMA lista — este item só libera
   * quando TODOS os itens desta lista estiverem concluídos. Como "passar de
   * fase": uma tarefa final (ex.: "abrir conta no banco") só aparece
   * disponível depois que todas as tarefas anteriores da sequência
   * estiverem prontas. */
  depende_de_todos?: string[]
  /** Registro diário obrigatório de status enquanto o item está atrasado e
   * ainda não concluído — uma entrada por dia, sempre com o motivo do
   * atraso daquele dia. Não afeta itens dentro do prazo. */
  atualizacoes_atraso?: Array<{ data: string; nota: string; autor?: string }>
  /** Quando verdadeiro, este item específico fica livre para qualquer membro
   * da equipe assumir — mesmo que a lista tenha um responsável principal
   * definido (modelo "Direcionar"). O responsável principal da lista NÃO
   * executa este item automaticamente; alguém precisa assumi-lo primeiro. */
  livre?: boolean
  /** Indica que o backend mascarou o conteúdo para o usuário atual. */
  oculta_ate_assumir?: boolean
  aprovacao_status?: 'aguardando' | 'aprovada' | 'devolvida'
  aprovado_por?: string
  aprovado_em?: string
  devolvido_por?: string
  devolvido_em?: string
  ressalva_gestor?: string
}


export interface TarefaComentario {
  id: string
  tarefa_id: string
  checklist_id?: string
  autor_id: string
  autor_nome?: string
  comentario: string
  tipo: 'comentario' | 'execucao' | 'devolucao' | 'aprovacao' | 'sistema'
  criado_em: string
  editado_em?: string
}

export interface TarefaRelatorio {
  gerado_em: string
  tarefa: Tarefa
  comentarios: TarefaComentario[]
  historico: any[]
  pontuacoes: any[]
  anexos: TarefaAnexo[]
}


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
  /** Separa tarefas pessoais de tarefas controladas pela equipe/gestor. */
  escopo?: 'pessoal' | 'equipe'
  /** Contexto funcional da lista. Não é usado como chave de deduplicação. */
  contexto_tipo?: 'empresa' | 'pessoa_fisica' | 'escritorio' | 'pessoal'
  /** Relembra a mesma lista diariamente até execução e aprovação, sem cloná-la. */
  lembrete_diario_ate_aprovacao?: boolean
  /** normal = tarefa atribuída; livre_equipe = fica disponível para um membro pegar. */
  modo_distribuicao?: 'normal' | 'livre_equipe'
  aceita_por?: string
  aceita_por_nome?: string
  aceita_em?: string
  /** Calculado no servidor a partir do checklist COMPLETO (antes do filtro de
   * privacidade por membro) — usado para saber se a lista livre já tem dono,
   * mesmo quando o próprio checklist retornado para este usuário vem vazio
   * porque os itens pertencem a outra pessoa. */
  possui_itens_atribuidos?: boolean
  pontuacao?: number
  /** Define onde a pontuação será contabilizada: tarefa, objetivos ou ambos. */
  pontuacao_escopo?: 'tarefa' | 'subtarefas' | 'ambos'
  pontuacao_tipo?: 'tarefa' | 'subtarefas' | 'ambos'
  conta_ranking?: boolean
  bloquear_nova_livre_ate_concluir?: boolean
  status: 'pendente' | 'em_progresso' | 'concluida' | 'nao_concluida' | 'devolvida' | 'reenviada' | 'aprovada' | 'cancelada'
  checklist?: ChecklistItem[]
  obs?: string
  // Resposta de execução do responsável
  resposta_status?: 'concluida' | 'nao_concluida'
  resposta_obs?: string
  resposta_em?: string
  updated_at: string
  /** Registro otimista ainda aguardando persistência no backend. */
  offline_pending?: boolean
  resposta_membro?: string
  motivo_nao_conclusao?: string
  observacao_conclusao?: string
  status_gestor?: 'aguardando' | 'aprovada' | 'devolvida'
  ressalva_gestor?: string
  aprovada_em?: string
  aprovada_por?: string
  devolvida_em?: string
  data_reabertura?: string
  reaberto_por?: string
  reenviada_em?: string
  data_inicio?: string
  data_conclusao?: string
  anexos_count?: number | string
  ultima_evidencia_em?: string | null
  created_at: string
  origem_sistema?: string
  origem_tipo?: string
  origem_id?: string
  origem_nome?: string
  origem_url?: string
  /** Agrupador de projeto já existente no schema, sem entidade paralela. */
  projeto_grupo_id?: string | null
  workflow_tipo?: string | null
  origem_payload?: Record<string, unknown>
  tarefa_surpresa?: boolean
  external_key?: string
}

export interface TarefaAnexo {
  id: string
  org_id: string
  tarefa_id: string
  enviado_por: string
  enviado_por_nome?: string
  titulo: string
  descricao?: string
  tipo: 'evidencia' | 'referencia' | 'correcao' | 'outro'
  arquivo_url: string
  nome_original?: string
  mime_type?: string
  tamanho?: number
  created_at: string
}

export interface EmpresaDestravaDocumento {
  id: string
  nome: string
  tipo?: string
  tamanho?: number
  status_validacao?: string
  data_vencimento?: string
  created_at: string
  preview_url?: string
  download_url?: string
}

export interface EmpresaDestravaResumo {
  empresa: Record<string, any>
  historico: Array<{ id: string; tipo: string; descricao: string; autor?: string; created_at: string }>
  documentos: EmpresaDestravaDocumento[]
  contratos: Array<Record<string, any>>
  simulacoes: Array<Record<string, any>>
}

export interface Pessoa {
  id: string
  org_id: string
  user_id?: string
  nome: string
  tipo: 'funcionario' | 'prestador' | 'credor' | 'devedor' | 'cliente' | 'comercio'
  cargo?: string
  contato?: string
  email?: string
  valor?: number
  obs?: string
  avatar_url?: string
  created_at: string
}


export interface Produto {
  id: string
  org_id: string
  user_id?: string
  comercio_id?: string | null
  comercio_nome?: string | null
  nome: string
  codigo?: string | null
  categoria?: string | null
  unidade?: string | null
  preco_custo?: number | null
  preco_venda?: number | null
  estoque?: number | null
  site_url?: string | null
  obs?: string | null
  ativo?: boolean
  created_at: string
  updated_at?: string
}

export interface MembroEquipe {
  id: string
  nome: string
  email: string
  role: 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'
  role_na_equipe?: 'membro' | 'sub_gestor' | 'gestor' | string
  cargo?: string
  avatar_url?: string
  ativo?: boolean
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
  origem_sistema?: string
  origem_tipo?: string
  origem_id?: string
  sync_key?: string
  auto_sync?: boolean
  google_calendar_status?: string
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
  origem_sistema?: string
  origem_tipo?: string
  origem_id?: string
  origem_nome?: string
  origem_url?: string
  origem_payload?: Record<string, unknown>
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
  /** Valores por parcela, na mesma ordem de datas_personalizadas/parcelamento. Usado para fechar centavos com precisão. */
  parcelas_valores?: number[]
  /** UUID que agrupa parcelas de um mesmo financiamento/parcelamento */
  grupo_id?: string
  /** Total de parcelas do grupo */
  num_parcelas?: number
  /** Número desta parcela dentro do grupo */
  num_parcela?: number
  created_at: string
  updated_at?: string
}

export interface HistoricoFinanceiro {
  id: string
  pagamento_id?: string | null
  grupo_id?: string | null
  group_key?: string | null
  tipo_evento: 'criacao' | 'pagamento' | 'abatimento' | 'acrescimo' | 'recalculo' | 'cancelamento' | 'edicao' | 'movimento'
  titulo: string
  descricao?: string | null
  valor?: number | null
  data_evento?: string | null
  forma_pagamento?: string | null
  saldo_anterior?: number | null
  saldo_posterior?: number | null
  user_nome?: string | null
  metadata?: Record<string, unknown> | string | null
  created_at: string
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
  historico?: HistoricoFinanceiro[]
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




export interface InteligenciaPainel {
  score: number
  nivel: 'baixo' | 'medio' | 'alto' | 'critico'
  resumo: string
  metricas: Record<string, number>
  riscos: Array<{ titulo: string; detalhe: string; nivel: 'baixo' | 'medio' | 'alto' | 'critico'; destino?: string; acao_tipo?: string }>
  recomendacoes: Array<{ titulo: string; detalhe: string; acao: string; destino?: string; acao_tipo?: string }>
  sobrecarga: Array<{ nome: string; abertas: number; atrasadas: number }>
  tarefas_criticas: Array<Pick<Tarefa, 'id' | 'titulo' | 'prioridade' | 'status' | 'prazo' | 'data' | 'responsavel_nome'>>
  financeiro_critico?: Array<{ id: string; titulo: string; pessoa_nome?: string; pessoa_contato?: string; pessoa_user_id?: string; valor: number; vencimento?: string; tipo: 'pagamento' | 'recebimento'; status: string; dias: number; nivel: 'alto' | 'critico'; sugestao: string; canal?: 'interno' | 'whatsapp' | 'sem_contato' }>
  acoes_inteligentes?: Array<{ tipo: 'cobrar_tarefa' | 'cobrar_devedor' | 'lembrar_pagamento' | 'criar_tarefa_cobranca' | 'notificar_financeiro' | 'sincronizar_agenda'; titulo: string; detalhe: string; tarefa_id?: string; pagamento_id?: string; nivel: 'baixo' | 'medio' | 'alto' | 'critico' }>
  notificacoes?: { tempo_real: boolean; som: boolean; navegador: boolean; tipos: string[] }
  gemini: { enabled: boolean; provider: string; model: string; texto: string; erro?: string }
  gerado_em: string
}

export interface DestravaCatalogoItem {
  id: string
  tipo: 'empresa' | 'cliente' | 'contrato' | 'simulacao' | string
  nome: string
  documento?: string | null
  email?: string | null
  telefone?: string | null
  status?: string | null
  subtitulo?: string | null
  url?: string | null
  metadata?: Record<string, unknown>
}

// ── FETCH COM AUTH ────────────────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null

type OfflineQueueItem = { id: string; owner?: string; path: string; method: string; body?: string; createdAt: string }
export type OfflineQueueFailure = OfflineQueueItem & { status: number; error: string; failedAt: string }
const OFFLINE_QUEUE_KEY = 'nexus:offline-queue'
const OFFLINE_QUEUE_COUNT_KEY = 'nexus:offline-queue-count'
const OFFLINE_FAILURES_KEY = 'nexus:offline-failures'

function isBrowserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function readOfflineQueue(): OfflineQueueItem[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]') || [] } catch { return [] }
}

function writeOfflineQueue(queue: OfflineQueueItem[]) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
    const owner = tokenOwner(getAccessToken())
    const ownerCount = queue.filter(item => (item.owner || owner) === owner).length
    localStorage.setItem(OFFLINE_QUEUE_COUNT_KEY, String(ownerCount))
    window.dispatchEvent(new CustomEvent('nexus:offline-queue-changed', { detail: { count: ownerCount } }))
  } catch {}
}

function enqueueOffline(path: string, options: RequestInit = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (method === 'GET' || options.body instanceof FormData) return false
  const body = typeof options.body === 'string' ? options.body : options.body ? JSON.stringify(options.body) : undefined
  const queue = readOfflineQueue()
  const owner = tokenOwner(getAccessToken())
  queue.push({ id: `${owner}-${Date.now()}-${Math.random().toString(36).slice(2)}`, owner, path, method, body, createdAt: new Date().toISOString() })
  writeOfflineQueue(queue)
  return true
}

function readOfflineFailures(): OfflineQueueFailure[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_FAILURES_KEY) || '[]') || [] } catch { return [] }
}

function writeOfflineFailure(item: OfflineQueueItem, status: number, error: string) {
  try {
    const failures = readOfflineFailures().filter(failure => failure.id !== item.id)
    failures.unshift({ ...item, status, error, failedAt: new Date().toISOString() })
    localStorage.setItem(OFFLINE_FAILURES_KEY, JSON.stringify(failures.slice(0, 100)))
    window.dispatchEvent(new CustomEvent('nexus:offline-failures-changed', { detail: { count: failures.length } }))
  } catch {}
}

export function getOfflineFailureCount(): number {
  return readOfflineFailures().length
}

export function getOfflinePendingTaskCreates(): Array<{ id: string; createdAt: string; payload: Partial<Tarefa> }> {
  const owner = tokenOwner(getAccessToken())
  return readOfflineQueue()
    .filter(item => (item.owner || owner) === owner && item.method === 'POST' && item.path.split('?')[0] === '/tarefas' && Boolean(item.body))
    .map(item => {
      try {
        return { id: item.id, createdAt: item.createdAt, payload: JSON.parse(item.body!) as Partial<Tarefa> }
      } catch {
        return null
      }
    })
    .filter((item): item is { id: string; createdAt: string; payload: Partial<Tarefa> } => Boolean(item))
}

function cacheGetResponse(path: string, data: unknown) {
  try {
    const owner = tokenOwner(getAccessToken())
    localStorage.setItem(`nexus:cache:${owner}:${path}`, JSON.stringify({ data, cachedAt: new Date().toISOString() }))
  } catch {}
}

function readCachedGet<T>(path: string): T | null {
  try {
    const owner = tokenOwner(getAccessToken())
    const raw = localStorage.getItem(`nexus:cache:${owner}:${path}`)
    if (!raw) return null
    return (JSON.parse(raw) || {}).data ?? null
  } catch { return null }
}

export async function syncOfflineQueue(): Promise<number> {
  const owner = tokenOwner(getAccessToken())
  if (!isBrowserOnline()) return readOfflineQueue().filter(item => (item.owner || owner) === owner).length
  let queue = readOfflineQueue()
  if (!queue.length) return 0
  const pending: OfflineQueueItem[] = []
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index]
    if ((item.owner || owner) !== owner) {
      pending.push(item)
      continue
    }
    try {
      const res = await apiFetch(item.path, { method: item.method, body: item.body, headers: { 'x-nexus-offline-replay': '1' } })
      if (!res.ok) {
        // 4xx (exceto indisponibilidade/conflito transitório) é uma rejeição
        // permanente da operação; não deve reaparecer como pendência infinita.
        // Preservamos o registro em uma caixa de falhas para diagnóstico e
        // eventual reprocessamento explícito, sem apagar dados do servidor.
        const retryable = [408, 425, 429].includes(res.status) || res.status >= 500
        if (retryable) pending.push(item)
        else writeOfflineFailure(item, res.status, (await res.clone().json().catch(() => ({})))?.error || `Servidor rejeitou a operação (${res.status}).`)
      }
    } catch {
      // Mantém também todos os itens ainda não processados. A versão anterior
      // interrompia o loop e acabava apagando silenciosamente o restante.
      pending.push(item, ...queue.slice(index + 1))
      break
    }
  }
  writeOfflineQueue(pending)
  window.dispatchEvent(new CustomEvent('nexus:offline-sync-complete', { detail: { synced: queue.length - pending.length, remaining: pending.filter(item => (item.owner || owner) === owner).length } }))
  return pending.filter(item => (item.owner || owner) === owner).length
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { syncOfflineQueue().catch(() => undefined) })
  setTimeout(() => { if (isBrowserOnline()) syncOfflineQueue().catch(() => undefined) }, 1200)
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const externalSignal = init.signal
  let timedOut = false
  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw new Error('O servidor demorou para responder. Tente novamente em instantes.')
    throw error
  } finally {
    window.clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const currentRefresh = getRefreshToken()
    if (!currentRefresh) return null
    const refreshRes = await fetchWithTimeout(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefresh }),
    }, 12_000)
    if (!refreshRes.ok) return null
    const payload = await refreshRes.json()
    const accessToken = String(payload?.accessToken || '')
    if (!accessToken) return null
    // O backend mantém o refresh estável; ainda aceitamos resposta de versões
    // anteriores para uma transição de deploy sem quebrar a sessão.
    setTokens(accessToken, String(payload?.refreshToken || currentRefresh))
    return accessToken
  })().catch(() => null).finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

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

  if (!isBrowserOnline() && String(options.method || 'GET').toUpperCase() !== 'GET') {
    if (enqueueOffline(path, options)) {
      return new Response(JSON.stringify({ offlineQueued: true, error: 'Atualização salva offline. Ela será enviada quando a internet voltar.' }), { status: 202, headers: { 'Content-Type': 'application/json' } })
    }
  }

  const method = String(options.method || 'GET').toUpperCase()
  const timeoutMs = method === 'GET' ? 20_000 : 30_000
  let res: Response
  try {
    res = await fetchWithTimeout(`${BASE_URL}${path}`, { ...options, headers }, timeoutMs)
  } catch (error) {
    // navigator.onLine pode continuar true quando o servidor, proxy ou DNS
    // cai. Nesse caso, mutações JSON também entram na fila durável.
    if (method !== 'GET' && headers['x-nexus-offline-replay'] !== '1' && enqueueOffline(path, options)) {
      return new Response(JSON.stringify({ offlineQueued: true, error: 'Atualização salva offline. Ela será enviada quando o serviço voltar.' }), { status: 202, headers: { 'Content-Type': 'application/json' } })
    }
    throw error
  }

  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (!newToken) {
      clearTokens()
      if (window.location.pathname !== '/login') window.location.replace('/login')
      return res
    }

    headers['Authorization'] = `Bearer ${newToken}`
    return fetchWithTimeout(`${BASE_URL}${path}`, { ...options, headers }, timeoutMs)
  }

  return res
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const method = String(options?.method || 'GET').toUpperCase()
  try {
    const res = await apiFetch(path, options)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(res.status, body?.error || `Erro ${res.status}`, body)
    }
    const data = await res.json()
    if (method === 'GET') cacheGetResponse(path, data)
    return data
  } catch (e) {
    if (method === 'GET') {
      const cached = readCachedGet<T>(path)
      if (cached) return cached
    }
    throw e
  }
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
  async download(path: string): Promise<{ blob: Blob; filename: string }> {
    const res = await apiFetch(path)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Erro ${res.status}`)
    }
    const disposition = res.headers.get('content-disposition') || ''
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
    const filename = decodeURIComponent(match?.[1] || match?.[2] || 'nexus-backup.json')
    return { blob: await res.blob(), filename }
  },
}


// ── INTEGRAÇÃO DESTRAVA ─────────────────────────────────────────────────────
export const destravaApi = {
  async catalogo(params?: { tipo?: string; q?: string; limit?: number }): Promise<DestravaCatalogoItem[]> {
    const qs = '?' + new URLSearchParams({
      tipo: params?.tipo || 'todos',
      q: params?.q || '',
      limit: String(params?.limit || 20),
    }).toString()
    const data = await apiJson<{ items: DestravaCatalogoItem[] }>(`/integracoes/destrava/catalogo${qs}`)
    return data.items || []
  },
  async empresaResumo(id: string): Promise<any> {
    return apiJson(`/integracoes/destrava/empresa/${encodeURIComponent(id)}/resumo`)
  },
  async empresasSincronizadas(params?: { tipo?: 'empresa' | 'pessoa_fisica'; q?: string; limit?: number; page?: number }): Promise<{ items: DestravaCatalogoItem[]; total?: number; total_catalogo?: number; ultima_sincronizacao?: string; page?: number; limit?: number; has_more?: boolean }> {
    const qs = '?' + new URLSearchParams({
      tipo: params?.tipo || '',
      q: params?.q || '',
      limit: String(params?.limit || 50),
      page: String(params?.page || 1),
    }).toString()
    return apiJson(`/integracoes/destrava/empresas${qs}`)
  },
  async sincronizarEmpresas(): Promise<{ ok: boolean; sincronizadas: number; total_recebido: number; total_reportado_destrava?: number | null; paginas?: number; sincronizado_em: string }> {
    return apiJson('/integracoes/destrava/empresas/sincronizar', { method: 'POST' })
  },
}

// ── INTELIGÊNCIA OPERACIONAL ─────────────────────────────────────────────────
export const inteligenciaApi = {
  async painel(): Promise<InteligenciaPainel> {
    return apiJson('/inteligencia/painel')
  },

  async executarAcao(payload: {
    tipo: 'cobrar_tarefa' | 'cobrar_devedor' | 'lembrar_pagamento' | 'criar_tarefa_cobranca' | 'notificar_financeiro' | 'sincronizar_agenda'
    tarefa_id?: string
    pagamento_id?: string
    mensagem?: string
  }): Promise<{ ok: boolean; enviados: number; tarefa_id?: string; pagamento_id?: string; mensagem?: string; whatsapp_url?: string; whatsapp_message?: string; canal?: 'interno' | 'whatsapp'; agenda?: { criados?: number; existentes?: number; tarefas?: number; financeiros?: number; locaisCriados?: number; locaisAtualizados?: number; locaisExistentes?: number; googleCriados?: number; googleAtualizados?: number; googleFalhas?: number } }> {
    return apiJson('/inteligencia/executar-acao', { method: 'POST', body: JSON.stringify(payload) })
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

  async register(payload: { nome: string; email: string; senha: string; role: 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'; orgNome?: string }) {
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

  async invite(payload: { nome?: string; email?: string; role?: 'admin' | 'gestor' | 'sub_gestor' | 'membro'; cargo?: string; senha?: string }): Promise<{ convite: any; link: string }> {
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

  async anexosResumo(): Promise<Record<string, { anexos_count: number; ultima_evidencia_em: string | null }>> {
    const data = await apiJson<{ resumo: Array<{ tarefa_id: string; anexos_count: number; ultima_evidencia_em: string | null }> }>('/tarefas/anexos-resumo')
    return Object.fromEntries((data.resumo || []).map(item => [String(item.tarefa_id), {
      anexos_count: Number(item.anexos_count || 0),
      ultima_evidencia_em: item.ultima_evidencia_em || null,
    }]))
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
    const data = await apiJson<{ tarefa?: Tarefa; offlineQueued?: boolean }>('/tarefas', { method: 'POST', body: JSON.stringify(payload) })
    if (data.offlineQueued) {
      return { ...(payload as Tarefa), id: `offline-${Date.now()}`, org_id: '', criado_por: '', titulo: payload.titulo || 'Lista salva offline', prioridade: payload.prioridade || 'media', status: 'pendente', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    }
    return data.tarefa as Tarefa
  },

  async update(id: string, payload: Partial<Tarefa>): Promise<Tarefa> {
    const data = await apiJson<{ tarefa?: Tarefa; offlineQueued?: boolean }>(`/tarefas/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    if (data.offlineQueued) return { ...(payload as Tarefa), id, org_id: '', criado_por: '', titulo: payload.titulo || 'Lista atualizada offline', prioridade: payload.prioridade || 'media', status: payload.status || 'pendente', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    return data.tarefa as Tarefa
  },

  // Remove um executor da lista sempre a partir do checklist atual do banco
  // (nunca do que o navegador tem em memória) — evita apagar itens reais por
  // causa de um estado desatualizado na tela do gestor.
  async removerExecutor(id: string, memberId: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/remover-executor`, { method: 'PATCH', body: JSON.stringify({ member_id: memberId }) })
    return data.tarefa
  },

  // Registro diário obrigatório de status enquanto um item está atrasado e
  // ainda pendente — uma chamada por dia, sempre com o motivo daquele dia.
  async atualizarAtraso(id: string, itemId: string, nota: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/checklist/${itemId}/atualizar-atraso`, { method: 'POST', body: JSON.stringify({ nota }) })
    return data.tarefa
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/tarefas/${id}`, { method: 'DELETE' })
  },

  async updateStatus(id: string, payload: { status: 'em_progresso' | 'concluida' | 'nao_concluida'; motivo_nao_conclusao?: string; observacao_conclusao?: string; resposta_membro?: string }): Promise<Tarefa> {
    const data = await apiJson<{ tarefa?: Tarefa; offlineQueued?: boolean }>(`/tarefas/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) })
    if (data.offlineQueued) return { id, org_id: '', criado_por: '', titulo: 'Atualização salva offline', prioridade: 'media', status: payload.status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Tarefa
    return data.tarefa as Tarefa
  },

  async registrarParte(id: string, observacao?: string): Promise<{ ok: boolean; completa: boolean; feitos: number; total: number; tarefa?: Tarefa }> {
    return apiJson(`/tarefas/${id}/parte-concluida`, { method: 'POST', body: JSON.stringify({ observacao }) })
  },

  async pegar(id: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/pegar`, { method: 'POST' })
    return data.tarefa
  },

  async assumirChecklist(id: string, itemId: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/checklist/${itemId}/assumir`, { method: 'POST' })
    return data.tarefa
  },

  async atualizarChecklistItem(id: string, itemId: string, feito: boolean): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ feito }),
    })
    return data.tarefa
  },

  async comentarios(id: string, checklistId?: string): Promise<TarefaComentario[]> {
    const qs = checklistId ? `?checklist_id=${encodeURIComponent(checklistId)}` : ''
    const data = await apiJson<{ comentarios: TarefaComentario[] }>(`/tarefas/${id}/comentarios${qs}`)
    return data.comentarios || []
  },

  async comentar(id: string, payload: { comentario: string; checklist_id?: string; tipo?: TarefaComentario['tipo'] }): Promise<TarefaComentario> {
    const data = await apiJson<{ comentario: TarefaComentario }>(`/tarefas/${id}/comentarios`, { method: 'POST', body: JSON.stringify(payload) })
    return data.comentario
  },

  async revisarChecklistItem(id: string, itemId: string, decisao: 'aprovar' | 'devolver', ressalva?: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/checklist/${itemId}/revisao`, { method: 'PATCH', body: JSON.stringify({ decisao, ressalva }) })
    return data.tarefa
  },

  async corrigirPontuacaoItem(id: string, itemId: string, pontuacao: number): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/checklist/${itemId}/corrigir-pontuacao`, { method: 'PATCH', body: JSON.stringify({ pontuacao }) })
    return data.tarefa
  },

  async corrigirPontuacaoLista(id: string, pontuacao: number): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/corrigir-pontuacao`, { method: 'PATCH', body: JSON.stringify({ pontuacao }) })
    return data.tarefa
  },

  async relatorio(id: string): Promise<TarefaRelatorio> {
    return apiJson(`/tarefas/${id}/relatorio`)
  },

  async enviarLembrete(id: string, mensagem?: string): Promise<{ ok: boolean; enviados: number }> {
    return apiJson(`/tarefas/${id}/lembrete`, { method: 'POST', body: JSON.stringify({ mensagem }) })
  },

  async ranking(periodo?: string): Promise<{ periodo: string; ranking: any[]; resumo: any }> {
    const qs = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
    return apiJson(`/tarefas/ranking${qs}`)
  },

  async sugerirChecklist(payload: { titulo: string; descricao?: string }): Promise<{ itens: Array<{ texto: string; descricao?: string }>; provider?: string; model?: string; fallback?: boolean }> {
    return apiJson('/tarefas/ia-checklist', { method: 'POST', body: JSON.stringify(payload) })
  },

  async aprovar(id: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/aprovar`, { method: 'PATCH' })
    return data.tarefa
  },

  async devolver(id: string, ressalva_gestor: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/devolver`, { method: 'PATCH', body: JSON.stringify({ ressalva_gestor }) })
    return data.tarefa
  },

  async reenviar(id: string, observacao?: string): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/reenviar`, { method: 'PATCH', body: JSON.stringify({ observacao }) })
    return data.tarefa
  },

  async reabrir(id: string, payload: { complemento: string; prazo?: string; prioridade?: Tarefa['prioridade']; responsavel_id?: string }): Promise<Tarefa> {
    const data = await apiJson<{ tarefa: Tarefa }>(`/tarefas/${id}/reabrir`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.tarefa
  },

  async historico(id: string): Promise<any[]> {
    const data = await apiJson<{ historico: any[] }>(`/tarefas/${id}/historico`)
    return data.historico
  },

  async dashboard(): Promise<any> {
    return apiJson('/tarefas/dashboard')
  },

  async anexos(id: string): Promise<TarefaAnexo[]> {
    const data = await apiJson<{ anexos: TarefaAnexo[] }>(`/tarefas/${id}/anexos`)
    return data.anexos || []
  },

  async uploadAnexo(id: string, file: File, payload?: { titulo?: string; descricao?: string; tipo?: 'evidencia' | 'referencia' | 'correcao' | 'outro'; sincronizarDestrava?: boolean }): Promise<{ anexo: TarefaAnexo; sincronizacao_destrava?: { ok: boolean; erro?: string } }> {
    const form = new FormData()
    form.append('file', file)
    form.append('titulo', payload?.titulo || file.name || 'Anexo da tarefa')
    if (payload?.descricao) form.append('descricao', payload.descricao)
    form.append('tipo', payload?.tipo || 'evidencia')
    if (payload?.sincronizarDestrava) form.append('sincronizar_destrava', 'true')

    const res = await apiFetch(`/tarefas/${id}/anexos`, { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Erro ${res.status}`)
    }
    return await res.json() as { anexo: TarefaAnexo; sincronizacao_destrava?: { ok: boolean; erro?: string } }
  },

  async empresaDestrava(id: string): Promise<EmpresaDestravaResumo> {
    return apiJson<EmpresaDestravaResumo>(`/tarefas/${id}/empresa-destrava`)
  },

  async tarefasDaEmpresa(origemId: string, contextoTipo: 'empresa' | 'pessoa_fisica' = 'empresa'): Promise<{ empresa: { origem_id: string; nome: string | null; tipo: string | null; url: string | null }; ativas: Tarefa[]; historico: Tarefa[] }> {
    return apiJson(`/tarefas/empresa/${encodeURIComponent(origemId)}?contexto_tipo=${encodeURIComponent(contextoTipo)}`)
  },

  async arquivoEmpresaDestrava(id: string, docId: string, download = false): Promise<{ blob: Blob; filename?: string; mime?: string }> {
    const res = await apiFetch(`/tarefas/${id}/empresa-destrava/documentos/${docId}/${download ? 'download' : 'view'}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Erro ${res.status}`)
    }
    const disposition = res.headers.get('Content-Disposition') || ''
    const filenameStar = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const filenamePlain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
    const filename = filenameStar ? decodeURIComponent(filenameStar) : filenamePlain ? decodeURIComponent(filenamePlain) : undefined
    const blob = await res.blob()
    return { blob, filename, mime: res.headers.get('Content-Type') || blob.type }
  },

  async uploadDocumentoEmpresaDestrava(id: string, file: File): Promise<{ ok: boolean }> {
    const form = new FormData()
    form.append('file', file)
    const res = await apiFetch(`/tarefas/${id}/empresa-destrava/documentos`, { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Erro ${res.status}`)
    }
    return await res.json() as { ok: boolean }
  },

  async arquivoAnexo(id: string, anexoId: string, download = false): Promise<{ blob: Blob; filename?: string; mime?: string }> {
    const res = await apiFetch(`/tarefas/${id}/anexos/${anexoId}/arquivo${download ? '?download=1' : ''}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Erro ${res.status}`)
    }
    const disposition = res.headers.get('Content-Disposition') || ''
    const filenameStar = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const filenamePlain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
    const filename = filenameStar ? decodeURIComponent(filenameStar) : filenamePlain ? decodeURIComponent(filenamePlain) : undefined
    const blob = await res.blob()
    return { blob, filename, mime: res.headers.get('Content-Type') || blob.type }
  },

  async deleteAnexo(id: string, anexoId: string): Promise<void> {
    await apiJson(`/tarefas/${id}/anexos/${anexoId}`, { method: 'DELETE' })
  },

  // Resposta de execução: compatibilidade com componentes antigos
  async responder(id: string, payload: { resposta_status: 'concluida' | 'nao_concluida'; resposta_obs?: string }): Promise<Tarefa> {
    if (payload.resposta_status === 'nao_concluida') {
      return this.updateStatus(id, { status: 'nao_concluida', motivo_nao_conclusao: payload.resposta_obs || '', resposta_membro: payload.resposta_obs || '' })
    }
    return this.updateStatus(id, { status: 'concluida', observacao_conclusao: payload.resposta_obs || '', resposta_membro: payload.resposta_obs || '' })
  },

  // ── PEDIR AJUDA ──────────────────────────────────────────────
  async criarAjuda(tarefaId: string, payload: { mensagem: string; destinatario_id: string; checklist_id?: string }): Promise<any> {
    const data = await apiJson<{ ajuda: any }>(`/tarefas/${tarefaId}/ajuda`, { method: 'POST', body: JSON.stringify(payload) })
    return data.ajuda
  },

  async listarAjuda(tarefaId: string): Promise<any[]> {
    const data = await apiJson<{ ajudas: any[] }>(`/tarefas/${tarefaId}/ajuda`)
    return data.ajudas
  },

  async ajudaPendentes(): Promise<any[]> {
    const data = await apiJson<{ ajudas: any[] }>('/tarefas/ajuda/pendentes')
    return data.ajudas
  },

  async minhasAjudas(): Promise<any[]> {
    const data = await apiJson<{ ajudas: any[] }>('/tarefas/ajuda/minhas')
    return data.ajudas
  },

  async responderAjuda(ajudaId: string, resposta: string): Promise<any> {
    const data = await apiJson<{ ajuda: any }>(`/tarefas/ajuda/${ajudaId}`, { method: 'PATCH', body: JSON.stringify({ resposta }) })
    return data.ajuda
  },

  async resolverAjuda(ajudaId: string): Promise<any> {
    const data = await apiJson<{ ajuda: any }>(`/tarefas/ajuda/${ajudaId}/resolver`, { method: 'PATCH' })
    return data.ajuda
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


// ── PRODUTOS ──────────────────────────────────────────────────────────────────
export const produtosApi = {
  async list(params?: { comercio_id?: string; search?: string; ativo?: boolean }): Promise<Produto[]> {
    const qs = new URLSearchParams()
    if (params?.comercio_id) qs.set('comercio_id', params.comercio_id)
    if (params?.search) qs.set('search', params.search)
    if (params?.ativo !== undefined) qs.set('ativo', String(params.ativo))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const data = await apiJson<{ produtos: Produto[] }>(`/produtos${suffix}`)
    return data.produtos
  },

  async create(payload: Partial<Produto>): Promise<Produto> {
    const data = await apiJson<{ produto: Produto }>('/produtos', { method: 'POST', body: JSON.stringify(payload) })
    return data.produto
  },

  async update(id: string, payload: Partial<Produto>): Promise<Produto> {
    const data = await apiJson<{ produto: Produto }>(`/produtos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.produto
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/produtos/${id}`, { method: 'DELETE' })
  },
}

// ── AGENDA ────────────────────────────────────────────────────────────────────
export const agendaApi = {
  async list(mes?: number, ano?: number): Promise<Evento[]> {
    const params = new URLSearchParams({ sync: 'false' })
    if (mes && ano) { params.set('mes', String(mes)); params.set('ano', String(ano)) }
    const data = await apiJson<{ eventos: Evento[] }>(`/agenda?${params.toString()}`)
    return data.eventos
  },

  async sync(): Promise<{ ok: boolean; result?: unknown }> {
    return apiJson<{ ok: boolean; result?: unknown }>('/agenda/sincronizar', { method: 'POST' })
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

  async addHistorico(payload: {
    pagamento_id?: string
    grupo_id?: string | null
    group_key?: string | null
    tipo_evento?: HistoricoFinanceiro['tipo_evento']
    titulo: string
    descricao?: string
    valor?: number
    data_evento?: string
    forma_pagamento?: string
    saldo_anterior?: number
    saldo_posterior?: number
    metadata?: Record<string, unknown>
    referencia?: Partial<Pagamento> & { valor_parcela?: number; valor_original?: number }
  }): Promise<HistoricoFinanceiro> {
    const data = await apiJson<{ historico: HistoricoFinanceiro }>('/pagamentos/historico', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return data.historico
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
    await apiJson(`/documentos/${id}`, { method: 'DELETE' })
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
  async addMembers(id: string, members: Array<string | { user_id: string; role_na_equipe?: 'membro' | 'sub_gestor' | 'gestor' }>): Promise<void> {
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
  async create(payload: { nome: string; email: string; role: 'admin' | 'gestor' | 'sub_gestor' | 'membro'; cargo?: string; senha?: string }): Promise<{ user: UserProfile; senha: string; senha_provisoria?: string }> {
    const data = await apiJson<{ user: UserProfile; senha: string; senha_provisoria?: string }>('/users', { method: 'POST', body: JSON.stringify(payload) })
    return data
  },

  async update(id: string, payload: { nome?: string; cargo?: string; role?: string; novoRole?: string; ativo?: boolean }): Promise<UserProfile> {
    const data = await apiJson<{ user: UserProfile }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.user
  },

  async uploadAvatar(id: string, file: File): Promise<UserProfile> {
    const formData = new FormData()
    formData.append('file', file)
    const data = await apiJson<{ user: UserProfile }>(`/users/${id}/avatar`, { method: 'POST', body: formData })
    return data.user
  },

  async removeAvatar(id: string): Promise<UserProfile> {
    const data = await apiJson<{ user: UserProfile }>(`/users/${id}/avatar`, { method: 'DELETE' })
    return data.user
  },

  async changePassword(id: string, payload: { senhaAtual?: string; novaSenha: string }): Promise<void> {
    await apiJson(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify(payload) })
  },

  async remove(id: string): Promise<void> {
    await apiJson(`/users/${id}`, { method: 'DELETE' })
  },

  async resetPassword(id: string): Promise<{ user: UserProfile; senha: string; senha_provisoria: string }> {
    return apiJson(`/users/${id}/reset-password`, { method: 'POST' })
  },

  async invite(payload: { nome?: string; email?: string; role?: 'admin' | 'gestor' | 'sub_gestor' | 'membro'; cargo?: string; senha?: string }): Promise<{ convite: any; link: string }> {
    return apiJson('/users/invite', { method: 'POST', body: JSON.stringify(payload) })
  },

  // Lista apenas os comandados diretos do sub_gestor autenticado
  async meusComandados(): Promise<UserProfile[]> {
    const data = await apiJson<{ users: UserProfile[] }>('/users/meus-comandados')
    return data.users
  },
}


// ── AUTOMAÇÕES CONFIGURÁVEIS ───────────────────────────────────────────────────
export type AutomacaoGatilho = 'tarefa_criada' | 'status_alterado' | 'prazo_vencendo' | 'checklist_concluido'
export type AutomacaoOperador = 'igual' | 'diferente' | 'contem' | 'vazio' | 'nao_vazio'
export type AutomacaoCampo = 'titulo' | 'status' | 'prioridade' | 'responsavel_id' | 'projeto_grupo_id' | 'status_anterior' | 'status_novo' | 'checklist_item_texto'
export type AutomacaoAcaoTipo = 'notificar_pessoa' | 'notificar_equipe' | 'mover_status' | 'adicionar_checklist' | 'webhook'
export type AutomacaoCondicao = { field: AutomacaoCampo; operator: AutomacaoOperador; value?: string }
export type AutomacaoAcao = { type: AutomacaoAcaoTipo; user_id?: string; equipe_id?: string; status?: string; texto?: string; url?: string }
export type AutomacaoRegra = {
  id: string
  org_id: string
  created_by: string
  name: string
  description: string | null
  trigger_type: AutomacaoGatilho
  conditions: { mode: 'AND' | 'OR'; items: AutomacaoCondicao[] }
  actions: AutomacaoAcao[]
  active: boolean
  created_at: string
  updated_at: string
}
export type AutomacaoPessoa = { id: string; nome: string; email: string; role: string }
export type AutomacaoEquipe = { id: string; nome: string; members_count: number }
export type AutomacaoAuditoria = {
  id: string
  event_id: string | null
  evento: string
  executado_em: string
  tempo_ms: number | null
  resultado: 'sucesso' | 'falha' | 'ignorado_duplicado'
  erro: string | null
  detalhe: Record<string, unknown> | null
}

export const automacoesApi = {
  async list(): Promise<AutomacaoRegra[]> {
    const data = await apiJson<{ regras: AutomacaoRegra[] }>('/automation/rules')
    return data.regras || []
  },
  async catalogo(): Promise<{ pessoas: AutomacaoPessoa[]; equipes: AutomacaoEquipe[] }> {
    return apiJson('/automation/rules/catalogo')
  },
  async auditoria(limit = 50): Promise<AutomacaoAuditoria[]> {
    const data = await apiJson<{ auditoria: AutomacaoAuditoria[] }>(`/automation/rules/auditoria?limit=${limit}`)
    return data.auditoria || []
  },
  async create(payload: { name: string; description?: string; trigger_type: AutomacaoGatilho; conditions: { mode: 'AND' | 'OR'; items: AutomacaoCondicao[] }; actions: AutomacaoAcao[]; active?: boolean }): Promise<AutomacaoRegra> {
    const data = await apiJson<{ regra: AutomacaoRegra }>('/automation/rules', { method: 'POST', body: JSON.stringify(payload) })
    return data.regra
  },
  async update(id: string, payload: Partial<{ name: string; description: string; trigger_type: AutomacaoGatilho; conditions: { mode: 'AND' | 'OR'; items: AutomacaoCondicao[] }; actions: AutomacaoAcao[]; active: boolean }>): Promise<AutomacaoRegra> {
    const data = await apiJson<{ regra: AutomacaoRegra }>(`/automation/rules/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return data.regra
  },
  async deactivate(id: string): Promise<void> {
    await apiJson(`/automation/rules/${id}`, { method: 'DELETE' })
  },
}
