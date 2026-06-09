import { Router, Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../db/pool'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
import { criarNotificacao } from '../lib/notifHelper'
import { createSecureMulterUpload, buildUploadUrl, removeUploadByUrl, uploadErrorMessage, filenameFromUploadUrl, safeUploadPathFromFilename } from '../lib/uploadSecurity'
import fs from 'fs'
import path from 'path'

const router = Router()
router.use(authMiddleware)


// ── GARANTIA DE SCHEMA EM TEMPO DE EXECUÇÃO ─────────────────────────────────
// A migração automática já existe no startup, mas em VPS/Coolify pode haver
// deploy com banco antigo, migração interrompida ou container antigo atendendo
// requisição. Esta proteção evita erro 500 em salvar/editar tarefa quando uma
// coluna nova ainda não foi aplicada no PostgreSQL nativo.
let taskRuntimeSchemaPromise: Promise<void> | null = null

async function ensureTaskRuntimeSchema() {
  if (!taskRuntimeSchemaPromise) {
    taskRuntimeSchemaPromise = (async () => {
      await query(`
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";

        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS status_gestor TEXT NOT NULL DEFAULT 'aguardando';
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS escopo TEXT NOT NULL DEFAULT 'pessoal';
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS modo_distribuicao TEXT NOT NULL DEFAULT 'normal';
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aceita_por UUID REFERENCES profiles(id) ON DELETE SET NULL;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aceita_em TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS pontuacao INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS conta_ranking BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS bloquear_nova_livre_ate_concluir BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS obs TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_membro TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS motivo_nao_conclusao TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS observacao_conclusao TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_status TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_obs TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_em TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS ressalva_gestor TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aprovada_em TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aprovada_por UUID REFERENCES profiles(id) ON DELETE SET NULL;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS devolvida_em TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS reenviada_em TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_reabertura TIMESTAMPTZ;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS reaberto_por UUID REFERENCES profiles(id) ON DELETE SET NULL;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_sistema TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_tipo TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_id TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_nome TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_url TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_payload JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS external_key TEXT;

        ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_status_check;
        ALTER TABLE tarefas ADD CONSTRAINT tarefas_status_check
          CHECK (status IN ('pendente','em_progresso','concluida','nao_concluida','devolvida','reenviada','aprovada','cancelada'));
        ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_escopo_check;
        ALTER TABLE tarefas ADD CONSTRAINT tarefas_escopo_check CHECK (escopo IN ('pessoal','equipe'));
        ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_modo_distribuicao_check;
        ALTER TABLE tarefas ADD CONSTRAINT tarefas_modo_distribuicao_check CHECK (modo_distribuicao IN ('normal','livre_equipe'));
        ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_status_gestor_check;
        ALTER TABLE tarefas ADD CONSTRAINT tarefas_status_gestor_check CHECK (status_gestor IN ('aguardando','aprovada','devolvida'));
        ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_resposta_status_check;
        ALTER TABLE tarefas ADD CONSTRAINT tarefas_resposta_status_check CHECK (resposta_status IS NULL OR resposta_status IN ('concluida','nao_concluida'));

        CREATE TABLE IF NOT EXISTS tarefas_pontuacao (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
          tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
          usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          checklist_id TEXT,
          pontos INTEGER NOT NULL DEFAULT 1,
          motivo TEXT,
          aprovado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
          aprovado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          periodo_mes TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          UNIQUE (tarefa_id, usuario_id, motivo)
        );
        ALTER TABLE tarefas_pontuacao ADD COLUMN IF NOT EXISTS checklist_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_tarefas_livre_equipe ON tarefas(org_id, modo_distribuicao, aceita_por, status);
        CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_org_periodo ON tarefas_pontuacao(org_id, periodo_mes);
        CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_usuario ON tarefas_pontuacao(usuario_id);
      `)
    })().catch(err => {
      taskRuntimeSchemaPromise = null
      throw err
    })
  }
  return taskRuntimeSchemaPromise
}

router.use(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureTaskRuntimeSchema()
    next()
  } catch (err) {
    console.error('[TAREFAS] Schema de tarefas não pôde ser preparado:', err)
    res.status(500).json({ error: 'Banco de tarefas não preparado para salvar. Execute o deploy novamente ou aplique as migrations.' })
  }
})


// ── UPLOADS DE EVIDÊNCIAS DA TAREFA ─────────────────────────────────────────
const evidenceUpload = createSecureMulterUpload()
const uploadEvidenceFile = (req: Request, res: Response, next: NextFunction) => {
  evidenceUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: uploadErrorMessage(err) })
      return
    }
    next()
  })
}

interface MulterTaskRequest extends Request {
  file?: Express.Multer.File
}


function destravaEventUrl(): string | null {
  const base = String(process.env.DESTRAVA_API_URL || process.env.DESTRAVA_INTERNAL_API_URL || process.env.DESTRAVA_PUBLIC_URL || '').replace(/\/$/, '')
  return base ? `${base}/api/nexus/eventos` : null
}

async function enviarEventoDestrava(tarefa: any, evento: string, payload: Record<string, unknown> = {}) {
  if (!tarefa || tarefa.origem_sistema !== 'destrava' || !tarefa.origem_id) return
  const url = destravaEventUrl()
  const secret = String(process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET || process.env.DESTRAVA_INTEGRATION_SECRET || process.env.INTEGRATION_SECRET || '').trim()
  if (!url || !secret) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nexus-integration-secret': secret },
      body: JSON.stringify({
        evento,
        origem_sistema: 'nexus',
        external_type: tarefa.origem_tipo || 'empresa',
        external_id: tarefa.origem_id,
        external_name: tarefa.origem_nome || null,
        tarefa: {
          id: tarefa.id,
          titulo: tarefa.titulo,
          status: tarefa.status,
          status_gestor: tarefa.status_gestor,
          prioridade: tarefa.prioridade,
          prazo: tarefa.prazo,
          origem_url: tarefa.origem_url || null,
        },
        ...payload,
      }),
    }).catch(() => undefined)
  } catch (err) {
    console.warn('[TAREFAS] Falha ao enviar evento para Destrava:', (err as Error)?.message || err)
  }
}

const VALID_STATUS = ['pendente', 'em_progresso', 'concluida', 'nao_concluida', 'devolvida', 'reenviada', 'aprovada', 'cancelada'] as const
type TaskStatus = typeof VALID_STATUS[number]

function isValidStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (VALID_STATUS as readonly string[]).includes(v)
}

function normalizeTextForScore(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}


type ChecklistDifficulty = 'nivel_1' | 'nivel_2' | 'nivel_3' | 'nivel_4' | 'nivel_5'

const CHECKLIST_DIFFICULTY_POINTS: Record<ChecklistDifficulty, number> = {
  nivel_1: 0,
  nivel_2: 1,
  nivel_3: 3,
  nivel_4: 5,
  nivel_5: 20,
}

function normalizeChecklistDifficulty(value: unknown, fallback: ChecklistDifficulty = 'nivel_3'): ChecklistDifficulty {
  const raw = normalizeTextForScore(value).replace(/\s+/g, '_')
  if (raw === 'nivel_1' || raw === 'nível_1' || raw === 'n1' || raw === '1' || raw === 'iniciante' || raw === 'leve' || raw === 'basico' || raw === 'básico') return 'nivel_1'
  if (raw === 'nivel_2' || raw === 'nível_2' || raw === 'n2' || raw === '2') return 'nivel_2'
  if (raw === 'nivel_3' || raw === 'nível_3' || raw === 'n3' || raw === '3') return 'nivel_3'
  if (raw === 'nivel_4' || raw === 'nível_4' || raw === 'n4' || raw === '4' || raw === 'facil' || raw === 'fácil' || raw === 'medio' || raw === 'médio' || raw === 'normal') return 'nivel_4'
  if (raw === 'nivel_5' || raw === 'nível_5' || raw === 'n5' || raw === '5' || raw === 'dificil' || raw === 'difícil' || raw === 'hard' || raw === 'super_dificil' || raw === 'super_difícil' || raw === 'super_dificil_hard' || raw === 'nivel_hard' || raw === 'nível_hard') return 'nivel_5'
  return fallback
}

function scoreToDifficulty(score: unknown): ChecklistDifficulty {
  const n = Number(score || 0)
  if (n <= 0) return 'nivel_1'
  if (n <= 1) return 'nivel_2'
  if (n <= 3) return 'nivel_3'
  if (n <= 5) return 'nivel_4'
  return 'nivel_5'
}

function pointsForDifficulty(value: unknown, fallback: ChecklistDifficulty = 'nivel_3') {
  return CHECKLIST_DIFFICULTY_POINTS[normalizeChecklistDifficulty(value, fallback)]
}

function normalizeChecklistScore(value: unknown, fallback = 3) {
  const raw = typeof value === 'string' ? value.replace(',', '.') : value
  const n = Number(raw)
  if (!Number.isFinite(n)) return Math.max(0, Math.min(20, Math.round(Number(fallback) || 0)))
  return Math.max(0, Math.min(20, Math.round(n)))
}

function calculateTaskComplexityPoints(input: {
  titulo?: unknown
  descricao?: unknown
  prioridade?: unknown
  checklist?: unknown
  origem_sistema?: unknown
  origem_tipo?: unknown
  origem_nome?: unknown
  origem_payload?: unknown
  manual?: unknown
}) {
  // A pontuação continua simples para o usuário, mas passa a refletir a dificuldade real.
  // Base pensada para o uso do Nexus na operação da Destrava Crédito: análise de CNPJ,
  // rating/relacionamento bancário, faturamento, documentos e diagnóstico financeiro.
  const manual = Number(input.manual || 0)
  const checklist = parseChecklistItems(input.checklist)
  const text = normalizeTextForScore([
    input.titulo,
    input.descricao,
    input.origem_tipo,
    input.origem_nome,
    typeof input.origem_payload === 'string' ? input.origem_payload : JSON.stringify(input.origem_payload || {}),
    checklist.map(i => `${i.texto} ${i.descricao || ''}`).join(' '),
  ].join(' '))

  let points = 5

  const prioridade = String(input.prioridade || 'media')
  if (prioridade === 'baixa') points += 1
  if (prioridade === 'media') points += 3
  if (prioridade === 'alta') points += 7

  points += Math.min(18, checklist.length * 2)
  points += Math.min(10, checklist.filter(i => i.responsavel_id).length * 2)

  const rules: Array<[RegExp, number]> = [
    [/\b(cnpj|cartao cnpj|receita federal|situacao cadastral|qsa|socios?|cnae|contrato social|nire)\b/, 8],
    [/\b(rating|bancario|banco|limite|relacionamento bancario|restri(?:c|ç)ao|scr|registrato|serasa|spc|protesto)\b/, 13],
    [/\b(faturamento|receita|dre|balanco|balan(?:c|ç)ete|extrato|fluxo de caixa|endividamento|margem|lucro)\b/, 15],
    [/\b(documenta(?:c|ç)ao|documentos?|certid(?:a|ã)o|comprovante|upload|anexo|pendencia)\b/, 6],
    [/\b(analise|diagnostico|viabilidade|credito|simulacao|proposta|aprovar|aprovacao|contrato|garantia)\b/, 12],
    [/\b(urgente|critico|critica|risco|vencido|atrasado|prazo final|prioridade alta)\b/, 10],
  ]
  for (const [pattern, add] of rules) if (pattern.test(text)) points += add

  if (String(input.origem_sistema || '').toLowerCase() === 'destrava') points += 10
  if (manual > 1) points = Math.max(points, manual)

  return Math.max(0, Math.min(20, Math.round(points)))
}

function calculateChecklistItemPoints(item: { texto?: string; descricao?: string; data?: string; pontuacao?: number; dificuldade?: ChecklistDifficulty | string }, task: any) {
  const dificuldade = normalizeChecklistDifficulty((item as any)?.dificuldade, scoreToDifficulty((item as any)?.pontuacao ?? 3))
  const manual = Number((item as any)?.pontuacao || 0)
  // Regra do ranking: a pontuação é da subtarefa/checklist, definida manualmente
  // por quem cadastrou, com a escala objetiva Nível 1 a 5: 0, 1, 3, 5 e 20 pontos.
  if (Number.isFinite(manual) && manual >= 0) return Math.max(0, Math.min(20, Math.round(manual)))
  return pointsForDifficulty(dificuldade)
}

