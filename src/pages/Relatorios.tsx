import { useState, useEffect, useMemo } from 'react'
import { BarChart3, Download, Loader } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { tarefasApi, pagamentosApi, equipeApi, type Tarefa, type Pagamento, type Pessoa } from '../lib/api'

const COLORS = ['#6C3BFF', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

function fmtCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function Relatorios() {
  const [tarefas, setTarefas]       = useState<Tarefa[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [pessoas, setPessoas]       = useState<Pessoa[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    Promise.all([tarefasApi.list(), pagamentosApi.list(), equipeApi.pessoas()])
      .then(([t, p, ps]) => { setTarefas(t); setPagamentos(p); setPessoas(ps) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const tarefasPorStatus = [
      { name: 'Pendente',     value: tarefas.filter(t => t.status === 'pendente').length,     color: '#9CA3AF' },
      { name: 'Em Progresso', value: tarefas.filter(t => t.status === 'em_progresso').length, color: '#93C5FD' },
      { name: 'Concluida',    value: tarefas.filter(t => t.status === 'concluida').length,    color: '#6EE7B7' },
      { name: 'Cancelada',    value: tarefas.filter(t => t.status === 'cancelada').length,    color: '#F87171' },
    ].filter(s => s.value > 0)

    const tarefasPorPrioridade = [
      { name: 'Alta',  value: tarefas.filter(t => t.prioridade === 'alta').length,  color: '#EF4444' },
      { name: 'Media', value: tarefas.filter(t => t.prioridade === 'media').length, color: '#F59E0B' },
      { name: 'Baixa', value: tarefas.filter(t => t.prioridade === 'baixa').length, color: '#10B981' },
    ].filter(s => s.value > 0)

    const finByMonth: Record<string, { mes: string; rec: number; pag: number }> = {}
    pagamentos.forEach(p => {
      const mes = (p.pago_em || p.vencimento || p.created_at).slice(0, 7)
      if (!finByMonth[mes]) finByMonth[mes] = { mes, rec: 0, pag: 0 }
      if (p.tipo === 'recebimento' && p.status === 'pago') finByMonth[mes].rec += Number(p.valor)
      if (p.tipo === 'pagamento' && p.status === 'pago') finByMonth[mes].pag += Number(p.valor)
    })
    const finMensal = Object.values(finByMonth).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6)

    const totalReceitas = pagamentos.filter(p => p.tipo === 'recebimento' && p.status === 'pago').reduce((s, p) => s + Number(p.valor), 0)
    const totalDespesas = pagamentos.filter(p => p.tipo === 'pagamento' && p.status === 'pago').reduce((s, p) => s + Number(p.valor), 0)
    const saldo = totalReceitas - totalDespesas

    const tarefasPorPessoa = pessoas.map(p => ({
      nome: p.nome.split(' ')[0],
      concluidas: tarefas.filter(t => t.responsavel_id === p.id && t.status === 'concluida').length,
      pendentes: tarefas.filter(t => t.responsavel_id === p.id && t.status === 'pendente').length,
    })).filter(p => p.concluidas + p.pendentes > 0)

    return { tarefasPorStatus, tarefasPorPrioridade, finMensal, totalReceitas, totalDespesas, saldo, tarefasPorPessoa }
  }, [tarefas, pagamentos, pessoas])

  function exportarCSV() {
    const linhas = [
      ['Modulo', 'Titulo', 'Status', 'Valor', 'Data'],
      ...tarefas.map(t => ['Tarefa', t.titulo, t.status, '', t.created_at.slice(0, 10)]),
      ...pagamentos.map(p => ['Pagamento', p.titulo, p.status, String(p.valor), p.vencimento || p.created_at.slice(0, 10)]),
    ]
    const csv = linhas.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `nexus-relatorio-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--text3)' }}>
      <Loader size={24} style={{ animation: 'spin 1s linear infinite', marginRight: 12 }} /> Carregando relatorios...
    </div>
  )

  const kpis = [
    { label: 'Total Tarefas',  value: String(tarefas.length),               color: '#6C3BFF' },
    { label: 'Concluidas',     value: String(tarefas.filter(t => t.status === 'concluida').length), color: '#10B981' },
    { label: 'Receitas',       value: fmtCurrency(stats.totalReceitas),      color: '#06B6D4' },
    { label: 'Despesas',       value: fmtCurrency(stats.totalDespesas),      color: '#EF4444' },
    { label: 'Saldo',          value: fmtCurrency(stats.saldo),              color: stats.saldo >= 0 ? '#10B981' : '#EF4444' },
    { label: 'Pessoas',        value: String(pessoas.length),                color: '#F59E0B' },
  ]

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 760, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Relatorios</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Visao geral da organizacao</p>
        </div>
        <button className="btn btn-secondary" onClick={exportarCSV} style={{ gap: 6 }}><Download size={14} /> Exportar CSV</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Graficos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Tarefas por status */}
        {stats.tarefasPorStatus.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} color="#6C3BFF" /> Tarefas por Status
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={stats.tarefasPorStatus} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {stats.tarefasPorStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Financeiro mensal */}
        {stats.finMensal.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Financeiro Mensal</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.finMensal}>
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => fmtCurrency(Number(v))} />
                <Bar dataKey="rec" name="Receitas" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pag" name="Despesas" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tarefas por pessoa */}
        {stats.tarefasPorPessoa.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Tarefas por Pessoa</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.tarefasPorPessoa} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="concluidas" name="Concluidas" fill="#10B981" stackId="a" />
                <Bar dataKey="pendentes" name="Pendentes" fill="#F59E0B" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Prioridades */}
        {stats.tarefasPorPrioridade.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Tarefas por Prioridade</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {stats.tarefasPorPrioridade.map(p => (
                <div key={p.name} style={{ flex: 1, textAlign: 'center', background: p.color + '18', border: `1px solid ${p.color}30`, borderRadius: 10, padding: '12px 8px' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, color: p.color }}>{p.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{p.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tarefas.length === 0 && pagamentos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <div style={{ fontWeight: 700 }}>Nenhum dado para exibir ainda</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Adicione tarefas e pagamentos para ver os relatorios</div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
