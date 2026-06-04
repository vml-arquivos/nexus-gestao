/**
 * admin.ts — Rotas de administração destrutiva
 * Apenas gestor, admin ou dev podem executar.
 * Cada operação é transacional e restrita à própria organização.
 */
import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import { query } from '../db/pool'
import { executarBackupAutomatico, getBackupAutoStatus } from '../services/backupAutoService'
import { getAgendaSyncStatus, sincronizarAgendaOperacional } from '../services/agendaSyncService'

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



/* ── GET /api/admin/backup-auto/status ─────────────────────────
   Mostra o estado do backup automático e últimos envios ao Google Drive. */
router.get('/backup-auto/status', (_req: Request, res: Response): void => {
  res.json({ ok: true, ...getBackupAutoStatus() })
})

/* ── POST /api/admin/backup-auto/executar ───────────────────────
   Executa backup automático agora e envia ao Google Drive quando configurado. */
router.post('/backup-auto/executar', async (_req: Request, res: Response): Promise<void> => {
  try {
    const backup = await executarBackupAutomatico('manual')
    res.json({ ok: backup.status === 'ok', backup })
  } catch (err) {
    console.error('[ADMIN] Erro ao executar backup automático manual:', err)
    res.status(500).json({ error: (err as Error).message || 'Erro ao executar backup automático.' })
  }
})

/* ── GET /api/admin/agenda-sync/status ────────────────────────── */
router.get('/agenda-sync/status', (_req: Request, res: Response): void => {
  res.json({ ok: true, ...getAgendaSyncStatus() })
})

/* ── POST /api/admin/agenda-sync/executar ─────────────────────── */
router.post('/agenda-sync/executar', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sincronizarAgendaOperacional({ orgId: req.user!.orgId, userId: req.user!.userId, forceGoogle: true })
    res.json({ ok: result.ok, result })
  } catch (err) {
    console.error('[ADMIN] Erro ao sincronizar agenda:', err)
    res.status(500).json({ error: (err as Error).message || 'Erro ao sincronizar agenda.' })
  }
})


/* ── GET /api/admin/backup ──────────────────────────────────────
   Gera backup completo para restauração: dump do PostgreSQL + uploads + manifesto.
   Arquivo final: .tar.gz. Não inclui senhas/tokens em texto puro. */