function checklistExecutorId(item: any, task: any): string | null {
  const candidates = [
    item?.responsavel_id,
    item?.concluido_por,
    item?.feito_por,
    item?.executor_id,
    item?.assumido_por,
    item?.aceita_por,
    task?.aceita_por,
    task?.responsavel_id,
  ]
  for (const candidate of candidates) {
    if (isUuid(candidate)) return candidate
  }
  return null
}

function rankingChecklistKey(item: any, motivo?: unknown, checklistId?: unknown) {
  const explicit = String(checklistId || '').trim()
  if (explicit) return explicit
  const rawMotivo = String(motivo || '').trim()
  if (rawMotivo.includes(':')) return rawMotivo.split(':').slice(1).join(':').trim() || rawMotivo
  if (rawMotivo) return rawMotivo
  return String(item?.id || item?.texto || item?.titulo || '').trim()
}

function statusShouldReturnToExecution(status: unknown) {
  return ['concluida', 'aprovada'].includes(String(status || ''))
}



function normalizeNullableDate(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function normalizePriority(value: unknown, fallback: string = 'media'): 'baixa' | 'media' | 'alta' {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'baixa' || raw === 'media' || raw === 'alta') return raw
  return normalizePriority(fallback || 'media', 'media')
}

function normalizePositiveScore(value: unknown, fallback = 3) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Math.max(0, Math.min(20, Math.round(Number(fallback) || 0)))
  return Math.max(0, Math.min(20, Math.round(parsed)))
}

function normalizeTaskScope(value: unknown): 'pessoal' | 'equipe' {
  return value === 'equipe' ? 'equipe' : 'pessoal'
}

function normalizeTaskDistribution(value: unknown): 'normal' | 'livre_equipe' {
  return value === 'livre_equipe' ? 'livre_equipe' : 'normal'
}

function isFreeTeamTask(task: any) {
  return normalizeTaskDistribution(task?.modo_distribuicao) === 'livre_equipe'
}

function periodMonth(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 7)
  return d.toISOString().slice(0, 7)
}

function periodRange(periodo: string): { inicio: string | null; fim: string | null; label: string } {
  const hoje = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (periodo === 'semana') {
    const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() - day + 1)
    const fim = new Date(d)
    fim.setUTCDate(fim.getUTCDate() + 7)
    return { inicio: iso(d), fim: iso(fim), label: 'semana' }
  }
  if (periodo === 'mes') {
    const inicio = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1))
    const fim = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 1))
    return { inicio: iso(inicio), fim: iso(fim), label: 'mes' }
  }
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    const inicio = new Date(`${periodo}-01T00:00:00.000Z`)
    const fim = new Date(inicio)
    fim.setUTCMonth(fim.getUTCMonth() + 1)
    return { inicio: iso(inicio), fim: iso(fim), label: periodo }
  }
  return { inicio: null, fim: null, label: 'todos' }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseChecklistItems(value: unknown): Array<{ id?: string; texto: string; feito?: boolean; descricao?: string; data?: string; responsavel_id?: string; responsavel_nome?: string; pontuacao?: number; dificuldade?: ChecklistDifficulty; concluido_por?: string; feito_por?: string; executor_id?: string; assumido_por?: string; revelar_apos_assumir?: boolean; oculta_ate_assumir?: boolean }> {
  const raw = (() => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).items)) return (parsed as any).items
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).checklist)) return (parsed as any).checklist
        return []
      } catch { return [] }
    }
    if (value && typeof value === 'object') {
      if (Array.isArray((value as any).items)) return (value as any).items
      if (Array.isArray((value as any).checklist)) return (value as any).checklist
    }
    return []
  })()

  return raw
    .map((item: any) => {
      if (typeof item === 'string') return { id: uuidv4(), texto: item.trim(), feito: false, dificuldade: 'nivel_3' as ChecklistDifficulty, pontuacao: 3 }
      const rawDate = String(item?.data || item?.date || item?.prazo || '').slice(0, 10)
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined
      const dificuldade = normalizeChecklistDifficulty(item?.dificuldade, scoreToDifficulty(item?.pontuacao ?? 3))
      const pontuacao = normalizeChecklistScore(item?.pontuacao, pointsForDifficulty(dificuldade))
      return {
        id: isUuid(item?.id) ? item.id : uuidv4(),
        texto: String(item?.texto || item?.label || item?.title || '').trim(),
        descricao: String(item?.descricao || item?.description || item?.obs || '').trim() || undefined,
        data: safeDate,
        responsavel_id: isUuid(item?.responsavel_id) ? item.responsavel_id : undefined,
        responsavel_nome: String(item?.responsavel_nome || '').trim() || undefined,
        concluido_por: isUuid(item?.concluido_por) ? item.concluido_por : undefined,
        feito_por: isUuid(item?.feito_por) ? item.feito_por : undefined,
        executor_id: isUuid(item?.executor_id) ? item.executor_id : undefined,
        assumido_por: isUuid(item?.assumido_por) ? item.assumido_por : undefined,
        dificuldade,
        pontuacao,
        revelar_apos_assumir: Boolean(item?.revelar_apos_assumir || item?.surpresa || item?.ocultar_ate_assumir),
        feito: !!item?.feito,
      }
    })
    .filter((item: { texto: string }) => item.texto)
}

function normalizeChecklist(value: unknown) {
  return JSON.stringify(parseChecklistItems(value))
}

async function normalizeChecklistForOrg(value: unknown, orgId: string, userId: string, role: string) {
  const items = parseChecklistItems(value)
  const ids = Array.from(new Set(items.map(i => i.responsavel_id).filter(Boolean))) as string[]
  if (!ids.length) return JSON.stringify(items)

  const rows = await query<{ id: string; nome: string; criado_por: string | null }>(
    `SELECT id, nome, criado_por FROM profiles WHERE org_id = $1 AND ativo = TRUE AND id = ANY($2::uuid[])`,
    [orgId, ids]
  )
  const byId = new Map(rows.map(r => [r.id, r]))

  for (const id of ids) {
    const profile = byId.get(id)
    if (!profile) throw Object.assign(new Error('Responsável do checklist não encontrado.'), { statusCode: 404 })
    if (role === 'membro' && id !== userId) {
      throw Object.assign(new Error('Membro só pode atribuir checklist para si mesmo.'), { statusCode: 403 })
    }
    if (role === 'sub_gestor' && id !== userId && profile.criado_por !== userId) {
      throw Object.assign(new Error('Sub-gestor só pode atribuir checklist para si ou seus comandados diretos.'), { statusCode: 403 })
    }
  }

  return JSON.stringify(items.map(item => {
    if (!item.responsavel_id) return item
    const profile = byId.get(item.responsavel_id)
    return { ...item, responsavel_nome: profile?.nome || item.responsavel_nome }
  }))
}

function checklistStructureKey(value: unknown) {
  return parseChecklistItems(value)
    .map(item => `${item.id || ''}:${item.texto}:${item.data || ''}:${item.descricao || ''}:${item.responsavel_id || ''}`)
    .join('|')
}

function checklistDoneChanged(before: unknown, after: unknown) {
  const beforeItems = parseChecklistItems(before)
  const afterItems = parseChecklistItems(after)
  const beforeByKey = new Map(beforeItems.map(item => [`${item.id || ''}:${item.texto}`, !!item.feito]))

  return afterItems.some(item => {
    const key = `${item.id || ''}:${item.texto}`
    const beforeDone = beforeByKey.get(key)
    if (beforeDone === undefined) return !!item.feito
    return beforeDone !== !!item.feito
  })
}

function isTaskExecutor(task: any, userId: string) {
  return task.responsavel_id === userId || (!task.responsavel_id && task.criado_por === userId)
}

function isChecklistItemExecutor(task: any, item: { responsavel_id?: string }, userId: string) {
  if (item.responsavel_id) return item.responsavel_id === userId
  return isTaskExecutor(task, userId)
}

function changedChecklistDoneItems(before: unknown, after: unknown) {
  const beforeItems = parseChecklistItems(before)
  const afterItems = parseChecklistItems(after)
  const beforeByKey = new Map(beforeItems.map(item => [`${item.id || ''}:${item.texto}`, !!item.feito]))
  return afterItems.filter(item => {
    const key = `${item.id || ''}:${item.texto}`
    const beforeDone = beforeByKey.get(key)
    if (beforeDone === undefined) return !!item.feito
    return beforeDone !== !!item.feito
  })
}

function hasChecklistAssignedTo(task: any, userId: string) {
  return parseChecklistItems(task?.checklist).some(item => item.responsavel_id === userId)
}

function hasChecklistAssignedToOther(task: any, userId: string) {
  return parseChecklistItems(task?.checklist).some(item => item.responsavel_id && item.responsavel_id !== userId)
}

function hasUnassignedOpenChecklist(task: any) {
  return parseChecklistItems(task?.checklist).some(item => !item.feito && !item.responsavel_id)
}

function isPersonalScope(task: any) {
  return normalizeTaskScope(task?.escopo) === 'pessoal'
}

function isTaskPersonalOwner(task: any, userId: string) {
  return task?.criado_por === userId || task?.responsavel_id === userId || hasChecklistAssignedTo(task, userId)
}

function maskSurpriseChecklistItem(item: any, userId: string, task: any) {
  const assignedToUser = item?.responsavel_id === userId || item?.assumido_por === userId || item?.executor_id === userId
  const isPrimaryExecutor = task?.responsavel_id === userId || task?.aceita_por === userId
  if (!item?.revelar_apos_assumir || item?.feito || assignedToUser || isPrimaryExecutor) return item
  return {
    ...item,
    texto: `Tarefa valendo ${normalizeChecklistScore(item?.pontuacao, pointsForDifficulty(item?.dificuldade))} ponto(s) — assuma para revelar`,
    descricao: undefined,
    oculta_ate_assumir: true,
  }
}

function filterChecklistForUser(task: any, user: NonNullable<Request['user']>) {
  const { userId, role } = user
  const items = parseChecklistItems(task?.checklist)
  if (!items.length) return items
  // Gestores veem o checklist completo das tarefas de equipe que gerenciam.
  if (canDeleteOrgRecords(role)) return items
  if (isPersonalScope(task)) return isTaskPersonalOwner(task, userId) ? items : []
  // Membros só veem subtarefas livres ou atribuídas a eles.
  // Subtarefas assumidas/atribuídas a outra pessoa ficam ocultas.
  return items.filter(item => !item.responsavel_id || item.responsavel_id === userId).map(item => maskSurpriseChecklistItem(item, userId, task))
}

function sanitizeTaskForUser(task: any, user: NonNullable<Request['user']>) {
  const checklist = filterChecklistForUser(task, user)
  return { ...task, checklist }
}

function canListTaskForUser(task: any, user: NonNullable<Request['user']>, comandados = new Set<string>()) {
  const { userId, role } = user
  if (isPersonalScope(task)) {
    // Tarefa pessoal é privada: nem vínculo com Destrava nem cargo de equipe expõe para terceiros.
    return isTaskPersonalOwner(task, userId)
  }

  // Tarefas de equipe são visíveis para gestores/admin/dev/subgestores conforme o painel de gestão.
  if (canDeleteOrgRecords(role)) return true

  if (role === 'sub_gestor') {
    if (task.criado_por === userId || task.responsavel_id === userId || hasChecklistAssignedTo(task, userId)) return true
    if (task.responsavel_id && comandados.has(task.responsavel_id)) return true
    return false
  }

  // Membro vê somente o que recebeu, assumiu, criou para si/equipe, ou tarefas livres com subtarefa livre para assumir.
  if (task.responsavel_id === userId || task.criado_por === userId || task.aceita_por === userId || hasChecklistAssignedTo(task, userId)) return true
  if (isFreeTeamTask(task) && (!task.aceita_por || hasUnassignedOpenChecklist(task))) return true
  return false
}

