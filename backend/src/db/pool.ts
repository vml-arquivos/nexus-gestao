import { Pool } from 'pg'

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

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
