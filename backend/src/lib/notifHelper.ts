/**
 * notifHelper.ts
 * Helpers para criar notificações no banco e disparar via SSE para usuários conectados.
 */
import { Response } from 'express'
import pool, { query } from '../db/pool'
import { sendPushToUser } from '../services/pushService'
import { runClusterSingletonJob } from './clusterJob'
import { checklistReminderIsDue, normalizeChecklistRecurrence } from './checklistRecurrence'

// ── SSE: mapa de conexões ativas ─────────────────────────────────────────────
// Chave: userId  →  lista de respostas SSE abertas (multi-tab)
const sseClients = new Map<string, Set<Response>>()
const MAX_SSE_CONNECTIONS_PER_USER = 3

export function addSseClient(userId: string, res: Response) {
  const list = sseClients.get(userId) || new Set<Response>()
  while (list.size >= MAX_SSE_CONNECTIONS_PER_USER) {
    const oldest = list.values().next().value as Response | undefined
    if (!oldest) break
    list.delete(oldest)
    try { oldest.end() } catch { /* conexão já encerrada */ }
  }
  list.add(res)
  sseClients.set(userId, list)
}

export function removeSseClient(userId: string, res: Response) {
  const list = sseClients.get(userId)
  if (!list) return
  list.delete(res)
  if (list.size === 0) sseClients.delete(userId)
}

function pushSse(userId: string, event: string, data: unknown) {
  const list = sseClients.get(userId)
  if (!list || list.size === 0) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of list) {
    if (res.writableEnded || res.destroyed) {
      list.delete(res)
      continue
    }
    try { res.write(payload) } catch { list.delete(res) }
  }
  if (list.size === 0) sseClients.delete(userId)
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
  /** Em alertas de cadência diária, reenvia o push mesmo atualizando a mesma notificação. */
  reenviarPush?: boolean
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
    // Dispara SSE imediatamente para o destinatário quando o sistema estiver aberto.
    pushSse(opts.userId, 'notificacao', notif)
    // Dispara Web Push para celular/PC mesmo com o sistema fechado, quando o usuário autorizou.
    sendPushToUser({
      orgId: opts.orgId,
      userId: opts.userId,
      title: opts.titulo,
      body: opts.body,
      tipo: opts.tipo,
      referenciaId: opts.referenciaId,
      referenciaTipo: opts.referenciaTipo,
    }).catch((err) => console.warn('[PUSH] Falha no push da notificação:', (err as Error)?.message || err))
  } catch (err) {
    console.error('[NOTIF] Erro ao criar notificação:', err)
  }
}



