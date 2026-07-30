import pool from './pool'

let ready = false

/**
 * Bancos antigos podem ter a tabela tarefas_pontuacao criada antes da chave
 * UNIQUE (tarefa_id, usuario_id, motivo). As rotas de aprovação usam
 * ON CONFLICT nessas três colunas; sem a chave, o PostgreSQL retorna 500.
 *
 * IMPORTANTE: esta função é chamada uma única vez, explicitamente, pelo
 * migrate.ts, depois do schema principal já ter sido aplicado — nunca mais
 * pendurada em toda conexão nova do sistema (era assim antes, e travava o
 * startup inteiro se o lock abaixo ficasse preso por um deploy anterior
 * morto no meio da transação).
 *
 * Usa pg_try_advisory_xact_lock (não bloqueante): se outra sessão já
 * estiver com o lock, desiste na hora e loga um aviso, em vez de esperar
 * indefinidamente.
 */
export async function ensureTaskScoreCompatibilityOnce(): Promise<void> {
  if (ready) return
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const tableResult = await client.query(
      "SELECT to_regclass('public.tarefas_pontuacao')::text AS table_name",
    )
    if (!tableResult.rows[0]?.table_name) {
      ready = true
      return
    }

    await client.query('BEGIN')
    transactionStarted = true

    const lockResult = await client.query('SELECT pg_try_advisory_xact_lock(732145987) AS obtido')
    if (!lockResult.rows[0]?.obtido) {
      await client.query('ROLLBACK')
      transactionStarted = false
      console.warn(
        '[DB] Compatibilidade da pontuação: outra sessão já está com o lock, pulando desta vez (não bloqueia o startup).',
      )
      return
    }

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
    ready = true
  } catch (err) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
    console.warn(
      '[DB] Compatibilidade da pontuação de tarefas não pôde ser preparada:',
      err instanceof Error ? err.message : err,
    )
  } finally {
    client.release()
  }
}
