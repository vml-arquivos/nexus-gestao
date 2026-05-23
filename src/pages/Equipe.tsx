import React, { useState, useCallback } from 'react'
import { Plus, Search, Phone, Mail, Edit2, Trash2, User, Briefcase } from 'lucide-react'
import { nanoid } from '../lib/utils'
import { store, saveStore } from '../lib/store'
import type { Pessoa } from '../lib/supabase'
import { Avatar, Badge, Modal, ConfirmDialog, EmptyState, MicBtn, toast } from '../components/ui'

const TIPOS: Pessoa['tipo'][] = ['funcionario', 'prestador', 'cliente', 'credor', 'devedor']

export default function Equipe() {
  const [pessoas, setPessoas] = useState<Pessoa[]>(store.pessoas)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Pessoa | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const [form, setForm] = useState({
    nome: '', tipo: 'funcionario' as Pessoa['tipo'],
    cargo: '', contato: '', email: '', obs: ''
  })

  function openNew() {
    setEditando(null)
    setForm({ nome: '', tipo: 'funcionario', cargo: '', contato: '', email: '', obs: '' })
    setModalOpen(true)
  }

  function openEdit(p: Pessoa) {
    setEditando(p)
    setForm({ nome: p.nome, tipo: p.tipo, cargo: p.cargo ?? '', contato: p.contato ?? '', email: p.email ?? '', obs: p.obs ?? '' })
    setModalOpen(true)
  }

  function salvar() {
    if (!form.nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    if (editando) {
      const updated = store.pessoas.map(p => p.id === editando.id ? { ...p, ...form } : p)
      store.pessoas = updated
      saveStore('pessoas', updated)
      setPessoas([...updated])
      toast('Pessoa atualizada!')
    } else {
      const nova: Pessoa = {
        id: nanoid(),
        user_id: store.config.userId || 'local',
        nome: form.nome.trim(),
        tipo: form.tipo,
        cargo: form.cargo || undefined,
        contato: form.contato || undefined,
        email: form.email || undefined,
        obs: form.obs || undefined,
        created_at: new Date().toISOString(),
      }
      store.pessoas = [...store.pessoas, nova]
      saveStore('pessoas', store.pessoas)
      setPessoas([...store.pessoas])
      toast('Pessoa adicionada!')
    }
    setModalOpen(false)
  }

  function excluir(id: string) {
    store.pessoas = store.pessoas.filter(p => p.id !== id)
    saveStore('pessoas', store.pessoas)
    setPessoas([...store.pessoas])
    toast('Removido com sucesso')
  }

  const filtradas = pessoas.filter(p => {
    const ok = filtroTipo === 'todos' || p.tipo === filtroTipo
    const q = search.toLowerCase()
    return ok && (p.nome.toLowerCase().includes(q) || (p.cargo ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q))
  })

  const handleMicNome = useCallback((t: string) => setForm(f => ({ ...f, nome: f.nome ? f.nome + ' ' + t : t })), [])
  const handleMicObs = useCallback((t: string) => setForm(f => ({ ...f, obs: f.obs ? f.obs + ' ' + t : t })), [])

  const equipe = pessoas.filter(p => p.tipo === 'funcionario' || p.tipo === 'prestador')
  const clientes = pessoas.filter(p => p.tipo === 'cliente')
  const financeiros = pessoas.filter(p => p.tipo === 'credor' || p.tipo === 'devedor')

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title"><User size={22} /> Equipe & Pessoas</div>
          <div className="page-subtitle">{pessoas.length} pessoa{pessoas.length !== 1 ? 's' : ''} cadastrada{pessoas.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Adicionar</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Equipe', count: equipe.length, color: 'var(--primary-light)', emoji: '👥' },
          { label: 'Clientes', count: clientes.length, color: 'var(--success)', emoji: '🤝' },
          { label: 'Financeiros', count: financeiros.length, color: 'var(--warning)', emoji: '💰' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{s.emoji}</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: s.color }}>{s.count}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search size={15} color="var(--text3)" />
          <input placeholder="Buscar por nome, cargo ou email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tabs">
          {['todos', ...TIPOS].map(t => (
            <button key={t} className={`tab ${filtroTipo === t ? 'active' : ''}`} onClick={() => setFiltroTipo(t)}>
              {t === 'todos' ? 'Todos' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtradas.length === 0 ? (
        <EmptyState icon="👥" title="Nenhuma pessoa encontrada" text="Adicione membros da equipe, clientes ou parceiros financeiros." action={<button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> Adicionar</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {filtradas.map(p => {
            const tarefas = store.tarefas.filter(t => t.responsavel_id === p.id)
            const pags = store.pagamentos.filter(pg => pg.pessoa_id === p.id)
            const docs = store.documentos.filter(d => d.pessoa_id === p.id)
            return (
              <div key={p.id} className="card" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <Avatar name={p.nome} size={46} url={p.avatar_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                    {p.cargo && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{p.cargo}</div>}
                    <div style={{ marginTop: 6 }}><Badge type={p.tipo} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => openEdit(p)}><Edit2 size={13} /></button>
                    <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28, color: 'var(--danger)' }} onClick={() => setConfirmId(p.id)}><Trash2 size={13} /></button>
                  </div>
                </div>

                {/* Contato */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                  {p.contato && (
                    <a href={`tel:${p.contato}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', textDecoration: 'none' }}>
                      <Phone size={12} color="var(--text3)" /> {p.contato}
                    </a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', textDecoration: 'none' }}>
                      <Mail size={12} color="var(--text3)" /> {p.email}
                    </a>
                  )}
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--primary-light)' }}>{tarefas.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>tarefas</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--warning)' }}>{pags.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>pagamentos</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--secondary)' }}>{docs.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>documentos</div>
                  </div>
                </div>

                {p.obs && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', lineHeight: 1.5 }}>
                    "{p.obs}"
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Pessoa' : 'Nova Pessoa'}>
        <div className="form-group">
          <label className="form-label">Nome *</label>
          <div className="input-mic-group">
            <input className="form-input" placeholder="Nome completo" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            <MicBtn onResult={handleMicNome} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select className="form-select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Pessoa['tipo'] }))}>
            <option value="funcionario">Funcionário</option>
            <option value="prestador">Prestador de Serviço</option>
            <option value="cliente">Cliente</option>
            <option value="credor">Credor</option>
            <option value="devedor">Devedor</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Cargo / Função</label>
            <input className="form-input" placeholder="Ex: Desenvolvedor" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Telefone / WhatsApp</label>
            <input className="form-input" placeholder="(11) 99999-9999" value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">E-mail</label>
          <input className="form-input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Observações</label>
          <div className="input-mic-group">
            <textarea className="form-textarea" placeholder="Notas sobre esta pessoa..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} />
            <MicBtn onResult={handleMicObs} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvar}>{editando ? 'Salvar' : 'Adicionar'}</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && excluir(confirmId)}
        title="Remover Pessoa"
        message="Deseja remover esta pessoa? Os registros vinculados (tarefas, pagamentos, documentos) não serão excluídos."
      />
    </div>
  )
}
