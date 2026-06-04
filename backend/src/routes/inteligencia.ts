import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query, queryOne } from '../db/pool'
import { gerarAnaliseGemini } from '../services/geminiService'
import { criarNotificacao } from '../lib/notifHelper'
import { sincronizarAgendaOperacional as sincronizarAgendaGlobal } from '../services/agendaSyncService'

const router = Router()
router.use(authMiddleware)

type Nivel = 'baixo' | 'medio' | 'alto' | 'critico'
type AcaoTipo = 'cobrar_tarefa' | 'cobrar_devedor' | 'lembrar_pagamento' | 'criar_tarefa_cobranca' | 'notificar_financeiro' | 'sincronizar_agenda'

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

function dataCurta(value?: string | null) {
  if (!value) return 'sem vencimento'
  const raw = String(value).slice(0, 10)
  const [y, m, d] = raw.split('-')
  return y && m && d ? `${d}/${m}/${y}` : raw
}

function somenteDigitos(value: unknown): string {
  return String(value || '').replace(/\D/g, '')
}

function whatsappUrlFor(contato: unknown, mensagem: string): string | null {
  let phone = somenteDigitos(contato)
  if (!phone) return null
  // Se vier telefone brasileiro sem DDI, adiciona 55 para abrir corretamente no WhatsApp.
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`
  if (phone.length < 10) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`
}

function safeTaskChecklistLengthSql() {
  return `jsonb_array_length(CASE
    WHEN t.checklist IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(t.checklist::jsonb) = 'array' THEN t.checklist::jsonb
    ELSE '[]'::jsonb
  END)`
}

async function destinatariosDaTarefa(tarefa: any, orgId: string, remetenteId: string) {
  const recipients = new Set<string>()
  if (tarefa.responsavel_id) recipients.add(tarefa.responsavel_id)
  if (tarefa.aceita_por) recipients.add(tarefa.aceita_por)
  if (tarefa.criado_por) recipients.add(tarefa.criado_por)
  if (!tarefa.responsavel_id || tarefa.modo_distribuicao === 'livre_equipe') {
    const equipe = await query<{ id: string }>('SELECT id FROM profiles WHERE org_id = $1 AND ativo = TRUE', [orgId]).catch(() => [])
    for (const membro of equipe) recipients.add(membro.id)
  }
  recipients.delete(remetenteId)
  if (recipients.size === 0 && tarefa.criado_por) recipients.add(tarefa.criado_por)
  return Array.from(recipients)
}


function mensagemFinanceira(pagamento: any): string {
  const pessoaNome = pagamento.pessoa_nome_atual || pagamento.pessoa_nome || 'cliente'
  const valor = dinheiro(toNumber(pagamento.valor))
  const vencimento = dataCurta(pagamento.vencimento)
  if (pagamento.tipo === 'recebimento') {
    return `Olá, ${pessoaNome}. Tudo bem? Identificamos um recebimento pendente no valor de ${valor}, com vencimento em ${vencimento}. Por favor, nos envie um retorno sobre a regularização ou o comprovante, para atualizarmos seu atendimento.`
  }
  return `Atenção: existe um pagamento pendente de ${valor}, vencimento ${vencimento}, referente a ${pagamento.titulo || 'lançamento financeiro'}. Verifique e atualize o financeiro.`
}


async function criarEventoAgendaSeNaoExiste(input: {
  orgId: string
  userId: string
  chave: string
  titulo: string
  descricao: string
  dataInicio: string
  tipo?: string
  cor?: string
}) {
  const marcador = `[NEXUS_SYNC:${input.chave}]`
  const existente = await queryOne<{ id: string }>(
    `SELECT id FROM agenda
     WHERE org_id = $1 AND criado_por = $2 AND descricao ILIKE $3
     LIMIT 1`,
    [input.orgId, input.userId, `%${marcador}%`]
  ).catch(() => null)
  if (existente?.id) return { id: existente.id, created: false }

  const evento = await queryOne<{ id: string }>(
    `INSERT INTO agenda (org_id, criado_por, titulo, descricao, data_inicio, data_fim, local, tipo, participantes, lembrete_minutos, cor)
     VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,'[]'::jsonb,60,$7)
     RETURNING id`,
    [input.orgId, input.userId, input.titulo, `${input.descricao}\n\n${marcador}`, input.dataInicio, input.tipo || 'prazo', input.cor || '#6C3BFF']
  )
  return { id: evento?.id || '', created: true }
}

