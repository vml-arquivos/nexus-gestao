import React, { useState, useCallback } from 'react'
import { Plus, Search, CheckCircle2, Circle, Trash2, Edit2, ChevronDown, ChevronUp, Clock, User } from 'lucide-react'
import { nanoid, fmtDateShort, today, isOverdue } from '../lib/utils'
import { store, saveStore } from '../lib/store'
import type { Tarefa, ChecklistItem } from '../lib/supabase'
import { Avatar, Badge, Modal, ConfirmDialog, EmptyState, MicBtn, ProgressBar, toast } from '../components/ui'

type Status = Tarefa['status']
type Prioridade = Tarefa['prioridade']

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'todos', label: 'Todas' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'em_progresso', label: 'Em Progresso' },
  { key: 'concluida', label: 'Concluídas' },
]

export default function Tarefas() {
  const [tarefas, setTarefas] = useState<Tarefa[]>(store.tarefas)
  const [search, setSearch] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Tarefa | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newCheckItem, setNewCheckItem] = useState('')

  const [form, setForm] = useState({
    titulo: '', descricao: '', data: today(), prazo: '',
    prioridade: 'media' as Prioridade, status: 'pendente' as Status,
    responsavel_id: '', obs: '', checklist: [] as ChecklistItem[]
  })

  function openNew() {
    setEditando(null)
    setForm({ titulo: '', descricao: '', data: today(), prazo: '', prioridade: 'media', status: 'pendente', responsavel_id: '', obs: '', checklist: [] })
    setModalOpen(true)
  }

  function openEdit(t: Tarefa) {
    setEditando(t)
    setForm({
      titulo: t.titulo, descricao: t.descricao ?? '', data: t.data ?? today(),
      prazo: t.prazo ?? '', prioridade: t.prioridade, status: t.status,
      responsavel_id: t.responsavel_id ?? '', obs: t.obs ?? '',
      checklist: t.checklist ?? []
    })
    setModalOpen(true)
  }

  function salvar() {
    if (!form.titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    const pessoa = store.pessoas.find(p => p.id === form.responsavel_id)
    if (editando) {
      const updated = store.tarefas.map(t => t.id === editando.id ? {
        ...t, ...form,
        responsavel_nome: pessoa?.nome,
        checklist: form.checklist
      } : t)
      store.tarefas = updated
      saveStore('tarefas', updated)
      setTarefas([...updated])
      toast('Tarefa atualizada!')
    } else {
      const nova: Tarefa = {
        id: nanoid(),
        user_id: store.config.userId || 'local',
        titulo: form.titulo.trim(),
        descricao: form.descricao || undefined,
        data: form.data || undefined,
        prazo: form.prazo || undefined,
        prioridade: form.prioridade,
        status: form.status,
        responsavel_id: form.responsavel_id || undefined,
        responsavel_nome: pessoa?.nome,
        checklist: form.checklist,
        obs: form.obs || undefined,
        created_at: new Date().toISOString(),
      }
      store.tarefas = [...store.tarefas, nova]
      saveStore('tarefas', store.tarefas)
      setTarefas([...store.tarefas])
      toast('Tarefa criada!')
    }
    setModalOpen(false)
  }

  function excluir(id: string) {
    store.tarefas = store.tarefas.filter(t => t.id !== id)
    saveStore('tarefas', store.tarefas)
    setTarefas([...store.tarefas])
    toast('Tarefa removida')
  }

  function toggleStatus(id: string) {
    const updated = store.tarefas.map(t => {
      if (t.id !== id) return t
      const next: Status = t.status === 'concluida' ? 'pendente' : t.status === 'pendente' ? 'em_progresso' : 'concluida'
      return { ...t, status: next }
    })
    store.tarefas = updated
    saveStore('tarefas', updated)
    setTarefas([...updated])
  }

  function toggleCheckItem(tarefaId: string, itemId: string) {
    const updated = store.tarefas.map(t => {
      if (t.id !== tarefaId) return t
      return {
        ...t,
        checklist: (t.checklist ?? []).map(c => c.id === itemId ? { ...c, feito: !c.feito } : c)
      }
    })
    store.tarefas = updated
    saveStore('tarefas', updated)
    setTarefas([...updated])
  }

  function addCheckItemForm() {
    if (!newCheckItem.trim()) return
    setForm(f => ({ ...f, checklist: [...f.checklist, { id: nanoid(), texto: newCheckItem.trim(), feito: false }] }))
    setNewCheckItem('')
  }

  function removeCheckItemForm(id: string) {
    setForm(f => ({ ...f, checklist: f.checklist.filter(c => c.id !== id) }))
  }

  const filtradas = tarefas.filter(t => {
    const okStatus = statusFiltro === 'todos' || t.status === statusFiltro
    const q = search.toLowerCase()
    return okStatus && (t.titulo.toLowerCase().includes(q) || (t.descricao ?? '').toLowerCase().includes(q) || (t.responsavel_nome ?? '').toLowerCase().includes(q))
  }).sort((a, b) => {
    const pri = { alta: 0, media: 1, baixa: 2 }
    return (pri[a.prioridade] ?? 1) - (pri[b.prioridade] ?? 1)
  })

  const handleMicTitulo = useCallback((t: string) => setForm(f => ({ ...f, titulo: f.titulo ? f.titulo + ' ' + t : t })), [])
  const handleMicDesc = useCallback((t: string) => setForm(f => ({ ...f, descricao: f.descricao ? f.descricao + ' ' + t : t })), [])
  const handleMicObs = useCallback((t: string) => setForm(f => ({ ...f, obs: f.obs ? f.obs + ' ' + t : t })), [])
  const handleMicCheck = useCallback((t: string) => setNewCheckItem(t), [])

  const equipe = store.pessoas.filter(p => p.tipo === 'funcionario' || p.tipo === 'prestador')

  const priorityColor = { alta: 'var(--danger)', media: 'var(--warning)', baixa: 'var(--success)' }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title"><CheckCircle2 size={22} /> Tarefas</div>
          <div className="page-subtitle">{tarefas.filter(t => t.status !== 'concluida').length} pendentes · {tarefas.filter(t => t.status === 'concluida').length} concluídas</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Nova Tarefa</button>
      </div>

      {/* Search */}
      <div className="search-bar" style={{ marginBottom: 12 }}>
        <Search size={15} color="var(--text3)" />
        <input placeholder="Buscar tarefas..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Status tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {STATUS_TABS.map(s => (
          <button key={s.key} className={`tab ${statusFiltro === s.key ? 'active' : ''}`} onClick={() => setStatusFiltro(s.key)}>
            {s.label}
            <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 11 }}>
              ({s.key === 'todos' ? tarefas.length : tarefas.filter(t => t.status === s.key).length})
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtradas.length === 0 ? (
        <EmptyState icon="✅" title="Nenhuma tarefa" text="Crie tarefas e atribua à sua equipe." action={<button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> Nova Tarefa</button>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtradas.map(t => {
            const checkDone = (t.checklist ?? []).filter(c => c.feito).length
            const checkTotal = (t.checklist ?? []).length
            const expanded = expandedId === t.id
            const overdue = t.prazo && t.status !== 'concluida' && isOverdue(t.prazo)

            return (
              <div key={t.id} className="card" style={{ borderLeft: `3px solid ${priorityColor[t.prioridade]}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Toggle status */}
                  <button
                    onClick={() => toggleStatus(t.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.status === 'concluida' ? 'var(--success)' : t.status === 'em_progresso' ? 'var(--secondary)' : 'var(--text3)', marginTop: 1, flexShrink: 0 }}
                  >
                    {t.status === 'concluida' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, textDecoration: t.status === 'concluida' ? 'line-through' : 'none', opacity: t.status === 'concluida' ? 0.6 : 1 }}>
                        {t.titulo}
                      </span>
                      <Badge type={t.prioridade} />
                      <Badge type={t.status} />
                    </div>

                    {t.descricao && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>{t.descricao}</div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      {t.prazo && (
                        <span style={{ fontSize: 11, color: overdue ? 'var(--danger)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {fmtDateShort(t.prazo)} {overdue && '⚠️'}
                        </span>
                      )}
                      {t.responsavel_nome && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text3)' }}>
                          <Avatar name={t.responsavel_nome} size={18} />
                          {t.responsavel_nome}
                        </span>
                      )}
                      {checkTotal > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                          ✅ {checkDone}/{checkTotal}
                        </span>
                      )}
                    </div>

                    {checkTotal > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <ProgressBar value={checkDone} max={checkTotal} />
                      </div>
                    )}

                    {/* Checklist expanded */}
                    {expanded && checkTotal > 0 && (
                      <div style={{ marginTop: 10 }}>
                        {(t.checklist ?? []).map(c => (
                          <div key={c.id} className="checklist-item" onClick={() => toggleCheckItem(t.id, c.id)} style={{ cursor: 'pointer' }}>
                            <div className={`check-box ${c.feito ? 'done' : ''}`}>
                              {c.feito && '✓'}
                            </div>
                            <span style={{ fontSize: 13, textDecoration: c.feito ? 'line-through' : 'none', opacity: c.feito ? 0.5 : 1 }}>
                              {c.texto}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {checkTotal > 0 && (
                      <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => setExpandedId(expanded ? null : t.id)}>
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => openEdit(t)}><Edit2 size={13} /></button>
                    <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28, color: 'var(--danger)' }} onClick={() => setConfirmId(t.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* FAB mobile */}
      <button className="fab" onClick={openNew}><Plus size={22} /></button>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Tarefa' : 'Nova Tarefa'}>
        <div className="form-group">
          <label className="form-label">Título *</label>
          <div className="input-mic-group">
            <input className="form-input" placeholder="O que precisa ser feito?" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            <MicBtn onResult={handleMicTitulo} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <div className="input-mic-group">
            <textarea className="form-textarea" placeholder="Detalhes da tarefa..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            <MicBtn onResult={handleMicDesc} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Prioridade</label>
            <select className="form-select" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as Prioridade }))}>
              <option value="alta">🔴 Alta</option>
              <option value="media">🟡 Média</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}>
              <option value="pendente">Pendente</option>
              <option value="em_progresso">Em Progresso</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Prazo</label>
            <input className="form-input" type="date" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
          </div>
        </div>
        {equipe.length > 0 && (
          <div className="form-group">
            <label className="form-label">Responsável</label>
            <select className="form-select" value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
              <option value="">— Sem responsável —</option>
              {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        )}

        {/* Checklist */}
        <div className="form-group">
          <label className="form-label">Checklist de Execução</label>
          {form.checklist.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div className={`check-box ${c.feito ? 'done' : ''}`} onClick={() => setForm(f => ({ ...f, checklist: f.checklist.map(ci => ci.id === c.id ? { ...ci, feito: !ci.feito } : ci) }))}>
                {c.feito && '✓'}
              </div>
              <span style={{ flex: 1, fontSize: 13 }}>{c.texto}</span>
              <button type="button" onClick={() => removeCheckItemForm(c.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ))}
          <div className="input-mic-group" style={{ marginTop: 6 }}>
            <input
              className="form-input"
              placeholder="Adicionar item ao checklist..."
              value={newCheckItem}
              onChange={e => setNewCheckItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheckItemForm())}
            />
            <MicBtn onResult={handleMicCheck} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addCheckItemForm}><Plus size={14} /></button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Observações</label>
          <div className="input-mic-group">
            <textarea className="form-textarea" placeholder="Notas adicionais..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} />
            <MicBtn onResult={handleMicObs} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvar}>{editando ? 'Salvar' : 'Criar Tarefa'}</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmId} onClose={() => setConfirmId(null)} onConfirm={() => confirmId && excluir(confirmId)} title="Excluir Tarefa" message="Tem certeza que deseja excluir esta tarefa?" />
    </div>
  )
}
