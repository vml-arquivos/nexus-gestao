import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import { requireWebhookSignature } from '../middleware/webhookAuth'
import { v4 as uuidv4 } from 'uuid'
import pool, { query, queryOne } from '../db/pool'
import {
  buildDestravaTaskExternalKey,
  normalizeDestravaTaskInput,
  selectUnambiguousOrgId,
} from '../lib/destravaTaskContract'
import {
  normalizeChecklistRecurrence,
  normalizeRecurrenceMonthday,
  normalizeRecurrenceWeekday,
} from '../lib/checklistRecurrence'
import { resolveTaskListTitle } from '../lib/taskContextTitle'
import { creatorCanEnableTaskRanking, removeChecklistScoringForMember } from '../lib/taskCreationPolicy'
import { resolverNotificacoesRecorrentesPorReferencia } from '../lib/notifHelper'

const router = Router()

const VALID_PRIORIDADES = ['baixa', 'media', 'alta'] as const

export type NexusUser = {
  id: string
  org_id: string
  nome: string
  email: string
  role: string
}

function getIntegrationSecret(req: Request): string {
  const direct = req.header('x-integration-secret') || req.header('x-nexus-integration-secret') || ''
  const auth = req.header('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return direct.trim()
}

export function requireIntegrationSecret(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET || process.env.INTEGRATION_SECRET || ''
  if (!configured) {
    res.status(503).json({ error: 'Integração Destrava/Nexus não configurada no Nexus.' })
    return
  }
  if (getIntegrationSecret(req) !== configured) {
    res.status(401).json({ error: 'Chave de integração inválida.' })
    return
  }
  next()
}

export type IntegrationChecklistItem = {
  id: string
  texto: string
  feito: boolean
  descricao?: string
  data?: string
  responsavel_email?: string
  responsavel_id?: string
  responsavel_nome?: string
  dificuldade?: string
  pontuacao?: number
  recorrencia?: 'unica' | 'diaria' | 'semanal' | 'mensal'
  recorrencia_dia_semana?: number
  recorrencia_dia_mes?: number
}

type IntegrationChecklistDifficulty = 'nivel_1' | 'nivel_2' | 'nivel_3' | 'nivel_4' | 'nivel_5'

const INTEGRATION_DIFFICULTY_POINTS: Record<IntegrationChecklistDifficulty, number> = {
  nivel_1: 0,
  nivel_2: 1,
  nivel_3: 3,
  nivel_4: 5,
  nivel_5: 20,
}

const INTEGRATION_OFFICIAL_SCORES = [0, 1, 3, 5, 20] as const

/**
 * A integração usa exatamente a mesma escala oficial da tela de tarefas.
 * Se um cliente antigo informar apenas pontos, convertemos para o valor
 * oficial mais próximo. Valores arbitrários nunca entram no ranking.
 */
export function normalizeIntegrationChecklistScore(input: {
  dificuldade?: unknown
  pontuacao?: unknown
}): { dificuldade: IntegrationChecklistDifficulty; pontuacao: number } | null {
  const rawDifficulty = String(input.dificuldade || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_')
  const aliases: Record<string, IntegrationChecklistDifficulty> = {
    nivel_1: 'nivel_1', n1: 'nivel_1', iniciante: 'nivel_1', leve: 'nivel_1', basico: 'nivel_1',
    nivel_2: 'nivel_2', n2: 'nivel_2', facil: 'nivel_2',
    nivel_3: 'nivel_3', n3: 'nivel_3', medio: 'nivel_3', normal: 'nivel_3',
    nivel_4: 'nivel_4', n4: 'nivel_4', dificil: 'nivel_4',
    nivel_5: 'nivel_5', n5: 'nivel_5', hard: 'nivel_5', super_dificil: 'nivel_5', nivel_hard: 'nivel_5',
  }

  const hasDifficulty = Boolean(rawDifficulty)
  const hasScore = input.pontuacao !== undefined && input.pontuacao !== null && String(input.pontuacao).trim() !== ''
  if (!hasDifficulty && !hasScore) return null

  const byDifficulty = aliases[rawDifficulty]
  if (byDifficulty) return { dificuldade: byDifficulty, pontuacao: INTEGRATION_DIFFICULTY_POINTS[byDifficulty] }

  const parsed = Number(typeof input.pontuacao === 'string' ? input.pontuacao.replace(',', '.') : input.pontuacao)
  const bounded = Number.isFinite(parsed) ? Math.max(0, Math.min(20, parsed)) : 3
  const official = INTEGRATION_OFFICIAL_SCORES.reduce(
    (closest, candidate) => Math.abs(candidate - bounded) < Math.abs(closest - bounded) ? candidate : closest,
    INTEGRATION_OFFICIAL_SCORES[0],
  )
  const difficulty = (Object.entries(INTEGRATION_DIFFICULTY_POINTS)
    .find(([, points]) => points === official)?.[0] || 'nivel_3') as IntegrationChecklistDifficulty
  return { dificuldade: difficulty, pontuacao: official }
}

export function normalizeChecklistItems(value: unknown): IntegrationChecklistItem[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('\n').map(line => line.trim()).filter(Boolean)
      : []

  // FIX56: nenhuma tarefa real precisa de milhares de itens de checklist.
  // Corta em 300 como barreira contra payload malformado/corrompido vindo
  // do webhook do Destrava — a mesma classe de dado que travou a recorrência.
  const LIMITE_CHECKLIST = 300
  const limitado = raw.length > LIMITE_CHECKLIST ? raw.slice(0, LIMITE_CHECKLIST) : raw
  if (raw.length > LIMITE_CHECKLIST) {
    console.error(`[INTEGRACOES] Checklist recebido com ${raw.length} itens (limite ${LIMITE_CHECKLIST}); truncando.`)
  }

  const normalizado = limitado
    .map((item: any) => {
      if (typeof item === 'string') return { id: uuidv4(), texto: item.trim(), feito: false }
      const recorrencia = normalizeChecklistRecurrence(item?.recorrencia)
      const diaSemana = normalizeRecurrenceWeekday(item?.recorrencia_dia_semana)
      const diaMes = normalizeRecurrenceMonthday(item?.recorrencia_dia_mes)
      const scoring = normalizeIntegrationChecklistScore(item || {})
      return {
        id: typeof item?.id === 'string' && item.id ? item.id : uuidv4(),
        texto: String(item?.texto || item?.label || item?.title || '').trim(),
        feito: Boolean(item?.feito),
        ...(String(item?.descricao || '').trim() ? { descricao: String(item.descricao).trim() } : {}),
        ...(String(item?.data || item?.prazo || '').trim() ? { data: String(item.data || item.prazo).trim() } : {}),
        ...(String(item?.responsavel_email || '').trim() ? { responsavel_email: String(item.responsavel_email).trim().toLowerCase() } : {}),
        ...(String(item?.responsavel_id || '').trim() ? { responsavel_id: String(item.responsavel_id).trim() } : {}),
        ...(scoring || {}),
        recorrencia,
        ...(recorrencia === 'semanal' && diaSemana !== undefined ? { recorrencia_dia_semana: diaSemana } : {}),
        ...(recorrencia === 'mensal' && diaMes !== undefined ? { recorrencia_dia_mes: diaMes } : {}),
      }
    })

  // Somente o mesmo ID representa o mesmo item. Texto igual com membro, data
  // ou descrição diferentes são ações distintas e jamais podem ser fundidas.
  const vistos = new Set<string>()
  const semDuplicata = normalizado.filter((item) => {
    const chave = item.id
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
  if (semDuplicata.length !== normalizado.length) {
    console.error(`[INTEGRACOES] Checklist com IDs duplicados; reduzido de ${normalizado.length} para ${semDuplicata.length}.`)
  }

  return semDuplicata
    .filter(item => item.texto)
}

export async function findActiveUserByEmail(email?: string | null, orgId?: string | null): Promise<NexusUser | null> {
  if (!email || !email.trim()) return null
  if (orgId) {
    return queryOne<NexusUser>(
      `SELECT id, org_id, nome, email, role
         FROM profiles
        WHERE lower(email) = lower($1)
          AND org_id = $2
          AND COALESCE(ativo, TRUE) = TRUE
        LIMIT 1`,
      [email.trim(), orgId]
    )
  }
  return queryOne<NexusUser>(
    `SELECT id, org_id, nome, email, role
       FROM profiles
      WHERE lower(email) = lower($1)
        AND COALESCE(ativo, TRUE) = TRUE
        AND (
          SELECT COUNT(DISTINCT p2.org_id)
            FROM profiles p2
           WHERE lower(p2.email) = lower($1)
             AND COALESCE(p2.ativo, TRUE) = TRUE
        ) = 1
      LIMIT 1`,
    [email.trim()]
  )
}

export async function findActiveUserById(id?: string | null, orgId?: string | null): Promise<NexusUser | null> {
  const normalizedId = String(id || '').trim()
  if (!normalizedId || !orgId) return null
  // Comparação por texto evita erro 500 do PostgreSQL caso um cliente antigo
  // envie algo que não seja UUID. O vínculo com org_id e ativo é obrigatório.
  return queryOne<NexusUser>(
    `SELECT id, org_id, nome, email, role
       FROM profiles
      WHERE id::text = $1
        AND org_id = $2
        AND COALESCE(ativo, TRUE) = TRUE
      LIMIT 1`,
    [normalizedId, orgId],
  )
}

async function findPreferredActiveUserByOrg(orgId: string): Promise<NexusUser | null> {
  return queryOne<NexusUser>(
    `SELECT id, org_id, nome, email, role
       FROM profiles
      WHERE org_id = $1
        AND COALESCE(ativo, TRUE) = TRUE
      ORDER BY CASE role WHEN 'dev' THEN 1 WHEN 'admin' THEN 2 WHEN 'gestor' THEN 3 ELSE 4 END, created_at ASC
      LIMIT 1`,
    [orgId],
  )
}

/**
 * Ambientes já integrados não devem depender de uma variável nova apenas
 * porque o banco também contém uma segunda organização. Quando o payload
 * legado não traz e-mail, inferimos a organização por vínculos que o próprio
 * Nexus já gravou para o mesmo cliente do Destrava. Se não houver vínculo
 * direto, aceitamos o histórico global somente quando TODO ele aponta para
 * uma única organização. Qualquer ambiguidade continua sendo rejeitada.
 */
async function inferExistingDestravaOrgId(payload: any): Promise<string | null> {
  const externalId = String(payload?.externalId || payload?.external_id || '').trim()

  const readOrgIds = async (sql: string, params: unknown[] = []) =>
    query<{ org_id: string }>(sql, params)
      .then(rows => rows.map(row => row.org_id).filter(Boolean))
      .catch(() => [] as string[])

  if (externalId) {
    const directSources = await Promise.all([
      readOrgIds(
        `SELECT DISTINCT org_id FROM nexus_external_links
          WHERE source_system = 'destrava' AND external_id = $1
          LIMIT 3`,
        [externalId],
      ),
      readOrgIds(
        `SELECT DISTINCT org_id FROM tarefas
          WHERE origem_sistema = 'destrava' AND origem_id = $1
          LIMIT 3`,
        [externalId],
      ),
      readOrgIds(
        `SELECT DISTINCT org_id FROM destrava_empresas_cache
          WHERE external_id = $1
          LIMIT 3`,
        [externalId],
      ),
    ])
    const directIds = directSources.flat()
    if (directIds.length) return selectUnambiguousOrgId(directIds)
  }

  const historicalSources = await Promise.all([
    readOrgIds(
      `SELECT DISTINCT org_id FROM nexus_external_links
        WHERE source_system = 'destrava'
        LIMIT 3`,
    ),
    readOrgIds(
      `SELECT DISTINCT org_id FROM tarefas
        WHERE origem_sistema = 'destrava'
        LIMIT 3`,
    ),
    readOrgIds(
      `SELECT DISTINCT org_id FROM destrava_empresas_cache
        LIMIT 3`,
    ),
  ])
  return selectUnambiguousOrgId(historicalSources.flat())
}

export async function resolveIntegrationUser(payload: any): Promise<NexusUser | null> {
  const configuredOrgId = String(process.env.NEXUS_DESTRAVA_ORG_ID || '').trim() || null
  const candidates = [
    payload?.criadoPorEmail,
    payload?.responsavelEmail,
    payload?.criado_por_email,
    payload?.responsavel_email,
    process.env.NEXUS_DESTRAVA_DEFAULT_USER_EMAIL,
  ].filter(Boolean)

  // Configuração explícita continua tendo prioridade. Sem ela, um e-mail que
  // identifique inequivocamente um perfil ativo mantém a compatibilidade
  // histórica e já resolve a organização.
  for (const email of candidates) {
    const user = await findActiveUserByEmail(String(email), configuredOrgId)
    if (user) return user
  }

  if (process.env.NEXUS_DESTRAVA_DEFAULT_USER_ID) {
    const user = await queryOne<NexusUser>(
      `SELECT id, org_id, nome, email, role
         FROM profiles
        WHERE id = $1
          AND COALESCE(ativo, TRUE) = TRUE
          AND ($2::uuid IS NULL OR org_id = $2::uuid)
        LIMIT 1`,
      [process.env.NEXUS_DESTRAVA_DEFAULT_USER_ID, configuredOrgId]
    )
    if (user) return user
  }

  const resolvedOrgId = configuredOrgId || await inferExistingDestravaOrgId(payload)
  if (resolvedOrgId) {
    // O e-mail pode existir no payload, mas ter sido considerado ambíguo sem
    // contexto de organização. Tenta novamente dentro do vínculo já conhecido.
    for (const email of candidates) {
      const user = await findActiveUserByEmail(String(email), resolvedOrgId)
      if (user) return user
    }
    const user = await findPreferredActiveUserByOrg(resolvedOrgId)
    if (user) return user
  }

  // Só existe fallback seguro quando todos os usuários ativos pertencem a uma
  // única organização. Em ambiente multiempresa, exige mapeamento explícito.
  return queryOne<NexusUser>(
    `SELECT id, org_id, nome, email, role
       FROM profiles
      WHERE COALESCE(ativo, TRUE) = TRUE
        AND (
          SELECT COUNT(DISTINCT p2.org_id)
            FROM profiles p2
           WHERE COALESCE(p2.ativo, TRUE) = TRUE
        ) = 1
      ORDER BY CASE role WHEN 'dev' THEN 1 WHEN 'admin' THEN 2 WHEN 'gestor' THEN 3 ELSE 4 END, created_at ASC
      LIMIT 1`
  )
}

export async function addHistorico(orgId: string, tarefaId: string, userId: string, acao: string, observacao?: string | null) {
  await query(
    `INSERT INTO tarefas_historico (org_id, tarefa_id, user_id, acao, status_anterior, status_novo, observacao)
     VALUES ($1,$2,$3,$4,NULL,'pendente',$5)`,
    [orgId, tarefaId, userId, acao, observacao || null]
  ).catch(async () => {
    await query(
      `INSERT INTO tarefa_historico (org_id, tarefa_id, usuario_id, acao, dados)
       VALUES ($1,$2,$3,$4,$5)`,
      [orgId, tarefaId, userId, acao, JSON.stringify({ observacao: observacao || null })]
    ).catch(() => {})
  })
}


function destravaBaseUrl(): string {
  return String(process.env.DESTRAVA_API_URL || process.env.DESTRAVA_INTERNAL_API_URL || process.env.DESTRAVA_PUBLIC_URL || '').replace(/\/$/, '')
}

function destravaSecret(): string {
  return String(process.env.NEXUS_INTEGRATION_SECRET || process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET || process.env.DESTRAVA_INTEGRATION_SECRET || process.env.INTEGRATION_SECRET || '').trim()
}

let destravaCacheSchemaPromise: Promise<void> | null = null
async function ensureDestravaCacheSchema() {
  if (!destravaCacheSchemaPromise) destravaCacheSchemaPromise = query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    CREATE TABLE IF NOT EXISTS destrava_empresas_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'empresa',
      external_key TEXT,
      nome TEXT NOT NULL,
      documento TEXT,
      email TEXT,
      telefone TEXT,
      status TEXT,
      source_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_updated_at TIMESTAMPTZ,
      sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ativo BOOLEAN NOT NULL DEFAULT TRUE
    );
    ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'empresa';
    ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS external_key TEXT;
    UPDATE destrava_empresas_cache
       SET tipo = CASE
         WHEN lower(COALESCE(NULLIF(btrim(tipo), ''), 'empresa')) IN ('pf','cliente','clientes','pessoa fisica','pessoa_fisica')
           THEN 'pessoa_fisica'
         ELSE 'empresa'
       END;
    UPDATE destrava_empresas_cache
       SET external_key = tipo || ':' || external_id
     WHERE external_key IS NULL OR btrim(external_key) = '';
    ALTER TABLE destrava_empresas_cache ALTER COLUMN tipo SET DEFAULT 'empresa';
    ALTER TABLE destrava_empresas_cache ALTER COLUMN tipo SET NOT NULL;
    ALTER TABLE destrava_empresas_cache ALTER COLUMN external_key SET NOT NULL;
    DO $$
    DECLARE c RECORD;
    BEGIN
      FOR c IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'destrava_empresas_cache'::regclass
           AND contype = 'u'
           AND pg_get_constraintdef(oid) = 'UNIQUE (org_id, external_id)'
      LOOP
        EXECUTE format('ALTER TABLE destrava_empresas_cache DROP CONSTRAINT %I', c.conname);
      END LOOP;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_destrava_cache_org_external_key ON destrava_empresas_cache(org_id, external_key);
    CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_nome ON destrava_empresas_cache(org_id, lower(nome));
    CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_ativo ON destrava_empresas_cache(org_id, ativo, sincronizado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_destrava_cache_org_tipo_nome ON destrava_empresas_cache(org_id, tipo, lower(nome));
    CREATE INDEX IF NOT EXISTS idx_destrava_cache_busca_trgm
      ON destrava_empresas_cache USING GIN (
        lower(COALESCE(nome,'') || ' ' || COALESCE(documento,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')) gin_trgm_ops
      );
  `).then(() => undefined).catch(err => { destravaCacheSchemaPromise = null; throw err })
  return destravaCacheSchemaPromise
}

async function callDestrava(path: string, options: RequestInit = {}) {
  const base = destravaBaseUrl()
  const secret = destravaSecret()
  if (!base || !secret) {
    const err = new Error('Integração com Destrava não configurada.') as Error & { status?: number }
    err.status = 503
    throw err
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-nexus-integration-secret': secret,
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(10_000),
  })
  const rawBody = await res.text()
  let data: any
  try {
    data = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    // Resposta não é JSON válido (ex.: gateway/proxy retornou HTML de erro com
    // status 200, timeout truncando o corpo, etc.). Antes isso virava um {}
    // silencioso e a sincronização interpretava como "sem mais páginas",
    // truncando o catálogo sem avisar. Agora é sempre um erro explícito.
    const err = new Error(`Resposta inválida da Destrava em ${path} (não é JSON).`) as Error & { status?: number }
    err.status = 502
    throw err
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status} na integração Destrava.`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data
}


router.post('/destrava/empresas/sincronizar', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDestravaCacheSchema()
    const orgId = req.user!.orgId
    const pageSize = 500
    let page = 1
    let hasMore = true
    let totalReportadoPelaDestrava: number | null = null
    const items: any[] = []

    while (hasMore) {
      const data = await callDestrava(`/api/nexus/catalogo?tipo=todos&q=&limit=${pageSize}&page=${page}`)
      if (!data || typeof data !== 'object' || !Array.isArray(data.items) || !data.pagination || typeof data.pagination !== 'object') {
        throw new Error(`Resposta inesperada da Destrava na página ${page} da sincronização (formato inválido). Sincronização interrompida sem alterar o catálogo anterior.`)
      }
      const batch = data.items
      items.push(...batch)
      if (totalReportadoPelaDestrava === null && Number.isFinite(Number(data.pagination.total))) {
        totalReportadoPelaDestrava = Number(data.pagination.total)
      }
      hasMore = Boolean(data.pagination.has_more)
      page += 1
      if (page > 10000) throw new Error('Sincronização interrompida por limite de segurança.')
    }

    if (totalReportadoPelaDestrava !== null && items.length < totalReportadoPelaDestrava) {
      throw new Error(
        `Sincronização incompleta: a Destrava reportou ${totalReportadoPelaDestrava} registro(s) no total, mas apenas ${items.length} foram recebidos. `
        + 'Catálogo anterior preservado sem alterações — tente sincronizar novamente.',
      )
    }

    const syncRunId = uuidv4()
    let validos = 0
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const raw of items) {
        const externalId = String(raw?.id || raw?.external_id || '').trim()
        const tipo = String(raw?.tipo || raw?.entidade_tipo || 'empresa').trim() === 'pessoa_fisica' ? 'pessoa_fisica' : 'empresa'
        const externalKey = `${tipo}:${externalId}`
        const nome = String(raw?.nome || raw?.razao_social || raw?.name || '').trim()
        if (!externalId || !nome) continue
        validos += 1
        const meta = { ...(raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : raw), sync_run_id: syncRunId }
        await client.query(`INSERT INTO destrava_empresas_cache
          (org_id,external_id,tipo,external_key,nome,documento,email,telefone,status,source_url,metadata,source_updated_at,sincronizado_em,ativo)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),TRUE)
          ON CONFLICT (org_id,external_key) DO UPDATE SET external_id=EXCLUDED.external_id, tipo=EXCLUDED.tipo,
          nome=EXCLUDED.nome, documento=EXCLUDED.documento, email=EXCLUDED.email, telefone=EXCLUDED.telefone,
          status=EXCLUDED.status, source_url=EXCLUDED.source_url, metadata=EXCLUDED.metadata,
          source_updated_at=EXCLUDED.source_updated_at, sincronizado_em=NOW(), ativo=TRUE`,
          [orgId,externalId,tipo,externalKey,nome,raw?.documento || null,raw?.email || null,raw?.telefone || null,raw?.status || null,raw?.url || null,JSON.stringify(meta),raw?.updated_at || null])
      }
      await client.query(`UPDATE destrava_empresas_cache
        SET ativo=FALSE, sincronizado_em=NOW()
        WHERE org_id=$1 AND COALESCE(metadata->>'sync_run_id','') <> $2`, [orgId, syncRunId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }

    res.json({
      ok: true,
      sincronizadas: validos,
      total_recebido: items.length,
      total_reportado_destrava: totalReportadoPelaDestrava,
      paginas: page - 1,
      sincronizado_em: new Date().toISOString(),
    })
  } catch (err:any) {
    console.error('[INTEGRACOES] Erro sincronização catálogo Destrava:',err)
    res.status(err?.status || 500).json({error:err?.message || 'Erro ao sincronizar empresas e pessoas físicas.'})
  }
})

router.get('/destrava/empresas', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDestravaCacheSchema()
    const orgId = req.user!.orgId
    const q = String(req.query.q || '').trim()
    const tipoParam = String(req.query.tipo || '').trim().toLowerCase()
    const tipo = tipoParam === 'pessoa_fisica' || tipoParam === 'pf'
      ? 'pessoa_fisica'
      : tipoParam === 'empresa' || tipoParam === 'pj'
        ? 'empresa'
        : ''
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)))
    const page = Math.max(1, Math.floor(Number(req.query.page || 1)))
    const offset = (page - 1) * limit
    const params = [orgId, tipo, q, limit, offset]
    const filtro = `org_id=$1 AND ativo=TRUE
      AND ($2='' OR tipo=$2)
      AND ($3='' OR lower(
        COALESCE(nome,'') || ' ' || COALESCE(documento,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')
      ) LIKE '%' || lower($3) || '%')`
    const empresas = await query<any>(`SELECT external_id AS id, tipo, nome, documento, email, telefone, status, source_url AS url, metadata, sincronizado_em
      FROM destrava_empresas_cache
      WHERE ${filtro}
      ORDER BY lower(nome), external_id
      LIMIT $4 OFFSET $5`, params)
    const info = await queryOne<any>(`SELECT
        COUNT(*) FILTER (WHERE ($2='' OR tipo=$2) AND ($3='' OR lower(
          COALESCE(nome,'') || ' ' || COALESCE(documento,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')
        ) LIKE '%' || lower($3) || '%'))::int AS total,
        COUNT(*)::int AS total_catalogo,
        MAX(sincronizado_em) AS ultima_sincronizacao
      FROM destrava_empresas_cache
      WHERE org_id=$1 AND ativo=TRUE`, [orgId, tipo, q])
    const total = Number(info?.total || 0)
    const totalCatalogo = Number(info?.total_catalogo || 0)
    res.json({
      items: empresas.map(e => ({ ...e, tipo: e.tipo || 'empresa' })),
      total,
      total_catalogo: totalCatalogo,
      ultima_sincronizacao: info?.ultima_sincronizacao || null,
      page,
      limit,
      has_more: offset + empresas.length < total,
    })
  } catch(err) { console.error('[INTEGRACOES] Erro cache empresas:',err); res.status(500).json({error:'Erro ao pesquisar clientes sincronizados da Destrava.'}) }
})