function agendaDate(value: unknown, hour = '09:00:00') {
  const raw = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return `${raw}T${hour}`
}

async function sincronizarAgendaOperacional(input: { orgId: string; userId: string }) {
  const tarefas = await query<any>(
    `SELECT id, titulo, prazo, data, prioridade, status, responsavel_nome
     FROM tarefas
     WHERE org_id = $1
       AND status IN ('pendente','em_progresso','devolvida','reenviada')
       AND COALESCE(prazo, data) IS NOT NULL
     ORDER BY COALESCE(prazo, data) ASC
     LIMIT 80`,
    [input.orgId]
  ).catch(() => [])

  const financeiros = await query<any>(
    `SELECT id, titulo, tipo, valor, vencimento, status, pessoa_nome
     FROM pagamentos
     WHERE org_id = $1
       AND status = 'pendente'
       AND vencimento IS NOT NULL
     ORDER BY vencimento ASC
     LIMIT 80`,
    [input.orgId]
  ).catch(() => [])

  let criados = 0
  let existentes = 0

  for (const t of tarefas) {
    const dataInicio = agendaDate(t.prazo || t.data, t.prioridade === 'alta' ? '08:30:00' : '09:00:00')
    if (!dataInicio) continue
    const result = await criarEventoAgendaSeNaoExiste({
      orgId: input.orgId,
      userId: input.userId,
      chave: `tarefa:${t.id}`,
      titulo: `Tarefa: ${t.titulo}`,
      descricao: `Prazo sincronizado automaticamente pelo Nexus.\nStatus: ${t.status}.\nPrioridade: ${t.prioridade}.\nResponsável: ${t.responsavel_nome || 'sem responsável'}.`,
      dataInicio,
      tipo: 'prazo',
      cor: t.prioridade === 'alta' ? '#ef4444' : '#6C3BFF',
    })
    result.created ? criados++ : existentes++
  }

  for (const f of financeiros) {
    const dataInicio = agendaDate(f.vencimento, f.tipo === 'recebimento' ? '10:00:00' : '11:00:00')
    if (!dataInicio) continue
    const result = await criarEventoAgendaSeNaoExiste({
      orgId: input.orgId,
      userId: input.userId,
      chave: `financeiro:${f.id}`,
      titulo: `${f.tipo === 'recebimento' ? 'Receber' : 'Pagar'}: ${f.titulo}`,
      descricao: `Lançamento financeiro sincronizado automaticamente pelo Nexus.\nPessoa: ${f.pessoa_nome || 'não informada'}.\nValor: ${dinheiro(toNumber(f.valor))}.\nStatus: ${f.status}.`,
      dataInicio,
      tipo: 'prazo',
      cor: f.tipo === 'recebimento' ? '#059669' : '#d97706',
    })
    result.created ? criados++ : existentes++
  }

  return { criados, existentes, tarefas: tarefas.length, financeiros: financeiros.length }
}

