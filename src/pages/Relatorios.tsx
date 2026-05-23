import React, { useState, useMemo } from 'react'
import { BarChart3, Download, Users, CheckCircle2, Calendar, DollarSign, FileText, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts'
import { store } from '../lib/store'
import { fmtCurrency, fmtDateShort } from '../lib/utils'
import { Avatar, Badge } from '../components/ui'

const COLORS = ['#6C3BFF', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

type Modulo = 'geral' | 'equipe' | 'tarefas' | 'agenda' | 'financeiro' | 'documentos'

export default function Relatorios() {
  const [modulo, setModulo] = useState<Modulo>('geral')
  const [pessoaId, setPessoaId] = useState('')

  const stats = useMemo(() => {
    const tarefasPorStatus = [
      { name: 'Pendente', value: store.tarefas.filter(t => t.status === 'pendente').length, color: '#9CA3AF' },
      { name: 'Em Progresso', value: store.tarefas.filter(t => t.status === 'em_progresso').length, color: '#93C5FD' },
      { name: 'Concluída', value: store.tarefas.filter(t => t.status === 'concluida').length, color: '#6EE7B7' },
      { name: 'Cancelada', value: store.tarefas.filter(t => t.status === 'cancelada').length, color: '#F87171' },
    ].filter(s => s.value > 0)

    const tarefasPorPrioridade = [
      { name: 'Alta', value: store.tarefas.filter(t => t.prioridade === 'alta').length, color: '#EF4444' },
      { name: 'Média', value: store.tarefas.filter(t => t.prioridade === 'media').length, color: '#F59E0B' },
      { name: 'Baixa', value: store.tarefas.filter(t => t.prioridade === 'baixa').length, color: '#10B981' },
    ].filter(s => s.value > 0)

    const finByMonth: Record<string, { mes: string; rec: number; pag: number }> = {}
    store.pagamentos.forEach(p => {
      const mes = (p.vencimento ?? p.created_at).slice(0, 7)
      if (!finByMonth[mes]) finByMonth[mes] = { mes, rec: 0, pag: 0 }
      if (p.tipo === 'recebimento' && p.status === 'pago') finByMonth[mes].rec += Number(p.valor)
      if (p.tipo === 'pagamento' && p.status === 'pago') finByMonth[mes].pag += Number(p.valor)
    })
    const financeiroPorMes = Object.values(finByMonth).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6)

    const tarefasPorPessoa = store.pessoas.map(p => ({
      nome: p.nome.split(' ')[0],
      total: store.tarefas.filter(t => t.responsavel_id === p.id).length,
      concluidas: store.tarefas.filter(t => t.responsavel_id === p.id && t.status === 'concluida').length,
    })).filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 8)

    const docsPorTipo = [
      { name: 'Comprovante', value: store.documentos.filter(d => d.tipo === 'comprovante').length },
      { name: 'Contrato', value: store.documentos.filter(d => d.tipo === 'contrato').length },
      { name: 'Nota Fiscal', value: store.documentos.filter(d => d.tipo === 'nota_fiscal').length },
      { name: 'Outro', value: store.documentos.filter(d => d.tipo === 'outro').length },
    ].filter(d => d.value > 0)

    return { tarefasPorStatus, tarefasPorPrioridade, financeiroPorMes, tarefasPorPessoa, docsPorTipo }
  }, [])

  const pessoaData = useMemo(() => {
    if (!pessoaId) return null
    const p = store.pessoas.find(x => x.id === pessoaId)
    if (!p) return null
    return {
      pessoa: p,
      tarefas: store.tarefas.filter(t => t.responsavel_id === p.id),
      pagamentos: store.pagamentos.filter(pg => pg.pessoa_id === p.id),
      documentos: store.documentos.filter(d => d.pessoa_id === p.id),
      agenda: store.agenda.filter(e => (e.participantes ?? []).some(x => x.id === p.id)),
    }
  }, [pessoaId])

  function exportCSV() {
    const rows: string[][] = [['Módulo', 'Título/Descrição', 'Status', 'Valor', 'Data', 'Pessoa']]
    store.tarefas.forEach(t => rows.push(['Tarefa', t.titulo, t.status, '', t.prazo ?? t.data ?? '', t.responsavel_nome ?? '']))
    store.agenda.forEach(e => rows.push(['Agenda', e.titulo, e.tipo, '', e.data_inicio.slice(0, 10), (e.participantes ?? []).map(p => p.nome).join('; ')]))
    store.pagamentos.forEach(p => rows.push(['Financeiro', p.descricao, p.status, String(p.valor), p.vencimento ?? '', p.pessoa_nome ?? '']))
    store.documentos.forEach(d => rows.push(['Documento', d.titulo, d.tipo, '', d.created_at.slice(0, 10), d.pessoa_nome ?? '']))

    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nexus-relatorio-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const MODULOS = [
    { key: 'geral', label: 'Geral', icon: <BarChart3 size={14} /> },
    { key: 'equipe', label: 'Equipe', icon: <Users size={14} /> },
    { key: 'tarefas', label: 'Tarefas', icon: <CheckCircle2 size={14} /> },
    { key: 'financeiro', label: 'Financeiro', icon: <DollarSign size={14} /> },
    { key: 'documentos', label: 'Docs', icon: <FileText size={14} /> },
  ] as const

  const tooltipStyle = { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title"><BarChart3 size={22} /> Relatórios</div>
          <div className="page-subtitle">Visão consolidada de todos os módulos</div>
        </div>
        <button className="btn btn-secondary" onClick={exportCSV}><Download size={15} /> Exportar CSV</button>
      </div>

      {/* Module tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {MODULOS.map(m => (
          <button key={m.key} className={`tab ${modulo === m.key ? 'active' : ''}`} onClick={() => setModulo(m.key as Modulo)}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* GERAL */}
      {modulo === 'geral' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { label: 'Pessoas', value: store.pessoas.length, icon: '👥', color: 'var(--primary-light)' },
              { label: 'Tarefas', value: store.tarefas.length, icon: '✅', color: 'var(--secondary)' },
              { label: 'Eventos', value: store.agenda.length, icon: '📅', color: 'var(--success)' },
              { label: 'Lançamentos', value: store.pagamentos.length, icon: '💳', color: 'var(--warning)' },
              { label: 'Documentos', value: store.documentos.length, icon: '🗂️', color: 'var(--danger)' },
              { label: 'Saldo', value: fmtCurrency(store.pagamentos.filter(p => p.tipo === 'recebimento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0) - store.pagamentos.filter(p => p.tipo === 'pagamento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0)), icon: '💰', color: 'var(--success)', isText: true },
            ].map(k => (
              <div key={k.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{k.icon}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: k.isText ? 13 : 22, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Financeiro por mês */}
          {stats.financeiroPorMes.length > 0 && (
            <div className="card">
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Financeiro por Mês</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.financeiroPorMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="rec" name="Recebimentos" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pag" name="Pagamentos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* EQUIPE */}
      {modulo === 'equipe' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Relatório por Pessoa</label>
            <select className="form-select" value={pessoaId} onChange={e => setPessoaId(e.target.value)}>
              <option value="">— Selecione uma pessoa —</option>
              {store.pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>

          {pessoaData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar name={pessoaData.pessoa.nome} size={52} url={pessoaData.pessoa.avatar_url} />
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>{pessoaData.pessoa.nome}</div>
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{pessoaData.pessoa.cargo}</div>
                  <div style={{ marginTop: 6 }}><Badge type={pessoaData.pessoa.tipo} /></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                {[
                  { label: 'Tarefas', value: pessoaData.tarefas.length, sub: `${pessoaData.tarefas.filter(t => t.status === 'concluida').length} concluídas`, icon: '✅' },
                  { label: 'Pagamentos', value: pessoaData.pagamentos.length, sub: fmtCurrency(pessoaData.pagamentos.reduce((a, b) => a + Number(b.valor), 0)), icon: '💳' },
                  { label: 'Documentos', value: pessoaData.documentos.length, icon: '🗂️', sub: '' },
                  { label: 'Eventos', value: pessoaData.agenda.length, icon: '📅', sub: '' },
                ].map(s => (
                  <div key={s.label} className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
                    {s.sub && <div style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 2 }}>{s.sub}</div>}
                  </div>
                ))}
              </div>

              {pessoaData.tarefas.length > 0 && (
                <div className="card">
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Tarefas</div>
                  {pessoaData.tarefas.slice(0, 5).map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <Badge type={t.status} />
                      <span style={{ flex: 1, fontSize: 13 }}>{t.titulo}</span>
                      <Badge type={t.prioridade} />
                    </div>
                  ))}
                </div>
              )}

              {pessoaData.pagamentos.length > 0 && (
                <div className="card">
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Pagamentos</div>
                  {pessoaData.pagamentos.slice(0, 5).map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 16 }}>{p.tipo === 'recebimento' ? '💰' : '💸'}</span>
                      <span style={{ flex: 1, fontSize: 13 }}>{p.descricao}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtCurrency(Number(p.valor))}</span>
                      <Badge type={p.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!pessoaId && (
            <div className="card">
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Tarefas por Pessoa</div>
              {stats.tarefasPorPessoa.length === 0 ? (
                <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Nenhuma tarefa atribuída</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.tarefasPorPessoa} layout="vertical">
                    <XAxis type="number" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fill: 'var(--text2)', fontSize: 12 }} width={70} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="total" name="Total" fill="#6C3BFF" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="concluidas" name="Concluídas" fill="#10B981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAREFAS */}
      {modulo === 'tarefas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {stats.tarefasPorStatus.length > 0 && (
              <div className="card">
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Por Status</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={stats.tarefasPorStatus} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                      {stats.tarefasPorStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {stats.tarefasPorPrioridade.length > 0 && (
              <div className="card">
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Por Prioridade</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={stats.tarefasPorPrioridade} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                      {stats.tarefasPorPrioridade.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="card">
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Todas as Tarefas</div>
            {store.tarefas.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Nenhuma tarefa</div>
            ) : (
              store.tarefas.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <Badge type={t.prioridade} />
                  <span style={{ flex: 1, fontSize: 13 }}>{t.titulo}</span>
                  {t.responsavel_nome && <Avatar name={t.responsavel_nome} size={20} />}
                  <Badge type={t.status} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* FINANCEIRO */}
      {modulo === 'financeiro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { label: 'Total Recebido', value: fmtCurrency(store.pagamentos.filter(p => p.tipo === 'recebimento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0)), color: 'var(--success)' },
              { label: 'Total Pago', value: fmtCurrency(store.pagamentos.filter(p => p.tipo === 'pagamento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0)), color: 'var(--danger)' },
              { label: 'A Receber', value: fmtCurrency(store.pagamentos.filter(p => p.tipo === 'recebimento' && p.status === 'pendente').reduce((a, b) => a + Number(b.valor), 0)), color: 'var(--warning)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {stats.financeiroPorMes.length > 0 && (
            <div className="card">
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Fluxo de Caixa</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats.financeiroPorMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtCurrency(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="rec" name="Recebimentos" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981' }} />
                  <Line type="monotone" dataKey="pag" name="Pagamentos" stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="card">
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Todos os Lançamentos</div>
            {store.pagamentos.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Nenhum lançamento</div>
            ) : (
              store.pagamentos.slice(0, 20).map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 16 }}>{p.tipo === 'recebimento' ? '💰' : '💸'}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{p.descricao}</span>
                  {p.pessoa_nome && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.pessoa_nome}</span>}
                  <span style={{ fontWeight: 600, fontSize: 13, color: p.tipo === 'recebimento' ? 'var(--success)' : 'var(--text)' }}>{fmtCurrency(Number(p.valor))}</span>
                  <Badge type={p.status} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* DOCUMENTOS */}
      {modulo === 'documentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {stats.docsPorTipo.length > 0 && (
            <div className="card">
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Documentos por Tipo</div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.docsPorTipo} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} fontSize={11}>
                    {stats.docsPorTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="card">
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Todos os Documentos</div>
            {store.documentos.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Nenhum documento</div>
            ) : (
              store.documentos.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 18 }}>{d.mime_type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{d.titulo}</span>
                  {d.pessoa_nome && <Avatar name={d.pessoa_nome} size={20} />}
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDateShort(d.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
