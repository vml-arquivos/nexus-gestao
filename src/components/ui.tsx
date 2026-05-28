import React, { useState, useEffect, useCallback } from 'react'
import { Mic, MicOff, X, Check, AlertTriangle, Info } from 'lucide-react'
import { useSpeechToText } from '../hooks/useSpeechToText'

// ── MIC BUTTON ────────────────────────────────────────────
export function MicBtn({ onResult, className = '' }: { onResult: (t: string) => void; className?: string }) {
  const { listening, toggle } = useSpeechToText(onResult)
  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? 'Parar gravação' : 'Falar para preencher'}
      className={`mic-btn ${listening ? 'listening' : ''} ${className}`}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  )
}

// ── AVATAR ────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#2563EB','#06B6D4','#10B981','#F59E0B','#EF4444',
  '#3B82F6','#EC4899','#14B8A6','#F97316','#3B82F6',
]

export function Avatar({ name, size = 40, url }: { name: string; size?: number; url?: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
  if (url) return (
    <img src={url} alt={name} style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
  )
  return (
    <div className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}>
      {initials}
    </div>
  )
}

// ── BADGE ─────────────────────────────────────────────────
export function Badge({ type, label }: { type: string; label?: string }) {
  const labels: Record<string, string> = {
    alta: 'Alta', media: 'Média', baixa: 'Baixa',
    pendente: 'Pendente', em_progresso: 'Em Progresso', concluida: 'Concluída', cancelada: 'Cancelada',
    pago: 'Pago', vencido: 'Vencido',
    funcionario: 'Funcionário', prestador: 'Prestador', credor: 'Credor', devedor: 'Devedor', cliente: 'Cliente',
    pagamento: 'Pagamento', recebimento: 'Recebimento',
    reuniao: 'Reunião', compromisso: 'Compromisso', prazo: 'Prazo', outro: 'Outro',
  }
  return <span className={`badge badge-${type}`}>{label ?? labels[type] ?? type}</span>
}

// ── MODAL ─────────────────────────────────────────────────
export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="sheet-title" style={{ margin: 0 }}>{title}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon" style={{ width: 32, height: 32 }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── TOAST ─────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning'
interface ToastItem { id: number; msg: string; type: ToastType }

let _addToast: ((msg: string, type?: ToastType) => void) | null = null

export function toast(msg: string, type: ToastType = 'success') {
  _addToast?.(msg, type)
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const add = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }, [])

  useEffect(() => { _addToast = add; return () => { _addToast = null } }, [add])

  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {t.type === 'success' && <Check size={14} color="#10B981" />}
          {t.type === 'error' && <X size={14} color="#EF4444" />}
          {t.type === 'warning' && <AlertTriangle size={14} color="#F59E0B" />}
          {t.type === 'info' && <Info size={14} color="#06B6D4" />}
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── CONFIRM DIALOG ────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string
}) {
  if (!open) return null
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ maxWidth: 380 }}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">{title}</h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { onConfirm(); onClose() }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

// ── LOADING SPINNER ───────────────────────────────────────
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--border2)`,
      borderTopColor: 'var(--primary)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

// ── PROGRESS BAR ──────────────────────────────────────────
export function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── EMPTY STATE ───────────────────────────────────────────
export function EmptyState({ icon, title, text, action }: {
  icon: string; title: string; text?: string; action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {text && <p className="empty-text">{text}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
