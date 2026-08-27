import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Circle, GitBranch, Loader2, Plus, X } from 'lucide-react'
import { tarefasApi, type ChecklistItem, type MembroEquipe, type Tarefa } from '../lib/api'
import { buildTaskGraph, dependencyIds, validateTaskDependencies, withDependencies } from '../lib/taskGraph'

type Props = {
  tasks: Tarefa[]
  members: MembroEquipe[]
  onOpen: (task: Tarefa) => void
  onTaskUpdated: (task: Tarefa) => void
  onTaskCreated: (task: Tarefa) => void
  focusTaskId?: string
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

function createNodeId() {
  return globalThis.crypto?.randomUUID?.() || `graph-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function TaskGraphView({ tasks, members, onOpen, onTaskUpdated, onTaskCreated, focusTaskId }: Props) {
  const graphTasks = useMemo(() => tasks.filter(task => Array.isArray(task.checklist) && task.checklist.length > 0), [tasks])
  const [selectedTaskId, setSelectedTaskId] = useState(() => graphTasks[0]?.id || tasks[0]?.id || '')
  const appliedFocusRef = useRef<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [looseNodeOpen, setLooseNodeOpen] = useState(false)
  const [looseLabel, setLooseLabel] = useState('')
  const [looseKind, setLooseKind] = useState<'checklist' | 'task'>('checklist')
  const [looseDue, setLooseDue] = useState('')
  const [looseMember, setLooseMember] = useState('')

  useEffect(() => {
    if (focusTaskId && appliedFocusRef.current !== focusTaskId) {
      if (tasks.some(task => task.id === focusTaskId)) {
        setSelectedTaskId(focusTaskId)
        appliedFocusRef.current = focusTaskId
        setConnectingFrom(null)
        clearMessages()
        return
      }
    }
    if (!focusTaskId) appliedFocusRef.current = null
    if (selectedTaskId && tasks.some(task => task.id === selectedTaskId)) return
    setSelectedTaskId(graphTasks[0]?.id || tasks[0]?.id || '')
  }, [focusTaskId, graphTasks, selectedTaskId, tasks])

  const selectedTask = tasks.find(task => task.id === selectedTaskId) || null
  const graph = selectedTask ? buildTaskGraph(selectedTask) : null

  function clearMessages() {
    setFeedback('')
    setError('')
  }

  async function saveChecklist(nextChecklist: ChecklistItem[], message: string) {
    if (!selectedTask || saving) return
    const dependencyValidation = validateTaskDependencies(nextChecklist)
    if (!dependencyValidation.ok) {
      setError(dependencyValidation.message)
      setConnectingFrom(null)
      return
    }
    clearMessages()
    setSaving(true)
    try {
      const updated = await tarefasApi.update(selectedTask.id, { checklist: nextChecklist })
      onTaskUpdated(updated)
      setConnectingFrom(null)
      setFeedback(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a dependência.')
    } finally {
      setSaving(false)
    }
  }

  async function connectDependency(sourceId: string, targetId: string) {
    if (!selectedTask || sourceId === targetId || sourceId.startsWith('task:') || targetId.startsWith('task:')) return
    const items = Array.isArray(selectedTask.checklist) ? selectedTask.checklist : []
    const target = items.find(item => String(item.id) === targetId)
    if (!target) return
    const existing = dependencyIds(target)
    if (existing.includes(sourceId)) {
      setError('Essa dependência já existe.')
      setConnectingFrom(null)
      return
    }
    await saveChecklist(items.map(item => String(item.id) === targetId
      ? withDependencies(item, [...existing, sourceId])
      : item), 'Dependência criada e validada pelo Nexus.')
  }

  async function removeDependency(targetId: string, dependencyId: string) {
    if (!selectedTask) return
    const items = Array.isArray(selectedTask.checklist) ? selectedTask.checklist : []
    const target = items.find(item => String(item.id) === targetId)
    if (!target) return
    await saveChecklist(items.map(item => String(item.id) === targetId
      ? withDependencies(item, dependencyIds(item).filter(id => id !== dependencyId))
      : item), 'Dependência removida.')
  }

  async function convertLooseNode() {
    const label = looseLabel.trim()
    if (!label || !selectedTask || saving) return
    clearMessages()
    setSaving(true)
    try {
      if (looseKind === 'checklist') {
        const item: ChecklistItem = {
          id: createNodeId(),
          texto: label,
          feito: false,
          data: looseDue || undefined,
          responsavel_id: looseMember || undefined,
          responsavel_nome: members.find(member => member.id === looseMember)?.nome,
        }
        const updated = await tarefasApi.update(selectedTask.id, {
          checklist: [...(selectedTask.checklist || []), item],
        })
        onTaskUpdated(updated)
        setFeedback('Nó convertido em item de checklist da tarefa selecionada.')
      } else {
        const created = await tarefasApi.create({
          titulo: label,
          descricao: `Criada a partir do mapa mental de “${selectedTask.titulo}”.`,
          prazo: looseDue || undefined,
          responsavel_id: looseMember || undefined,
          prioridade: 'media',
          checklist: [],
        })
        onTaskCreated(created)
        setFeedback('Nó convertido em uma nova tarefa real.')
      }
      setLooseLabel('')
      setLooseDue('')
      setLooseMember('')
      setLooseNodeOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível converter o nó.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Mapa mental de tarefas">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <GitBranch size={18} aria-hidden="true" />
            Mapa mental e dependências
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
            A visualização lê exclusivamente `tarefas.checklist` JSONB. As conexões são dependências reais e o backend continua sendo a fonte de validação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tasks.length > 0 && <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            Tarefa
            <select className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" value={selectedTaskId} onChange={event => { setSelectedTaskId(event.target.value); clearMessages(); setConnectingFrom(null) }}>
              {tasks.map(task => <option key={task.id} value={task.id}>{task.titulo}</option>)}
            </select>
          </label>}
          <button type="button" className={`rounded-lg px-3 py-2 text-xs font-medium transition active:scale-95 ${editMode ? 'bg-violet-600 text-white hover:bg-violet-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`} onClick={() => { setEditMode(value => !value); setConnectingFrom(null); clearMessages() }}>
            {editMode ? 'Concluído' : 'Editar conexões'}
          </button>
          {selectedTask && <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => onOpen(selectedTask)}>Abrir tarefa</button>}
        </div>
      </div>

      {editMode && <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200">
        Arraste o conector circular de um item para outro para criar uma dependência. Use o botão × sobre uma conexão para removê-la. A gravação passa pelo PATCH oficial da tarefa.
      </div>}

      {feedback && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" role="status">{feedback}</div>}
      {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" role="alert">{error}</div>}

      {!selectedTask ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Nenhuma tarefa disponível para o grafo.</div>
      ) : !graph || graph.nodes.length === 1 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
          <GitBranch className="mx-auto mb-2 text-slate-400" size={24} />
          <strong className="block text-sm text-slate-700 dark:text-slate-200">Esta tarefa ainda não tem itens de checklist.</strong>
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Crie um nó solto abaixo e converta-o em item ou tarefa real.</span>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40" style={{ maxHeight: 620 }}>
          <div className="relative" style={{ minWidth: graph.width, minHeight: graph.height }}>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" width={graph.width} height={graph.height} aria-hidden="true">
              <defs>
                <marker id="nexus-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#8b5cf6" />
                </marker>
              </defs>
              {graph.edges.map(edge => <line key={`${edge.from.id}-${edge.to.id}`} x1={edge.from.x + 224} y1={edge.from.y + 52} x2={edge.to.x} y2={edge.to.y + 52} stroke="#8b5cf6" strokeWidth="2" strokeDasharray={edge.to.done ? undefined : '6 4'} markerEnd="url(#nexus-graph-arrow)" />)}
            </svg>

            {editMode && graph.edges.map(edge => {
              const left = ((edge.from.x + 224) + edge.to.x) / 2
              const top = (edge.from.y + edge.to.y) / 2 + 44
              return <button key={`remove-${edge.from.id}-${edge.to.id}`} type="button" className="absolute z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[11px] font-bold text-rose-600 shadow ring-1 ring-rose-200 hover:bg-rose-50 dark:bg-slate-900 dark:ring-rose-900" style={{ left, top }} onClick={() => removeDependency(edge.to.id, edge.from.id)} title={`Remover dependência de ${edge.from.label}`}>×</button>
            })}

            {graph.nodes.map(node => <div key={node.id} className={`absolute z-10 w-56 rounded-xl border p-3 shadow-sm transition ${node.kind === 'root' ? 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40' : node.done ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`} style={{ left: node.x, top: node.y }} onDragOver={event => { if (editMode && node.kind === 'item') event.preventDefault() }} onDrop={event => { event.preventDefault(); if (editMode && node.kind === 'item' && connectingFrom) void connectDependency(connectingFrom, node.id) }}>
              <div className="flex items-start gap-2">
                {node.done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Concluído" /> : <Circle size={16} className="mt-0.5 shrink-0 text-slate-400" aria-label="Pendente" />}
                <div className="min-w-0 flex-1">
                  <div className="break-words text-xs font-semibold text-slate-800 dark:text-slate-100">{node.label}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{node.kind === 'root' ? STATUS_LABEL[selectedTask.status] || selectedTask.status : node.done ? 'Concluído' : 'Pendente'}</div>
                </div>
                {editMode && node.kind === 'item' && <button type="button" draggable onDragStart={event => { setConnectingFrom(node.id); event.dataTransfer.effectAllowed = 'link'; event.dataTransfer.setData('text/plain', node.id) }} onClick={() => setConnectingFrom(current => current === node.id ? null : node.id)} className={`h-6 w-6 shrink-0 cursor-grab rounded-full text-xs font-bold text-white shadow active:cursor-grabbing ${connectingFrom === node.id ? 'bg-violet-700 ring-2 ring-violet-300' : 'bg-violet-500 hover:bg-violet-600'}`} title="Arrastar para criar dependência">↗</button>}
              </div>
              {node.kind === 'item' && node.dependencies.length > 0 && <div className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">Depende de {node.dependencies.length} item(ns)</div>}
            </div>)}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>{graph?.nodes.length ? `${graph.nodes.length - 1} item(ns) e ${graph.edges.length} dependência(s)` : 'Grafo vazio'}</span>
        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 font-medium text-white transition hover:bg-slate-700 active:scale-95 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white" onClick={() => { setLooseNodeOpen(value => !value); clearMessages() }} disabled={!selectedTask}><Plus size={14} /> Nó solto</button>
      </div>

      {looseNodeOpen && selectedTask && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
        <div className="mb-2 flex items-center justify-between"><strong className="text-xs text-slate-800 dark:text-slate-100">Converter nó em dado real</strong><button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setLooseNodeOpen(false)} aria-label="Fechar"><X size={15} /></button></div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_210px_auto]">
          <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none ring-violet-300 focus:ring-2 dark:border-slate-700 dark:bg-slate-900" value={looseLabel} onChange={event => setLooseLabel(event.target.value)} placeholder="Nome do novo nó" />
          <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" value={looseKind} onChange={event => setLooseKind(event.target.value as 'checklist' | 'task')}><option value="checklist">Item de checklist</option><option value="task">Tarefa real</option></select>
          <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" type="date" value={looseDue} onChange={event => setLooseDue(event.target.value)} aria-label="Prazo do novo nó" />
          <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" value={looseMember} onChange={event => setLooseMember(event.target.value)}><option value="">Sem responsável</option>{members.filter(member => member.ativo !== false).map(member => <option key={member.id} value={member.id}>{member.nome}</option>)}</select>
          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void convertLooseNode()} disabled={!looseLabel.trim() || saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Converter</button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">O item usa o checklist da tarefa selecionada; a tarefa usa o endpoint oficial de criação. Responsável e prazo são opcionais e revisáveis antes do envio.</p>
      </div>}

      {selectedTask && <div className="mt-4 rounded-xl border border-slate-200 px-3 py-3 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><span><strong className="text-slate-700 dark:text-slate-200">Fonte:</strong> tarefas.checklist JSONB</span><span><strong className="text-slate-700 dark:text-slate-200">Projeto:</strong> {selectedTask.projeto_grupo_id ? `grupo ${selectedTask.projeto_grupo_id.slice(0, 8)}` : 'sem grupo visível'}</span><span><strong className="text-slate-700 dark:text-slate-200">Histórico:</strong> preservado pelo PATCH oficial</span></div>
      </div>}
    </section>
  )
}

export default TaskGraphView
