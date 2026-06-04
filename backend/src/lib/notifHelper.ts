/**
 * notifHelper.ts
 * Helpers para criar notificações no banco e disparar via SSE para usuários conectados.
 */
import { Response } from 'express'
import { query } from '../db/pool'

// ── SSE: mapa de conexões ativas ─────────────────────────────────────────────
// Chave: userId  →  lista de respostas SSE abertas (multi-tab)
const sseClients = new Map<string, Response[]>()

export function addSseClient(userId: string, res: Response) {
  const list = sseClients.get(userId) || []
  list.push(res)
  sseClients.set(userId, list)
}

export function removeSseClient(userId: string, res: Response) {
  const list = sseClients.get(userId) || []
  const filtered = list.filter(r => r !== res)
  if (filtered.length === 0) sseClients.delete(userId)
  else sseClients.set(userId, filtered)
}

function pushSse(userId: string, event: string, data: unknown) {
  const list = sseClients.get(userId)
  if (!list || list.length === 0) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of list) {
    try { res.write(payload) } catch { /* cliente desconectado */ }
  }
}

// ── Criar notificação no banco e disparar SSE ─────────────────────────────────
export interface CriarNotifOpts {
  orgId: string
  userId: string          // destinatário
  tipo: string            // 'nova_tarefa' | 'tarefa_concluida' | 'tarefa_nao_concluida' | 'tarefa_vencida' | 'lembrete_diario'
  titulo: string
  body?: string
  referenciaId?: string   // id da tarefa
  referenciaTipo?: string // 'tarefa'
}

export async function criarNotificacao(opts: CriarNotifOpts): Promise<void> {
  try {
    const row = await query(
      `INSERT INTO notificacoes
         (org_id, user_id, tipo, titulo, body, referencia_id, referencia_tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, tipo, titulo, body, referencia_id, referencia_tipo, created_at`,
      [opts.orgId, opts.userId, opts.tipo, opts.titulo, opts.body || null,
       opts.referenciaId || null, opts.referenciaTipo || null]
    )
    const notif = Array.isArray(row) ? row[0] : row
    // Dispara SSE imediatamente para o destinatário
    pushSse(opts.userId, 'notificacao', notif)
  } catch (err) {
    console.error('[NOTIF] Erro ao criar notificação:', err)
  }
}

// ── Job de vencimento e lembrete diário ──────────────────────────────────────
async function jobVencimentos() {
  try {
    // Notifica automaticamente tarefas vencidas e vencendo hoje.
    // Regras:
    // - se tem responsável, notifica o responsável e o criador;
    // - se é tarefa livre da equipe sem responsável, notifica toda a equipe da organização;
    // - deduplicação diária para não gerar spam.
    const tarefas = await query<{
      id: string; org_id: string; responsavel_id: string | null; criado_por: string
      titulo: string; prazo: string; responsavel_nome: string; modo_distribuicao: string
      dias: string
    }>(
      `SELECT t.id, t.org_id, t.responsavel_id, t.criado_por,
              t.titulo, t.prazo, COALESCE(p.nome,'') AS responsavel_nome,
              COALESCE(t.modo_distribuicao, 'normal') AS modo_distribuicao,
              (t.prazo::date - CURRENT_DATE)::text AS dias
       FROM tarefas t
       LEFT JOIN profiles p ON p.id = t.responsavel_id
       WHERE t.status IN ('pendente','em_progresso','devolvida','reenviada')
         AND t.prazo IS NOT NULL
         AND t.prazo::date <= CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM notificacoes n
           WHERE n.referencia_id = t.id
             AND n.tipo = 'tarefa_vencida'
             AND n.created_at::date = CURRENT_DATE
         )`,
      []
    )

    for (const t of tarefas) {
      const dias = parseInt(t.dias || '0', 10)
      const atrasada = dias < 0
      const recipients = new Set<string>()
      if (t.responsavel_id) recipients.add(t.responsavel_id)
      if (t.criado_por) recipients.add(t.criado_por)

      if (!t.responsavel_id || t.modo_distribuicao === 'livre_equipe') {
        const equipe = await query<{ id: string }>(
          `SELECT id FROM profiles WHERE org_id = $1 AND ativo = TRUE`,
          [t.org_id]
        ).catch(() => [])
        for (const m of equipe) recipients.add(m.id)
      }

      for (const userId of recipients) {
        await criarNotificacao({
          orgId: t.org_id,
          userId,
          tipo: 'tarefa_vencida',
          titulo: atrasada ? '🚨 Tarefa atrasada precisa de ação' : '⚠️ Tarefa vence hoje',
          body: atrasada
            ? `A tarefa "${t.titulo}" está atrasada há ${Math.abs(dias)} dia(s). Execute, assuma uma subtarefa ou regularize o andamento.`
            : `A tarefa "${t.titulo}" vence hoje e ainda não foi concluída.`,
          referenciaId: t.id,
          referenciaTipo: 'tarefa',
        })
      }
    }
    if (tarefas.length > 0) {
      console.log(`[NOTIF] ${tarefas.length} tarefa(s) vencidas/vencendo notificadas automaticamente.`)
    }
  } catch (err) {
    console.error('[NOTIF] Erro no job de vencimentos:', err)
  }
}

