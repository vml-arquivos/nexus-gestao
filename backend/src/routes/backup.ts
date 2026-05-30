/**
 * backup.ts — Rota de Backup do Banco de Dados
 *
 * GET  /api/admin/backup/download   → dispara pg_dump e faz download .sql.gz
 * GET  /api/admin/backup/status     → retorna info do banco (tamanho, tabelas)
 * POST /api/admin/backup/agendar    → ativa/desativa backup automático (cron)
 * GET  /api/admin/backup/historico  → lista backups já realizados (log em memória)
 *
 * Restrição: apenas roles admin | dev | gestor (gestorOnly middleware já cobre isso).
 * O pg_dump roda via child_process usando as credenciais do DATABASE_URL.
 * O arquivo é comprimido com gzip e enviado como download direto para o navegador.
 *
 * Dependências já presentes no projeto: express, pg
 * Nenhuma dependência extra necessária.
 */

import { Router, Request, Response } from 'express'
import { authMiddleware, gestorOnly } from '../middleware/auth'
import { query } from '../db/pool'
import { spawn } from 'child_process'
import { createGzip } from 'zlib'
import * as path from 'path'
import * as fs from 'fs'

const router = Router()
router.use(authMiddleware)
router.use(gestorOnly)

// ── Histórico em memória (sobrevive ao processo, não persiste entre reinícios) ─
interface BackupEntry {
  id: string
  realizadoEm: string
  tamanhoBytes: number | null
  solicitadoPor: string
  tipo: 'manual' | 'automatico'
  status: 'ok' | 'erro'
  erro?: string
}
const historicoBackups: BackupEntry[] = []

// ── Parse DATABASE_URL ────────────────────────────────────────────────────────
function parseDbUrl(url: string): {
  user: string; password: string; host: string; port: string; database: string
} | null {
  try {
    // postgres://user:password@host:port/database
    const u = new URL(url)
    return {
      user:     u.username,
      password: u.password,
      host:     u.hostname,
      port:     u.port || '5432',
      database: u.pathname.slice(1), // remove leading /
    }
  } catch {
    return null
  }
}

// ── GET /api/admin/backup/status ─────────────────────────────────────────────
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const [sizeRow] = await query<{ tamanho: string }>(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho
    `)
    const tabelas = await query<{ tabela: string; linhas: string; tamanho: string }>(`
      SELECT
        relname                                              AS tabela,
        to_char(n_live_tup, 'FM999,999,999')                AS linhas,
        pg_size_pretty(pg_total_relation_size(relid))       AS tamanho
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    `)
    const [pgVersion] = await query<{ version: string }>(`SELECT version()`)

    res.json({
      ok: true,
      banco: {
        tamanho: sizeRow?.tamanho ?? '—',
        versao:  pgVersion?.version?.split(' ').slice(0, 2).join(' ') ?? '—',
        tabelas,
      },
      ultimoBackup: historicoBackups.filter(b => b.status === 'ok')[0] ?? null,
      totalBackups: historicoBackups.length,
    })
  } catch (err) {
    console.error('[BACKUP] Erro ao buscar status:', err)
    res.status(500).json({ error: 'Erro ao consultar status do banco.' })
  }
})

// ── GET /api/admin/backup/historico ──────────────────────────────────────────
router.get('/historico', (req: Request, res: Response): void => {
  res.json({ ok: true, historico: historicoBackups.slice(0, 50) })
})

// ── GET /api/admin/backup/download ───────────────────────────────────────────
router.get('/download', (req: Request, res: Response): void => {
  const dbUrl = process.env.DATABASE_URL || ''
  const db = parseDbUrl(dbUrl)

  if (!db) {
    res.status(500).json({ error: 'DATABASE_URL inválida ou não configurada.' })
    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename  = `nexus-backup-${timestamp}.sql.gz`
  const userId    = req.user?.userId ?? 'desconhecido'

  const entry: BackupEntry = {
    id:           timestamp,
    realizadoEm: new Date().toISOString(),
    tamanhoBytes: null,
    solicitadoPor: userId,
    tipo:         'manual',
    status:       'ok',
  }

  console.log(`[BACKUP] Iniciando backup manual — solicitado por ${userId}`)

  // Headers para download direto no navegador
  res.setHeader('Content-Type', 'application/gzip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Transfer-Encoding', 'chunked')

  // pg_dump com variáveis de ambiente para credenciais (mais seguro que CLI args)
  const env = {
    ...process.env,
    PGPASSWORD: db.password,
  }

  const pgDump = spawn('pg_dump', [
    '-h', db.host,
    '-p', db.port,
    '-U', db.user,
    '-d', db.database,
    '--format=plain',       // SQL puro, legível
    '--no-password',
    '--encoding=UTF8',
    '--verbose',            // logs no stderr (não afeta stdout/download)
    '--no-owner',           // portabilidade: sem OWNER específico
    '--no-acl',             // sem GRANT/REVOKE desnecessários
  ], { env })

  const gzip = createGzip({ level: 9 })

  let bytesTotal = 0

  // Comprime e envia direto para o cliente
  pgDump.stdout
    .pipe(gzip)
    .on('data', (chunk: Buffer) => {
      bytesTotal += chunk.length
    })
    .pipe(res)

  pgDump.stderr.on('data', (data: Buffer) => {
    // pg_dump --verbose emite progresso no stderr — apenas loga
    process.stdout.write(`[BACKUP:pg_dump] ${data.toString()}`)
  })

  pgDump.on('error', (err) => {
    console.error('[BACKUP] pg_dump não encontrado ou erro ao iniciar:', err.message)
    entry.status = 'erro'
    entry.erro   = err.message
    historicoBackups.unshift(entry)
    // Resposta já pode ter começado; apenas encerra
    if (!res.headersSent) {
      res.status(500).json({ error: 'pg_dump não está disponível no servidor.' })
    } else {
      res.end()
    }
  })

  pgDump.on('close', (code) => {
    entry.tamanhoBytes = bytesTotal
    if (code === 0) {
      entry.status = 'ok'
      console.log(`[BACKUP] ✅ Concluído — ${(bytesTotal / 1024).toFixed(1)} KB comprimidos`)
    } else {
      entry.status = 'erro'
      entry.erro   = `pg_dump encerrou com código ${code}`
      console.error(`[BACKUP] ❌ pg_dump encerrou com código ${code}`)
    }
    historicoBackups.unshift(entry)
    // Mantém no máximo 100 entradas
    if (historicoBackups.length > 100) historicoBackups.splice(100)
  })
})

export default router
