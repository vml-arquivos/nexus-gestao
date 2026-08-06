import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { authMiddleware, canDeleteOrgRecords } from '../middleware/auth'
import { sincronizarAgendaOperacional } from '../services/agendaSyncService'
import { respondRouteError } from '../lib/httpErrors'
import { shouldAutoSyncAgenda } from './agendaPolicy'
export { shouldAutoSyncAgenda } from './agendaPolicy'

const router = Router()
router.use(authMiddleware)

// Política: NUNCA sincroniza por padrão (evita a operação pesada de milhares
// de linhas travando toda listagem comum). Só sincroniza quando pedido
// EXPLICITAMENTE com ?sync=true — o oposto do comportamento anterior
// (?sync=false para desligar), que sincronizava por padrão sempre que o
// parâmetro não vinha, inclusive de chamadas antigas/cache/clientes que não
// sabiam desse parâmetro.
function canSeeOrgAgenda(role: string | undefined): boolean {
  return canDeleteOrgRecords(role)
}

async function trySyncForUser(req: Request) {
  if (!shouldAutoSyncAgenda(req.query.sync)) return null
  try {
    return await sincronizarAgendaOperacional({ orgId: req.user!.orgId, userId: req.user!.userId, forceGoogle: true })
  } catch (err) {
    console.warn('[AGENDA] Sincronização automática antes da listagem falhou:', (err as Error)?.message || err)
    return null
  }
}

// Janela padrão quando o cliente não informa mes/ano (ex.: widget do Dashboard).
// Antes, a ausência de mes/ano fazia `SELECT * FROM agenda` sem filtro de data
// e SEM LIMIT nenhum. Com o histórico atual (300 mil+ linhas na tabela agenda),
// essa consulta sem filtro varria/ordenava a tabela inteira a cada abertura do
// Dashboard, estourava o statement_timeout do Postgres e, ao tentar
// materializar centenas de milhares de linhas em memória, travava o event
// loop do Node por vários segundos — derrubando de tabela (timeout real do
// Postgres, visto nos logs como "canceling statement due to statement
// timeout") outras rotas completamente não relacionadas (/tarefas, /ranking,
// recorrência de tarefas) que compartilham o mesmo processo Node, mesmo com
// pool de conexões ocioso. Ver RELATORIO-FIX55-AGENDA-DASHBOARD-SEM-LIMITE.md.
const AGENDA_JANELA_PADRAO_DIAS_PASSADO = 45
const AGENDA_JANELA_PADRAO_DIAS_FUTURO = 120
// Backstop absoluto: nenhuma resposta de /api/agenda pode devolver mais que
// isto, mesmo que um filtro de data futuro acabe cobrindo um período muito
// grande. Protege o Node e o navegador independentemente do filtro usado.
const AGENDA_LIMITE_MAXIMO_LINHAS = 2000

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { mes, ano } = req.query
    const sync = await trySyncForUser(req)

    const params: unknown[] = [orgId]
    let sql = 'SELECT * FROM agenda WHERE org_id = $1'

    if (!canSeeOrgAgenda(role)) {
      params.push(userId)
      sql += ` AND (criado_por = $${params.length} OR participantes::text ILIKE $${params.length + 1})`
      params.push(`%${userId}%`)
    }

    let mesAnoValidos = false
    if (mes && ano) {
      const month = Number(mes)
      const year = Number(ano)
      if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2000 && year <= 2200) {
        mesAnoValidos = true
        const start = `${year}-${String(month).padStart(2, '0')}-01`
        const nextMonth = month === 12
          ? `${year + 1}-01-01`
          : `${year}-${String(month + 1).padStart(2, '0')}-01`
        sql += ` AND data_inicio >= $${params.length + 1}::date AND data_inicio < $${params.length + 2}::date`
        params.push(start, nextMonth)
      }
    }

    // Sem mes/ano (ou valor inválido): aplica uma janela padrão em vez de
    // trazer o histórico inteiro. Cobre "hoje", atrasados recentes e o
    // próximo período — suficiente para qualquer widget/resumo — sem varrer
    // a tabela inteira.
    if (!mesAnoValidos) {
      sql += ` AND data_inicio >= (NOW() - ($${params.length + 1}::text || ' days')::interval)`
      params.push(String(AGENDA_JANELA_PADRAO_DIAS_PASSADO))
      sql += ` AND data_inicio < (NOW() + ($${params.length + 1}::text || ' days')::interval)`
      params.push(String(AGENDA_JANELA_PADRAO_DIAS_FUTURO))
    }

    sql += ` ORDER BY data_inicio ASC, created_at ASC`
    sql += ` LIMIT $${params.length + 1}`
    params.push(AGENDA_LIMITE_MAXIMO_LINHAS)

    const eventos = await query(sql, params)
    res.json({ eventos, sync })
  } catch (err) {
    console.error('[AGENDA] Erro ao buscar agenda:', err)
    respondRouteError(res, err, 'Erro ao buscar agenda.')
  }
})