async function criarTarefaCobranca(input: { orgId: string; userId: string; pagamento: any }) {
  const p = input.pagamento
  const isRecebimento = p.tipo === 'recebimento'
  const titulo = isRecebimento
    ? `Cobrar recebimento vencido — ${p.pessoa_nome || p.titulo}`
    : `Regularizar pagamento vencido — ${p.titulo}`
  const descricao = isRecebimento
    ? `A Central Inteligente identificou um valor a receber vencido.\n\nDevedor/cliente: ${p.pessoa_nome || 'Não informado'}\nTítulo: ${p.titulo}\nValor: ${dinheiro(toNumber(p.valor))}\nVencimento: ${dataCurta(p.vencimento)}\n\nAção recomendada: entrar em contato, registrar retorno e atualizar o financeiro.`
    : `A Central Inteligente identificou um pagamento vencido ou próximo do vencimento.\n\nCredor/fornecedor: ${p.pessoa_nome || 'Não informado'}\nTítulo: ${p.titulo}\nValor: ${dinheiro(toNumber(p.valor))}\nVencimento: ${dataCurta(p.vencimento)}\n\nAção recomendada: regularizar, anexar comprovante ou registrar decisão.`

  const existente = await queryOne<any>(
    `SELECT id FROM tarefas
     WHERE org_id = $1
       AND criado_por = $2
       AND origem_sistema = 'nexus_financeiro'
       AND origem_id = $3
       AND status IN ('pendente','em_progresso','devolvida','reenviada')
     LIMIT 1`,
    [input.orgId, input.userId, p.id]
  ).catch(() => null)
  if (existente?.id) return existente.id

  const tarefa = await queryOne<{ id: string }>(
    `INSERT INTO tarefas
       (org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade, checklist, obs, escopo, modo_distribuicao, pontuacao, conta_ranking, bloquear_nova_livre_ate_concluir, status, status_gestor, origem_sistema, origem_tipo, origem_id, origem_nome, origem_url, origem_payload)
     VALUES ($1,$2,$2,NULL,$3,$4,CURRENT_DATE,$5,'alta',$6,$7,'equipe','normal',10,TRUE,TRUE,'pendente','aguardando','nexus_financeiro',$8,$9,$10,NULL,$11)
     RETURNING id`,
    [
      input.orgId,
      input.userId,
      titulo,
      descricao,
      p.vencimento || null,
      JSON.stringify([
        { texto: isRecebimento ? 'Entrar em contato com o devedor/cliente' : 'Conferir dados do pagamento', feito: false, pontuacao: 5, dificuldade: 'facil' },
        { texto: isRecebimento ? 'Registrar retorno da cobrança' : 'Realizar pagamento ou registrar decisão', feito: false, pontuacao: 10, dificuldade: 'medio' },
        { texto: 'Atualizar o financeiro e anexar comprovante/evidência', feito: false, pontuacao: 10, dificuldade: 'medio' },
      ]),
      'Gerada pela Central Inteligente a partir do financeiro.',
      p.tipo,
      p.id,
      p.pessoa_nome || p.titulo,
      JSON.stringify({ pagamento_id: p.id, tipo: p.tipo, valor: toNumber(p.valor), vencimento: p.vencimento }),
    ]
  )
  return tarefa?.id || null
}

