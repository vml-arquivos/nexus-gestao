import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checklistItemsConcluidos, matchesUserRule, normalizeUserRuleInput } from '../src/services/automation/userRules'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), '..', path), 'utf8')
}

const task = {
  id: 'task-1',
  org_id: 'org-1',
  titulo: 'Protocolar documentação',
  status: 'pendente',
  prioridade: 'alta',
  responsavel_id: 'user-1',
  projeto_grupo_id: 'project-1',
}

describe('Fase 2 — automação configurável', () => {
  it('normaliza gatilhos, condições e ações válidas sem aceitar ação vazia', () => {
    const normalized = normalizeUserRuleInput({
      name: 'Avisar quando protocolar',
      trigger_type: 'tarefa_criada',
      conditions: { mode: 'and', items: [{ field: 'titulo', operator: 'contem', value: 'protocolar' }] },
      actions: [{ type: 'mover_status', status: 'em_progresso' }, { type: 'adicionar_checklist', texto: 'Conferir protocolo' }],
    })
    expect(normalized.conditions.mode).toBe('AND')
    expect(normalized.actions).toHaveLength(2)
    expect(() => normalizeUserRuleInput({ name: 'Sem ação', trigger_type: 'tarefa_criada', actions: [] })).toThrow('ação')
  })

  it('avalia condições AND e OR sobre o snapshot da tarefa e contexto do evento', () => {
    const first = { conditions: { mode: 'AND' as const, items: [{ field: 'prioridade' as const, operator: 'igual' as const, value: 'alta' }, { field: 'titulo' as const, operator: 'contem' as const, value: 'protocolar' }] } }
    expect(matchesUserRule(first, task, {})).toBe(true)
    expect(matchesUserRule({ conditions: { mode: 'AND', items: [...first.conditions.items, { field: 'status' as const, operator: 'igual' as const, value: 'concluida' }] } }, task, {})).toBe(false)
    expect(matchesUserRule({ conditions: { mode: 'OR', items: [{ field: 'status_novo', operator: 'igual', value: 'concluida' }, { field: 'checklist_item_texto', operator: 'contem', value: 'protocolo' }] } }, task, { checklist_item_texto: 'Conferir protocolo' })).toBe(true)
  })

  it('dispara somente a transição false -> true do checklist JSONB', () => {
    const before = [{ id: 'a', texto: 'A', feito: false }, { id: 'b', texto: 'B', feito: true }]
    const after = [{ id: 'a', texto: 'A', feito: true, enviado_em: '2026-08-27T12:00:00Z' }, { id: 'b', texto: 'B', feito: true }]
    expect(checklistItemsConcluidos(before, after)).toEqual([{ id: 'a', texto: 'A', enviado_em: '2026-08-27T12:00:00Z' }])
    expect(checklistItemsConcluidos(after, after)).toEqual([])
  })

  it('mantém o namespace local no outbox e a proteção contra checklist gigante', () => {
    const service = source('backend/src/services/automation/userRules.ts')
    const migration = source('backend/src/db/migrate.ts')
    const dispatcher = source('backend/src/services/automation/dispatcher.ts')
    const route = source('backend/src/routes/automationRules.ts')
    expect(service).toContain("USER_RULE_EVENT_TYPE = 'NexusUserRule'")
    expect(service).toContain('COALESCE(pg_column_size(checklist), 0) <= $3')
    expect(service).not.toContain('tarefa_checklist')
    expect(migration).toContain("USER_AUTOMATION_MIGRATION_ID = '2026-08-27-user-automation-rules'")
    expect(migration).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_user_rules_org_trigger')
    expect(dispatcher).toContain("EVENTOS_LOCAIS_NEXUS = new Set(['NexusUserRule'])")
    expect(route).toContain("'/catalogo'")
  })
})
