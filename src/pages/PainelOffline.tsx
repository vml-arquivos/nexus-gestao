import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, Clock3, Download, Eye, HardDrive, LayoutDashboard, ListChecks,
  MonitorDown, RefreshCw, Search, ShieldCheck, StickyNote, UserRound, Wifi, WifiOff,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { tarefasApi, type ChecklistItem, type Tarefa } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  checklistOperation,
  listOfflineOperations,
  loadOfflineSnapshot,
  offlineOwner,
  queueOfflineOperation,
  saveOfflineSnapshot,
  statusOperation,
  syncPanelOperations,
} from '../lib/offlineTaskPanel'
import './PainelOffline.css'
import {
  checklistRecurrenceLabel,
  checklistReminderIsDue,
  hasRecurringChecklistItem,
  normalizeChecklistRecurrence,
} from '../lib/checklistRecurrence'
import { buildOfflineWorkspaceHtml } from '../lib/exportOfflineWorkspace'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type PanelView = 'hoje' | 'recorrentes' | 'todas'

function isClosed(task: Tarefa) {
  return task.status === 'cancelada' || task.status === 'aprovada' || (task.status === 'concluida' && task.status_gestor === 'aprovada')
}

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function dateKey(value?: string | null) {
  return String(value || '').slice(0, 10)
}

function formatDate(value?: string | null) {
  const key = dateKey(value)
  if (!key) return ''
  const [year, month, day] = key.split('-')
  return year && month && day ? `${day}/${month}/${year}` : key
}

function taskProgress(task: Tarefa) {
  const items = task.checklist || []
  const done = items.filter(item => item.feito).length
  return { total: items.length, done, percent: items.length ? Math.round((done / items.length) * 100) : 0 }
}

function isTaskForToday(task: Tarefa, today: string) {
  if (task.lembrete_diario_ate_aprovacao) return true
  if (task.status === 'concluida' && task.status_gestor !== 'aprovada') return true
  if (dateKey(task.prazo) && dateKey(task.prazo) <= today) return true
  return (task.checklist || []).some(item => {
    const aguardando = !item.feito || (task.escopo === 'equipe' && item.aprovacao_status !== 'aprovada')
    if (!aguardando) return false
    if (checklistReminderIsDue(item, today)) return true
    return normalizeChecklistRecurrence(item.recorrencia) === 'unica' && dateKey(item.data) && dateKey(item.data) <= today
  })
}

function priorityRank(priority: Tarefa['prioridade']) {
  return priority === 'alta' ? 0 : priority === 'media' ? 1 : 2
}

