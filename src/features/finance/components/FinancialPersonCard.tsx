import React from 'react'
import { Pencil, Trash2, CheckCircle2 } from 'lucide-react'
import type { Pagamento } from '../../../lib/api'
import type { FinancialPersonGroup } from '../utils/groupFinancialRecords'

interface Props {
  /** Grupo financeiro consolidado */
  group: FinancialPersonGroup
  /** Callback para marcar um lançamento como pago */
  onMarkPaid: (p: Pagamento) => void
  /** Editar um lançamento individual */
  onEdit: (p: Pagamento) => void
  /** Excluir um lançamento individual */
  onDelete: (p: Pagamento) => void
}

/**
 * Exibe um card consolidado com os lançamentos de uma pessoa. Mostra
 * totais (a receber, a pagar, pendentes, pagos e saldo) e lista os
 * lançamentos individuais, permitindo ações de marcar como pago,
 * editar ou excluir. O card utiliza apenas tokens de cor definidos no
 * design system para garantir consistência visual.
 */
export default function FinancialPersonCard({ group, onMarkPaid, onEdit, onDelete }: Props) {
  const { pessoaNome, saldo, aReceber, aPagar, pendentes, pagos, proximoVencimento, vencido, items } = group

  function fmt(v: number) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  function fmtDate(d?: string) {
    if (!d) return '—'
    return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      {/* Cabeçalho com nome e saldo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{pessoaNome}</div>
          {proximoVencimento && (
            <div style={{ fontSize: 11, color: vencido ? 'var(--warning)' : 'var(--text3)', marginTop: 2 }}>
              {vencido ? 'Vencido:' : 'Próx. venc:'} {fmtDate(proximoVencimento)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {saldo >= 0 ? '+' : '-'}{fmt(Math.abs(saldo))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>Saldo</div>
        </div>
      </div>
      {/* Totais resumidos */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Receber', value: aReceber, color: 'var(--success)' },
          { label: 'Pagar',   value: aPagar,   color: 'var(--danger)' },
          { label: 'Pend.',   value: pendentes, color: 'var(--warning)' },
          { label: 'Pagos',   value: pagos,    color: 'var(--primary)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, minWidth: 80, background: 'var(--bg3)', borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 2 }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmt(value)}</span>
          </div>
        ))}
      </div>
      {/* Lista de lançamentos */}
      <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 6 }}>
        {items.map(item => {
          const valor = Number(item.valor || 0)
          const isReceb = item.tipo === 'recebimento'
          const sign = isReceb ? '+' : '-'
          const color = isReceb ? 'var(--success)' : 'var(--danger)'
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titulo}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtDate(item.vencimento || item.created_at)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color }}>{sign}{fmt(valor)}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: item.status === 'pago' ? 'var(--success)' : item.status === 'pendente' ? 'var(--warning)' : 'var(--text3)' }}>{item.status === 'pago' ? 'Pago' : item.status === 'pendente' ? 'Pendente' : 'Cancelado'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {item.status === 'pendente' && (
                  <button onClick={() => onMarkPaid(item)} title="Marcar como pago" style={{ border: 'none', background: 'none', color: 'var(--success)', cursor: 'pointer', padding: 2 }}>
                    <CheckCircle2 size={14} />
                  </button>
                )}
                <button onClick={() => onEdit(item)} title="Editar" style={{ border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2 }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => onDelete(item)} title="Excluir" style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 2 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}