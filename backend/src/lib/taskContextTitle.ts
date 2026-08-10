export type TaskContextType = 'empresa' | 'pessoa_fisica' | 'escritorio' | 'pessoal'

/**
 * Título canônico para contextos vinculados. Escritório e Pessoal continuam
 * aceitando título manual; o retorno nesses casos é apenas o padrão inicial.
 */
export function automaticTaskListTitle(context: TaskContextType, entityName?: unknown): string {
  const name = String(entityName || '').trim()
  if (context === 'empresa') return name ? `Tarefa para empresa — ${name}` : 'Tarefa para empresa'
  if (context === 'pessoa_fisica') return name ? `Tarefa para Cliente PF — ${name}` : 'Tarefa para Cliente PF'
  if (context === 'escritorio') return 'Escritório'
  return 'Pessoal'
}

export function resolveTaskListTitle(input: {
  context: TaskContextType
  entityName?: unknown
  requestedTitle?: unknown
}): string {
  const requested = String(input.requestedTitle || '').trim()
  if ((input.context === 'empresa' || input.context === 'pessoa_fisica') && String(input.entityName || '').trim()) {
    return automaticTaskListTitle(input.context, input.entityName)
  }
  return requested || automaticTaskListTitle(input.context, input.entityName)
}