// ── Criar/atualizar notificação RECORRENTE (vencimentos, financeiro, agenda) ──
// Diferente de criarNotificacao (usada para eventos únicos como "tarefa
// concluída"), esta função é para alertas que os jobs reemitem periodicamente
// enquanto a pendência persistir. Em vez de inserir uma linha nova a cada
// execução -- o que fez a contagem de não lidas passar de 18 mil em produção
// -- ela atualiza a notificação ainda não lida da mesma referência/tipo,
// incrementando "ocorrencias" e atualizando o texto para o estado atual
// (ex.: "atrasada há 3 dias" -> "atrasada há 4 dias"). Nenhum histórico é
// perdido: a notificação anterior já lida permanece intacta, e uma nova só
// é criada quando a pendência atual ainda não tem alerta em aberto.
export async function criarOuAtualizarNotificacaoRecorrente(opts: CriarNotifOpts): Promise<void> {
  if (!opts.referenciaId) {
    // Sem referência não há como agrupar ocorrências; cai para o INSERT simples.
    await criarNotificacao(opts)
    return
  }
  try {
    const row = await query(
      `INSERT INTO notificacoes
         (org_id, user_id, tipo, titulo, body, referencia_id, referencia_tipo, ocorrencias, atualizada_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,NOW())
       ON CONFLICT (org_id, user_id, referencia_id, tipo) WHERE lida = FALSE AND referencia_id IS NOT NULL
       DO UPDATE SET
         titulo = EXCLUDED.titulo,
         body = EXCLUDED.body,
         ocorrencias = notificacoes.ocorrencias + 1,
         atualizada_em = NOW()
       RETURNING id, tipo, titulo, body, referencia_id, referencia_tipo, created_at, ocorrencias`,
      [opts.orgId, opts.userId, opts.tipo, opts.titulo, opts.body || null,
       opts.referenciaId, opts.referenciaTipo || null]
    )
    const notif = Array.isArray(row) ? row[0] : row
    // Só soa/empurra push quando é de fato uma ocorrência nova (ocorrencias
    // volta a 1 no INSERT); numa atualização de contador, evita repetir som
    // e Web Push a cada execução do job -- o intervalo de notificacaoRecente
    // já decide a cadência de reemissão.
    const ehNova = Number((notif as { ocorrencias?: number })?.ocorrencias) === 1
    if (ehNova || opts.reenviarPush) {
      pushSse(opts.userId, 'notificacao', notif)
      sendPushToUser({
        orgId: opts.orgId,
        userId: opts.userId,
        title: opts.titulo,
        body: opts.body,
        tipo: opts.tipo,
        referenciaId: opts.referenciaId,
        referenciaTipo: opts.referenciaTipo,
      }).catch((err) => console.warn('[PUSH] Falha no push da notificação:', (err as Error)?.message || err))
    } else {
      // Atualiza o sino em tempo real mesmo sem tocar som/push novamente.
      pushSse(opts.userId, 'notificacao_atualizada', notif)
    }
  } catch (err) {
    console.error('[NOTIF] Erro ao criar/atualizar notificação recorrente:', err)
  }
}

async function notificacaoRecente(input: { orgId: string; userId: string; referenciaId: string; tipo: string; minutos: number }) {
  // Usa atualizada_em (não created_at) porque a notificação recorrente é
  // atualizada no lugar em vez de recriada: created_at fica fixo na primeira
  // ocorrência, então checar created_at faria esta função "esquecer" o
  // alerta após o primeiro intervalo e disparar a cada execução do job.
  const row = await query<{ id: string }>(
    `SELECT id FROM notificacoes
     WHERE org_id = $1
       AND user_id = $2
       AND referencia_id = $3
       AND tipo = $4
       AND lida = FALSE
       AND atualizada_em >= NOW() - ($5::text || ' minutes')::interval
     LIMIT 1`,
    [input.orgId, input.userId, input.referenciaId, input.tipo, input.minutos]
  ).catch(() => [])
  return Array.isArray(row) && row.length > 0
}

async function destinatariosTarefa(t: { org_id: string; responsavel_id?: string | null; criado_por?: string | null; aceita_por?: string | null; modo_distribuicao?: string | null; checklist?: unknown }) {
  const recipients = new Set<string>()
  if (t.responsavel_id) recipients.add(t.responsavel_id)
  if (t.aceita_por) recipients.add(t.aceita_por)
  if (t.criado_por) recipients.add(t.criado_por)
  const checklist = Array.isArray(t.checklist)
    ? t.checklist
    : typeof t.checklist === 'string'
      ? (() => { try { return JSON.parse(t.checklist) } catch { return [] } })()
      : []
  for (const item of checklist) {
    const owner = String(item?.responsavel_id || item?.atribuido_a || item?.executor_id || '').trim()
    if (owner) recipients.add(owner)
  }

  // Tarefa livre/sem responsável: toda a equipe ativa recebe o alerta.
  if (!t.responsavel_id || t.modo_distribuicao === 'livre_equipe') {
    const equipe = await query<{ id: string }>(
      `SELECT id FROM profiles WHERE org_id = $1 AND ativo = TRUE`,
      [t.org_id]
    ).catch(() => [])
    for (const m of equipe) recipients.add(m.id)
  }
  return Array.from(recipients).filter(Boolean)
}

