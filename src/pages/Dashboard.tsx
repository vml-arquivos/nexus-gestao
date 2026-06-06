import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  ArrowRight,
  Loader,
  ClipboardList,
  WalletCards,
  Filter,
  CalendarDays,
  ListChecks,
  Trophy,
} from 'lucide-react'
import { tarefasApi, agendaApi, pagamentosApi, equipeApi, type Tarefa, type Evento, type Pagamento, type MembroEquipe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { isGestorLike, roleLabel } from '../lib/roles'
import { useVisualTexts } from '../hooks/useVisualTexts'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseDateSafe(d?: string | null) {
  if (!d) return null
  const raw = String(d).trim()
  const onlyDate = raw.slice(0, 10)
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(onlyDate) ? new Date(`${onlyDate}T12:00:00`) : new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dateKey(d?: string | null) {
  const parsed = parseDateSafe(d)
  return parsed ? parsed.toISOString().slice(0, 10) : ''
}

function fmtDate(d?: string | null) {
  const parsed = parseDateSafe(d)
  return parsed ? parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Sem data'
}

function fmtTime(d?: string | null) {
  const parsed = parseDateSafe(d)
  return parsed ? parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'
}

function addDays(base: Date, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(12, 0, 0, 0)
  return d
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

type PainelTipo = 'tarefas' | 'agenda' | 'financeiro'
type RankingPayload = { periodo: string; ranking: any[]; resumo: any }

type PainelItem = {
  id: string
  tipo: PainelTipo
  titulo: string
  data: Date | null
  status?: string
  prioridade?: string
  valor?: number
  financeiroTipo?: Pagamento['tipo']
  subtitulo?: string
  responsavelNome?: string
  checklistTotal?: number
  checklistFeitos?: number
  to: string
}

const statusFinalTarefa = ['concluida', 'aprovada', 'cancelada']

function taskDate(t: Tarefa) {
  return parseDateSafe(t.prazo || t.data || t.created_at)
}

function checklistActionDate(item: { data?: string }) {
  return parseDateSafe(item.data)
}

function paymentDate(p: Pagamento) {
  return parseDateSafe(p.vencimento || p.pago_em || p.created_at)
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isBetweenInclusive(d: Date, start: Date, end: Date) {
  const x = new Date(d); x.setHours(12, 0, 0, 0)
  const s = new Date(start); s.setHours(0, 0, 0, 0)
  const e = new Date(end); e.setHours(23, 59, 59, 999)
  return x >= s && x <= e
}

function itemColor(item: PainelItem) {
  return item.tipo === 'financeiro'
    ? item.financeiroTipo === 'recebimento' ? '#10B981' : '#EF4444'
    : item.tipo === 'agenda' ? 'var(--primary-light)' : item.prioridade === 'alta' ? '#EF4444' : 'var(--text2)'
}

function tipoLabel(item: PainelItem) {
  if (item.tipo === 'tarefas') return 'Tarefa'
  if (item.tipo === 'agenda') return 'Agenda'
  return item.financeiroTipo === 'recebimento' ? 'Receber' : 'Pagar'
}

function statusLabel(item: PainelItem) {
  const status = String(item.status || '').toLowerCase()
  if (item.tipo === 'tarefas') {
    if (status === 'aprovada') return 'Aprovada'
    if (status === 'concluida') return 'Concluída'
    if (status === 'em_progresso') return 'Em progresso'
    if (status === 'nao_concluida') return 'Não concluída'
    if (status === 'devolvida') return 'Devolvida'
    if (status === 'reenviada') return 'Reenviada'
    if (status === 'cancelada') return 'Cancelada'
    return 'Em aberto'
  }
  if (item.tipo === 'financeiro') {
    if (status === 'pago') return item.financeiroTipo === 'recebimento' ? 'Recebido' : 'Pago'
    if (status === 'cancelado') return 'Cancelado'
    return 'Pendente'
  }
  return item.status ? String(item.status).replace(/_/g, ' ') : 'Compromisso'
}

function statusClass(item: PainelItem) {
  const status = String(item.status || '').toLowerCase()
  if (item.tipo === 'tarefas') {
    if (['aprovada', 'concluida'].includes(status)) return 'done'
    if (status === 'em_progresso' || status === 'reenviada') return 'progress'
    if (status === 'devolvida' || status === 'nao_concluida') return 'warn'
    if (status === 'cancelada') return 'muted'
    return 'open'
  }
  if (item.tipo === 'financeiro') return status === 'pago' ? 'done' : status === 'cancelado' ? 'muted' : 'warn'
  return 'event'
}

function MiniItem({ item }: { item: PainelItem }) {
  const color = itemColor(item)

  return (
    <Link to={item.to} className="dash-work-item" style={{ textDecoration: 'none' }}>
      <div className="dash-work-dot" style={{ background: color }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="dash-work-title">{item.titulo}</div>
        <div className="dash-work-sub">
          {item.data ? fmtDate(item.data.toISOString()) : 'Sem data'}
          {item.tipo === 'agenda' && item.data ? ` · ${fmtTime(item.data.toISOString())}` : ''}
          {item.valor !== undefined ? ` · ${fmt(item.valor)}` : ''}
          {item.subtitulo ? ` · ${item.subtitulo}` : ''}
        </div>
      </div>
    </Link>
  )
}

function CalendarItem({ item }: { item: PainelItem }) {
  const meta: string[] = []

  if (item.tipo === 'tarefas') {
    if (item.responsavelNome) meta.push(item.responsavelNome)
    if (item.prioridade) meta.push(`Prioridade ${item.prioridade}`)
    if (item.checklistTotal !== undefined && item.checklistTotal > 0) {
      meta.push(`${item.checklistFeitos || 0}/${item.checklistTotal} checklist`)
    }
  } else if (item.tipo === 'agenda') {
    if (item.data) meta.push(fmtTime(item.data.toISOString()))
    if (item.subtitulo) meta.push(item.subtitulo)
  } else {
    if (item.valor !== undefined) meta.push(fmt(item.valor))
    meta.push(item.financeiroTipo === 'recebimento' ? 'A receber' : 'A pagar')
  }

  return (
    <Link to={item.to} className={`dash-calendar-record ${item.tipo}`} title={`${tipoLabel(item)}: ${item.titulo}`} style={{ textDecoration: 'none' }}>
      <div className="dash-calendar-record-top">
        <span className="dash-calendar-item-dot" style={{ background: itemColor(item) }} />
        <span className="dash-calendar-record-type">{tipoLabel(item)}</span>
        <span className={`dash-calendar-status ${statusClass(item)}`}>{statusLabel(item)}</span>
      </div>
      <div className="dash-calendar-record-title">{item.titulo}</div>
      {meta.length > 0 && <div className="dash-calendar-record-meta">{meta.join(' · ')}</div>}
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { t } = useVisualTexts()
  const now = new Date()
  const hoje = new Date(now); hoje.setHours(12, 0, 0, 0)
  const hojeKey = dateKey(hoje.toISOString())
  const hora = now.getHours()
  const saudacao = hora < 12 ? t('dashboard.greeting.morning') : hora < 18 ? t('dashboard.greeting.afternoon') : t('dashboard.greeting.night')

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [agenda, setAgenda] = useState<Evento[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [membros, setMembros] = useState<MembroEquipe[]>([])
  const [ranking, setRanking] = useState<RankingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [mesFiltro, setMesFiltro] = useState(monthKeyFromDate(now))
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | PainelTipo>('todos')
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'abertos' | 'concluidos' | 'vencidos'>('abertos')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [t, a, p, m, r] = await Promise.all([
          tarefasApi.list(),
          agendaApi.list(),
          pagamentosApi.list(),
          isGestorLike(user?.role) ? equipeApi.membros() : Promise.resolve([]),
          tarefasApi.ranking('todos').catch(() => null),
        ])
        setTarefas(t)
        setAgenda(a)
        setPagamentos(p)
        setMembros(m)
        setRanking(r)
      } catch (e) {
        console.warn('Dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const monthOptions = useMemo(() => {
    const keys = new Set<string>([monthKeyFromDate(now)])
    tarefas.forEach(t => { const d = taskDate(t); if (d) keys.add(monthKeyFromDate(d)) })
    agenda.forEach(e => { const d = parseDateSafe(e.data_inicio); if (d) keys.add(monthKeyFromDate(d)) })
    pagamentos.forEach(p => { const d = paymentDate(p); if (d) keys.add(monthKeyFromDate(d)) })
    return Array.from(keys).sort().map(key => {
      const [y, m] = key.split('-').map(Number)
      const d = new Date(y, m - 1, 1, 12)
      return { key, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
    })
  }, [tarefas, agenda, pagamentos])

  const painelItems = useMemo<PainelItem[]>(() => {
    const taskItems: PainelItem[] = tarefas.flatMap(t => {
      const checklist = Array.isArray(t.checklist) ? t.checklist : []
      const principal: PainelItem = {
        id: `t-${t.id}`,
        tipo: 'tarefas',
        titulo: t.titulo,
        data: taskDate(t),
        status: t.status,
        prioridade: t.prioridade,
        subtitulo: t.responsavel_nome || t.criado_por_nome || undefined,
        responsavelNome: t.responsavel_nome || t.criado_por_nome || undefined,
        checklistTotal: checklist.length,
        checklistFeitos: checklist.filter(item => item.feito).length,
        to: `/tarefas?task=${t.id}`,
      }

      const acoesComData: PainelItem[] = checklist
        .filter(item => item.data)
        .map(item => ({
          id: `tc-${t.id}-${item.id}`,
          tipo: 'tarefas',
          titulo: `${t.titulo} · ${item.texto}`,
          data: checklistActionDate(item),
          status: item.feito ? 'concluida' : t.status,
          prioridade: t.prioridade,
          subtitulo: item.descricao || item.responsavel_nome || t.responsavel_nome || t.criado_por_nome || undefined,
          responsavelNome: item.responsavel_nome || t.responsavel_nome || t.criado_por_nome || undefined,
          checklistTotal: 1,
          checklistFeitos: item.feito ? 1 : 0,
          to: `/tarefas?task=${t.id}`,
        }))

      return [principal, ...acoesComData]
    })

    const agendaItems: PainelItem[] = agenda.map(e => ({
      id: `a-${e.id}`,
      tipo: 'agenda',
      titulo: e.titulo,
      data: parseDateSafe(e.data_inicio),
      status: e.tipo,
      subtitulo: e.local || e.tipo,
      to: '/agenda',
    }))

    const financeiroItems: PainelItem[] = pagamentos.map(p => ({
      id: `f-${p.id}`,
      tipo: 'financeiro',
      titulo: p.titulo,
      data: paymentDate(p),
      status: p.status,
      valor: Number(p.valor || 0),
      financeiroTipo: p.tipo,
      subtitulo: p.tipo === 'recebimento' ? 'A receber' : 'A pagar',
      to: '/financeiro',
    }))

    return [...taskItems, ...agendaItems, ...financeiroItems]
  }, [tarefas, agenda, pagamentos])

  const filteredItems = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const [year, month] = mesFiltro.split('-').map(Number)
    const start = new Date(year, month - 1, 1, 12)
    const end = new Date(year, month, 0, 12)

    return painelItems.filter(item => {
      if (tipoFiltro !== 'todos' && item.tipo !== tipoFiltro) return false
      if (!item.data || !isBetweenInclusive(item.data, start, end)) return false

      if (statusFiltro === 'abertos') {
        if (item.tipo === 'tarefas' && statusFinalTarefa.includes(String(item.status))) return false
        if (item.tipo === 'financeiro' && item.status !== 'pendente') return false
      }
      if (statusFiltro === 'concluidos') {
        if (item.tipo === 'tarefas' && !['concluida', 'aprovada'].includes(String(item.status))) return false
        if (item.tipo === 'financeiro' && item.status !== 'pago') return false
        if (item.tipo === 'agenda') return false
      }
      if (statusFiltro === 'vencidos') {
        if (!item.data || item.data >= hoje) return false
        if (item.tipo === 'tarefas' && statusFinalTarefa.includes(String(item.status))) return false
        if (item.tipo === 'financeiro' && item.status !== 'pendente') return false
        if (item.tipo === 'agenda') return false
      }
      if (q) {
        const hay = `${item.titulo} ${item.subtitulo || ''} ${item.status || ''} ${item.tipo}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    }).sort((a, b) => (a.data?.getTime() || 0) - (b.data?.getTime() || 0))
  }, [painelItems, mesFiltro, tipoFiltro, statusFiltro, busca, hoje])

  const metrics = useMemo(() => {
    const tarefasPendentes = tarefas.filter(t => !statusFinalTarefa.includes(t.status)).length
    const tarefasConcluidas = tarefas.filter(t => ['concluida', 'aprovada'].includes(t.status)).length
    const eventosHoje = agenda.filter(e => dateKey(e.data_inicio) === hojeKey)
    const receita = pagamentos.filter(p => p.tipo === 'recebimento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor || 0), 0)
    const despesas = pagamentos.filter(p => p.tipo === 'pagamento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor || 0), 0)
    const saldo = receita - despesas
    const vencidos = pagamentos.filter(p => p.status === 'pendente' && p.vencimento && parseDateSafe(p.vencimento)! < hoje)
    const financeirosHoje = pagamentos.filter(p => p.status === 'pendente' && dateKey(p.vencimento) === hojeKey)
    return { tarefasPendentes, tarefasConcluidas, eventosHoje, receita, despesas, saldo, vencidos, financeirosHoje }
  }, [tarefas, agenda, pagamentos, hojeKey, hoje])

  const kanban = useMemo(() => {
    const tomorrow = addDays(hoje, 1)
    const next7 = addDays(hoje, 7)
    const [year, month] = mesFiltro.split('-').map(Number)
    const monthEnd = new Date(year, month, 0, 12)
    const columns = [
      { id: 'hoje', title: 'Hoje', hint: 'Tudo que vence ou acontece hoje', items: [] as PainelItem[] },
      { id: 'semana', title: 'Próximos 7 dias', hint: 'Próximas ações do calendário', items: [] as PainelItem[] },
      { id: 'mes', title: 'Restante do mês', hint: 'Agenda mensal filtrada', items: [] as PainelItem[] },
      { id: 'atrasados', title: 'Atrasados', hint: 'Tarefas e cobranças pendentes', items: [] as PainelItem[] },
    ]

    filteredItems.forEach(item => {
      if (!item.data) return
      const isOpenTask = item.tipo === 'tarefas' && !statusFinalTarefa.includes(String(item.status))
      const isOpenFinance = item.tipo === 'financeiro' && item.status === 'pendente'
      if ((isOpenTask || isOpenFinance) && item.data < hoje && !isSameDay(item.data, hoje)) {
        columns[3].items.push(item)
      } else if (isSameDay(item.data, hoje)) {
        columns[0].items.push(item)
      } else if (isBetweenInclusive(item.data, tomorrow, next7)) {
        columns[1].items.push(item)
      } else if (isBetweenInclusive(item.data, addDays(next7, 1), monthEnd)) {
        columns[2].items.push(item)
      }
    })

    return columns
  }, [filteredItems, hoje, mesFiltro])

  const monthCalendar = useMemo(() => {
    const [year, month] = mesFiltro.split('-').map(Number)
    const first = new Date(year, month - 1, 1, 12)
    const daysInMonth = new Date(year, month, 0).getDate()
    const startPadding = first.getDay()
    const cells: Array<{ day: number | null; key: string; items: PainelItem[] }> = []
    for (let i = 0; i < startPadding; i++) cells.push({ day: null, key: `empty-${i}`, items: [] })
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      cells.push({ day, key, items: filteredItems.filter(item => item.data && dateKey(item.data.toISOString()) === key) })
    }
    return cells
  }, [mesFiltro, filteredItems])

  const filteredSummary = useMemo(() => {
    const tarefasAbertas = filteredItems.filter(i => i.tipo === 'tarefas' && !statusFinalTarefa.includes(String(i.status))).length
    const tarefasFechadas = filteredItems.filter(i => i.tipo === 'tarefas' && ['concluida', 'aprovada'].includes(String(i.status))).length
    const compromissos = filteredItems.filter(i => i.tipo === 'agenda').length
    const entradas = filteredItems.filter(i => i.tipo === 'financeiro' && i.financeiroTipo === 'recebimento').reduce((sum, i) => sum + Number(i.valor || 0), 0)
    const saidas = filteredItems.filter(i => i.tipo === 'financeiro' && i.financeiroTipo === 'pagamento').reduce((sum, i) => sum + Number(i.valor || 0), 0)
    return { tarefasAbertas, tarefasFechadas, compromissos, entradas, saidas, saldo: entradas - saidas }
  }, [filteredItems])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text3)' }}>
        <Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} />
        Carregando dashboard…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div className="dash-board-page">
      <div className="dash-hero">
        <div>
          <p className="dash-eyebrow">{roleLabel(user?.role)} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          <h1>{saudacao}, {user?.nome?.split(' ')[0] || t('dashboard.greeting.fallbackName')} 👋</h1>
          <p>{t('dashboard.subtitle')}</p>
        </div>
        <div className="dash-hero-actions">
          <Link to="/tarefas" className="dash-primary-action"><ListChecks size={16} /> {t('dashboard.primaryAction')}</Link>
          <Link to="/financeiro" className="dash-secondary-action"><WalletCards size={16} /> {t('dashboard.secondaryAction')}</Link>
        </div>
      </div>

      {metrics.vencidos.length > 0 && (
        <div className="dash-alert">
          <AlertTriangle size={16} />
          <span><strong>{metrics.vencidos.length} financeiro{metrics.vencidos.length > 1 ? 's' : ''} vencido{metrics.vencidos.length > 1 ? 's' : ''}</strong> aguardando ação.</span>
          <Link to="/financeiro">Ver financeiro <ArrowRight size={13} /></Link>
        </div>
      )}

      <div className="dash-metrics-grid">
        <Link to="/tarefas" className="dash-metric-card">
          <CheckCircle2 size={18} />
          <span>{t('dashboard.metrics.openTasks')}</span>
          <strong>{metrics.tarefasPendentes}</strong>
          <small>{metrics.tarefasConcluidas} concluídas/aprovadas</small>
        </Link>
        <Link to="/agenda" className="dash-metric-card">
          <Calendar size={18} />
          <span>{t('dashboard.metrics.todayEvents')}</span>
          <strong>{metrics.eventosHoje.length}</strong>
          <small>agenda do dia</small>
        </Link>
        <Link to="/financeiro" className="dash-metric-card">
          <DollarSign size={18} />
          <span>{t('dashboard.metrics.todayFinance')}</span>
          <strong>{metrics.financeirosHoje.length}</strong>
          <small>pagamentos/recebimentos</small>
        </Link>
        <Link to="/pessoas" className="dash-metric-card">
          <Users size={18} />
          <span>{t('dashboard.metrics.team')}</span>
          <strong>{membros.length || '—'}</strong>
          <small>membros ativos</small>
        </Link>
      </div>

      <section className="dash-command-panel">
        <div className="dash-section-head">
          <div>
            <h2><Filter size={18} /> {t('dashboard.filters.title')}</h2>
            <p>{t('dashboard.filters.description')}</p>
          </div>
          <button type="button" className="dash-clear-btn" onClick={() => { setMesFiltro(monthKeyFromDate(new Date())); setTipoFiltro('todos'); setStatusFiltro('abertos'); setBusca('') }}>
            {t('dashboard.filters.clear')}
          </button>
        </div>
        <div className="dash-filters-grid">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tarefa, compromisso, pessoa ou pagamento..." />
          <select value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}>
            {monthOptions.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as 'todos' | PainelTipo)}>
            <option value="todos">Tarefas, financeiro e compromissos</option>
            <option value="tarefas">Somente tarefas</option>
            <option value="agenda">Somente compromissos</option>
            <option value="financeiro">Somente financeiro</option>
          </select>
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as 'todos' | 'abertos' | 'concluidos' | 'vencidos')}>
            <option value="abertos">Abertos / pendentes</option>
            <option value="todos">Todos status</option>
            <option value="concluidos">Concluídos / pagos</option>
            <option value="vencidos">Vencidos / atrasados</option>
          </select>
        </div>
      </section>

      <section className="dash-summary-strip">
        <div><span>{t('dashboard.metrics.openTasks')}</span><strong>{filteredSummary.tarefasAbertas}</strong></div>
        <div><span>Concluídas</span><strong>{filteredSummary.tarefasFechadas}</strong></div>
        <div><span>Compromissos</span><strong>{filteredSummary.compromissos}</strong></div>
        <div><span>Entradas</span><strong className="positive">{fmt(filteredSummary.entradas)}</strong></div>
        <div><span>Saídas</span><strong className="negative">{fmt(filteredSummary.saidas)}</strong></div>
        <div><span>Saldo filtrado</span><strong className={filteredSummary.saldo >= 0 ? 'positive' : 'negative'}>{fmt(filteredSummary.saldo)}</strong></div>
      </section>

      <section className="dash-ranking-panel">
        <div className="dash-section-head">
          <div>
            <h2><Trophy size={18} /> Ranking de execução da equipe</h2>
            <p>Pontuação geral por subtarefa/checklist já executado. Todos os membros aparecem, mesmo com zero pontos.</p>
          </div>
          {/* Link direto para aba de ranking dentro de tarefas */}
          <Link to="/tarefas?tab=ranking" className="dash-inline-link">Ver ranking completo <ArrowRight size={13} /></Link>
        </div>
        <div className="dash-ranking-grid">
          {(ranking?.ranking || []).slice(0, 5).map((r: any, index: number) => {
            const max = Math.max(1, Number((ranking?.ranking || [])[0]?.pontos || 1))
            const width = Math.max(6, Math.round((Number(r.pontos || 0) / max) * 100))
            return (
              <div className="dash-ranking-row" key={r.id || r.email || index}>
                <span className="dash-ranking-pos">#{index + 1}</span>
                <div className="dash-ranking-main">
                  <strong>{r.nome || 'Membro'}</strong>
                  <small>{Number(r.subtarefas_executadas || r.tarefas_aprovadas || 0)} subtarefa(s) executada(s)</small>
                  <div className="dash-ranking-bar"><i style={{ width: `${width}%` }} /></div>
                </div>
                <b>{Number(r.pontos || 0)} pts</b>
              </div>
            )
          })}
          {(!ranking?.ranking || ranking.ranking.length === 0) && <div className="dash-empty">Ainda não há subtarefas executadas pontuadas.</div>}
        </div>
      </section>

      <section className="dash-workspace">
        <div className="dash-section-head">
          <div>
            <h2><ClipboardList size={18} /> {t('dashboard.organization.title')}</h2>
            <p>{t('dashboard.organization.description')}</p>
          </div>
          <Link to="/tarefas" className="dash-inline-link">Abrir tarefas <ArrowRight size={13} /></Link>
        </div>
        <div className="dash-kanban-grid">
          {kanban.map(column => (
            <div key={column.id} className="dash-kanban-col">
              <div className="dash-kanban-title">
                <div><strong>{column.title}</strong><small>{column.hint}</small></div>
                <span>{column.items.length}</span>
              </div>
              <div className="dash-kanban-list">
                {column.items.slice(0, 8).map(item => <MiniItem key={item.id} item={item} />)}
                {column.items.length === 0 && <div className="dash-empty">Nada por aqui.</div>}
                {column.items.length > 8 && <div className="dash-more">+ {column.items.length - 8} itens restantes</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dash-calendar-panel">
        <div className="dash-section-head">
          <div>
            <h2><CalendarDays size={18} /> {t('dashboard.calendar.title')}</h2>
            <p>{t('dashboard.calendar.description')}</p>
          </div>
          <Link to="/agenda" className="dash-inline-link">Abrir agenda <ArrowRight size={13} /></Link>
        </div>
        <div className="dash-calendar-weekdays">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="dash-calendar-grid">
          {monthCalendar.map(cell => (
            <div key={cell.key} className={`dash-calendar-cell ${cell.day ? '' : 'muted'} ${cell.key === hojeKey ? 'today' : ''}`}>
              {cell.day && <strong>{cell.day}</strong>}
              {cell.items.length > 0 && (
                <>
                  <div className="dash-day-badges" aria-label="Resumo do dia">
                    {cell.items.some(i => i.tipo === 'tarefas') && <span className="task">Tarefas {cell.items.filter(i => i.tipo === 'tarefas').length}</span>}
                    {cell.items.some(i => i.tipo === 'agenda') && <span className="event">Agenda {cell.items.filter(i => i.tipo === 'agenda').length}</span>}
                    {cell.items.some(i => i.tipo === 'financeiro') && <span className="money">Financeiro {cell.items.filter(i => i.tipo === 'financeiro').length}</span>}
                  </div>
                  <div className="dash-calendar-items">
                    {cell.items.map(item => <CalendarItem key={item.id} item={item} />)}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="dash-finance-panel">
        <div className="dash-section-head">
          <div>
            <h2><WalletCards size={18} /> {t('dashboard.finance.title')}</h2>
            <p>Resumo rápido de entradas e saídas do período selecionado.</p>
          </div>
          <Link to="/financeiro" className="dash-inline-link">Detalhes <ArrowRight size={13} /></Link>
        </div>
        <div className="dash-finance-grid">
          <div><TrendingUp size={18} color="#10B981" /><span>Entradas</span><strong className="positive">{fmt(filteredSummary.entradas)}</strong></div>
          <div><TrendingDown size={18} color="#EF4444" /><span>Saídas</span><strong className="negative">{fmt(filteredSummary.saidas)}</strong></div>
          <div><DollarSign size={18} /><span>Saldo previsto</span><strong className={filteredSummary.saldo >= 0 ? 'positive' : 'negative'}>{fmt(filteredSummary.saldo)}</strong></div>
        </div>
      </section>
    </div>
  )
}
