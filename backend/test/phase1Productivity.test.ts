import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseNaturalDate } from '../../src/lib/naturalLanguageDate'
import { gerarSugestaoChecklist } from '../src/services/geminiService'

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

  it('mantém fallback local quando Gemini não está configurado', async () => {
    const previous = process.env.GEMINI_API_KEY
    const previousGoogle = process.env.GOOGLE_GEMINI_API_KEY
    const previousLegacy = process.env.GOOGLE_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    try {
      const result = await gerarSugestaoChecklist({ titulo: 'Organizar documentação', descricao: 'Reunir e anexar comprovantes.' })
      expect(result.provider).toBe('nexus-local')
      expect(result.fallback).toBe(true)
      expect(result.itens.length).toBeGreaterThanOrEqual(5)
      expect(result.itens.every(item => item.texto.length <= 140)).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = previous
      if (previousGoogle === undefined) delete process.env.GOOGLE_GEMINI_API_KEY
      else process.env.GOOGLE_GEMINI_API_KEY = previousGoogle
      if (previousLegacy === undefined) delete process.env.GOOGLE_API_KEY
      else process.env.GOOGLE_API_KEY = previousLegacy
    }
  })

  it('usa fallback local quando Gemini responde por quota esgotada', async () => {
    const previous = process.env.GEMINI_API_KEY
    const previousGoogle = process.env.GOOGLE_GEMINI_API_KEY
    const previousLegacy = process.env.GOOGLE_API_KEY
    const previousFetch = globalThis.fetch
    process.env.GEMINI_API_KEY = 'test-only-placeholder'
    delete process.env.GOOGLE_GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exhausted' } }), { status: 429 })) as typeof fetch
    try {
      const result = await gerarSugestaoChecklist({ titulo: 'Validar quota do provedor' })
      expect(result.provider).toBe('nexus-local')
      expect(result.fallback).toBe(true)
      expect(result.itens.length).toBeGreaterThanOrEqual(5)
    } finally {
      globalThis.fetch = previousFetch
      if (previous === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = previous
      if (previousGoogle === undefined) delete process.env.GOOGLE_GEMINI_API_KEY
      else process.env.GOOGLE_GEMINI_API_KEY = previousGoogle
      if (previousLegacy === undefined) delete process.env.GOOGLE_API_KEY
      else process.env.GOOGLE_API_KEY = previousLegacy
    }
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
