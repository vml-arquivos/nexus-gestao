import { describe, expect, it } from 'vitest'
import { creatorCanEnableTaskRanking, removeChecklistScoringForMember } from '../src/lib/taskCreationPolicy'

describe('política de criação e execução de tarefas', () => {
  it('habilita ranking somente para perfis de gestão', () => {
    expect(creatorCanEnableTaskRanking('gestor')).toBe(true)
    expect(creatorCanEnableTaskRanking('admin')).toBe(true)
    expect(creatorCanEnableTaskRanking('sub_gestor')).toBe(true)
    expect(creatorCanEnableTaskRanking('membro')).toBe(false)
  })

  it('remove pontuação indicada por membro inclusive no checklist', () => {
    expect(removeChecklistScoringForMember([{ texto: 'Executar', pontuacao: 20, dificuldade: 'nivel_5', revelar_apos_assumir: true }]))
      .toEqual([{ texto: 'Executar', pontuacao: 0, dificuldade: 'nivel_1', revelar_apos_assumir: false }])
  })
})
