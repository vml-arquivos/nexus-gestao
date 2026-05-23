/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react'

export function useSpeechToText(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)

  function toggle() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) {
      alert('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.')
      return
    }

    if (listening && recRef.current) {
      recRef.current.stop()
      setListening(false)
      return
    }

    const rec = new SpeechRec()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.continuous = false
    rec.maxAlternatives = 1

    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      onResult(transcript)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)

    rec.start()
    recRef.current = rec
    setListening(true)
  }

  return { listening, toggle }
}
