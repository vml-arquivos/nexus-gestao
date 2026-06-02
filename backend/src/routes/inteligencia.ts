import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query } from '../db/pool'
import { gerarAnaliseGemini } from '../services/geminiService'

const router = Router()
router.use(authMiddleware)

type Nivel = 'baixo' | 'medio' | 'alto' | 'critico'

function toNumber(value: unknown): number {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function nivel(score: number): Nivel {
  if (score >= 80) return 'baixo'
  if (score >= 60) return 'medio'
  if (score >= 40) return 'alto'
  return 'critico'
}

function dinheiro(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

router.get('/painel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const gestorLike = ['admin', 'dev', 'gestor', 'sub_gestor'].includes(role)
    const personalFilter = gestorLike ? '' : ' AND (t.criado_por = $2 OR t.responsavel_id = $2 OR t.aceita_por = $2)'
    const paymentFilter = ' AND p.criado_por = $2'
    const agendaFilter = ' AND a.criado_por = $2'

    const tarefasRows = await query<any>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS abertas,
        COUNT(*) FILTER (WHERE status IN ('concluida','aprovada'))::int AS concluidas,
        COUNT(*) FILTER (WHERE status IN ('pendente','em_progresso','devolvida','reenviada') AND COALESCE(prazo, data) < CURRENT_DATE)::int AS atrasadas,
        COUNT(*) FILTER (WHERE prioridade = 'alta' AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS alta_abertas,
        COUNT(*) FILTER (WHERE responsavel_id IS NULL AND modo_distribuicao <> 'livre_equipe' AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS sem_responsavel,
        COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(checklist, '[]'::jsonb)) > 0)::int AS com_checklist,
        COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(checklist, '[]'::jsonb)) = 0 AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS sem_checklist
      FROM tarefas t
      WHERE t.org_id = $1${personalFilter}
    `, [orgId, userId])

    const financeiroRows = await query<any>(`
      SELECT
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'recebimento' AND status = 'pago'), 0)::numeric AS receita_paga,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'recebimento' AND status = 'pendente'), 0)::numeric AS receita_pendente,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'pagamento' AND status = 'pago'), 0)::numeric AS despesa_paga,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'pagamento' AND status = 'pendente'), 0)::numeric AS despesa_pendente,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'pagamento' AND status = 'pendente' AND vencimento < CURRENT_DATE), 0)::numeric AS pagamentos_vencidos,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'recebimento' AND status = 'pendente' AND vencimento < CURRENT_DATE), 0)::numeric AS recebimentos_vencidos,
        COUNT(*) FILTER (WHERE status = 'pendente' AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')::int AS vence_7_dias
      FROM pagamentos p
      WHERE p.org_id = $1${paymentFilter}
    `, [orgId, userId])

    const agendaRows = await query<any>(`
      SELECT
        COUNT(*) FILTER (WHERE data_inicio::date = CURRENT_DATE)::int AS hoje,
        COUNT(*) FILTER (WHERE data_inicio::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')::int AS proximos_7_dias,
        COUNT(*) FILTER (WHERE data_inicio < NOW())::int AS passados
      FROM agenda a
      WHERE a.org_id = $1${agendaFilter}
    `, [orgId, userId])

    const sobrecargaRows = gestorLike ? await query<any>(`
      SELECT
        COALESCE(t.responsavel_nome, p.nome, 'Sem responsável') AS nome,
        COUNT(*)::int AS abertas,
        COUNT(*) FILTER (WHERE COALESCE(t.prazo, t.data) < CURRENT_DATE)::int AS atrasadas
      FROM tarefas t
      LEFT JOIN profiles p ON p.id = t.responsavel_id
      WHERE t.org_id = $1 AND t.status IN ('pendente','em_progresso','devolvida','reenviada')
      GROUP BY COALESCE(t.responsavel_nome, p.nome, 'Sem responsável')
      ORDER BY abertas DESC, atrasadas DESC
      LIMIT 5
    `, [orgId]) : []

    const topCriticas = await query<any>(`
      SELECT id, titulo, prioridade, status, prazo, data, responsavel_nome
      FROM tarefas t
      WHERE t.org_id = $1${personalFilter}
        AND status IN ('pendente','em_progresso','devolvida','reenviada')
      ORDER BY
        CASE WHEN COALESCE(prazo, data) < CURRENT_DATE THEN 0 ELSE 1 END,
        CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
        COALESCE(prazo, data) ASC NULLS LAST,
        created_at ASC
      LIMIT 8
    `, [orgId, userId])

    const t = tarefasRows[0] || {}
    const f = financeiroRows[0] || {}
    const a = agendaRows[0] || {}

    const metricas = {
      tarefas_total: toNumber(t.total),
      tarefas_abertas: toNumber(t.abertas),
      tarefas_concluidas: toNumber(t.concluidas),
      tarefas_atrasadas: toNumber(t.atrasadas),
      tarefas_alta_prioridade: toNumber(t.alta_abertas),
      tarefas_sem_responsavel: toNumber(t.sem_responsavel),
      tarefas_sem_checklist: toNumber(t.sem_checklist),
      receita_paga: toNumber(f.receita_paga),
      receita_pendente: toNumber(f.receita_pendente),
      despesa_paga: toNumber(f.despesa_paga),
      despesa_pendente: toNumber(f.despesa_pendente),
      pagamentos_vencidos: toNumber(f.pagamentos_vencidos),
      recebimentos_vencidos: toNumber(f.recebimentos_vencidos),
      financeiro_vence_7_dias: toNumber(f.vence_7_dias),
      agenda_hoje: toNumber(a.hoje),
      agenda_7_dias: toNumber(a.proximos_7_dias),
    }

    const saldoPago = metricas.receita_paga - metricas.despesa_paga
    const saldoPrevisto = (metricas.receita_paga + metricas.receita_pendente) - (metricas.despesa_paga + metricas.despesa_pendente)

    let score = 100
    score -= Math.min(30, metricas.tarefas_atrasadas * 6)
    score -= Math.min(16, metricas.tarefas_alta_prioridade * 4)
    score -= Math.min(12, metricas.tarefas_sem_responsavel * 4)
    score -= Math.min(10, metricas.tarefas_sem_checklist * 2)
    score -= metricas.pagamentos_vencidos > 0 ? 12 : 0
    score -= metricas.recebimentos_vencidos > 0 ? 8 : 0
    score -= saldoPrevisto < 0 ? 12 : 0
    score = Math.max(0, Math.min(100, score))

    const riscos: Array<{ titulo: string; detalhe: string; nivel: Nivel }> = []
    if (metricas.tarefas_atrasadas > 0) riscos.push({ titulo: 'Tarefas atrasadas', detalhe: `${metricas.tarefas_atrasadas} tarefa(s) fora do prazo precisam de ação.`, nivel: metricas.tarefas_atrasadas >= 5 ? 'critico' : 'alto' })
    if (metricas.tarefas_alta_prioridade > 0) riscos.push({ titulo: 'Prioridades críticas abertas', detalhe: `${metricas.tarefas_alta_prioridade} tarefa(s) de alta prioridade ainda abertas.`, nivel: 'alto' })
    if (metricas.tarefas_sem_responsavel > 0) riscos.push({ titulo: 'Tarefas sem responsável', detalhe: `${metricas.tarefas_sem_responsavel} tarefa(s) precisam de dono definido.`, nivel: 'medio' })
    if (metricas.pagamentos_vencidos > 0) riscos.push({ titulo: 'Pagamentos vencidos', detalhe: `${dinheiro(metricas.pagamentos_vencidos)} em contas a pagar vencidas.`, nivel: 'critico' })
    if (metricas.recebimentos_vencidos > 0) riscos.push({ titulo: 'Recebimentos atrasados', detalhe: `${dinheiro(metricas.recebimentos_vencidos)} em contas a receber vencidas.`, nivel: 'alto' })
    if (saldoPrevisto < 0) riscos.push({ titulo: 'Saldo previsto negativo', detalhe: `Previsão do caixa está em ${dinheiro(saldoPrevisto)}.`, nivel: 'critico' })
    if (riscos.length === 0) riscos.push({ titulo: 'Operação controlada', detalhe: 'Nenhum risco crítico encontrado nos dados atuais.', nivel: 'baixo' })

    const recomendacoes = [
      ...(metricas.tarefas_atrasadas > 0 ? [{ titulo: 'Resolver atrasos primeiro', detalhe: 'Comece pelas tarefas vencidas e de alta prioridade.', acao: 'Abrir tarefas críticas' }] : []),
      ...(metricas.tarefas_sem_responsavel > 0 ? [{ titulo: 'Distribuir responsabilidades', detalhe: 'Toda tarefa aberta precisa ter responsável claro.', acao: 'Atribuir responsáveis' }] : []),
      ...(metricas.pagamentos_vencidos > 0 ? [{ titulo: 'Regularizar contas vencidas', detalhe: 'Reduza risco financeiro tratando pagamentos vencidos hoje.', acao: 'Abrir financeiro' }] : []),
      ...(metricas.recebimentos_vencidos > 0 ? [{ titulo: 'Cobrar recebimentos atrasados', detalhe: 'Transforme recebimentos vencidos em tarefa de cobrança.', acao: 'Criar cobrança' }] : []),
      { titulo: 'Revisar agenda da semana', detalhe: `${metricas.agenda_7_dias} compromisso(s) nos próximos 7 dias.`, acao: 'Ver agenda' },
    ]

    const resumo = `Saúde operacional ${score}/100. ${metricas.tarefas_abertas} tarefa(s) abertas, ${metricas.tarefas_atrasadas} atrasada(s), saldo pago ${dinheiro(saldoPago)} e saldo previsto ${dinheiro(saldoPrevisto)}.`
    const gemini = await gerarAnaliseGemini({ score, resumo, metricas, riscos, recomendacoes })

    res.json({
      score,
      nivel: nivel(score),
      resumo,
      metricas: { ...metricas, saldo_pago: saldoPago, saldo_previsto: saldoPrevisto },
      riscos,
      recomendacoes,
      sobrecarga: sobrecargaRows,
      tarefas_criticas: topCriticas,
      gemini,
      gerado_em: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[INTELIGENCIA] Erro ao gerar painel:', err)
    res.status(500).json({ error: 'Erro ao gerar inteligência operacional.' })
  }
})

export default router