router.get('/painel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgId, userId, role } = req.user!
    const gestorLike = ['admin', 'dev', 'gestor', 'sub_gestor'].includes(role)
    const personalFilter = gestorLike ? '' : ' AND (t.criado_por = $2 OR t.responsavel_id = $2 OR t.aceita_por = $2)'
    const taskParams = gestorLike ? [orgId] : [orgId, userId]
    const paymentFilter = gestorLike ? '' : ' AND p.criado_por = $2'
    const paymentParams = gestorLike ? [orgId] : [orgId, userId]
    const agendaFilter = gestorLike ? '' : ' AND a.criado_por = $2'
    const agendaParams = gestorLike ? [orgId] : [orgId, userId]
    const checklistLen = safeTaskChecklistLengthSql()

    const tarefasRows = await query<any>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS abertas,
        COUNT(*) FILTER (WHERE status IN ('concluida','aprovada'))::int AS concluidas,
        COUNT(*) FILTER (WHERE status IN ('pendente','em_progresso','devolvida','reenviada') AND COALESCE(prazo, data) < CURRENT_DATE)::int AS atrasadas,
        COUNT(*) FILTER (WHERE prioridade = 'alta' AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS alta_abertas,
        COUNT(*) FILTER (WHERE responsavel_id IS NULL AND COALESCE(modo_distribuicao, 'normal') <> 'livre_equipe' AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS sem_responsavel,
        COUNT(*) FILTER (WHERE ${checklistLen} > 0)::int AS com_checklist,
        COUNT(*) FILTER (WHERE ${checklistLen} = 0 AND status IN ('pendente','em_progresso','devolvida','reenviada'))::int AS sem_checklist
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
    `, paymentParams)

    const financeiroCriticoRows = await query<any>(`
      SELECT p.id, p.titulo, COALESCE(pe.nome, p.pessoa_nome, '') AS pessoa_nome,
             pe.contato AS pessoa_contato, pe.email AS pessoa_email, pe.user_id AS pessoa_user_id,
             p.valor::numeric AS valor, p.vencimento::text AS vencimento, p.tipo, p.status,
             (p.vencimento::date - CURRENT_DATE)::int AS dias
      FROM pagamentos p
      LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
      WHERE p.org_id = $1${paymentFilter}
        AND p.status = 'pendente'
        AND p.vencimento IS NOT NULL
        AND p.vencimento::date <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY
        CASE WHEN p.vencimento::date < CURRENT_DATE THEN 0 ELSE 1 END,
        p.vencimento ASC,
        p.valor DESC
      LIMIT 10
    `, paymentParams)

    const agendaRows = await query<any>(`
      SELECT
        COUNT(*) FILTER (WHERE data_inicio::date = CURRENT_DATE)::int AS hoje,
        COUNT(*) FILTER (WHERE data_inicio::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')::int AS proximos_7_dias,
        COUNT(*) FILTER (WHERE data_inicio < NOW())::int AS passados
      FROM agenda a
      WHERE a.org_id = $1${agendaFilter}
    `, agendaParams)

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
        updated_at DESC NULLS LAST,
        created_at ASC
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

    const riscos: Array<{ titulo: string; detalhe: string; nivel: Nivel; destino?: string; acao_tipo?: string }> = []
    if (metricas.tarefas_atrasadas > 0) riscos.push({ titulo: 'Tarefas atrasadas', detalhe: `${metricas.tarefas_atrasadas} tarefa(s) fora do prazo precisam de ação.`, nivel: metricas.tarefas_atrasadas >= 5 ? 'critico' : 'alto', destino: '/tarefas?status=atrasadas', acao_tipo: 'cobrar_tarefa' })
    if (metricas.tarefas_alta_prioridade > 0) riscos.push({ titulo: 'Prioridades críticas abertas', detalhe: `${metricas.tarefas_alta_prioridade} tarefa(s) de alta prioridade ainda abertas.`, nivel: 'alto', destino: '/tarefas?prioridade=alta' })
    if (metricas.tarefas_sem_responsavel > 0) riscos.push({ titulo: 'Tarefas sem responsável', detalhe: `${metricas.tarefas_sem_responsavel} tarefa(s) precisam de dono definido.`, nivel: 'medio', destino: '/tarefas?responsavel=sem' })
    if (metricas.pagamentos_vencidos > 0) riscos.push({ titulo: 'Pagamentos vencidos', detalhe: `${dinheiro(metricas.pagamentos_vencidos)} em contas a pagar vencidas.`, nivel: 'critico', destino: '/financeiro?tipo=pagamento&status=pendente&vencidos=true', acao_tipo: 'lembrar_pagamento' })
    if (metricas.recebimentos_vencidos > 0) riscos.push({ titulo: 'Recebimentos atrasados', detalhe: `${dinheiro(metricas.recebimentos_vencidos)} em contas a receber vencidas.`, nivel: 'alto', destino: '/financeiro?tipo=recebimento&status=pendente&vencidos=true', acao_tipo: 'cobrar_devedor' })
    if (saldoPrevisto < 0) riscos.push({ titulo: 'Saldo previsto negativo', detalhe: `Previsão do caixa está em ${dinheiro(saldoPrevisto)}.`, nivel: 'critico', destino: '/financeiro' })
    if (riscos.length === 0) riscos.push({ titulo: 'Operação controlada', detalhe: 'Nenhum risco crítico encontrado nos dados atuais.', nivel: 'baixo' })

    const recomendacoes = [
      ...(metricas.tarefas_atrasadas > 0 ? [{ titulo: 'Resolver atrasos primeiro', detalhe: 'Comece pelas tarefas vencidas e de alta prioridade.', acao: 'Abrir tarefas críticas', destino: '/tarefas?status=atrasadas' }] : []),
      ...(metricas.tarefas_sem_responsavel > 0 ? [{ titulo: 'Distribuir responsabilidades', detalhe: 'Toda tarefa aberta precisa ter responsável claro.', acao: 'Atribuir responsáveis', destino: '/tarefas?responsavel=sem' }] : []),
      ...(metricas.pagamentos_vencidos > 0 ? [{ titulo: 'Regularizar contas vencidas', detalhe: 'Reduza risco financeiro tratando pagamentos vencidos hoje.', acao: 'Abrir financeiro', destino: '/financeiro?tipo=pagamento&status=pendente&vencidos=true' }] : []),
      ...(metricas.recebimentos_vencidos > 0 ? [{ titulo: 'Cobrar recebimentos atrasados', detalhe: 'Transforme recebimentos vencidos em tarefa de cobrança e notificação interna.', acao: 'Criar cobrança', destino: '/financeiro?tipo=recebimento&status=pendente&vencidos=true' }] : []),
      { titulo: 'Revisar agenda da semana', detalhe: `${metricas.agenda_7_dias} compromisso(s) nos próximos 7 dias.`, acao: 'Ver agenda', destino: '/agenda' },
    ]

    const financeiroCritico: Array<{ id: string; titulo: string; pessoa_nome?: string; pessoa_contato?: string; pessoa_user_id?: string | null; valor: number; vencimento?: string; tipo: 'pagamento' | 'recebimento'; status: string; dias: number; nivel: Nivel; sugestao: string; canal: 'interno' | 'whatsapp' | 'sem_contato' }> = financeiroCriticoRows.map((p: any) => {
      const dias = Number(p.dias || 0)
      const vencido = dias < 0
      const isRecebimento = p.tipo === 'recebimento'
      const canal = p.pessoa_user_id
        ? 'interno'
        : (whatsappUrlFor(p.pessoa_contato, mensagemFinanceira(p)) ? 'whatsapp' : 'sem_contato')
      return {
        id: p.id,
        titulo: p.titulo,
        pessoa_nome: p.pessoa_nome || undefined,
        pessoa_contato: p.pessoa_contato || undefined,
        pessoa_user_id: p.pessoa_user_id || undefined,
        valor: toNumber(p.valor),
        vencimento: p.vencimento,
        tipo: p.tipo,
        status: p.status,
        dias,
        nivel: vencido ? 'critico' : 'alto',
        sugestao: isRecebimento
          ? (canal === 'whatsapp' ? 'Abrir WhatsApp com mensagem pronta e criar tarefa de recuperação.' : (vencido ? 'Enviar cobrança e criar tarefa de recuperação.' : 'Preparar lembrete de recebimento.'))
          : (vencido ? 'Regularizar pagamento e anexar comprovante.' : 'Programar pagamento antes do vencimento.'),
        canal,
      }
    })

    const acoesInteligentes: Array<{ tipo: AcaoTipo; titulo: string; detalhe: string; tarefa_id?: string; pagamento_id?: string; nivel: Nivel }> = []
    for (const tarefa of topCriticas.slice(0, 3)) {
      acoesInteligentes.push({ tipo: 'cobrar_tarefa', tarefa_id: tarefa.id, titulo: `Cobrar tarefa: ${tarefa.titulo}`, detalhe: 'Envia aviso interno com som para responsável/criador/equipe.', nivel: 'alto' })
    }
    for (const fin of financeiroCritico.slice(0, 5)) {
      const tipoAcao: AcaoTipo = fin.tipo === 'recebimento' ? 'cobrar_devedor' : 'lembrar_pagamento'
      acoesInteligentes.push({
        tipo: tipoAcao,
        pagamento_id: fin.id,
        titulo: fin.tipo === 'recebimento' ? `Cobrar devedor: ${fin.pessoa_nome || fin.titulo}` : `Avisar pagamento: ${fin.titulo}`,
        detalhe: `${dinheiro(fin.valor)} · vence ${dataCurta(fin.vencimento)} · ${fin.sugestao}`,
        nivel: fin.nivel,
      })
      acoesInteligentes.push({
        tipo: 'criar_tarefa_cobranca',
        pagamento_id: fin.id,
        titulo: fin.tipo === 'recebimento' ? `Criar tarefa de cobrança: ${fin.pessoa_nome || fin.titulo}` : `Criar tarefa financeira: ${fin.titulo}`,
        detalhe: 'Cria uma tarefa da equipe com checklist operacional para resolver essa pendência.',
        nivel: fin.nivel,
      })
    }

    if (metricas.tarefas_abertas > 0 || metricas.financeiro_vence_7_dias > 0) {
      acoesInteligentes.unshift({
        tipo: 'sincronizar_agenda',
        titulo: 'Sincronizar operação com agenda',
        detalhe: 'Cria eventos na agenda para prazos de tarefas, recebimentos e pagamentos pendentes, sem duplicar eventos já sincronizados.',
        nivel: metricas.tarefas_atrasadas > 0 || metricas.pagamentos_vencidos > 0 || metricas.recebimentos_vencidos > 0 ? 'alto' : 'medio',
      })
    }

    const resumo = `Saúde operacional ${score}/100. ${metricas.tarefas_abertas} tarefa(s) abertas, ${metricas.tarefas_atrasadas} atrasada(s), saldo pago ${dinheiro(saldoPago)} e saldo previsto ${dinheiro(saldoPrevisto)}.`
    const gemini = await gerarAnaliseGemini({ score, resumo, metricas, riscos, recomendacoes, financeiroCritico, acoesInteligentes })

    res.json({
      score,
      nivel: nivel(score),
      resumo,
      metricas: { ...metricas, saldo_pago: saldoPago, saldo_previsto: saldoPrevisto },
      riscos,
      recomendacoes,
      sobrecarga: sobrecargaRows,
      tarefas_criticas: topCriticas,
      financeiro_critico: financeiroCritico,
      acoes_inteligentes: acoesInteligentes,
      notificacoes: {
        tempo_real: true,
        som: true,
        navegador: true,
        tipos: ['tarefa atrasada', 'tarefa vencendo', 'cobrança de devedor', 'pagamento vencendo', 'agenda', 'ação da IA'],
      },
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
    const gestorLike = ['admin', 'dev', 'gestor', 'sub_gestor'].includes(role)
    if (!gestorLike) { res.status(403).json({ error: 'Somente gestor, admin, dev ou subgestor pode executar ações inteligentes.' }); return }

    const { tipo, tarefa_id, pagamento_id, mensagem } = req.body || {}
    const acoesValidas: AcaoTipo[] = ['cobrar_tarefa', 'cobrar_devedor', 'lembrar_pagamento', 'criar_tarefa_cobranca', 'notificar_financeiro', 'sincronizar_agenda']
    if (!acoesValidas.includes(tipo)) { res.status(400).json({ error: 'Ação inteligente inválida.' }); return }


    if (tipo === 'sincronizar_agenda') {
      const result = await sincronizarAgendaGlobal({ orgId, userId, forceGoogle: true })
      await criarNotificacao({
        orgId,
        userId,
        tipo: 'agenda_lembrete',
        titulo: '🤖 Agenda sincronizada pela Central Inteligente',
        body: `Sincronização concluída: ${result.locaisCriados} criado(s), ${result.locaisAtualizados} atualizado(s), ${result.locaisExistentes} já existente(s). Google: ${result.googleCriados} criado(s), ${result.googleAtualizados} atualizado(s), ${result.googleFalhas} falha(s).`,
        referenciaTipo: 'agenda',
      }).catch(() => {})
      res.json({ ok: true, enviados: 1, agenda: result })
      return
    }

    if (tipo === 'cobrar_tarefa') {
      if (!tarefa_id) { res.status(400).json({ error: 'Informe a tarefa para cobrança.' }); return }
      const tarefa = await queryOne<any>(
        `SELECT t.*, COALESCE(p.nome, t.responsavel_nome, '') AS responsavel_nome
         FROM tarefas t
         LEFT JOIN profiles p ON p.id = t.responsavel_id
         WHERE t.id = $1 AND t.org_id = $2`,
        [tarefa_id, orgId]
      )
      if (!tarefa) { res.status(404).json({ error: 'Tarefa não encontrada.' }); return }

      const recipients = await destinatariosDaTarefa(tarefa, orgId, userId)
      const texto = String(mensagem || '').trim() || `A Central Inteligente identificou que a tarefa "${tarefa.titulo}" precisa de atenção. Verifique prazo, subtarefas, arquivos e execução.`
      let enviados = 0
      for (const destino of recipients) {
        await criarNotificacao({ orgId, userId: destino, tipo: 'tarefa_vencida', titulo: '🤖 Cobrança da Central Inteligente', body: texto, referenciaId: tarefa.id, referenciaTipo: 'tarefa' })
        enviados++
      }
      res.json({ ok: true, enviados })
      return
    }

    if (!pagamento_id) { res.status(400).json({ error: 'Informe o lançamento financeiro.' }); return }
    const pagamento = await queryOne<any>(
      `SELECT p.*, COALESCE(pe.nome, p.pessoa_nome, '') AS pessoa_nome_atual,
              pe.contato AS pessoa_contato, pe.email AS pessoa_email, pe.user_id AS pessoa_user_id
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.id = $1 AND p.org_id = $2`,
      [pagamento_id, orgId]
    )
    if (!pagamento) { res.status(404).json({ error: 'Lançamento financeiro não encontrado.' }); return }

    const pessoaNome = pagamento.pessoa_nome_atual || pagamento.pessoa_nome || 'Sem pessoa vinculada'
    const valor = dinheiro(toNumber(pagamento.valor))
    const vencimento = dataCurta(pagamento.vencimento)
    let titulo = '🤖 Ação financeira da Central Inteligente'
    let body = String(mensagem || '').trim()
    let tarefaId: string | null = null

    if (tipo === 'cobrar_devedor') {
      titulo = '🤖 Cobrança de recebimento atrasado'
      body = body || `Existe um recebimento pendente de ${pessoaNome}: ${valor}, vencimento ${vencimento}. Faça a cobrança, registre o retorno e atualize o financeiro.`
    } else if (tipo === 'lembrar_pagamento') {
      titulo = '🤖 Pagamento precisa de atenção'
      body = body || `Pagamento pendente: ${pagamento.titulo} — ${valor}, vencimento ${vencimento}. Regularize ou registre a decisão.`
    } else if (tipo === 'criar_tarefa_cobranca') {
      tarefaId = await criarTarefaCobranca({ orgId, userId, pagamento })
      titulo = pagamento.tipo === 'recebimento' ? '🤖 Tarefa de cobrança criada' : '🤖 Tarefa financeira criada'
      body = body || `A Central Inteligente criou uma tarefa para resolver: ${pagamento.titulo} — ${valor}, vencimento ${vencimento}.`
    } else {
      body = body || `Lançamento financeiro precisa de atenção: ${pagamento.titulo} — ${valor}, vencimento ${vencimento}.`
    }

    const recipients = new Set<string>()
    if (pagamento.pessoa_user_id) recipients.add(pagamento.pessoa_user_id)
    if (pagamento.criado_por) recipients.add(pagamento.criado_por)
    recipients.add(userId)

    const whatsappMessage = tipo === 'cobrar_devedor' ? mensagemFinanceira(pagamento) : body
    const whatsappUrl = tipo === 'cobrar_devedor' && !pagamento.pessoa_user_id
      ? whatsappUrlFor(pagamento.pessoa_contato, whatsappMessage)
      : null

    let enviados = 0
    for (const destino of recipients) {
      await criarNotificacao({ orgId, userId: destino, tipo: pagamento.tipo === 'recebimento' ? 'financeiro_cobranca' : 'financeiro_vencimento', titulo, body, referenciaId: tarefaId || pagamento.id, referenciaTipo: tarefaId ? 'tarefa' : 'pagamento' })
      enviados++
    }

    res.json({
      ok: true,
      enviados,
      tarefa_id: tarefaId || undefined,
      pagamento_id: pagamento.id,
      whatsapp_url: whatsappUrl || undefined,
      whatsapp_message: whatsappUrl ? whatsappMessage : undefined,
      canal: whatsappUrl ? 'whatsapp' : 'interno',
    })
  } catch (err) {
    console.error('[INTELIGENCIA] Erro ao executar ação:', err)
    res.status(500).json({ error: 'Erro ao executar ação inteligente.' })
  }
})

export default router
