import React, { useState, useRef } from 'react'
import { Plus, Search, FileText, Upload, Eye, Trash2, Download, Filter } from 'lucide-react'
import { nanoid, fmtDate } from '../lib/utils'
import { store, saveStore } from '../lib/store'
import type { Documento } from '../lib/supabase'
import { Avatar, Badge, Modal, ConfirmDialog, EmptyState, toast } from '../components/ui'

const TIPOS: Documento['tipo'][] = ['comprovante', 'contrato', 'nota_fiscal', 'outro']
const TIPO_ICONS: Record<string, string> = { comprovante: '🧾', contrato: '📝', nota_fiscal: '🗒️', outro: '📎' }
const TIPO_LABELS: Record<string, string> = { comprovante: 'Comprovante', contrato: 'Contrato', nota_fiscal: 'Nota Fiscal', outro: 'Outro' }

function fmtSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function Documentos() {
  const [documentos, setDocumentos] = useState<Documento[]>(store.documentos)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<Documento | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    titulo: '', descricao: '', tipo: 'outro' as Documento['tipo'],
    pessoa_id: '', pagamento_id: '',
    arquivo_url: '', arquivo_key: '', mime_type: '', tamanho: 0
  })

  function openNew() {
    setForm({ titulo: '', descricao: '', tipo: 'outro', pessoa_id: '', pagamento_id: '', arquivo_url: '', arquivo_key: '', mime_type: '', tamanho: 0 })
    setModalOpen(true)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { toast('Arquivo muito grande (máx 15MB)', 'error'); return }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const key = `doc_${nanoid()}_${file.name}`
      try {
        localStorage.setItem(`nx_file_${key}`, dataUrl)
        setForm(f => ({
          ...f,
          titulo: f.titulo || file.name.replace(/\.[^.]+$/, ''),
          arquivo_url: dataUrl,
          arquivo_key: key,
          mime_type: file.type,
          tamanho: file.size
        }))
        toast('Arquivo carregado!')
      } catch {
        toast('Erro ao salvar. Arquivo muito grande para armazenamento local.', 'error')
      }
      setUploading(false)
    }
    reader.onerror = () => { toast('Erro ao ler arquivo', 'error'); setUploading(false) }
    reader.readAsDataURL(file)
  }

  function salvar() {
    if (!form.titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    if (!form.arquivo_url) { toast('Selecione um arquivo', 'error'); return }
    const pessoa = store.pessoas.find(p => p.id === form.pessoa_id)
    const novo: Documento = {
      id: nanoid(), user_id: store.config.userId || 'local',
      titulo: form.titulo.trim(), descricao: form.descricao || undefined,
      tipo: form.tipo, arquivo_url: form.arquivo_url, arquivo_key: form.arquivo_key,
      mime_type: form.mime_type || undefined, tamanho: form.tamanho || undefined,
      pessoa_id: form.pessoa_id || undefined, pessoa_nome: pessoa?.nome,
      pagamento_id: form.pagamento_id || undefined,
      created_at: new Date().toISOString()
    }
    store.documentos = [...store.documentos, novo]
    saveStore('documentos', store.documentos)
    setDocumentos([...store.documentos])
    setModalOpen(false)
    toast('Documento salvo!')
  }

  function excluir(id: string) {
    const doc = store.documentos.find(d => d.id === id)
    if (doc?.arquivo_key) {
      try { localStorage.removeItem(`nx_file_${doc.arquivo_key}`) } catch {}
    }
    store.documentos = store.documentos.filter(d => d.id !== id)
    saveStore('documentos', store.documentos)
    setDocumentos([...store.documentos])
    toast('Documento removido')
  }

  function downloadDoc(doc: Documento) {
    const link = document.createElement('a')
    link.href = doc.arquivo_url
    link.download = doc.titulo
    link.click()
  }

  const filtrados = documentos.filter(d => {
    const okTipo = filtroTipo === 'todos' || d.tipo === filtroTipo
    const q = search.toLowerCase()
    return okTipo && (d.titulo.toLowerCase().includes(q) || (d.pessoa_nome ?? '').toLowerCase().includes(q) || (d.descricao ?? '').toLowerCase().includes(q))
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title"><FileText size={22} /> Documentos</div>
          <div className="page-subtitle">{documentos.length} documento{documentos.length !== 1 ? 's' : ''} armazenado{documentos.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo Documento</button>
      </div>

      {/* Stats por tipo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {TIPOS.map(t => {
          const count = documentos.filter(d => d.tipo === t).length
          return (
            <div key={t} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span>{TIPO_ICONS[t]}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{count}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{TIPO_LABELS[t]}</span>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
          <Search size={15} color="var(--text3)" />
          <input placeholder="Buscar documentos..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tabs">
          {[{ k: 'todos', l: 'Todos' }, ...TIPOS.map(t => ({ k: t, l: TIPO_LABELS[t] }))].map(t => (
            <button key={t.k} className={`tab ${filtroTipo === t.k ? 'active' : ''}`} onClick={() => setFiltroTipo(t.k)}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtrados.length === 0 ? (
        <EmptyState icon="🗂️" title="Nenhum documento" text="Armazene comprovantes, contratos e documentos vinculados a pessoas." action={<button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> Novo Documento</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {filtrados.map(d => (
            <div key={d.id} className="card" style={{ cursor: 'default' }}>
              {/* Preview thumbnail */}
              <div
                onClick={() => setPreviewDoc(d)}
                style={{
                  height: 100, borderRadius: 8, background: 'var(--bg3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10, cursor: 'pointer', overflow: 'hidden',
                  border: '1px solid var(--border)'
                }}
              >
                {d.mime_type?.startsWith('image/') ? (
                  <img src={d.arquivo_url} alt={d.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 40 }}>{TIPO_ICONS[d.tipo]}</span>
                )}
              </div>

              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.titulo}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg4)', padding: '2px 7px', borderRadius: 10 }}>
                  {TIPO_LABELS[d.tipo]}
                </span>
                {d.tamanho && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtSize(d.tamanho)}</span>}
              </div>

              {d.pessoa_nome && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Avatar name={d.pessoa_nome} size={18} />
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{d.pessoa_nome}</span>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                {fmtDate(d.created_at)}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setPreviewDoc(d)}>
                  <Eye size={12} /> Ver
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadDoc(d)}>
                  <Download size={12} />
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setConfirmId(d.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="fab" onClick={openNew}><Plus size={22} /></button>

      {/* Preview modal */}
      {previewDoc && (
        <div className="overlay" onClick={() => setPreviewDoc(null)}>
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-lg)', padding: 16, maxWidth: 560, width: '92%', maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{previewDoc.titulo}</div>
                {previewDoc.pessoa_nome && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Avatar name={previewDoc.pessoa_nome} size={16} /> {previewDoc.pessoa_nome}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadDoc(previewDoc)}><Download size={13} /></button>
                <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }} onClick={() => setPreviewDoc(null)}>×</button>
              </div>
            </div>
            {previewDoc.mime_type?.startsWith('image/') ? (
              <img src={previewDoc.arquivo_url} alt={previewDoc.titulo} style={{ width: '100%', borderRadius: 8 }} />
            ) : previewDoc.mime_type === 'application/pdf' ? (
              <iframe src={previewDoc.arquivo_url} style={{ width: '100%', height: 500, borderRadius: 8, border: 'none' }} title={previewDoc.titulo} />
            ) : (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>{TIPO_ICONS[previewDoc.tipo]}</div>
                <p style={{ color: 'var(--text2)', marginBottom: 16 }}>Pré-visualização não disponível</p>
                <button className="btn btn-primary" onClick={() => downloadDoc(previewDoc)}><Download size={15} /> Baixar Arquivo</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal novo documento */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Documento">
        {/* Upload area */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${form.arquivo_url ? 'var(--success)' : 'var(--border2)'}`,
            borderRadius: 'var(--radius)',
            padding: '24px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: 16,
            background: form.arquivo_url ? 'rgba(16,185,129,0.05)' : 'var(--bg3)',
            transition: 'all 0.2s'
          }}
        >
          <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={handleFileSelect} />
          {uploading ? (
            <div style={{ color: 'var(--text3)' }}>Carregando...</div>
          ) : form.arquivo_url ? (
            <div>
              <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
              <div style={{ fontSize: 13, color: 'var(--success)' }}>Arquivo carregado!</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{fmtSize(form.tamanho)}</div>
            </div>
          ) : (
            <div>
              <Upload size={28} color="var(--text3)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 4 }}>Clique para selecionar arquivo</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Imagens, PDF, Word, Excel · Máx 15MB</div>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="form-input" placeholder="Nome do documento" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Documento['tipo'] }))}>
              <option value="comprovante">🧾 Comprovante</option>
              <option value="contrato">📝 Contrato</option>
              <option value="nota_fiscal">🗒️ Nota Fiscal</option>
              <option value="outro">📎 Outro</option>
            </select>
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
          <label className="form-label">Pagamento Vinculado</label>
          <select className="form-select" value={form.pagamento_id} onChange={e => setForm(f => ({ ...f, pagamento_id: e.target.value }))}>
            <option value="">— Nenhum —</option>
            {store.pagamentos.map(p => <option key={p.id} value={p.id}>{p.descricao} — R$ {Number(p.valor).toFixed(2)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <textarea className="form-textarea" placeholder="Notas sobre este documento..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvar} disabled={uploading}>Salvar</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmId} onClose={() => setConfirmId(null)} onConfirm={() => confirmId && excluir(confirmId)} title="Excluir Documento" message="Deseja excluir este documento? Esta ação não pode ser desfeita." />
    </div>
  )
}
