import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
}

/**
 * Componente de botão reutilizável. Usa tokens de cor do design system.
 * Permite variantes, estado de loading e desativação.
 */
export default function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: 'var(--primary)',
      color: '#fff',
    },
    secondary: {
      background: 'var(--secondary)',
      color: '#fff',
    },
    danger: {
      background: 'var(--danger)',
      color: '#fff',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text)',
    },
  }
  const style: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 14,
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...variants[variant],
  }
  return (
    <button
      className={className}
      style={style}
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