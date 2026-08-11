import { describe, expect, it } from 'vitest'
import type { MembroEquipe, Tarefa } from '../../src/lib/api'
import { buildMemberCapacity, capacityLevel, managementSummary, taskExecutorIds } from '../../src/lib/managementInsights'

const members: MembroEquipe[] = [
  { id: 'a', nome: 'Ana', email: 'a@nexus.test', role: 'membro', ativo: true, tarefas_pendentes: 0, tarefas_concluidas: 0, created_at: '2026-01-01' },
  { id: 'b', nome: 'Bruno', email: 'b@nexus.test', role: 'membro', ativo: true, tarefas_pendentes: 0, tarefas_concluidas: 0, created_at: '2026-01-01' },
]

function task(overrides: Partial<Tarefa>): Tarefa {
  return { id: 't', org_id: 'o', criado_por: 'g', titulo: 'Tarefa', prioridade: 'media', status: 'pendente', escopo: 'equipe', created_at: '2026-08-01', ...overrides }
}

describe('Central de Gestão — indicadores somente leitura', () => {
  it('identifica executores da lista e do checklist sem duplicar', () => {
    const ids = taskExecutorIds(task({ responsavel_id: 'a', checklist: [{ id: 'i', texto: 'Item', feito: false, responsavel_id: 'b' }] }))
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('não conta tarefas aprovadas, canceladas ou entregues como carga ativa', () => {
    const capacity = buildMemberCapacity([
      task({ id: 'open', responsavel_id: 'a' }),
      task({ id: 'approved', responsavel_id: 'a', status: 'aprovada' }),
      task({ id: 'review', responsavel_id: 'a', status: 'concluida' }),
    ], members, '2026-08-11')
    expect(capacity.find(item => item.member.id === 'a')?.active).toBe(1)
  })

  it('consolida aprovações, atrasos e devoluções corretamente', () => {
    const summary = managementSummary([
      task({ id: 'review', status: 'concluida' }),
      task({ id: 'late', prazo: '2026-08-10' }),
      task({ id: 'returned', status: 'devolvida', prazo: '2026-08-15' }),
      task({ id: 'done', status: 'aprovada', prazo: '2026-08-01' }),
    ], '2026-08-11')
    expect(summary.approvals).toBe(1)
    expect(summary.overdue).toBe(1)
    expect(summary.returned).toBe(1)
  })

  it('classifica atenção operacional por faixas estáveis', () => {
    expect(capacityLevel(2)).toBe('disponivel')
    expect(capacityLevel(5)).toBe('equilibrada')
    expect(capacityLevel(10)).toBe('elevada')
    expect(capacityLevel(15)).toBe('critica')
  })
})