router.get('/backup', async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId, email, role } = req.user!

  function safeName(v: string): string {
    return String(v || 'nexus').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80)
  }

  function isSensitiveEnvKey(key: string): boolean {
    const k = key.toUpperCase()
    return (
      k.includes('SECRET') ||
      k.includes('TOKEN') ||
      k.includes('PASSWORD') ||
      k.includes('PASS') ||
      k.includes('PWD') ||
      k.includes('KEY') ||
      k === 'DATABASE_URL' ||
      k.includes('DATABASE') && k.includes('URL')
    )
  }

  function buildEnvSnapshot(): Record<string, string> {
    const allowedPrefixes = [
      'NODE_ENV', 'FRONTEND_URL', 'VITE_API_URL', 'CORS_EXTRA_ORIGINS',
      'DATABASE_SSL', 'JWT_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN',
      'DESTRAVA_FRONTEND_URL', 'NEXUS_ALLOWED_FRAME_ANCESTORS',
      'NEXUS_PUBLIC_URL', 'NEXUS_API_URL', 'COOLIFY_FQDN', 'COOLIFY_URL', 'COOLIFY_BRANCH',
    ]

    const snapshot: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      const shouldInclude = allowedPrefixes.some(prefix => key === prefix || key.startsWith(prefix + '_'))
      if (!shouldInclude && !isSensitiveEnvKey(key)) continue
      snapshot[key] = isSensitiveEnvKey(key) ? '[REDACTED — manter/recriar no painel de variáveis do Coolify]' : String(value ?? '')
    }
    return snapshot
  }

  async function execFileAsync(cmd: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number }) {
    const { execFile } = await import('child_process')
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(cmd, args, {
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout ?? 120000,
        maxBuffer: 1024 * 1024 * 10,
      }, (error, stdout, stderr) => {
        if (error) {
          const err = error as Error & { stdout?: string; stderr?: string }
          err.stdout = stdout
          err.stderr = stderr
          reject(err)
          return
        }
        resolve({ stdout, stderr })
      })
    })
  }

  const fs = await import('fs/promises')
  const path = await import('path')
  const os = await import('os')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `nexus-backup-${stamp}-`))
  const bundleDir = path.join(workDir, 'nexus-backup')
  const backupFile = path.join(workDir, `nexus-backup-completo-${stamp}.tar.gz`)

  try {
    await fs.mkdir(bundleDir, { recursive: true })

    const databaseUrl = process.env.DATABASE_URL || ''
    if (!databaseUrl) {
      res.status(500).json({ error: 'DATABASE_URL não configurada. Não foi possível gerar dump do banco.' })
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
      return
    }

    const dumpPath = path.join(bundleDir, 'database.dump')
    const sqlPath = path.join(bundleDir, 'database.sql')

    // Dump custom para restauração confiável com pg_restore.
    await execFileAsync('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file', dumpPath,
      databaseUrl,
    ], { timeout: 10 * 60 * 1000 })

    // Dump SQL legível como alternativa de conferência/restauração manual.
    await execFileAsync('pg_dump', [
      '--format=plain',
      '--no-owner',
      '--no-acl',
      '--file', sqlPath,
      databaseUrl,
    ], { timeout: 10 * 60 * 1000 })

    const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads'
    const uploadsTarget = path.join(bundleDir, 'uploads')
    try {
      await fs.access(uploadsDir)
      await execFileAsync('cp', ['-a', uploadsDir + '/.', uploadsTarget], { timeout: 5 * 60 * 1000 })
    } catch {
      await fs.mkdir(uploadsTarget, { recursive: true })
      await fs.writeFile(path.join(uploadsTarget, 'SEM_ARQUIVOS.txt'), 'Nenhuma pasta de uploads foi encontrada neste ambiente.\n')
    }

    const envSnapshot = buildEnvSnapshot()
    await fs.writeFile(
      path.join(bundleDir, 'env.runtime.redacted.json'),
      JSON.stringify(envSnapshot, null, 2),
      'utf8'
    )

    const restoreReadme = `# Backup completo — Nexus Gestão\n\nGerado em: ${new Date().toISOString()}\nGerado por: ${email} (${role})\nOrganização: ${orgId}\n\n## Conteúdo\n\n- database.dump: dump PostgreSQL em formato custom, recomendado para restauração com pg_restore.\n- database.sql: dump SQL legível, útil para auditoria ou restauração manual.\n- uploads/: arquivos enviados/anexos do sistema.\n- env.runtime.redacted.json: variáveis de ambiente relevantes, com segredos ocultados por segurança.\n- manifest.json: resumo do pacote.\n\n## Restauração recomendada\n\n1. Criar banco PostgreSQL vazio.\n2. Restaurar o dump custom:\n\n   pg_restore --clean --if-exists --no-owner --no-acl -d \"SUA_DATABASE_URL\" database.dump\n\n3. Copiar a pasta uploads para /app/uploads no container/volume do Nexus.\n4. Recriar no Coolify as variáveis sensíveis marcadas como REDACTED.\n5. Fazer redeploy do Nexus.\n\nObservação: por segurança, JWT_SECRET, DATABASE_URL, senhas, tokens e chaves não são exportados em texto puro.\n`;

    const manifest = {
      sistema: 'Nexus Gestão',
      tipo: 'backup_completo_restauração',
      versao: '2.0',
      formato: 'tar.gz',
      org_id: orgId,
      gerado_por: { user_id: userId, email, role },
      gerado_em: new Date().toISOString(),
      conteudo: [
        'database.dump',
        'database.sql',
        'uploads/',
        'env.runtime.redacted.json',
        'RESTORE.md',
      ],
      seguranca: {
        inclui_senhas_ou_tokens_em_texto_puro: false,
        observacao: 'Variáveis sensíveis são listadas com valor REDACTED para evitar vazamento pelo navegador.',
      },
    }

    await fs.writeFile(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    await fs.writeFile(path.join(bundleDir, 'RESTORE.md'), restoreReadme, 'utf8')

    await execFileAsync('tar', ['-czf', backupFile, '-C', bundleDir, '.'], { timeout: 10 * 60 * 1000 })

    const filename = safeName(`nexus-backup-completo-${stamp}.tar.gz`)
    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.download(backupFile, filename, async (err) => {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
      if (err && !res.headersSent) {
        console.error('[ADMIN] Erro ao enviar backup:', err)
      }
    })
  } catch (err) {
    console.error('[ADMIN] Erro ao gerar backup completo:', err)
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    res.status(500).json({ error: 'Erro ao gerar backup completo do banco e arquivos.' })
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
