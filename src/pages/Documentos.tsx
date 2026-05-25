import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, FileText, Trash2, ExternalLink, Loader, Plus, X, User, Search, Camera } from 'lucide-react'
import { documentosApi, equipeApi, pagamentosApi, type Documento, type Pessoa, type Pagamento, type HistoricoPessoa } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

function fmtSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const TIPO_CONFIG = {
  comprovante: { label: 'Comprovante', color: '#10B981', emoji: '🧾' },
  contrato:    { label: 'Contrato',    color: '#6C3BFF', emoji: '📄' },
  nota_fiscal: { label: 'Nota Fiscal', color: '#F59E0B', emoji: '🗒️' },
  recibo:      { label: 'Recibo',      color: '#06B6D4', emoji: '📋' },
  foto:        { label: 'Foto',        color: '#EC4899', emoji: '📷' },
  outro:       { label: 'Outro',       color: '#6B7280', emoji: '📁' },
} as const

function isImage(mime?: string) { return mime?.startsWith('image/') }

function UploadModal({ pessoas, pagamentos, onSave, onClose }: {
  pessoas: Pessoa[]; pagamentos: Pagamento[];
  onSave: (d: Documento) => void; onClose: () => void
}) {
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile]           = useState<File | null>(null)
  const [preview, setPreview]     = useState<string | null>(null)
  const [titulo, setTitulo]       = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo]           = useState('outro')
  const [pessoaId, setPessoaId]   = useState('')
  const [pagamentoId, setPagamentoId] = useState('')
  const [progress, setProgress]   = useState(0)
  const [uploading, setUploading] = useState(false)

  function handleFileSelect(f: File) {
    setFile(f)
    if (!titulo) setTitulo(f.name.replace(/\.[^/.]+$/, ''))
    if (f.type.startsWith('image/')) { setTipo('foto'); const r = new FileReader(); r.onload = e => setPreview(e.target?.result as string); r.readAsDataURL(f) }
    else if (f.type === 'application/pdf') setTipo('comprovante')
    else setPreview(null)
  }

  async function handleUpload() {
    if (!file) { toast('Selecione um arquivo', 'error'); return }
    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    setUploading(true)
    try {
      const { documento } = await documentosApi.upload(file, { titulo: titulo.trim(), descricao: descricao || undefined, tipo, pessoa_id: pessoaId || undefined, pagamento_id: pagamentoId || undefined }, setProgress)
      onSave(documento)
      toast('Arquivo enviado com sucesso!')
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro ao enviar arquivo', 'error') }
    finally { setUploading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backdropFilter: 'blur(4px)', overflowY: 'auto', padding: 'max(20px, calc(env(safe-area-inset-top, 0px) + 12px)) 16px max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 32px', width: '100%', maxWidth: 54, margin: '0 auto'0, overflowY: 'auto', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>📎 Enviar Arquivo</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        {!file ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <button onClick={() => cameraInputRef.current?.click()} style={{ padding: '20px 16px', background: 'var(--bg3)', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text2)' }}>
                <Camera size={28} color="#6C3BFF" /><span style={{ fontSize: 13, fontWeight: 600 }}>Câmera</span><span style={{ fontSize: 11, color: 'var(--text3)' }}>Tirar foto</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} style={{ padding: '20px 16px', background: 'var(--bg3)', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text2)' }}>
                <Upload size={28} color="#06B6D4" /><span style={{ fontSize: 13, fontWeight: 600 }}>Galeria / Arquivo</span><span style={{ fontSize: 11, color: 'var(--text3)' }}>PDF, imagem, doc…</span>
              </button>
            </div>
            <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }} onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleFileSelect(e.dataTransfer.files[0]) }} onDragOver={e => e.preventDefault()}>Arraste um arquivo aqui</div>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {preview ? (
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                <button onClick={() => { setFile(null); setPreview(null) }} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><X size={14} /></button>
              </div>
            ) : (
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <FileText size={24} color="#6C3BFF" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtSize(file.size)}</div>
                </div>
                <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
            )}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group"><label className="form-label">Título *</label><input className="form-input" placeholder="Ex: Comprovante transferência João" value={titulo} onChange={e => setTitulo(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Descrição</label><input className="form-input" placeholder="Detalhes adicionais…" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Tipo de documento</label><select className="form-input" value={tipo} onChange={e => setTipo(e.target.value)}>{Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}</select></div>
          {pessoas.length > 0 && <div className="form-group"><label className="form-label">Vincular à pessoa (histórico)</label><select className="form-input" value={pessoaId} onChange={e => setPessoaId(e.target.value)}><option value="">Sem vínculo</option>{pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>}
          {pagamentos.length > 0 && <div className="form-group"><label className="form-label">Vincular a pagamento (comprovante)</label><select className="form-input" value={pagamentoId} onChange={e => setPagamentoId(e.target.value)}><option value="">Sem vínculo</option>{pagamentos.slice(0,50).map(p => <option key={p.id} value={p.id}>{p.tipo === 'pagamento' ? '💸' : '💰'} {p.titulo} — R$ {Number(p.valor).toFixed(2)}</option>)}</select></div>}
          {uploading && <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}><span>Enviando…</span><span>{progress}%</span></div><div style={{ height: 6, background: 'var(--bg3)', borderRadius: 99 }}><div style={{ height: '100%', borderRadius: 99, background: 'var(--grad-primary)', width: `${progress}%`, transition: 'width 0.2s' }} /></div></div>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={uploading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !file} style={{ flex: 2 }}>
            {uploading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</> : <><Upload size={14} /> Enviar Arquivo</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoricoModal({ pessoaId, onClose }: { pessoaId: string; onClose: () => void }) {
  const [historico, setHistorico] = useState<HistoricoPessoa | null>(null)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'docs' | 'pags' | 'tarefas'>('docs')

  useEffect(() => {
    documentosApi.historicoPessoa(pessoaId).then(setHistorico).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [pessoaId])

  function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backdropFilter: 'blur(4px)', overflowY: 'auto', padding: 'max(20px, calc(env(safe-area-inset-top, 0px) + 12px)) 16px max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 32px', width: '100%', maxWidth: 54, margin: '0 auto'0, overflowY: 'auto', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{loading ? 'Carregando…' : `📋 ${historico?.pessoa.nome}`}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--text3)' }} /></div>
        ) : historico ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>💸 Eu devo</div>
                <div style={{ fontWeight: 900, fontSize: 18, color: '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(historico.resumo.totalDevo)}</div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>💰 Me devem</div>
                <div style={{ fontWeight: 900, fontSize: 18, color: '#10B981', fontFamily: 'var(--font-heading)' }}>{fmt(historico.resumo.totalMeDevem)}</div>
              </div>
            </div>
            <div className="tabs" style={{ marginBottom: 16 }}>
              <button className={`tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>📎 Arquivos ({historico.documentos.length})</button>
              <button className={`tab ${tab === 'pags' ? 'active' : ''}`} onClick={() => setTab('pags')}>💳 Pagamentos ({historico.pagamentos.length})</button>
              <button className={`tab ${tab === 'tarefas' ? 'active' : ''}`} onClick={() => setTab('tarefas')}>✅ Tarefas ({historico.tarefas.length})</button>
            </div>
            {tab === 'docs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historico.documentos.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>Nenhum arquivo vinculado</div>
                : historico.documentos.map(d => {
                  const tc = TIPO_CONFIG[d.tipo] || TIPO_CONFIG.outro
                  return (
                    <div key={d.id} style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{isImage(d.mime_type) ? '🖼️' : tc.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.titulo}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(d.created_at)}{d.tamanho ? ` · ${fmtSize(d.tamanho)}` : ''}</div>
                      </div>
                      <a href={d.arquivo_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', textDecoration: 'none' }}><ExternalLink size={13} /></a>
                    </div>
                  )
                })}
              </div>
            )}
            {tab === 'pags' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historico.pagamentos.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>Nenhum pagamento registrado</div>
                : historico.pagamentos.map(p => (
                  <div key={p.id} style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{p.tipo === 'pagamento' ? '💸' : '💰'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.titulo}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(p.created_at)}{p.vencimento ? ` · Vence: ${fmtDate(p.vencimento)}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: p.tipo === 'pagamento' ? '#EF4444' : '#10B981' }}>{p.tipo === 'pagamento' ? '-' : '+'}{Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: p.status === 'pago' ? '#10B981' : p.status === 'cancelado' ? '#6B7280' : '#F59E0B', background: p.status === 'pago' ? 'rgba(16,185,129,0.12)' : p.status === 'cancelado' ? 'rgba(107,114,128,0.12)' : 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 99 }}>{p.status === 'pago' ? 'Pago' : p.status === 'cancelado' ? 'Cancelado' : 'Pendente'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'tarefas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historico.tarefas.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>Nenhuma tarefa vinculada</div>
                : historico.tarefas.map(t => (
                  <div key={t.id} style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{t.status === 'concluida' ? '✅' : t.status === 'em_progresso' ? '🔄' : '⏳'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, textDecoration: t.status === 'concluida' ? 'line-through' : 'none', opacity: t.status === 'concluida' ? 0.6 : 1 }}>{t.titulo}</div>
                      {t.prazo && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Prazo: {fmtDate(t.prazo)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function Documentos() {
  const { user } = useAuth()
  const isGestor = user?.role === 'gestor'
  const [documentos, setDocumentos]   = useState<Documento[]>([])
  const [pessoas, setPessoas]         = useState<Pessoa[]>([])
  const [pagamentos, setPagamentos]   = useState<Pagamento[]>([])
  const [loading, setLoading]         = useState(true)
  const [uploadOpen, setUploadOpen]   = useState(false)
  const [historicoId, setHistoricoId] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo]   = useState('todos')
  const [filtroPessoa, setFiltroPessoa] = useState('')
  const [search, setSearch]           = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, p, pg] = await Promise.all([documentosApi.list(), equipeApi.pessoas(), pagamentosApi.list({ status: 'pendente' })])
      setDocumentos(d); setPessoas(p); setPagamentos(pg)
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro ao carregar documentos', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const h = () => setUploadOpen(true); window.addEventListener('nexus:open-new', h); return () => window.removeEventListener('nexus:open-new', h) }, [])

  async function handleDelete(id: string) {
    if (!confirm('Excluir este arquivo?')) return
    try { await documentosApi.remove(id); setDocumentos(p => p.filter(d => d.id !== id)); toast('Arquivo excluído') }
    catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  const filtrados = documentos.filter(d => {
    if (filtroTipo !== 'todos' && d.tipo !== filtroTipo) return false
    if (filtroPessoa && d.pessoa_id !== filtroPessoa) return false
    if (search) { const q = search.toLowerCase(); return d.titulo.toLowerCase().includes(q) || (d.descricao || '').toLowerCase().includes(q) || (d.pessoa_nome || '').toLowerCase().includes(q) }
    return true
  })

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 760, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>📎 Documentos</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Comprovantes, contratos e arquivos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setUploadOpen(true)} style={{ gap: 6 }}><Plus size={16} /> Enviar</button>
      </div>

      {pessoas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, marginBottom: 10, color: 'var(--text2)' }}>👤 Histórico por Pessoa</h2>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {pessoas.slice(0, 10).map(p => (
              <button key={p.id} onClick={() => setHistoricoId(p.id)} style={{ flexShrink: 0, padding: '8px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                <User size={12} /> {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar arquivos…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="todos">Todos os tipos</option>
          {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        {pessoas.length > 0 && <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={filtroPessoa} onChange={e => setFiltroPessoa(e.target.value)}><option value="">Todas as pessoas</option>{pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📎</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum arquivo encontrado</div>
          <div style={{ fontSize: 13 }}>Envie comprovantes, contratos e outros arquivos</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrados.map(doc => {
            const tc = TIPO_CONFIG[doc.tipo] || TIPO_CONFIG.outro
            return (
              <div key={doc.id} style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {isImage(doc.mime_type) && <div style={{ height: 140, background: 'var(--bg3)', overflow: 'hidden' }}><img src={doc.arquivo_url} alt={doc.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: tc.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{isImage(doc.mime_type) ? '🖼️' : tc.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.titulo}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: tc.color, background: tc.color + '18', padding: '2px 7px', borderRadius: 99 }}>{tc.label}</span>
                        {doc.pessoa_nome && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text3)' }}><User size={10} /> {doc.pessoa_nome}</span>}
                        {doc.tamanho && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtSize(doc.tamanho)}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{fmtDate(doc.created_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <a href={doc.arquivo_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', textDecoration: 'none' }}><ExternalLink size={14} /></a>
                      {isGestor && <button onClick={() => handleDelete(doc.id)} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                  {doc.descricao && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>{doc.descricao}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {uploadOpen && <UploadModal pessoas={pessoas} pagamentos={pagamentos} onSave={d => { setDocumentos(p => [d, ...p]); setUploadOpen(false) }} onClose={() => setUploadOpen(false)} />}
      {historicoId && <HistoricoModal pessoaId={historicoId} onClose={() => setHistoricoId(null)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
