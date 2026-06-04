import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { uploadFileToGoogleDrive } from './googleWorkspaceService'

interface BackupAutoEntry {
  filename: string
  path: string
  createdAt: string
  tamanhoBytes: number
  status: 'ok' | 'erro'
  driveFileId?: string
  driveLink?: string
  erro?: string
}

const historico: BackupAutoEntry[] = []
let running = false
let lastRunDay = ''

function parseDbUrl(url: string): { user: string; password: string; host: string; port: string; database: string } | null {
  try {
    const u = new URL(url)
    return { user: u.username, password: u.password, host: u.hostname, port: u.port || '5432', database: u.pathname.slice(1) }
  } catch { return null }
}

function execFileAsync(cmd: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number }) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(cmd, args, { cwd: options?.cwd, env: options?.env, timeout: options?.timeout ?? 600000, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
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

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 120)
}

export async function executarBackupAutomatico(tipo: 'automatico' | 'manual' = 'automatico'): Promise<BackupAutoEntry> {
  if (running) throw new Error('Backup automático já está em execução.')
  running = true
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `nexus-auto-backup-${stamp}-`))
  const bundleDir = path.join(workDir, 'nexus-backup')
  const outDir = process.env.BACKUP_LOCAL_DIR || '/app/backups'
  const filename = safeName(`nexus-backup-auto-${stamp}.tar.gz`)
  const outFile = path.join(outDir, filename)
  const entry: BackupAutoEntry = { filename, path: outFile, createdAt: new Date().toISOString(), tamanhoBytes: 0, status: 'ok' }

  try {
    await fs.mkdir(bundleDir, { recursive: true })
    await fs.mkdir(outDir, { recursive: true })
    const databaseUrl = process.env.DATABASE_URL || ''
    const db = parseDbUrl(databaseUrl)
    if (!db) throw new Error('DATABASE_URL inválida ou não configurada.')

    const dumpPath = path.join(bundleDir, 'database.dump')
    const sqlPath = path.join(bundleDir, 'database.sql')
    const env = { ...process.env, PGPASSWORD: db.password }
    await execFileAsync('pg_dump', ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '--format=custom', '--no-owner', '--no-acl', '--file', dumpPath], { env, timeout: 10 * 60 * 1000 })
    await execFileAsync('pg_dump', ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '--format=plain', '--no-owner', '--no-acl', '--encoding=UTF8', '--file', sqlPath], { env, timeout: 10 * 60 * 1000 })

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')
    const uploadsTarget = path.join(bundleDir, 'uploads')
    try {
      await fs.access(uploadsDir)
      await execFileAsync('cp', ['-a', `${uploadsDir}/.`, uploadsTarget], { timeout: 5 * 60 * 1000 })
    } catch {
      await fs.mkdir(uploadsTarget, { recursive: true })
      await fs.writeFile(path.join(uploadsTarget, 'SEM_ARQUIVOS.txt'), 'Nenhuma pasta de uploads encontrada neste ambiente.\n')
    }

    const manifest = {
      sistema: 'Nexus Gestão',
      tipo: `backup_${tipo}`,
      gerado_em: new Date().toISOString(),
      conteudo: ['database.dump', 'database.sql', 'uploads/'],
      observacao: 'Backup gerado automaticamente pelo backend do Nexus. Segredos não são exportados.',
    }
    await fs.writeFile(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    await execFileAsync('tar', ['-czf', outFile, '-C', bundleDir, '.'], { timeout: 10 * 60 * 1000 })
    const stat = await fs.stat(outFile)
    entry.tamanhoBytes = stat.size

    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
      const upload = await uploadFileToGoogleDrive({ filePath: outFile, filename, mimeType: 'application/gzip' })
      if (upload.ok) {
        entry.driveFileId = upload.id
        entry.driveLink = upload.webViewLink
      } else {
        entry.erro = upload.error
      }
    }

    historico.unshift(entry)
    if (historico.length > 100) historico.splice(100)
    await limparBackupsLocaisAntigos(outDir)
    return entry
  } catch (err) {
    entry.status = 'erro'
    entry.erro = (err as Error).message
    historico.unshift(entry)
    console.error('[BACKUP_AUTO] Erro ao executar backup automático:', err)
    return entry
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    running = false
  }
}

async function limparBackupsLocaisAntigos(outDir: string) {
  const keep = Math.max(1, Math.min(100, Number(process.env.BACKUP_LOCAL_KEEP_LAST || 14)))
  const files = await fs.readdir(outDir).catch(() => [])
  const backups = [] as Array<{ name: string; full: string; mtime: number }>
  for (const name of files) {
    if (!name.startsWith('nexus-backup-auto-') || !name.endsWith('.tar.gz')) continue
    const full = path.join(outDir, name)
    const stat = await fs.stat(full).catch(() => null)
    if (stat) backups.push({ name, full, mtime: stat.mtimeMs })
  }
  backups.sort((a, b) => b.mtime - a.mtime)
  for (const old of backups.slice(keep)) await fs.rm(old.full, { force: true }).catch(() => {})
}

export function getBackupAutoStatus() {
  return { running, historico: historico.slice(0, 50), ultimo: historico[0] || null }
}

export function iniciarBackupAutomatico() {
  const enabled = process.env.BACKUP_AUTO_ENABLED !== 'false'
  if (!enabled) {
    console.log('[BACKUP_AUTO] Backup automático desativado por BACKUP_AUTO_ENABLED=false.')
    return
  }
  const hour = Math.max(0, Math.min(23, Number(process.env.BACKUP_AUTO_HOUR || 3)))
  const minute = Math.max(0, Math.min(59, Number(process.env.BACKUP_AUTO_MINUTE || 15)))
  setInterval(async () => {
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    if (now.getHours() === hour && now.getMinutes() >= minute && lastRunDay !== day) {
      lastRunDay = day
      await executarBackupAutomatico('automatico')
    }
  }, 60 * 1000)
  console.log(`[BACKUP_AUTO] Backup automático iniciado para ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} diariamente.`)
}