function taskStatusLabel(task: Tarefa) {
  if (task.status === 'concluida' && task.status_gestor !== 'aprovada') return 'Aguardando aprovação'
  if (task.status === 'em_progresso') return 'Em execução'
  if (task.status === 'devolvida') return 'Devolvida'
  if (task.status === 'nao_concluida') return 'Não concluída'
  return 'Pendente'
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default function PainelOffline() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const owner = user ? offlineOwner(user) : null
  const [tasks, setTasks] = useState<Tarefa[]>([])
  const [savedAt, setSavedAt] = useState('')
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<PanelView>('hoje')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [clock, setClock] = useState(() => new Date())

  const today = localDateKey()
  const isManager = Boolean(user && ['dev', 'admin', 'gestor', 'sub_gestor'].includes(user.role))
  const openTasks = useMemo(() => tasks.filter(task => !isClosed(task)), [tasks])
  const summary = useMemo(() => {
    const actions = openTasks.flatMap(task => task.checklist || [])
    return {
      today: openTasks.filter(task => isTaskForToday(task, today)).length,
      recurringActions: actions.filter(item => normalizeChecklistRecurrence(item.recorrencia) !== 'unica').length,
      pendingActions: actions.filter(item => !item.feito).length,
      completedActions: actions.filter(item => item.feito).length,
      awaitingApproval: openTasks.filter(task => task.status === 'concluida' && task.status_gestor !== 'aprovada').length,
    }
  }, [openTasks, today])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    return openTasks
      .filter(task => view === 'todas'
        || (view === 'recorrentes' ? (task.lembrete_diario_ate_aprovacao || hasRecurringChecklistItem(task.checklist)) : isTaskForToday(task, today)))
      .filter(task => {
        if (!normalizedQuery) return true
        return [task.titulo, task.origem_nome, task.responsavel_nome, ...(task.checklist || []).map(item => `${item.texto} ${item.responsavel_nome || ''}`)]
          .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      })
      .sort((a, b) => {
        const aRecurring = a.lembrete_diario_ate_aprovacao || hasRecurringChecklistItem(a.checklist)
        const bRecurring = b.lembrete_diario_ate_aprovacao || hasRecurringChecklistItem(b.checklist)
        if (aRecurring !== bRecurring) return aRecurring ? -1 : 1
        const priority = priorityRank(a.prioridade) - priorityRank(b.prioridade)
        if (priority) return priority
        return dateKey(a.prazo || '9999-12-31').localeCompare(dateKey(b.prazo || '9999-12-31'))
      })
  }, [openTasks, query, today, view])

  async function persist(next: Tarefa[]) {
    if (!owner) return
    await saveOfflineSnapshot(owner, next)
    setSavedAt(new Date().toISOString())
  }

  async function refreshFromServer() {
    if (!owner || !navigator.onLine) return
    setLoading(true)
    setMessage('Sincronizando alterações e atualizando a carga…')
    try {
      const syncResult = await syncPanelOperations(owner.key)
      const fresh = await tarefasApi.list()
      setTasks(fresh)
      await persist(fresh)
      const remaining = (await listOfflineOperations(owner.key)).length
      setPending(remaining)
      setMessage(syncResult.synced > 0
        ? `${syncResult.synced} alteração(ões) enviada(s). Carga atualizada com sucesso.`
        : 'Carga atualizada e pronta para trabalhar sem conexão.')
    } catch {
      setMessage('Servidor indisponível. Seus dados locais e alterações continuam protegidos neste dispositivo.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!owner) { setLoading(false); return }
    let active = true
    void (async () => {
      const snapshot = await loadOfflineSnapshot(owner.key)
      if (!active) return
      if (snapshot) {
        setTasks(snapshot.tasks || [])
        setSavedAt(snapshot.savedAt)
      }
      setPending((await listOfflineOperations(owner.key)).length)
      setLoading(false)
      if (navigator.onLine) void refreshFromServer()
    })()
    return () => { active = false }
  }, [owner?.key])

  useEffect(() => {
    if (!visibleTasks.length || expanded.size) return
    setExpanded(new Set(visibleTasks.slice(0, 2).map(task => task.id)))
  }, [visibleTasks, expanded.size])

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void refreshFromServer() }
    const handleOffline = () => { setOnline(false); setMessage('Modo offline ativo. Tudo o que você marcar ficará na fila segura de envio.') }
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleInstall)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/painel-offline-sw.js', { scope: '/painel-offline/' }).catch(() => undefined)
    }
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const previousManifest = manifest?.getAttribute('href') || ''
    if (manifest) manifest.href = '/painel-offline.webmanifest'
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleInstall)
      if (manifest && previousManifest) manifest.href = previousManifest
    }
  }, [owner?.key])

  async function toggleChecklist(task: Tarefa, item: ChecklistItem, feito: boolean) {
    if (!owner || !item.id) return
    const next = tasks.map(current => current.id === task.id
      ? { ...current, checklist: (current.checklist || []).map(entry => entry.id === item.id ? { ...entry, feito } : entry) }
      : current)
    setTasks(next)
    await persist(next)
    if (!navigator.onLine) {
      await queueOfflineOperation(checklistOperation(owner.key, task.id, item.id, feito))
    } else {
      try {
        const updated = await tarefasApi.atualizarChecklistItem(task.id, item.id, feito)
        if (!updated) throw new Error('Sincronização adiada')
        const synced = next.map(current => current.id === task.id ? updated : current)
        setTasks(synced)
        await persist(synced)
      } catch {
        await queueOfflineOperation(checklistOperation(owner.key, task.id, item.id, feito))
      }
    }
    setPending((await listOfflineOperations(owner.key)).length)
  }

  async function finishTask(task: Tarefa) {
    if (!owner) return
    const unfinished = (task.checklist || []).filter(item => !item.feito).length
    if (unfinished > 0 && !window.confirm(`Ainda há ${unfinished} ação(ões) pendente(s). Deseja enviar a lista para aprovação mesmo assim?`)) return
    const next = tasks.map(current => current.id === task.id ? { ...current, status: 'concluida' as const, status_gestor: 'aguardando' as const } : current)
    setTasks(next)
    await persist(next)
    if (!navigator.onLine) {
      await queueOfflineOperation(statusOperation(owner.key, task.id, 'concluida'))
    } else {
      try {
        const updated = await tarefasApi.updateStatus(task.id, { status: 'concluida' })
        if (!updated) throw new Error('Sincronização adiada')
      } catch {
        await queueOfflineOperation(statusOperation(owner.key, task.id, 'concluida'))
      }
    }
    setPending((await listOfflineOperations(owner.key)).length)
  }

  function toggleExpanded(taskId: string) {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function exportLoad() {
    const html = buildOfflineWorkspaceHtml(visibleTasks, owner?.nome || 'Usuário Nexus', today)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `minha-area-de-trabalho-nexus-${today}.html`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!owner) {
    return <div className="offline-shell"><div className="offline-empty"><ShieldCheck size={32} /><h1>Painel protegido</h1><p>Faça login ao menos uma vez neste dispositivo para liberar sua carga offline.</p></div></div>
  }

  return (
    <main className="offline-shell" data-workspace-role={isManager ? 'manager' : 'member'}>
      <section className="offline-desk-header">
        <div className="offline-desk-topline">
          <button className="offline-back" type="button" onClick={() => navigate('/tarefas')}><ArrowLeft size={16} /> Voltar às tarefas</button>
          <div className={online ? 'offline-connection is-online' : 'offline-connection is-offline'}>
            {online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'Conectado' : 'Modo offline'}
          </div>
        </div>
        <div className="offline-desk-main">
          <div className="offline-desk-title">
            <span className="offline-eyebrow"><LayoutDashboard size={15} /> NEXUS WORKSPACE</span>
            <h1>Minha área de trabalho</h1>
            <p><strong>{owner.nome}</strong><span />{isManager ? 'Visão da equipe e aprovações' : 'Tarefas, prazos e anotações do dia'}</p>
          </div>
          <div className="offline-clock" aria-label="Data e hora atuais">
            <span><Clock3 size={18} /> Agora</span>
            <strong>{clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
            <small>{clock.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</small>
          </div>
        </div>
        <div className="offline-desk-actions">
            <button className="offline-action secondary" type="button" onClick={exportLoad}><Download size={17} /> Exportar meu quadro</button>
            {installPrompt && (
              <button className="offline-action secondary" type="button" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null) }}><MonitorDown size={17} /> Usar offline no PC</button>
            )}
            {!installPrompt && <span className="offline-ready"><HardDrive size={16} /> Disponível neste navegador</span>}
            <button className="offline-action primary" type="button" onClick={() => void refreshFromServer()} disabled={!online || loading}><RefreshCw size={17} className={loading ? 'offline-spin' : ''} /> {loading ? 'Sincronizando…' : 'Sincronizar agora'}</button>
        </div>
      </section>

      <section className={pending ? 'offline-sync-status has-pending' : 'offline-sync-status'} aria-live="polite">
        <div className="offline-sync-icon">{pending ? <AlertTriangle size={19} /> : <ShieldCheck size={19} />}</div>
        <div>
          <strong>{pending ? `${pending} alteração(ões) aguardando sincronização` : 'Área de trabalho sincronizada'}</strong>
          <span>{savedAt ? `Atualizada em ${new Date(savedAt).toLocaleString('pt-BR')}.` : 'Faça a primeira sincronização enquanto estiver conectado.'} {message}</span>
        </div>
      </section>

      <section className="offline-desk-notes" aria-label="Resumo do trabalho">
        <article className="offline-note note-yellow"><span><StickyNote size={20} /></span><div><small>Foco de hoje</small><strong>{summary.today}</strong><p>listas para acompanhar agora</p></div></article>
        <article className="offline-note note-blue"><span><RefreshCw size={20} /></span><div><small>Rotina</small><strong>{summary.recurringActions}</strong><p>ações recorrentes ativas</p></div></article>
        <article className="offline-note note-rose"><span><ListChecks size={20} /></span><div><small>Pendências</small><strong>{summary.pendingActions}</strong><p>ações ainda em aberto</p></div></article>
        <article className="offline-note note-green"><span><CheckCircle2 size={20} /></span><div><small>{isManager ? 'Para aprovar' : 'Concluídas'}</small><strong>{isManager ? summary.awaitingApproval : summary.completedActions}</strong><p>{isManager ? 'listas aguardando revisão' : 'ações executadas'}</p></div></article>
      </section>

      <section className="offline-workspace">
        <header className="offline-workspace-head">
          <div className="offline-workspace-title"><span><LayoutDashboard size={19} /></span><div><small>{isManager ? 'ACOMPANHAMENTO DA EQUIPE' : 'ORGANIZAÇÃO PESSOAL'}</small><h2>{isManager ? 'Quadro de execução e aprovação' : 'Meu quadro de tarefas'}</h2></div></div>
          <div className="offline-view-tabs" role="tablist" aria-label="Filtrar listas">
            <button type="button" className={view === 'hoje' ? 'active' : ''} onClick={() => setView('hoje')}>Agora <b>{summary.today}</b></button>
            <button type="button" className={view === 'recorrentes' ? 'active' : ''} onClick={() => setView('recorrentes')}>Recorrentes <b>{summary.recurringActions}</b></button>
            <button type="button" className={view === 'todas' ? 'active' : ''} onClick={() => setView('todas')}>Todas <b>{openTasks.length}</b></button>
          </div>
        </header>

        <div className="offline-toolbar">
          <Search size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar empresa, lista, ação ou responsável…" aria-label="Buscar na carga offline" />
          {query && <button type="button" onClick={() => setQuery('')}>Limpar</button>}
        </div>

        {loading && !tasks.length ? (
          <div className="offline-empty"><RefreshCw className="offline-spin" size={28} /><h3>Preparando sua carga segura…</h3></div>
        ) : visibleTasks.length === 0 ? (
          <div className="offline-empty"><CheckCircle2 size={32} /><h3>Nenhuma lista neste filtro</h3><p>Altere o filtro ou a busca para consultar as demais listas armazenadas.</p></div>
        ) : (
          <div className="offline-task-list">
            {visibleTasks.map(task => {
              const progress = taskProgress(task)
              const isExpanded = expanded.has(task.id)
              const isPf = task.contexto_tipo === 'pessoa_fisica'
              const awaitingApproval = task.status === 'concluida'
              const assignedToManager = task.responsavel_id === user?.id || (task.checklist || []).some(item => item.responsavel_id === user?.id)
              const managerTrackingOnly = isManager && !assignedToManager
              return (
                <article className={`offline-task priority-${task.prioridade || 'media'}${isExpanded ? ' is-expanded' : ''}`} key={task.id}>
                  <div className="offline-task-main">
                    <button className="offline-task-toggle" type="button" onClick={() => toggleExpanded(task.id)} aria-expanded={isExpanded}>
                      <span className="offline-entity-icon">{isPf ? <UserRound size={19} /> : <Building2 size={19} />}</span>
                      <span className="offline-task-copy">
                        <span className="offline-task-overline"><span className="offline-entity-name">{task.origem_nome || (task.contexto_tipo === 'pessoal' ? 'Pessoal' : task.contexto_tipo === 'escritorio' ? 'Escritório' : 'Nexus')}</span><span className={`offline-task-status status-${task.status}`}>{taskStatusLabel(task)}</span></span>
                        <strong>{task.titulo}</strong>
                        <span className="offline-task-meta">
                          <em><UserRound size={13} /> {task.responsavel_nome || 'Equipe'}</em>
                          {task.prazo && <em><CalendarDays size={13} /> Prazo {formatDate(task.prazo)}</em>}
                          {(task.lembrete_diario_ate_aprovacao || hasRecurringChecklistItem(task.checklist)) && <em className="daily"><RefreshCw size={12} /> Recorrência por ação</em>}
                        </span>
                      </span>
                      <span className="offline-progress-copy"><b>{progress.percent}%</b><small>{progress.done} de {progress.total}</small></span>
                      <ChevronDown className="offline-chevron" size={19} />
                    </button>
                    <div className="offline-progress-track"><span style={{ width: `${progress.percent}%` }} /></div>
                    {managerTrackingOnly ? (
                      <button className={awaitingApproval ? 'offline-finish review' : 'offline-finish tracking'} type="button" onClick={() => navigate(`/tarefas?task=${encodeURIComponent(task.id)}`)} disabled={!online}>
                        {awaitingApproval ? <ShieldCheck size={16} /> : <Eye size={16} />}
                        {awaitingApproval ? 'Revisar e aprovar' : 'Ver andamento'}
                      </button>
                    ) : (
                      <button className={awaitingApproval ? 'offline-finish awaiting' : 'offline-finish'} type="button" onClick={() => void finishTask(task)} disabled={awaitingApproval}>
                        {awaitingApproval ? <ShieldCheck size={16} /> : <CheckCircle2 size={16} />}
                        {awaitingApproval ? 'Aguardando aprovação' : 'Finalizar lista'}
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="offline-checklist">
                      {(task.checklist || []).length === 0 ? <div className="offline-no-items">Esta lista não possui ações de checklist.</div> : (task.checklist || []).map(item => (
                        <div className={item.feito ? 'offline-check-row is-done' : 'offline-check-row'} key={item.id}>
                          <button
                            className="offline-checkbox"
                            type="button"
                            role="checkbox"
                            aria-checked={Boolean(item.feito)}
                            aria-label={`${item.feito ? 'Desmarcar' : 'Concluir'}: ${item.texto}`}
                            onClick={() => void toggleChecklist(task, item, !item.feito)}
                          >
                            {item.feito && <Check size={15} strokeWidth={3} />}
                          </button>
                          <div className="offline-check-copy">
                            <strong>{item.texto}</strong>
                            {item.descricao && <p>{item.descricao}</p>}
                            <div className="offline-check-meta">
                              <span><UserRound size={13} /> {item.responsavel_nome || task.responsavel_nome || 'Equipe'}</span>
                              {item.data && <span className={dateKey(item.data) < today && !item.feito ? 'overdue' : ''}><CalendarDays size={13} /> {formatDate(item.data)}</span>}
                              {normalizeChecklistRecurrence(item.recorrencia) !== 'unica' && <span className="recurrence"><RefreshCw size={12} /> {checklistRecurrenceLabel(item)} · mesmo item</span>}
                            </div>
                          </div>
                          <span className={item.feito ? 'offline-item-state done' : item.aprovacao_status === 'devolvida' ? 'offline-item-state returned' : 'offline-item-state'}>{item.feito ? (item.aprovacao_status === 'aprovada' ? 'Aprovada' : 'Concluída') : item.aprovacao_status === 'devolvida' ? 'Devolvida' : 'Pendente'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
