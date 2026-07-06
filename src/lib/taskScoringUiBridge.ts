type TaskLike = {
  id?: string
  titulo?: string
  responsavel_id?: string | null
  aceita_por?: string | null
  checklist?: unknown
}

type ChecklistLike = {
  responsavel_id?: string
  assumido_por?: string
  executor_id?: string
  aceita_por?: string
  concluido_por?: string
  feito_por?: string
  feito?: boolean
}

const taskCache = new Map<string, TaskLike>()
let activeTaskId = ''
let installed = false

function checklistItems(value: unknown): ChecklistLike[] {
  if (Array.isArray(value)) return value as ChecklistLike[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      if (Array.isArray(parsed?.items)) return parsed.items
      if (Array.isArray(parsed?.checklist)) return parsed.checklist
    } catch {
      return []
    }
  }
  if (value && typeof value === 'object') {
    const parsed = value as any
    if (Array.isArray(parsed.items)) return parsed.items
    if (Array.isArray(parsed.checklist)) return parsed.checklist
  }
  return []
}

function itemExecutor(item: ChecklistLike, task: TaskLike) {
  const assigned = item.responsavel_id || item.assumido_por || item.executor_id || item.aceita_por
  if (item.feito) return item.concluido_por || item.feito_por || assigned || task.aceita_por || task.responsavel_id || ''
  return assigned || item.concluido_por || item.feito_por || task.aceita_por || task.responsavel_id || ''
}

function isMultiExecutor(task: TaskLike) {
  const ids = new Set<string>()
  const items = checklistItems(task.checklist)
  if (items.length) {
    items.forEach(item => {
      const id = itemExecutor(item, task)
      if (id) ids.add(id)
    })
  } else {
    const id = task.aceita_por || task.responsavel_id
    if (id) ids.add(id)
  }
  return ids.size > 1
}

function rememberTask(task: TaskLike | null | undefined, makeActive = false) {
  if (!task?.id) return
  taskCache.set(task.id, task)
  if (makeActive) activeTaskId = task.id
  scheduleUiSync()
}

function rememberPayload(payload: any, makeActive = false) {
  if (Array.isArray(payload?.tarefas)) payload.tarefas.forEach((task: TaskLike) => rememberTask(task))
  if (payload?.tarefa) rememberTask(payload.tarefa, makeActive)
}

function currentModalTask(modal: Element): TaskLike | undefined {
  if (activeTaskId && taskCache.has(activeTaskId)) return taskCache.get(activeTaskId)
  const title = modal.querySelector('h2')?.textContent?.trim()
  if (!title) return undefined
  const matches = Array.from(taskCache.values()).filter(task => task.titulo?.trim() === title)
  return matches.length === 1 ? matches[0] : undefined
}

function applyScoringRuleToModal() {
  const modal = document.querySelector('.task-detail-modal')
  if (!modal) return
  const task = currentModalTask(modal)
  if (!task) return

  const multi = isMultiExecutor(task)
  modal.setAttribute('data-scoring-mode', multi ? 'items' : 'list')

  const actionButtons = Array.from(modal.querySelectorAll<HTMLButtonElement>('button'))
    .filter(button => ['Aprovar parte', 'Devolver'].includes(button.textContent?.trim() || ''))
  actionButtons.forEach(button => {
    button.style.display = multi ? '' : 'none'
  })

  modal.querySelectorAll<HTMLElement>('.task-check-points').forEach(label => {
    if (!multi) {
      if (!label.dataset.originalText) label.dataset.originalText = label.textContent || ''
      label.textContent = 'Pontuação somente na aprovação final da lista'
    } else if (label.dataset.originalText) {
      label.textContent = label.dataset.originalText
    }
  })

  let note = modal.querySelector<HTMLElement>('[data-scoring-rule-note]')
  if (!note) {
    note = document.createElement('div')
    note.setAttribute('data-scoring-rule-note', 'true')
    note.className = 'team-ranking-note'
    const firstSection = modal.querySelector('.task-detail-section')
    if (firstSection?.parentElement) firstSection.parentElement.insertBefore(note, firstSection)
  }
  note.textContent = multi
    ? 'Lista com vários executores: cada parte aprovada libera imediatamente os pontos do respectivo executor no ranking.'
    : 'Lista com um único executor: os itens não pontuam separadamente; a pontuação é liberada uma única vez na aprovação final da lista.'
}

let syncTimer: number | undefined
function scheduleUiSync() {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(applyScoringRuleToModal, 20)
}

function closeTaskModalAfterApproval() {
  window.setTimeout(() => {
    const detail = document.querySelector('.task-detail-modal')
    const dialog = detail?.closest('.modal-box, [role="dialog"]')
    const closeButton = dialog?.querySelector<HTMLButtonElement>('.modal-close')
    closeButton?.click()
    window.dispatchEvent(new CustomEvent('nexus:task-ranking-changed'))
  }, 40)
}

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const body = typeof init?.body === 'string' ? init.body : ''
  return { url: new URL(url, window.location.origin), method, body }
}

export function installTaskScoringUiBridge() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const info = requestInfo(input, init)
    const response = await originalFetch(input, init)
    const isTaskApi = info.url.pathname.startsWith('/api/tarefas')

    if (response.ok && isTaskApi) {
      void response.clone().json().then(payload => {
        const isExactTask = /^\/api\/tarefas\/[0-9a-f-]+$/i.test(info.url.pathname)
        rememberPayload(payload, isExactTask)
      }).catch(() => undefined)
    }

    const reviewMatch = info.url.pathname.match(/^\/api\/tarefas\/([0-9a-f-]+)\/checklist\/[^/]+\/revisao$/i)
    if (response.ok && info.method === 'PATCH' && reviewMatch) {
      activeTaskId = reviewMatch[1]
      let decision = ''
      try { decision = String(JSON.parse(info.body || '{}')?.decisao || '') } catch { decision = '' }
      if (decision === 'aprovar') closeTaskModalAfterApproval()
    }

    return response
  }

  const observer = new MutationObserver(scheduleUiSync)
  window.addEventListener('load', () => {
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleUiSync()
  })
}
