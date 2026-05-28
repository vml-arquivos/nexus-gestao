import { Router, Request, Response } from "express";
import { query, queryOne } from "../db/pool";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

function canDeleteOrgRecord(role: string | undefined): boolean {
  return role === "admin" || role === "dev" || role === "gestor";
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!;
    const { mes, ano } = req.query;
    let sql = "SELECT * FROM agenda WHERE org_id = $1 AND criado_por = $2";
    const params: unknown[] = [orgId, userId];
    if (mes && ano) {
      sql += ` AND EXTRACT(MONTH FROM data_inicio) = $${params.length + 1} AND EXTRACT(YEAR FROM data_inicio) = $${params.length + 2}`;
      params.push(mes, ano);
    }
    sql += " ORDER BY data_inicio ASC";
    const eventos = await query(sql, params);
    res.json({ eventos });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar agenda." });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!;
    const {
      titulo,
      descricao,
      data_inicio,
      data_fim,
      local,
      tipo = "compromisso",
      participantes = [],
      lembrete_minutos = 15,
      cor,
    } = req.body;
    if (!titulo || !data_inicio) {
      res
        .status(400)
        .json({ error: "Título e data de início são obrigatórios." });
      return;
    }
    const evento = await queryOne(
      `INSERT INTO agenda (org_id, criado_por, titulo, descricao, data_inicio, data_fim, local, tipo, participantes, lembrete_minutos, cor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        orgId,
        userId,
        titulo.trim(),
        descricao || null,
        data_inicio,
        data_fim || null,
        local || null,
        tipo,
        JSON.stringify(participantes),
        lembrete_minutos,
        cor || null,
      ],
    );
    res.status(201).json({ evento });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar evento." });
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!;
    const {
      titulo,
      descricao,
      data_inicio,
      data_fim,
      local,
      tipo,
      participantes,
      lembrete_minutos,
      cor,
    } = req.body;
    const evento = await queryOne(
      `UPDATE agenda SET
         titulo = COALESCE($1,titulo), descricao = COALESCE($2,descricao),
         data_inicio = COALESCE($3,data_inicio), data_fim = COALESCE($4,data_fim),
         local = COALESCE($5,local), tipo = COALESCE($6,tipo),
         participantes = COALESCE($7,participantes), lembrete_minutos = COALESCE($8,lembrete_minutos),
         cor = COALESCE($9,cor)
       WHERE id = $10 AND org_id = $11 AND criado_por = $12 RETURNING *`,
      [
        titulo || null,
        descricao || null,
        data_inicio || null,
        data_fim || null,
        local || null,
        tipo || null,
        participantes ? JSON.stringify(participantes) : null,
        lembrete_minutos || null,
        cor || null,
        req.params.id,
        orgId,
        userId,
      ],
    );
    if (!evento) {
      res.status(404).json({ error: "Evento não encontrado." });
      return;
    }
    res.json({ evento });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar evento." });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!;
    const params = canDeleteOrgRecord(role)
      ? [req.params.id, orgId]
      : [req.params.id, orgId, userId];
    const sql = canDeleteOrgRecord(role)
      ? "DELETE FROM agenda WHERE id = $1 AND org_id = $2"
      : "DELETE FROM agenda WHERE id = $1 AND org_id = $2 AND criado_por = $3";
    await query(sql, params);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir evento." });
  }
});

export default router;
