import React from 'react'
import type { Pagamento } from '../../../lib/api'
import { CircleDollarSign, WalletCards } from 'lucide-react'

interface Props {
  /** Lista completa de lançamentos financeiros */
  records: Pagamento[]
}

/**
 * Mostra os últimos lançamentos financeiros recentes. Ordena os
 * registros por data de criação (created_at) decrescente e exibe
 * no máximo cinco itens. Cada item mostra título, nome da pessoa,
 * data e valor com sinal e cor conforme o tipo (recebimento/pagamento).
 */
export default function RecentFinancialRecords({ records }: Props) {
  const recentes = [...records]
    .filter(r => !!r.created_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)

  if (recentes.length === 0) return null

  function fmt(v: number) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  function fmtDate(d: string) {
    return new Date(d.slice(0, 10)).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }
  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Últimos lançamentos</h2>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
        {recentes.map(r => {
          const isReceb = r.tipo === 'recebimento'
          const color = isReceb ? 'var(--success)' : 'var(--danger)'
          const Icon = isReceb ? CircleDollarSign : WalletCards
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 24, height: 24, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color={color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.pessoa_nome || 'Sem pessoa'} · {fmtDate(r.created_at)}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color }}>{isReceb ? '+' : '-'}{fmt(Number(r.valor || 0))}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}