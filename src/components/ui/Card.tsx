import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

/** Card básico responsivo com tokens do design system. */
export default function Card({ children, style, className, ...rest }: CardProps) {
  const baseStyle: React.CSSProperties = {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-sm)',
    padding: 'var(--card-pad)',
    minWidth: 0,
    overflow: 'hidden',
  }
  return (
    <div className={className} style={{ ...baseStyle, ...style }} {...rest}>
      {children}
    </div>
  )
}
