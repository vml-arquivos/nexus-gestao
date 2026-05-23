import React, { useState, useCallback, useRef } from 'react'
import { Plus, Search, DollarSign, TrendingUp, TrendingDown, Upload, Eye, Trash2, Edit2, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { nanoid, fmtCurrency, fmtDateShort, today, isOverdue } from '../lib/utils'
import { store, saveStore } from '../lib/store'
import type { Pagamento } from '../lib/supabase'
import { Avatar, Badge, Modal, ConfirmDialog, EmptyState, MicBtn, toast } from '../components/ui'

type Status = Pagamento['status']
type Tipo = Pagamento['tipo']

export default function Financeiro() {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>(store.pagamentos)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Pagamento | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    descricao: '', valor: '', tipo: 'pagamento' as Tipo,
    vencimento: '', pago_dia: '', status: 'pendente' as Status,
    categoria: '', pessoa_id: '', obs: '',
    comprovante_url: '', comprovante_key: ''
  })

  const totais = {
    recebimentos: pagamentos.filter(p => p.tipo === 'recebimento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0),
    pagamentos: pagamentos.filter(p => p.tipo === 'pagamento' && p.status === 'pago').reduce((a, b) => a + Number(b.valor), 0),
    pendentes: pagamentos.filter(p => p.status === 'pendente').reduce((a, b) => a + Number(b.valor), 0),
    vencidos: pagamentos.filter(p => p.status === 'pendente' && p.vencimento && isOverdue(p.vencimento)).length,
  }
  const saldo = totais.recebimentos - totais.pagamentos

  function openNew() {
    setEditando(null)
    setForm({ descricao: '', valor: '', tipo: 'pagamento', vencimento: '', pago_dia: '', status: 'pendente', categoria: '', pessoa_id: '', obs: '', comprovante_url: '', comprovante_key: '' })
    setModalOpen(true)
  }

  function openEdit(p: Pagamento) {
    setEditando(p)
    setForm({
      descricao: p.descricao, valor: String(p.valor), tipo: p.tipo,
      vencimento: p.vencimento ?? '', pago_dia: p.pago_dia ?? '',
      status: p.status, categoria: p.categoria ?? '', pessoa_id: p.pessoa_id ?? '',
      obs: p.obs ?? '', comprovante_url: p.comprovante_url ?? '', comprovante_key: p.comprovante_key ?? ''
    })
    setModalOpen(true)
  }

  function salvar() {
    if (!form.descricao.trim()) { toast('Descrição é obrigatória', 'error'); return }
    if (!form.valor || isNaN(Number(form.valor))) { toast('Valor inválido', 'error'); return }
    const pessoa = store.pessoas.find(p => p.id === form.pessoa_id)

    if (editando) {
      const updated = store.pagamentos.map(p => p.id === editando.id ? {
        ...p, ...form, valor: Number(form.valor), pessoa_nome: pessoa?.nome
      } : p)
      store.pagamentos = updated
      saveStore('pagamentos', updated)
      setPagamentos([...updated])
      toast('Lançamento atualizado!')
    } else {
      const novo: Pagamento = {
        id: nanoid(), user_id: store.config.userId || 'local',
        descricao: form.descricao.trim(), valor: Number(form.valor),
        tipo: form.tipo, vencimento: form.vencimento || undefined,
        pago_dia: form.pago_dia || undefined, status: form.status,
        categoria: form.categoria || undefined, pessoa_id: form.pessoa_id || undefined,
        pessoa_nome: pessoa?.nome, obs: form.obs || undefined,
        comprovante_url: form.comprovante_url || undefined,
        comprovante_key: form.comprovante_key || undefined,
        created_at: new Date().toISOString()
      }
      store.pagamentos = [...store.pagamentos, novo]
      saveStore('pagamentos', store.pagamentos)
      setPagamentos([...store.pagamentos])
      toast('Lançamento criado!')
    }
    setModalOpen(false)
  }

  function excluir(id: string) {
    store.pagamentos = store.pagamentos.filter(p => p.id !== id)
    saveStore('pagamentos', store.pagamentos)
    setPagamentos([...store.pagamentos])
    toast('Removido')
  }

  function marcarPago(id: string) {
    const updated = store.pagamentos.map(p => p.id === id ? { ...p, status: 'pago' as Status, pago_dia: today() } : p)
    store.pagamentos = updated
    saveStore('pagamentos', updated)
    setPagamentos([...updated])
    toast('Marcado como pago! ✅')
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast('Arquivo muito grande (máx 10MB)', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const key = `comprovante_${nanoid()}_${file.name}`
      // Store in localStorage as base64 (for offline use)
      try {
        localStorage.setItem(`nx_file_${key}`, dataUrl)
        setForm(f => ({ ...f, comprovante_url: dataUrl, comprovante_key: key }))
        toast('Comprovante anexado!')
      } catch {
        toast('Erro ao salvar arquivo. Tente um arquivo menor.', 'error')
      }
    }
    reader.readAsDataURL(file)
  }

  const filtrados = pagamentos.filter(p => {
    const okTipo = filtroTipo === 'todos' || p.tipo === filtroTipo
    const okStatus = filtroStatus === 'todos' || p.status === filtroStatus
    const q = search.toLowerCase()
    return okTipo && okStatus && (
      p.descricao.toLowerCase().includes(q) ||
      (p.pessoa_nome ?? '').toLowerCase().includes(q) ||
      (p.categoria ?? '').toLowerCase().includes(q)
    )
  }).sort((a, b) => {
    if (a.vencimento && b.vencimento) return a.vencimento.localeCompare(b.vencimento)
    return b.created_at.localeCompare(a.created_at)
  })

  const handleMicDesc = useCallback((t: string) => setForm(f => ({ ...f, descricao: f.descricao ? f.descricao + ' ' + t : t })), [])
  const handleMicObs = useCallback((t: string) => setForm(f => ({ ...f, obs: f.obs ? f.obs + ' ' + t : t })), [])

  const statusIcon = { pago: <CheckCircle size={14} color="var(--success)" />, pendente: <Clock size={14} color="var(--text3)" />, vencido: <AlertTriangle size={14} color="var(--danger)" />, cancelado: <Trash2 size={14} color="var(--text3)" /> }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title"><DollarSign size={22} /> Financeiro</div>
          <div className="page-subtitle">{pagamentos.length} lançamento{pagamentos.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo Lançamento</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
        <div className="metric-card success">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <TrendingUp size={16} color="var(--success)" />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Recebimentos</span>
          </div>
          <div className="metric-value" style={{ fontSize: 18, color: 'var(--success)' }}>{fmtCurrency(totais.recebimentos)}</div>
        </div>
        <div className="metric-card danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <TrendingDown size={16} color="var(--danger)" />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Pagamentos</span>
          </div>
          <div className="metric-value" style={{ fontSize: 18, color: 'var(--danger)' }}>{fmtCurrency(totais.pagamentos)}</div>
        </div>
        <div className="metric-card" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Saldo</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmtCurrency(saldo)}
              </div>
            </div>
            {totais.vencidos > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)', fontFamily: 'var(--font-heading)' }}>{totais.vencidos}</div>
                <div style={{ fontSize: 10, color: 'var(--danger)' }}>vencido{totais.vencidos > 1 ? 's' : ''}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
          <Search size={15} color="var(--text3)" />
          <input placeholder="Buscar lançamentos..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tabs">
          {[{ k: 'todos', l: 'Todos' }, { k: 'pagamento', l: 'Pagamentos' }, { k: 'recebimento', l: 'Recebimentos' }].map(t => (
            <button key={t.k} className={`tab ${filtroTipo === t.k ? 'active' : ''}`} onClick={() => setFiltroTipo(t.k)}>{t.l}</button>
          ))}
        </div>
        <div className="tabs">
          {[{ k: 'todos', l: 'Todos' }, { k: 'pendente', l: 'Pendentes' }, { k: 'pago', l: 'Pagos' }, { k: 'vencido', l: 'Vencidos' }].map(s => (
            <button key={s.k} className={`tab ${filtroStatus === s.k ? 'active' : ''}`} onClick={() => setFiltroStatus(s.k)}>{s.l}</button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtrados.length === 0 ? (
        <EmptyState icon="💳" title="Nenhum lançamento" text="Registre pagamentos e recebimentos para controlar seu financeiro." action={<button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> Novo Lançamento</button>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.map(p => {
            const overdue = p.status === 'pendente' && p.vencimento && isOverdue(p.vencimento)
            return (
              <div key={p.id} className="card" style={{ borderLeft: `3px solid ${p.tipo === 'recebimento' ? 'var(--success)' : overdue ? 'var(--danger)' : 'var(--primary)'}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{p.tipo === 'recebimento' ? '💰' : '💸'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.descricao}</span>
                      <Badge type={p.status} />
                      {p.categoria && <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg4)', padding: '2px 7px', borderRadius: 10 }}>{p.categoria}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      {p.pessoa_nome && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}>
                          <Avatar name={p.pessoa_nome} size={18} /> {p.pessoa_nome}
                        </span>
                      )}
                      {p.vencimento && (
                        <span style={{ fontSize: 11, color: overdue ? 'var(--danger)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {fmtDateShort(p.vencimento)} {overdue && '⚠️'}
                        </span>
                      )}
                      {p.comprovante_url && (
                        <button
                          onClick={() => setPreviewUrl(p.comprovante_url!)}
                          style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <Eye size={10} /> Comprovante
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: p.tipo === 'recebimento' ? 'var(--success)' : 'var(--text)' }}>
                      {fmtCurrency(Number(p.valor))}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
                      {p.status === 'pendente' && (
                        <button className="btn btn-success btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => marcarPago(p.id)}>
                          ✓ Pago
                        </button>
                      )}
                      <button className="btn btn-ghost btn-icon" style={{ width: 26, height: 26 }} onClick={() => openEdit(p)}><Edit2 size={12} /></button>
                      <button className="btn btn-ghost btn-icon" style={{ width: 26, height: 26, color: 'var(--danger)' }} onClick={() => setConfirmId(p.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button className="fab" onClick={openNew}><Plus size={22} /></button>

      {/* Preview comprovante */}
      {previewUrl && (
        <div className="overlay" onClick={() => setPreviewUrl(null)}>
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-lg)', padding: 16, maxWidth: 480, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Comprovante</span>
              <button onClick={() => setPreviewUrl(null)} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}>×</button>
            </div>
            {previewUrl.startsWith('data:image') ? (
              <img src={previewUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 8 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Abrir Documento</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Lançamento' : 'Novo Lançamento'}>
        <div className="form-group">
          <label className="form-label">Descrição *</label>
          <div className="input-mic-group">
            <input className="form-input" placeholder="Ex: Pagamento fornecedor" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            <MicBtn onResult={handleMicDesc} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Tipo }))}>
              <option value="pagamento">💸 Pagamento</option>
              <option value="recebimento">💰 Recebimento</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Valor (R$) *</label>
            <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Vencimento</label>
            <input className="form-input" type="date" value={form.vencimento} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>
        {form.status === 'pago' && (
          <div className="form-group">
            <label className="form-label">Data do Pagamento</label>
            <input className="form-input" type="date" value={form.pago_dia} onChange={e => setForm(f => ({ ...f, pago_dia: e.target.value }))} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <input className="form-input" placeholder="Ex: Aluguel, Serviços..." value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Pessoa Vinculada</label>
            <select className="form-select" value={form.pessoa_id} onChange={e => setForm(f => ({ ...f, pessoa_id: e.target.value }))}>
              <option value="">— Nenhuma —</option>
              {store.pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Observações</label>
          <div className="input-mic-group">
            <textarea className="form-textarea" placeholder="Notas sobre este lançamento..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} />
            <MicBtn onResult={handleMicObs} />
          </div>
        </div>

        {/* Comprovante */}
        <div className="form-group">
          <label className="form-label">Comprovante</label>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFileUpload} />
          {form.comprovante_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
              <span style={{ fontSize: 20 }}>📎</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)' }}>Comprovante anexado</span>
              <button type="button" onClick={() => setPreviewUrl(form.comprovante_url)} className="btn btn-ghost btn-sm"><Eye size={13} /></button>
              <button type="button" onClick={() => setForm(f => ({ ...f, comprovante_url: '', comprovante_key: '' }))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>×</button>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Anexar Comprovante (imagem ou PDF)
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvar}>{editando ? 'Salvar' : 'Criar'}</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmId} onClose={() => setConfirmId(null)} onConfirm={() => confirmId && excluir(confirmId)} title="Excluir Lançamento" message="Deseja excluir este lançamento?" />
    </div>
  )
}
