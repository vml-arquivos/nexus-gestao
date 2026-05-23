import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Loader, Search, TrendingUp, TrendingDown, AlertTriangle, User, Check, ChevronDown } from 'lucide-react'
import { pagamentosApi, equipeApi, type Pagamento, type Pessoa, type ResumoPorPessoa, type ResumoFinanceiro } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d?: string) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—' }

const CATEGORIAS = ['Salário', 'Fornecedor', 'Aluguel', 'Serviço', 'Empréstimo', 'Dívida', 'Produto', 'Imposto', 'Outro']

// ── Modal de novo pagamento ───────────────────────────────────────────────────
function PagamentoModal({ pessoas, onSave, onClose, initial }: {
  pessoas: Pessoa[]; onSave: (p: Pagamento) => void; onClose: () => void;
  initial?: Partial<Pagamento>
}) {
  const [titulo, setTitulo]       = useState(initial?.titulo || '')
  const [descricao, setDescricao] = useState(initial?.descricao || '')
  const [valor, setValor]         = useState(initial?.valor ? String(initial.valor) : '')
  const [tipo, setTipo]           = useState<'pagamento' | 'recebimento'>(initial?.tipo || 'pagamento')
  const [status, setStatus]       = useState<'pendente' | 'pago' | 'cancelado'>(initial?.status || 'pendente')
  const [vencimento, setVencimento] = useState(initial?.vencimento || '')
  const [pagoEm, setPagoEm]       = useState(initial?.pago_em || '')
  const [pessoaId, setPessoaId]   = useState(initial?.pessoa_id || '')
  const [pessoaNome, setPessoaNome] = useState(initial?.pessoa_nome || '')
  const [categoria, setCategoria] = useState(initial?.categoria || '')
  const [obs, setObs]             = useState(initial?.obs || '')
  const [saving, setSaving]       = useState(false)

  async function handleSave() {
    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    if (!valor || isNaN(parseFloat(valor)) || parseFloat(valor) <= 0) { toast('Valor inválido', 'error'); return }
    setSaving(true)
    try {
      const pessoa = pessoas.find(p => p.id === pessoaId)
      const payload: Partial<Pagamento> = {
        titulo: titulo.trim(), descricao: descricao || undefined, valor: parseFloat(valor), tipo, status,
        vencimento: vencimento || undefined, pago_em: pagoEm || undefined,
        pessoa_id: pessoaId || undefined, pessoa_nome: pessoa?.nome || pessoaNome || undefined,
        categoria: categoria || undefined, obs: obs || undefined,
      }
      const p = initial?.id
        ? await pagamentosApi.update(initial.id, payload)
        : await pagamentosApi.create(payload)
      onSave(p)
      toast(initial?.id ? 'Atualizado!' : 'Pagamento criado!')
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', width: '100%', maxWidth: 540, maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{initial?.id ? '✏️ Editar' : '💳 Novo Lançamento'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {/* Tipo — toggle visual */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setTipo('pagamento')} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${tipo === 'pagamento' ? '#EF4444' : 'var(--border)'}`, background: tipo === 'pagamento' ? 'rgba(239,68,68,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: tipo === 'pagamento' ? '#EF4444' : 'var(--text3)' }}>
            💸 Eu Pago
          </button>
          <button onClick={() => setTipo('recebimento')} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${tipo === 'recebimento' ? '#10B981' : 'var(--border)'}`, background: tipo === 'recebimento' ? 'rgba(16,185,129,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: tipo === 'recebimento' ? '#10B981' : 'var(--text3)' }}>
            💰 Me Pagam
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group"><label className="form-label">Título *</label><input className="form-input" placeholder="Ex: Pagamento João, Aluguel, Serviço…" value={titulo} onChange={e => setTitulo(e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label className="form-label">Valor (R$) *</label><input className="form-input" type="number" step="0.01" min="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value as 'pendente' | 'pago' | 'cancelado')}>
                <option value="pendente">⏳ Pendente</option>
                <option value="pago">✅ Pago</option>
                <option value="cancelado">❌ Cancelado</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label className="form-label">Vencimento</label><input className="form-input" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} /></div>
            {status === 'pago' && <div className="form-group"><label className="form-label">Data do Pagamento</label><input className="form-input" type="date" value={pagoEm} onChange={e => setPagoEm(e.target.value)} /></div>}
          </div>
          <div className="form-group"><label className="form-label">Pessoa Vinculada</label>
            <select className="form-input" value={pessoaId} onChange={e => { setPessoaId(e.target.value); if (e.target.value) setPessoaNome('') }}>
              <option value="">Sem vínculo</option>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          {!pessoaId && <div className="form-group"><label className="form-label">Nome da Pessoa (livre)</label><input className="form-input" placeholder="Nome sem cadastro…" value={pessoaNome} onChange={e => setPessoaNome(e.target.value)} /></div>}
          <div className="form-group"><label className="form-label">Categoria</label>
            <select className="form-input" value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="">Sem categoria</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Observações</label><textarea className="form-input" rows={2} placeholder="Notas adicionais…" value={obs} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical' }} /></div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : <><Check size={14} /> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de resumo por pessoa ─────────────────────────────────────────────────
function PessoaCard({ r, onClick }: { r: ResumoPorPessoa; onClick: () => void }) {
  const saldo = r.me_devem_pendente - r.devo_pendente
  return (
    <div onClick={onClick} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.2s' }}>
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
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>💸 Eu devo</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: r.devo_pendente > 0 ? '#EF4444' : 'var(--text3)', fontFamily: 'var(--font-heading)' }}>{fmt(r.devo_pendente)}</div>
          {r.devo_pago > 0 && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Pago: {fmt(r.devo_pago)}</div>}
        </div>
        <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>💰 Me devem</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: r.me_devem_pendente > 0 ? '#10B981' : 'var(--text3)', fontFamily: 'var(--font-heading)' }}>{fmt(r.me_devem_pendente)}</div>
          {r.me_devem_pago > 0 && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Recebido: {fmt(r.me_devem_pago)}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Financeiro() {
  const { user } = useAuth()

  const [pagamentos, setPagamentos]     = useState<Pagamento[]>([])
  const [pessoas, setPessoas]           = useState<Pessoa[]>([])
  const [resumo, setResumo]             = useState<ResumoFinanceiro | null>(null)
  const [porPessoa, setPorPessoa]       = useState<ResumoPorPessoa[]>([])
  const [loading, setLoading]           = useState(true)
  const [modalOpen, setModalOpen]       = useState(false)
  const [editPag, setEditPag]           = useState<Pagamento | null>(null)
  const [tab, setTab]                   = useState<'lista' | 'pessoas'>('lista')
  const [filtroTipo, setFiltroTipo]     = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [search, setSearch]             = useState('')
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
      setPagamentos(pags); setPessoas(ps); setResumo(res); setPorPessoa(pp)
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro ao carregar', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const h = () => setModalOpen(true); window.addEventListener('nexus:open-new', h); return () => window.removeEventListener('nexus:open-new', h) }, [])

  async function handleMarcarPago(p: Pagamento) {
    try {
      const updated = await pagamentosApi.update(p.id, { status: 'pago', pago_em: new Date().toISOString().split('T')[0] })
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
    if (search) { const q = search.toLowerCase(); return (p.titulo || '').toLowerCase().includes(q) || (p.pessoa_nome || '').toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q) }
    return true
  })

  const vencidos = pagamentos.filter(p => p.status === 'pendente' && p.vencimento && new Date(p.vencimento) < new Date())

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>💳 Financeiro</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Pagamentos e recebimentos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ gap: 6 }}><Plus size={16} /> Lançar</button>
      </div>

      {/* Cards de resumo */}
      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingUp size={14} color="#10B981" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>A Receber</span></div>
            <div style={{ fontWeight: 900, fontSize: 20, color: '#10B981', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.receita_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Recebido: {fmt(resumo.receita_paga)}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingDown size={14} color="#EF4444" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>A Pagar</span></div>
            <div style={{ fontWeight: 900, fontSize: 20, color: '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.despesa_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Pago: {fmt(resumo.despesa_paga)}</div>
          </div>
          <div style={{ gridColumn: '1 / -1', background: resumo.saldo >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${resumo.saldo >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>💰 Saldo Líquido</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: resumo.saldo >= 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.saldo)}</span>
          </div>
        </div>
      )}

      {/* Alerta de vencidos */}
      {vencidos.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#F59E0B' }}>{vencidos.length} lançamento{vencidos.length > 1 ? 's' : ''} vencido{vencidos.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Total: {fmt(vencidos.reduce((s, p) => s + Number(p.valor), 0))}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'lista' ? 'active' : ''}`} onClick={() => { setTab('lista'); setPessoaFiltro(null) }}>📋 Lançamentos</button>
        <button className={`tab ${tab === 'pessoas' ? 'active' : ''}`} onClick={() => setTab('pessoas')}>👥 Por Pessoa ({porPessoa.length})</button>
      </div>

      {tab === 'pessoas' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {porPessoa.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>👥</div>
              <div style={{ fontWeight: 700 }}>Nenhum lançamento por pessoa</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Vincule lançamentos a pessoas para ver o resumo</div>
            </div>
          ) : porPessoa.map(r => (
            <PessoaCard key={r.pessoa_id} r={r} onClick={() => { setPessoaFiltro(r); setTab('lista') }} />
          ))}
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-input" style={{ flex: 1, minWidth: 100 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="pagamento">💸 A Pagar</option>
              <option value="recebimento">💰 A Receber</option>
            </select>
            <select className="form-input" style={{ flex: 1, minWidth: 100 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todos">Todos status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {pessoaFiltro && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <User size={14} color="#6C3BFF" />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Filtrado: {pessoaFiltro.pessoa_nome}</span>
              <button onClick={() => setPessoaFiltro(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum lançamento</div>
              <div style={{ fontSize: 13 }}>Registre pagamentos e recebimentos</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtrados.map(p => {
                const isVencido = p.status === 'pendente' && p.vencimento && new Date(p.vencimento) < new Date()
                return (
                  <div key={p.id} style={{ background: 'var(--bg2)', border: `1px solid ${isVencido ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: p.tipo === 'pagamento' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {p.tipo === 'pagamento' ? '💸' : '💰'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.titulo}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          {p.pessoa_nome && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text3)' }}><User size={10} /> {p.pessoa_nome}</span>}
                          {p.categoria && <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 99 }}>{p.categoria}</span>}
                          {p.vencimento && <span style={{ fontSize: 11, color: isVencido ? '#F59E0B' : 'var(--text3)' }}>{isVencido ? '⚠️ ' : ''}Vence: {fmtDate(p.vencimento)}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 16, color: p.tipo === 'pagamento' ? '#EF4444' : '#10B981', fontFamily: 'var(--font-heading)' }}>
                          {p.tipo === 'pagamento' ? '-' : '+'}{fmt(Number(p.valor))}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: p.status === 'pago' ? '#10B981' : p.status === 'cancelado' ? '#6B7280' : isVencido ? '#F59E0B' : '#F59E0B', background: p.status === 'pago' ? 'rgba(16,185,129,0.12)' : p.status === 'cancelado' ? 'rgba(107,114,128,0.12)' : 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 99 }}>
                          {p.status === 'pago' ? '✓ Pago' : p.status === 'cancelado' ? 'Cancelado' : isVencido ? 'Vencido' : 'Pendente'}
                        </span>
                      </div>
                    </div>

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {p.status === 'pendente' && (
                        <button onClick={() => handleMarcarPago(p)} style={{ flex: 1, padding: '7px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Check size={12} /> Marcar como Pago
                        </button>
                      )}
                      <button onClick={() => setEditPag(p)} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>Editar</button>
                      <button onClick={() => handleDelete(p.id)} style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>Excluir</button>
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
          initial={editPag || undefined}
          onSave={p => {
            if (editPag) setPagamentos(prev => prev.map(x => x.id === p.id ? p : x))
            else setPagamentos(prev => [p, ...prev])
            setModalOpen(false); setEditPag(null); load()
          }}
          onClose={() => { setModalOpen(false); setEditPag(null) }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
