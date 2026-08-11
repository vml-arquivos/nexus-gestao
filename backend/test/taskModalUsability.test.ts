import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(process.cwd(), '..')

describe('modal de tarefas responsivo e fechável', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/Tarefas.tsx'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'src/app-styles.css'), 'utf8')

  it('fecha por botão, toque fora e tecla Escape com proteção contra chamada dupla', () => {
    expect(page).toContain("event.key !== 'Escape'")
    expect(page).toContain('closeRequestedRef.current')
    expect(page).toContain('onPointerDown={e => { e.preventDefault(); e.stopPropagation(); requestClose() }}')
    expect(page).toContain('aria-label={`Fechar ${title}`}')
    expect(page).toContain("params.delete('task')")
    expect(page).toContain('navigate(`${location.pathname}')
  })

  it('mantém cabeçalho, rolagem única e dimensões próprias no mobile', () => {
    expect(css).toContain('FIX78 — contrato visual definitivo dos modais de tarefas')
    expect(css).toContain('scrollbar-gutter:stable')
    expect(css).toContain('width:100dvw !important')
    expect(css).toContain('height:100dvh !important')
  })
})
