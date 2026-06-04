import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { gerarAnaliseGemini } from '../services/geminiService'
import { criarNotificacao } from '../lib/notifHelper'

const router = Router()
router.use(authMiddleware)

type Nivel = 'baixo' | 'medio' | 'alto' | 'critico'
type AcaoInteligenteTipo =
  | 'abrir_tarefa'
  | 'ver_tarefas_atrasadas'
  | 'ver_tarefas_sem_responsavel'
  | 'ver_financeiro'
  | 'ver_agenda'
  | 'priorizar_tarefa'
  | 'criar_tarefa_cobranca'
  | 'cobrar_responsavel'

interface AcaoInteligente {
  id: string
  tipo: AcaoInteligenteTipo
  titulo: string
  detalhe: string
  destino?: string
  tarefa_id?: string
  prioridade?: Nivel
  executavel?: boolean
  confirmacao?: string
}

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

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

async function addHistoricoSeguro(input: { orgId: string; tarefaId: string; userId: string; acao: string; observacao?: string | null }) {
  await query(
    `INSERT INTO tarefas_historico (org_id, tarefa_id, user_id, acao, observacao)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.orgId, input.tarefaId, input.userId, input.acao, input.observacao || null]
  ).catch(async () => {
    await query(
      `INSERT INTO tarefa_historico (org_id, tarefa_id, usuario_id, acao, dados)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.orgId, input.tarefaId, input.userId, input.acao, JSON.stringify({ observacao: input.observacao || null })]
    ).catch(() => {})
  })
}

function montarAcoes(input: {
  metricas: Record<string, number>
  saldoPrevisto: number
  tarefasCriticas: any[]
}): AcaoInteligente[] {
  const { metricas, saldoPrevisto, tarefasCriticas } = input
  const acoes: AcaoInteligente[] = []

  if (metricas.tarefas_atrasadas > 0) {
    acoes.push({
      id: 'ver_tarefas_atrasadas',
      tipo: 'ver_tarefas_atrasadas',
      titulo: 'Abrir tarefas atrasadas',
      detalhe: `${metricas.tarefas_atrasadas} tarefa(s) estão fora do prazo. Clique para ir direto ao quadro de tarefas.`,
      destino: '/tarefas?filtro=atrasadas',
      prioridade: metricas.tarefas_atrasadas >= 5 ? 'critico' : 'alto',
      executavel: false,
    })
  }

  if (metricas.tarefas_sem_responsavel > 0) {
    acoes.push({
      id: 'ver_tarefas_sem_responsavel',
      tipo: 'ver_tarefas_sem_responsavel',
      titulo: 'Resolver tarefas sem responsável',
      detalhe: `${metricas.tarefas_sem_responsavel} tarefa(s) precisam de executor ou subtarefa assumível.`,
      destino: '/tarefas?filtro=sem-responsavel',
      prioridade: 'medio',
      executavel: false,
    })
  }

  if (metricas.pagamentos_vencidos > 0 || metricas.recebimentos_vencidos > 0 || saldoPrevisto < 0) {
    acoes.push({
      id: 'criar_tarefa_cobranca',
      tipo: 'criar_tarefa_cobranca',
      titulo: 'Criar tarefa de regularização financeira',
      detalhe: `A IA encontrou pendências financeiras. Pagamentos vencidos: ${dinheiro(metricas.pagamentos_vencidos)}. Recebimentos vencidos: ${dinheiro(metricas.recebimentos_vencidos)}.`,
      destino: '/financeiro',
      prioridade: metricas.pagamentos_vencidos > 0 || saldoPrevisto < 0 ? 'critico' : 'alto',
      executavel: true,
      confirmacao: 'Criar uma tarefa de equipe para regularizar/cobrar pendências financeiras?',
    })
  }

  if (metricas.agenda_7_dias > 0) {
    acoes.push({
      id: 'ver_agenda',
      tipo: 'ver_agenda',
      titulo: 'Revisar compromissos da semana',
      detalhe: `${metricas.agenda_7_dias} compromisso(s) nos próximos 7 dias.`,
      destino: '/agenda',
      prioridade: 'baixo',
      executavel: false,
    })
  }

  for (const tarefa of tarefasCriticas.slice(0, 5)) {
    acoes.push({
      id: `abrir_tarefa_${tarefa.id}`,
      tipo: 'abrir_tarefa',
      titulo: `Abrir: ${tarefa.titulo}`,
      detalhe: `${tarefa.responsavel_nome || 'Sem responsável'} · ${tarefa.status} · prioridade ${tarefa.prioridade || 'média'}`,
      destino: `/tarefas?task=${encodeURIComponent(tarefa.id)}`,
      tarefa_id: tarefa.id,
      prioridade: String(tarefa.prioridade) === 'alta' ? 'alto' : 'medio',
      executavel: false,
    })
    if (String(tarefa.prioridade || '') !== 'alta') {
      acoes.push({
        id: `priorizar_${tarefa.id}`,
        tipo: 'priorizar_tarefa',
        titulo: `Marcar como alta prioridade`,
        detalhe: `Elevar a prioridade da tarefa "${tarefa.titulo}" para aparecer primeiro na operação.`,
        destino: `/tarefas?task=${encodeURIComponent(tarefa.id)}`,
        tarefa_id: tarefa.id,
        prioridade: 'medio',
        executavel: true,
        confirmacao: 'Marcar esta tarefa como alta prioridade?',
      })
    }
    if (tarefa.responsavel_id || tarefa.aceita_por) {
      acoes.push({
        id: `cobrar_${tarefa.id}`,
        tipo: 'cobrar_responsavel',
        titulo: `Cobrar responsável`,
        detalhe: `Enviar alerta interno para quem está responsável por "${tarefa.titulo}".`,
        destino: `/tarefas?task=${encodeURIComponent(tarefa.id)}`,
        tarefa_id: tarefa.id,
        prioridade: 'medio',
        executavel: true,
        confirmacao: 'Enviar notificação de cobrança ao responsável?',
      })
    }
  }

  return acoes.slice(0, 14)
}