function checklistProgress(task: any) {
  const items = parseChecklistItems(task?.checklist)
  const total = items.length
  const feitos = items.filter(item => !!item.feito).length
  return { items, total, feitos, completo: total > 0 && feitos === total }
}

function checklistForUserProgress(task: any, userId: string) {
  const items = parseChecklistItems(task?.checklist).filter(item => isChecklistItemExecutor(task, item, userId))
  const total = items.length
  const feitos = items.filter(item => !!item.feito).length
  return { items, total, feitos, completo: total > 0 && feitos === total }
}

function taskHasDistributedChecklist(task: any) {
  return parseChecklistItems(task?.checklist).some(item => !!item.responsavel_id)
}

async function syncChecklistTable(input: { orgId: string; tarefaId: string; userId: string; checklist: unknown }) {
  // A tabela tarefa_checklist é auxiliar/legada. A fonte principal do checklist
  // continua sendo o JSON da própria tarefa. Por isso, falha nessa sincronização
  // não pode impedir criar ou editar uma tarefa.
  try {
    const items = parseChecklistItems(input.checklist)
    await query('DELETE FROM tarefa_checklist WHERE tarefa_id = $1 AND org_id = $2', [input.tarefaId, input.orgId])
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      await query(
        `INSERT INTO tarefa_checklist (id, tarefa_id, org_id, criado_por, texto, feito, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [isUuid(item.id) ? item.id : uuidv4(), input.tarefaId, input.orgId, input.userId, item.texto, !!item.feito, i]
      )
    }
  } catch (err) {
    console.warn('[TAREFAS] Checklist auxiliar não sincronizado; JSON principal preservado:', err)
  }
}

async function addHistorico(input: {
  orgId: string
  tarefaId: string
  userId: string
  acao: string
  statusAnterior?: string | null
  statusNovo?: string | null
  observacao?: string | null
}) {
  await query(
    `INSERT INTO tarefas_historico
       (org_id, tarefa_id, user_id, acao, status_anterior, status_novo, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [input.orgId, input.tarefaId, input.userId, input.acao, input.statusAnterior || null, input.statusNovo || null, input.observacao || null]
  ).catch(async () => {
    // Compatibilidade com tabela legada tarefa_historico, caso exista em instalações antigas.
    await query(
      `INSERT INTO tarefa_historico
         (org_id, tarefa_id, usuario_id, acao, dados)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.orgId, input.tarefaId, input.userId, input.acao, JSON.stringify({ status_anterior: input.statusAnterior, status_novo: input.statusNovo, observacao: input.observacao })]
    ).catch(() => {})
  })
}

async function userCanAccessTask(task: any, user: NonNullable<Request['user']>) {
  const { userId, role, orgId } = user
  if (isPersonalScope(task)) return isTaskPersonalOwner(task, userId)
  if (canDeleteOrgRecords(role)) return true
  if (role === 'sub_gestor') {
    if (task.criado_por === userId || task.responsavel_id === userId || hasChecklistAssignedTo(task, userId)) return true
    if (!task.responsavel_id) return false
    const resp = await queryOne('SELECT id FROM profiles WHERE org_id = $1 AND id = $2 AND criado_por = $3', [orgId, task.responsavel_id, userId])
    return !!resp
  }
  if (isFreeTeamTask(task) && (!task.aceita_por || task.aceita_por === userId || hasUnassignedOpenChecklist(task))) return true
  if (role === 'membro') return task.responsavel_id === userId || task.criado_por === userId || task.aceita_por === userId || hasChecklistAssignedTo(task, userId)
  return task.criado_por === userId || task.responsavel_id === userId || hasChecklistAssignedTo(task, userId)
}



async function getTaskReminderRecipients(task: any) {
  const recipients = new Set<string>()
  if (task.responsavel_id) recipients.add(task.responsavel_id)
  if (task.aceita_por) recipients.add(task.aceita_por)
  if (task.criado_por) recipients.add(task.criado_por)
  for (const item of parseChecklistItems(task.checklist)) {
    if (item.responsavel_id) recipients.add(item.responsavel_id)
  }
  if (!task.responsavel_id || isFreeTeamTask(task)) {
    const equipe = await query<{ id: string }>(
      `SELECT id FROM profiles WHERE org_id = $1 AND ativo = TRUE`,
      [task.org_id]
    ).catch(() => [])
    for (const m of equipe) recipients.add(m.id)
  }
  return Array.from(recipients).filter(Boolean)
}

async function getTaskForAccess(id: string, orgId: string) {
  return queryOne<any>(
    `SELECT t.*, p.nome AS responsavel_nome_perfil, p.cargo AS responsavel_cargo,
            c.nome AS criado_por_nome,
            ap.nome AS aceita_por_nome,
            COALESCE((SELECT COUNT(*)::int FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id), 0) AS anexos_count,
            (SELECT MAX(a.created_at) FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id) AS ultima_evidencia_em
     FROM tarefas t
     LEFT JOIN profiles p ON p.id = t.responsavel_id
     LEFT JOIN profiles c ON c.id = t.criado_por
     LEFT JOIN profiles ap ON ap.id = t.aceita_por
     WHERE t.id = $1 AND t.org_id = $2`,
    [id, orgId]
  )
}

// ── Helpers de listagem sem depender de funções JSONB do banco ────────────────
// Bancos antigos podem ter tarefas.checklist como JSON, JSONB, texto ou até nulo.
// Por isso a filtragem por executor de checklist é feita em TypeScript, depois de
// buscar os registros da organização. Isso elimina 500 por jsonb_array_elements.
async function listTasksForUser(user: NonNullable<Request['user']>) {
  const { orgId, userId, role } = user
  const rows = await query<any>(
    `SELECT t.*,
            p.nome  AS responsavel_nome_perfil,
            p.cargo AS responsavel_cargo,
            c.nome  AS criado_por_nome,
            ap.nome AS aceita_por_nome,
            COALESCE((SELECT COUNT(*)::int FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id), 0) AS anexos_count,
            (SELECT MAX(a.created_at) FROM tarefa_anexos a WHERE a.tarefa_id = t.id AND a.org_id = t.org_id) AS ultima_evidencia_em
     FROM tarefas t
     LEFT JOIN profiles p ON p.id = t.responsavel_id
     LEFT JOIN profiles c ON c.id = t.criado_por
     LEFT JOIN profiles ap ON ap.id = t.aceita_por
     WHERE t.org_id = $1
     ORDER BY COALESCE(t.data_reabertura, t.updated_at, t.created_at) DESC, t.created_at DESC`,
    [orgId]
  )

  let comandados = new Set<string>()
  if (role === 'sub_gestor') {
    const subs = await query<{ id: string }>('SELECT id FROM profiles WHERE org_id = $1 AND criado_por = $2 AND ativo = TRUE', [orgId, userId])
    comandados = new Set(subs.map(s => s.id))
  }

  return rows
    .filter(task => canListTaskForUser(task, user, comandados))
    .map(task => sanitizeTaskForUser(task, user))
}

function taskMatchesMember(task: any, memberId: string) {
  if (isPersonalScope(task)) return task.criado_por === memberId || task.responsavel_id === memberId || hasChecklistAssignedTo(task, memberId)
  return task.responsavel_id === memberId || task.criado_por === memberId || task.aceita_por === memberId || hasChecklistAssignedTo(task, memberId)
}

function buildTaskStats(tasks: any[]) {
  const count = (statuses: string[]) => tasks.filter(t => statuses.includes(String(t.status || ''))).length
  return {
    total: String(tasks.length),
    pendente: String(count(['pendente'])),
    em_progresso: String(count(['em_progresso'])),
    concluida: String(count(['concluida'])),
    nao_concluida: String(count(['nao_concluida'])),
    devolvida: String(count(['devolvida'])),
    aprovada: String(count(['aprovada'])),
    cancelada: String(count(['cancelada'])),
  }
}

// ── STATS precisa vir antes de /:id ──────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const tarefas = await listTasksForUser(req.user!)
    res.json({ stats: buildTaskStats(tarefas) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar stats:', err)
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' })
  }
})

// ── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const tarefas = await listTasksForUser(req.user!)
    const isOpen = (t: any) => !['concluida','aprovada','cancelada'].includes(String(t.status || ''))
    const today = new Date().toISOString().slice(0, 10)

    if (role === 'membro') {
      const resumo = {
        pendentes: tarefas.filter(t => t.status === 'pendente').length,
        em_progresso: tarefas.filter(t => t.status === 'em_progresso').length,
        devolvidas: tarefas.filter(t => t.status === 'devolvida').length,
        concluidas: tarefas.filter(t => ['concluida','aprovada'].includes(String(t.status || ''))).length,
        hoje: tarefas.filter(t => String(t.prazo || '').slice(0,10) === today && isOpen(t)).length,
      }
      res.json({ resumo })
      return
    }

    const resumo = {
      enviadas: tarefas.length,
      pendentes: tarefas.filter(t => t.status === 'pendente').length,
      aguardando_aprovacao: tarefas.filter(t => t.status === 'concluida' && (t.status_gestor || 'aguardando') === 'aguardando').length,
      nao_concluidas: tarefas.filter(t => t.status === 'nao_concluida').length,
      devolvidas: tarefas.filter(t => t.status === 'devolvida').length,
      aprovadas: tarefas.filter(t => t.status === 'aprovada').length,
    }

    const membros = await query<{ id: string; nome: string }>(
      `SELECT id, nome
       FROM profiles
       WHERE org_id = $1 AND ativo = TRUE AND (id = $2 OR criado_por = $2 OR EXISTS (
         SELECT 1 FROM equipes e JOIN equipes_membros em ON em.equipe_id = e.id AND em.org_id = e.org_id
         WHERE e.org_id = $1 AND e.criado_por = $2 AND em.user_id = profiles.id AND COALESCE(em.ativo, TRUE) = TRUE
       ))
       ORDER BY nome`,
      [orgId, userId]
    )

    const porMembro = membros.map(m => {
      const mt = tarefas.filter(t => taskMatchesMember(t, m.id))
      return {
        id: m.id,
        nome: m.nome,
        total: mt.length,
        pendentes: mt.filter(t => t.status === 'pendente').length,
        concluidas: mt.filter(t => t.status === 'concluida').length,
        nao_concluidas: mt.filter(t => t.status === 'nao_concluida').length,
        devolvidas: mt.filter(t => t.status === 'devolvida').length,
        aprovadas: mt.filter(t => t.status === 'aprovada').length,
      }
    })

    res.json({ resumo, por_membro: porMembro })
  } catch (err) {
    console.error('[TAREFAS] Erro dashboard:', err)
    res.status(500).json({ error: 'Erro ao buscar dashboard de tarefas.' })
  }
})

// ── LISTAR TAREFAS ───────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { role } = req.user!
    const { status, prioridade, responsavel_id } = req.query
    let tarefas = await listTasksForUser(req.user!)

    if (typeof status === 'string' && status && status !== 'todos') tarefas = tarefas.filter(t => t.status === status)
    if (typeof prioridade === 'string' && prioridade && prioridade !== 'todos') tarefas = tarefas.filter(t => t.prioridade === prioridade)
    if (typeof responsavel_id === 'string' && responsavel_id && role !== 'membro') {
      tarefas = tarefas.filter(t => taskMatchesMember(t, responsavel_id))
    }

    res.json({ tarefas })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefas.' })
  }
})

// ── RANKING DA EQUIPE / DESAFIO ─────────────────────────────────────────────
router.get('/ranking', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const rawPeriodo = typeof req.query.periodo === 'string' ? req.query.periodo.trim().toLowerCase() : 'todos'
    const range = periodRange(rawPeriodo || 'todos')
    const periodo = range.label
    const periodoInicio = range.inicio
    const periodoFim = range.fim

    const membros = await query<any>(
      `SELECT id, nome, email, role
       FROM profiles
       WHERE org_id = $1 AND ativo = TRUE AND role = 'membro'
       ORDER BY nome ASC`,
      [orgId]
    )

    const rankingMap = new Map<string, any>()
    for (const m of membros) {
      rankingMap.set(m.id, {
        id: m.id,
        nome: m.nome,
        email: m.email,
        role: m.role,
        pontos: 0,
        tarefas_aprovadas: 0,
        subtarefas_executadas: 0,
        tarefas_executadas: 0,
        ultima_aprovacao: null,
        historico: [],
      })
    }

    const pontuacoesRegistradas = await query<any>(
      `SELECT tp.*, t.titulo AS tarefa_titulo, t.checklist, t.aprovada_em AS tarefa_aprovada_em,
              t.updated_at AS tarefa_updated_at, t.created_at AS tarefa_created_at, t.status, t.escopo,
              t.conta_ranking, p.role AS usuario_role
       FROM tarefas_pontuacao tp
       JOIN tarefas t ON t.id = tp.tarefa_id AND t.org_id = tp.org_id
       JOIN profiles p ON p.id = tp.usuario_id AND p.org_id = tp.org_id
       WHERE tp.org_id = $1
         AND p.ativo = TRUE
         AND p.role = 'membro'
         AND COALESCE(t.conta_ranking, TRUE) = TRUE
         AND COALESCE(t.escopo, 'pessoal') = 'equipe'
         AND t.status = 'aprovada'
       ORDER BY COALESCE(tp.aprovado_em, t.aprovada_em, t.updated_at, t.created_at) DESC`,
      [orgId]
    ).catch(() => [])

    const tarefasExecutadas = await query<any>(
      `SELECT t.*
       FROM tarefas t
       WHERE t.org_id = $1
         AND COALESCE(t.conta_ranking, TRUE) = TRUE
         AND COALESCE(t.escopo, 'pessoal') = 'equipe'
         AND t.status = 'aprovada'
       ORDER BY COALESCE(t.aprovada_em, t.updated_at, t.created_at) DESC`,
      [orgId]
    )

    const inPeriod = (value: unknown) => {
      if (periodo === 'todos') return true
      const raw = String(value || '').trim()
      if (!raw || !periodoInicio || !periodoFim) return false
      const date = raw.slice(0, 10)
      return date >= periodoInicio && date < periodoFim
    }

    const scoreKeys = new Set<string>()
    const touchMember = (usuarioId: string, pontos: number, tarefa: any, isChecklist: boolean, keySeed?: string) => {
      // Ranking do desafio é exclusivo para membros executores.
      // Gestor/admin/dev/subgestor, tarefas pessoais e tarefas do próprio gestor não pontuam.
      const entry = rankingMap.get(usuarioId)
      if (!entry) return
      const when = tarefa.aprovado_em || tarefa.tarefa_aprovada_em || tarefa.updated_at || tarefa.tarefa_updated_at || tarefa.created_at || tarefa.tarefa_created_at || null
      const uniqueKey = `${tarefa.id || tarefa.tarefa_id}:${usuarioId}:${keySeed || (isChecklist ? tarefa.subtarefa_titulo : 'tarefa')}`
      if (scoreKeys.has(uniqueKey)) return
      scoreKeys.add(uniqueKey)
      const pontosValidos = Math.max(0, Math.min(20, Math.round(Number(pontos ?? 0))))
      entry.pontos += pontosValidos
      entry.tarefas_aprovadas += 1
      if (isChecklist) entry.subtarefas_executadas += 1
      else entry.tarefas_executadas += 1
      entry.historico.push({
        tarefa_id: tarefa.id || tarefa.tarefa_id,
        tarefa_titulo: tarefa.titulo || tarefa.tarefa_titulo,
        subtarefa_titulo: tarefa.subtarefa_titulo || null,
        dificuldade: tarefa.subtarefa_dificuldade || tarefa.dificuldade || null,
        checklist: isChecklist,
        pontos: pontosValidos,
        aprovado_em: when,
      })
      if (when && (!entry.ultima_aprovacao || new Date(when).getTime() > new Date(entry.ultima_aprovacao).getTime())) {
        entry.ultima_aprovacao = when
      }
    }

    // Fonte 1: pontuação já registrada no ato de aprovação do gestor.
    // É a fonte mais segura para refletir imediatamente a aprovação recém-feita.
    for (const row of pontuacoesRegistradas) {
      const dataBase = row.aprovado_em || row.tarefa_aprovada_em || row.tarefa_updated_at || row.tarefa_created_at
      if (!inPeriod(dataBase)) continue
      const items = parseChecklistItems(row.checklist)
      const key = rankingChecklistKey(null, row.motivo, row.checklist_id)
      const matched = items.find(item => rankingChecklistKey(item) === key || item.id === key || item.texto === key)
      touchMember(row.usuario_id, Number(row.pontos || 1), {
        id: row.tarefa_id,
        tarefa_id: row.tarefa_id,
        titulo: row.tarefa_titulo,
        tarefa_titulo: row.tarefa_titulo,
        subtarefa_titulo: matched?.texto || (String(row.motivo || '').startsWith('checklist_aprovado:') ? key : null),
        subtarefa_dificuldade: matched?.dificuldade || null,
        aprovado_em: row.aprovado_em || row.tarefa_aprovada_em,
        updated_at: row.tarefa_updated_at,
        created_at: row.tarefa_created_at,
      }, String(row.motivo || '').startsWith('checklist_aprovado'), key || String(row.motivo || 'tarefa'))
    }

    // Fonte 2: cálculo de segurança a partir das tarefas aprovadas e checklists feitos.
    // Garante histórico antigo e cobre aprovações onde a inserção em tarefas_pontuacao falhou.
    for (const tarefa of tarefasExecutadas) {
      const dataBase = tarefa.aprovada_em || tarefa.data_conclusao || tarefa.updated_at || tarefa.created_at
      if (!inPeriod(dataBase)) continue

      const items = parseChecklistItems(tarefa.checklist)
      const feitos = items.filter(item => !!item.feito)

      if (feitos.length) {
        for (const item of feitos) {
          const participante = checklistExecutorId(item, tarefa)
          if (!participante) continue
          const key = rankingChecklistKey(item)
          touchMember(participante, calculateChecklistItemPoints(item, tarefa), {
            ...tarefa,
            subtarefa_titulo: item.texto,
            subtarefa_dificuldade: item.dificuldade,
          }, true, key)
        }
        continue
      }

      if (String(tarefa.status || '') === 'aprovada') {
        const participante = tarefa.aceita_por || tarefa.responsavel_id
        if (participante) {
          touchMember(participante, calculateChecklistItemPoints({ texto: tarefa.titulo, descricao: tarefa.descricao, pontuacao: tarefa.pontuacao }, tarefa), tarefa, false, 'tarefa_sem_checklist')
        }
      }
    }

    const ranking = Array.from(rankingMap.values()).sort((a, b) => {
      if (Number(b.pontos || 0) !== Number(a.pontos || 0)) return Number(b.pontos || 0) - Number(a.pontos || 0)
      if (Number(b.subtarefas_executadas || 0) !== Number(a.subtarefas_executadas || 0)) return Number(b.subtarefas_executadas || 0) - Number(a.subtarefas_executadas || 0)
      const bt = b.ultima_aprovacao ? new Date(b.ultima_aprovacao).getTime() : 0
      const at = a.ultima_aprovacao ? new Date(a.ultima_aprovacao).getTime() : 0
      if (bt !== at) return bt - at
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    })

    const livres = await queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE modo_distribuicao = 'livre_equipe' AND aceita_por IS NULL AND status IN ('pendente','em_progresso'))::int AS disponiveis,
         COUNT(*) FILTER (WHERE modo_distribuicao = 'livre_equipe' AND aceita_por IS NOT NULL AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS em_execucao,
         COUNT(*) FILTER (WHERE modo_distribuicao = 'livre_equipe' AND status IN ('concluida','aprovada'))::int AS concluidas
       FROM tarefas WHERE org_id = $1`,
      [orgId]
    )
    const resumoBase = livres || { disponiveis: 0, em_execucao: 0, concluidas: 0 }
    res.json({
      periodo,
      ranking,
      resumo: {
        ...resumoBase,
        membros: ranking.length,
        pontos: ranking.reduce((acc, item) => acc + Number(item.pontos || 0), 0),
        subtarefas_executadas: ranking.reduce((acc, item) => acc + Number(item.subtarefas_executadas || 0), 0),
        tarefas_executadas: ranking.reduce((acc, item) => acc + Number(item.tarefas_executadas || 0), 0),
      },
    })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar ranking:', err)
    res.status(500).json({ error: 'Erro ao buscar ranking de tarefas.' })
  }
})

// ── PEGAR TAREFA LIVRE DA EQUIPE ─────────────────────────────────────────────
router.post('/:id/pegar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!isFreeTeamTask(existing)) { res.status(400).json({ error: 'Esta tarefa não está disponível para pegar.' }); return }
    if (existing.aceita_por) { res.status(409).json({ error: 'Esta tarefa já foi selecionada por outro membro.' }); return }
    if (['concluida','aprovada','cancelada'].includes(String(existing.status))) { res.status(400).json({ error: 'Tarefa finalizada não pode ser selecionada.' }); return }

    const ativa = await queryOne<any>(
      `SELECT id, titulo FROM tarefas
       WHERE org_id = $1 AND aceita_por = $2 AND modo_distribuicao = 'livre_equipe'
         AND COALESCE(bloquear_nova_livre_ate_concluir, TRUE) = TRUE
         AND status IN ('pendente','em_progresso','devolvida','reenviada')
       LIMIT 1`,
      [orgId, userId]
    )
    if (ativa) {
      res.status(409).json({ error: `Você já pegou a tarefa "${ativa.titulo}". Conclua ou devolva antes de pegar outra.` })
      return
    }

    const active = await findOpenChecklistAssignedToUser(orgId, userId, req.params.id)
    if (active) {
      res.status(409).json({ error: `Você já assumiu uma subtarefa em aberto em "${active.task?.titulo || 'outra tarefa'}". Conclua e envie sua parte antes de assumir outra.` })
      return
    }

    const profile = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE', [userId, orgId])
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET aceita_por = $1, aceita_em = NOW(), responsavel_id = $1, responsavel_nome = $2,
          status = 'em_progresso', data_inicio = COALESCE(data_inicio, NOW()), escopo = 'equipe', updated_at = NOW()
       WHERE id = $3 AND org_id = $4 AND aceita_por IS NULL
       RETURNING *`,
      [userId, profile?.nome || null, req.params.id, orgId]
    )
    if (!tarefa) { res.status(409).json({ error: 'Tarefa já foi selecionada.' }); return }
    await addHistorico({ orgId, tarefaId: tarefa.id, userId, acao: 'tarefa_livre_aceita', statusAnterior: existing.status, statusNovo: 'em_progresso', observacao: `${profile?.nome || 'Membro'} assumiu a tarefa.` })
    if (existing.criado_por && existing.criado_por !== userId) {
      await criarNotificacao({ orgId, userId: existing.criado_por, tipo: 'tarefa_atualizada', titulo: '🙋 Tarefa selecionada', body: `${profile?.nome || 'Um membro'} assumiu a tarefa "${existing.titulo}".`, referenciaId: tarefa.id, referenciaTipo: 'tarefa' }).catch(() => {})
    }
    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao pegar tarefa:', err)
    res.status(500).json({ error: 'Erro ao pegar tarefa.' })
  }
})


async function findOpenChecklistAssignedToUser(orgId: string, userId: string, excludeTaskId?: string) {
  const rows = await query<any>(
    `SELECT id, titulo, checklist, status
       FROM tarefas
      WHERE org_id = $1
        AND COALESCE(escopo, 'pessoal') = 'equipe'
        AND COALESCE(status, 'pendente') NOT IN ('concluida','aprovada','cancelada')
        AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [orgId, excludeTaskId || null]
  )
  for (const row of rows) {
    const item = parseChecklistItems(row.checklist).find(check => check.responsavel_id === userId && !check.feito)
    if (item) return { task: row, item }
  }
  return null
}

// ── ASSUMIR SUBTAREFA/CHECKLIST DE TAREFA LIVRE ─────────────────────────────
router.post('/:id/checklist/:itemId/assumir', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    if (!isFreeTeamTask(existing) && normalizeTaskScope(existing.escopo) !== 'equipe') {
      res.status(400).json({ error: 'Somente tarefas da equipe permitem assumir subtarefa.' })
      return
    }
    if (['aprovada','cancelada'].includes(String(existing.status))) {
      res.status(400).json({ error: 'Tarefa finalizada não permite assumir subtarefa.' })
      return
    }

    const active = await findOpenChecklistAssignedToUser(orgId, userId)
    if (active) {
      res.status(409).json({ error: `Você já assumiu uma subtarefa em aberto em "${active.task?.titulo || 'outra tarefa'}". Conclua e envie sua parte antes de assumir outra.` })
      return
    }

    const profile = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE', [userId, orgId])
    const items = parseChecklistItems(existing.checklist)
    const index = items.findIndex(item => String(item.id || '') === String(req.params.itemId || ''))
    if (index < 0) { res.status(404).json({ error: 'Subtarefa não encontrada no checklist.' }); return }
    const item = items[index]
    if (item.feito) { res.status(400).json({ error: 'Esta subtarefa já foi concluída.' }); return }
    if (item.responsavel_id && item.responsavel_id !== userId) {
      res.status(409).json({ error: 'Esta subtarefa já está com outro responsável.' })
      return
    }

    items[index] = { ...item, responsavel_id: userId, responsavel_nome: profile?.nome || item.responsavel_nome || 'Membro' }
    const checklistJson = JSON.stringify(items)
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET checklist = $1, status = CASE WHEN status IN ('pendente','devolvida','reenviada') THEN 'em_progresso' ELSE status END,
          status_gestor = 'aguardando', escopo = 'equipe', modo_distribuicao = 'livre_equipe', data_inicio = COALESCE(data_inicio, NOW()), updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [checklistJson, req.params.id, orgId]
    )
    await syncChecklistTable({ orgId, tarefaId: req.params.id, userId, checklist: checklistJson })
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'subtarefa_assumida', statusAnterior: existing.status, statusNovo: tarefa?.status || existing.status, observacao: `${profile?.nome || 'Membro'} assumiu: ${item.texto}` })
    if (existing.criado_por && existing.criado_por !== userId) {
      await criarNotificacao({ orgId, userId: existing.criado_por, tipo: 'tarefa_atualizada', titulo: 'Subtarefa assumida', body: `${profile?.nome || 'Um membro'} assumiu "${item.texto}" em "${existing.titulo}".`, referenciaId: existing.id, referenciaTipo: 'tarefa' }).catch(() => {})
    }
    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao assumir subtarefa:', err)
    res.status(500).json({ error: 'Erro ao assumir subtarefa.' })
  }
})

