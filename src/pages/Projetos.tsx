import { useEffect, useMemo, useState } from 'react'
import { FolderKanban, GitBranch, Loader2, ListChecks, ArrowRight, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { tarefasApi, type Tarefa } from '../lib/api'

function projectLabel(task: Tarefa) {
  if (!task.projeto_grupo_id) return 'Sem projeto'
  if (task.workflow_tipo === 'acompanhamento_bancario') return 'Acompanhamento bancário'
  if (task.workflow_tipo === 'rotina_cnd') return 'Rotina CND'
  if (task.workflow_tipo === 'rotina_cemprot') return 'Rotina CEMPROT'
  return `Projeto ${task.projeto_grupo_id.slice(0, 8)}`
}

function statusLabel(status: string) {
  return {
    pendente: 'Pendente',
    em_progresso: 'Em progresso',
    concluida: 'Concluída',
    aprovada: 'Aprovada',
    devolvida: 'Devolvida',
    reenviada: 'Reenviada',
    nao_concluida: 'Não concluída',
    cancelada: 'Cancelada',
  }[status] || status
}

export default function Projetos() {
  const [tasks, setTasks] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setTasks(await tarefasApi.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os projetos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; label: string; tasks: Tarefa[] }>()
    tasks.forEach(task => {
      const id = task.projeto_grupo_id || 'sem-projeto'
      const current = map.get(id) || { id, label: projectLabel(task), tasks: [] }
      current.tasks.push(task)
      map.set(id, current)
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === 'sem-projeto') return 1
      if (b.id === 'sem-projeto') return -1
      return a.label.localeCompare(b.label, 'pt-BR')
    })
  }, [tasks])

  const projectCount = groups.filter(group => group.id !== 'sem-projeto').length
  const checklistCount = tasks.reduce((total, task) => total + (task.checklist?.length || 0), 0)

  return (
    <main className="projects-page space-y-5 pb-8">
      <header className="projects-page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300"><FolderKanban size={15} /> Projetos</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Tarefas agrupadas em projetos</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Uma visão sobre o agrupador operacional que o Nexus já usa. Nada é copiado para uma tabela de projetos: a fonte continua sendo a tarefa existente.</p>
        </div>
        <div className="projects-page-actions">
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
        </div>
      </header>

      <div className="projects-page-stats grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="text-xs text-slate-500 dark:text-slate-400">Projetos com grupo</div><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">{projectCount}</strong></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="text-xs text-slate-500 dark:text-slate-400">Tarefas visíveis</div><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">{tasks.length}</strong></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="text-xs text-slate-500 dark:text-slate-400">Itens de checklist</div><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">{checklistCount}</strong></div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" role="alert">{error}</div>}
      {loading ? <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 py-16 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando tarefas e agrupamentos…</div> : groups.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-16 text-center dark:border-slate-700"><FolderKanban className="mx-auto mb-2 text-slate-400" size={26} /><strong className="block text-sm text-slate-700 dark:text-slate-200">Nenhuma tarefa visível</strong><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Os projetos aparecem automaticamente quando as tarefas possuem um grupo operacional.</span></div> : (
        <section className="projects-page-groups grid gap-4 xl:grid-cols-2" aria-label="Projetos e tarefas agrupadas">
          {groups.map(group => {
            const firstTask = group.tasks[0]
            const openCount = group.tasks.filter(task => !['concluida', 'aprovada', 'cancelada'].includes(String(task.status))).length
            return <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100"><FolderKanban size={18} className="shrink-0 text-violet-600" /> <span className="truncate">{group.label}</span></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{group.tasks.length} tarefa(s) · {openCount} em aberto{group.id === 'sem-projeto' ? ' · agrupamento sem projeto' : ''}</p></div>
                <Link to={`/tarefas?view=grafo&graphTask=${encodeURIComponent(firstTask.id)}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700 active:scale-95"><GitBranch size={14} /> Abrir mapa</Link>
              </div>
              <div className="mt-4 space-y-2">
                {group.tasks.slice(0, 5).map(task => <Link key={task.id} to={`/tarefas?view=grafo&graphTask=${encodeURIComponent(task.id)}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 transition hover:border-violet-200 hover:bg-violet-50/60 dark:border-slate-800 dark:hover:border-violet-900 dark:hover:bg-violet-950/20"><span className="flex min-w-0 items-center gap-2"><ListChecks size={14} className="shrink-0 text-slate-400" /><span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{task.titulo}</span></span><span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">{statusLabel(String(task.status))}<ArrowRight size={12} /></span></Link>)}
                {group.tasks.length > 5 && <Link to={`/tarefas?view=grafo&graphTask=${encodeURIComponent(firstTask.id)}`} className="block px-3 pt-1 text-[11px] font-medium text-violet-600 dark:text-violet-300">+{group.tasks.length - 5} tarefa(s) no mapa</Link>}
              </div>
            </article>
          })}
        </section>
      )}
    </main>
  )
}
