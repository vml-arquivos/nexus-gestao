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

  const prioridadeRaw = text(body.prioridade || tarefa.prioridade).toLowerCase()
  const prioridade = ['baixa', 'media', 'alta'].includes(prioridadeRaw)
    ? prioridadeRaw as DestravaTaskInput['prioridade']
    : 'media'
  const acaoRecomendada = text(tarefa.acao_recomendada || metadataOriginal.acao_recomendada)
  const checklist = body.checklist ?? (acaoRecomendada ? [{ texto: acaoRecomendada, feito: false }] : [])
  const idempotencyKey = text(body.idempotency_key || body.idempotencyKey) || null
  const pendenciaId = text(tarefa.id || metadataOriginal.pendencia_id)
  const moduloOrigem = text(tarefa.modulo_origem || metadataOriginal.modulo_origem)

  return {
    titulo: text(body.titulo || tarefa.titulo),
    descricao: text(body.descricao || tarefa.descricao) || null,
    data: text(body.data) || null,
    prazo: text(body.prazo || tarefa.prazo) || null,
    externalId: text(body.external_id || empresa.id),
    externalType: text(body.external_type) || 'empresa',
    externalName: text(body.external_name || empresa.razao_social),
    prioridade,
    checklist,
    observacao: text(body.obs) || null,
    sourceUrl: text(body.source_url || contexto.link_empresa || contexto.link_modulo) || null,
    idempotencyKey,
    criadoPorEmail: text(body.criado_por_email) || null,
    criadoPorNome: text(body.criado_por_nome || body.destrava_colaborador_nome) || null,
    destravaColaboradorId: text(body.destrava_colaborador_id) || null,
    responsavelEmail: text(body.responsavel_email) || null,
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