// Rotas autenticadas para o próprio Nexus consultar o catálogo do Destrava sem expor a chave no navegador.
router.get('/destrava/catalogo', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const tipo = String(req.query.tipo || 'empresa')
    const q = String(req.query.q || '')
    const limit = String(req.query.limit || '20')
    const params = new URLSearchParams({ tipo, q, limit })
    const data = await callDestrava(`/api/nexus/catalogo?${params.toString()}`)
    res.json(data)
  } catch (err: any) {
    console.error('[INTEGRACOES] Erro ao buscar catálogo Destrava:', err)
    res.status(err?.status || 500).json({ error: err?.message || 'Erro ao buscar dados do Destrava.' })
  }
})

router.get('/destrava/empresa/:id/resumo', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await callDestrava(`/api/nexus/empresas/${encodeURIComponent(req.params.id)}/resumo`)
    res.json(data)
  } catch (err: any) {
    console.error('[INTEGRACOES] Erro ao buscar empresa Destrava:', err)
    res.status(err?.status || 500).json({ error: err?.message || 'Erro ao buscar empresa do Destrava.' })
  }
})

router.use(requireIntegrationSecret)

router.get('/destrava/status', async (_req: Request, res: Response): Promise<void> => {
  res.json({ ok: true, sistema: 'nexus', integracao: 'destrava', timestamp: new Date().toISOString() })
})

