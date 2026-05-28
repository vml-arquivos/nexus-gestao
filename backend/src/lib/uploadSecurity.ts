import fs from 'fs'
import path from 'path'
import multer, { FileFilterCallback, Options as MulterOptions } from 'multer'
import { v4 as uuidv4 } from 'uuid'

export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')

export const MAX_UPLOAD_SIZE = Number(process.env.MAX_FILE_SIZE) || 25 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png', '.jpg', '.jpeg', '.webp',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.txt', '.csv',
])

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'application/csv', 'application/vnd.ms-excel',
])

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.dll',
  '.sh', '.bash', '.zsh', '.ps1', '.jar',
  '.php', '.phtml', '.asp', '.aspx', '.jsp',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.html', '.htm', '.svg', '.xml',
])

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
}

function normalizeOriginalName(originalName: string) {
  return path.basename(originalName || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
}

function getAllExtensions(filename: string) {
  const parts = normalizeOriginalName(filename).toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 1) return []
  return parts.slice(1).map(ext => `.${ext}`)
}

export function validateUploadFile(file: Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size'>) {
  const original = normalizeOriginalName(file.originalname)
  const allExts = getAllExtensions(original)
  const ext = path.extname(original).toLowerCase()

  if (!original || !ext || allExts.length === 0) {
    throw new Error('Arquivo sem extensão não é permitido.')
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Extensão não permitida: ${ext}. Envie PDF, imagem, Word, Excel, TXT ou CSV.`)
  }

  if (allExts.some(e => DANGEROUS_EXTENSIONS.has(e))) {
    throw new Error('Arquivo com extensão perigosa ou suspeita não é permitido.')
  }

  if (allExts.length > 1 && allExts.slice(0, -1).some(e => !['.backup', '.copia', '.versao'].includes(e))) {
    throw new Error('Arquivo com dupla extensão suspeita não é permitido.')
  }

  if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype)) {
    throw new Error(`Tipo de arquivo não permitido: ${file.mimetype}.`)
  }

  if (typeof file.size === 'number' && file.size > MAX_UPLOAD_SIZE) {
    throw new Error(`Arquivo muito grande. Limite máximo: ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)} MB.`)
  }

  return true
}

export function makeStoredFilename(originalName: string) {
  const ext = path.extname(normalizeOriginalName(originalName)).toLowerCase()
  return `${uuidv4()}${ext}`
}

export function buildUploadUrl(filename: string) {
  const baseUrl = process.env.FRONTEND_URL || 'https://nexus.permupay.com.br'
  return `${baseUrl.replace(/\/$/, '')}/uploads/${filename}`
}

export function filenameFromUploadUrl(url?: string | null) {
  if (!url) return null
  const marker = '/uploads/'
  const idx = String(url).indexOf(marker)
  if (idx < 0) return null
  const raw = String(url).slice(idx + marker.length).split(/[?#]/)[0]
  const filename = path.basename(decodeURIComponent(raw))
  return filename || null
}

export function safeUploadPathFromFilename(filename: string) {
  const safeName = path.basename(filename)
  const fullPath = path.resolve(UPLOADS_DIR, safeName)
  const uploadsRoot = path.resolve(UPLOADS_DIR)
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`) && fullPath !== uploadsRoot) {
    throw new Error('Caminho de arquivo inválido.')
  }
  return fullPath
}

export function removeUploadByUrl(url?: string | null) {
  const filename = filenameFromUploadUrl(url)
  if (!filename) return
  const filePath = safeUploadPathFromFilename(filename)
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
  }
}

export function createSecureMulterUpload(options?: Partial<MulterOptions>) {
  ensureUploadsDir()

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      try {
        validateUploadFile(file)
        cb(null, makeStoredFilename(file.originalname))
      } catch (err) {
        cb(err as Error, '')
      }
    },
  })

  return multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_SIZE, ...(options?.limits || {}) },
    fileFilter: (_req, file, cb: FileFilterCallback) => {
      try {
        validateUploadFile(file)
        cb(null, true)
      } catch (err) {
        cb(err as Error)
      }
    },
    ...options,
  })
}

export function uploadErrorMessage(err: unknown) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return `Arquivo muito grande. Limite máximo: ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)} MB.`
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'Erro ao processar arquivo.'
}
