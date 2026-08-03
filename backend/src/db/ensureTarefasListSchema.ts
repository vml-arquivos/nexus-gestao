import pool from './pool'

let ready = false

/**
 * A listagem principal de tarefas (GET /api/tarefas → listTasksForUser em
 * backend/src/routes/tarefas.ts) depende de um conjunto específico de
 * colunas/tabela:
 *
 *   - profiles.cargo
 *   - tarefas.aceita_por
 *   - tarefas.data_reabertura
 *   - tabela tarefa_anexos (+ índices usados pelo LEFT JOIN LATERAL)
 *
 * Se o banco em uso estiver com o schema desatualizado em relação ao
 * código -- por exemplo, um banco restaurado de um backup mais antigo,
 * ou uma migration anterior que não chegou a rodar até o fim por algum
 * motivo -- a query acima falha com um erro de "column/relation does not
 * exist", e a página de Tarefas para de carregar (banner "Não foi
 * possível carregar as tarefas"), mesmo com o backend e o Postgres
 * saudáveis.
 *
 * Esta verificação roda uma única vez por processo, depois que o schema
 * principal (migrate.ts) já foi aplicado, e é puramente aditiva:
 * `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` /
 * `CREATE INDEX IF NOT EXISTS`. Nunca remove coluna, tabela ou dado, e
 * usa lock consultivo não bloqueante (mesmo padrão de
 * ensureTaskScoreCompatibilityOnce em taskScoreCompatibility.ts): se
 * outra réplica já estiver aplicando, esta desiste na hora em vez de
 * esperar e travar o startup.
 */
export async function ensureTarefasListSchemaOnce(): Promise<void> {
  if (ready) return
  const client = await pool.connect()
  let transactionStarted = false
  try {
    // Caminho comum após a primeira migration: valida pelo catálogo e sai sem
    // executar ALTER/CREATE novamente. Isso mantém restart e redeploy livres
    // de locks quando o schema crítico da listagem já está completo.
    const estado = await client.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cargo'
        ) AS profiles_cargo,
        EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'tarefas' AND column_name = 'aceita_por'
        ) AS tarefas_aceita_por,
        EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'tarefas' AND column_name = 'data_reabertura'
        ) AS tarefas_data_reabertura,
        EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'tarefas' AND column_name = 'conta_ranking'
        ) AS tarefas_conta_ranking,
        to_regclass('public.tarefa_anexos') IS NOT NULL AS tarefa_anexos,
        to_regclass('public.idx_tarefa_anexos_tarefa') IS NOT NULL AS idx_tarefa_anexos_tarefa,
        to_regclass('public.idx_tarefa_anexos_org') IS NOT NULL AS idx_tarefa_anexos_org
    `)
    const atual = estado.rows[0] || {}
    if (
      atual.profiles_cargo &&
      atual.tarefas_aceita_por &&
      atual.tarefas_data_reabertura &&
      atual.tarefas_conta_ranking &&
      atual.tarefa_anexos &&
      atual.idx_tarefa_anexos_tarefa &&
      atual.idx_tarefa_anexos_org
    ) {
      ready = true
      return
    }

    await client.query('BEGIN')
    transactionStarted = true

    const lockResult = await client.query('SELECT pg_try_advisory_xact_lock(732145988) AS obtido')
    if (!lockResult.rows[0]?.obtido) {
      await client.query('ROLLBACK')
      transactionStarted = false
      console.warn(
        '[DB] Verificação de schema de tarefas: outra sessão já está com o lock, pulando desta vez (não bloqueia o startup).',
      )
      return
    }

    const tarefasExiste = await client.query("SELECT to_regclass('public.tarefas')::text AS t")
    const profilesExiste = await client.query("SELECT to_regclass('public.profiles')::text AS t")

    if (!tarefasExiste.rows[0]?.t || !profilesExiste.rows[0]?.t) {
      // Tabelas-base ausentes indicam banco vazio/schema principal ainda não
      // aplicado -- fora do escopo desta verificação auxiliar, que só cobre
      // colunas/tabela adicionais sobre uma base já existente.
      await client.query('COMMIT')
      transactionStarted = false
      ready = true
      console.warn(
        '[DB] Verificação de schema de tarefas: tabela tarefas/profiles ainda não existe, aguardando o schema principal.',
      )
      return
    }

    await client.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cargo TEXT')
    await client.query(
      'ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aceita_por UUID REFERENCES profiles(id) ON DELETE SET NULL',
    )
    await client.query('ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_reabertura TIMESTAMPTZ')
    await client.query('ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS conta_ranking BOOLEAN NOT NULL DEFAULT TRUE')

    await client.query(`
      CREATE TABLE IF NOT EXISTS tarefa_anexos (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id        UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
        tarefa_id     UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
        enviado_por   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        titulo        TEXT NOT NULL,
        descricao     TEXT,
        tipo          TEXT NOT NULL DEFAULT 'evidencia' CHECK (tipo IN ('evidencia','referencia','correcao','outro')),
        arquivo_url   TEXT NOT NULL,
        nome_original TEXT,
        mime_type     TEXT,
        tamanho       BIGINT,
        created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `)
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_tarefa ON tarefa_anexos(tarefa_id, created_at DESC)',
    )
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_org ON tarefa_anexos(org_id, created_at DESC)',
    )
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_enviado_por ON tarefa_anexos(enviado_por, created_at DESC)',
    )

    await client.query('COMMIT')
    transactionStarted = false
    ready = true
    console.log('[DB] Verificação de schema de tarefas: OK (profiles.cargo, tarefas.aceita_por/data_reabertura, tarefa_anexos).')
  } catch (err) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
    console.warn(
      '[DB] Verificação de schema de tarefas não pôde ser concluída (a listagem de tarefas pode continuar falhando até isto ser corrigido manualmente):',
      err instanceof Error ? err.message : err,
    )
  } finally {
    client.release()
  }
}