/**
 * Catálogo oficial de destinatários para o modal do Destrava.
 *
 * A chave da integração fica somente entre os backends. A organização é
 * resolvida com as mesmas regras conservadoras usadas na criação da tarefa,
 * e nenhuma equipe ou pessoa de outra organização pode ser retornada.
 * Não há filtro por cargo: dev, admin, gestor, subgestor e membro ativos são
 * selecionáveis, inclusive o próprio gestor.
 */
router.post('/destrava/destinatarios', async (req: Request, res: Response): Promise<void> => {
  try {
    const creator = await resolveIntegrationUser(req.body || {})
    if (!creator) {
      res.status(400).json({
        error: 'Não foi possível determinar com segurança a organização dos destinatários. Verifique o vínculo da empresa ou configure NEXUS_DESTRAVA_ORG_ID.',
      })
      return
    }

    const orgId = creator.org_id
    const [members, teams, links] = await Promise.all([
      query<any>(
        `SELECT id, nome, email, role, cargo
           FROM profiles
          WHERE org_id = $1
            AND COALESCE(ativo, TRUE) = TRUE
          ORDER BY CASE role
            WHEN 'dev' THEN 1 WHEN 'admin' THEN 2 WHEN 'gestor' THEN 3
            WHEN 'sub_gestor' THEN 4 ELSE 5 END,
            lower(nome), lower(email)`,
        [orgId],
      ),
      query<any>(
        `SELECT id, nome, descricao
           FROM equipes
          WHERE org_id = $1
          ORDER BY lower(nome), id`,
        [orgId],
      ),
      query<any>(
        `SELECT em.equipe_id, COALESCE(em.user_id, em.profile_id) AS membro_id
           FROM equipes_membros em
           JOIN equipes e ON e.id = em.equipe_id AND e.org_id = $1
           JOIN profiles p
             ON p.id = COALESCE(em.user_id, em.profile_id)
            AND p.org_id = e.org_id
            AND COALESCE(p.ativo, TRUE) = TRUE
          WHERE COALESCE(em.ativo, TRUE) = TRUE`,
        [orgId],
      ).catch(() => []),
    ])

    const teamIdsByMember = new Map<string, string[]>()
    const memberIdsByTeam = new Map<string, string[]>()
    for (const link of links) {
      const memberId = String(link.membro_id || '')
      const teamId = String(link.equipe_id || '')
      if (!memberId || !teamId) continue
      teamIdsByMember.set(memberId, [...(teamIdsByMember.get(memberId) || []), teamId])
      memberIdsByTeam.set(teamId, [...(memberIdsByTeam.get(teamId) || []), memberId])
    }

    res.json({
      membros: members.map(member => ({
        id: member.id,
        nome: member.nome,
        email: member.email,
        role: member.role,
        cargo: member.cargo || null,
        equipe_ids: teamIdsByMember.get(String(member.id)) || [],
      })),
      equipes: teams.map(team => ({
        id: team.id,
        nome: team.nome,
        descricao: team.descricao || null,
        membro_ids: memberIdsByTeam.get(String(team.id)) || [],
      })),
      total_membros: members.length,
      total_equipes: teams.length,
      // Serve somente como sugestão visual. A escolha explícita do item
      // continua prevalecendo e é revalidada no POST da tarefa.
      responsavel_sugerido_id: members.some(member => member.id === creator.id) ? creator.id : null,
    })
  } catch (err) {
    console.error('[INTEGRACOES] Erro ao listar destinatários para o Destrava:', err)
    res.status(500).json({ error: 'Erro ao carregar equipes e membros do Nexus.' })
  }
})

