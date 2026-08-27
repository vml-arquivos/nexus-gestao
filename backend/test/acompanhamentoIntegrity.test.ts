import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  addHistorico: vi.fn(),
  findActiveUserByEmail: vi.fn(),
  resolveIntegrationUser: vi.fn(),
}))

vi.mock('../src/db/pool', () => ({
  default: { query: mocks.query },
}))

vi.mock('../src/routes/integracoes', () => ({
  addHistorico: mocks.addHistorico,
  findActiveUserByEmail: mocks.findActiveUserByEmail,
  resolveIntegrationUser: mocks.resolveIntegrationUser,
}))

import { handleSemanaConcluida } from '../src/routes/automationHandlers/acompanhamento'

const tarefa = {
  id: 'task-1',
  org_id: 'org-1',
  criado_por: 'user-1',
  status: 'pendente',
}

describe('integridade do retry SemanaConcluida', () => {
  beforeEach(() => {
    mocks.query.mockReset()
    mocks.addHistorico.mockReset()
  })

  it('rejeita evento sem organização antes de consultar ou atualizar tarefas', async () => {
    await expect(handleSemanaConcluida({ nexus_tarefa_id: tarefa.id })).rejects.toThrow('contexto organizacional')
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('exige tarefa Destrava do workflow de acompanhamento na mesma organização', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] })
    await expect(handleSemanaConcluida({
      nexus_tarefa_id: tarefa.id,
      nexus_org_id: 'org-1',
      acompanhamento_id: 'acomp-1',
    })).rejects.toThrow('não pertence ao contexto autorizado')
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.calls[0][1]).toEqual([tarefa.id, 'org-1', 'acomp-1', ''])
  })

  it('atualiza somente a tarefa escopada e não regrava checklist ausente', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [tarefa] })
      .mockResolvedValueOnce({ rows: [] })

    await handleSemanaConcluida({
      nexus_tarefa_id: tarefa.id,
      nexus_org_id: 'org-1',
      acompanhamento_id: 'acomp-1',
      status: 'concluida',
    })

    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls[1][0]).toContain('WHERE id = $2 AND org_id = $3')
    expect(mocks.query.mock.calls[1][1]).toEqual(['concluida', tarefa.id, 'org-1'])
    expect(mocks.addHistorico).toHaveBeenCalledWith('org-1', tarefa.id, 'user-1', 'atualizada_automacao_retry', expect.any(String))
  })

  it('rejeita checklist grande antes de qualquer UPDATE', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [tarefa] })
    const checklist = [{ texto: 'x'.repeat(1_000_001) }]
    await expect(handleSemanaConcluida({
      nexus_tarefa_id: tarefa.id,
      nexus_org_id: 'org-1',
      acompanhamento_id: 'acomp-1',
      checklist,
    })).rejects.toThrow('acima de 1 MB')
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })
})
