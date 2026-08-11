const MANAGEMENT_ROLES = new Set(['admin', 'dev', 'gestor', 'sub_gestor'])

/** Somente criação por perfil de gestão pode habilitar ranking/pontos. */
export function creatorCanEnableTaskRanking(role: unknown): boolean {
  return MANAGEMENT_ROLES.has(String(role || '').trim().toLowerCase())
}

export function removeChecklistScoringForMember<T extends Record<string, any>>(items: T[]): T[] {
  return items.map(item => ({
    ...item,
    dificuldade: 'nivel_1',
    pontuacao: 0,
    revelar_apos_assumir: false,
  }))
}
