import pool from '../db/pool'
import type { PoolClient } from 'pg'

const localJobs = new Set<string>()
let localActiveJobs = 0

/**
 * Impede sobreposição local e duplicação entre réplicas. Jobs cedem espaço
 * imediatamente quando existem requisições aguardando conexão no pool.
 */
export async function runClusterSingletonJob(
  name: string,
  job: () => Promise<void>,
): Promise<void> {
  if (process.env.BACKGROUND_JOBS_ENABLED === 'false') return
  if (localJobs.has(name) || localActiveJobs >= 1 || pool.waitingCount > 0) return

  localJobs.add(name)
  let client: PoolClient | null = null
  let locked = false
  try {
    client = await pool.connect()
    const lockResult = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [`nexus:${name}`],
    )
    locked = Boolean(lockResult.rows[0]?.locked)
    if (!locked) return
    localActiveJobs += 1
    await job()
  } catch (error) {
    console.error(`[JOBS] Falha em ${name}:`, error)
  } finally {
    if (client && locked) {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`nexus:${name}`]).catch(() => undefined)
    }
    if (locked) localActiveJobs = Math.max(0, localActiveJobs - 1)
    client?.release()
    localJobs.delete(name)
  }
}
