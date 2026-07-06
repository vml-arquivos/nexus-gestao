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

// Bancos antigos podem ter a tabela tarefas_pontuacao criada antes da chave
// UNIQUE (tarefa_id, usuario_id, motivo). As rotas de aprovação usam
// ON CONFLICT nessas três colunas; sem a chave, o PostgreSQL retorna 500.
//
// A preparação roda antes de entregar a primeira conexão ao backend:
// - mantém apenas o registro lógico mais recente quando houver duplicidade;
// - cria o índice único que serve como alvo do ON CONFLICT;
// - é idempotente e não bloqueia o restante do sistema se a tabela ainda não
//   existir durante a execução inicial das migrations.
const rawConnect = pool.connect.bind(pool)
let taskScoreCompatibilityReady = false
let taskScoreCompatibilityPromise: Promise<void> | null = null

async function ensureTaskScoreCompatibility(): Promise<void> {
  if (taskScoreCompatibilityReady) return
  if (taskScoreCompatibilityPromise) return taskScoreCompatibilityPromise

  taskScoreCompatibilityPromise = (async () => {
    const client = await rawConnect()
    let transactionStarted = false
    try {
      const tableResult = await client.query<{ table_name: string | null }>(
        "SELECT to_regclass('public.tarefas_pontuacao')::text AS table_name",
      )
      if (!tableResult.rows[0]?.table_name) return

      await client.query('BEGIN')
      transactionStarted = true
      await client.query('SELECT pg_advisory_xact_lock(732145987)')
      await client.query(`
        DELETE FROM tarefas_pontuacao atual
        USING (
          SELECT id
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY tarefa_id, usuario_id, motivo
                ORDER BY aprovado_em DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
              ) AS ordem
            FROM tarefas_pontuacao
            WHERE tarefa_id IS NOT NULL
              AND motivo IS NOT NULL
          ) ranqueado
          WHERE ordem > 1
        ) duplicado
        WHERE atual.id = duplicado.id
      `)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_tarefas_pontuacao_tarefa_usuario_motivo
          ON tarefas_pontuacao (tarefa_id, usuario_id, motivo)
      `)
      await client.query('COMMIT')
      transactionStarted = false
      taskScoreCompatibilityReady = true
    } catch (err) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
  })().finally(() => {
    taskScoreCompatibilityPromise = null
  })

  return taskScoreCompatibilityPromise
}

async function prepareTaskScoreCompatibilitySafely() {
  try {
    await ensureTaskScoreCompatibility()
  } catch (err) {
    console.warn(
      '[DB] Compatibilidade da pontuação de tarefas não pôde ser preparada nesta conexão:',
      err instanceof Error ? err.message : err,
    )
  }
}

// O pg usa connect tanto como Promise quanto com callback dentro de pool.query.
// Preservar as duas assinaturas evita regressão nas consultas existentes.
;(pool as any).connect = (callback?: unknown) => {
  if (typeof callback === 'function') {
    void prepareTaskScoreCompatibilitySafely().then(() => {
      ;(rawConnect as any)(callback)
    })
    return undefined
  }

  return prepareTaskScoreCompatibilitySafely().then(() => rawConnect())
}

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
