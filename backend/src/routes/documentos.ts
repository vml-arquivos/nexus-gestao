import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { query, queryOne } from "../db/pool";

const router = Router();
router.use(authMiddleware);

function canDeleteOrgRecord(role: string | undefined): boolean {
  return role === "admin" || role === "dev" || role === "gestor";
}

// GET /api/documentos
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!;
    const { pessoa_id, tipo, search } = req.query;

    let sql = `
      SELECT d.*, p.nome AS pessoa_nome_atual
      FROM documentos d
      LEFT JOIN pessoas p ON p.id = d.pessoa_id
      WHERE d.org_id = $1 AND d.criado_por = $2
    `;
    const params: unknown[] = [orgId, userId];
    let idx = 3;

    if (pessoa_id) {
      sql += ` AND d.pessoa_id = $${idx++}`;
      params.push(pessoa_id);
    }
    if (tipo) {
      sql += ` AND d.tipo = $${idx++}`;
      params.push(tipo);
    }
    if (search) {
      sql += ` AND (d.titulo ILIKE $${idx} OR d.descricao ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    sql += " ORDER BY d.created_at DESC";

    const documentos = await query(sql, params);
    res.json({ documentos });
  } catch (err) {
    console.error("[DOC] Erro ao listar:", err);
    res.status(500).json({ error: "Erro ao buscar documentos." });
  }
});

// GET /api/documentos/:id
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!;
    const doc = await queryOne(
      `SELECT d.*, p.nome AS pessoa_nome_atual
       FROM documentos d
       LEFT JOIN pessoas p ON p.id = d.pessoa_id
       WHERE d.id = $1 AND d.org_id = $2 AND d.criado_por = $3`,
      [req.params.id, orgId, userId],
    );
    if (!doc) {
      res.status(404).json({ error: "Documento não encontrado." });
      return;
    }
    res.json({ documento: doc });
  } catch (err) {
    console.error("[DOC] Erro ao buscar:", err);
    res.status(500).json({ error: "Erro ao buscar documento." });
  }
});

// PATCH /api/documentos/:id — atualiza metadados (título, descrição, pessoa_id, etc.)
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!;
    const { titulo, descricao, tipo, pessoa_id, pagamento_id } = req.body;

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (titulo !== undefined) {
      sets.push(`titulo = $${idx++}`);
      params.push(titulo);
    }
    if (descricao !== undefined) {
      sets.push(`descricao = $${idx++}`);
      params.push(descricao || null);
    }
    if (tipo !== undefined) {
      sets.push(`tipo = $${idx++}`);
      params.push(tipo);
    }
    if (pessoa_id !== undefined) {
      sets.push(`pessoa_id = $${idx++}`);
      params.push(pessoa_id || null);
    }
    if (pagamento_id !== undefined) {
      sets.push(`pagamento_id = $${idx++}`);
      params.push(pagamento_id || null);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "Nenhum campo para atualizar." });
      return;
    }

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id, orgId, userId);

    const doc = await queryOne(
      `UPDATE documentos SET ${sets.join(", ")} WHERE id = $${idx++} AND org_id = $${idx} AND criado_por = $${idx + 1} RETURNING *`,
      params,
    );
    if (!doc) {
      res.status(404).json({ error: "Documento não encontrado." });
      return;
    }
    res.json({ documento: doc });
  } catch (err) {
    console.error("[DOC] Erro ao atualizar:", err);
    res.status(500).json({ error: "Erro ao atualizar documento." });
  }
});

// DELETE /api/documentos/:id
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!;
    const deleted = canDeleteOrgRecord(role)
      ? await queryOne(
          "DELETE FROM documentos WHERE id = $1 AND org_id = $2 RETURNING id",
          [req.params.id, orgId],
        )
      : await queryOne(
          "DELETE FROM documentos WHERE id = $1 AND org_id = $2 AND criado_por = $3 RETURNING id",
          [req.params.id, orgId, userId],
        );
    if (!deleted) {
      res.status(404).json({ error: "Documento não encontrado." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[DOC] Erro ao excluir:", err);
    res.status(500).json({ error: "Erro ao excluir documento." });
  }
});

export default router;
