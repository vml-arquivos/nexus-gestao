import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { queryMock, sendPushMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  sendPushMock: vi.fn(),
}))

vi.mock('../src/db/pool', () => ({
  default: { waitingCount: 0 },
  query: queryMock,
}))

vi.mock('../src/services/pushService', () => ({
  sendPushToUser: sendPushMock,
}))

vi.mock('../src/lib/clusterJob', () => ({
  runClusterSingletonJob: vi.fn(async (_name: string, job: () => Promise<void>) => job()),
}))

import {
  criarOuAtualizarNotificacaoRecorrente,
  resolverNotificacoesRecorrentesPorReferencia,
  CHAVE_RECORRENCIA_TAREFA_PRAZO,
} from '../src/lib/notifHelper'

const repoRoot = path.resolve(__dirname, '..', '..')
const readSource = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const baseOptions = {
  orgId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  tipo: 'tarefa_prazo_hoje',
  titulo: 'Tarefa vence hoje',
  body: 'A tarefa ainda está pendente.',
  referenciaId: '00000000-0000-4000-8000-000000000003',
  referenciaTipo: 'tarefa',
} as const

describe('lifecycle de notificações recorrentes', () => {
  beforeEach(() => {
    queryMock.mockReset()
    sendPushMock.mockReset()
    sendPushMock.mockResolvedValue(undefined)
  })

  it('cria a primeira linha recorrente com a chave estável e envia um único push', async () => {
    queryMock.mockResolvedValueOnce([{
      id: 'notif-1',
      ocorrencias: 1,
      lida: false,
      recorrente: true,
      ativa: true,
    }])

    await criarOuAtualizarNotificacaoRecorrente(baseOptions)

    const [sql, params] = queryMock.mock.calls[0]
    expect(sql).toContain('recorrente, ativa, chave_recorrencia')
    expect(sql).toContain('ON CONFLICT (org_id, user_id, referencia_id, chave_recorrencia)')
    expect(sql).toContain('WHERE recorrente = TRUE')
    expect(sql).not.toContain('WHERE lida = FALSE')
    expect(params).toEqual([
      baseOptions.orgId,
      baseOptions.userId,
      baseOptions.tipo,
      baseOptions.titulo,
      baseOptions.body,
      baseOptions.referenciaId,
      baseOptions.referenciaTipo,
      CHAVE_RECORRENCIA_TAREFA_PRAZO,
    ])
    expect(sendPushMock).toHaveBeenCalledTimes(1)
  })

  it('atualiza a mesma linha após repetição e preserva leitura sem repetir push', async () => {
    queryMock.mockResolvedValueOnce([{
      id: 'notif-1',
      ocorrencias: 2,
      lida: true,
      recorrente: true,
      ativa: true,
    }])

    await criarOuAtualizarNotificacaoRecorrente({
      ...baseOptions,
      tipo: 'tarefa_atrasada',
      titulo: 'Tarefa atrasada',
    })

    const [sql] = queryMock.mock.calls[0]
    expect(sql).toContain('tipo = EXCLUDED.tipo')
    expect(sql).toContain('ocorrencias = notificacoes.ocorrencias + 1')
    expect(sql).not.toContain('lida =')
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('usa a mesma chave quando hoje vira atrasada', async () => {
    queryMock.mockResolvedValueOnce([{
      id: 'notif-1',
      ocorrencias: 3,
      lida: true,
      recorrente: true,
      ativa: true,
    }])

    await criarOuAtualizarNotificacaoRecorrente({
      ...baseOptions,
      tipo: 'tarefa_atrasada',
    })

    const [, params] = queryMock.mock.calls[0]
    expect(params[7]).toBe(CHAVE_RECORRENCIA_TAREFA_PRAZO)
  })

  it('encerra a notificação por referência sem deletar a linha', async () => {
    queryMock.mockResolvedValueOnce([{ id: 'notif-1' }])

    const total = await resolverNotificacoesRecorrentesPorReferencia({
      orgId: baseOptions.orgId,
      referenciaId: baseOptions.referenciaId,
      referenciaTipo: 'tarefa',
    })

    const [sql, params] = queryMock.mock.calls[0]
    expect(total).toBe(1)
    expect(sql).toContain('ativa = FALSE')
    expect(sql).toContain('resolvida_em = COALESCE(resolvida_em, NOW())')
    expect(sql).toContain('arquivada = TRUE')
    expect(sql).toContain('recorrente = TRUE')
    expect(sql).not.toMatch(/DELETE\s+FROM\s+notificacoes/i)
    expect(params).toEqual([baseOptions.orgId, [baseOptions.referenciaId], 'tarefa'])
  })
})

describe('contratos de migration e arquivamento do lifecycle', () => {
  it('mantém a migration estrutural aditiva e idempotente', () => {
    const source = readSource('backend/src/db/migrate.ts')
    expect(source).toContain("NOTIFICATION_LIFECYCLE_MIGRATION_ID = '2026-08-25-notification-lifecycle'")
    expect(source).toContain('ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS recorrente')
    expect(source).toContain('ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS ativa')
    expect(source).toContain('CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_notif_recorrente_ativa')
    expect(source).toContain('DROP INDEX CONCURRENTLY IF EXISTS uq_notif_ativa_por_referencia')
    expect(source).toContain('NOTIFICATION_LIFECYCLE_MIGRATION_ID')
    expect(source).not.toMatch(/DELETE\s+FROM\s+notificacoes/i)
    expect(source).not.toMatch(/TRUNCATE\s+notificacoes/i)
    expect(source).not.toMatch(/DROP\s+TABLE\s+notificacoes/i)
  })

  it('não arquiva recorrente ativa na rotina automática nem na rota manual', () => {
    const helperSource = readSource('backend/src/lib/notifHelper.ts')
    const routeSource = readSource('backend/src/routes/notificacoes.ts')
    expect(helperSource).toContain('NOT (COALESCE(recorrente, FALSE) AND COALESCE(ativa, FALSE))')
    expect(routeSource).toContain('NOT (COALESCE(recorrente, FALSE) AND COALESCE(ativa, FALSE))')
  })

  it('não usa lida=false como critério de lifecycle no helper', () => {
    const helperSource = readSource('backend/src/lib/notifHelper.ts')
    expect(helperSource).not.toMatch(/lida\s*=\s*FALSE/i)
    expect(helperSource).toContain('recorrente = TRUE')
    expect(helperSource).toContain('ativa = TRUE')
    expect(helperSource).toContain('chave_recorrencia')
  })
})
