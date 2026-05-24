import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

/**
 * Card básico com sombra e borda arredondada. Usa variáveis do design system.
 */
export default function Card({ children, style, className, ...rest }: CardProps) {
  const baseStyle: React.CSSProperties = {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-sm)',
    padding: 16,
  }
  return (
    <div className={className} style={{ ...baseStyle, ...style }} {...rest}>
      {children}
    </div>
  )
}