import { describe, expect, it } from 'vitest'
import {
  checklistReminderIsDue,
  normalizeChecklistRecurrence,
} from '../src/lib/checklistRecurrence'
import { resolveTaskListTitle } from '../src/lib/taskContextTitle'

describe('recorrência por item do checklist', () => {
  it('normaliza valores inválidos como item único', () => {
    expect(normalizeChecklistRecurrence('diario')).toBe('diaria')
    expect(normalizeChecklistRecurrence('semanal')).toBe('semanal')
    expect(normalizeChecklistRecurrence('qualquer')).toBe('unica')
  })

  it('lembra o mesmo item diário somente a partir da data inicial', () => {
    const item = { recorrencia: 'diaria', data: '2026-08-11' }
    expect(checklistReminderIsDue(item, new Date(2026, 7, 10))).toBe(false)
    expect(checklistReminderIsDue(item, new Date(2026, 7, 11))).toBe(true)
    expect(checklistReminderIsDue(item, new Date(2026, 7, 20))).toBe(true)
  })

  it('respeita cadências diferentes dentro do mesmo checklist', () => {
    const monday = new Date(2026, 7, 10)
    expect(checklistReminderIsDue({ recorrencia: 'semanal', recorrencia_dia_semana: 1 }, monday)).toBe(true)
    expect(checklistReminderIsDue({ recorrencia: 'semanal', recorrencia_dia_semana: 2 }, monday)).toBe(false)
    expect(checklistReminderIsDue({ recorrencia: 'mensal', recorrencia_dia_mes: 10 }, monday)).toBe(true)
  })

  it('ajusta dia 31 ao último dia de mês curto sem criar tarefa', () => {
    expect(checklistReminderIsDue({ recorrencia: 'mensal', recorrencia_dia_mes: 31 }, new Date(2026, 1, 28))).toBe(true)
  })
})

describe('título canônico de lista', () => {
  it('gera o título a partir do tipo e da entidade', () => {
    expect(resolveTaskListTitle({ context: 'empresa', entityName: 'ACME', requestedTitle: 'ignorado' }))
      .toBe('Tarefa para empresa — ACME')
    expect(resolveTaskListTitle({ context: 'pessoa_fisica', entityName: 'Maria', requestedTitle: 'ignorado' }))
      .toBe('Tarefa para Cliente PF — Maria')
  })

  it('preserva título manual de escritório e pessoal', () => {
    expect(resolveTaskListTitle({ context: 'escritorio', requestedTitle: 'Fechamento mensal' })).toBe('Fechamento mensal')
    expect(resolveTaskListTitle({ context: 'pessoal', requestedTitle: 'Organizar estudos' })).toBe('Organizar estudos')
  })
})
