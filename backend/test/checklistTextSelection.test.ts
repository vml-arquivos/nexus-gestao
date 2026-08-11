import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(process.cwd(), '..')

describe('seleção segura de texto no checklist', () => {
  it('mantém o checkbox como ação isolada e libera seleção no conteúdo', () => {
    const page = fs.readFileSync(path.join(root, 'src/pages/Tarefas.tsx'), 'utf8')
    const css = fs.readFileSync(path.join(root, 'src/app-styles.css'), 'utf8')
    expect(page).toContain('className="task-check-copyable"')
    expect(page).toContain('onClick={() => toggleCheck(item.id)}')
    expect(css).toContain('.tarefa-modal-box .task-check-copyable')
    expect(css).toContain('user-select:text !important')
  })
})
