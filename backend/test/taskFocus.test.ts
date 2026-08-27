import { describe, expect, it } from 'vitest'
import type { Tarefa, UserProfile } from '../../src/lib/api'
import { buildFocusTasks, daysBetweenIso, userCanActOnTask } from '../../src/lib/taskFocus'
import { taskViewFromSearch } from '../../src/lib/taskView'

const member: UserProfile = { id: 'member-1', nome: 'Membro', email: 'membro@nexus.test', role: 'membro', orgId: 'org-1' }
const manager: UserProfile = { id: 'manager-1', nome: 'Gestor', email: 'gestor@nexus.test', role: 'gestor', orgId: 'org-1' }

function task(overrides: Partial<Tarefa>): Tarefa {
  return {
    id: 'task-1', org_id: 'org-1', criado_por: manager.id, titulo: 'Tarefa', prioridade: 'media',
    status: 'pendente', escopo: 'equipe', created_at: '2026-08-01T10:00:00.000Z', ...overrides,
  }
}

describe('Meu Dia — foco sem alterar permissões', () => {
  it('mantém cálculo de datas imune a timezone', () => {
    expect(daysBetweenIso('2026-08-11', '2026-08-11')).toBe(0)
    expect(daysBetweenIso('2026-08-11', '2026-08-10')).toBe(-1)
    expect(daysBetweenIso('2026-08-11', '2026-08-14')).toBe(3)
  })

  it('membro recebe somente execução atribuída a ele', () => {
    expect(userCanActOnTask(task({ responsavel_id: member.id }), member)).toBe(true)
    expect(userCanActOnTask(task({ responsavel_id: 'other-member' }), member)).toBe(false)
  })

  it('gestor acompanha entrega para aprovação, mas não executa tarefa da equipe', () => {
    expect(userCanActOnTask(task({ status: 'concluida', responsavel_id: member.id }), manager)).toBe(true)
    expect(userCanActOnTask(task({ status: 'em_progresso', responsavel_id: member.id }), manager)).toBe(false)
  })

  it('não oferece entrega aguardando aprovação novamente ao executor', () => {
    expect(userCanActOnTask(task({ status: 'concluida', responsavel_id: member.id }), member)).toBe(false)
  })

  it('interpreta todos os modos válidos da URL e rejeita valores desconhecidos', () => {
    expect(taskViewFromSearch('?view=lista')).toBe('lista')
    expect(taskViewFromSearch('?view=quadro')).toBe('quadro')
    expect(taskViewFromSearch('?view=calendario')).toBe('calendario')
    expect(taskViewFromSearch('?view=tabela')).toBe('tabela')
    expect(taskViewFromSearch('?view=grafo&graphTask=task-1')).toBe('grafo')
    expect(taskViewFromSearch('?view=desconhecido')).toBeNull()
    expect(taskViewFromSearch('')).toBeNull()
  })

  it('prioriza devolução, aprovação, atraso e vencimento do dia nessa ordem', () => {
    const ranked = buildFocusTasks([
      task({ id: 'today', responsavel_id: member.id, prazo: '2026-08-11' }),
      task({ id: 'late', responsavel_id: member.id, prazo: '2026-08-10' }),
      task({ id: 'returned', responsavel_id: member.id, status: 'devolvida', prazo: '2026-08-15' }),
    ], member, '2026-08-11')
    expect(ranked.map(item => item.task.id)).toEqual(['returned', 'late', 'today'])

    const reviews = buildFocusTasks([
      task({ id: 'review', responsavel_id: member.id, status: 'concluida' }),
      task({ id: 'team-work', responsavel_id: member.id, status: 'em_progresso' }),
    ], manager, '2026-08-11')
    expect(reviews.map(item => item.task.id)).toEqual(['review'])
  })
})