// ── Workflow 2 (Acompanhamento Bancário): leitura/escrita direta de UMA tarefa ──
// Usadas pela tela de acompanhamento bancário do Destrava para renderizar e
// atualizar, em tempo real, a tarefa que vive no Nexus (system of record) --
// o Destrava nunca cria sua própria cópia da tarefa, só consome esta.
// POST em vez de GET de propósito: todo o transporte assinado do Automation
// Engine sempre envia um corpo JSON (mesmo vazio) para a verificação de
// assinatura ser consistente -- e `fetch()` no Node rejeita corpo em GET.
router.post('/destrava/tarefas/:id', requireWebhookSignature, async (req: Request, res: Response): Promise<void> => {
  try {
    const tarefa = await queryOne<any>(`SELECT * FROM tarefas WHERE id = $1`, [req.params.id])
    if (!tarefa) {
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }
    const historico = await query(
      `SELECT * FROM tarefas_historico WHERE tarefa_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.params.id]
    ).catch(() => [])
    const comentarios = await query(
      `SELECT * FROM tarefas_comentarios WHERE tarefa_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    ).catch(() => [])
    const anexos = await query(`SELECT * FROM tarefa_anexos WHERE tarefa_id = $1 ORDER BY created_at ASC`, [req.params.id]).catch(() => [])
    res.json({ tarefa, historico, comentarios, anexos })
  } catch (err) {
    console.error('[INTEGRACOES] Erro ao buscar tarefa para Destrava:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefa.' })
  }
})

