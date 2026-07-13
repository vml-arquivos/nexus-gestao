import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'

/**
 * Campo de data que SEMPRE exibe e aceita digitação no formato brasileiro
 * (dd/mm/aaaa), independente do idioma/SO do dispositivo do usuário.
 *
 * O formato "mm/dd/yyyy" que aparecia em alguns celulares/navegadores vinha
 * do seletor nativo do navegador, que segue o idioma configurado no
 * aparelho — não o `lang="pt-BR"` da página. Este componente resolve isso
 * substituindo o texto visível por um campo próprio, e usa o seletor nativo
 * apenas como atalho opcional (ícone de calendário), nunca forçado.
 *
 * Value/onChange mantêm o mesmo contrato de um <input type="date">
 * (string "YYYY-MM-DD" ou ''), então substitui o input nativo sem exigir
 * nenhuma mudança em quem usa o componente.
 */

function isoToBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

function digitsToBR(digits: string): string {
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`
  return digits
}

function brToIsoIfValid(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br)
  if (!m) return ''
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3])
  const test = new Date(ano, mes - 1, dia)
  if (test.getFullYear() !== ano || test.getMonth() !== mes - 1 || test.getDate() !== dia) return ''
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function DateFieldBR({
  value,
  onChange,
  className,
  required,
  min,
  max,
  disabled,
  id,
  placeholder = 'dd/mm/aaaa',
  title,
}: {
  value: string | null | undefined
  onChange: (value: string) => void
  className?: string
  required?: boolean
  min?: string
  max?: string
  disabled?: boolean
  id?: string
  placeholder?: string
  title?: string
}) {
  const [text, setText] = useState(() => isoToBR(value || ''))
  const nativeRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  // Mantém o texto exibido sincronizado quando o valor muda por fora
  // (ex: ao trocar de tarefa, ao carregar dados do servidor).
  useEffect(() => {
    setText(isoToBR(value || ''))
  }, [value])

  function isWithinRange(iso: string) {
    return (!min || iso >= min) && (!max || iso <= max)
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    const formatted = digitsToBR(digits)
    setText(formatted)
    if (digits.length === 8) {
      const iso = brToIsoIfValid(formatted)
      if (iso && isWithinRange(iso)) { onChange(iso); return }
    }
    if (digits.length === 0) onChange('')
  }

  function handleBlur() {
    // Se o que foi digitado não fecha uma data válida ou viola os limites,
    // volta ao último valor aceito em vez de manter um texto enganoso.
    if (text === '') return
    const iso = brToIsoIfValid(text)
    if (!iso || !isWithinRange(iso)) setText(isoToBR(value || ''))
  }

  function openNativePicker() {
    try { nativeRef.current?.showPicker?.() } catch { /* navegador sem suporte: segue só com digitação */ }
  }

  function handleFieldMouseDown() {
    // Abre o calendário só no clique que dá foco ao campo pela primeira vez.
    // Se o campo já estava focado (clique pra reposicionar o cursor e
    // digitar), não reabre — assim clicar continua abrindo o calendário
    // em todo lugar sem atrapalhar quem prefere digitar a data direto.
    const jaEstavaFocado = document.activeElement === textInputRef.current
    if (!jaEstavaFocado && !disabled) {
      setTimeout(openNativePicker, 0)
    }
  }

  return (
    <div className={`date-field-br${className ? ` ${className}` : ''}`}>
      <input
        ref={textInputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onMouseDown={handleFieldMouseDown}
        disabled={disabled}
        required={required}
        id={id}
        title={title}
        maxLength={10}
        className="date-field-br-input"
      />
      <button
        type="button"
        className="date-field-br-icon-btn"
        disabled={disabled}
        onClick={openNativePicker}
        tabIndex={-1}
        aria-label="Abrir calendário"
      >
        <Calendar size={15} />
      </button>
      {/* Input nativo oculto: só existe para abrir o seletor visual do
          navegador ao clicar no ícone. Nunca recebe foco por digitação. */}
      <input
        ref={nativeRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const iso = e.target.value
          if (!iso || isWithinRange(iso)) onChange(iso)
        }}
        className="date-field-br-native"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
