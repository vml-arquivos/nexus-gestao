import { describe, expect, it } from 'vitest'
import { normalizeChecklistItems } from '../src/routes/integracoes'

describe('checklist integrado — identidade por item', () => {
  it('preserva texto igual quando membro ou data são diferentes', () => {
    const result = normalizeChecklistItems([
      { id: 'item-1', texto: 'Conferir documento', data: '2026-08-10', responsavel_email: 'ana@example.com' },
      { id: 'item-2', texto: 'Conferir documento', data: '2026-08-11', responsavel_email: 'bruno@example.com' },
    ])
    expect(result).toHaveLength(2)
    expect(result.map(item => item.data)).toEqual(['2026-08-10', '2026-08-11'])
    expect(result.map(item => item.responsavel_email)).toEqual(['ana@example.com', 'bruno@example.com'])
  })

  it('remove somente repetição do mesmo ID de item', () => {
    const result = normalizeChecklistItems([
      { id: 'same-id', texto: 'Ação', data: '2026-08-10' },
      { id: 'same-id', texto: 'Ação repetida no retry', data: '2026-08-10' },
    ])
    expect(result).toHaveLength(1)
  })
})
