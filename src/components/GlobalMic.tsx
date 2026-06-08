import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

const BLOCKED_INPUT_TYPES = new Set(['button', 'submit', 'checkbox', 'radio', 'file', 'range', 'color', 'hidden', 'date', 'datetime-local', 'time', 'month', 'week'])

function isEditable(el: Element | null): el is EditableTarget {
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
    return !BLOCKED_INPUT_TYPES.has(type) && !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly
  }
  if (tag === 'textarea') return !(el as HTMLTextAreaElement).disabled && !(el as HTMLTextAreaElement).readOnly
  return (el as HTMLElement).isContentEditable
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(element)
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(element, value)
}

function insertText(target: EditableTarget, text: string) {
  const value = text.trim()
  if (!value) return

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? target.value.length
    const before = target.value.slice(0, start)
    const after = target.value.slice(end)
    const prefix = before && !/\s$/.test(before) ? ' ' : ''
    const suffix = after && !/^\s/.test(after) ? ' ' : ''
    const next = `${before}${prefix}${value}${suffix}${after}`
    setNativeValue(target, next)
    const cursor = before.length + prefix.length + value.length + suffix.length
    target.setSelectionRange?.(cursor, cursor)
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    target.focus()
    return
  }

  target.focus()
  document.execCommand('insertText', false, value)
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
}

function getSpeechRecognition() {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
}

function isLikelyTextTarget(target: EditableTarget | null) {
  if (!target) return false
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    const type = (target.type || 'text').toLowerCase()
    return ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(type)
  }
  return target.isContentEditable
}

export function GlobalMic() {
  const [listening, setListening] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [activeRect, setActiveRect] = useState<DOMRect | null>(null)
  const [supported, setSupported] = useState(true)
  const recRef = useRef<any>(null)
  const targetRef = useRef<EditableTarget | null>(null)

  function showHint(message: string) {
    setErro(message)
    window.setTimeout(() => setErro(null), 4200)
  }

  function refreshActiveRect(target = targetRef.current) {
    if (!target || !isLikelyTextTarget(target)) {
      setActiveRect(null)
      return
    }
    const rect = target.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      setActiveRect(null)
      return
    }
    setActiveRect(rect)
  }

  useEffect(() => {
    setSupported(!!getSpeechRecognition())

    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element | null
      if (isEditable(target)) {
        targetRef.current = target
        window.setTimeout(() => refreshActiveRect(target), 0)
      }
    }
    const onInput = (event: Event) => {
      const target = event.target as Element | null
      if (isEditable(target)) {
        targetRef.current = target
        refreshActiveRect(target)
      }
    }
    const onScrollOrResize = () => refreshActiveRect()

    document.addEventListener('focusin', onFocus)
    document.addEventListener('input', onInput, true)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('input', onInput, true)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [])

  function toggle() {
    const SpeechRec = getSpeechRecognition()
    if (!SpeechRec) {
      setSupported(false)
      showHint('Microfone indisponível neste navegador. No Chrome/Android/PWA, permita microfone e tente novamente.')
      return
    }

    if (listening && recRef.current) {
      recRef.current.stop()
      setListening(false)
      return
    }

    const active = document.activeElement
    if (isEditable(active)) targetRef.current = active

    const target = targetRef.current
    if (!isEditable(target)) {
      showHint('Toque primeiro no campo onde quer escrever. Depois toque em Ditar.')
      return
    }

    try {
      target.focus()
      const rec = new SpeechRec()
      rec.lang = 'pt-BR'
      rec.interimResults = false
      rec.continuous = false
      rec.maxAlternatives = 1

      rec.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || ''
        if (targetRef.current) insertText(targetRef.current, transcript)
      }
      rec.onerror = (event: any) => {
        const code = event?.error || ''
        setListening(false)
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          showHint('Permita o uso do microfone no navegador/PWA para ditar textos.')
        } else {
          showHint('Não consegui ouvir agora. Toque no campo e tente novamente.')
        }
      }
      rec.onend = () => setListening(false)

      recRef.current = rec
      rec.start()
      setListening(true)
      refreshActiveRect(target)
    } catch {
      setListening(false)
      showHint('Não foi possível iniciar o microfone. Verifique permissão do navegador.')
    }
  }

  const inlineStyle = activeRect ? (() => {
    const size = 34
    const gap = 8
    const top = Math.max(74, activeRect.top + activeRect.height / 2 - size / 2)
    // O botão contextual fica fora do campo sempre que houver espaço.
    // Se o campo estiver colado na direita, ele vai para a esquerda do campo,
    // nunca por cima do texto digitado.
    const rightSide = activeRect.right + gap
    const leftSide = activeRect.left - size - gap
    const left = rightSide + size < window.innerWidth - 8
      ? rightSide
      : Math.max(8, leftSide)
    return { top, left }
  })() : undefined

  return (
    <>
      {activeRect && supported && (
        <button
          type="button"
          className={`field-mic ${listening ? 'listening' : ''}`}
          style={inlineStyle}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={toggle}
          title={listening ? 'Parar ditado' : 'Ditar neste campo'}
          aria-label={listening ? 'Parar ditado' : 'Ditar neste campo'}
        >
          {listening ? <MicOff size={14} /> : <Mic size={14} />}
          <span>{listening ? 'Ouvindo' : 'Ditar'}</span>
        </button>
      )}

      <button
        type="button"
        className={`global-mic ${listening ? 'listening' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={toggle}
        title={listening ? 'Parar ditado' : 'Ditar no campo ativo'}
        aria-label={listening ? 'Parar ditado' : 'Ditar no campo ativo'}
      >
        {listening ? <MicOff size={18} /> : <Mic size={18} />}
        <span>{listening ? 'Ouvindo' : 'Ditar'}</span>
      </button>
      {erro && <div className="global-mic-hint">{erro}</div>}
    </>
  )
}
