export const TASK_VIEW_MODES = ['lista', 'quadro', 'calendario', 'tabela', 'grafo'] as const

export type TaskViewMode = typeof TASK_VIEW_MODES[number]

export function taskViewFromSearch(search: string): TaskViewMode | null {
  const value = new URLSearchParams(search).get('view')
  return value && TASK_VIEW_MODES.includes(value as TaskViewMode)
    ? value as TaskViewMode
    : null
}
