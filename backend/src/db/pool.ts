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

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: positiveNumber(process.env.DB_POOL_MAX, 20),
  idleTimeoutMillis: positiveNumber(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  connectionTimeoutMillis: positiveNumber(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
  query_timeout: positiveNumber(process.env.DB_QUERY_TIMEOUT_MS, 60000),
  statement_timeout: positiveNumber(process.env.DB_STATEMENT_TIMEOUT_MS, 60000),
})

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message)
})

export default pool

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
