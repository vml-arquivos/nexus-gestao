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
    // Busca tarefas que venceram hoje e ainda não foram notificadas (pendente)
    const tarefas = await query<{
      id: string; org_id: string; responsavel_id: string; criado_por: string
      titulo: string; prazo: string; responsavel_nome: string
    }>(
      `SELECT t.id, t.org_id, t.responsavel_id, t.criado_por,
              t.titulo, t.prazo, COALESCE(p.nome,'') AS responsavel_nome
       FROM tarefas t
       LEFT JOIN profiles p ON p.id = t.responsavel_id
       WHERE t.status = 'pendente'
         AND t.prazo IS NOT NULL
         AND t.prazo::date = CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM notificacoes n
           WHERE n.referencia_id = t.id
             AND n.tipo = 'tarefa_vencida'
             AND n.created_at::date = CURRENT_DATE
         )`,
      []
    )
    for (const t of tarefas) {
      // Notifica responsável
      if (t.responsavel_id) {
        await criarNotificacao({
          orgId: t.org_id, userId: t.responsavel_id,
          tipo: 'tarefa_vencida',
          titulo: '⚠️ Tarefa vence hoje!',
          body: `A tarefa "${t.titulo}" vence hoje e ainda está pendente.`,
          referenciaId: t.id, referenciaTipo: 'tarefa',
        })
      }
      // Notifica criador (se diferente do responsável)
      if (t.criado_por && t.criado_por !== t.responsavel_id) {
        await criarNotificacao({
          orgId: t.org_id, userId: t.criado_por,
          tipo: 'tarefa_vencida',
          titulo: '⚠️ Tarefa vence hoje!',
          body: `A tarefa "${t.titulo}" (${t.responsavel_nome || 'sem responsável'}) vence hoje e ainda está pendente.`,
          referenciaId: t.id, referenciaTipo: 'tarefa',
        })
      }
    }
    if (tarefas.length > 0) {
      console.log(`[NOTIF] ${tarefas.length} tarefa(s) vencendo hoje notificadas.`)
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
    // Pagamentos que vencem amanhã e ainda não foram notificados hoje
    const pagamentos = await query<{
      id: string; org_id: string; criado_por: string; titulo: string
      pessoa_nome: string; valor: string; vencimento: string
    }>(
      `SELECT p.id, p.org_id, p.criado_por, p.titulo,
              COALESCE(p.pessoa_nome,'') AS pessoa_nome,
              p.valor::text, p.vencimento::text
       FROM pagamentos p
       WHERE p.status = 'pendente'
         AND p.vencimento IS NOT NULL
         AND p.vencimento::date = CURRENT_DATE + INTERVAL '1 day'
         AND NOT EXISTS (
           SELECT 1 FROM notificacoes n
           WHERE n.referencia_id = p.id
             AND n.tipo = 'financeiro_vencimento'
             AND n.created_at::date = CURRENT_DATE
         )`,
      []
    )
    for (const p of pagamentos) {
      const valor = parseFloat(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      await criarNotificacao({
        orgId: p.org_id,
        userId: p.criado_por,
        tipo: 'financeiro_vencimento',
        titulo: `💰 Vencimento amanhã: ${p.titulo}`,
        body: `${p.pessoa_nome ? p.pessoa_nome + ' — ' : ''}${valor} vence amanhã.`,
        referenciaId: p.id,
        referenciaTipo: 'pagamento',
      })
    }
    if (pagamentos.length > 0) {
      console.log(`[NOTIF] ${pagamentos.length} vencimento(s) financeiro(s) notificado(s).`)
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
