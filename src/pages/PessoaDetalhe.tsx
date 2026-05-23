import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  History,
  Loader,
  Plus,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { documentosApi, type Documento, type HistoricoPessoa, type Pagamento, type Tarefa } from '../lib/api'

type Tab = 'resumo' | 'pagar' | 'receber' | 'arquivos' | 'tarefas' | 'historico'

type GrupoPessoa = {
  id: string
  grupoId: string | null
  titulo: string
  tipo: 'pagamento' | 'recebimento'
  itens: Pagamento[]
  total: number
  pendente: number
  pago: number
  proximoVencimento?: string
  status: string
}

function fmt(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d?: string) {
  if (!d) return '—'
  const date = new Date(`${d.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR')
}

function extrairGrupoId(obs?: string): string | null {
  if (!obs) return null
  const m = obs.match(/grupo_id:([^|\s]+)/)
  return m ? m[1] : null
}

function agruparPagamentos(pags: Pagamento[]): GrupoPessoa[] {
  const map = new Map<string, Pagamento[]>()
  for (const p of pags) {
    const gid = extrairGrupoId(p.obs)
    const key = gid ? `grupo:${gid}` : `item:${p.id}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }

  return Array.from(map.entries()).map(([key, itens]) => {
    const ordenados = [...itens].sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))
    const base = ordenados.find(p => p.status === 'pendente') || ordenados[0]
    const pendentes = itens.filter(p => p.status === 'pendente')
    const pagos = itens.filter(p => p.status === 'pago')
    const total = itens.reduce((s, p) => s + Number(p.valor || 0), 0)
    const pendente = pendentes.reduce((s, p) => s + Number(p.valor || 0), 0)
    const pago = pagos.reduce((s, p) => s + Number(p.valor || 0), 0)
    const proximo = pendentes.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))[0]

    return {
      id: key,
      grupoId: key.startsWith('grupo:') ? key.replace('grupo:', '') : null,
      titulo: base.titulo,
      tipo: base.tipo,
      itens,
      total,
      pendente,
      pago,
      proximoVencimento: proximo?.vencimento || base.vencimento,
      status: pendente > 0 ? 'pendente' : itens.some(p => p.status === 'pago') ? 'pago' : base.status,
    }
  }).sort((a, b) => (a.proximoVencimento || '').localeCompare(b.proximoVencimento || ''))
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: 26, textAlign: 'center', color: 'var(--text3)', background: 'var(--bg2)' }}>
      {text}
    </div>
  )
}

function GrupoCard({ grupo, onGerir }: { grupo: GrupoPessoa; onGerir: () => void }) {
  const cor = grupo.tipo === 'pagamento' ? 'var(--danger)' : 'var(--success)'
  const Icon = grupo.tipo === 'pagamento' ? WalletCards : CircleDollarSign
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={cor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{grupo.titulo}</div>
          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', color: 'var(--text3)', fontSize: 11 }}>
            <span>{grupo.tipo === 'pagamento' ? 'A pagar' : 'A receber'}</span>
            <span>Próx.: {fmtDate(grupo.proximoVencimento)}</span>
            {grupo.grupoId && <span>{grupo.itens.length} parcelas</span>}
            <span>{grupo.status === 'pago' ? 'Pago' : 'Pendente'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: cor, fontWeight: 900, fontFamily: 'var(--font-heading)' }}>{fmt(grupo.pendente || grupo.total)}</div>
          <div style={{ color: 'var(--text3)', fontSize: 11 }}>Pago: {fmt(grupo.pago)}</div>
        </div>
      </div>
      {grupo.grupoId && grupo.status === 'pendente' && (
        <button className="btn btn-ghost" onClick={onGerir} style={{ width: '100%', marginTop: 10, fontSize: 12 }}>
          Gerir / abater no financeiro
        </button>
      )}
    </div>
  )
}

