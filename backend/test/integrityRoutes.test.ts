import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('hardening de integridade multi-tenant', () => {
  it('escopa rotas Destrava de detalhe, checklist, status e listagem', () => {
    const source = read('src/routes/integracoes.ts')
    const detail = source.slice(source.indexOf("router.post('/destrava/tarefas/:id'"), source.indexOf("router.patch('/destrava/tarefas/:id/checklist'"))
    const checklist = source.slice(source.indexOf("router.patch('/destrava/tarefas/:id/checklist'"), source.indexOf("router.patch('/destrava/tarefas/:id/status'"))
    const status = source.slice(source.indexOf("router.patch('/destrava/tarefas/:id/status'"), source.indexOf("router.get('/destrava/tarefas'"))
    const list = source.slice(source.indexOf("router.get('/destrava/tarefas'"), source.indexOf("router.post('/destrava/tarefas'"))

    expect(detail).toContain('WHERE id = $1 AND org_id = $2')
    expect(detail).toContain('tarefas_historico WHERE tarefa_id = $1 AND org_id = $2')
    expect(detail).toContain('tarefas_comentarios WHERE tarefa_id = $1 AND org_id = $2')
    expect(detail).toContain('tarefa_anexos WHERE tarefa_id = $1 AND org_id = $2')
    expect(checklist).toContain('WHERE id = $1 AND org_id = $2 FOR UPDATE')
    expect(checklist).toContain('WHERE id = $2 AND org_id = $3 RETURNING *')
    expect(status).toContain('WHERE id = $1 AND org_id = $2')
    expect(status).toContain('WHERE id = $2 AND org_id = $3 RETURNING *')
    expect(list).toContain('WHERE t.org_id = $3')
    expect(list).toContain('resolveSignedIntegrationOrg')
  })

  it('escopa o retry por organização, workflow, origem e não regrava checklist grande', () => {
    const source = read('src/routes/automationHandlers/acompanhamento.ts')
    expect(source).toContain('payload.nexus_org_id || payload.org_id')
    expect(source).toContain("AND org_id = $2")
    expect(source).toContain("workflow_tipo = 'acompanhamento_bancario'")
    expect(source).toContain("origem_sistema = 'destrava'")
    expect(source).toContain('checklist acima de 1 MB')
    expect(source).toContain('UPDATE tarefas SET status = $1, updated_at = NOW()')
  })

  it('mantém joins de perfis subordinados ao org_id da entidade', () => {
    const tasks = read('src/routes/tarefas.ts')
    expect(tasks).toContain('p.org_id = t.org_id')
    expect(tasks).toContain('c.org_id = t.org_id')
    expect(tasks).toContain('ap.org_id = t.org_id')
    expect(tasks).toContain('p.org_id = h.org_id')
    expect(tasks).toContain('p.org_id = a.org_id')
  })
})
