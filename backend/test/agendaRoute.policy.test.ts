import { describe, expect, it } from 'vitest'
import { shouldAutoSyncAgenda } from '../src/routes/agendaPolicy'

describe('política de sincronização da agenda', () => {
  it('não executa sincronização pesada numa listagem comum', () => {
    expect(shouldAutoSyncAgenda(undefined)).toBe(false)
    expect(shouldAutoSyncAgenda('false')).toBe(false)
    expect(shouldAutoSyncAgenda('1')).toBe(false)
  })

  it('mantém compatibilidade quando a sincronização é explicitamente solicitada', () => {
    expect(shouldAutoSyncAgenda('true')).toBe(true)
  })
})