// ── CRIAR TAREFA ─────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { titulo, descricao, data, prazo, prioridade = 'media', responsavel_id, checklist = [], obs, origem_sistema, origem_tipo, origem_id, origem_nome, origem_url, origem_payload } = req.body
    const requestedEscopo = normalizeTaskScope((req.body as any).escopo)
    const modoDistribuicao = normalizeTaskDistribution((req.body as any).modo_distribuicao)
    const pontuacaoManual = Number((req.body as any).pontuacao || 0)

    if (!['baixa','media','alta'].includes(prioridade)) { res.status(400).json({ error: 'Prioridade inválida.' }); return }

    const hasResponsavelField = Object.prototype.hasOwnProperty.call(req.body, 'responsavel_id')
    let responsavelId: string | null = hasResponsavelField ? (responsavel_id || null) : userId
    let escopo: 'pessoal' | 'equipe' = requestedEscopo

    const modoFinal = role === 'membro' ? 'normal' : modoDistribuicao

    if (role === 'membro') {
      // Membro continua criando tarefa pessoal normalmente, mas agora também pode
      // solicitar uma tarefa para um gestor/admin/subgestor da própria organização.
      // Isso não libera tarefa livre nem atribuição para outros membros.
      if (requestedEscopo === 'equipe' && responsavelId && responsavelId !== userId) {
        const destino = await queryOne<{ id: string; nome: string; role: string }>(
          'SELECT id, nome, role FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE',
          [responsavelId, orgId]
        )
        if (!destino) { res.status(404).json({ error: 'Responsável não encontrado.' }); return }
        if (!['admin','dev','gestor','sub_gestor'].includes(String(destino.role || ''))) {
          res.status(403).json({ error: 'Membro só pode solicitar tarefa para gestor, subgestor, admin ou dev.' }); return
        }
        escopo = 'equipe'
      } else {
        responsavelId = userId
        escopo = 'pessoal'
      }
    } else if (responsavelId) {
      const resp = await queryOne<{ id: string; nome: string; criado_por: string | null }>(
        'SELECT id, nome, criado_por FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE',
        [responsavelId, orgId]
      )
      if (!resp) { res.status(404).json({ error: 'Responsável não encontrado.' }); return }
      if (role === 'sub_gestor' && resp.id !== userId && resp.criado_por !== userId) {
        res.status(403).json({ error: 'Sub-gestor só pode atribuir tarefas para si ou seus comandados diretos.' }); return
      }
    }

    const tituloFinal = String(titulo || '').trim() || (escopo === 'equipe' ? 'Tarefa da equipe' : 'Tarefa pessoal')
    const contaRanking = escopo === 'equipe' && (req.body as any).conta_ranking !== false
    const responsavel = responsavelId ? await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1 AND org_id = $2', [responsavelId, orgId]) : null
    const criador = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId])
    const checklistNormalizado = escopo === 'equipe' ? await normalizeChecklistForOrg(checklist, orgId, userId, role) : '[]'
    const pontuacao = escopo === 'equipe' ? calculateTaskComplexityPoints({ titulo, descricao, prioridade, checklist: checklistNormalizado, origem_sistema, origem_tipo, origem_nome, origem_payload, manual: pontuacaoManual }) : 0

    // Proteção contra duplo clique/envio repetido: se a mesma tarefa foi criada
    // há poucos segundos pelo mesmo usuário, devolve a existente em vez de criar
    // vários cartões iguais no painel do gestor. Não apaga dados e não altera a API.
    const duplicate = await queryOne<any>(
      `SELECT * FROM tarefas
       WHERE org_id = $1
         AND criado_por = $2
         AND COALESCE(responsavel_id::text, '') = COALESCE($3::text, '')
         AND lower(trim(titulo)) = lower(trim($4))
         AND COALESCE(descricao, '') = COALESCE($5, '')
         AND COALESCE(prazo::text, '') = COALESCE($6::text, '')
         AND COALESCE(escopo, 'pessoal') = $7
         AND COALESCE(modo_distribuicao, 'normal') = $8
         AND created_at >= NOW() - INTERVAL '12 seconds'
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, userId, responsavelId, tituloFinal, descricao || '', prazo || '', escopo, modoFinal]
    )
    if (duplicate) {
      res.status(200).json({ tarefa: duplicate })
      return
    }

    const tarefa = await queryOne<any>(
      `INSERT INTO tarefas
         (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade, checklist, obs, escopo, modo_distribuicao, pontuacao, conta_ranking, bloquear_nova_livre_ate_concluir, status, status_gestor, origem_sistema, origem_tipo, origem_id, origem_nome, origem_url, origem_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,'pendente','aguardando',$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [orgId, userId, modoFinal === 'livre_equipe' ? null : responsavelId, modoFinal === 'livre_equipe' ? null : (responsavel?.nome || null), tituloFinal, descricao || null, data || null, prazo || null, prioridade, checklistNormalizado, obs || null, escopo, modoFinal, pontuacao, contaRanking, origem_sistema === 'destrava' ? 'destrava' : null, origem_tipo || null, origem_id || null, origem_nome || null, origem_url || null, origem_payload ? JSON.stringify(origem_payload) : null]
    )

    await syncChecklistTable({ orgId, tarefaId: tarefa.id, userId, checklist: checklistNormalizado })
    await addHistorico({ orgId, tarefaId: tarefa.id, userId, acao: 'criada', statusNovo: 'pendente', observacao: obs || null })
    await enviarEventoDestrava(tarefa, 'tarefa.criada', { observacao: obs || null })

    if (modoFinal !== 'livre_equipe' && responsavelId && responsavelId !== userId) {
      const prazoFmt = prazo ? ` — prazo: ${new Date(prazo).toLocaleDateString('pt-BR')}` : ''
      await criarNotificacao({
        orgId, userId: responsavelId,
        tipo: 'nova_tarefa',
        titulo: '📋 Nova tarefa atribuída a você!',
        body: `"${tituloFinal}" por ${criador?.nome || 'Gestor'}${prazoFmt}`,
        referenciaId: tarefa.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    const checklistExecutores = parseChecklistItems(checklistNormalizado).filter(item => item.responsavel_id && item.responsavel_id !== userId && item.responsavel_id !== responsavelId)
    for (const item of checklistExecutores) {
      await criarNotificacao({
        orgId,
        userId: item.responsavel_id!,
        tipo: 'nova_tarefa',
        titulo: '📋 Checklist atribuído a você',
        body: `"${item.texto}" dentro da tarefa "${tituloFinal}"${item.data ? ` — data: ${new Date(item.data).toLocaleDateString('pt-BR')}` : ''}`,
        referenciaId: tarefa.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.status(201).json({ tarefa })
  } catch (err) {
    console.error('[TAREFAS] Erro ao criar:', err)
    const statusCode = Number((err as any)?.statusCode || 0)
    if (statusCode === 403 || statusCode === 404) { res.status(statusCode).json({ error: (err as Error).message }); return }
    res.status(500).json({ error: 'Erro ao criar tarefa.' })
  }
})

// ── ATUALIZAR STATUS PELO MEMBRO ─────────────────────────────────────────────
router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { id } = req.params
    const { status, motivo_nao_conclusao, observacao_conclusao, resposta_membro } = req.body

    if (!['em_progresso','concluida','nao_concluida'].includes(status)) {
      res.status(400).json({ error: 'Status permitido: em_progresso, concluida ou nao_concluida.' }); return
    }
    if (status === 'nao_concluida' && !String(motivo_nao_conclusao || resposta_membro || '').trim()) {
      res.status(400).json({ error: 'Motivo é obrigatório para marcar como não concluída.' }); return
    }

    const existing = await getTaskForAccess(id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (existing.responsavel_id !== userId && existing.criado_por !== userId && !hasChecklistAssignedTo(existing, userId)) {
      res.status(403).json({ error: 'Você só pode atualizar status de tarefas atribuídas, criadas por você ou com checklist atribuído a você.' }); return
    }

    if (status === 'concluida') {
      const progresso = checklistProgress(existing)
      if (progresso.total > 0 && !progresso.completo) {
        res.status(400).json({
          error: `A tarefa só pode ser concluída depois que todos os checklists forem concluídos (${progresso.feitos}/${progresso.total}).`,
        })
        return
      }
    }

    const statusAnterior = existing.status
    const sets: string[] = ['status = $1', 'status_gestor = $2', 'updated_at = NOW()']
    const params: unknown[] = [status, status === 'em_progresso' ? existing.status_gestor || 'aguardando' : 'aguardando']
    let idx = 3

    if (status === 'em_progresso') sets.push(`data_inicio = COALESCE(data_inicio, NOW())`)
    if (status === 'concluida') {
      sets.push(`data_conclusao = NOW()`)
      sets.push(`observacao_conclusao = $${idx++}`); params.push(observacao_conclusao || resposta_membro || null)
      sets.push(`resposta_membro = $${idx++}`); params.push(resposta_membro || observacao_conclusao || null)
      sets.push(`resposta_status = 'concluida'`)
      sets.push(`resposta_obs = $${idx++}`); params.push(observacao_conclusao || resposta_membro || null)
      sets.push(`resposta_em = NOW()`)
    }
    if (status === 'nao_concluida') {
      sets.push(`motivo_nao_conclusao = $${idx++}`); params.push(motivo_nao_conclusao || resposta_membro)
      sets.push(`resposta_membro = $${idx++}`); params.push(resposta_membro || motivo_nao_conclusao)
      sets.push(`resposta_status = 'nao_concluida'`)
      sets.push(`resposta_obs = $${idx++}`); params.push(motivo_nao_conclusao || resposta_membro)
      sets.push(`resposta_em = NOW()`)
    }

    params.push(id, orgId)
    const tarefa = await queryOne<any>(`UPDATE tarefas SET ${sets.join(', ')} WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`, params)
    await addHistorico({ orgId, tarefaId: id, userId, acao: status, statusAnterior, statusNovo: status, observacao: motivo_nao_conclusao || observacao_conclusao || resposta_membro || null })

    if (existing.criado_por && existing.criado_por !== userId && status !== 'em_progresso') {
      await criarNotificacao({
        orgId,
        userId: existing.criado_por,
        tipo: status === 'concluida' ? 'tarefa_concluida' : 'tarefa_nao_concluida',
        titulo: status === 'concluida' ? '✅ Tarefa concluída!' : '❌ Tarefa não concluída',
        body: status === 'concluida' ? `A tarefa "${existing.titulo}" foi concluída.` : `A tarefa "${existing.titulo}" não foi concluída.`,
        referenciaId: id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar status:', err)
    res.status(500).json({ error: 'Erro ao atualizar status da tarefa.' })
  }
})



// ── ENVIAR LEMBRETE MANUAL DA TAREFA ────────────────────────────────────────
router.post('/:id/lembrete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    if (role === 'membro' && existing.criado_por !== userId) {
      res.status(403).json({ error: 'Somente gestor, criador ou responsável administrativo pode cobrar manualmente esta tarefa.' })
      return
    }

    const mensagem = String(req.body?.mensagem || '').trim()
    const recipients = await getTaskReminderRecipients(existing)
    const autor = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId]).catch(() => null)
    let enviados = 0
    for (const destinatario of recipients) {
      await criarNotificacao({
        orgId,
        userId: destinatario,
        tipo: 'tarefa_lembrete_manual',
        titulo: '🔔 Lembrete manual de tarefa',
        body: mensagem || `${autor?.nome || 'Gestor'} enviou um lembrete para a tarefa "${existing.titulo}". Verifique o prazo, execute sua parte ou regularize o andamento.`,
        referenciaId: existing.id,
        referenciaTipo: 'tarefa',
      })
      enviados++
    }
    await addHistorico({ orgId, tarefaId: existing.id, userId, acao: 'lembrete_manual', statusAnterior: existing.status, statusNovo: existing.status, observacao: mensagem || `Lembrete enviado para ${enviados} destinatário(s).` })
    res.json({ ok: true, enviados })
  } catch (err) {
    console.error('[TAREFAS] Erro ao enviar lembrete manual:', err)
    res.status(500).json({ error: 'Erro ao enviar lembrete manual da tarefa.' })
  }
})

