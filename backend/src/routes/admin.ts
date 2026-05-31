/**
 * admin.ts — Rotas de administração destrutiva
 * Apenas gestor, admin ou dev podem executar.
 * Cada operação é transacional e restrita à própria organização.
 */
import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import { query } from '../db/pool'

const router = Router()
router.use(authMiddleware)
router.use(gestorOnly)

/* ── helper: executa lista de queries numa transação ─────────── */
async function runInTransaction(ops: Array<() => Promise<unknown>>): Promise<void> {
  await query('BEGIN')
  try {
    for (const op of ops) await op()
    await query('COMMIT')
  } catch (err) {
    await query('ROLLBACK').catch(() => {})
    throw err
  }
}

/* ── helper: query silenciosa (não lança erro se tabela inexistir) */
function safeQuery(sql: string, params: unknown[]) {
  return (): Promise<unknown> => query(sql, params).catch(() => {})
}
function hardQuery(sql: string, params: unknown[]) {
  return (): Promise<unknown> => query(sql, params)
}



/* ── GET /api/admin/backup ──────────────────────────────────────
   Exporta um backup JSON da organização autenticada.
   Não inclui refresh tokens nem senhas. */
router.get('/backup', async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId, email, role } = req.user!

  const tables = [
    'profiles',
    'equipes',
    'equipes_membros',
    'tarefas',
    'tarefa_checklist',
    'tarefas_historico',
    'tarefa_historico',
    'tarefa_anexos',
    'pessoas',
    'agenda',
    'documentos',
    'pagamentos',
    'pagamentos_historico',
    'notificacoes',
    'convites',
    'nexus_external_links',
  ]

  const sensitive = new Set([
    'senha', 'password', 'password_hash', 'senha_hash', 'hash',
    'refresh_token', 'refreshToken', 'token_hash', 'reset_token',
  ])

  function quoteIdent(v: string): string {
    return '"' + v.replace(/"/g, '""') + '"'
  }

  async function getColumns(table: string): Promise<string[]> {
    const rows = await query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position`,
      [table]
    )
    return rows.map(r => r.column_name).filter(c => !sensitive.has(c))
  }

  try {
    const data: Record<string, unknown[]> = {}
    const skipped: string[] = []

    for (const table of tables) {
      const columns: string[] = await getColumns(table).catch((): string[] => [])
      if (columns.length === 0) {
        skipped.push(table)
        continue
      }

      const selectCols = columns.map(quoteIdent).join(', ')
      let rows: unknown[] = []

      if (columns.includes('org_id')) {
        rows = await query(`SELECT ${selectCols} FROM ${quoteIdent(table)} WHERE org_id = $1`, [orgId])
      } else if (table === 'profiles' && columns.includes('id')) {
        rows = await query(`SELECT ${selectCols} FROM ${quoteIdent(table)} WHERE id = $1`, [userId])
      } else if ((table === 'organizacoes' || table === 'organizations') && columns.includes('id')) {
        rows = await query(`SELECT ${selectCols} FROM ${quoteIdent(table)} WHERE id = $1`, [orgId])
      } else {
        skipped.push(table)
        continue
      }

      data[table] = rows
    }

    const payload = {
      metadata: {
        sistema: 'Nexus Gestão',
        tipo: 'backup_organizacao',
        versao: '1.0',
        org_id: orgId,
        gerado_por: { user_id: userId, email, role },
        gerado_em: new Date().toISOString(),
        tabelas_exportadas: Object.keys(data),
        tabelas_ignoradas: skipped,
        observacao: 'Backup JSON por organização. Senhas, tokens e refresh tokens não são exportados.',
      },
      data,
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `nexus-backup-${stamp}.json`
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(JSON.stringify(payload, null, 2))
  } catch (err) {
    console.error('[ADMIN] Erro ao gerar backup:', err)
    res.status(500).json({ error: 'Erro ao gerar backup do sistema.' })
  }
})

/* ── DELETE /api/admin/limpar/tarefas ────────────────────────── */
router.delete('/limpar/tarefas', async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.user!
  try {
    await runInTransaction([
      safeQuery('DELETE FROM tarefa_anexos     WHERE org_id = $1', [orgId]),
      safeQuery('DELETE FROM tarefas_historico WHERE org_id = $1', [orgId]),
      safeQuery('DELETE FROM tarefa_historico  WHERE org_id = $1', [orgId]),
      hardQuery('DELETE FROM tarefas           WHERE org_id = $1', [orgId]),
    ])
    res.json({ ok: true, mensagem: 'Todas as tarefas foram apagadas.' })
  } catch (err) {
    console.error('[ADMIN] Erro ao limpar tarefas:', err)
    res.status(500).json({ error: 'Erro ao apagar tarefas.' })
  }
})

/* ── DELETE /api/admin/limpar/financeiro ─────────────────────── */
router.delete('/limpar/financeiro', async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.user!
  try {
    await runInTransaction([
      safeQuery('DELETE FROM pagamentos_historico WHERE org_id = $1', [orgId]),
      hardQuery('DELETE FROM pagamentos           WHERE org_id = $1', [orgId]),
    ])
    res.json({ ok: true, mensagem: 'Todos os registros financeiros foram apagados.' })
  } catch (err) {
    console.error('[ADMIN] Erro ao limpar financeiro:', err)
    res.status(500).json({ error: 'Erro ao apagar registros financeiros.' })
  }
})

/* ── DELETE /api/admin/limpar/pessoas ────────────────────────── */
router.delete('/limpar/pessoas', async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.user!
  try {
    await query('DELETE FROM pessoas WHERE org_id = $1', [orgId])
    res.json({ ok: true, mensagem: 'Todos os contatos foram apagados.' })
  } catch (err) {
    console.error('[ADMIN] Erro ao limpar pessoas:', err)
    res.status(500).json({ error: 'Erro ao apagar contatos.' })
  }
})

/* ── DELETE /api/admin/limpar/agenda ─────────────────────────── */
router.delete('/limpar/agenda', async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.user!
  try {
    await query('DELETE FROM agenda WHERE org_id = $1', [orgId])
    res.json({ ok: true, mensagem: 'Todos os eventos da agenda foram apagados.' })
  } catch (err) {
    console.error('[ADMIN] Erro ao limpar agenda:', err)
    res.status(500).json({ error: 'Erro ao apagar agenda.' })
  }
})

/* ── DELETE /api/admin/limpar/documentos ─────────────────────── */
router.delete('/limpar/documentos', async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.user!
  try {
    await query('DELETE FROM documentos WHERE org_id = $1', [orgId])
    res.json({ ok: true, mensagem: 'Todos os documentos foram apagados.' })
  } catch (err) {
    console.error('[ADMIN] Erro ao limpar documentos:', err)
    res.status(500).json({ error: 'Erro ao apagar documentos.' })
  }
})

/* ── DELETE /api/admin/limpar/usuarios ───────────────────────── */
router.delete('/limpar/usuarios', async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req.user!
  try {
    const rows = await query<{ id: string }>(
      `SELECT id FROM profiles
       WHERE org_id = $1 AND id != $2
         AND role IN ('membro','sub_gestor')`,
      [orgId, userId]
    )
    const alvos = Array.isArray(rows) ? (rows as { id: string }[]) : []
    if (alvos.length === 0) {
      res.json({ ok: true, mensagem: 'Nenhum usuário para apagar.', total: 0 })
      return
    }
    const ids = alvos.map(r => r.id)

    await runInTransaction([
      safeQuery(`DELETE FROM refresh_tokens  WHERE user_id = ANY($1::uuid[])`,                   [ids]),
      safeQuery(`DELETE FROM notificacoes    WHERE user_id = ANY($1::uuid[]) AND org_id = $2`,   [ids, orgId]),
      safeQuery(`DELETE FROM equipes_membros WHERE user_id = ANY($1::uuid[]) AND org_id = $2`,   [ids, orgId]),
      safeQuery(`DELETE FROM equipes_membros WHERE profile_id = ANY($1::uuid[])`,                 [ids]),
      safeQuery(`DELETE FROM tarefa_anexos
                 WHERE org_id = $2
                   AND tarefa_id IN (
                     SELECT id FROM tarefas
                     WHERE org_id = $2
                       AND (criado_por = ANY($1::uuid[]) OR responsavel_id = ANY($1::uuid[]))
                   )`,                                                                            [ids, orgId]),
      safeQuery(`DELETE FROM tarefas
                 WHERE org_id = $2
                   AND (criado_por = ANY($1::uuid[]) OR responsavel_id = ANY($1::uuid[]))`,      [ids, orgId]),
      safeQuery(`DELETE FROM pagamentos  WHERE criado_por = ANY($1::uuid[]) AND org_id = $2`,    [ids, orgId]),
      safeQuery(`DELETE FROM documentos  WHERE criado_por = ANY($1::uuid[]) AND org_id = $2`,    [ids, orgId]),
      safeQuery(`DELETE FROM agenda      WHERE criado_por = ANY($1::uuid[]) AND org_id = $2`,    [ids, orgId]),
      safeQuery(`UPDATE profiles SET criado_por = NULL
                 WHERE criado_por = ANY($1::uuid[]) AND org_id = $2`,                            [ids, orgId]),
      hardQuery(`DELETE FROM profiles
                 WHERE id = ANY($1::uuid[]) AND org_id = $2`,                                    [ids, orgId]),
    ])

    res.json({ ok: true, mensagem: `${ids.length} usuário(s) apagado(s).`, total: ids.length })
  } catch (err) {
    console.error('[ADMIN] Erro ao limpar usuários:', err)
    res.status(500).json({ error: 'Erro ao apagar usuários.' })
  }
})

/* ── DELETE /api/admin/limpar/tudo ────────────────────────────── */
router.delete('/limpar/tudo', async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req.user!
  try {
    await runInTransaction([
      safeQuery('DELETE FROM notificacoes         WHERE org_id = $1',                         [orgId]),
      safeQuery('DELETE FROM tarefa_anexos        WHERE org_id = $1',                         [orgId]),
      safeQuery('DELETE FROM tarefas_historico    WHERE org_id = $1',                         [orgId]),
      safeQuery('DELETE FROM tarefa_historico     WHERE org_id = $1',                         [orgId]),
      hardQuery('DELETE FROM tarefas              WHERE org_id = $1',                         [orgId]),
      safeQuery('DELETE FROM pagamentos_historico WHERE org_id = $1',                         [orgId]),
      hardQuery('DELETE FROM pagamentos           WHERE org_id = $1',                         [orgId]),
      hardQuery('DELETE FROM agenda               WHERE org_id = $1',                         [orgId]),
      hardQuery('DELETE FROM documentos           WHERE org_id = $1',                         [orgId]),
      hardQuery('DELETE FROM pessoas              WHERE org_id = $1',                         [orgId]),
      safeQuery('DELETE FROM equipes_membros      WHERE org_id = $1',                         [orgId]),
      safeQuery('DELETE FROM equipes              WHERE org_id = $1',                         [orgId]),
      safeQuery(`DELETE FROM refresh_tokens
                 WHERE user_id IN (
                   SELECT id FROM profiles WHERE org_id = $1 AND id != $2
                 )`,                                                                           [orgId, userId]),
      safeQuery(`UPDATE profiles SET criado_por = NULL
                 WHERE org_id = $1 AND id != $2`,                                             [orgId, userId]),
      safeQuery(`DELETE FROM profiles
                 WHERE org_id = $1 AND id != $2
                   AND role NOT IN ('admin','dev')`,                                          [orgId, userId]),
    ])
    res.json({ ok: true, mensagem: 'Todos os dados da organização foram apagados.' })
  } catch (err) {
    console.error('[ADMIN] Erro ao limpar tudo:', err)
    res.status(500).json({ error: 'Erro ao apagar todos os dados.' })
  }
})

export default router
