import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarDays, CheckCircle2, Clock3,
  Gauge, Loader, RefreshCw, RotateCcw, ShieldCheck, Users,
} from 'lucide-react'
import { equipeApi, tarefasApi, type MembroEquipe, type Tarefa } from '../lib/api'
import { buildMemberCapacity, isOverdueTask, managementSummary, type CapacityLevel } from '../lib/managementInsights'
import { daysBetweenIso, isoLocalDate, taskDueDate } from '../lib/taskFocus'
import './CentralGestao.css'

type ManagementFilter = 'aprovacoes' | 'atrasadas' | 'devolvidas' | 'riscos'

const CAPACITY_LABEL: Record<CapacityLevel, string> = {
  disponivel: 'Disponível', equilibrada: 'Equilibrada', elevada: 'Elevada', critica: 'Crítica',
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem prazo'
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function ownerName(task: Tarefa) {
  return task.responsavel_nome_perfil || task.responsavel_nome || task.aceita_por_nome || 'Sem responsável principal'
}

export default function CentralGestao() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Tarefa[]>([])
  const [members, setMembers] = useState<MembroEquipe[]>([])
  const [filter, setFilter] = useState<ManagementFilter>('aprovacoes')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const today = isoLocalDate()

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [taskData, memberData] = await Promise.all([tarefasApi.list(), equipeApi.membros()])
      setTasks(taskData)
      setMembers(memberData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a central de gestão.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const summary = useMemo(() => managementSummary(tasks, today), [tasks, today])
  const capacity = useMemo(() => buildMemberCapacity(tasks, members, today), [tasks, members, today])
  const visibleTasks = useMemo(() => {
    if (filter === 'aprovacoes') return tasks.filter(task => task.status === 'concluida')
    if (filter === 'atrasadas') return tasks.filter(task => isOverdueTask(task, today))
    if (filter === 'devolvidas') return tasks.filter(task => task.status === 'devolvida')
    return tasks.filter(task => {
      const due = taskDueDate(task)
      return task.status !== 'concluida' && task.prioridade === 'alta' && !!due && (daysBetweenIso(today, due) ?? 99) <= 3
    })
  }, [filter, tasks, today])

  return (
    <main className="management-page">
      <section className="management-head">
        <div><span><Gauge size={13} /> Comando operacional</span><h1>Central de Gestão</h1><p>Aprovações, riscos e capacidade em uma visão única. Nenhuma ação é executada fora da tarefa oficial.</p></div>
        <div className="management-head-actions"><button className="btn btn-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'management-spin' : ''} /> Atualizar</button><Link className="btn btn-primary" to="/relatorios"><BarChart3 size={14} /> Relatórios</Link></div>
      </section>

      <section className="management-kpis">
        <button className={filter === 'aprovacoes' ? 'management-kpi active review' : 'management-kpi review'} onClick={() => setFilter('aprovacoes')}><ShieldCheck size={18} /><span><strong>{summary.approvals}</strong><small>Aguardando aprovação</small></span></button>
        <button className={filter === 'atrasadas' ? 'management-kpi active danger' : 'management-kpi danger'} onClick={() => setFilter('atrasadas')}><AlertTriangle size={18} /><span><strong>{summary.overdue}</strong><small>Tarefas atrasadas</small></span></button>
        <button className={filter === 'devolvidas' ? 'management-kpi active warning' : 'management-kpi warning'} onClick={() => setFilter('devolvidas')}><RotateCcw size={18} /><span><strong>{summary.returned}</strong><small>Em correção</small></span></button>
        <button className={filter === 'riscos' ? 'management-kpi active primary' : 'management-kpi primary'} onClick={() => setFilter('riscos')}><Gauge size={18} /><span><strong>{summary.highRisk}</strong><small>Prioridade e prazo</small></span></button>
      </section>

      {loading ? <div className="management-state"><Loader size={25} className="management-spin" /><strong>Consolidando a operação…</strong></div> : error ? <div className="management-state error"><AlertTriangle size={25} /><strong>{error}</strong><button className="btn btn-secondary" onClick={() => void load()}>Tentar novamente</button></div> : (
        <section className="management-grid">
          <article className="management-panel management-demands">
            <header><div><span>Fila gerencial</span><h2>{filter === 'aprovacoes' ? 'Entregas para revisar' : filter === 'atrasadas' ? 'Prazos vencidos' : filter === 'devolvidas' ? 'Correções em andamento' : 'Riscos prioritários'}</h2></div><Link to="/tarefas">Ver quadro <ArrowRight size={13} /></Link></header>
            {visibleTasks.length === 0 ? <div className="management-empty"><CheckCircle2 size={25} /><strong>Nenhuma pendência neste grupo.</strong></div> : <div className="management-task-list">{visibleTasks.slice(0, 14).map(task => <button type="button" key={task.id} className="management-task" onClick={() => navigate(`/tarefas?task=${encodeURIComponent(task.id)}`)}><span className={`management-priority ${task.prioridade}`} /><span className="management-task-copy"><strong>{task.titulo}</strong><small>{task.origem_nome || ownerName(task)}</small></span><span className="management-task-owner"><Users size={12} /> {ownerName(task)}</span><span className="management-task-date"><CalendarDays size={12} /> {formatDate(taskDueDate(task))}</span><ArrowRight size={14} /></button>)}</div>}
          </article>

          <article className="management-panel management-capacity">
            <header><div><span>Distribuição operacional</span><h2>Capacidade da equipe</h2></div><Link to="/equipe">Abrir equipe <ArrowRight size={13} /></Link></header>
            <p className="management-note">Indicador de atenção calculado por volume, atrasos, prioridade e devoluções. Não é avaliação de desempenho.</p>
            {capacity.length === 0 ? <div className="management-empty"><Users size={25} /><strong>Nenhum membro ativo encontrado.</strong></div> : <div className="capacity-list">{capacity.map(item => <div className="capacity-row" key={item.member.id}><span className="capacity-avatar">{item.member.nome.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="capacity-person"><strong>{item.member.nome}</strong><small>{item.member.cargo || 'Membro da equipe'}</small></span><span className="capacity-numbers"><b>{item.active}</b><small>ativas</small></span><span className="capacity-numbers danger"><b>{item.overdue}</b><small>atrasadas</small></span><span className={`capacity-level ${item.level}`}>{CAPACITY_LABEL[item.level]}</span></div>)}</div>}
          </article>
        </section>
      )}

      <section className="management-policy"><Clock3 size={16} /><span><strong>Leitura operacional, não julgamento.</strong> A capacidade indica onde o gestor deve conferir contexto antes de redistribuir. O Nexus não muda responsáveis nem datas automaticamente.</span></section>
    </main>
  )
}
