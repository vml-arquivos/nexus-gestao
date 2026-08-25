import { Pool, types } from 'pg'

// ── CORREÇÃO DE FUSO HORÁRIO EM COLUNAS DATE ──────────────────────────────────
// Por padrão, o driver `pg` converte colunas do tipo DATE em objetos JS Date
// interpretados como meia-noite UTC. Ao serializar essa data em JSON
// (ex: "2026-07-23T00:00:00.000Z") e exibi-la no fuso do Brasil (UTC-3),
// o valor pode aparecer um dia (e, em datas de início/fim de mês, um mês)
// antes do que foi realmente salvo.
// OID 1082 = tipo `date` do PostgreSQL. Retornar a string bruta ("YYYY-MM-DD")
// em vez de um objeto Date remove essa ambiguidade em todas as tabelas
// (tarefas.prazo, pagamentos.vencimento, agenda, etc.) sem alterar nenhuma
// query existente.
types.setTypeParser(1082, (value: string) => value)

// ── POOL DE CONEXÃO POSTGRESQL ────────────────────────────────────────────────
// Usa a variável DATABASE_URL definida no .env / Coolify
// Formato: postgres://usuario:senha@host:porta/banco

// Detecta automaticamente se SSL é necessário:
// 1. Variável DATABASE_SSL=true (configurada no Coolify)
// 2. DATABASE_URL contém sslmode=require
// 3. DATABASE_URL contém ?ssl=true
const dbUrl = process.env.DATABASE_URL || ''
const needsSsl =
  process.env.DATABASE_SSL === 'true' ||
  dbUrl.includes('sslmode=require') ||
  dbUrl.includes('ssl=true')

export function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

const poolMax = boundedInteger(process.env.DB_POOL_MAX, 12, 2, 50)
// DB_CONNECT_TIMEOUT_MS existia nas releases 47/49. Mantemos o alias para que
// o redeploy não dependa de renomear a variável já cadastrada no Coolify.
const connectionTimeoutMs = boundedInteger(
  process.env.DB_CONNECTION_TIMEOUT_MS ?? process.env.DB_CONNECT_TIMEOUT_MS,
  4_000,
  1_000,
  30_000,
)
const statementTimeoutMs = boundedInteger(process.env.DB_STATEMENT_TIMEOUT_MS, 15_000, 1_000, 120_000)
const queryTimeoutMs = boundedInteger(process.env.DB_QUERY_TIMEOUT_MS, 18_000, statementTimeoutMs, 130_000)
const lockTimeoutMs = boundedInteger(process.env.DB_LOCK_TIMEOUT_MS, 5_000, 500, 30_000)
const idleInTransactionTimeoutMs = boundedInteger(
  process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  15_000,
  5_000,
  120_000,
)

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: connectionTimeoutMs,
  statement_timeout: statementTimeoutMs,
  query_timeout: queryTimeoutMs,
  lock_timeout: lockTimeoutMs,
  idle_in_transaction_session_timeout: idleInTransactionTimeoutMs,
  application_name: 'nexus-api',
})

console.log(
  `[DB] Pool max=${poolMax}; connect=${connectionTimeoutMs}ms; query=${queryTimeoutMs}ms; ` +
  `statement=${statementTimeoutMs}ms; lock=${lockTimeoutMs}ms; idle_tx=${idleInTransactionTimeoutMs}ms`,
)

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message)
})

// Bancos antigos podem ter a tabela tarefas_pontuacao criada antes da chave
// UNIQUE (tarefa_id, usuario_id, motivo). As rotas de aprovação usam
// ON CONFLICT nessas três colunas; sem a chave, o PostgreSQL retorna 500.
//
// A preparação roda antes de entregar a primeira conexão ao backend:
// - mantém apenas o registro lógico mais recente quando houver duplicidade;
// - cria o índice único que serve como alvo do ON CONFLICT;
// - é idempotente e não bloqueia o restante do sistema se a tabela ainda não
//   existir durante a execução inicial das migrations.
// A preparação de compatibilidade da pontuação (ver ensureTaskScoreCompatibilityOnce
// em db/taskScoreCompatibility.ts) NÃO roda mais aqui. Rodar em toda conexão nova
// (inclusive a primeira, da própria migração) fazia qualquer travamento de lock
// nessa rotina travar o sistema inteiro, incluindo o startup. Agora ela é chamada
// uma única vez, explicitamente, pelo próprio migrate.ts, depois do schema
// principal, com lock não bloqueante -- nunca mais no caminho de toda conexão.

export default pool

export function getPoolStatus() {
  return {
    max: poolMax,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    timeouts_ms: {
      connection: connectionTimeoutMs,
      statement: statementTimeoutMs,
      query: queryTimeoutMs,
      lock: lockTimeoutMs,
      idle_transaction: idleInTransactionTimeoutMs,
    },
  }
}

export function isTransientDatabaseError(error: unknown): boolean {
  const err = error as { code?: string; message?: string }
  const code = String(err?.code || '')
  const message = String(err?.message || '').toLowerCase()
  return ['53300', '53400', '55P03', '57014', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006', '08007', '08P01']
    .includes(code)
    || message.includes('timeout')
    || message.includes('connection terminated')
    || message.includes('connection refused')
    || message.includes('cannot connect')
    || message.includes('remaining connection slots')
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}
