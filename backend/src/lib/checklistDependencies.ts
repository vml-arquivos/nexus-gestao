export type DependencyChecklistItem = {
  id?: unknown
  depende_de?: unknown
  depende_de_todos?: unknown
}

export type DependencyValidation =
  | { ok: true }
  | {
      ok: false
      reason: 'duplicate_item_id' | 'invalid_reference' | 'self_dependency' | 'cycle'
      itemId?: string
      dependencyId?: string
    }

export function dependencyIds(item: DependencyChecklistItem): string[] {
  return Array.from(new Set([
    item.depende_de,
    ...(Array.isArray(item.depende_de_todos) ? item.depende_de_todos : []),
  ].map(value => String(value || '').trim()).filter(Boolean)))
}

export function validateChecklistDependencies(items: DependencyChecklistItem[]): DependencyValidation {
  const ids = items.map(item => String(item.id || '').trim()).filter(Boolean)
  const idSet = new Set(ids)
  if (idSet.size !== ids.length) {
    return { ok: false, reason: 'duplicate_item_id' }
  }

  const dependencies = new Map<string, string[]>()
  for (const item of items) {
    const itemId = String(item.id || '').trim()
    if (!itemId) continue
    const deps = dependencyIds(item)
    for (const dependencyId of deps) {
      if (!idSet.has(dependencyId)) {
        return { ok: false, reason: 'invalid_reference', itemId, dependencyId }
      }
      if (dependencyId === itemId) {
        return { ok: false, reason: 'self_dependency', itemId, dependencyId }
      }
    }
    dependencies.set(itemId, deps)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (itemId: string): DependencyValidation => {
    if (visiting.has(itemId)) return { ok: false, reason: 'cycle', itemId }
    if (visited.has(itemId)) return { ok: true }
    visiting.add(itemId)
    for (const dependencyId of dependencies.get(itemId) || []) {
      const result = visit(dependencyId)
      if (!result.ok) return result
    }
    visiting.delete(itemId)
    visited.add(itemId)
    return { ok: true }
  }

  for (const itemId of dependencies.keys()) {
    const result = visit(itemId)
    if (!result.ok) return result
  }
  return { ok: true }
}
