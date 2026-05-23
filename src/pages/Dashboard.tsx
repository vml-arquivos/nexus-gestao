import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Calendar, DollarSign, Users, TrendingUp, TrendingDown, Clock, AlertTriangle, ArrowRight, Loader } from 'lucide-react'
import { tarefasApi, agendaApi, pagamentosApi, equipeApi, type Tarefa, type Evento, type Pagamento, type MembroEquipe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d: string) {
  return new Date(d + (d.length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard() {
  const { user } = useAuth()
  const hoje = new Date().toISOString().slice(0, 10)
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  const [tarefas, setTarefas]     = useState<Tarefa[]>([])
  const [agenda, setAgenda]       = useState<Evento[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [membros, setMembros]     = useState<MembroEquipe[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [t, a, p, m] = await Promise.all([
          tarefasApi.list(),
          agendaApi.list(),
          pagamentosApi.list(),
          user?.role === 'gestor' ? equipeApi.membros() : Promise.resolve([]),
        ])
        setTarefas(t)
        setAgenda(a)
        setPagamentos(p)
        setMembros(m)
      } catch (e) {
        console.warn('Dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const metrics = useMemo(() => {
    const tarefasPendentes  = tarefas.filter(t => t.status === 'pendente').length
    const tarefasConcluidas = tarefas.filter(t => t.status === 'concluida').length
    const totalTarefas      = tarefas.length
    const eventosHoje       = agenda.filter(e => e.data_inicio.startsWith(hoje))
    const receita  = pagamentos.filter(p => p.tipo === 'recebimento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0)
    const despesas = pagamentos.filter(p => p.tipo === 'pagamento'   && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0)
    const saldo    = receita - despesas
    const vencidos = pagamentos.filter(p => {
      if (p.status !== 'pendente' || !p.vencimento) return false
      return new Date(p.vencimento + 'T12:00') < new Date()
    })
    return { tarefasPendentes, tarefasConcluidas, totalTarefas, eventosHoje, receita, despesas, saldo, vencidos }
  }, [tarefas, agenda, pagamentos, hoje])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text3)' }}>
        <Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} />
        Carregando dashboard…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      {/* Saudação */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>
          {saudacao}, {user?.nome?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
          {user?.role === 'gestor' ? '👑 Gestor' : '👤 Membro'} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
      </div>

      {/* Alertas */}
      {metrics.vencidos.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <AlertTriangle size={16} color="#EF4444" />
          <span><strong style={{ color: '#EF4444' }}>{metrics.vencidos.length} pagamento{metrics.vencidos.length > 1 ? 's' : ''}</strong> vencido{metrics.vencidos.length > 1 ? 's' : ''} — verifique o financeiro</span>
          <Link to="/financeiro" style={{ marginLeft: 'auto', color: '#EF4444', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Ver →</Link>
        </div>
      )}

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: CheckCircle2, label: 'Tarefas Pendentes', value: metrics.tarefasPendentes, sub: `${metrics.tarefasConcluidas} concluídas`, color: '#6C3BFF', to: '/tarefas' },
          { icon: Calendar,     label: 'Eventos Hoje',      value: metrics.eventosHoje.length, sub: 'compromissos', color: '#06B6D4', to: '/agenda' },
          { icon: DollarSign,   label: 'Saldo',             value: fmt(metrics.saldo), sub: `Receita: ${fmt(metrics.receita)}`, color: metrics.saldo >= 0 ? '#10B981' : '#EF4444', to: '/financeiro' },
          { icon: Users,        label: 'Equipe',            value: membros.length || '—', sub: 'membros ativos', color: '#F59E0B', to: '/equipe' },
        ].map(({ icon: Icon, label, value, sub, color, to }) => (
          <Link key={label} to={to} style={{ textDecoration: 'none' }}>
            <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px', cursor: 'pointer', transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={color} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{label}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Tarefas urgentes */}
      {tarefas.filter(t => t.status !== 'concluida' && t.prioridade === 'alta').length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>🔴 Tarefas Urgentes</h2>
            <Link to="/tarefas" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tarefas.filter(t => t.status !== 'concluida' && t.prioridade === 'alta').slice(0, 3).map(t => (
              <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</div>
                  {t.prazo && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Prazo: {fmtDate(t.prazo)}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                  {t.status === 'pendente' ? 'Pendente' : 'Em Progresso'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eventos de hoje */}
      {metrics.eventosHoje.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>📅 Hoje na Agenda</h2>
            <Link to="/agenda" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Ver agenda <ArrowRight size={12} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {metrics.eventosHoje.slice(0, 3).map(e => (
              <div key={e.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={14} color="var(--secondary)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{e.titulo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtTime(e.data_inicio)}{e.local ? ` · ${e.local}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financeiro resumo */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>💳 Resumo Financeiro</h2>
          <Link to="/financeiro" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            Detalhes <ArrowRight size={12} />
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} color="#10B981" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Receitas</div>
              <div style={{ fontWeight: 700, color: '#10B981' }}>{fmt(metrics.receita)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingDown size={18} color="#EF4444" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Despesas</div>
              <div style={{ fontWeight: 700, color: '#EF4444' }}>{fmt(metrics.despesas)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