export default function PessoaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<HistoricoPessoa | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('resumo')

  useEffect(() => {
    let active = true
    async function load() {
      if (!id) return
      setLoading(true)
      try {
        const hist = await documentosApi.historicoPessoa(id)
        if (active) setData(hist)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [id])

  const grupos = useMemo(() => agruparPagamentos(data?.pagamentos || []), [data?.pagamentos])
  const aPagar = grupos.filter(g => g.tipo === 'pagamento')
  const aReceber = grupos.filter(g => g.tipo === 'recebimento')
  const arquivos = data?.documentos || []
  const tarefas = data?.tarefas || []

  function novo(tipo: 'pagamento' | 'recebimento') {
    if (!data?.pessoa) return
    navigate('/financeiro', {
      state: {
        novoLancamento: {
          pessoa_id: data.pessoa.id,
          pessoa_nome: data.pessoa.nome,
          tipo,
          status: 'pendente',
        },
      },
    })
  }

  if (loading) {
    return <div style={{ padding: 40, display: 'flex', justifyContent: 'center', color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /></div>
  }

  if (!data?.pessoa) return <EmptyState text="Pessoa não encontrada." />

  const pessoa = data.pessoa
  const saldo = data.resumo.totalMeDevem - data.resumo.totalDevo

  return (
    <div style={{ padding: 20, maxWidth: 760, margin: '0 auto' }}>
      <button className="btn btn-ghost" onClick={() => navigate('/pessoas')} style={{ marginBottom: 14 }}><ArrowLeft size={14} /> Pessoas</button>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {pessoa.avatar_url ? <img src={pessoa.avatar_url} alt={pessoa.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserRound size={24} color="var(--primary-light)" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 21 }}>{pessoa.nome}</h1>
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>{pessoa.tipo}{pessoa.email ? ` · ${pessoa.email}` : ''}{pessoa.contato ? ` · ${pessoa.contato}` : ''}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}><div style={{ color: 'var(--text3)', fontSize: 11 }}>A pagar</div><strong style={{ color: 'var(--danger)' }}>{fmt(data.resumo.totalDevo)}</strong></div>
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}><div style={{ color: 'var(--text3)', fontSize: 11 }}>A receber</div><strong style={{ color: 'var(--success)' }}>{fmt(data.resumo.totalMeDevem)}</strong></div>
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}><div style={{ color: 'var(--text3)', fontSize: 11 }}>Saldo</div><strong>{saldo >= 0 ? '+' : ''}{fmt(saldo)}</strong></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => novo('pagamento')}><Plus size={14} /> Adicionar pagamento</button>
          <button className="btn btn-secondary" onClick={() => novo('recebimento')}><Plus size={14} /> Adicionar recebimento</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 14, overflowX: 'auto' }}>
        {([
          ['resumo', 'Resumo', History],
          ['pagar', 'A pagar', WalletCards],
          ['receber', 'A receber', CircleDollarSign],
          ['arquivos', 'Arquivos', FileText],
          ['tarefas', 'Tarefas', ClipboardList],
          ['historico', 'Histórico', CalendarDays],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}><Icon size={14} /> {label}</button>
        ))}
      </div>

      {tab === 'resumo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.slice(0, 6).map(g => <GrupoCard key={g.id} grupo={g} onGerir={() => navigate('/financeiro')} />)}
          {grupos.length === 0 && <EmptyState text="Nenhum movimento financeiro com esta pessoa." />}
        </div>
      )}
      {tab === 'pagar' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{aPagar.length ? aPagar.map(g => <GrupoCard key={g.id} grupo={g} onGerir={() => navigate('/financeiro')} />) : <EmptyState text="Nada a pagar para esta pessoa." />}</div>}
      {tab === 'receber' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{aReceber.length ? aReceber.map(g => <GrupoCard key={g.id} grupo={g} onGerir={() => navigate('/financeiro')} />) : <EmptyState text="Nada a receber desta pessoa." />}</div>}
      {tab === 'arquivos' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{arquivos.length ? arquivos.map((d: Documento) => <a key={d.id} href={d.arquivo_url} target="_blank" rel="noreferrer" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, color: 'var(--text)', textDecoration: 'none' }}><FileText size={14} /> <strong>{d.titulo}</strong><div style={{ color: 'var(--text3)', fontSize: 12 }}>{d.tipo} · {fmtDate(d.created_at)}</div></a>) : <EmptyState text="Nenhum arquivo vinculado." />}</div>}
      {tab === 'tarefas' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{tarefas.length ? tarefas.map((t: Tarefa) => <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}><strong>{t.titulo}</strong><div style={{ color: 'var(--text3)', fontSize: 12 }}>{t.status} · {fmtDate(t.prazo || t.data)}</div></div>) : <EmptyState text="Nenhuma tarefa vinculada." />}</div>}
      {tab === 'historico' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...grupos.map(g => ({ id: g.id, title: g.titulo, date: g.proximoVencimento, text: `${g.tipo === 'pagamento' ? 'A pagar' : 'A receber'} · ${fmt(g.pendente || g.total)}` })), ...arquivos.map(d => ({ id: d.id, title: d.titulo, date: d.created_at, text: 'Arquivo/documento' }))]
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .map(item => <div key={item.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}><strong>{item.title}</strong><div style={{ color: 'var(--text3)', fontSize: 12 }}>{fmtDate(item.date)} · {item.text}</div></div>)}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
