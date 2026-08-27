import { CalendarDays, CheckCircle2, ChevronRight } from 'lucide-react'
import type { Tarefa } from '../lib/api'

type Props = {
  tasks: Tarefa[]
  getDate: (task: Tarefa) => string | undefined
  onOpen: (task: Tarefa) => void
  onEdit?: (task: Tarefa) => void
}

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_progresso: 'Em progresso',
  concluida: 'Concluída',
  aprovada: 'Aprovada',
  devolvida: 'Devolvida',
  reenviada: 'Reenviada',
  nao_concluida: 'Não concluída',
  cancelada: 'Cancelada',
}

const STATUS_TONE: Record<string, string> = {
  pendente: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  em_progresso: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
  concluida: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  aprovada: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-200',
  devolvida: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200',
  reenviada: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200',
  nao_concluida: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200',
  cancelada: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

function formatDate(value?: string) {
  const raw = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'Sem prazo'
  const [year, month, day] = raw.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR')
}

function checklistSummary(task: Tarefa) {
  const value = task as Tarefa & { checklist_truncado?: boolean; checklist_bytes?: number }
  if (value.checklist_truncado) return `Checklist protegido · ${Number(value.checklist_bytes || 0).toLocaleString('pt-BR')} bytes`
  const items = Array.isArray(task.checklist) ? task.checklist : []
  const done = items.filter(item => item.feito).length
  return items.length ? `${done}/${items.length} itens` : 'Sem checklist'
}

export function TaskTableView({ tasks, getDate, onOpen, onEdit }: Props) {
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Tabela de tarefas">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tabela operacional</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{tasks.length} tarefa{tasks.length === 1 ? '' : 's'} na seleção atual. Clique em uma linha para abrir o detalhe.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><CheckCircle2 size={13} /> Dados da mesma lista</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">Tarefa</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Prazo</th>
              <th scope="col" className="px-4 py-3">Responsável</th>
              <th scope="col" className="px-4 py-3">Checklist</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map(task => (
              <tr key={task.id} className="group cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => onOpen(task)}>
                <td className="max-w-sm px-4 py-3">
                  <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={task.titulo}>{task.titulo}</div>
                  {task.descricao && <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" title={task.descricao}>{task.descricao}</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${STATUS_TONE[task.status] || STATUS_TONE.pendente}`}>{STATUS_LABEL[task.status] || task.status}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{formatDate(getDate(task))}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{task.responsavel_nome || task.responsavel_nome_perfil || 'Sem responsável'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{checklistSummary(task)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {onEdit && <button type="button" className="mr-2 rounded-md px-2 py-1 text-xs font-medium text-violet-700 opacity-0 transition hover:bg-violet-50 group-hover:opacity-100 focus:opacity-100 dark:text-violet-300 dark:hover:bg-violet-950/40" onClick={event => { event.stopPropagation(); onEdit(task) }}>Editar</button>}
                  <ChevronRight size={16} className="inline text-slate-400" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
