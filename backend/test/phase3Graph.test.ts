import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTaskGraph, dependencyIds, validateTaskDependencies, withDependencies } from '../../src/lib/taskGraph'
import { validateChecklistDependencies } from '../src/lib/checklistDependencies'
import type { ChecklistItem, Tarefa } from '../../src/lib/api'

const tarefaBase = (checklist: ChecklistItem[]): Tarefa => ({
  id: 'task-graph-1',
  org_id: 'org-1',
  criado_por: 'user-1',
  titulo: 'Implantar fluxo operacional',
  prioridade: 'media',
  status: 'em_progresso',
  checklist,
  created_at: '2026-08-27T12:00:00.000Z',
})

describe('Fase 3 — mapa mental e Projetos', () => {
  it('normaliza dependência simples e múltipla sem duplicar IDs', () => {
    expect(dependencyIds({ id: 'c', texto: 'C', depende_de: 'a', depende_de_todos: ['a', 'b', ''] })).toEqual(['a', 'b'])
    expect(withDependencies({ id: 'c', texto: 'C', feito: false }, ['a', 'a'])).toMatchObject({ depende_de: 'a' })
    expect(withDependencies({ id: 'c', texto: 'C', feito: false }, ['a', 'b'])).toMatchObject({ depende_de_todos: ['a', 'b'] })
  })

  it('monta nós e arestas somente para dependências presentes no checklist', () => {
    const graph = buildTaskGraph(tarefaBase([
      { id: 'a', texto: 'Preparar dados', feito: true },
      { id: 'b', texto: 'Validar dados', feito: false, depende_de: 'a' },
      { id: 'c', texto: 'Publicar', feito: false, depende_de_todos: ['a', 'b'] },
      { id: 'd', texto: 'Sem predecessor', feito: false, depende_de: 'não-existe' },
    ]))
    expect(graph.nodes).toHaveLength(5)
    expect(graph.edges.map(edge => `${edge.from.id}->${edge.to.id}`)).toEqual(['a->b', 'a->c', 'b->c'])
    expect(graph.nodes.find(node => node.id === 'b')?.x).toBeGreaterThan(graph.nodes.find(node => node.id === 'a')?.x || 0)
    expect(graph.nodes.find(node => node.id === 'a')?.done).toBe(true)
  })

  it('distribui listas curtas em uma linha horizontal legível', () => {
    const graph = buildTaskGraph(tarefaBase([
      { id: 'a', texto: 'Preparar dados', feito: false },
      { id: 'b', texto: 'Validar dados', feito: false },
      { id: 'c', texto: 'Publicar', feito: false },
    ]))
    const items = graph.nodes.slice(1)
    expect(new Set(items.map(node => node.y)).size).toBe(1)
    expect(new Set(items.map(node => node.x)).size).toBe(3)
    expect(graph.width).toBeGreaterThan(900)
    expect(graph.height).toBe(220)
  })

  it('limita a altura de listas grandes distribuindo itens em uma grade', () => {
    const graph = buildTaskGraph(tarefaBase(Array.from({ length: 32 }, (_, index) => ({
      id: `item-${index}`,
      texto: `Item ${index}`,
      feito: false,
    }))))
    expect(graph.nodes).toHaveLength(33)
    expect(graph.height).toBeLessThan(900)
    expect(graph.width).toBeGreaterThan(graph.height)
    expect(new Set(graph.nodes.slice(1).map(node => node.y)).size).toBeLessThan(32)
  })

  it('preserva metadados do item ao editar somente suas dependências', () => {
    const item: ChecklistItem = {
      id: 'item-1',
      texto: 'Conferir contrato',
      feito: false,
      responsavel_id: 'member-1',
      data: '2026-09-01',
      pontuacao: 5,
      descricao: 'Revisar anexos',
      livre: true,
      atualizacoes_atraso: [{ data: '2026-08-26', nota: 'Aguardando retorno', autor: 'Equipe' }],
      aprovacao_status: 'aguardando',
    }
    const updated = withDependencies(item, ['item-0'])
    expect(updated).toMatchObject({
      id: 'item-1',
      texto: 'Conferir contrato',
      responsavel_id: 'member-1',
      data: '2026-09-01',
      pontuacao: 5,
      descricao: 'Revisar anexos',
      livre: true,
      atualizacoes_atraso: [{ data: '2026-08-26', nota: 'Aguardando retorno', autor: 'Equipe' }],
      aprovacao_status: 'aguardando',
      depende_de: 'item-0',
    })
  })

  it('rejeita referências inválidas e ciclos antes da gravação', () => {
    expect(validateTaskDependencies([
      { id: 'a', texto: 'A', feito: false, depende_de: 'missing' },
    ]).ok).toBe(false)
    expect(validateTaskDependencies([
      { id: 'a', texto: 'A', feito: false, depende_de: 'b' },
      { id: 'b', texto: 'B', feito: false, depende_de: 'a' },
    ]).ok).toBe(false)
    expect(validateChecklistDependencies([
      { id: 'a', depende_de: 'b' },
      { id: 'b', depende_de: 'a' },
    ]).ok).toBe(false)
  })

  it('aceita dependências válidas e IDs únicos no backend', () => {
    expect(validateChecklistDependencies([
      { id: 'a' },
      { id: 'b', depende_de: 'a' },
      { id: 'c', depende_de_todos: ['a', 'b'] },
    ]).ok).toBe(true)
  })

  it('mantém a fonte do grafo no JSONB da tarefa e a edição no PATCH oficial', () => {
    const graphSource = readFileSync(resolve(process.cwd(), '../src/components/TaskGraphView.tsx'), 'utf8')
    const tarefasSource = readFileSync(resolve(process.cwd(), 'src/routes/tarefas.ts'), 'utf8')
    expect(graphSource).toContain('tarefas.checklist` JSONB')
    expect(graphSource).toContain('tarefasApi.update(selectedTask.id, { checklist: nextChecklist })')
    expect(graphSource).not.toContain('tarefa_checklist')
    expect(tarefasSource).toContain('depende_de_todos')
    expect(tarefasSource).toContain('depende_de: String(item?.depende_de')
  })

  it('expõe o modo grafo, o agrupamento Projeto e a rota dedicada', () => {
    const tarefasSource = readFileSync(resolve(process.cwd(), '../src/pages/Tarefas.tsx'), 'utf8')
    const projetosSource = readFileSync(resolve(process.cwd(), '../src/pages/Projetos.tsx'), 'utf8')
    const layoutFixesSource = readFileSync(resolve(process.cwd(), '../src/layout-fixes.css'), 'utf8')
    const appSource = readFileSync(resolve(process.cwd(), '../src/App.tsx'), 'utf8')
    expect(tarefasSource).toContain("viewMode === 'grafo'")
    expect(tarefasSource).toContain('<TaskGraphView')
    expect(projetosSource).toContain('projeto_grupo_id')
    expect(projetosSource).toContain('/tarefas?view=grafo')
    expect(projetosSource).toContain('graphTask=')
    expect(projetosSource).not.toContain('&task=')
    expect(tarefasSource).toContain("get('graphTask')")
    expect(tarefasSource).toContain("get('task')")
    expect(tarefasSource).toContain('routeGraphTask')
    expect(tarefasSource).toContain('graphRouteState === \'invalid\'')
    expect(tarefasSource).toContain("navigate('/tarefas?view=grafo')")
    expect(projetosSource).toContain('projects-page-groups--${groups.length === 1 ? \'single\' : \'multi\'}')
    expect(projetosSource).toContain('projects-group-task-list')
    expect(layoutFixesSource).toContain('.projects-page-groups--single')
    expect(appSource).toContain('path="projetos"')
  })
})
