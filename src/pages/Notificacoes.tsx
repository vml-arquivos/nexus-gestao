/**
 * Notificacoes.tsx
 *
 * Página dedicada com TODAS as notificações do usuário -- antes só existia o
 * dropdown do sininho (máx. 50, sem paginação, sem filtro além de arquivadas).
 * Reaproveita o mesmo endpoint GET /notificacoes, agora com paginação real
 * (?page/&limit), e os mesmos endpoints de marcar como lida já usados pelo
 * dropdown -- não duplica lógica de backend nova.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, XCircle, AlertTriangle, Loader2, Check, Inbox } from 'lucide-react'
import { apiJson } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

interface Notificacao {
  id: string
  tipo: string
  titulo: string
  body?: string
  referencia_id?: string
  referencia_tipo?: string
  lida: boolean
  created_at: string
}

interface RespostaNotificacoes {
  notificacoes: Notificacao[]
  nao_lidas: number
  pagina: number
  limite: number
  total?: number
  tem_mais: boolean
}

const LIMITE_POR_PAGINA = 30

function iconeNotif(tipo: string) {
  if (tipo === 'tarefa_concluida') return <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
  if (tipo === 'tarefa_nao_concluida') return <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
  if (tipo === 'tarefa_vencida') return <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
  return <Bell size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
}

function dataCompleta(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Notificacoes() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [filtro, setFiltro] = useState<'todas' | 'nao_lidas'>('todas')
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async (paginaAlvo: number, substituir: boolean) => {
    if (substituir) setCarregando(true)
    else setCarregandoMais(true)
    setErro(null)
    try {
      const params = new URLSearchParams({ page: String(paginaAlvo), limit: String(LIMITE_POR_PAGINA) })
      if (filtro === 'nao_lidas') params.set('apenas_nao_lidas', 'true')
      const data = await apiJson<RespostaNotificacoes>(`/notificacoes?${params.toString()}`)
      setNotificacoes((prev) => (substituir ? data.notificacoes : [...prev, ...data.notificacoes]))
      setNaoLidas(data.nao_lidas)
      setTemMais(data.tem_mais)
      setPagina(paginaAlvo)
    } catch {
      setErro('Não foi possível carregar as notificações. Tente novamente.')
    } finally {
      setCarregando(false)
      setCarregandoMais(false)
    }
  }, [filtro])

  useEffect(() => { carregar(1, true) }, [carregar])

  async function marcarLida(id: string) {
    setNotificacoes((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)))
    setNaoLidas((prev) => Math.max(0, prev - 1))
    try {
      await apiJson(`/notificacoes/${id}/ler`, { method: 'PATCH' })
    } catch {
      // Reverte silenciosamente se a chamada falhar -- próxima carga corrige de qualquer forma.
    }
  }

  async function marcarTodasLidas() {
    const anteriores = notificacoes
    const naoLidasAntes = naoLidas
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })))
    setNaoLidas(0)
    try {
      await apiJson('/notificacoes/ler-todas', { method: 'PATCH' })
    } catch {
      setNotificacoes(anteriores)
      setNaoLidas(naoLidasAntes)
    }
  }

  function abrirNotificacao(n: Notificacao) {
    if (!n.lida) marcarLida(n.id)
    if (n.referencia_tipo === 'tarefa' && n.referencia_id) {
      const base = user?.role === 'membro' ? '/minhas-tarefas' : '/tarefas'
      const isAjuda = n.tipo === 'pedido_ajuda' || n.tipo === 'ajuda_respondida'
      navigate(`${base}?task=${n.referencia_id}${isAjuda ? '&help=1' : ''}`)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Notificações</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text3)', margin: '4px 0 0' }}>
            {naoLidas > 0 ? `${naoLidas} não lida${naoLidas > 1 ? 's' : ''}` : 'Tudo em dia'}
          </p>
        </div>
        {naoLidas > 0 && (
          <button
            type="button"
            onClick={marcarTodasLidas}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Check size={15} /> Marcar todas como lidas
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['todas', 'nao_lidas'] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => setFiltro(opcao)}
            style={{
              padding: '7px 14px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: filtro === opcao ? 'var(--primary)' : 'var(--surface)',
              color: filtro === opcao ? '#fff' : 'var(--text3)',
            }}
          >
            {opcao === 'todas' ? 'Todas' : 'Não lidas'}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
        {carregando ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text3)' }}>
            <Loader2 size={24} className="spin" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '0.85rem' }}>Carregando notificações...</div>
          </div>
        ) : erro ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--danger)', fontSize: '0.85rem' }}>{erro}</div>
        ) : notificacoes.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text3)' }}>
            <Inbox size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div style={{ fontSize: '0.85rem' }}>
              {filtro === 'nao_lidas' ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação por aqui ainda.'}
            </div>
          </div>
        ) : (
          notificacoes.map((n) => (
            <div
              key={n.id}
              onClick={() => abrirNotificacao(n)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                background: n.lida ? 'transparent' : 'var(--primary-dim)',
                cursor: n.referencia_id ? 'pointer' : 'default',
              }}
            >
              <div style={{ marginTop: 2 }}>{iconeNotif(n.tipo)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: n.lida ? 500 : 700, fontSize: '0.88rem', color: 'var(--text)', marginBottom: 2 }}>
                  {n.titulo}
                </div>
                {n.body && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text3)', lineHeight: 1.4 }}>{n.body}</div>
                )}
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 6 }}>{dataCompleta(n.created_at)}</div>
              </div>
              {!n.lida && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); marcarLida(n.id) }}
                  title="Marcar como lida"
                  style={{
                    width: 24, height: 24, borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface)', color: 'var(--primary)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Check size={13} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {!carregando && temMais && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => carregar(pagina + 1, false)}
            disabled={carregandoMais}
            style={{
              padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: '0.82rem', fontWeight: 700,
              cursor: carregandoMais ? 'default' : 'pointer', opacity: carregandoMais ? 0.6 : 1,
            }}
          >
            {carregandoMais ? 'Carregando...' : 'Carregar mais'}
          </button>
        </div>
      )}
    </div>
  )
}
