import React from 'react'

/**
 * Componente de input de formulário reutilizável. Aceita todas as props de
 * um input HTML padrão e um rótulo opcional. Quando fornecido, o rótulo
 * é exibido acima do campo. Erros são exibidos abaixo.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...rest }) => {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
          {label}
        </label>
      )}
      <input
        {...rest}
        style={{
          padding: '9px 12px',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid var(--border)`,
          background: 'var(--bg2)',
          color: 'var(--text)',
          fontSize: 14,
          outline: 'none',
        }}
      />
      {error && (
        <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>
      )}
    </div>
  )
}

export default Input