router.get('/painel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const gestorLike = ['admin', 'dev', 'gestor', 'sub_gestor'].includes(role)
    const personalFilter = gestorLike ? '' : ' AND (t.criado_por = $2 OR t.responsavel_id = $2 OR t.aceita_por = $2)'
    const taskParams = gestorLike ? [orgId] : [orgId, userId]
    const paymentFilter = ' AND p.criado_por = $2'
    const agendaFilter = ' AND a.criado_por = $2'

    const tarefasRows = await query<any>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS abertas,
        COUNT(*) FILTER (WHERE status IN ('concluida','aprovada'))::int AS concluidas,
        COUNT(*) FILTER (WHERE status IN ('pendente','em_progresso','devolvida','reenviada') AND COALESCE(prazo, data) < CURRENT_DATE)::int AS atrasadas,
        COUNT(*) FILTER (WHERE prioridade = 'alta' AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS alta_abertas,
        COUNT(*) FILTER (WHERE responsavel_id IS NULL AND COALESCE(modo_distribuicao,'normal') <> 'livre_equipe' AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS sem_responsavel,
        COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(checklist, '[]'::jsonb)) > 0)::int AS com_checklist,
        COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(checklist, '[]'::jsonb)) = 0 AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS sem_checklist
      FROM tarefas t
      WHERE t.org_id = $1${personalFilter}
    `, taskParams)

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
      SELECT id, titulo, prioridade, status, prazo, data, responsavel_nome, responsavel_id, aceita_por, updated_at, data_reabertura
      FROM tarefas t
      WHERE t.org_id = $1${personalFilter}
        AND status IN ('pendente','em_progresso','devolvida','reenviada')
      ORDER BY
        CASE WHEN COALESCE(prazo, data) < CURRENT_DATE THEN 0 ELSE 1 END,
        CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
        COALESCE(data_reabertura, updated_at, created_at) DESC,
        COALESCE(prazo, data) ASC NULLS LAST
      LIMIT 8
    `, taskParams)

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

    const riscos: Array<{ titulo: string; detalhe: string; nivel: Nivel; destino?: string }> = []
    if (metricas.tarefas_atrasadas > 0) riscos.push({ titulo: 'Tarefas atrasadas', detalhe: `${metricas.tarefas_atrasadas} tarefa(s) fora do prazo precisam de ação.`, nivel: metricas.tarefas_atrasadas >= 5 ? 'critico' : 'alto', destino: '/tarefas?filtro=atrasadas' })
    if (metricas.tarefas_alta_prioridade > 0) riscos.push({ titulo: 'Prioridades críticas abertas', detalhe: `${metricas.tarefas_alta_prioridade} tarefa(s) de alta prioridade ainda abertas.`, nivel: 'alto', destino: '/tarefas?prioridade=alta' })
    if (metricas.tarefas_sem_responsavel > 0) riscos.push({ titulo: 'Tarefas sem responsável', detalhe: `${metricas.tarefas_sem_responsavel} tarefa(s) precisam de dono definido.`, nivel: 'medio', destino: '/tarefas?filtro=sem-responsavel' })
    if (metricas.pagamentos_vencidos > 0) riscos.push({ titulo: 'Pagamentos vencidos', detalhe: `${dinheiro(metricas.pagamentos_vencidos)} em contas a pagar vencidas.`, nivel: 'critico', destino: '/financeiro?status=vencidos&tipo=pagamento' })
    if (metricas.recebimentos_vencidos > 0) riscos.push({ titulo: 'Recebimentos atrasados', detalhe: `${dinheiro(metricas.recebimentos_vencidos)} em contas a receber vencidas.`, nivel: 'alto', destino: '/financeiro?status=vencidos&tipo=recebimento' })
    if (saldoPrevisto < 0) riscos.push({ titulo: 'Saldo previsto negativo', detalhe: `Previsão do caixa está em ${dinheiro(saldoPrevisto)}.`, nivel: 'critico', destino: '/financeiro' })
    if (riscos.length === 0) riscos.push({ titulo: 'Operação controlada', detalhe: 'Nenhum risco crítico encontrado nos dados atuais.', nivel: 'baixo', destino: '/tarefas' })

    const recomendacoes = [
      ...(metricas.tarefas_atrasadas > 0 ? [{ titulo: 'Resolver atrasos primeiro', detalhe: 'Comece pelas tarefas vencidas e de alta prioridade.', acao: 'Abrir tarefas críticas', destino: '/tarefas?filtro=atrasadas' }] : []),
      ...(metricas.tarefas_sem_responsavel > 0 ? [{ titulo: 'Distribuir responsabilidades', detalhe: 'Toda tarefa aberta precisa ter responsável claro.', acao: 'Atribuir responsáveis', destino: '/tarefas?filtro=sem-responsavel' }] : []),
      ...(metricas.pagamentos_vencidos > 0 ? [{ titulo: 'Regularizar contas vencidas', detalhe: 'Reduza risco financeiro tratando pagamentos vencidos hoje.', acao: 'Abrir financeiro', destino: '/financeiro?status=vencidos' }] : []),
      ...(metricas.recebimentos_vencidos > 0 ? [{ titulo: 'Cobrar recebimentos atrasados', detalhe: 'Transforme recebimentos vencidos em tarefa de cobrança.', acao: 'Criar cobrança', destino: '/financeiro?status=vencidos&tipo=recebimento' }] : []),
      { titulo: 'Revisar agenda da semana', detalhe: `${metricas.agenda_7_dias} compromisso(s) nos próximos 7 dias.`, acao: 'Ver agenda', destino: '/agenda' },
    ]

    const resumo = `Saúde operacional ${score}/100. ${metricas.tarefas_abertas} tarefa(s) abertas, ${metricas.tarefas_atrasadas} atrasada(s), saldo pago ${dinheiro(saldoPago)} e saldo previsto ${dinheiro(saldoPrevisto)}.`
    const acoes = montarAcoes({ metricas, saldoPrevisto, tarefasCriticas: topCriticas })
    const gemini = await gerarAnaliseGemini({ score, resumo, metricas, riscos, recomendacoes, acoes })

    res.json({
      score,
      nivel: nivel(score),
      resumo,
      metricas: { ...metricas, saldo_pago: saldoPago, saldo_previsto: saldoPrevisto },
      riscos,
      recomendacoes,
      acoes,
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

router.post('/executar-acao', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const tipo = String(req.body?.tipo || '') as AcaoInteligenteTipo
    const tarefaId = String(req.body?.tarefa_id || '')
    const gestorLike = ['admin', 'dev', 'gestor', 'sub_gestor'].includes(role)

    if (tipo === 'priorizar_tarefa') {
      if (!tarefaId) { res.status(400).json({ error: 'Tarefa não informada.' }); return }
      const tarefa = await queryOne<any>(
        `UPDATE tarefas SET prioridade = 'alta', updated_at = NOW()
         WHERE id = $1 AND org_id = $2
         RETURNING *`,
        [tarefaId, orgId]
      )
      if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
      await addHistoricoSeguro({ orgId, tarefaId, userId, acao: 'ia_priorizou', observacao: 'Central Inteligente marcou a tarefa como alta prioridade.' })
      res.json({ ok: true, mensagem: 'Tarefa marcada como alta prioridade.', destino: `/tarefas?task=${encodeURIComponent(tarefaId)}`, tarefa })
      return
    }

    if (tipo === 'cobrar_responsavel') {
      if (!tarefaId) { res.status(400).json({ error: 'Tarefa não informada.' }); return }
      const tarefa = await queryOne<any>(`SELECT * FROM tarefas WHERE id = $1 AND org_id = $2`, [tarefaId, orgId])
      if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }
      const destinoUser = tarefa.aceita_por || tarefa.responsavel_id
      if (!destinoUser) { res.status(400).json({ error: 'A tarefa ainda não tem responsável para cobrar.' }); return }
      await criarNotificacao({
        orgId,
        userId: destinoUser,
        tipo: 'tarefa_atualizada',
        titulo: '⚠️ Tarefa precisa de atenção',
        body: `A Central Inteligente sinalizou prioridade na tarefa "${tarefa.titulo}".`,
        referenciaId: tarefa.id,
        referenciaTipo: 'tarefa',
      }).catch(() => {})
      await addHistoricoSeguro({ orgId, tarefaId, userId, acao: 'ia_cobrou_responsavel', observacao: 'Central Inteligente enviou alerta ao responsável.' })
      res.json({ ok: true, mensagem: 'Responsável notificado.', destino: `/tarefas?task=${encodeURIComponent(tarefaId)}` })
      return
    }

    if (tipo === 'criar_tarefa_cobranca') {
      if (!gestorLike) { res.status(403).json({ error: 'Apenas gestor/admin pode criar tarefa de cobrança pela inteligência.' }); return }
      const titulo = 'Regularizar pendências financeiras detectadas pela IA'
      const existente = await queryOne<any>(
        `SELECT id FROM tarefas
         WHERE org_id = $1 AND criado_por = $2 AND lower(titulo) = lower($3)
           AND status IN ('pendente','em_progresso','devolvida','reenviada')
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, userId, titulo]
      )
      if (existente) {
        res.json({ ok: true, mensagem: 'Já existe uma tarefa aberta para essa regularização.', destino: `/tarefas?task=${encodeURIComponent(existente.id)}` })
        return
      }
      const checklist = JSON.stringify([
        { id: uuidv4(), texto: 'Conferir pagamentos vencidos', feito: false, pontuacao: 10 },
        { id: uuidv4(), texto: 'Conferir recebimentos atrasados', feito: false, pontuacao: 10 },
        { id: uuidv4(), texto: 'Registrar plano de regularização no financeiro', feito: false, pontuacao: 15 },
      ])
      const tarefa = await queryOne<any>(
        `INSERT INTO tarefas (org_id, criado_por, titulo, descricao, prazo, prioridade, status, status_gestor, escopo, modo_distribuicao, checklist, obs, pontuacao, conta_ranking, updated_at)
         VALUES ($1,$2,$3,$4,$5,'alta','pendente','aguardando','equipe','livre_equipe',$6,'Criada pela Central Inteligente',35,TRUE,NOW())
         RETURNING *`,
        [orgId, userId, titulo, 'Tarefa criada automaticamente pela Central Inteligente para tratar pendências financeiras detectadas no painel.', todayDate(), checklist]
      )
      await addHistoricoSeguro({ orgId, tarefaId: tarefa.id, userId, acao: 'ia_criou_tarefa', observacao: 'Central Inteligente criou tarefa de regularização financeira.' })
      res.json({ ok: true, mensagem: 'Tarefa de cobrança criada.', destino: `/tarefas?task=${encodeURIComponent(tarefa.id)}`, tarefa })
      return
    }

    res.status(400).json({ error: 'Ação inteligente não suportada.' })
  } catch (err) {
    console.error('[INTELIGENCIA] Erro ao executar ação:', err)
    res.status(500).json({ error: 'Erro ao executar ação inteligente.' })
  }
})

export default router
