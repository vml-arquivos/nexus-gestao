import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
}

/**
 * Botão reutilizável responsivo. Mantém identidade visual Nexus e
 * usa os tokens globais de tema, sem cores hardcoded fora do necessário.
 */
export default function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className,
  style,
  ...rest
}: ButtonProps) {
  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--text-on-primary)' },
    secondary: { background: 'var(--secondary)', color: 'var(--text-on-primary)' },
    danger: { background: 'var(--danger)', color: 'var(--text-on-primary)' },
    ghost: { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' },
  }

  const baseStyle: React.CSSProperties = {
    minHeight: 42,
    minWidth: 0,
    padding: 'clamp(8px, 1.6vw, 10px) clamp(12px, 2.2vw, 18px)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    whiteSpace: 'normal',
    textAlign: 'center',
    lineHeight: 1.2,
    touchAction: 'manipulation',
    ...variants[variant],
    ...style,
  }

  return (
    <button
      className={className}
      style={baseStyle}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span
          className="spinner"
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
      {children}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  )
}
