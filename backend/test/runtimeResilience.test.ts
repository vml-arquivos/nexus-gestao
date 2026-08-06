import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..', '..')
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8')

describe('proteções de runtime FIX54', () => {
  it('não executa DDL no caminho HTTP de tarefas ou ranking', () => {
    const tarefas = read('backend/src/routes/tarefas.ts')
    const scoring = read('backend/src/routes/tarefasScoring.ts')
    expect(tarefas).not.toContain('ensureTaskRuntimeSchema')
    expect(scoring).not.toContain('ensureCompatibilitySchema')
    expect(scoring).not.toContain('ALTER TABLE tarefas_ajuda')
  })

  it('não bloqueia a lista com ranking e não usa polling de 25 segundos', () => {
    const tarefasPage = read('src/pages/Tarefas.tsx')
    expect(tarefasPage).toContain('Promise.allSettled')
    expect(tarefasPage).toContain('tarefasApi.anexosResumo().then')
    expect(tarefasPage).toContain("escopo === 'ranking'")
    expect(tarefasPage).not.toContain('window.setInterval(refreshIfVisible, 25000)')
  })

  it('não acopla a lista principal à tabela de anexos', () => {
    const tarefas = read('backend/src/routes/tarefas.ts')
    const listStart = tarefas.indexOf('async function listTasksForUser')
    const summaryStart = tarefas.indexOf('router.get("/anexos-resumo"')
    const listSource = tarefas.slice(listStart, summaryStart)
    expect(listSource).not.toContain('JOIN LATERAL')
    expect(listSource).not.toContain('FROM tarefa_anexos')
    expect(tarefas).toContain('Metadados de anexos indisponíveis; lista principal preservada')
  })

  it('aceita integração legada sem misturar organizações', () => {
    const integracoes = read('backend/src/routes/integracoes.ts')
    const migrate = read('backend/src/db/migrate.ts')
    expect(integracoes).toContain('normalizeDestravaTaskInput')
    expect(integracoes).toContain("'equipe','normal'")
    expect(integracoes).toContain('COUNT(DISTINCT p2.org_id)')
    expect(integracoes).toContain('findActiveUserByEmail(body.responsavelEmail, orgId)')
    expect(migrate).toContain("SET escopo = 'equipe'")
  })

  it('cede o pool ao tráfego durante o arquivamento em lotes', () => {
    const notificacoes = read('backend/src/lib/notifHelper.ts')
    expect(notificacoes).toContain('pool.waitingCount > 0')
    expect(notificacoes).toContain('Arquivamento pausado')
    expect(notificacoes).toContain('FOR UPDATE SKIP LOCKED')
  })

  it('não permite que o Service Worker intercepte API, SSE ou uploads', () => {
    const sw = read('public/sw.js')
    expect(sw).toContain("url.pathname.startsWith('/api/')")
    expect(sw).toContain("url.pathname.startsWith('/uploads/')")
    expect(sw).not.toContain('cache.put(req, fresh.clone()).catch(() => undefined)\n        return fresh')
  })

  it('expõe liveness/versão reais e usa o startup com heap controlado', () => {
    const nginx = read('nginx.unified.conf')
    const dockerfile = read('Dockerfile')
    expect(nginx).toContain('location = /health/live')
    expect(nginx).toContain('location = /version')
    expect(nginx).toContain('proxy_buffering    off')
    expect(dockerfile).toContain('fix55-agenda-sem-limite-20260806')
    expect(dockerfile).toContain('CMD ["/app/healthcheck.sh"]')
    expect(dockerfile).toContain('COPY backend-start.sh /app/backend-start.sh')
  })

  it('mantém o build Docker sequencial e não injeta segredos no Dockerfile', () => {
    const dockerfile = read('Dockerfile')
    expect(dockerfile).toContain('FROM node:20-alpine AS builder')
    expect(dockerfile).not.toContain('AS backend-builder')
    expect(dockerfile).not.toContain('AS frontend-builder')
    expect(dockerfile).not.toContain('python3 scripts/')
    expect(dockerfile.match(/^\s+npm ci\b/gm)).toHaveLength(2)
    expect(dockerfile.indexOf('./node_modules/.bin/tsc')).toBeLessThan(
      dockerfile.indexOf('./node_modules/.bin/vite build'),
    )
    expect(dockerfile.indexOf('COPY --from=builder /app/backend/dist /tmp/nexus-backend-dist')).toBeLessThan(
      dockerfile.indexOf('RUN apk add --no-cache'),
    )
    expect(dockerfile).not.toMatch(/^ARG .*?(SECRET|PASSWORD|TOKEN|DATABASE_URL)/m)
  })

  it('não repete o schema histórico e usa timeout próprio para migrations', () => {
    const migrate = read('backend/src/db/migrate.ts')
    expect(migrate).toContain('nexus_schema_migrations')
    expect(migrate).toContain('SCHEMA_MIGRATION_ID')
    expect(migrate).toContain('DB_MIGRATION_QUERY_TIMEOUT_MS')
    expect(migrate).toContain('query_timeout: MIGRATION_QUERY_TIMEOUT_MS')
    expect(migrate).toContain('hasCurrentSchemaBaseline')
    expect(migrate).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS')
    expect(migrate).not.toContain('Promise.race([\n      ensureTaskScoreCompatibilityOnce()')
    expect(migrate).not.toContain('Promise.race([\n      ensureTarefasListSchemaOnce()')
  })

  it('reaproveita vínculos existentes do Destrava sem escolher organização ambígua', () => {
    const integracoes = read('backend/src/routes/integracoes.ts')
    expect(integracoes).toContain('inferExistingDestravaOrgId')
    expect(integracoes).toContain("source_system = 'destrava'")
    expect(integracoes).toContain("origem_sistema = 'destrava'")
    expect(integracoes).toContain('selectUnambiguousOrgId')
  })
})
