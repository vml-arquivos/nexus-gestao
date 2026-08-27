import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseNaturalDate } from '../../src/lib/naturalLanguageDate'

const fixedNow = new Date('2026-08-27T12:00:00-03:00')

function source(path: string) {
  return readFileSync(resolve(process.cwd(), '..', path), 'utf8')
}

describe('Fase 1 — produtividade e navegação', () => {
  it('interpreta expressões relativas e dias da semana como datas ISO', () => {
    expect(parseNaturalDate('entregar amanhã às 15h', fixedNow)).toMatchObject({ isoDate: '2026-08-28', phrase: 'amanhã' })
    expect(parseNaturalDate('até sexta-feira', fixedNow)).toMatchObject({ isoDate: '2026-08-28', phrase: 'sexta-feira' })
    expect(parseNaturalDate('em 5 dias', fixedNow)).toMatchObject({ isoDate: '2026-09-01', phrase: 'em 5 dias' })
  })

  it('valida datas explícitas e rejeita datas impossíveis', () => {
    expect(parseNaturalDate('protocolar em 15/09', fixedNow)?.isoDate).toBe('2026-09-15')
    expect(parseNaturalDate('prazo em 31/02', fixedNow)).toBeNull()
  })

  it('mantém a Fase 1 sobre os dados e contratos existentes', () => {
    const tarefas = source('src/pages/Tarefas.tsx')
    const palette = source('src/components/GlobalSearch.tsx')
    const calendar = source('src/components/TaskCalendarView.tsx')
    const table = source('src/components/TaskTableView.tsx')
    const api = source('src/lib/api.ts')

    expect(tarefas).toContain("'calendario' | 'tabela'")
    expect(tarefas).toContain('<TaskCalendarView tasks={filtered}')
    expect(tarefas).toContain('<TaskTableView')
    expect(palette).toContain("titulo: 'Abrir Agenda'")
    expect(palette).toContain("titulo: 'Abrir Equipe'")
    expect(calendar).toContain('tasks: Tarefa[]')
    expect(table).toContain('onOpen: (task: Tarefa) => void')
    expect(api).toContain("'/tarefas/ia-checklist'")
  })
})