async function jobLembreteDiario() {
  try {
    // Para cada usuário com tarefas pendentes para hoje, envia lembrete
    const resumos = await query<{
      responsavel_id: string; org_id: string; count: string
    }>(
      `SELECT t.responsavel_id, t.org_id, COUNT(*) AS count
       FROM tarefas t
       WHERE t.status = 'pendente'
         AND t.prazo IS NOT NULL
         AND t.prazo::date = CURRENT_DATE
         AND t.responsavel_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM notificacoes n
           WHERE n.user_id = t.responsavel_id
             AND n.tipo = 'lembrete_diario'
             AND n.created_at::date = CURRENT_DATE
         )
       GROUP BY t.responsavel_id, t.org_id`,
      []
    )
    for (const r of resumos) {
      const n = parseInt(r.count)
      await criarNotificacao({
        orgId: r.org_id, userId: r.responsavel_id,
        tipo: 'lembrete_diario',
        titulo: `📋 Você tem ${n} tarefa${n > 1 ? 's' : ''} para hoje`,
        body: `Acesse a lista de tarefas para ver o que precisa ser feito hoje.`,
      })
    }
    if (resumos.length > 0) {
      console.log(`[NOTIF] Lembretes diários enviados para ${resumos.length} usuário(s).`)
    }
  } catch (err) {
    console.error('[NOTIF] Erro no job de lembrete diário:', err)
  }
}

// ── Job: processar tabela lembretes ─────────────────────────────────────────
async function jobLembretes() {
  try {
    const agora = new Date().toISOString()
    const pendentes = await query<{
      id: string; org_id: string; destinatario_id: string; criado_por: string
      titulo: string; body: string; referencia_id: string; referencia_tipo: string
    }>(
      `SELECT l.id, l.org_id,
              COALESCE(l.destinatario_id, l.criado_por) AS destinatario_id,
              l.criado_por, l.titulo, l.body,
              l.referencia_id, l.referencia_tipo
       FROM lembretes l
       WHERE l.ativo = TRUE
         AND l.enviado = FALSE
         AND l.data_lembrete <= $1`,
      [agora]
    )
    for (const l of pendentes) {
      await criarNotificacao({
        orgId: l.org_id,
        userId: l.destinatario_id,
        tipo: 'info',
        titulo: l.titulo,
        body: l.body || undefined,
        referenciaId: l.referencia_id || undefined,
        referenciaTipo: l.referencia_tipo || undefined,
      })
      // Marca como enviado (ou reagenda se recorrente)
      await query(
        `UPDATE lembretes SET enviado = TRUE WHERE id = $1`,
        [l.id]
      )
    }
    if (pendentes.length > 0) {
      console.log(`[NOTIF] ${pendentes.length} lembrete(s) personalizado(s) disparado(s).`)
    }
  } catch (err) {
    console.error('[NOTIF] Erro no job de lembretes:', err)
  }
}

