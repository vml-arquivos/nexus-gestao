import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..', '..')
const tarefasPage = readFileSync(resolve(root, 'src/pages/Tarefas.tsx'), 'utf8')

describe('agrupamento visual das tarefas por empresa', () => {
  it('usa a chave real da empresa e mantém as listas como registros separados', () => {
    expect(tarefasPage).toContain('function agruparTarefasPorEmpresa')
    expect(tarefasPage).toContain("tarefa.origem_sistema === 'destrava' ? empresaChave(tarefa) : null")
    expect(tarefasPage).toContain('Cada lista mantém seu próprio checklist, responsável, prazo e aprovação.')
    expect(tarefasPage).not.toContain('checklist: existing.checklist.concat')
  })

  it('remove aprovadas da operação diária e preserva o acesso no histórico recolhido', () => {
    expect(tarefasPage).toContain('tarefaDestravaArquivada')
    expect(tarefasPage).toContain('historicoAberto &&')
    expect(tarefasPage).toContain('Histórico da empresa')
    expect(tarefasPage).toContain('Listas finalizadas, aprovadas ou canceladas ficam arquivadas aqui.')
  })

  it('preserva a aprovação em lote exibindo registros individuais no modo de seleção', () => {
    expect(tarefasPage).toContain("modoSelecao\n      ? filtered.map(tarefa => ({ kind: 'tarefa' as const, tarefa }))")
  })
})
