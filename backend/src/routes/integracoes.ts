import { Router, Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../db/pool'

const router = Router()

const VALID_PRIORIDADES = ['baixa', 'media', 'alta'] as const

type NexusUser = {
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

function requireIntegrationSecret(req: Request, res: Response, next: NextFunction) {
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

function normalizeChecklistItems(value: unknown): Array<{ id: string; texto: string; feito: boolean }> {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('\n').map(line => line.trim()).filter(Boolean)
      : []

  return raw
    .map((item: any) => {
      if (typeof item === 'string') return { id: uuidv4(), texto: item.trim(), feito: false }
      return {
        id: typeof item?.id === 'string' && item.id ? item.id : uuidv4(),
        texto: String(item?.texto || item?.label || item?.title || '').trim(),
        feito: Boolean(item?.feito),
      }
    })
    .filter(item => item.texto)
}

async function findActiveUserByEmail(email?: string | null): Promise<NexusUser | null> {
  if (!email || !email.trim()) return null
  return queryOne<NexusUser>(
    `SELECT id, org_id, nome, email, role
       FROM profiles
      WHERE lower(email) = lower($1)
        AND COALESCE(ativo, TRUE) = TRUE
      LIMIT 1`,
    [email.trim()]
  )
}

async function resolveIntegrationUser(payload: any): Promise<NexusUser | null> {
  const candidates = [
    payload?.criado_por_email,
    payload?.responsavel_email,
    process.env.NEXUS_DESTRAVA_DEFAULT_USER_EMAIL,
  ].filter(Boolean)

  for (const email of candidates) {
    const user = await findActiveUserByEmail(String(email))
    if (user) return user
  }

  if (process.env.NEXUS_DESTRAVA_DEFAULT_USER_ID) {
    const user = await queryOne<NexusUser>(
      `SELECT id, org_id, nome, email, role
         FROM profiles
        WHERE id = $1 AND COALESCE(ativo, TRUE) = TRUE
        LIMIT 1`,
      [process.env.NEXUS_DESTRAVA_DEFAULT_USER_ID]
    )
    if (user) return user
  }

  if (process.env.NEXUS_DESTRAVA_ORG_ID) {
    const user = await queryOne<NexusUser>(
      `SELECT id, org_id, nome, email, role
         FROM profiles
        WHERE org_id = $1
          AND COALESCE(ativo, TRUE) = TRUE
        ORDER BY CASE role WHEN 'dev' THEN 1 WHEN 'admin' THEN 2 WHEN 'gestor' THEN 3 ELSE 4 END, created_at ASC
        LIMIT 1`,
      [process.env.NEXUS_DESTRAVA_ORG_ID]
    )
    if (user) return user
  }

  return queryOne<NexusUser>(
    `SELECT id, org_id, nome, email, role
       FROM profiles
      WHERE COALESCE(ativo, TRUE) = TRUE
      ORDER BY CASE role WHEN 'dev' THEN 1 WHEN 'admin' THEN 2 WHEN 'gestor' THEN 3 ELSE 4 END, created_at ASC
      LIMIT 1`
  )
}

async function addHistorico(orgId: string, tarefaId: string, userId: string, acao: string, observacao?: string | null) {
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

router.use(requireIntegrationSecret)

router.get('/destrava/status', async (_req: Request, res: Response): Promise<void> => {
  res.json({ ok: true, sistema: 'nexus', integracao: 'destrava', timestamp: new Date().toISOString() })
})

router.get('/destrava/tarefas', async (req: Request, res: Response): Promise<void> => {
  try {
    const externalType = String(req.query.external_type || 'empresa').trim()
    const externalId = String(req.query.external_id || '').trim()
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
          AND t.origem_tipo = $1
          AND t.origem_id = $2
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
    const body = req.body || {}
    const titulo = String(body.titulo || '').trim()
    const externalId = String(body.external_id || '').trim()
    const externalType = String(body.external_type || 'empresa').trim()
    const externalName = String(body.external_name || '').trim()

    if (!titulo) {
      res.status(400).json({ error: 'Título da tarefa é obrigatório.' })
      return
    }
    if (!externalId) {
      res.status(400).json({ error: 'external_id é obrigatório.' })
      return
    }

    const creator = await resolveIntegrationUser(body)
    if (!creator) {
      res.status(400).json({ error: 'Nenhum usuário ativo encontrado no Nexus para receber a integração.' })
      return
    }

    const orgId = process.env.NEXUS_DESTRAVA_ORG_ID || creator.org_id
    let responsavel = await findActiveUserByEmail(body.responsavel_email)
    if (!responsavel || responsavel.org_id !== orgId) responsavel = creator

    const prioridade = VALID_PRIORIDADES.includes(body.prioridade) ? body.prioridade : 'media'
    const checklist = normalizeChecklistItems(body.checklist)
    const metadata = {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      destrava_colaborador_id: body.destrava_colaborador_id || null,
      destrava_colaborador_nome: body.destrava_colaborador_nome || null,
      destrava_colaborador_email: body.criado_por_email || null,
      cnpj: body.cnpj || null,
    }
    const sourceUrl = body.source_url ? String(body.source_url) : null
    const externalKey = `destrava:${externalType}:${externalId}:${Date.now()}`

    const tarefa = await queryOne<any>(
      `INSERT INTO tarefas
         (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade,
          checklist, obs, status, status_gestor, origem_sistema, origem_tipo, origem_id, origem_nome, origem_url,
          origem_payload, external_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendente','aguardando','destrava',$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        orgId,
        creator.id,
        responsavel.id,
        responsavel.nome,
        titulo,
        body.descricao ? String(body.descricao) : null,
        body.data || null,
        body.prazo || null,
        prioridade,
        JSON.stringify(checklist),
        body.obs ? String(body.obs) : null,
        externalType,
        externalId,
        externalName || null,
        sourceUrl,
        JSON.stringify(metadata),
        externalKey,
      ]
    )

    if (!tarefa) {
      res.status(500).json({ error: 'Erro ao criar tarefa integrada.' })
      return
    }

    await query(
      `INSERT INTO nexus_external_links
         (org_id, source_system, external_type, external_id, external_name, nexus_type, nexus_id, source_url, metadata)
       VALUES ($1,'destrava',$2,$3,$4,'tarefa',$5,$6,$7)
       ON CONFLICT DO NOTHING`,
      [orgId, externalType, externalId, externalName || null, tarefa.id, sourceUrl, JSON.stringify(metadata)]
    ).catch(() => {})

    await addHistorico(orgId, tarefa.id, creator.id, 'criada_integracao_destrava', `Tarefa criada a partir do Destrava${externalName ? ` — ${externalName}` : ''}`)

    const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '')
    res.status(201).json({
      tarefa,
      link: frontend ? `${frontend}/tarefas?origem=destrava&external_id=${encodeURIComponent(externalId)}` : null,
    })
  } catch (err) {
    console.error('[INTEGRACOES] Erro ao criar tarefa Destrava:', err)
    res.status(500).json({ error: 'Erro ao criar tarefa integrada do Destrava.' })
  }
})

export default router
