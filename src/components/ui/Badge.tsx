import React from 'react'

export interface BadgeProps {
  color?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning'
  children: React.ReactNode
}

/**
 * Badge simples para status ou contadores. Usa as variáveis de cor do
 * design system. Pode receber classes adicionais via spread se
 * necessário.
 */
export const Badge: React.FC<BadgeProps> = ({ color = 'primary', children }) => {
  // Mapeia cores para tokens do theme
  const backgrounds: Record<string, string> = {
    primary: 'var(--primary-dim)',
    secondary: 'var(--secondary)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    warning: 'var(--warning)',
  }
  const textColors: Record<string, string> = {
    primary: 'var(--primary-light)',
    secondary: '#fff',
    success: '#fff',
    danger: '#fff',
    warning: '#fff',
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        background: backgrounds[color],
        color: textColors[color],
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  )
}

export default Badge