import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus,
  X,
  Loader,
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  User,
  Check,
  CalendarDays,
  Repeat,
  ListPlus,
  WalletCards,
  CircleDollarSign,
  Pencil,
  Trash2,
  Filter,
} from 'lucide-react'
import { pagamentosApi, equipeApi, type Pagamento, type Pessoa, type ResumoPorPessoa, type ResumoFinanceiro } from '../lib/api'
import { MicBtn } from '../components/ui'

type ScheduleMode = 'unico' | 'recorrente' | 'personalizado'

type FinanceiroLocationState = {
  novoLancamento?: Partial<Pagamento>
} | null

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function fmt(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')
}

const CATEGORIAS = ['Salário', 'Fornecedor', 'Aluguel', 'Serviço', 'Empréstimo', 'Dívida', 'Produto', 'Imposto', 'Outro']

function makeInitialForPessoa(pessoaId: string | null | undefined, pessoaNome: string, tipo: 'pagamento' | 'recebimento'): Partial<Pagamento> {
  return {
    pessoa_id: pessoaId || undefined,
    pessoa_nome: pessoaNome,
    tipo,
    status: 'pendente',
  }
}

function DateListEditor({ dates, setDates }: { dates: string[]; setDates: (dates: string[]) => void }) {
  const [date, setDate] = useState('')

  function addDate() {
    if (!date) return
    const next = Array.from(new Set([...dates, date])).sort()
    setDates(next)
    setDate('')
  }

  return (
    <div className="form-group">
      <label className="form-label">Datas personalizadas</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <button type="button" className="btn btn-secondary" onClick={addDate} style={{ whiteSpace: 'nowrap' }}>
          <Plus size={14} /> Data
        </button>
      </div>
      {dates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {dates.map(d => (
            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 999, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12 }}>
              <CalendarDays size={12} /> {fmtDate(d)}
              <button type="button" onClick={() => setDates(dates.filter(x => x !== d))} style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer', padding: 0 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
        Use esta opção para lançar quantas datas avulsas quiser para a mesma pessoa.
      </div>
    </div>
  )
}

function PagamentoModal({ pessoas, onSave, onClose, initial }: {
  pessoas: Pessoa[]
  onSave: (p: Pagamento) => void
  onClose: () => void
  initial?: Partial<Pagamento>
}) {
  const isEdit = Boolean(initial?.id)
  const [titulo, setTitulo] = useState(initial?.titulo || '')
  const [descricao, setDescricao] = useState(initial?.descricao || '')
  const [valor, setValor] = useState(initial?.valor ? String(initial.valor) : '')
  const [tipo, setTipo] = useState<'pagamento' | 'recebimento'>(initial?.tipo || 'pagamento')
  const [status, setStatus] = useState<'pendente' | 'pago' | 'cancelado'>(initial?.status || 'pendente')
  const [vencimento, setVencimento] = useState(initial?.vencimento?.slice(0, 10) || '')
  const [pagoEm, setPagoEm] = useState(initial?.pago_em?.slice(0, 10) || '')
  const [pessoaId, setPessoaId] = useState(initial?.pessoa_id || '')
  const [pessoaNome, setPessoaNome] = useState(initial?.pessoa_nome || '')
  const [categoria, setCategoria] = useState(initial?.categoria || '')
  const [obs, setObs] = useState(initial?.obs || '')
  const [saving, setSaving] = useState(false)

  const initialMode: ScheduleMode = initial?.recorrencia && initial.recorrencia !== 'nenhum' ? 'recorrente' : 'unico'
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(initialMode)
  const [recorrencia, setRecorrencia] = useState(initial?.recorrencia || 'mensal')
  const [recorrenciaFim, setRecorrenciaFim] = useState(initial?.recorrencia_fim?.slice(0, 10) || '')
  const [datasPersonalizadas, setDatasPersonalizadas] = useState<string[]>([])

  async function handleSave() {
    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    if (!valor || isNaN(parseFloat(valor)) || parseFloat(valor) <= 0) { toast('Valor inválido', 'error'); return }
    if (scheduleMode === 'unico' && !vencimento && !isEdit) { toast('Informe uma data ou escolha datas personalizadas', 'error'); return }
    if (scheduleMode === 'recorrente' && !vencimento && !isEdit) { toast('Informe a primeira data da recorrência', 'error'); return }
    if (scheduleMode === 'personalizado' && datasPersonalizadas.length === 0 && !isEdit) { toast('Adicione pelo menos uma data personalizada', 'error'); return }

    setSaving(true)
    try {
      const pessoa = pessoas.find(p => p.id === pessoaId)
      const primeiraDataPersonalizada = datasPersonalizadas[0]
      const payload: Partial<Pagamento> = {
        titulo: titulo.trim(),
        descricao: descricao || undefined,
        valor: parseFloat(valor),
        tipo,
        status,
        vencimento: scheduleMode === 'personalizado' ? (primeiraDataPersonalizada || undefined) : (vencimento || undefined),
        pago_em: pagoEm || undefined,
        pessoa_id: pessoaId || undefined,
        pessoa_nome: pessoa?.nome || pessoaNome || undefined,
        categoria: categoria || undefined,
        obs: obs || undefined,
        recorrencia: scheduleMode === 'recorrente' ? recorrencia : 'nenhum',
        recorrencia_fim: scheduleMode === 'recorrente' && recorrenciaFim ? recorrenciaFim : undefined,
        datas_personalizadas: scheduleMode === 'personalizado' ? datasPersonalizadas : undefined,
      }

      const p = isEdit && initial?.id
        ? await pagamentosApi.update(initial.id, payload)
        : await pagamentosApi.create(payload)

      onSave(p)
      toast(isEdit ? 'Lançamento atualizado!' : 'Lançamento criado!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', width: '100%', maxWidth: 580, maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{isEdit ? 'Editar lançamento' : 'Novo lançamento'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setTipo('pagamento')} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${tipo === 'pagamento' ? '#EF4444' : 'var(--border)'}`, background: tipo === 'pagamento' ? 'rgba(239,68,68,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: tipo === 'pagamento' ? '#EF4444' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <WalletCards size={16} /> Eu pago
          </button>
          <button type="button" onClick={() => setTipo('recebimento')} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${tipo === 'recebimento' ? '#10B981' : 'var(--border)'}`, background: tipo === 'recebimento' ? 'rgba(16,185,129,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: tipo === 'recebimento' ? '#10B981' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <CircleDollarSign size={16} /> Me pagam
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Título *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="Ex: Consultoria, parcela, aluguel..." value={titulo} onChange={e => setTitulo(e.target.value)} />
              <MicBtn onResult={t => setTitulo(prev => (prev + ' ' + t).trim())} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label className="form-label">Valor (R$) *</label><input className="form-input" type="number" step="0.01" min="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value as 'pendente' | 'pago' | 'cancelado')}>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>

          <div className="form-group"><label className="form-label">Pessoa vinculada</label>
            <select className="form-input" value={pessoaId} onChange={e => { setPessoaId(e.target.value); if (e.target.value) setPessoaNome('') }}>
              <option value="">Sem vínculo</option>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          {!pessoaId && <div className="form-group"><label className="form-label">Nome da pessoa livre</label><input className="form-input" placeholder="Nome sem cadastro..." value={pessoaNome} onChange={e => setPessoaNome(e.target.value)} /></div>}

          <div className="form-group"><label className="form-label">Categoria</label>
            <select className="form-input" value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="">Sem categoria</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Como lançar?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <button type="button" onClick={() => setScheduleMode('unico')} className={`btn ${scheduleMode === 'unico' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }}><CalendarDays size={14} /> Único</button>
              <button type="button" onClick={() => setScheduleMode('recorrente')} className={`btn ${scheduleMode === 'recorrente' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }}><Repeat size={14} /> Recorrente</button>
              <button type="button" onClick={() => setScheduleMode('personalizado')} className={`btn ${scheduleMode === 'personalizado' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }}><ListPlus size={14} /> Datas</button>
            </div>
          </div>

          {scheduleMode !== 'personalizado' && (
            <div className="form-group"><label className="form-label">{scheduleMode === 'recorrente' ? 'Primeira data' : 'Data de vencimento'}</label><input className="form-input" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} /></div>
          )}

          {scheduleMode === 'recorrente' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Recorrência</label>
                <select className="form-input" value={recorrencia} onChange={e => setRecorrencia(e.target.value)}>
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Repetir até</label>
                <input className="form-input" type="date" value={recorrenciaFim} onChange={e => setRecorrenciaFim(e.target.value)} />
              </div>
            </div>
          )}

          {scheduleMode === 'personalizado' && <DateListEditor dates={datasPersonalizadas} setDates={setDatasPersonalizadas} />}

          {status === 'pago' && <div className="form-group"><label className="form-label">Data do pagamento</label><input className="form-input" type="date" value={pagoEm} onChange={e => setPagoEm(e.target.value)} /></div>}

          <div className="form-group">
            <label className="form-label">Observações</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea className="form-input" rows={2} placeholder="Notas adicionais..." value={obs} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical' }} />
              <MicBtn onResult={t => setObs(prev => (prev + ' ' + t).trim())} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : <><Check size={14} /> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function PessoaCard({ r, onClick, onAddPagamento, onAddRecebimento }: {
  r: ResumoPorPessoa
  onClick: () => void
  onAddPagamento: () => void
  onAddRecebimento: () => void
}) {
  const saldo = r.me_devem_pendente - r.devo_pendente
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <div onClick={onClick} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: '#fff', flexShrink: 0 }}>
            {r.pessoa_nome.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.pessoa_nome}</div>
            <div style={{ fontSize: 11, color: saldo > 0 ? '#10B981' : saldo < 0 ? '#EF4444' : 'var(--text3)', fontWeight: 600 }}>
              {saldo > 0 ? `Saldo: +${fmt(saldo)}` : saldo < 0 ? `Saldo: ${fmt(saldo)}` : 'Quitado'}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}><WalletCards size={12} /> Eu devo</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: r.devo_pendente > 0 ? '#EF4444' : 'var(--text3)', fontFamily: 'var(--font-heading)' }}>{fmt(r.devo_pendente)}</div>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}><CircleDollarSign size={12} /> Me devem</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: r.me_devem_pendente > 0 ? '#10B981' : 'var(--text3)', fontFamily: 'var(--font-heading)' }}>{fmt(r.me_devem_pendente)}</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={onAddPagamento} style={{ fontSize: 12 }}><WalletCards size={13} /> Add pagamento</button>
        <button className="btn btn-ghost" onClick={onAddRecebimento} style={{ fontSize: 12 }}><CircleDollarSign size={13} /> Add recebimento</button>
      </div>
    </div>
  )
}

export default function Financeiro() {
  const location = useLocation()
  const navigate = useNavigate()

  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null)
  const [porPessoa, setPorPessoa] = useState<ResumoPorPessoa[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editPag, setEditPag] = useState<Pagamento | null>(null)
  const [prefill, setPrefill] = useState<Partial<Pagamento> | null>(null)
  const [tab, setTab] = useState<'lista' | 'pessoas'>('lista')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [search, setSearch] = useState('')
  const [pessoaFiltro, setPessoaFiltro] = useState<ResumoPorPessoa | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pags, ps, res, pp] = await Promise.all([
        pagamentosApi.list(),
        equipeApi.pessoas(),
        pagamentosApi.resumo(),
        pagamentosApi.porPessoa(),
      ])
      setPagamentos(pags)
      setPessoas(ps)
      setResumo(res)
      setPorPessoa(pp)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const state = location.state as FinanceiroLocationState
    if (state?.novoLancamento) {
      setPrefill(state.novoLancamento)
      setModalOpen(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    const h = () => { setPrefill(null); setEditPag(null); setModalOpen(true) }
    window.addEventListener('nexus:open-new', h)
    return () => window.removeEventListener('nexus:open-new', h)
  }, [])

  function openLancamento(initial?: Partial<Pagamento>) {
    setEditPag(null)
    setPrefill(initial || null)
    setModalOpen(true)
  }

  async function handleMarcarPago(p: Pagamento) {
    try {
      const updated = await pagamentosApi.update(p.id, { status: 'pago', pago_em: new Date().toISOString().slice(0, 10) })
      setPagamentos(prev => prev.map(x => x.id === updated.id ? updated : x))
      toast('Marcado como pago!')
      load()
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este lançamento?')) return
    try { await pagamentosApi.remove(id); setPagamentos(p => p.filter(x => x.id !== id)); load(); toast('Excluído') }
    catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  const filtrados = pagamentos.filter(p => {
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
    if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false
    if (pessoaFiltro && p.pessoa_id !== pessoaFiltro.pessoa_id) return false
    if (search) {
      const q = search.toLowerCase()
      return (p.titulo || '').toLowerCase().includes(q) || (p.pessoa_nome || '').toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q)
    }
    return true
  })

  const vencidos = pagamentos.filter(p => p.status === 'pendente' && p.vencimento && new Date(`${p.vencimento.slice(0, 10)}T00:00:00`) < new Date())

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Financeiro</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Pagamentos, recebimentos, recorrências e datas personalizadas</p>
        </div>
        <button className="btn btn-primary" onClick={() => openLancamento()} style={{ gap: 6 }}><Plus size={16} /> Lançar</button>
      </div>

      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingUp size={14} color="#10B981" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>A receber</span></div>
            <div style={{ fontWeight: 900, fontSize: 20, color: '#10B981', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.receita_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Recebido: {fmt(resumo.receita_paga)}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingDown size={14} color="#EF4444" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>A pagar</span></div>
            <div style={{ fontWeight: 900, fontSize: 20, color: '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.despesa_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Pago: {fmt(resumo.despesa_paga)}</div>
          </div>
        </div>
      )}

      {vencidos.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#F59E0B' }}>{vencidos.length} lançamento{vencidos.length > 1 ? 's' : ''} vencido{vencidos.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Total: {fmt(vencidos.reduce((s, p) => s + Number(p.valor), 0))}</div>
          </div>
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'lista' ? 'active' : ''}`} onClick={() => { setTab('lista'); setPessoaFiltro(null) }}><Filter size={14} /> Lançamentos</button>
        <button className={`tab ${tab === 'pessoas' ? 'active' : ''}`} onClick={() => setTab('pessoas')}><User size={14} /> Por pessoa ({porPessoa.length})</button>
      </div>

      {tab === 'pessoas' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {porPessoa.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
              <User size={40} style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 700 }}>Nenhum lançamento por pessoa</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Vincule lançamentos a pessoas para ver o resumo</div>
            </div>
          ) : porPessoa.map(r => (
            <PessoaCard
              key={`${r.pessoa_id || 'sem-pessoa'}-${r.pessoa_nome}`}
              r={r}
              onClick={() => { setPessoaFiltro(r); setTab('lista') }}
              onAddPagamento={() => openLancamento(makeInitialForPessoa(r.pessoa_id, r.pessoa_nome, 'pagamento'))}
              onAddRecebimento={() => openLancamento(makeInitialForPessoa(r.pessoa_id, r.pessoa_nome, 'recebimento'))}
            />
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-input" style={{ flex: 1, minWidth: 110 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="pagamento">A pagar</option>
              <option value="recebimento">A receber</option>
            </select>
            <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todos">Todos status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {pessoaFiltro && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <User size={14} color="#7C3AED" />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Filtrado: {pessoaFiltro.pessoa_nome}</span>
              <button onClick={() => setPessoaFiltro(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <WalletCards size={48} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum lançamento</div>
              <div style={{ fontSize: 13 }}>Registre pagamentos e recebimentos</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtrados.map(p => {
                const isVencido = p.status === 'pendente' && p.vencimento && new Date(`${p.vencimento.slice(0, 10)}T00:00:00`) < new Date()
                const Icon = p.tipo === 'pagamento' ? WalletCards : CircleDollarSign
                return (
                  <div key={p.id} style={{ background: 'var(--bg2)', border: `1px solid ${isVencido ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: p.tipo === 'pagamento' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={18} color={p.tipo === 'pagamento' ? '#EF4444' : '#10B981'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{p.pessoa_nome || 'Sem pessoa'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{p.titulo}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text3)' }}><User size={10} /> {p.tipo === 'pagamento' ? 'A pagar' : 'A receber'}</span>
                          {p.categoria && <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 99 }}>{p.categoria}</span>}
                          {p.vencimento && <span style={{ fontSize: 11, color: isVencido ? '#F59E0B' : 'var(--text3)' }}>{isVencido ? 'Vencido: ' : 'Vence: '}{fmtDate(p.vencimento)}</span>}
                          {p.recorrencia && p.recorrencia !== 'nenhum' && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text3)' }}><Repeat size={10} /> {p.recorrencia}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 16, color: p.tipo === 'pagamento' ? '#EF4444' : '#10B981', fontFamily: 'var(--font-heading)' }}>
                          {p.tipo === 'pagamento' ? '-' : '+'}{fmt(Number(p.valor))}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: p.status === 'pago' ? '#10B981' : p.status === 'cancelado' ? '#6B7280' : '#F59E0B', background: p.status === 'pago' ? 'rgba(16,185,129,0.12)' : p.status === 'cancelado' ? 'rgba(107,114,128,0.12)' : 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 99 }}>
                          {p.status === 'pago' ? 'Pago' : p.status === 'cancelado' ? 'Cancelado' : isVencido ? 'Vencido' : 'Pendente'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {p.status === 'pendente' && (
                        <button onClick={() => handleMarcarPago(p)} style={{ flex: 1, padding: '7px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Check size={12} /> Marcar como pago
                        </button>
                      )}
                      <button onClick={() => { setPrefill(null); setEditPag(p); setModalOpen(true) }} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Pencil size={12} /> Editar</button>
                      <button onClick={() => handleDelete(p.id)} style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Trash2 size={12} /> Excluir</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {(modalOpen || editPag) && (
        <PagamentoModal
          pessoas={pessoas}
          initial={editPag || prefill || undefined}
          onSave={p => {
            if (editPag) setPagamentos(prev => prev.map(x => x.id === p.id ? p : x))
            else setPagamentos(prev => [p, ...prev])
            setModalOpen(false)
            setEditPag(null)
            setPrefill(null)
            load()
          }}
          onClose={() => { setModalOpen(false); setEditPag(null); setPrefill(null) }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
