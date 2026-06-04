import { useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

function isEditable(el: Element | null): el is EditableTarget {
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
    return !['button', 'submit', 'checkbox', 'radio', 'file', 'date', 'number', 'range', 'color', 'hidden'].includes(type)
  }
  if (tag === 'textarea') return true
  return (el as HTMLElement).isContentEditable
}

function insertText(target: EditableTarget, text: string) {
  const value = text.trim()
  if (!value) return

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? target.value.length
    const prefix = target.value && start > 0 && !/\s$/.test(target.value.slice(0, start)) ? ' ' : ''
    const suffix = target.value && end < target.value.length && !/^\s/.test(target.value.slice(end)) ? ' ' : ''
    target.setRangeText(`${prefix}${value}${suffix}`, start, end, 'end')
    target.dispatchEvent(new Event('input', { bubbles: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    target.focus()
    return
  }

  target.focus()
  document.execCommand('insertText', false, ` ${value}`)
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

export function GlobalMic() {
  const [listening, setListening] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const recRef = useRef<any>(null)
  const targetRef = useRef<EditableTarget | null>(null)

  function toggle() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) {
      setErro('Reconhecimento de voz indisponível neste navegador.')
      window.setTimeout(() => setErro(null), 3500)
      return
    }

    if (listening && recRef.current) {
      recRef.current.stop()
      setListening(false)
      return
    }

    const active = document.activeElement
    if (!isEditable(active)) {
      setErro('Toque primeiro em um campo de texto e depois no microfone.')
      window.setTimeout(() => setErro(null), 3500)
      return
    }

    targetRef.current = active
    const rec = new SpeechRec()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.continuous = false
    rec.maxAlternatives = 1

    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || ''
      if (targetRef.current) insertText(targetRef.current, transcript)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)

    recRef.current = rec
    rec.start()
    setListening(true)
  }

  return (
    <>
      <button
        type="button"
        className={`global-mic ${listening ? 'listening' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={toggle}
        title={listening ? 'Parar ditado' : 'Ditar no campo ativo'}
        aria-label={listening ? 'Parar ditado' : 'Ditar no campo ativo'}
      >
        {listening ? <MicOff size={21} /> : <Mic size={21} />}
      </button>
      {erro && <div className="global-mic-hint">{erro}</div>}
    </>
  )
}
