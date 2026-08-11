import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, ListTodo,
  Loader, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Target,
} from 'lucide-react'
import { tarefasApi, type Tarefa } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { buildFocusTasks, isManagerUser, isoLocalDate, taskDueDate, type FocusReason } from '../lib/taskFocus'
import './MeuDia.css'

const REASON_LABEL: Record<FocusReason, string> = {
  devolvida: 'Correção prioritária',
  atrasada: 'Prazo vencido',
  hoje: 'Vence hoje',
  em_progresso: 'Em execução',
  alta: 'Alta prioridade',
  proxima: 'Próxima ação',
  revisao: 'Aguardando sua aprovação',
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem prazo definido'
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function progress(task: Tarefa) {
  const items = task.checklist || []
  const done = items.filter(item => item.feito).length
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 }
}

export default function MeuDia() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'foco' | 'atrasadas' | 'hoje' | 'andamento' | 'revisao'>('foco')
  const today = isoLocalDate()

  async function load() {
    setLoading(true)
    setError('')
    try {
      setTasks(await tarefasApi.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar seu dia.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const focusTasks = useMemo(() => buildFocusTasks(tasks, user, today), [tasks, user, today])
  const counts = useMemo(() => ({
    focus: focusTasks.length,
    overdue: focusTasks.filter(item => item.reason === 'atrasada').length,
    today: focusTasks.filter(item => item.reason === 'hoje').length,
    progress: focusTasks.filter(item => item.reason === 'em_progresso' || item.reason === 'devolvida').length,
    review: focusTasks.filter(item => item.reason === 'revisao').length,
  }), [focusTasks])

  const visible = useMemo(() => {
    if (filter === 'atrasadas') return focusTasks.filter(item => item.reason === 'atrasada')
    if (filter === 'hoje') return focusTasks.filter(item => item.reason === 'hoje')
    if (filter === 'andamento') return focusTasks.filter(item => item.reason === 'em_progresso' || item.reason === 'devolvida')
    if (filter === 'revisao') return focusTasks.filter(item => item.reason === 'revisao')
    return focusTasks.slice(0, 12)
  }, [filter, focusTasks])

  const greeting = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const taskRoute = user?.role === 'membro' ? '/minhas-tarefas' : '/tarefas'

  function openTask(task: Tarefa) {
    navigate(`${taskRoute}?task=${encodeURIComponent(task.id)}`)
  }

  return (
    <main className="myday-page">
      <section className="myday-hero">
        <div>
          <span className="myday-eyebrow"><Sparkles size={13} /> Central de foco</span>
          <h1>{greeting}, {user?.nome?.split(' ')[0] || 'vamos começar'}.</h1>
          <p>O Nexus organizou o que precisa da sua atenção. As regras e permissões continuam sendo as mesmas da página de tarefas.</p>
        </div>
        <div className="myday-hero-actions">
          <button className="btn btn-secondary" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'myday-spin' : ''} /> Atualizar
          </button>
          <Link className="btn btn-primary" to="/painel-offline"><ListTodo size={15} /> Área offline</Link>
        </div>
      </section>

      <section className="myday-metrics" aria-label="Resumo do dia">
        <button className={filter === 'foco' ? 'myday-metric active' : 'myday-metric'} onClick={() => setFilter('foco')}>
          <span className="myday-metric-icon primary"><Target size={17} /></span><strong>{counts.focus}</strong><small>Para acompanhar</small>
        </button>
        <button className={filter === 'atrasadas' ? 'myday-metric active' : 'myday-metric'} onClick={() => setFilter('atrasadas')}>
          <span className="myday-metric-icon danger"><AlertTriangle size={17} /></span><strong>{counts.overdue}</strong><small>Atrasadas</small>
        </button>
        <button className={filter === 'hoje' ? 'myday-metric active' : 'myday-metric'} onClick={() => setFilter('hoje')}>
          <span className="myday-metric-icon warning"><CalendarDays size={17} /></span><strong>{counts.today}</strong><small>Vencem hoje</small>
        </button>
        <button className={filter === 'andamento' ? 'myday-metric active' : 'myday-metric'} onClick={() => setFilter('andamento')}>
          <span className="myday-metric-icon info"><Clock3 size={17} /></span><strong>{counts.progress}</strong><small>Em andamento</small>
        </button>
        {isManagerUser(user) && (
          <button className={filter === 'revisao' ? 'myday-metric active' : 'myday-metric'} onClick={() => setFilter('revisao')}>
            <span className="myday-metric-icon review"><ShieldCheck size={17} /></span><strong>{counts.review}</strong><small>Para aprovar</small>
          </button>
        )}
      </section>

      <section className="myday-focus">
        <div className="myday-section-head">
          <div><span>Ordem recomendada</span><h2>{filter === 'foco' ? 'Próximas ações' : 'Resultado do filtro'}</h2></div>
          <Link to={taskRoute}>Ver todas as tarefas <ArrowRight size={14} /></Link>
        </div>

        {loading ? (
          <div className="myday-state"><Loader size={24} className="myday-spin" /><strong>Organizando seu dia…</strong></div>
        ) : error ? (
          <div className="myday-state error"><AlertTriangle size={24} /><strong>{error}</strong><button className="btn btn-secondary" onClick={() => void load()}>Tentar novamente</button></div>
        ) : visible.length === 0 ? (
          <div className="myday-state success"><CheckCircle2 size={28} /><strong>Nada pendente neste filtro.</strong><span>Você pode consultar todas as listas ou preparar o próximo trabalho.</span></div>
        ) : (
          <div className="myday-list">
            {visible.map(({ task, reason, daysUntilDue }, index) => {
              const itemProgress = progress(task)
              const due = taskDueDate(task)
              return (
                <button key={task.id} type="button" className={`myday-task reason-${reason}`} onClick={() => openTask(task)}>
                  <span className="myday-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="myday-task-main">
                    <span className="myday-task-top"><em>{REASON_LABEL[reason]}</em><span>{task.prioridade === 'alta' ? 'Alta' : task.prioridade === 'baixa' ? 'Baixa' : 'Média'}</span></span>
                    <strong>{task.titulo}</strong>
                    <small>{task.origem_nome || task.responsavel_nome_perfil || task.responsavel_nome || task.aceita_por_nome || 'Nexus'}</small>
                  </span>
                  <span className="myday-task-progress">
                    {itemProgress.total > 0 && <><span>{itemProgress.done}/{itemProgress.total} itens</span><i><b style={{ width: `${itemProgress.percent}%` }} /></i></>}
                  </span>
                  <span className="myday-task-due">
                    <CalendarDays size={14} /><strong>{formatDate(due)}</strong>
                    {daysUntilDue !== null && daysUntilDue < 0 && <small>{Math.abs(daysUntilDue)} dia{Math.abs(daysUntilDue) === 1 ? '' : 's'} em atraso</small>}
                  </span>
                  <ArrowRight size={16} className="myday-task-arrow" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="myday-guidance">
        <div><RotateCcw size={17} /><span><strong>Prioridade transparente</strong>Devoluções, aprovações, atrasos e prazos aparecem primeiro. O Nexus apenas recomenda a ordem; não altera tarefa, prazo ou responsável.</span></div>
        <div><ShieldCheck size={17} /><span><strong>Permissões preservadas</strong>Toda execução continua acontecendo na tarefa oficial, validada pelo servidor e registrada no histórico.</span></div>
      </section>
    </main>
  )
}