// ── REGISTRAR PARTE DO EXECUTOR ──────────────────────────────────────────────
router.post('/:id/parte-concluida', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { observacao } = req.body || {}
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const podeRegistrarParte = hasChecklistAssignedTo(existing, userId) || existing.responsavel_id === userId || (!existing.responsavel_id && existing.criado_por === userId)
    if (!podeRegistrarParte) {
      res.status(403).json({ error: 'Você não possui checklist ou execução atribuída nesta tarefa.' })
      return
    }

    // Enviar a parte do membro deve ser uma ação final de execução. Para evitar
    // erro 400 no fluxo operacional, o backend marca automaticamente como feitos
    // os checklists que pertencem ao usuário logado e ainda estejam pendentes.
    // Itens de outros executores nunca são alterados aqui.
    const checklistAtual = parseChecklistItems(existing.checklist)
    let alterouChecklist = false
    const checklistExecutado = checklistAtual.map(item => {
      if (isChecklistItemExecutor(existing, item, userId) && !item.feito) {
        alterouChecklist = true
        return { ...item, feito: true }
      }
      return item
    })

    let baseTask: any = existing
    if (alterouChecklist) {
      const checklistJson = JSON.stringify(checklistExecutado)
      baseTask = await queryOne<any>(
        `UPDATE tarefas SET checklist = $1, data_inicio = COALESCE(data_inicio, NOW()), updated_at = NOW()
         WHERE id = $2 AND org_id = $3 RETURNING *`,
        [checklistJson, req.params.id, orgId]
      ) || existing
      await syncChecklistTable({ orgId, tarefaId: req.params.id, userId, checklist: checklistJson })
    }

    const minhaParte = checklistForUserProgress(baseTask, userId)
    const geral = checklistProgress(baseTask)

    let tarefaAtualizada: any = baseTask
    if (geral.completo && !['concluida', 'aprovada'].includes(String(baseTask.status))) {
      tarefaAtualizada = await queryOne<any>(
        `UPDATE tarefas SET
           status = 'concluida',
           status_gestor = 'aguardando',
           observacao_conclusao = COALESCE($1, observacao_conclusao),
           resposta_membro = COALESCE($1, resposta_membro),
           resposta_status = 'concluida',
           resposta_obs = COALESCE($1, resposta_obs),
           data_conclusao = NOW(),
           resposta_em = NOW(),
           updated_at = NOW()
         WHERE id = $2 AND org_id = $3 RETURNING *`,
        [String(observacao || '').trim() || null, req.params.id, orgId]
      ) || baseTask
    } else if (['pendente', 'devolvida', 'reenviada'].includes(String(baseTask.status))) {
      tarefaAtualizada = await queryOne<any>(
        `UPDATE tarefas SET
           status = 'em_progresso',
           data_inicio = COALESCE(data_inicio, NOW()),
           resposta_membro = COALESCE($1, resposta_membro),
           resposta_obs = COALESCE($1, resposta_obs),
           resposta_em = NOW(),
           updated_at = NOW()
         WHERE id = $2 AND org_id = $3 RETURNING *`,
        [String(observacao || '').trim() || null, req.params.id, orgId]
      ) || baseTask
    }

    await addHistorico({
      orgId,
      tarefaId: req.params.id,
      userId,
      acao: geral.completo ? 'checklist_completo' : 'parte_enviada',
      statusAnterior: existing.status,
      statusNovo: geral.completo ? 'concluida' : tarefaAtualizada.status,
      observacao: String(observacao || '').trim() || `Parte do executor enviada (${minhaParte.feitos || geral.feitos}/${minhaParte.total || geral.total}).`,
    })

    await enviarEventoDestrava(tarefaAtualizada || existing, geral.completo ? 'tarefa.checklist_completo' : 'tarefa.parte_enviada', { observacao: String(observacao || '').trim() || null, progresso: { feitos: geral.feitos, total: geral.total, completo: geral.completo } })

    if (existing.criado_por && existing.criado_por !== userId) {
      const autor = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId])
      await criarNotificacao({
        orgId,
        userId: existing.criado_por,
        tipo: geral.completo ? 'tarefa_concluida' : 'tarefa_atualizada',
        titulo: geral.completo ? '✅ Todas as partes foram concluídas' : '✅ Parte enviada pelo membro',
        body: geral.completo
          ? `${autor?.nome || 'Executor'} concluiu a última parte de "${existing.titulo}". Visualize a tarefa e os arquivos enviados.`
          : `${autor?.nome || 'Executor'} executou e enviou sua parte em "${existing.titulo}". Visualize os arquivos enviados e aguarde o restante da equipe.`,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.json({ ok: true, completa: geral.completo, feitos: geral.feitos, total: geral.total, tarefa: tarefaAtualizada })
  } catch (err) {
    console.error('[TAREFAS] Erro ao registrar parte concluída:', err)
    res.status(500).json({ error: 'Erro ao registrar parte concluída.' })
  }
})