router.post('/sincronizar', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sincronizarAgendaOperacional({ orgId: req.user!.orgId, userId: req.user!.userId, forceGoogle: true })
    res.json({ ok: result.ok, result })
  } catch (err) {
    console.error('[AGENDA] Erro ao sincronizar agenda:', err)
    res.status(500).json({ error: (err as Error)?.message || 'Erro ao sincronizar agenda.' })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId } = req.user!
    const { titulo, descricao, data_inicio, data_fim, local, tipo = 'compromisso', participantes = [], lembrete_minutos = 15, cor } = req.body
    if (!titulo || !data_inicio) { res.status(400).json({ error: 'Título e data de início são obrigatórios.' }); return }
    const evento = await queryOne(
      `INSERT INTO agenda (org_id, criado_por, titulo, descricao, data_inicio, data_fim, local, tipo, participantes, lembrete_minutos, cor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [orgId, userId, titulo.trim(), descricao || null, data_inicio, data_fim || null, local || null, tipo, JSON.stringify(participantes), lembrete_minutos, cor || null]
    )
    res.status(201).json({ evento })
  } catch (err) {
    console.error('[AGENDA] Erro ao criar evento:', err)
    res.status(500).json({ error: 'Erro ao criar evento.' })
  }
})

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const { titulo, descricao, data_inicio, data_fim, local, tipo, participantes, lembrete_minutos, cor } = req.body
    const evento = await queryOne(
      `UPDATE agenda SET
         titulo = COALESCE($1,titulo), descricao = COALESCE($2,descricao),
         data_inicio = COALESCE($3,data_inicio), data_fim = COALESCE($4,data_fim),
         local = COALESCE($5,local), tipo = COALESCE($6,tipo),
         participantes = COALESCE($7,participantes), lembrete_minutos = COALESCE($8,lembrete_minutos),
         cor = COALESCE($9,cor), updated_at = NOW()
       WHERE id = $10 AND org_id = $11 AND ($12::boolean = TRUE OR criado_por = $13) RETURNING *`,
      [titulo||null, descricao||null, data_inicio||null, data_fim||null, local||null, tipo||null,
       participantes ? JSON.stringify(participantes) : null, lembrete_minutos||null, cor||null, req.params.id, orgId, canSeeOrgAgenda(role), userId]
    )
    if (!evento) { res.status(404).json({ error: 'Evento não encontrado ou sem permissão.' }); return }
    res.json({ evento })
  } catch (err) {
    console.error('[AGENDA] Erro ao atualizar evento:', err)
    res.status(500).json({ error: 'Erro ao atualizar evento.' })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const canDeleteAny = canDeleteOrgRecords(role)
    const deleted = await query(
      `DELETE FROM agenda
       WHERE id = $1 AND org_id = $2 AND ($3::boolean = TRUE OR criado_por = $4)
       RETURNING id`,
      [req.params.id, orgId, canDeleteAny, userId]
    ) as any[]
    if (deleted.length === 0) { res.status(404).json({ error: 'Evento não encontrado ou sem permissão.' }); return }
    res.json({ ok: true })
  } catch (err) {
    console.error('[AGENDA] Erro ao excluir evento:', err)
    res.status(500).json({ error: 'Erro ao excluir evento.' })
  }
})

export default router
