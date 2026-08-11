import crypto from 'crypto'

export interface DestravaTaskInput {
  titulo: string
  descricao: string | null
  data: string | null
  prazo: string | null
  externalId: string
  externalType: string
  externalName: string
  prioridade: 'baixa' | 'media' | 'alta'
  checklist: unknown
  observacao: string | null
  sourceUrl: string | null
  idempotencyKey: string | null
  criadoPorEmail: string | null
  criadoPorNome: string | null
  destravaColaboradorId: string | null
  responsavelEmail: string | null
  cnpj: string | null
  metadata: Record<string, unknown>
  contextoTipo: 'empresa' | 'pessoa_fisica'
  lembreteDiarioAteAprovacao: boolean
  pontuacaoEscopo: 'tarefa' | 'subtarefas'
  contaRanking: boolean
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Compatibilidade bilateral: aceita o contrato plano atual e o formato
 * aninhado enviado por versões anteriores do Destrava. Assim os sistemas
 * podem ser implantados em momentos diferentes sem quebrar a integração.
 */
export function normalizeDestravaTaskInput(raw: unknown): DestravaTaskInput {
  const body = objectValue(raw)
  const tarefa = objectValue(body.tarefa)
  const empresa = objectValue(body.empresa)
  const contexto = objectValue(body.contexto)
  const metadataOriginal = objectValue(body.metadata)

  // Todos os emissores (tela do Nexus, webhook atual e versões anteriores do
  // Destrava) terminam no mesmo modelo canônico. Os fallbacks abaixo não
  // mudam a precedência do contrato plano; apenas promovem campos que versões
  // antigas enviavam dentro de `tarefa`/`contexto`.
  const checklistOriginal = body.checklist
    ?? tarefa.checklist
    ?? tarefa.subtarefas
    ?? tarefa.itens
    ?? tarefa.acoes

  const prioridadeRaw = text(body.prioridade || tarefa.prioridade).toLowerCase()
  const prioridade = ['baixa', 'media', 'alta'].includes(prioridadeRaw)
    ? prioridadeRaw as DestravaTaskInput['prioridade']
    : 'media'
  const acaoRecomendada = text(tarefa.acao_recomendada || metadataOriginal.acao_recomendada)
  const checklist = checklistOriginal ?? (acaoRecomendada ? [{ texto: acaoRecomendada, feito: false }] : [])
  const idempotencyKey = text(body.idempotency_key || body.idempotencyKey) || null
  const pendenciaId = text(tarefa.id || metadataOriginal.pendencia_id)
  const moduloOrigem = text(tarefa.modulo_origem || metadataOriginal.modulo_origem)
  const externalType = text(body.external_type || empresa.tipo || contexto.tipo) || 'empresa'
  const pontuacaoEscopoRaw = text(body.pontuacao_escopo || body.pontuacao_tipo || tarefa.pontuacao_escopo || metadataOriginal.nexus_pontuacao_escopo).toLowerCase()
  const pontuacaoEscopo = ['subtarefa', 'subtarefas', 'checklist', 'checklists'].includes(pontuacaoEscopoRaw)
    ? 'subtarefas' as const
    : 'tarefa' as const

  return {
    titulo: text(body.titulo || tarefa.titulo),
    descricao: text(body.descricao || tarefa.descricao) || null,
    data: text(body.data || tarefa.data) || null,
    prazo: text(body.prazo || tarefa.prazo || tarefa.data_limite) || null,
    externalId: text(body.external_id || empresa.id),
    externalType,
    externalName: text(body.external_name || empresa.razao_social),
    prioridade,
    checklist,
    observacao: text(body.obs || body.observacao || tarefa.obs || tarefa.observacao) || null,
    sourceUrl: text(body.source_url || contexto.link_empresa || contexto.link_modulo) || null,
    idempotencyKey,
    criadoPorEmail: text(body.criado_por_email || tarefa.criado_por_email) || null,
    criadoPorNome: text(body.criado_por_nome || body.destrava_colaborador_nome) || null,
    destravaColaboradorId: text(body.destrava_colaborador_id) || null,
    responsavelEmail: text(body.responsavel_email || tarefa.responsavel_email) || null,
    cnpj: text(body.cnpj || empresa.cnpj) || null,
    metadata: {
      ...metadataOriginal,
      contrato: text(metadataOriginal.contrato) || (tarefa.titulo ? 'destrava.nexus.tarefa.v1' : 'destrava.nexus.tarefa.v2'),
      idempotency_key: idempotencyKey,
      pendencia_id: pendenciaId || null,
      modulo_origem: moduloOrigem || null,
      categoria: text(tarefa.categoria || metadataOriginal.categoria) || null,
      acao_recomendada: acaoRecomendada || null,
      origem_payload_legado: tarefa.titulo ? body : undefined,
    },
    contextoTipo: ['pessoa_fisica', 'pf', 'cliente_pf', 'clientes_pf'].includes(externalType.toLowerCase()) ? 'pessoa_fisica' : 'empresa',
    lembreteDiarioAteAprovacao: Boolean(body.lembrete_diario_ate_aprovacao ?? tarefa.lembrete_diario_ate_aprovacao),
    pontuacaoEscopo,
    contaRanking: (body.conta_ranking ?? tarefa.conta_ranking) !== false,
  }
}

export function buildDestravaTaskExternalKey(input: DestravaTaskInput): string {
  if (input.idempotencyKey) {
    const hashEvento = crypto.createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)
    return `destrava:event:${hashEvento}`
  }
  const hashConteudo = crypto
    .createHash('sha256')
    .update(`${input.titulo}|${input.prazo || ''}|${input.descricao || ''}`)
    .digest('hex')
    .slice(0, 16)
  return `destrava:${input.externalType}:${input.externalId}:${hashConteudo}`
}

/**
 * Retorna a organização somente quando todas as evidências válidas apontam
 * para o mesmo destino. É propositalmente conservador: em caso de conflito,
 * nunca escolhe uma empresa arbitrariamente.
 */
export function selectUnambiguousOrgId(values: unknown[]): string | null {
  const ids = new Set(
    values
      .map(value => String(value || '').trim())
      .filter(Boolean),
  )
  return ids.size === 1 ? Array.from(ids)[0] : null
}