// ── Job de vencimento e lembrete diário ──────────────────────────────────────
async function jobVencimentos() {
  try {
    // Regras automáticas de cobrança de tarefas:
    // - tarefa que vence hoje: mensagem a cada 2 horas enquanto não for concluída;
    // - tarefa atrasada: mensagem a cada 30 minutos enquanto continuar atrasada;
    // - tarefa sem responsável/livre: envia para todos os usuários ativos da organização;
    // - tarefa com responsável: envia para responsável/executor e criador/gestor.
    const tarefas = await query<{
      id: string; org_id: string; responsavel_id: string | null; criado_por: string | null; aceita_por: string | null
      titulo: string; prazo: string; responsavel_nome: string; modo_distribuicao: string
      dias: string
    }>(
      `SELECT t.id, t.org_id, t.responsavel_id, t.criado_por, t.aceita_por,
              t.titulo, t.prazo, COALESCE(p.nome,'') AS responsavel_nome,
              COALESCE(t.modo_distribuicao, 'normal') AS modo_distribuicao,
              (t.prazo::date - CURRENT_DATE)::text AS dias
       FROM tarefas t
       LEFT JOIN profiles p ON p.id = t.responsavel_id
       WHERE t.status IN ('pendente','em_progresso','devolvida','reenviada')
         AND t.prazo IS NOT NULL
         AND t.prazo::date <= CURRENT_DATE
       ORDER BY t.prazo ASC, t.id ASC
       LIMIT 300`,
      []
    )

    let enviados = 0
    for (const t of tarefas) {
      const dias = parseInt(t.dias || '0', 10)
      const atrasada = dias < 0
      const tipo = atrasada ? 'tarefa_atrasada' : 'tarefa_prazo_hoje'
      const intervaloMinutos = atrasada ? 30 : 120
      const recipients = await destinatariosTarefa(t)

      for (const userId of recipients) {
        if (await notificacaoRecente({ orgId: t.org_id, userId, referenciaId: t.id, tipo, minutos: intervaloMinutos })) continue
        await criarOuAtualizarNotificacaoRecorrente({
          orgId: t.org_id,
          userId,
          tipo,
          titulo: atrasada ? '🚨 Tarefa atrasada — ação imediata' : '⚠️ Tarefa vence hoje',
          body: atrasada
            ? `A tarefa "${t.titulo}" está atrasada há ${Math.abs(dias)} dia(s). Regularize agora, execute sua parte ou cobre a equipe responsável.`
            : `A tarefa "${t.titulo}" vence hoje e ainda não foi concluída. Este lembrete será reenviado a cada 2 horas até a execução.`,
          referenciaId: t.id,
          referenciaTipo: 'tarefa',
        })
        enviados++
      }
    }
    if (enviados > 0) {
      console.log(`[NOTIF] ${enviados} lembrete(s) automático(s) de tarefa enviados.`)
    }
  } catch (err) {
    console.error('[NOTIF] Erro no job de vencimentos:', err)
  }
}