// ── Job: vencimentos financeiros ─────────────────────────────────────────────
async function jobFinanceiroVencimento() {
  try {
    // Financeiro inteligente:
    // - avisa 1 dia antes;
    // - avisa no dia;
    // - avisa quando já venceu;
    // - recebimento vencido vira alerta de cobrança;
    // - pagamento vencido vira alerta de regularização;
    // - deduplicação diária por lançamento, usuário e tipo para evitar spam.
    const pagamentos = await query<{
      id: string; org_id: string; criado_por: string; titulo: string
      pessoa_nome: string; valor: string; vencimento: string; tipo: string; dias_para_vencer: string
    }>(
      `SELECT p.id, p.org_id, p.criado_por, p.titulo,
              COALESCE(pe.nome, p.pessoa_nome,'') AS pessoa_nome,
              p.valor::text, p.vencimento::text, p.tipo,
              (p.vencimento::date - CURRENT_DATE)::text AS dias_para_vencer
       FROM pagamentos p
       LEFT JOIN pessoas pe ON pe.id = p.pessoa_id AND pe.org_id = p.org_id
       WHERE p.status = 'pendente'
         AND p.vencimento IS NOT NULL
         AND p.vencimento::date <= CURRENT_DATE + INTERVAL '1 day'
         AND NOT EXISTS (
           SELECT 1 FROM notificacoes n
           WHERE n.referencia_id = p.id
             AND n.user_id = p.criado_por
             AND n.tipo IN ('financeiro_vencimento','financeiro_vencido','financeiro_cobranca')
             AND n.created_at::date = CURRENT_DATE
         )`,
      []
    )
    for (const p of pagamentos) {
      const valor = parseFloat(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const dias = parseInt(p.dias_para_vencer || '0', 10)
      const isRecebimento = p.tipo === 'recebimento'
      const pessoa = p.pessoa_nome ? `${p.pessoa_nome} — ` : ''
      const vencido = dias < 0
      const venceHoje = dias === 0
      const tipo = isRecebimento
        ? (vencido ? 'financeiro_cobranca' : 'financeiro_vencimento')
        : (vencido ? 'financeiro_vencido' : 'financeiro_vencimento')
      const titulo = isRecebimento
        ? (vencido ? `🚨 Cobrar devedor: ${p.titulo}` : `💰 Recebimento ${venceHoje ? 'vence hoje' : 'vence amanhã'}: ${p.titulo}`)
        : (vencido ? `🚨 Pagamento vencido: ${p.titulo}` : `💰 Pagamento ${venceHoje ? 'vence hoje' : 'vence amanhã'}: ${p.titulo}`)
      const body = isRecebimento
        ? (vencido
            ? `${pessoa}${valor} está vencido há ${Math.abs(dias)} dia(s). Envie cobrança, registre retorno e atualize o financeiro.`
            : `${pessoa}${valor} para receber ${venceHoje ? 'vence hoje' : 'vence amanhã'}. Prepare a cobrança preventiva.`)
        : (vencido
            ? `${pessoa}${valor} está vencido há ${Math.abs(dias)} dia(s). Regularize ou registre a decisão.`
            : `${pessoa}${valor} para pagar ${venceHoje ? 'vence hoje' : 'vence amanhã'}.`)
      await criarNotificacao({
        orgId: p.org_id,
        userId: p.criado_por,
        tipo,
        titulo,
        body,
        referenciaId: p.id,
        referenciaTipo: 'pagamento',
      })
    }
    if (pagamentos.length > 0) {
      console.log(`[NOTIF] ${pagamentos.length} alerta(s) financeiro(s) inteligente(s) enviado(s).`)
    }
  } catch (err) {
    console.error('[NOTIF] Erro no job de vencimentos financeiros:', err)
  }
}

// ── Job: lembretes de agenda ──────────────────────────────────────────────────
async function jobAgendaLembrete() {
  try {
    const agora = new Date()
    const em15min = new Date(agora.getTime() + 16 * 60 * 1000).toISOString()
    const eventos = await query<{
      id: string; org_id: string; criado_por: string; titulo: string
      data_inicio: string; lembrete_minutos: number
    }>(
      `SELECT a.id, a.org_id, a.criado_por, a.titulo, a.data_inicio, a.lembrete_minutos
       FROM agenda a
       WHERE a.lembrete_enviado = FALSE
         AND a.data_inicio > NOW()
         AND a.data_inicio <= NOW() + (a.lembrete_minutos || ' minutes')::interval
         AND NOT EXISTS (
           SELECT 1 FROM notificacoes n
           WHERE n.referencia_id = a.id
             AND n.tipo = 'agenda_lembrete'
         )`,
      []
    )
    for (const e of eventos) {
      await criarNotificacao({
        orgId: e.org_id,
        userId: e.criado_por,
        tipo: 'agenda_lembrete',
        titulo: `📅 Em breve: ${e.titulo}`,
        body: `Compromisso em ${e.lembrete_minutos} minuto(s).`,
        referenciaId: e.id,
        referenciaTipo: 'agenda',
      })
      await query(`UPDATE agenda SET lembrete_enviado = TRUE WHERE id = $1`, [e.id])
    }
    if (eventos.length > 0) {
      console.log(`[NOTIF] ${eventos.length} lembrete(s) de agenda disparado(s).`)
    }
  } catch (err) {
    console.error('[NOTIF] Erro no job de agenda:', err)
  }
}

// ── Inicializar jobs ──────────────────────────────────────────────────────────
export function iniciarJobsNotificacao() {
  // Verifica vencimentos a cada hora
  setInterval(jobVencimentos, 60 * 60 * 1000)

  // Lembrete diário: verifica a cada 5 minutos se já passou das 08:00
  let lembreteEnviadoHoje = ''
  setInterval(async () => {
    const agora = new Date()
    const hoje = agora.toISOString().slice(0, 10)
    const hora = agora.getHours()
    if (hora >= 8 && lembreteEnviadoHoje !== hoje) {
      lembreteEnviadoHoje = hoje
      await jobLembreteDiario()
    }
  }, 5 * 60 * 1000)

  // Lembretes personalizados: verifica a cada 2 minutos
  setInterval(jobLembretes, 2 * 60 * 1000)

  // Vencimentos financeiros: verifica a cada hora
  setInterval(jobFinanceiroVencimento, 60 * 60 * 1000)

  // Lembretes de agenda: verifica a cada 5 minutos
  setInterval(jobAgendaLembrete, 5 * 60 * 1000)

  // Executa imediatamente ao iniciar (para pegar vencimentos do dia)
  setTimeout(jobVencimentos, 10_000)
  setTimeout(jobLembretes, 15_000)
  setTimeout(jobFinanceiroVencimento, 20_000)
  setTimeout(jobAgendaLembrete, 25_000)
  console.log('[NOTIF] Jobs de notificação iniciados (tarefas, lembretes, financeiro, agenda).')
}