router.patch('/destrava/tarefas/:id/checklist', requireWebhookSignature, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect()
  try {
    const { item_id, feito, executado_por_nome, executado_por_email } = req.body || {}
    if (!item_id || typeof feito !== 'boolean') {
      res.status(400).json({ error: 'item_id e feito (booleano) são obrigatórios.' })
      return
    }

    await client.query('BEGIN')
    const locked = await client.query(`SELECT * FROM tarefas WHERE id = $1 FOR UPDATE`, [req.params.id])
    const existing = locked.rows[0]
    if (!existing) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }

    const items = Array.isArray(existing.checklist) ? existing.checklist : []
    const index = items.findIndex((item: any) => String(item?.id || '') === String(item_id))
    if (index < 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Item do checklist não encontrado.' })
      return
    }

    items[index] = {
      ...items[index],
      feito,
      feito_por_destrava: executado_por_nome || executado_por_email || 'Destrava',
      enviado_em: new Date().toISOString(),
    }

    const updated = await client.query(
      `UPDATE tarefas SET checklist = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(items), req.params.id]
    )
    await client.query('COMMIT')

    await addHistorico(
      existing.org_id,
      req.params.id,
      existing.criado_por,
      feito ? 'item_concluido_destrava' : 'item_reaberto_destrava',
      `Executado no Destrava por ${executado_por_nome || executado_por_email || 'usuário'}.`
    )

    res.json({ tarefa: updated.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[INTEGRACOES] Erro ao atualizar checklist a partir do Destrava:', err)
    res.status(500).json({ error: 'Erro ao atualizar checklist.' })
  } finally {
    client.release()
  }
})

router.patch('/destrava/tarefas/:id/status', requireWebhookSignature, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, executado_por_nome, executado_por_email } = req.body || {}
    const validos = ['pendente', 'em_progresso', 'concluida', 'nao_concluida', 'cancelada']
    if (!validos.includes(status)) {
      res.status(400).json({ error: `Status inválido. Valores aceitos: ${validos.join(', ')}` })
      return
    }

    const existing = await queryOne<any>(`SELECT * FROM tarefas WHERE id = $1`, [req.params.id])
    if (!existing) {
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }

    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status = $1, data_conclusao = CASE WHEN $1 IN ('concluida','nao_concluida') THEN NOW() ELSE data_conclusao END, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    )

    await addHistorico(
      existing.org_id,
      req.params.id,
      existing.criado_por,
      status,
      `Status atualizado no Destrava por ${executado_por_nome || executado_por_email || 'usuário'}.`
    )

    if (status === 'concluida' || status === 'cancelada') {
      await resolverNotificacoesRecorrentesPorReferencia({
        orgId: existing.org_id,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      })
    }

    res.json({ tarefa })
  } catch (err) {
    console.error('[INTEGRACOES] Erro ao atualizar status a partir do Destrava:', err)
    res.status(500).json({ error: 'Erro ao atualizar status.' })
  }
})

router.get('/destrava/tarefas', async (req: Request, res: Response): Promise<void> => {
  try {
    let externalType = String(req.query.external_type || 'empresa').trim()
    const externalId = String(req.query.external_id || '').trim()
    // Normalize external type aliases. O Destrava renomeou "Empresas" para "Clientes PJ" no frontend,
    // porém a integração deve continuar funcionando. Quando recebermos cliente_pj ou seus variantes,
    // tratamos como empresa.
    const extLower = externalType.toLowerCase()
    if (['cliente_pj', 'clientes_pj', 'cliente-pj', 'clientes-pj'].includes(extLower)) {
      externalType = 'empresa'
    }
    if (!externalId) {
      res.status(400).json({ error: 'external_id é obrigatório.' })
      return
    }

    const tarefas = await query(
      `SELECT t.id, t.titulo, t.descricao, t.prazo, t.prioridade, t.status, t.status_gestor,
              t.responsavel_nome, t.origem_sistema, t.origem_tipo, t.origem_id, t.origem_nome,
              t.origem_url, t.created_at, t.updated_at
         FROM tarefas t
        WHERE t.origem_sistema = 'destrava'
          AND t.origem_id = $2
          AND (t.origem_tipo = $1 OR t.origem_tipo = 'cliente_pj' OR t.origem_tipo = 'clientes_pj')
        ORDER BY COALESCE(t.prazo, t.created_at::date) DESC, t.created_at DESC`,
      [externalType, externalId]
    )
    res.json({ tarefas })
  } catch (err) {
    console.error('[INTEGRACOES] Erro ao listar tarefas Destrava:', err)
    res.status(500).json({ error: 'Erro ao listar tarefas integradas.' })
  }
})

router.post('/destrava/tarefas', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = normalizeDestravaTaskInput(req.body || {})
    const tituloOriginal = body.titulo
    const externalId = body.externalId
    let externalType = body.externalType
    const extLower = externalType.toLowerCase()
    // Normalize aliases for Clientes PJ to maintain backwards compatibility.
    if (['cliente_pj', 'clientes_pj', 'cliente-pj', 'clientes-pj'].includes(extLower)) {
      externalType = 'empresa'
    }
    const externalName = body.externalName

    if (!tituloOriginal) {
      res.status(400).json({ error: 'Título da tarefa é obrigatório.' })
      return
    }
    if (!externalId) {
      res.status(400).json({ error: 'external_id é obrigatório.' })
      return
    }

    const creator = await resolveIntegrationUser(body)
    if (!creator) {
      res.status(400).json({
        error: 'Não foi possível determinar com segurança a organização da integração. Envie criado_por_email/responsavel_email ou, somente se houver mais de uma organização vinculada ao Destrava, configure NEXUS_DESTRAVA_ORG_ID.',
      })
      return
    }

    // Usa o UUID retornado pelo perfil já validado. Além de eliminar espaços
    // acidentais na variável, impede qualquer divergência entre a organização
    // configurada e a organização real do usuário escolhido.
    const orgId = creator.org_id
    let responsavel = await findActiveUserByEmail(body.responsavelEmail, orgId)
    if (!responsavel || responsavel.org_id !== orgId) responsavel = creator

    const prioridade = VALID_PRIORIDADES.includes(body.prioridade) ? body.prioridade : 'media'
    const criadaPorGestor = creatorCanEnableTaskRanking(creator.role)
    let checklist = normalizeChecklistItems(body.checklist).map(item =>
      body.lembreteDiarioAteAprovacao && item.recorrencia === 'unica'
        ? { ...item, recorrencia: 'diaria' as const }
        : item,
    )
    if (!criadaPorGestor) checklist = removeChecklistScoringForMember(checklist)
    for (const item of checklist) {
      if (!item.responsavel_id && !item.responsavel_email) continue
      const owner = item.responsavel_id
        ? await findActiveUserById(item.responsavel_id, orgId)
        : await findActiveUserByEmail(item.responsavel_email, orgId)
      if (!owner) {
        res.status(400).json({ error: 'Responsável do checklist não encontrado, inativo ou pertencente a outra organização.' })
        return
      }
      item.responsavel_id = owner.id
      item.responsavel_nome = owner.nome
      // O e-mail foi útil apenas para compatibilidade e resolução. O JSON
      // persistido usa o ID canônico do Nexus como fonte de verdade.
      delete item.responsavel_email
    }
    const metadata = {
      ...body.metadata,
      destrava_titulo_original: tituloOriginal,
      // FIX62: padroniza a chave real de agrupamento por empresa nos 3
      // caminhos que criam tarefa (este, rotinas.ts, acompanhamento.ts).
      // Neste caminho genérico, quando o tipo é 'empresa', origem_id JÁ é o
      // empresa_id (normalizeDestravaTaskInput usa empresa.id como
      // external_id padrão) -- gravar aqui também deixa explícito e
      // consistente com os outros dois caminhos, que usam contrato_id/
      // acompanhamento_id como origem_id e por isso precisam do campo à parte.
      empresa_id: externalType === 'empresa' ? externalId : (body.metadata as any)?.empresa_id || null,
      destrava_colaborador_id: body.destravaColaboradorId,
      destrava_colaborador_nome: body.criadoPorNome,
      destrava_colaborador_email: body.criadoPorEmail,
      cnpj: body.cnpj,
      nexus_pontuacao_escopo: body.pontuacaoEscopo,
      pontuacao_escopo: body.pontuacaoEscopo,
      nexus_criada_por_gestor: criadaPorGestor,
    }
    const sourceUrl = body.sourceUrl
    const externalKey = buildDestravaTaskExternalKey({ ...body, externalType })
    const titulo = resolveTaskListTitle({
      context: body.contextoTipo,
      entityName: externalName,
      requestedTitle: tituloOriginal,
    })

    const client = await pool.connect()
    let tarefa: any = null
    let criada = false
    try {
      await client.query('BEGIN')
      // Serializa duas entregas concorrentes da mesma chave (ex.: despacho
      // imediato + varredura de retry do Destrava chegando quase juntos).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [externalKey])

      const inserted = await client.query(
        `INSERT INTO tarefas
           (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade,
            checklist, obs, status, status_gestor, origem_sistema, origem_tipo, origem_id, origem_nome, origem_url,
            origem_payload, external_key, escopo, modo_distribuicao, contexto_tipo, lembrete_diario_ate_aprovacao,
            conta_ranking)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendente','aguardando','destrava',$12,$13,$14,$15,$16,$17,'equipe','normal',$18,$19,$20)
         ON CONFLICT (org_id, external_key) WHERE external_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [
          orgId,
          creator.id,
          responsavel.id,
          responsavel.nome,
          titulo,
          body.descricao,
          body.data,
          body.prazo,
          prioridade,
          JSON.stringify(checklist),
          body.observacao,
          externalType,
          externalId,
          externalName || null,
          sourceUrl,
          JSON.stringify(metadata),
          externalKey,
          body.contextoTipo,
          false,
          criadaPorGestor && body.contaRanking,
        ]
      )

      if (inserted.rows[0]) {
        tarefa = inserted.rows[0]
        criada = true
      } else {
        const existing = await client.query(`SELECT * FROM tarefas WHERE org_id = $1 AND external_key = $2`, [orgId, externalKey])
        tarefa = existing.rows[0] || null
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }

    if (!tarefa) {
      res.status(500).json({ error: 'Erro ao criar tarefa integrada.' })
      return
    }

    if (criada) {
      await query(
        `INSERT INTO nexus_external_links
           (org_id, source_system, external_type, external_id, external_name, nexus_type, nexus_id, source_url, metadata)
         VALUES ($1,'destrava',$2,$3,$4,'tarefa',$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [orgId, externalType, externalId, externalName || null, tarefa.id, sourceUrl, JSON.stringify(metadata)]
      ).catch(() => {})

      await addHistorico(orgId, tarefa.id, creator.id, 'criada_integracao_destrava', `Tarefa criada a partir do Destrava${externalName ? ` — ${externalName}` : ''}`)
    }

    const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '')
    res.status(criada ? 201 : 200).json({
      tarefa,
      duplicado: !criada,
      link: frontend ? `${frontend}/tarefas?origem=destrava&external_id=${encodeURIComponent(externalId)}` : null,
    })
  } catch (err) {
    console.error('[INTEGRACOES] Erro ao criar tarefa Destrava:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa integrada do Destrava.' })
  }
})

export default router
