import crypto from 'crypto'
import fs from 'fs/promises'

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  token_uri?: string
}

interface TokenCacheEntry {
  token: string
  expiresAt: number
}

const tokenCache = new Map<string, TokenCacheEntry>()

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function parseServiceAccount(): ServiceAccountCredentials | null {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
  const rawBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 || ''
  const rawFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
  try {
    if (rawJson.trim()) return JSON.parse(rawJson)
    if (rawBase64.trim()) return JSON.parse(Buffer.from(rawBase64, 'base64').toString('utf8'))
  } catch (err) {
    console.error('[GOOGLE] Credencial de service account inválida:', (err as Error).message)
    return null
  }

  // GOOGLE_APPLICATION_CREDENTIALS é tratado de forma assíncrona por loadServiceAccount.
  if (rawFile.trim()) return null
  return null
}

async function loadServiceAccount(): Promise<ServiceAccountCredentials | null> {
  const parsed = parseServiceAccount()
  if (parsed?.client_email && parsed?.private_key) return parsed

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
  if (!filePath.trim()) return null
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const credentials = JSON.parse(content)
    if (credentials?.client_email && credentials?.private_key) return credentials
  } catch (err) {
    console.error('[GOOGLE] Não foi possível ler GOOGLE_APPLICATION_CREDENTIALS:', (err as Error).message)
  }
  return null
}

export function googleWorkspaceConfigured() {
  return Boolean(
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_APPLICATION_CREDENTIALS) &&
    (process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_DRIVE_FOLDER_ID)
  )
}

export async function getGoogleAccessToken(scopes: string[]): Promise<string | null> {
  const credentials = await loadServiceAccount()
  if (!credentials?.client_email || !credentials?.private_key) return null

  const scope = scopes.sort().join(' ')
  const cached = tokenCache.get(scope)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claimSet = {
    iss: credentials.client_email,
    scope,
    aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(credentials.private_key)
  const assertion = `${unsigned}.${base64Url(signature)}`

  const response = await fetch(credentials.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[GOOGLE] Falha ao obter access token:', response.status, detail.slice(0, 500))
    return null
  }

  const data = await response.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null
  tokenCache.set(scope, { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 })
  return data.access_token
}

export interface GoogleCalendarEventInput {
  calendarId?: string
  googleEventId?: string | null
  summary: string
  description?: string | null
  start: string
  end?: string | null
  location?: string | null
  colorId?: string | null
}

export async function upsertGoogleCalendarEvent(input: GoogleCalendarEventInput): Promise<{ ok: boolean; id?: string; error?: string; action?: 'created' | 'updated' | 'skipped' }> {
  const calendarId = encodeURIComponent(input.calendarId || process.env.GOOGLE_CALENDAR_ID || '')
  if (!calendarId) return { ok: false, action: 'skipped', error: 'GOOGLE_CALENDAR_ID não configurado.' }

  const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/calendar.events'])
  if (!token) return { ok: false, action: 'skipped', error: 'Credenciais Google não configuradas ou sem token.' }

  const startDate = new Date(input.start)
  const endDate = input.end ? new Date(input.end) : new Date(startDate.getTime() + 60 * 60 * 1000)
  const timeZone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'America/Sao_Paulo'
  const body = {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location || undefined,
    colorId: input.colorId || undefined,
    start: { dateTime: startDate.toISOString(), timeZone },
    end: { dateTime: endDate.toISOString(), timeZone },
  }

  const eventId = input.googleEventId || ''
  const url = eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`
  const response = await fetch(url, {
    method: eventId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[GOOGLE] Falha ao sincronizar evento:', response.status, detail.slice(0, 500))
    return { ok: false, error: `Google Calendar ${response.status}: ${detail.slice(0, 200)}` }
  }

  const data = await response.json() as { id?: string }
  return { ok: true, id: data.id || eventId, action: eventId ? 'updated' : 'created' }
}

export async function uploadFileToGoogleDrive(input: { filePath: string; filename: string; mimeType?: string; folderId?: string }): Promise<{ ok: boolean; id?: string; webViewLink?: string; error?: string }> {
  const folderId = input.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || ''
  if (!folderId) return { ok: false, error: 'GOOGLE_DRIVE_FOLDER_ID não configurado.' }

  const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/drive.file'])
  if (!token) return { ok: false, error: 'Credenciais Google não configuradas ou sem token.' }

  const fileBuffer = await fs.readFile(input.filePath)
  const boundary = `nexus_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const metadata = {
    name: input.filename,
    parents: [folderId],
    description: `Backup automático do Nexus gerado em ${new Date().toISOString()}`,
  }
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`
  const multipartBody = Buffer.concat([
    Buffer.from(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`),
    Buffer.from(`${delimiter}Content-Type: ${input.mimeType || 'application/gzip'}\r\n\r\n`),
    fileBuffer,
    Buffer.from(closeDelimiter),
  ])

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(multipartBody.length),
    },
    body: multipartBody as any,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[GOOGLE] Falha ao enviar backup ao Drive:', response.status, detail.slice(0, 500))
    return { ok: false, error: `Google Drive ${response.status}: ${detail.slice(0, 200)}` }
  }
  const data = await response.json() as { id?: string; webViewLink?: string }
  return { ok: true, id: data.id, webViewLink: data.webViewLink }
}