async function jobLembreteDiario() {
  try {
    // Listas marcadas como diárias conservam o mesmo ID e são lembradas até
    // a execução ser aprovada. Concluída aguardando aprovação continua ativa;
    // concluída + aprovada e cancelada encerram o lembrete.
    const tarefasDiarias = await query<{
      id: string; org_id: string; titulo: string; responsavel_id: string | null
      criado_por: string | null; aceita_por: string | null; modo_distribuicao: string | null; checklist: unknown
    }>(
      `SELECT id, org_id, titulo, responsavel_id, criado_por, aceita_por, modo_distribuicao, checklist
         FROM tarefas
        WHERE lembrete_diario_ate_aprovacao = TRUE
          AND status <> 'cancelada'
          AND NOT (status = 'concluida' AND status_gestor = 'aprovada')
        ORDER BY created_at ASC
        LIMIT 1000`,
      [],
    )
    let lembretesDeLista = 0
    for (const tarefa of tarefasDiarias) {
      const recipients = await destinatariosTarefa(tarefa)
      for (const userId of recipients) {
        if (await notificacaoRecente({ orgId: tarefa.org_id, userId, referenciaId: tarefa.id, tipo: 'lembrete_diario_tarefa', minutos: 20 * 60 })) continue
        await criarOuAtualizarNotificacaoRecorrente({
          orgId: tarefa.org_id,
          userId,
          tipo: 'lembrete_diario_tarefa',
          titulo: '🔁 Lista diária ainda em execução',
          body: `"${tarefa.titulo}" permanece ativa até ser finalizada e aprovada. É a mesma lista: nenhum registro novo foi criado.`,
          referenciaId: tarefa.id,
          referenciaTipo: 'tarefa',
          reenviarPush: true,
        })
        lembretesDeLista++
      }
    }

    // Recorrência canônica por item de checklist. Uma lista pode misturar
    // ações únicas, diárias, semanais e mensais; nenhuma ocorrência nova é
    // inserida em tarefas. O job apenas lembra o mesmo item e agrega os itens
    // do mesmo usuário/lista em uma única notificação diária.
    const tarefasComChecklist = await query<{
      id: string; org_id: string; titulo: string; responsavel_id: string | null
      criado_por: string | null; aceita_por: string | null; modo_distribuicao: string | null
      escopo: string | null; checklist: unknown
    }>(
      `SELECT id, org_id, titulo, responsavel_id, criado_por, aceita_por,
              modo_distribuicao, escopo, checklist
         FROM tarefas
        WHERE status NOT IN ('cancelada', 'aprovada')
          AND checklist IS NOT NULL
          AND jsonb_typeof(checklist::jsonb) = 'array'
        ORDER BY created_at ASC
        LIMIT 1000`,
      [],
    )
    let lembretesDeItem = 0
    for (const tarefa of tarefasComChecklist) {
      const checklist = Array.isArray(tarefa.checklist)
        ? tarefa.checklist
        : typeof tarefa.checklist === 'string'
          ? (() => { try { const parsed = JSON.parse(tarefa.checklist); return Array.isArray(parsed) ? parsed : [] } catch { return [] } })()
          : []
      const dueItems = checklist.filter((item: any) => {
        if (normalizeChecklistRecurrence(item?.recorrencia) === 'unica') return false
        if (item?.aprovacao_status === 'aprovada') return false
        if (item?.feito && tarefa.escopo !== 'equipe') return false
        return checklistReminderIsDue(item)
      })
      if (!dueItems.length) continue

      const fallbackRecipients = await destinatariosTarefa(tarefa)
      const byRecipient = new Map<string, any[]>()
      for (const item of dueItems) {
        const itemOwner = String(item?.responsavel_id || item?.assumido_por || item?.executor_id || item?.aceita_por || '').trim()
        const recipients = new Set<string>(itemOwner ? [itemOwner] : fallbackRecipients)
        // O criador/gestor precisa receber o lembrete enquanto um item feito
        // aguarda aprovação; assim a cadência não fica presa no executor.
        if (tarefa.criado_por) recipients.add(tarefa.criado_por)
        for (const userId of recipients) {
          if (!userId) continue
          byRecipient.set(userId, [...(byRecipient.get(userId) || []), item])
        }
      }

      for (const [userId, items] of byRecipient) {
        const tipo = 'lembrete_recorrente_checklist'
        if (await notificacaoRecente({ orgId: tarefa.org_id, userId, referenciaId: tarefa.id, tipo, minutos: 20 * 60 })) continue
        const names = items.slice(0, 3).map(item => `“${String(item?.texto || 'Ação').slice(0, 90)}”`).join(', ')
        const remaining = items.length > 3 ? ` e mais ${items.length - 3}` : ''
        await criarOuAtualizarNotificacaoRecorrente({
          orgId: tarefa.org_id,
          userId,
          tipo,
          titulo: `🔁 ${items.length} ação${items.length > 1 ? 'ões recorrentes' : ' recorrente'} para hoje`,
          body: `${tarefa.titulo}: ${names}${remaining}. É o mesmo checklist e o mesmo histórico; nenhuma tarefa foi duplicada.`,
          referenciaId: tarefa.id,
          referenciaTipo: 'tarefa',
          reenviarPush: true,
        })
        lembretesDeItem++
      }
    }

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
    if (lembretesDeLista > 0) {
      console.log(`[NOTIF] ${lembretesDeLista} lembrete(s) de lista diária enviados sem duplicar tarefas.`)
    }
    if (lembretesDeItem > 0) {
      console.log(`[NOTIF] ${lembretesDeItem} lembrete(s) recorrente(s) de checklist enviados sem duplicar itens.`)
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
         AND l.data_lembrete <= $1
       ORDER BY l.data_lembrete ASC
       LIMIT 300`,
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
    // Vencimentos financeiros seguem a mesma lógica de urgência:
    // - vencendo hoje: lembrete a cada 2 horas;
    // - vencido: lembrete a cada 30 minutos;
    // - vencendo amanhã: lembrete preventivo diário.
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
       ORDER BY p.vencimento ASC, p.id ASC
       LIMIT 300`,
      []
    )
    let enviados = 0
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
      const intervaloMinutos = vencido ? 30 : venceHoje ? 120 : 24 * 60
      if (await notificacaoRecente({ orgId: p.org_id, userId: p.criado_por, referenciaId: p.id, tipo, minutos: intervaloMinutos })) continue
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
      await criarOuAtualizarNotificacaoRecorrente({
        orgId: p.org_id,
        userId: p.criado_por,
        tipo,
        titulo,
        body,
        referenciaId: p.id,
        referenciaTipo: 'pagamento',
      })
      enviados++
    }
    if (enviados > 0) {
      console.log(`[NOTIF] ${enviados} alerta(s) financeiro(s) automático(s) enviado(s).`)
    }
  } catch (err) {
    console.error('[NOTIF] Erro no job de vencimentos financeiros:', err)
  }
}

