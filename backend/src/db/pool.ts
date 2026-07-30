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
// A preparação de compatibilidade da pontuação (ver ensureTaskScoreCompatibilityOnce
// em db/taskScoreCompatibility.ts) NÃO roda mais aqui. Rodar em toda conexão nova
// (inclusive a primeira, da própria migração) fazia qualquer travamento de lock
// nessa rotina travar o sistema inteiro, incluindo o startup. Agora ela é chamada
// uma única vez, explicitamente, pelo próprio migrate.ts, depois do schema
// principal, com lock não bloqueante -- nunca mais no caminho de toda conexão.

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