// ── APROVAR ─────────────────────────────────────────────────────────────────
router.patch('/:id/aprovar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') { res.status(403).json({ error: 'Membro não aprova tarefa.' }); return }
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!)) || existing.criado_por !== userId) {
      res.status(403).json({ error: 'Você só pode aprovar tarefas criadas por você.' }); return
    }
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status = 'aprovada', status_gestor = 'aprovada', aprovada_em = NOW(), aprovada_por = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [userId, req.params.id, orgId]
    )
    if (existing.conta_ranking !== false) {
      const items = parseChecklistItems(existing.checklist)
      const periodo = periodMonth()
      if (items.length) {
        for (const item of items) {
          if (!item.feito) continue
          const participante = item.responsavel_id || existing.aceita_por || existing.responsavel_id
          if (!participante) continue
          const pontosItem = calculateChecklistItemPoints(item, existing)
          await query(
            `INSERT INTO tarefas_pontuacao (org_id, tarefa_id, usuario_id, checklist_id, pontos, motivo, aprovado_por, aprovado_em, periodo_mes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8)
             ON CONFLICT DO NOTHING`,
            [orgId, req.params.id, participante, item.id || item.texto || null, pontosItem, `checklist_aprovado:${item.id || item.texto}`, userId, periodo]
          ).catch(err => console.warn('[TAREFAS] Falha ao registrar pontuação de checklist:', (err as Error)?.message || err))
        }
      } else {
        const participante = existing.aceita_por || existing.responsavel_id
        if (participante) {
          await query(
            `INSERT INTO tarefas_pontuacao (org_id, tarefa_id, usuario_id, checklist_id, pontos, motivo, aprovado_por, aprovado_em, periodo_mes)
             VALUES ($1,$2,$3,NULL,$4,'tarefa_sem_checklist_aprovada',$5,NOW(),$6)
             ON CONFLICT DO NOTHING`,
            [orgId, req.params.id, participante, calculateChecklistItemPoints({ texto: existing.titulo, descricao: existing.descricao }, existing), userId, periodo]
          ).catch(err => console.warn('[TAREFAS] Falha ao registrar pontuação de tarefa:', (err as Error)?.message || err))
        }
      }
    }
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'aprovada', statusAnterior: existing.status, statusNovo: 'aprovada' })
    if (existing.responsavel_id && existing.responsavel_id !== userId) {
      await criarNotificacao({ orgId, userId: existing.responsavel_id, tipo: 'tarefa_aprovada', titulo: '✅ Tarefa aprovada', body: `"${existing.titulo}" foi aprovada.`, referenciaId: req.params.id, referenciaTipo: 'tarefa' }).catch(() => {})
    }
    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao aprovar:', err)
    res.status(500).json({ error: 'Erro ao aprovar tarefa.' })
  }
})

// ── DEVOLVER ────────────────────────────────────────────────────────────────
router.patch('/:id/devolver', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    if (role === 'membro') { res.status(403).json({ error: 'Membro não devolve tarefa.' }); return }
    const { ressalva_gestor } = req.body
    if (!String(ressalva_gestor || '').trim()) { res.status(400).json({ error: 'Ressalva é obrigatória.' }); return }
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!)) || existing.criado_por !== userId) {
      res.status(403).json({ error: 'Você só pode devolver tarefas criadas por você.' }); return
    }
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status = 'devolvida', status_gestor = 'devolvida', ressalva_gestor = $1, devolvida_em = NOW(), updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [String(ressalva_gestor).trim(), req.params.id, orgId]
    )
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'devolvida', statusAnterior: existing.status, statusNovo: 'devolvida', observacao: String(ressalva_gestor).trim() })
    if (existing.responsavel_id && existing.responsavel_id !== userId) {
      await criarNotificacao({ orgId, userId: existing.responsavel_id, tipo: 'tarefa_devolvida', titulo: '↩️ Tarefa devolvida', body: String(ressalva_gestor).trim(), referenciaId: req.params.id, referenciaTipo: 'tarefa' }).catch(() => {})
    }
    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao devolver:', err)
    res.status(500).json({ error: 'Erro ao devolver tarefa.' })
  }
})

