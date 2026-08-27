import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import type { Tarefa } from '../lib/api'

type Props = {
  tasks: Tarefa[]
  getDate: (task: Tarefa) => string | undefined
  onOpen: (task: Tarefa) => void
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
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

function isoDate(value?: string) {
  const raw = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function parseMonth(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

function shiftMonth(key: string, delta: number) {
  const date = parseMonth(key)
  date.setMonth(date.getMonth() + delta)
  return monthKey(date)
}

function dateLabel(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function TaskCalendarView({ tasks, getDate, onOpen }: Props) {
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const monthDate = parseMonth(month)
  const firstDay = (monthDate.getDay() + 6) % 7
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const today = isoDate(new Date().toISOString())

  const datedTasks = useMemo(() => tasks
    .map(task => ({ task, date: isoDate(getDate(task)) }))
    .filter(item => item.date), [tasks, getDate])
  const byDate = useMemo(() => {
    const result = new Map<string, Tarefa[]>()
    datedTasks.forEach(({ task, date }) => {
      const current = result.get(date) || []
      current.push(task)
      result.set(date, current)
    })
    return result
  }, [datedTasks])
  const withoutDate = useMemo(() => tasks.filter(task => !isoDate(getDate(task))), [tasks, getDate])

  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) => {
    if (index < firstDay) return null
    const day = index - firstDay + 1
    const iso = `${month}-${String(day).padStart(2, '0')}`
    return { day, iso, tasks: byDate.get(iso) || [] }
  })

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Calendário de tarefas">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <CalendarDays size={18} aria-hidden="true" />
            Calendário de tarefas
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mesma lista filtrada, organizada pelo prazo ou data da tarefa.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setMonth(current => shiftMonth(current, -1))} aria-label="Mês anterior">
            <ChevronLeft size={16} />
          </button>
          <strong className="min-w-36 text-center text-sm capitalize text-slate-800 dark:text-slate-200">
            {monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </strong>
          <button type="button" className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setMonth(current => shiftMonth(current, 1))} aria-label="Próximo mês">
            <ChevronRight size={16} />
          </button>
          <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-700 active:scale-95 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white" onClick={() => setMonth(monthKey(new Date()))}>Hoje</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700">
        {WEEKDAYS.map(day => <div key={day} className="bg-slate-50 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">{day}</div>)}
        {cells.map((cell, index) => cell ? (
          <div key={cell.iso} className={`min-h-28 bg-white p-2 align-top dark:bg-slate-900 ${cell.iso === today ? 'ring-2 ring-inset ring-violet-400' : ''}`}>
            <div className={`mb-1 text-xs font-semibold ${cell.iso === today ? 'text-violet-600 dark:text-violet-300' : 'text-slate-500 dark:text-slate-400'}`}>{cell.day}</div>
            <div className="space-y-1">
              {cell.tasks.slice(0, 4).map(task => (
                <button key={task.id} type="button" className="block w-full truncate rounded-md bg-violet-50 px-2 py-1 text-left text-[11px] font-medium text-violet-800 transition hover:bg-violet-100 active:scale-[.99] dark:bg-violet-950/50 dark:text-violet-200" onClick={() => onOpen(task)} title={`${task.titulo} · ${STATUS_LABEL[task.status] || task.status}`}>
                  {task.titulo}
                </button>
              ))}
              {cell.tasks.length > 4 && <div className="px-1 text-[10px] text-slate-500">+{cell.tasks.length - 4} tarefas</div>}
            </div>
          </div>
        ) : <div key={`empty-${index}`} className="min-h-28 bg-slate-50 dark:bg-slate-800" />)}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">{datedTasks.length} com data</span>
        <span aria-hidden="true">·</span>
        <span>{withoutDate.length} sem data</span>
        {withoutDate.length > 0 && <span className="w-full text-[11px]">Tarefas sem prazo ficam disponíveis na visão tabela.</span>}
        {datedTasks.some(({ date }) => date < today) && <span className="w-full text-[11px]">Datas passadas continuam visíveis para preservar o histórico.</span>}
        {datedTasks.length > 0 && <span className="sr-only">Primeiro prazo exibido em {dateLabel(datedTasks[0].date)}.</span>}
      </div>
    </section>
  )
}
