import { Router, Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { buildPrivateFileUrl, verifyPrivateFileTicket } from '../lib/privateFile'
import { createSecureMulterUpload, buildUploadUrl, removeUploadByUrl, safeUploadPathFromFilename, filenameFromUploadUrl, uploadErrorMessage } from '../lib/uploadSecurity'

const router = Router()

// Arquivos nunca são servidos como conteúdo estático. O ticket curto identifica
// usuário, organização, recurso e nome físico; o handler ainda revalida o
// vínculo no banco antes de abrir o arquivo.
router.get('/file/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = path.basename(String(req.params.filename || ''))
    const ticket = verifyPrivateFileTicket(req.query.ticket, filename)
    if (!ticket) {
      res.status(401).json({ error: 'Ticket de arquivo inválido ou expirado.' })
      return
    }

    let record: { id: string; arquivo_url: string | null; mime_type?: string | null; nome_original?: string | null; titulo?: string | null } | null = null
    if (ticket.resource === 'documento') {
      const canReadAny = ['admin', 'dev', 'gestor'].includes(ticket.role)
      record = await queryOne(
        `SELECT id, arquivo_url, mime_type, titulo
           FROM documentos
          WHERE id = $1 AND org_id = $2
            AND ($3::boolean = TRUE OR criado_por = $4)`,
        [ticket.resourceId, ticket.orgId, canReadAny, ticket.userId],
      )
    } else if (ticket.resource === 'avatar') {
      record = await queryOne(
        `SELECT id, avatar_url AS arquivo_url, NULL::text AS mime_type, nome AS titulo
           FROM profiles
          WHERE id = $1 AND org_id = $2 AND ativo = TRUE`,
        [ticket.resourceId, ticket.orgId],
      )
    } else if (ticket.resource === 'tarefa_anexo' && ticket.parentId) {
      record = await queryOne(
        `SELECT a.id, a.arquivo_url, a.mime_type, a.nome_original, a.titulo
           FROM tarefa_anexos a
           JOIN tarefas t ON t.id = a.tarefa_id AND t.org_id = a.org_id
          WHERE a.id = $1 AND a.tarefa_id = $2 AND a.org_id = $3`,
        [ticket.resourceId, ticket.parentId, ticket.orgId],
      )
    }

    if (!record || filenameFromUploadUrl(record.arquivo_url) !== filename) {
      res.status(404).json({ error: 'Arquivo não encontrado.' })
      return
    }
    const filePath = safeUploadPathFromFilename(filename)
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Arquivo físico não encontrado.' })
      return
    }

    const originalName = path.basename(String(record.nome_original || record.titulo || filename)).replace(/[\\r\\n\"]/g, '') || filename
    const disposition = req.query.download === '1' ? 'attachment' : 'inline'
    res.setHeader('Content-Type', record.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(originalName)}"; filename*=UTF-8''${encodeURIComponent(originalName)}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.sendFile(filePath)
  } catch (err) {
    console.error('[UPLOAD] Erro ao abrir arquivo privado:', err)
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao abrir arquivo.' })
  }
})

router.use(authMiddleware)

// ── CONFIGURAÇÃO DO STORAGE SEGURO ───────────────────────────────────────────
const upload = createSecureMulterUpload()
const uploadSingleFile = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: uploadErrorMessage(err) })
      return
    }
    next()
  })
}

// Extend Request to include Multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File
}