// ── REABRIR / COMPLEMENTAR TAREFA APROVADA ─────────────────────────────────
router.patch('/:id/reabrir', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { complemento, prazo, prioridade } = req.body || {}
    if (!complemento?.trim()) { res.status(400).json({ error: 'Informe o complemento solicitado.' }); return }

    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    if (role === 'membro') { res.status(403).json({ error: 'Membro não pode reabrir tarefa.' }); return }
    if (!canDeleteOrgRecords(role) && existing.criado_por !== userId) { res.status(403).json({ error: 'Você só pode complementar tarefas criadas por você.' }); return }

    const carimbo = new Date().toLocaleString('pt-BR')
    const obsComplemento = `Complemento solicitado em ${carimbo}: ${complemento.trim()}`
    const novaObs = [existing.obs, obsComplemento].filter(Boolean).join('\n\n')

    const checklistComplementar = parseChecklistItems(existing.checklist)
    checklistComplementar.push({
      id: uuidv4(),
      texto: complemento.trim(),
      descricao: '',
      data: normalizeNullableDate(prazo) || undefined,
      responsavel_id: undefined,
      responsavel_nome: undefined,
      feito: false,
    })
    const checklistComplementarJson = JSON.stringify(checklistComplementar)

    const novaPrioridade = prioridade || existing.prioridade
    const novaPontuacao = calculateTaskComplexityPoints({
      titulo: existing.titulo,
      descricao: [existing.descricao, complemento].filter(Boolean).join(' '),
      prioridade: novaPrioridade,
      checklist: checklistComplementarJson,
      origem_sistema: existing.origem_sistema,
      origem_tipo: existing.origem_tipo,
      origem_nome: existing.origem_nome,
      origem_payload: existing.origem_payload,
      manual: existing.pontuacao,
    })

    const updated = await queryOne(
      `UPDATE tarefas SET
         status = 'pendente',
         status_gestor = 'aguardando',
         ressalva_gestor = NULL,
         resposta_membro = NULL,
         motivo_nao_conclusao = NULL,
         observacao_conclusao = NULL,
         resposta_status = NULL,
         resposta_obs = NULL,
         resposta_em = NULL,
         data_inicio = NULL,
         data_conclusao = NULL,
         aprovada_em = NULL,
         aprovada_por = NULL,
         devolvida_em = NULL,
         data_reabertura = NOW(),
         reaberto_por = $6,
         prazo = COALESCE($1, prazo),
         prioridade = COALESCE($2, prioridade),
         obs = $3,
         checklist = $4,
         pontuacao = $5,
         conta_ranking = TRUE,
         updated_at = NOW()
       WHERE id = $7 AND org_id = $8
       RETURNING *`,
      [prazo || null, prioridade || null, novaObs, checklistComplementarJson, novaPontuacao, userId, req.params.id, orgId]
    )

    await query('DELETE FROM tarefas_pontuacao WHERE org_id = $1 AND tarefa_id = $2', [orgId, req.params.id]).catch(() => {})

    await addHistorico({
      orgId,
      tarefaId: req.params.id,
      userId,
      acao: 'complemento_solicitado',
      statusAnterior: existing.status,
      statusNovo: 'pendente',
      observacao: complemento.trim(),
    })

    if (existing.responsavel_id && existing.responsavel_id !== userId) {
      await criarNotificacao({
        orgId,
        userId: existing.responsavel_id,
        tipo: 'tarefa_atualizada',
        titulo: 'Complemento solicitado em tarefa',
        body: updated?.titulo || existing.titulo,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.json({ tarefa: sanitizeTaskForUser(updated, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao reabrir/complementar:', err)
    res.status(500).json({ error: 'Erro ao reabrir tarefa.' })
  }
})

// ── REENVIAR CORREÇÃO APÓS DEVOLUÇÃO ────────────────────────────────────────
router.patch('/:id/reenviar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { observacao } = req.body || {}
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    if (existing.responsavel_id !== userId && existing.criado_por !== userId) {
      res.status(403).json({ error: 'Você só pode reenviar tarefas atribuídas ou criadas por você.' }); return
    }
    if (existing.status !== 'devolvida') {
      res.status(400).json({ error: 'Somente tarefas devolvidas podem ser reenviadas.' }); return
    }

    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET
         status = 'reenviada',
         status_gestor = 'aguardando',
         resposta_membro = COALESCE($1, resposta_membro),
         observacao_conclusao = COALESCE($1, observacao_conclusao),
         reenviada_em = NOW(),
         updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
      [String(observacao || '').trim() || null, req.params.id, orgId]
    )

    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'reenviada', statusAnterior: existing.status, statusNovo: 'reenviada', observacao: String(observacao || '').trim() || null })

    if (existing.criado_por && existing.criado_por !== userId) {
      const autor = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1', [userId])
      await criarNotificacao({
        orgId,
        userId: existing.criado_por,
        tipo: 'tarefa_reenviada',
        titulo: `${autor?.nome || 'Membro'} reenviou a tarefa`,
        body: `"${existing.titulo}" foi reenviada para conferência.`,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao reenviar:', err)
    res.status(500).json({ error: 'Erro ao reenviar tarefa.' })
  }
})

// ── HISTÓRICO ────────────────────────────────────────────────────────────────
router.get('/:id/historico', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(task, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    const historico = await query(
      `SELECT h.*, p.nome AS usuario_nome
       FROM tarefas_historico h
       LEFT JOIN profiles p ON p.id = h.user_id
       WHERE h.tarefa_id = $1 AND h.org_id = $2
       ORDER BY h.created_at DESC`,
      [req.params.id, orgId]
    ).catch(() => [])
    res.json({ historico })
  } catch (err) {
    console.error('[TAREFAS] Erro historico:', err)
    res.status(500).json({ error: 'Erro ao buscar histórico.' })
  }
})


// ── ANEXOS / EVIDÊNCIAS DA TAREFA ────────────────────────────────────────────
// GET /api/tarefas/:id/anexos
router.get('/:id/anexos', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(task, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const anexos = await query(
      `SELECT a.*, p.nome AS enviado_por_nome
       FROM tarefa_anexos a
       LEFT JOIN profiles p ON p.id = a.enviado_por
       WHERE a.tarefa_id = $1 AND a.org_id = $2
       ORDER BY a.created_at DESC`,
      [req.params.id, orgId]
    )

    res.json({ anexos })
  } catch (err) {
    console.error('[TAREFAS] Erro ao listar anexos:', err)
    res.status(500).json({ error: 'Erro ao buscar anexos da tarefa.' })
  }
})

// POST /api/tarefas/:id/anexos
// Usado pelo membro para anexar arquivos da execução e pelo gestor para anexar referência/orientação.
router.post('/:id/anexos', uploadEvidenceFile, async (req: MulterTaskRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Nenhum arquivo enviado.' }); return }

    const { orgId, userId } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) {
      removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(404).json({ error: 'Tarefa não encontrada.' })
      return
    }
    if (!(await userCanAccessTask(task, req.user!))) {
      removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(403).json({ error: 'Acesso negado.' })
      return
    }

    const { titulo, descricao, tipo = 'evidencia' } = req.body
    const arquivoUrl = buildUploadUrl(req.file.filename)
    const anexo = await queryOne(
      `INSERT INTO tarefa_anexos
         (org_id, tarefa_id, enviado_por, titulo, descricao, tipo, arquivo_url, nome_original, mime_type, tamanho)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        orgId,
        req.params.id,
        userId,
        String(titulo || req.file.originalname || 'Anexo da tarefa').trim(),
        descricao ? String(descricao).trim() : null,
        String(tipo || 'evidencia').trim(),
        arquivoUrl,
        req.file.originalname || null,
        req.file.mimetype || null,
        req.file.size || null,
      ]
    )

    await addHistorico({
      orgId,
      tarefaId: req.params.id,
      userId,
      acao: 'anexo_adicionado',
      statusAnterior: task.status,
      statusNovo: task.status,
      observacao: `${anexo?.titulo || 'Anexo'} (${req.file.originalname || req.file.filename})`,
    })

    await enviarEventoDestrava(task, 'tarefa.arquivo_enviado', { arquivo: { titulo: anexo?.titulo || null, nome_original: req.file.originalname || null, mime_type: req.file.mimetype || null, tamanho: req.file.size || null }, observacao: descricao ? String(descricao).trim() : null })

    if (task.criado_por && task.criado_por !== userId) {
      await criarNotificacao({
        orgId,
        userId: task.criado_por,
        tipo: 'tarefa_atualizada',
        titulo: '📎 Anexo enviado na tarefa',
        body: `Foi anexado um arquivo na tarefa "${task.titulo}".`,
        referenciaId: req.params.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
    }

    res.status(201).json({ anexo })
  } catch (err) {
    if (req.file) { removeUploadByUrl(buildUploadUrl(req.file.filename)) }
    const msg = uploadErrorMessage(err)
    console.error('[TAREFAS] Erro ao anexar:', msg)
    res.status(500).json({ error: msg })
  }
})


// GET /api/tarefas/:id/anexos/:anexoId/arquivo
// Entrega o arquivo pelo backend autenticado, evitando 404 de imagem por link /uploads antigo ou cache do Nginx.
router.get('/:id/anexos/:anexoId/arquivo', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(task, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const anexo = await queryOne<any>(
      `SELECT * FROM tarefa_anexos WHERE id = $1 AND tarefa_id = $2 AND org_id = $3`,
      [req.params.anexoId, req.params.id, orgId]
    )
    if (!anexo) { res.status(404).json({ error: 'Arquivo da tarefa não encontrado.' }); return }

    const filename = filenameFromUploadUrl(anexo.arquivo_url)
    if (!filename) { res.status(404).json({ error: 'Arquivo físico não localizado.' }); return }

    const filePath = safeUploadPathFromFilename(filename)
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Arquivo físico não encontrado no servidor.' })
      return
    }

    const originalName = path.basename(String(anexo.nome_original || anexo.titulo || filename)).replace(/[\r\n"]/g, '') || filename
    const disposition = req.query.download === '1' ? 'attachment' : 'inline'
    if (anexo.mime_type) res.setHeader('Content-Type', anexo.mime_type)
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(originalName)}"; filename*=UTF-8''${encodeURIComponent(originalName)}`)
    res.setHeader('Cache-Control', 'private, max-age=60')
    res.sendFile(filePath)
  } catch (err) {
    console.error('[TAREFAS] Erro ao abrir arquivo da tarefa:', err)
    res.status(500).json({ error: 'Erro ao abrir arquivo da tarefa.' })
  }
})

// DELETE /api/tarefas/:id/anexos/:anexoId
router.delete('/:id/anexos/:anexoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const task = await getTaskForAccess(req.params.id, orgId)
    if (!task) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(task, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const anexo = await queryOne<any>(
      `SELECT * FROM tarefa_anexos WHERE id = $1 AND tarefa_id = $2 AND org_id = $3`,
      [req.params.anexoId, req.params.id, orgId]
    )
    if (!anexo) { res.status(404).json({ error: 'Anexo não encontrado.' }); return }

    const canDelete = canDeleteOrgRecords(role) || anexo.enviado_por === userId || task.criado_por === userId || role === 'sub_gestor'
    if (!canDelete) { res.status(403).json({ error: 'Você não tem permissão para excluir este anexo.' }); return }

    removeUploadByUrl(anexo.arquivo_url)

    await query('DELETE FROM tarefa_anexos WHERE id = $1 AND tarefa_id = $2 AND org_id = $3', [req.params.anexoId, req.params.id, orgId])
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'anexo_removido', statusAnterior: task.status, statusNovo: task.status, observacao: anexo.titulo || anexo.nome_original || null })
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir anexo:', err)
    res.status(500).json({ error: 'Erro ao excluir anexo da tarefa.' })
  }
})

// ── BUSCAR TAREFA ────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId } = req.user!
    const tarefa = await getTaskForAccess(req.params.id, orgId)
    if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(tarefa, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }
    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao buscar:', err)
    res.status(500).json({ error: 'Erro ao buscar tarefa.' })
  }
})

