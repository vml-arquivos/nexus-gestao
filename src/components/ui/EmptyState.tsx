import React from 'react'
import { type LucideIcon } from 'lucide-react'

/**
 * EmptyState exibe uma mensagem quando não há dados. Pode mostrar um ícone.
 */
export interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title = 'Nenhum item encontrado', description, action }) => {
  return (
    <div
      style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--text3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {Icon && <Icon size={36} color={'var(--primary)'} />}
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      {description && <p style={{ fontSize: 13, maxWidth: 320 }}>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export default EmptyState