import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { createSecureMulterUpload, buildUploadUrl, removeUploadByUrl, uploadErrorMessage } from '../lib/uploadSecurity'

const router = Router()
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

    const { orgId, userId } = req.user!
    const { titulo, descricao, tipo = 'outro', pessoa_id, pagamento_id } = req.body

    if (!titulo?.trim()) {
      removeUploadByUrl(buildUploadUrl(req.file.filename))
      res.status(400).json({ error: 'Título é obrigatório.' })
      return
    }

    let pessoaNome: string | null = null
    if (pessoa_id) {
      const pessoa = await queryOne<{ nome: string }>(
        'SELECT nome FROM pessoas WHERE id = $1 AND org_id = $2',
        [pessoa_id, orgId],
      )
      pessoaNome = pessoa?.nome ?? null
    }

    const arquivo_url = buildUploadUrl(req.file.filename)

    const doc = await queryOne(
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

    res.status(201).json({ documento: doc, arquivo_url })
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
      LEFT JOIN pessoas p ON p.id = d.pessoa_id
      WHERE d.org_id = $1 AND d.criado_por = $2
    `
    const params: unknown[] = [orgId, userId]
    let idx = 3

    if (pessoa_id)    { sql += ` AND d.pessoa_id = $${idx++}`;    params.push(pessoa_id) }
    if (pagamento_id) { sql += ` AND d.pagamento_id = $${idx++}`; params.push(pagamento_id) }
    if (tipo)         { sql += ` AND d.tipo = $${idx++}`;         params.push(tipo) }

    sql += ' ORDER BY d.created_at DESC'

    const documentos = await query(sql, params)
    res.json({ documentos })
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
        `SELECT t.* FROM tarefas t
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

    res.json({ pessoa, documentos, pagamentos, tarefas, resumo: { totalDevo, totalMeDevem, totalPago, totalPendente } })
  } catch (err) {
    console.error('[UPLOAD] Erro no histórico:', err)
    res.status(500).json({ error: 'Erro ao buscar histórico.' })
  }
})

export default router
