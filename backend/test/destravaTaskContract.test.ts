import { describe, expect, it } from 'vitest'
import { buildDestravaTaskExternalKey, normalizeDestravaTaskInput } from '../src/lib/destravaTaskContract'

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
})
