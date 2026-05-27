/**
 * NotificacaoToast.tsx
 * Banners visuais que aparecem no canto superior direito ao receber notificações em tempo real.
 */
import React from 'react'
import { X, CheckCircle, XCircle, Bell, AlertTriangle } from 'lucide-react'
import type { Notificacao } from '../hooks/useNotificacoes'

interface Props {
  toasts: Notificacao[]
  onFechar: (id: string) => void
}

function iconeParaTipo(tipo: string) {
  if (tipo === 'nova_tarefa' || tipo === 'tarefa_criada') {
    return <Bell size={18} style={{ color: 'var(--color-primary)' }} />
  }

  if (tipo === 'tarefa_concluida' || tipo === 'tarefa_aprovada') {
    return <CheckCircle size={18} style={{ color: 'var(--color-success)' }} />
  }

  if (tipo === 'tarefa_nao_concluida' || tipo === 'tarefa_devolvida') {
    return <XCircle size={18} style={{ color: 'var(--color-danger)' }} />
  }

  if (tipo === 'tarefa_vencida' || tipo === 'lembrete_diario') {
    return <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
  }

  return <Bell size={18} style={{ color: 'var(--color-primary)' }} />
}

function corParaTipo(tipo: string): string {
  if (tipo === 'nova_tarefa' || tipo === 'tarefa_criada') return 'var(--color-primary)'
  if (tipo === 'tarefa_concluida' || tipo === 'tarefa_aprovada') return 'var(--color-success)'
  if (tipo === 'tarefa_nao_concluida' || tipo === 'tarefa_devolvida') return 'var(--color-danger)'
  if (tipo === 'tarefa_vencida' || tipo === 'lembrete_diario') return 'var(--color-warning)'
  return 'var(--color-primary)'
}

export function NotificacaoToast({ toasts, onFechar }: Props) {
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(1rem + env(safe-area-inset-top))',
        right: 'calc(1rem + env(safe-area-inset-right))',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        maxWidth: '360px',
        width: 'min(100% - 2rem, 360px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            background: 'var(--color-surface)',
            border: `2px solid ${corParaTipo(toast.tipo)}`,
            borderRadius: '12px',
            padding: '0.875rem 1rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            pointerEvents: 'all',
            animation: 'slideInRight 0.3s ease',
            minWidth: 0,
          }}
        >
          <div style={{ flexShrink: 0, marginTop: '2px' }}>
            {iconeParaTipo(toast.tipo)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: '0.875rem',
                color: 'var(--color-text-primary)',
                marginBottom: toast.body ? '0.25rem' : 0,
                overflowWrap: 'anywhere',
              }}
            >
              {toast.titulo}
            </div>

            {toast.body && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {toast.body}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onFechar(toast.id)}
            aria-label="Fechar notificação"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: '2px',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
