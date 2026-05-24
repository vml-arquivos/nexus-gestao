import React from 'react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
}

/**
 * Modal simples. Renderiza children em um container centralizado com fundo
 * semi-transparente. Quando `open` é falso, não é renderizado. Chamar
 * `onClose` ao clicar no overlay. O título opcional é exibido no topo.
 */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children }) => {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          minWidth: 300,
          maxWidth: '90vw',
          background: 'var(--bg2)',
          border: `1px solid var(--border)`,
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            style={{
              marginBottom: 12,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: 'var(--text)',
            }}
          >
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export default Modal