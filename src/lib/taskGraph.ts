import type { ChecklistItem, Tarefa } from './api'

export type GraphNode = {
  id: string
  label: string
  kind: 'root' | 'item'
  done: boolean
  x: number
  y: number
  dependencies: string[]
  item?: ChecklistItem
}

export type GraphEdge = { from: GraphNode; to: GraphNode }

export function dependencyIds(item: ChecklistItem) {
  return Array.from(new Set([
    item.depende_de,
    ...(Array.isArray(item.depende_de_todos) ? item.depende_de_todos : []),
  ].map(value => String(value || '').trim()).filter(Boolean)))
}

export function withDependencies(item: ChecklistItem, dependencies: string[]): ChecklistItem {
  const unique = Array.from(new Set(dependencies.map(value => String(value || '').trim()).filter(Boolean)))
  const next = { ...item } as ChecklistItem & Record<string, unknown>
  delete next.depende_de
  delete next.depende_de_todos
  if (unique.length === 1) next.depende_de = unique[0]
  if (unique.length > 1) next.depende_de_todos = unique
  return next
}

export type TaskDependencyValidation =
  | { ok: true }
  | { ok: false; message: string }

export function validateTaskDependencies(items: ChecklistItem[]): TaskDependencyValidation {
  const ids = items.map(item => String(item.id || '').trim())
  if (new Set(ids).size !== ids.length || ids.some(id => !id)) {
    return { ok: false, message: 'Os itens do checklist precisam ter IDs únicos.' }
  }
  const idSet = new Set(ids)
  const dependencies = new Map<string, string[]>()
  for (const item of items) {
    const itemId = String(item.id).trim()
    const deps = dependencyIds(item)
    if (deps.some(dep => !idSet.has(dep))) {
      return { ok: false, message: 'Toda dependência deve apontar para outro item da mesma lista.' }
    }
    if (deps.includes(itemId)) {
      return { ok: false, message: 'Um item não pode depender de si mesmo.' }
    }
    dependencies.set(itemId, deps)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false
    if (visited.has(id)) return true
    visiting.add(id)
    for (const dependency of dependencies.get(id) || []) {
      if (!visit(dependency)) return false
    }
    visiting.delete(id)
    visited.add(id)
    return true
  }
  for (const id of ids) {
    if (!visit(id)) return { ok: false, message: 'Dependências cíclicas não são permitidas.' }
  }
  return { ok: true }
}

export function buildTaskGraph(task: Tarefa): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
  const items = Array.isArray(task.checklist) ? task.checklist : []
  const itemById = new Map(items.map(item => [String(item.id), item]))
  const levelMemo = new Map<string, number>()

  const levelOf = (id: string, visiting = new Set<string>()): number => {
    if (levelMemo.has(id)) return levelMemo.get(id) || 0
    if (visiting.has(id)) return 0
    const item = itemById.get(id)
    if (!item) return 0
    const nextVisiting = new Set(visiting)
    nextVisiting.add(id)
    const level = Math.min(4, Math.max(0, ...dependencyIds(item)
      .filter(dep => itemById.has(dep))
      .map(dep => levelOf(dep, nextVisiting) + 1)))
    levelMemo.set(id, level)
    return level
  }

  const grouped = new Map<number, ChecklistItem[]>()
  items.forEach(item => {
    const level = levelOf(String(item.id))
    const bucket = grouped.get(level) || []
    bucket.push(item)
    grouped.set(level, bucket)
  })

  // Mantém as dependências em níveis horizontais e distribui cada nível em
  // uma grade balanceada. Até quatro itens ficam na mesma linha, evitando o
  // empilhamento vertical que tornava listas curtas difíceis de ler; níveis
  // maiores usam no máximo cinco linhas e expandem horizontalmente no canvas.
  const maxRowsPerLevel = 5
  const nodeWidth = 224
  const columnStep = 248
  const rowStep = 118
  const rowsForLevel = (count: number) => count <= 4 ? 1 : Math.min(maxRowsPerLevel, Math.ceil(Math.sqrt(count)))
  const levelStarts = new Map<number, number>()
  const levelRows = new Map<number, number>()
  let nextLevelX = 280
  Array.from(grouped.keys()).sort((a, b) => a - b).forEach(level => {
    const count = grouped.get(level)?.length || 0
    const rowCount = rowsForLevel(count)
    levelStarts.set(level, nextLevelX)
    levelRows.set(level, rowCount)
    const columnCount = Math.max(1, Math.ceil(count / rowCount))
    nextLevelX += columnCount * columnStep + 24
  })

  const root: GraphNode = {
    id: `task:${task.id}`,
    label: task.titulo,
    kind: 'root',
    done: ['concluida', 'aprovada'].includes(String(task.status)),
    x: 24,
    y: 24,
    dependencies: [],
  }
  const nodes: GraphNode[] = [root]
  Array.from(grouped.keys()).sort((a, b) => a - b).forEach(level => {
    ;(grouped.get(level) || []).forEach((item, index) => {
      const rowCount = levelRows.get(level) || 1
      const column = Math.floor(index / rowCount)
      const row = index % rowCount
      nodes.push({
        id: String(item.id),
        label: item.texto,
        kind: 'item',
        done: Boolean(item.feito),
        x: (levelStarts.get(level) || 280) + column * columnStep,
        y: 24 + row * rowStep,
        dependencies: dependencyIds(item),
        item,
      })
    })
  })

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const edges = nodes.flatMap(to => to.kind === 'item'
    ? to.dependencies.map(id => {
      const from = nodeById.get(id)
      return from ? { from, to } : null
    }).filter(Boolean) as GraphEdge[]
    : [])
  const maxX = Math.max(760, ...nodes.map(node => node.x + nodeWidth + 24))
  const maxY = Math.max(220, ...nodes.map(node => node.y + 104 + 24))
  return { nodes, edges, width: maxX, height: maxY }
}
