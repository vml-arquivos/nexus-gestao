import { useState, useEffect, useMemo } from 'react'
import { BarChart3, Download, Loader, Users, Search, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { tarefasApi, pagamentosApi, equipeApi, type Tarefa, type Pagamento, type Pessoa, type MembroEquipe } from '../lib/api'
import { useVisualTexts } from '../hooks/useVisualTexts'

const COLORS = ['#2563EB', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#3B82F6']

function fmtCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function Relatorios() {
  const { t } = useVisualTexts()
  const [tarefas, setTarefas]       = useState<Tarefa[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [pessoas, setPessoas]       = useState<Pessoa[]>([])
  const [membros, setMembros]       = useState<MembroEquipe[]>([])
  const [loading, setLoading]       = useState(true)

  // ── Painel de execução por membro ──────────────────────────────────────
  const [membroSelecionado, setMembroSelecionado] = useState<string>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [buscaMembro, setBuscaMembro] = useState('')
  const [linhaExpandida, setLinhaExpandida] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([tarefasApi.list(), pagamentosApi.list(), equipeApi.pessoas(), equipeApi.membros()])
      .then(([t, p, ps, mb]) => { setTarefas(t); setPagamentos(p); setPessoas(ps); setMembros(mb) })
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

  const hojeISO = new Date().toISOString().slice(0, 10)

  const STATUS_LABEL: Record<string, string> = {
    pendente: 'Pendente',
    em_progresso: 'Em execução',
    reenviada: 'Reenviada',
    devolvida: 'Devolvida',
    concluida: 'Concluída',
    aprovada: 'Aprovada',
    nao_concluida: 'Não concluída',
    cancelada: 'Cancelada',
    aguardando_aprovacao: 'Aguardando aprovação',
  }
  const STATUS_COLOR: Record<string, string> = {
    pendente: '#9CA3AF',
    em_progresso: '#3B82F6',
    reenviada: '#3B82F6',
    devolvida: '#F59E0B',
    concluida: '#10B981',
    aprovada: '#10B981',
    nao_concluida: '#EF4444',
    cancelada: '#6B7280',
    aguardando_aprovacao: '#8B5CF6',
  }

  type LinhaExecucao = {
    id: string
    membroId: string
    membroNome: string
    tarefaId: string
    tarefaTitulo: string
    listaTitulo?: string
    tipo: 'tarefa' | 'item'
    itemTexto?: string
    status: string
    prioridade?: string
    prazo?: string
    observacao?: string
    atrasada: boolean
  }

  // Une membros da equipe (que têm status/perfil) com pessoas cadastradas,
  // para o seletor funcionar mesmo que a lista de "membros" venha vazia.
  const pessoasSelecionaveis = useMemo(() => {
    const porId = new Map<string, { id: string; nome: string }>()
    membros.forEach(m => porId.set(m.id, { id: m.id, nome: m.nome }))
    pessoas.forEach(p => { if (!porId.has(p.id)) porId.set(p.id, { id: p.id, nome: p.nome }) })
    return Array.from(porId.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [membros, pessoas])

  const linhasExecucao = useMemo<LinhaExecucao[]>(() => {
    const linhas: LinhaExecucao[] = []
    const nomePorId = new Map(pessoasSelecionaveis.map(p => [p.id, p.nome]))

    tarefas.forEach(t => {
      const observacaoTarefa = t.observacao_conclusao || t.resposta_obs || t.motivo_nao_conclusao || t.ressalva_gestor || ''
      const atrasadaTarefa = !!t.prazo && t.prazo.slice(0, 10) < hojeISO && !['concluida', 'aprovada', 'cancelada'].includes(t.status)

      // Responsável direto da tarefa (tarefa atribuída ou assumida)
      const donoId = t.responsavel_id || t.aceita_por
      if (donoId) {
        linhas.push({
          id: `t-${t.id}`,
          membroId: donoId,
          membroNome: t.responsavel_nome || t.aceita_por_nome || nomePorId.get(donoId) || 'Sem nome',
          tarefaId: t.id,
          tarefaTitulo: t.titulo,
          tipo: 'tarefa',
          status: t.status,
          prioridade: t.prioridade,
          prazo: t.prazo,
          observacao: observacaoTarefa,
          atrasada: atrasadaTarefa,
        })
      }

      // Itens do checklist distribuídos para pessoas específicas dentro de
      // uma tarefa de equipe (cada um conta como uma unidade de execução
      // própria, mesmo que a tarefa "mãe" esteja com outro responsável).
      ;(t.checklist || []).forEach(item => {
        const itemDonoId = item.responsavel_id
        if (!itemDonoId || itemDonoId === donoId) return
        let statusItem = 'pendente'
        if (item.feito && item.aprovacao_status === 'aprovada') statusItem = 'concluida'
        else if (item.feito && item.aprovacao_status === 'devolvida') statusItem = 'devolvida'
        else if (item.feito) statusItem = 'aguardando_aprovacao'
        const atrasadaItem = !!item.data && item.data.slice(0, 10) < hojeISO && statusItem !== 'concluida'
        linhas.push({
          id: `i-${t.id}-${item.id}`,
          membroId: itemDonoId,
          membroNome: item.responsavel_nome || nomePorId.get(itemDonoId) || 'Sem nome',
          tarefaId: t.id,
          tarefaTitulo: t.titulo,
          tipo: 'item',
          itemTexto: item.texto,
          status: statusItem,
          prioridade: t.prioridade,
          prazo: item.data || t.prazo,
          observacao: item.descricao || '',
          atrasada: atrasadaItem,
        })
      })
    })
    return linhas
  }, [tarefas, pessoasSelecionaveis, hojeISO])

  const linhasFiltradas = useMemo(() => {
    return linhasExecucao.filter(l => {
      if (membroSelecionado !== 'todos' && l.membroId !== membroSelecionado) return false
      if (statusFiltro === 'atrasadas') { if (!l.atrasada) return false }
      else if (statusFiltro !== 'todos' && l.status !== statusFiltro) return false
      if (buscaMembro.trim() && !l.tarefaTitulo.toLowerCase().includes(buscaMembro.trim().toLowerCase()) && !(l.itemTexto || '').toLowerCase().includes(buscaMembro.trim().toLowerCase())) return false
      return true
    })
  }, [linhasExecucao, membroSelecionado, statusFiltro, buscaMembro])

  const kpisExecucao = useMemo(() => {
    const total = linhasFiltradas.length
    const concluidas = linhasFiltradas.filter(l => l.status === 'concluida' || l.status === 'aprovada').length
    const pendentes = linhasFiltradas.filter(l => l.status === 'pendente').length
    const emExecucao = linhasFiltradas.filter(l => l.status === 'em_progresso' || l.status === 'reenviada').length
    const atrasadas = linhasFiltradas.filter(l => l.atrasada).length
    const aguardando = linhasFiltradas.filter(l => l.status === 'aguardando_aprovacao').length
    const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0
    return { total, concluidas, pendentes, emExecucao, atrasadas, aguardando, taxaConclusao }
  }, [linhasFiltradas])

  function exportarExecucaoCSV() {
    const linhas = [
      ['Membro', 'Tarefa', 'Item', 'Status', 'Prioridade', 'Prazo', 'Atrasada', 'Observação'],
      ...linhasFiltradas.map(l => [
        l.membroNome, l.tarefaTitulo, l.itemTexto || '', STATUS_LABEL[l.status] || l.status,
        l.prioridade || '', l.prazo ? l.prazo.slice(0, 10) : '', l.atrasada ? 'Sim' : 'Não', l.observacao || '',
      ]),
    ]
    const csv = linhas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `nexus-execucao-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

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
    { label: 'Total Tarefas',  value: String(tarefas.length),               color: '#2563EB' },
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
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>{t('reports.pageTitle')}</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>{t('reports.pageSubtitle')}</p>
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

      {/* ── Execução por Membro ─────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color="#2563EB" /> Execução por Membro da Equipe
          </div>
          <button className="btn btn-secondary" onClick={exportarExecucaoCSV} style={{ gap: 6 }}>
            <Download size={14} /> Exportar
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 14 }}>
          <select className="form-input" value={membroSelecionado} onChange={e => setMembroSelecionado(e.target.value)}>
            <option value="todos">Todos os membros</option>
            {pessoasSelecionaveis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select className="form-input" value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}>
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="em_progresso">Em execução</option>
            <option value="aguardando_aprovacao">Aguardando aprovação</option>
            <option value="concluida">Concluída</option>
            <option value="devolvida">Devolvida</option>
            <option value="atrasadas">Somente atrasadas</option>
          </select>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Buscar tarefa ou item..."
              value={buscaMembro}
              onChange={e => setBuscaMembro(e.target.value)}
            />
          </div>
        </div>

        {/* KPIs do recorte selecionado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Total', value: kpisExecucao.total, color: '#2563EB' },
            { label: 'Concluídas', value: kpisExecucao.concluidas, color: '#10B981' },
            { label: 'Em execução', value: kpisExecucao.emExecucao, color: '#3B82F6' },
            { label: 'Pendentes', value: kpisExecucao.pendentes, color: '#9CA3AF' },
            { label: 'Aguard. aprovação', value: kpisExecucao.aguardando, color: '#8B5CF6' },
            { label: 'Atrasadas', value: kpisExecucao.atrasadas, color: '#EF4444' },
            { label: 'Taxa conclusão', value: `${kpisExecucao.taxaConclusao}%`, color: '#10B981' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 16, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Tabela detalhada */}
        {linhasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 12px', color: 'var(--text3)', fontSize: 13 }}>
            Nenhum registro encontrado para esse filtro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linhasFiltradas.map(l => {
              const expandido = linhaExpandida === l.id
              const temObservacao = !!l.observacao?.trim()
              return (
                <div key={l.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setLinhaExpandida(expandido ? null : l.id)}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: STATUS_COLOR[l.status] || '#9CA3AF',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.tipo === 'item' ? `${l.tarefaTitulo} · ${l.itemTexto}` : l.tarefaTitulo}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>{l.membroNome}</span>
                        <span>·</span>
                        <span style={{ color: STATUS_COLOR[l.status] }}>{STATUS_LABEL[l.status] || l.status}</span>
                        {l.prazo && <span>· Prazo: {l.prazo.slice(0, 10).split('-').reverse().join('/')}</span>}
                        {l.atrasada && <span style={{ color: '#EF4444', fontWeight: 700 }}>· Atrasada</span>}
                        {temObservacao && <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}><MessageSquare size={11} /> Observação</span>}
                      </div>
                    </div>
                    {expandido ? <ChevronUp size={16} color="var(--text3)" /> : <ChevronDown size={16} color="var(--text3)" />}
                  </button>
                  {expandido && (
                    <div style={{ padding: '0 12px 12px 30px', fontSize: 12, color: 'var(--text2)' }}>
                      {temObservacao
                        ? <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>{l.observacao}</div>
                        : <div style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Sem observações registradas.</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Graficos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Tarefas por status */}
        {stats.tarefasPorStatus.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} color="#2563EB" /> Tarefas por Status
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