// ── EDITAR TAREFA ────────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (!(await userCanAccessTask(existing, req.user!))) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const isMember = role === 'membro'
    const allowed = isMember
      ? ['checklist', 'obs']
      : ['titulo','descricao','data','prazo','prioridade','responsavel_id','checklist','obs','escopo','modo_distribuicao','pontuacao','conta_ranking']

    if ((req.body as any).checklist !== undefined) {
      const changedItems = changedChecklistDoneItems(existing.checklist, (req.body as any).checklist)
      const invalidItem = changedItems.find(item => !isChecklistItemExecutor(existing, item, userId))
      if (invalidItem) {
        res.status(403).json({ error: 'Apenas o executor de cada checklist pode marcar o próprio item.' })
        return
      }
    }

    // Usa um mapa de colunas para evitar erro PostgreSQL "multiple assignments to same column".
    // Esse erro acontecia quando o frontend enviava pontuacao/conta_ranking e, ao mesmo tempo,
    // o checklist complementar reabria a tarefa e também tentava atualizar esses campos.
    const setMap = new Map<string, { raw?: string; value?: unknown }>()
    const setValue = (column: string, value: unknown) => setMap.set(column, { value })
    const setRaw = (column: string, raw: string) => setMap.set(column, { raw })

    let nextChecklistForSync: string | null = null
    let checklistStructureChanged = false
    let voltouParaExecucao = false

    for (const key of allowed) {
      if ((req.body as any)[key] === undefined) continue

      if (key === 'responsavel_id') {
        const nextResponsavel = (req.body as any)[key] || null
        if (!nextResponsavel) {
          setValue('responsavel_id', null)
          setValue('responsavel_nome', null)
        } else {
          const resp = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1 AND org_id = $2 AND ativo = TRUE', [nextResponsavel, orgId])
          if (!resp) { res.status(404).json({ error: 'Responsável não encontrado.' }); return }
          setValue('responsavel_id', nextResponsavel)
          setValue('responsavel_nome', resp.nome)
        }
        continue
      }

      if (key === 'escopo') {
        setValue('escopo', normalizeTaskScope((req.body as any)[key]))
        continue
      }

      if (key === 'modo_distribuicao') {
        const nextMode = normalizeTaskDistribution((req.body as any)[key])
        setValue('modo_distribuicao', nextMode)
        if (nextMode === 'livre_equipe') {
          setValue('responsavel_id', null)
          setValue('responsavel_nome', null)
          setValue('aceita_por', null)
          setValue('aceita_em', null)
          setValue('escopo', 'equipe')
        }
        continue
      }

      if (key === 'prioridade') {
        setValue('prioridade', normalizePriority((req.body as any)[key], existing.prioridade))
        continue
      }

      if (key === 'data' || key === 'prazo') {
        setValue(key, normalizeNullableDate((req.body as any)[key]))
        continue
      }

      if (key === 'titulo') {
        const nextTitulo = String((req.body as any)[key] || '').trim() || (normalizeTaskScope((req.body as any).escopo ?? existing.escopo) === 'equipe' ? 'Tarefa da equipe' : 'Tarefa pessoal')
        setValue('titulo', nextTitulo)
        continue
      }

      if (key === 'descricao' || key === 'obs') {
        const text = String((req.body as any)[key] || '').trim()
        setValue(key, text || null)
        continue
      }

      if (key === 'pontuacao') {
        setValue('pontuacao', normalizePositiveScore((req.body as any)[key], existing.pontuacao || 1))
        continue
      }

      if (key === 'conta_ranking') {
        setValue('conta_ranking', (req.body as any)[key] !== false)
        continue
      }

      if (key === 'checklist') {
        const nextChecklist = await normalizeChecklistForOrg((req.body as any)[key], orgId, userId, role)
        nextChecklistForSync = nextChecklist
        setValue('checklist', nextChecklist)

        checklistStructureChanged = checklistStructureKey(existing.checklist) !== checklistStructureKey(nextChecklist)
        voltouParaExecucao = checklistStructureChanged && statusShouldReturnToExecution(existing.status)

        if (voltouParaExecucao) {
          setValue('status', 'pendente')
          setValue('status_gestor', 'aguardando')
          setValue('ressalva_gestor', null)
          setValue('resposta_membro', null)
          setValue('motivo_nao_conclusao', null)
          setValue('observacao_conclusao', null)
          setValue('resposta_status', null)
          setValue('resposta_obs', null)
          setValue('resposta_em', null)
          setValue('data_inicio', null)
          setValue('data_conclusao', null)
          setValue('aprovada_em', null)
          setValue('aprovada_por', null)
          setValue('devolvida_em', null)
          setRaw('data_reabertura', 'NOW()')
          setValue('reaberto_por', userId)
          setValue('conta_ranking', normalizeTaskScope(existing.escopo) === 'equipe')
          setValue('pontuacao', normalizeTaskScope(existing.escopo) === 'equipe' ? calculateTaskComplexityPoints({
            titulo: (req.body as any).titulo || existing.titulo,
            descricao: (req.body as any).descricao || existing.descricao,
            prioridade: (req.body as any).prioridade || existing.prioridade,
            checklist: nextChecklist,
            origem_sistema: existing.origem_sistema,
            origem_tipo: existing.origem_tipo,
            origem_nome: existing.origem_nome,
            origem_payload: existing.origem_payload,
            manual: (req.body as any).pontuacao || existing.pontuacao,
          }) : 0)
        }
        continue
      }
    }

    const finalEscopo = normalizeTaskScope(setMap.get('escopo')?.value ?? existing.escopo)
    if (finalEscopo === 'pessoal') {
      setValue('escopo', 'pessoal')
      setValue('modo_distribuicao', 'normal')
      setValue('conta_ranking', false)
      setValue('pontuacao', 0)
      setValue('checklist', '[]')
      nextChecklistForSync = '[]'
      setValue('aceita_por', null)
      setValue('aceita_em', null)
      // Tarefa pessoal fica privada para o próprio usuário/criador.
      if (existing.criado_por === userId || !existing.responsavel_id) {
        setValue('responsavel_id', userId)
        const me = await queryOne<{ nome: string }>('SELECT nome FROM profiles WHERE id = $1 AND org_id = $2', [userId, orgId]).catch(() => null)
        setValue('responsavel_nome', me?.nome || null)
      }
    } else if (setMap.get('conta_ranking')?.value === undefined) {
      setValue('conta_ranking', true)
    }

    if (!setMap.size) { res.status(400).json({ error: 'Nenhum campo para atualizar.' }); return }

    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1
    for (const [column, item] of setMap.entries()) {
      if (item.raw !== undefined) {
        sets.push(`${column} = ${item.raw}`)
      } else {
        sets.push(`${column} = $${idx++}`)
        params.push(item.value)
      }
    }

    params.push(req.params.id, orgId)
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`,
      params
    )

    if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada para atualizar.' }); return }

    if (nextChecklistForSync !== null) {
      await syncChecklistTable({ orgId, tarefaId: req.params.id, userId, checklist: tarefa.checklist })
    }

    if (voltouParaExecucao) {
      await query('DELETE FROM tarefas_pontuacao WHERE org_id = $1 AND tarefa_id = $2', [orgId, req.params.id]).catch(() => {})
      await addHistorico({
        orgId,
        tarefaId: req.params.id,
        userId,
        acao: 'complemento_solicitado',
        statusAnterior: existing.status,
        statusNovo: tarefa.status,
        observacao: 'Checklist complementar adicionado; tarefa voltou para execução.',
      })
      if (tarefa.responsavel_id && tarefa.responsavel_id !== userId) {
        await criarNotificacao({
          orgId,
          userId: tarefa.responsavel_id,
          tipo: 'tarefa_atualizada',
          titulo: 'Tarefa reaberta para complemento',
          body: `A tarefa "${tarefa.titulo}" recebeu nova ação no checklist e voltou para execução.`,
          referenciaId: tarefa.id,
          referenciaTipo: 'tarefa',
        }).catch(() => {})
      }
    } else {
      await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: 'atualizada', statusAnterior: existing.status, statusNovo: tarefa.status })
    }

    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao atualizar:', err)
    const statusCode = Number((err as any)?.statusCode || 0)
    if (statusCode === 403 || statusCode === 404) { res.status(statusCode).json({ error: (err as Error).message }); return }
    const pgCode = String((err as any)?.code || '')
    if (['22007', '22008', '23514', '22P02', '42703', '42710'].includes(pgCode)) {
      res.status(400).json({ error: 'Não foi possível salvar: revise data, prioridade, responsável e checklist. Se acabou de atualizar, faça um novo deploy para preparar o banco.' })
      return
    }
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' })
  }
})

// ── RESPONDER: compatibilidade com frontend antigo ───────────────────────────
router.post('/:id/resposta', async (req: Request, res: Response): Promise<void> => {
  try {
    const { resposta_status, resposta_obs } = req.body
    req.body.status = resposta_status === 'nao_concluida' ? 'nao_concluida' : 'concluida'
    req.body.motivo_nao_conclusao = resposta_status === 'nao_concluida' ? resposta_obs : undefined
    req.body.observacao_conclusao = resposta_status === 'concluida' ? resposta_obs : undefined
    // Encaminha logicamente replicando o update de status sem redirect HTTP.
    const { orgId, userId } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    if (existing.responsavel_id !== userId && existing.criado_por !== userId) { res.status(403).json({ error: 'Acesso negado.' }); return }
    const status = req.body.status
    if (status === 'nao_concluida' && !String(resposta_obs || '').trim()) { res.status(400).json({ error: 'Motivo é obrigatório.' }); return }
    const tarefa = await queryOne<any>(
      `UPDATE tarefas SET status = $1, status_gestor = 'aguardando', resposta_status = $2, resposta_obs = $3,
          resposta_membro = $3,
          motivo_nao_conclusao = CASE WHEN $1 = 'nao_concluida' THEN $3 ELSE motivo_nao_conclusao END,
          observacao_conclusao = CASE WHEN $1 = 'concluida' THEN $3 ELSE observacao_conclusao END,
          data_conclusao = CASE WHEN $1 = 'concluida' THEN NOW() ELSE data_conclusao END,
          resposta_em = NOW(), updated_at = NOW()
       WHERE id = $4 AND org_id = $5 RETURNING *`,
      [status, resposta_status, resposta_obs || null, req.params.id, orgId]
    )
    await addHistorico({ orgId, tarefaId: req.params.id, userId, acao: status, statusAnterior: existing.status, statusNovo: status, observacao: resposta_obs || null })
    res.json({ tarefa: sanitizeTaskForUser(tarefa, req.user!) })
  } catch (err) {
    console.error('[TAREFAS] Erro ao responder:', err)
    res.status(500).json({ error: 'Erro ao registrar resposta.' })
  }
})

// ── EXCLUIR TAREFA ───────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const existing = await getTaskForAccess(req.params.id, orgId)
    if (!existing) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
    const canDeleteAny = canDeleteOrgRecords(role)
    if (role === 'membro' && existing.criado_por !== userId) { res.status(403).json({ error: 'Membro só exclui tarefas pessoais criadas por ele.' }); return }
    if (!canDeleteAny && role !== 'membro' && existing.criado_por !== userId && existing.responsavel_id !== userId) { res.status(403).json({ error: 'Acesso negado.' }); return }

    const anexos = await query<{ arquivo_url?: string }>('SELECT arquivo_url FROM tarefa_anexos WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId])
    await query('BEGIN')
    try {
      await query('DELETE FROM tarefa_anexos WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query('DELETE FROM tarefa_checklist WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query('DELETE FROM tarefas_historico WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query('DELETE FROM tarefa_historico WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query('DELETE FROM tarefas_pontuacao WHERE tarefa_id = $1 AND org_id = $2', [req.params.id, orgId]).catch(() => {})
      await query("DELETE FROM agenda WHERE org_id = $2 AND origem_id = $1 AND origem_tipo IN ('tarefa','checklist')", [req.params.id, orgId]).catch(() => {})
      const deleted = await query('DELETE FROM tarefas WHERE id = $1 AND org_id = $2 RETURNING id', [req.params.id, orgId]) as any[]
      if (deleted.length === 0) throw new Error('Tarefa não encontrada para exclusão.')
      await query('COMMIT')
    } catch (cleanupErr) {
      await query('ROLLBACK').catch(() => {})
      throw cleanupErr
    }
    for (const anexo of anexos) removeUploadByUrl(anexo.arquivo_url)
    res.json({ ok: true })
  } catch (err) {
    console.error('[TAREFAS] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir tarefa.' })
  }
})

export default router
