import React from 'react'
import { Link } from 'react-router-dom'
import type { Tarefa } from '../../../lib/api'
import { AlertTriangle, Calendar } from 'lucide-react'

interface Props {
  /** Lista completa de tarefas */
  tasks: Tarefa[]
}

/**
 * Exibe as próximas tarefas ordenadas por data de prazo. Lista no
 * máximo cinco tarefas que não estejam concluídas ou canceladas. A
 * prioridade alta recebe destaque com cor de aviso.
 */
export default function UpcomingTasks({ tasks }: Props) {
  const futuras = tasks
    .filter(t => t.status !== 'concluida' && t.status !== 'cancelada' && t.prazo)
    .sort((a, b) => (a.prazo || '').localeCompare(b.prazo || ''))
    .slice(0, 5)
  if (futuras.length === 0) return null

  function fmtDate(d: string) {
    return new Date(d.slice(0, 10)).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }
  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Próximas tarefas</h2>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
        {futuras.map(t => (
          <Link key={t.id} to={`/tarefas?task=${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: t.prioridade === 'alta' ? 'rgba(239,68,68,0.15)' : 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t.prioridade === 'alta' ? <AlertTriangle size={14} color='var(--danger)' /> : <Calendar size={14} color='var(--primary)' />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtDate(t.prazo || '')}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: t.prioridade === 'alta' ? 'var(--danger)' : 'var(--text3)', background: t.prioridade === 'alta' ? 'rgba(239,68,68,0.15)' : 'var(--bg3)', padding: '2px 6px', borderRadius: 99 }}>
              {t.prioridade === 'alta' ? 'Urgente' : t.prioridade === 'media' ? 'Média' : 'Baixa'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}