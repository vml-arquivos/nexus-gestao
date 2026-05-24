import React from 'react'

/**
 * Componente de loading spinner. Usa apenas CSS inline e tokens de cor.
 */
export const Loading: React.FC<{ size?: number }> = ({ size = 24 }) => {
  const borderSize = Math.max(2, Math.round(size / 8))
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${borderSize}px solid var(--border)`,
        borderTopColor: 'var(--primary)',
        animation: 'spin 1s linear infinite',
      }}
    />
  )
}

export default Loading