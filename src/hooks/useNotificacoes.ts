/**
 * useNotificacoes.ts
 * Hook que mantém conexão SSE com o backend para receber notificações em tempo real.
 * Corrigido para NÃO duplicar /api nas chamadas REST.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { apiJson, getAccessToken } from '../lib/api'

export interface Notificacao {
  id: string
  tipo: string
  titulo: string
  body?: string
  referencia_id?: string
  referencia_tipo?: string
  lida: boolean
  created_at: string
}

// ── Som de notificação gerado via Web Audio API (sem arquivo externo) ─────────
function tocarSom(tipo: 'nova_tarefa' | 'concluida' | 'alerta' | 'lembrete') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    const agora = ctx.currentTime
    gain.gain.setValueAtTime(0.3, agora)
    gain.gain.exponentialRampToValueAtTime(0.001, agora + 0.6)

    if (tipo === 'nova_tarefa') {
      // Dois bipes ascendentes
      osc.frequency.setValueAtTime(520, agora)
      osc.frequency.setValueAtTime(780, agora + 0.15)
      osc.start(agora)
      osc.stop(agora + 0.5)
    } else if (tipo === 'concluida') {
      // Três notas ascendentes (sucesso)
      osc.frequency.setValueAtTime(523, agora)
      osc.frequency.setValueAtTime(659, agora + 0.12)
      osc.frequency.setValueAtTime(784, agora + 0.24)
      osc.start(agora)
      osc.stop(agora + 0.5)
    } else if (tipo === 'alerta') {
      // Bipe grave de alerta
      osc.frequency.setValueAtTime(330, agora)
      osc.frequency.setValueAtTime(220, agora + 0.2)
      osc.start(agora)
      osc.stop(agora + 0.5)
    } else {
      // Lembrete: bipe simples
      osc.frequency.setValueAtTime(600, agora)
      osc.start(agora)
      osc.stop(agora + 0.3)
    }

    osc.onended = () => {
      try {
        ctx.close()
      } catch {
        // silencioso
      }
    }
  } catch {
    // Navegador sem suporte a Web Audio — silencioso
  }
}

function tipoParaSom(tipo: string): 'nova_tarefa' | 'concluida' | 'alerta' | 'lembrete' {
  if (tipo === 'nova_tarefa' || tipo === 'tarefa_criada') return 'nova_tarefa'
  if (tipo === 'tarefa_concluida' || tipo === 'tarefa_aprovada') return 'concluida'

  if (
    tipo === 'tarefa_nao_concluida' ||
    tipo === 'tarefa_vencida' ||
    tipo === 'tarefa_devolvida'
  ) {
    return 'alerta'
  }

  return 'lembrete'
}

// ── Hook principal ────────────────────────────────────────────────────────────
export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [toasts, setToasts] = useState<Notificacao[]>([])
  const sseRef = useRef<EventSource | null>(null)
  const reconectarRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carrega notificações iniciais
  const carregar = useCallback(async () => {
    try {
      /**
       * IMPORTANTE:
       * apiJson já adiciona o prefixo /api.
       * Portanto aqui deve ser /notificacoes, e NÃO /api/notificacoes.
       *
       * Errado:  apiJson('/api/notificacoes')  -> vira /api/api/notificacoes
       * Correto: apiJson('/notificacoes')      -> vira /api/notificacoes
       */
      const data = await apiJson<{ notificacoes: Notificacao[]; nao_lidas: number }>(
        '/notificacoes'
      )

      setNotificacoes(Array.isArray(data.notificacoes) ? data.notificacoes : [])
      setNaoLidas(Number(data.nao_lidas || 0))
    } catch {
      // Silencioso — notificações não podem bloquear a UI
    }
  }, [])

  // Adiciona nova notificação recebida via SSE
  const adicionarNotificacao = useCallback((n: Notificacao) => {
    setNotificacoes(prev => [n, ...prev.slice(0, 49)])
    setNaoLidas(prev => prev + 1)

    // Toast visual
    setToasts(prev => [...prev, n])

    // Remove toast após 6s
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== n.id))
    }, 6000)

    // Som
    tocarSom(tipoParaSom(n.tipo))
  }, [])

  // Conecta SSE
  const conectarSse = useCallback(() => {
    const token = getAccessToken()
    if (!token) return

    /**
     * EventSource não aceita header Authorization.
     * Por isso mantemos a URL real do backend com /api uma única vez.
     */
    const url = `/api/notificacoes/stream?_t=${encodeURIComponent(token)}`
    const es = new EventSource(url, { withCredentials: false })

    es.addEventListener('notificacao', (e: MessageEvent) => {
      try {
        const notif: Notificacao = JSON.parse(e.data)
        adicionarNotificacao(notif)
      } catch {
        // ignora payload inválido
      }
    })

    es.onerror = () => {
      es.close()
      sseRef.current = null

      // Tenta reconectar após 5s
      if (reconectarRef.current) clearTimeout(reconectarRef.current)
      reconectarRef.current = setTimeout(conectarSse, 5000)
    }

    sseRef.current = es
  }, [adicionarNotificacao])

  useEffect(() => {
    carregar()
    conectarSse()

    return () => {
      sseRef.current?.close()
      if (reconectarRef.current) clearTimeout(reconectarRef.current)
    }
  }, [carregar, conectarSse])

  // Marcar uma como lida
  const marcarLida = useCallback(async (id: string) => {
    try {
      await apiJson(`/notificacoes/${id}/ler`, { method: 'PATCH' })

      setNotificacoes(prev =>
        prev.map(n => (n.id === id ? { ...n, lida: true } : n))
      )
      setNaoLidas(prev => Math.max(0, prev - 1))
    } catch {
      // silencioso
    }
  }, [])

  // Marcar todas como lidas
  const marcarTodasLidas = useCallback(async () => {
    try {
      await apiJson('/notificacoes/ler-todas', { method: 'PATCH' })

      setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
      setNaoLidas(0)
    } catch {
      // silencioso
    }
  }, [])

  // Fechar toast manualmente
  const fecharToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return {
    notificacoes,
    naoLidas,
    toasts,
    marcarLida,
    marcarTodasLidas,
    fecharToast,
    carregar,
  }
}
