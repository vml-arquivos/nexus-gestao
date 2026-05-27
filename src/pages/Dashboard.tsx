import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader, CheckCircle2, Clock, AlertTriangle, RotateCcw, Users, ArrowRight } from 'lucide-react'
import { tarefasApi, type Tarefa } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

function n(v: unknown) { return Number(v || 0) }

export default function Dashboard() {
  const { user } = useAuth()
  const [resumo, setResumo] = useState<Record<string, string>>({})
  const [porMembro, setPorMembro] = useState<any[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const isMembro = user?.role === 'membro'

  useEffect(() => {
    async function load() {
      try {
        const [dash, lista] = await Promise.all([tarefasApi.dashboard(), tarefasApi.list()])
        setResumo(dash.resumo || {})
        setPorMembro(dash.por_membro || [])
        setTarefas(lista)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.role])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> Carregando dashboard…</div>

  const hoje = tarefas.filter(t => t.prazo?.slice(0, 10) === new Date().toISOString().slice(0, 10) && !['aprovada','cancelada'].includes(t.status))
  const cards = isMembro
    ? [
        ['Minhas tarefas hoje', hoje.length, 'Para executar agora', Clock, '/minhas-tarefas'],
        ['Pendentes', n(resumo.pendentes), 'Aguardando início', AlertTriangle, '/minhas-tarefas'],
        ['Em progresso', n(resumo.em_progresso), 'Em execução', Clock, '/minhas-tarefas'],
        ['Devolvidas', n(resumo.devolvidas), 'Precisam de ajuste', RotateCcw, '/minhas-tarefas'],
        ['Concluídas', n(resumo.aprovadas) + n(resumo.aguardando_aprovacao), 'Finalizadas/enviadas', CheckCircle2, '/minhas-tarefas'],
      ]
    : [
        ['Tarefas enviadas', n(resumo.total), 'Delegadas por você', Users, '/tarefas'],
        ['Pendentes', n(resumo.pendentes), 'Ainda não iniciadas', AlertTriangle, '/tarefas'],
        ['Aguardando aprovação', n(resumo.aguardando_aprovacao), 'Retorno do membro', CheckCircle2, '/tarefas'],
        ['Não concluídas', n(resumo.nao_concluidas), 'Com motivo informado', AlertTriangle, '/tarefas'],
        ['Devolvidas', n(resumo.devolvidas), 'Com ressalva', RotateCcw, '/tarefas'],
      ]

  return <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 980, margin: '0 auto' }}>
    <div style={{ marginBottom: 22 }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24 }}>Olá, {user?.nome?.split(' ')[0]} 👋</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13 }}>{isMembro ? 'Painel das suas tarefas' : 'Painel de tarefas da equipe'}</p>
    </div>

    <div className="grid-auto" style={{ marginBottom: 22 }}>
      {cards.map(([label, value, sub, Icon, to]) => {
        const I = Icon as typeof Clock
        return <Link key={String(label)} to={String(to)} style={{ textDecoration: 'none' }}><div className="stat-card" style={{ minHeight: 116 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'var(--text3)', fontWeight: 700, fontSize: 12 }}>{String(label)}</span><I size={18} color="var(--primary)" /></div><div style={{ fontSize: 30, fontWeight: 900, marginTop: 8 }}>{String(value)}</div><div style={{ color: 'var(--text3)', fontSize: 12 }}>{String(sub)}</div></div></Link>
      })}
    </div>

    {!isMembro && porMembro.length > 0 && <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><h2 style={{ fontSize: 17, fontWeight: 900 }}>Tarefas por membro</h2><Link to="/tarefas" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: 13 }}>Ver tarefas <ArrowRight size={12} /></Link></div>
      <div style={{ display: 'grid', gap: 10 }}>{porMembro.map(m => <div key={m.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{m.nome}</strong><span style={{ color: 'var(--text3)', fontSize: 12 }}>{Number(m.total || 0)} tarefas</span></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--text3)' }}><span>Pendentes: {Number(m.pendentes || 0)}</span><span>Concluídas: {Number(m.aguardando_aprovacao || 0)}</span><span>Não concluídas: {Number(m.nao_concluidas || 0)}</span><span>Devolvidas: {Number(m.devolvidas || 0)}</span></div></div>)}</div>
    </section>}

    <section>
      <h2 style={{ fontSize: 17, fontWeight: 900, marginBottom: 10 }}>{isMembro ? 'Minhas próximas tarefas' : 'Últimas tarefas'}</h2>
      <div style={{ display: 'grid', gap: 10 }}>{tarefas.slice(0, 5).map(t => <Link key={t.id} to={isMembro ? '/minhas-tarefas' : '/tarefas'} style={{ textDecoration: 'none' }}><div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, color: 'var(--text)' }}><strong>{t.titulo}</strong><div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>{t.status} · prazo {t.prazo ? new Date(`${t.prazo.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : 'sem prazo'}</div></div></Link>)}</div>
    </section>
  </div>
}
