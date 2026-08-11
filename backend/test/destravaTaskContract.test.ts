import { describe, expect, it } from 'vitest'
import {
  buildDestravaTaskExternalKey,
  normalizeDestravaTaskInput,
  selectUnambiguousOrgId,
} from '../src/lib/destravaTaskContract'

describe('contrato de tarefas Destrava/Nexus', () => {
  it('normaliza o contrato plano atual', () => {
    const input = normalizeDestravaTaskInput({
      titulo: 'Validar contrato',
      external_id: 'empresa-1',
      external_name: 'Empresa Um',
      prioridade: 'alta',
      idempotency_key: 'evento-123',
      criado_por_email: 'gestor@exemplo.com',
    })

    expect(input).toMatchObject({
      titulo: 'Validar contrato',
      externalId: 'empresa-1',
      externalName: 'Empresa Um',
      prioridade: 'alta',
      idempotencyKey: 'evento-123',
      criadoPorEmail: 'gestor@exemplo.com',
    })
    expect(input.metadata.contrato).toBe('destrava.nexus.tarefa.v2')
  })

  it('mantém compatibilidade com o contrato aninhado legado', () => {
    const input = normalizeDestravaTaskInput({
      idempotency_key: 'evento-legado-123',
      empresa: { id: 'empresa-antiga', razao_social: 'Empresa Antiga', cnpj: '12345678000199' },
      tarefa: {
        id: 'pendencia-antiga',
        titulo: 'Pendência legada',
        descricao: 'Payload publicado antes do contrato plano',
        categoria: 'documental',
        prioridade: 'alta',
        acao_recomendada: 'Solicitar documento',
      },
      contexto: { link_empresa: '/empresas/empresa-antiga' },
    })

    expect(input).toMatchObject({
      titulo: 'Pendência legada',
      externalId: 'empresa-antiga',
      externalName: 'Empresa Antiga',
      cnpj: '12345678000199',
      sourceUrl: '/empresas/empresa-antiga',
    })
    expect(input.checklist).toEqual([{ texto: 'Solicitar documento', feito: false }])
    expect(input.metadata.contrato).toBe('destrava.nexus.tarefa.v1')
  })

  it('promove todos os campos visuais aninhados para o modelo canônico do Nexus', () => {
    const input = normalizeDestravaTaskInput({
      empresa: { id: 'empresa-visual', razao_social: 'Empresa Visual', tipo: 'empresa' },
      tarefa: {
        titulo: 'Conferência completa',
        descricao: 'Mesma descrição exibida no Nexus',
        data: '2026-08-11',
        data_limite: '2026-08-15',
        prioridade: 'alta',
        observacao: 'Observação integrada',
        responsavel_email: 'membro@exemplo.com',
        checklist: [{ texto: 'Primeira ação', data: '2026-08-12' }],
        pontuacao_escopo: 'subtarefas',
        conta_ranking: false,
      },
    })

    expect(input).toMatchObject({
      titulo: 'Conferência completa',
      descricao: 'Mesma descrição exibida no Nexus',
      data: '2026-08-11',
      prazo: '2026-08-15',
      prioridade: 'alta',
      observacao: 'Observação integrada',
      responsavelEmail: 'membro@exemplo.com',
      pontuacaoEscopo: 'subtarefas',
      contaRanking: false,
    })
    expect(input.checklist).toEqual([{ texto: 'Primeira ação', data: '2026-08-12' }])
  })

  it('ativa ranking por item somente quando o contrato solicita subtarefas', () => {
    const manual = normalizeDestravaTaskInput({
      titulo: 'Lista pontuada',
      external_id: 'empresa-1',
      pontuacao_escopo: 'subtarefas',
      conta_ranking: true,
    })
    const legacy = normalizeDestravaTaskInput({ titulo: 'Lista antiga', external_id: 'empresa-1' })
    expect(manual.pontuacaoEscopo).toBe('subtarefas')
    expect(manual.contaRanking).toBe(true)
    expect(legacy.pontuacaoEscopo).toBe('tarefa')
  })

  it('gera chave determinística para impedir duplicatas', () => {
    const input = normalizeDestravaTaskInput({
      titulo: 'Tarefa idempotente',
      external_id: 'empresa-1',
      idempotency_key: 'mesmo-evento',
    })

    expect(buildDestravaTaskExternalKey(input)).toBe(buildDestravaTaskExternalKey(input))
    expect(buildDestravaTaskExternalKey(input)).not.toBe(
      buildDestravaTaskExternalKey({ ...input, idempotencyKey: 'outro-evento' }),
    )
  })

  it('reutiliza organização existente somente quando o vínculo é inequívoco', () => {
    expect(selectUnambiguousOrgId(['org-1', 'org-1', '', null])).toBe('org-1')
    expect(selectUnambiguousOrgId(['org-1', 'org-2'])).toBeNull()
    expect(selectUnambiguousOrgId([])).toBeNull()
  })
})