// ── Job: lembretes de agenda ──────────────────────────────────────────────────
async function jobAgendaLembrete() {
  try {
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
         )
       ORDER BY a.data_inicio ASC
       LIMIT 300`,
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

// ── Job: arquivar notificações antigas (preserva os dados) ───────────────────
// Substitui a limpeza manual por exclusão: por padrão nenhuma notificação é
// apagada. Notificações lidas com mais de 30 dias são marcadas como
// arquivadas (arquivada = TRUE) e somem da lista/contagem padrão, mas
// continuam no banco para auditoria/histórico.
//
// Processa em lotes pequenos. Na primeira execução em produção, o backlog
// histórico (18k+ notificações represadas) foi arquivado num único UPDATE
// gigante -- isso segurou lock/conexão, competiu com o tráfego normal
// (timeouts em /tarefas, /agenda, /notificacoes ao mesmo tempo) e contribuiu
// para o processo estourar o limite de heap. Em lotes, cada passada é rápida
// e barata, e o job cede espaço entre lotes em vez de monopolizar o pool.
const ARQUIVAMENTO_LOTE = 500
// No máximo 10 mil por execução. O histórico continua preservado e o backlog
// é retomado no ciclo seguinte, sem criar uma rajada de 50 mil updates capaz
// de competir com login/tarefas logo após um deploy.
const ARQUIVAMENTO_MAX_LOTES_POR_EXECUCAO = 20

async function jobArquivarNotificacoesAntigas() {
  let totalArquivadas = 0
  try {
    for (let lote = 0; lote < ARQUIVAMENTO_MAX_LOTES_POR_EXECUCAO; lote++) {
      // Tráfego interativo tem prioridade. Se já existe requisição esperando
      // conexão, encerra esta passada sem perder trabalho: o próximo ciclo
      // retoma o backlog pelo mesmo índice/critério idempotente.
      if (lote > 0 && pool.waitingCount > 0) {
        console.warn(
          `[NOTIF] Arquivamento pausado após ${totalArquivadas} registro(s): ` +
          `${pool.waitingCount} requisição(ões) aguardando conexão com o banco.`,
        )
        break
      }
      const resultado = await query<{ id: string }>(
        `WITH candidatos AS (
           SELECT id FROM notificacoes
            WHERE arquivada = FALSE
              AND lida = TRUE
              AND created_at < NOW() - INTERVAL '30 days'
            ORDER BY created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         )
         UPDATE notificacoes n
            SET arquivada = TRUE, arquivada_em = NOW()
           FROM candidatos c
          WHERE n.id = c.id
         RETURNING n.id`,
        [ARQUIVAMENTO_LOTE]
      )
      const arquivadasNesteLote = Array.isArray(resultado) ? resultado.length : 0
      totalArquivadas += arquivadasNesteLote
      if (arquivadasNesteLote < ARQUIVAMENTO_LOTE) break // backlog acabou

      // Cede espaço entre lotes -- não monopoliza o pool de conexões
      // enquanto o tráfego normal de usuários também precisa dele.
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (totalArquivadas > 0) {
      console.log(`[NOTIF] ${totalArquivadas} notificação(ões) arquivada(s) automaticamente em lotes de ${ARQUIVAMENTO_LOTE} (dados preservados).`)
    }
  } catch (err) {
    console.error(`[NOTIF] Erro no job de arquivamento (${totalArquivadas} arquivadas antes da falha):`, err)
  }
}

// ── Inicializar jobs ──────────────────────────────────────────────────────────
export function iniciarJobsNotificacao() {
  const run = (name: string, job: () => Promise<void>) =>
    runClusterSingletonJob(`notificacoes:${name}`, job)

  // Verifica tarefas vencendo/atrasadas a cada 30 minutos
  setInterval(() => { void run('vencimentos', jobVencimentos) }, 30 * 60 * 1000)

  // Lembrete diário: verifica a cada 5 minutos se já passou das 08:00
  let lembreteEnviadoHoje = ''
  setInterval(async () => {
    const agora = new Date()
    const hoje = agora.toISOString().slice(0, 10)
    const hora = agora.getHours()
    if (hora >= 8 && lembreteEnviadoHoje !== hoje) {
      lembreteEnviadoHoje = hoje
      await run('lembrete-diario', jobLembreteDiario)
    }
  }, 5 * 60 * 1000)

  // Lembretes personalizados: verifica a cada 2 minutos
  setInterval(() => { void run('lembretes', jobLembretes) }, 2 * 60 * 1000)

  // Vencimentos financeiros: verifica a cada 30 minutos
  setInterval(() => { void run('financeiro', jobFinanceiroVencimento) }, 30 * 60 * 1000)

  // Lembretes de agenda: verifica a cada 5 minutos
  setInterval(() => { void run('agenda', jobAgendaLembrete) }, 5 * 60 * 1000)

  // Arquivamento automático: uma vez por dia basta (não é uma rota urgente).
  setInterval(() => { void run('arquivamento', jobArquivarNotificacoesAntigas) }, 24 * 60 * 60 * 1000)

  // Dá prioridade ao tráfego de login/tarefas após deploy.
  setTimeout(() => { void run('vencimentos', jobVencimentos) }, 180_000)
  setTimeout(() => { void run('lembretes', jobLembretes) }, 210_000)
  setTimeout(() => { void run('financeiro', jobFinanceiroVencimento) }, 240_000)
  setTimeout(() => { void run('agenda', jobAgendaLembrete) }, 270_000)
  setTimeout(() => { void run('arquivamento', jobArquivarNotificacoesAntigas) }, 300_000)
  console.log('[NOTIF] Jobs de notificação iniciados (tarefas, lembretes, financeiro, agenda, arquivamento).')
}
