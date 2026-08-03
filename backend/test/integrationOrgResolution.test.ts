import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../src/db/pool', () => ({
  default: { connect: vi.fn() },
  query: mocks.query,
  queryOne: mocks.queryOne,
}))

import { resolveIntegrationUser } from '../src/routes/integracoes'

const gestor = {
  id: 'user-1',
  org_id: 'org-1',
  nome: 'Gestor Nexus',
  email: 'gestor@nexus.local',
  role: 'gestor',
}

describe('resolução da organização Destrava já integrada', () => {
  beforeEach(() => {
    delete process.env.NEXUS_DESTRAVA_ORG_ID
    delete process.env.NEXUS_DESTRAVA_DEFAULT_USER_ID
    delete process.env.NEXUS_DESTRAVA_DEFAULT_USER_EMAIL
    mocks.query.mockReset()
    mocks.queryOne.mockReset()
  })

  it('reutiliza o vínculo inequívoco do mesmo cliente sem exigir variável nova', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM nexus_external_links') && sql.includes('external_id = $1')) {
        return [{ org_id: 'org-1' }]
      }
      return []
    })
    mocks.queryOne.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('WHERE org_id = $1') && params?.[0] === 'org-1') return gestor
      return null
    })

    await expect(resolveIntegrationUser({ externalId: 'cliente-destrava-1' })).resolves.toEqual(gestor)
  })

  it('não escolhe uma organização quando os vínculos existentes são conflitantes', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM nexus_external_links') && sql.includes('external_id = $1')) {
        return [{ org_id: 'org-1' }]
      }
      if (sql.includes('FROM tarefas') && sql.includes('origem_id = $1')) {
        return [{ org_id: 'org-2' }]
      }
      return []
    })
    mocks.queryOne.mockResolvedValue(null)

    await expect(resolveIntegrationUser({ externalId: 'cliente-ambiguo' })).resolves.toBeNull()
  })
})