// ── UPLOAD DE ARQUIVO ─────────────────────────────────────────────────────────
// POST /api/uploads
router.post('/', uploadSingleFile, async (req: MulterRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' })
      return
    }

    const { orgId, userId, role } = req.user!
    const { titulo, descricao, tipo = 'outro', pessoa_id, pagamento_id } = req.body
    const canReadAny = canDeleteOrgRecords(role)

    if (!titulo?.trim()) {
      removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(400).json({ error: 'Título é obrigatório.' })
      return
    }

    let pessoaNome: string | null = null
    if (pessoa_id) {
      const pessoa = await queryOne<{ nome: string }>(
        `SELECT nome FROM pessoas
          WHERE id = $1 AND org_id = $2
            AND ($3::boolean = TRUE OR user_id = $4)`,
        [pessoa_id, orgId, canReadAny, userId],
      )
      if (!pessoa) {
        removeUploadByUrl(buildUploadUrl(req.file.filename))
        res.status(404).json({ error: 'Pessoa não encontrada ou sem permissão.' })
        return
      }
      pessoaNome = pessoa.nome
    }

    if (pagamento_id) {
      const pagamento = await queryOne(
        `SELECT id FROM pagamentos
          WHERE id = $1 AND org_id = $2
            AND ($3::boolean = TRUE OR criado_por = $4)`,
        [pagamento_id, orgId, canReadAny, userId],
      )
      if (!pagamento) {
        removeUploadByUrl(buildUploadUrl(req.file.filename))
        res.status(404).json({ error: 'Pagamento não encontrado ou sem permissão.' })
        return
      }
    }

    const arquivo_url = buildUploadUrl(req.file.filename)

    const doc = await queryOne<any>(
      `INSERT INTO documentos
         (org_id, criado_por, titulo, descricao, tipo, arquivo_url, mime_type, tamanho, pessoa_id, pessoa_nome, pagamento_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        orgId, userId, titulo.trim(), descricao || null, tipo,
        arquivo_url, req.file.mimetype, req.file.size,
        pessoa_id || null, pessoaNome, pagamento_id || null,
      ],
    )

    if (pagamento_id) {
      await query(
        'UPDATE pagamentos SET comprovante_url = $1 WHERE id = $2 AND org_id = $3',
        [arquivo_url, pagamento_id, orgId],
      )
    }

    const documentoSeguro = doc ? { ...doc, arquivo_url: buildPrivateFileUrl(req, doc.arquivo_url, 'documento', String(doc.id)) } : doc
    res.status(201).json({ documento: documentoSeguro, arquivo_url: documentoSeguro?.arquivo_url || null })
  } catch (err: unknown) {
    if ((req as MulterRequest).file) {
      removeUploadByUrl(buildUploadUrl((req as MulterRequest).file!.filename))
    }
    const msg = uploadErrorMessage(err)
    console.error('[UPLOAD] Erro:', msg)
    res.status(500).json({ error: msg })
  }
})

// ── LISTAR DOCUMENTOS ─────────────────────────────────────────────────────────
// GET /api/uploads
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { pessoa_id, pagamento_id, tipo } = req.query

    let sql = `
      SELECT d.*, p.nome AS pessoa_nome_atual
      FROM documentos d
      LEFT JOIN pessoas p ON p.id = d.pessoa_id AND p.org_id = d.org_id
      WHERE d.org_id = $1 AND d.criado_por = $2
    `
    const params: unknown[] = [orgId, userId]
    let idx = 3

    if (pessoa_id)    { sql += ` AND d.pessoa_id = $${idx++}`;    params.push(pessoa_id) }
    if (pagamento_id) { sql += ` AND d.pagamento_id = $${idx++}`; params.push(pagamento_id) }
    if (tipo)         { sql += ` AND d.tipo = $${idx++}`;         params.push(tipo) }

    sql += ' ORDER BY d.created_at DESC'

    const documentos = await query(sql, params)
    res.json({ documentos: documentos.map((documento: any) => ({
      ...documento,
      arquivo_url: buildPrivateFileUrl(req, documento.arquivo_url, 'documento', String(documento.id)),
    })) })
  } catch (err) {
    console.error('[UPLOAD] Erro ao listar:', err)
    res.status(500).json({ error: 'Erro ao buscar documentos.' })
  }
})

// ── EXCLUIR DOCUMENTO ─────────────────────────────────────────────────────────
// DELETE /api/uploads/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const canDeleteAny = canDeleteOrgRecords(role)
    const doc = await queryOne<{ arquivo_url: string }>(
      `SELECT arquivo_url FROM documentos
       WHERE id = $1 AND org_id = $2 AND ($3::boolean = TRUE OR criado_por = $4)`,
      [req.params.id, orgId, canDeleteAny, userId],
    )
    if (!doc) { res.status(404).json({ error: 'Documento não encontrado.' }); return }

    removeUploadByUrl(doc.arquivo_url)

    await query(
      `DELETE FROM documentos
       WHERE id = $1 AND org_id = $2 AND ($3::boolean = TRUE OR criado_por = $4)`,
      [req.params.id, orgId, canDeleteAny, userId]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[UPLOAD] Erro ao excluir:', err)
    res.status(500).json({ error: 'Erro ao excluir documento.' })
  }
})

// ── HISTÓRICO DE PESSOA ───────────────────────────────────────────────────────
// GET /api/uploads/historico/:pessoaId
router.get('/historico/:pessoaId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { pessoaId } = req.params

    // Carrega apenas se a pessoa pertence ao usuário
    const pessoa = await queryOne('SELECT * FROM pessoas WHERE id = $1 AND org_id = $2 AND user_id = $3', [pessoaId, orgId, userId])
    if (!pessoa) { res.status(404).json({ error: 'Pessoa não encontrada.' }); return }

    const [documentos, pagamentos, tarefas] = await Promise.all([
      query('SELECT * FROM documentos WHERE pessoa_id = $1 AND org_id = $2 AND criado_por = $3 ORDER BY created_at DESC', [pessoaId, orgId, userId]),
      query('SELECT * FROM pagamentos WHERE pessoa_id = $1 AND org_id = $2 AND criado_por = $3 ORDER BY created_at DESC', [pessoaId, orgId, userId]),
      query(
        `SELECT t.id, t.titulo, t.prazo, t.data, t.status, t.prioridade
           FROM tarefas t
          WHERE t.responsavel_id = (
            SELECT user_id FROM pessoas WHERE id = $1 AND org_id = $2 AND user_id = $3
          ) AND t.org_id = $2
          ORDER BY t.created_at DESC`,
        [pessoaId, orgId, userId],
      ),
    ])

    const pags = pagamentos as Record<string, any>[]
    const totalDevo       = pags.filter(p => p.tipo === 'pagamento'   && p.status === 'pendente').reduce((a, b) => a + Number(b.valor), 0)
    const totalMeDevem    = pags.filter(p => p.tipo === 'recebimento' && p.status === 'pendente').reduce((a, b) => a + Number(b.valor), 0)
    const totalPago       = pags.filter(p => p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0)
    const totalPendente   = pags.filter(p => p.status === 'pendente').reduce((a, b) => a + Number(b.valor), 0)

    const documentosSeguros = (documentos as any[]).map((documento) => ({
      ...documento,
      arquivo_url: buildPrivateFileUrl(req, documento.arquivo_url, 'documento', String(documento.id)),
    }))
    res.json({ pessoa, documentos: documentosSeguros, pagamentos, tarefas, resumo: { totalDevo, totalMeDevem, totalPago, totalPendente } })
  } catch (err) {
    console.error('[UPLOAD] Erro no histórico:', err)
    res.status(500).json({ error: 'Erro ao buscar histórico.' })
  }
})

export default router
