import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Loader, Search, Mail, Phone, Trash2, Edit2, UserPlus, Check, Send, Mic, MicOff } from 'lucide-react'
import { equipeApi, auth, tarefasApi, type Pessoa, type MembroEquipe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useSpeechToText } from '../hooks/useSpeechToText'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const TIPO_CONFIG = {
  funcionario: { label: 'Funcionario', color: '#6C3BFF', emoji: '👔' },
  prestador:   { label: 'Prestador',   color: '#06B6D4', emoji: '🔧' },
  credor:      { label: 'Credor',      color: '#EF4444', emoji: '💸' },
  devedor:     { label: 'Devedor',     color: '#F59E0B', emoji: '💰' },
  cliente:     { label: 'Cliente',     color: '#10B981', emoji: '🤝' },
}

function PessoaModal({ initial, onSave, onClose }: {
  initial?: Pessoa; onSave: (p: Pessoa) => void; onClose: () => void
}) {
  const [nome, setNome]       = useState(initial?.nome || '')
  const [tipo, setTipo] = useState<'funcionario' | 'prestador' | 'credor' | 'devedor' | 'cliente'>(initial?.tipo || 'funcionario')
  const [cargo, setCargo]     = useState(initial?.cargo || '')
  const [contato, setContato] = useState(initial?.contato || '')
  const [email, setEmail]     = useState(initial?.email || '')
  const [valor, setValor]     = useState(initial?.valor ? String(initial.valor) : '')
  const [obs, setObs]         = useState(initial?.obs || '')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!nome.trim()) { toast('Nome e obrigatorio', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        nome: nome.trim(), tipo, cargo: cargo || undefined,
        contato: contato || undefined, email: email || undefined,
        valor: valor ? parseFloat(valor) : undefined, obs: obs || undefined,
      }
      const p = initial?.id
        ? await equipeApi.updatePessoa(initial.id, payload)
        : await equipeApi.createPessoa(payload)
      onSave(p)
      toast(initial?.id ? 'Pessoa atualizada!' : 'Pessoa adicionada!')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 32px', width: '100%', maxWidth: 540, maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{initial?.id ? 'Editar Pessoa' : 'Nova Pessoa'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Tipo</label>
            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value as 'funcionario' | 'prestador' | 'credor' | 'devedor' | 'cliente')}>
              {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label className="form-label">Cargo</label><input className="form-input" placeholder="Ex: Desenvolvedor" value={cargo} onChange={e => setCargo(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Telefone</label><input className="form-input" placeholder="(11) 99999-9999" value={contato} onChange={e => setContato(e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          {(tipo === 'credor' || tipo === 'devedor') && (
            <div className="form-group"><label className="form-label">Valor (R$)</label><input className="form-input" type="number" step="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} /></div>
          )}
          <div className="form-group"><label className="form-label">Observacoes</label><textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'Salvando...' : <><Check size={14} /> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConviteModal({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [nome, setNome]     = useState('')
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!nome.trim() || !email.trim() || !senha) { toast('Preencha todos os campos', 'error'); return }
    if (senha.length < 6) { toast('Senha deve ter ao menos 6 caracteres', 'error'); return }
    setSaving(true)
    try {
      await auth.invite({ nome: nome.trim(), email: email.trim(), senha })
      onSave()
      toast('Membro convidado!')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '24px 20px 32px', width: '100%', maxWidth: 540, maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Convidar Membro</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" placeholder="Nome do membro" value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">E-mail *</label><input className="form-input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Senha inicial *</label><input className="form-input" type="password" placeholder="Minimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'Convidando...' : <><UserPlus size={14} /> Convidar</>}
          </button>
        </div>
      </div>
    </div>
  )
}


function ModalTarefaMembro({ membro, onClose, onSaved }: { membro: MembroEquipe; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media')
  const [saving, setSaving] = useState(false)
  const { listening: micTitulo, toggle: toggleTitulo } = useSpeechToText(t => setTitulo(prev => (prev ? prev + ' ' : '') + t))
  const { listening: micDescricao, toggle: toggleDescricao } = useSpeechToText(t => setDescricao(prev => (prev ? prev + ' ' : '') + t))

  async function handleSave() {
    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    setSaving(true)
    try {
      await tarefasApi.create({
        titulo: titulo.trim(),
        descricao: descricao || undefined,
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: membro.id,
      })
      toast(`Tarefa enviada para ${membro.nome}!`)
      setTitulo('')
      setDescricao('')
      setPrazo('')
      setPrioridade('media')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar tarefa', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 12 }} onClick={e => e.currentTarget === e.target && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 560, maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Nova tarefa</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>Responsável: <strong>{membro.nome}</strong></p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Título *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Fale ou digite a tarefa" />
              <button type="button" onClick={toggleTitulo} className="btn btn-secondary" style={{ width: 44, padding: 0 }}>{micTitulo ? <MicOff size={16} /> : <Mic size={16} />}</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label className="form-label">Data / prazo</label><input className="form-input" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Prioridade</label><select className="form-input" value={prioridade} onChange={e => setPrioridade(e.target.value as 'baixa' | 'media' | 'alta')}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea className="form-input" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes, instruções ou checklist" style={{ resize: 'vertical' }} />
              <button type="button" onClick={toggleDescricao} className="btn btn-secondary" style={{ width: 44, padding: 0, height: 44 }}>{micDescricao ? <MicOff size={16} /> : <Mic size={16} />}</button>
            </div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(108,59,255,0.08)', color: 'var(--text3)', fontSize: 12 }}>Use o microfone para ditar título e descrição. A tarefa já será carregada no painel do membro.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>Fechar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2, gap: 8 }}>{saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</> : <><Send size={14} /> Enviar tarefa</>}</button>
        </div>
      </div>
    </div>
  )
}

export default function Equipe() {
  const { user } = useAuth()
  const isGestor = user?.role === 'gestor' || user?.role === 'sub_gestor'

  const [tab, setTab]               = useState('pessoas')
  const [pessoas, setPessoas]       = useState<Pessoa[]>([])
  const [membros, setMembros]       = useState<MembroEquipe[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [modalOpen, setModalOpen]   = useState(false)
  const [conviteOpen, setConviteOpen] = useState(false)
  const [editPessoa, setEditPessoa] = useState<Pessoa | null>(null)
  const [tarefaTarget, setTarefaTarget] = useState<MembroEquipe | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ps, ms] = await Promise.all([equipeApi.pessoas(), equipeApi.membros()])
      setPessoas(ps); setMembros(ms)
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const h = () => setModalOpen(true); window.addEventListener('nexus:open-new', h); return () => window.removeEventListener('nexus:open-new', h) }, [])

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta pessoa?')) return
    try { await equipeApi.removePessoa(id); setPessoas(p => p.filter(x => x.id !== id)); toast('Removida') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  const filtradas = pessoas.filter(p => {
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
    if (search) { const q = search.toLowerCase(); return p.nome.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) }
    return true
  })

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Equipe</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Pessoas e membros da organizacao</p>
        </div>
        {isGestor && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setConviteOpen(true)} style={{ gap: 6 }}><UserPlus size={14} /> Convidar</button>
            <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ gap: 6 }}><Plus size={16} /> Pessoa</button>
          </div>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'pessoas' ? 'active' : ''}`} onClick={() => setTab('pessoas')}>Pessoas ({pessoas.length})</button>
        <button className={`tab ${tab === 'membros' ? 'active' : ''}`} onClick={() => setTab('membros')}>Membros ({membros.length})</button>
      </div>

      {tab === 'pessoas' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos os tipos</option>
              {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando...</div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 700 }}>Nenhuma pessoa encontrada</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtradas.map(p => {
                const tc = TIPO_CONFIG[p.tipo as keyof typeof TIPO_CONFIG] || TIPO_CONFIG.funcionario
                return (
                  <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: tc.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, flexShrink: 0 }}>
                        {p.nome.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nome}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: tc.color, background: tc.color + '18', padding: '2px 7px', borderRadius: 99 }}>{tc.emoji} {tc.label}</span>
                          {p.cargo && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.cargo}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                          {p.contato && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}><Phone size={11} /> {p.contato}</span>}
                          {p.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}><Mail size={11} /> {p.email}</span>}
                        </div>
                        {p.valor && (p.tipo === 'credor' || p.tipo === 'devedor') && (
                          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: p.tipo === 'credor' ? '#EF4444' : '#10B981' }}>
                            {p.tipo === 'credor' ? 'Devo: ' : 'Me deve: '}{Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </div>
                        )}
                      </div>
                      {isGestor && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => setEditPessoa(p)} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={13} /></button>
                          <button onClick={() => handleDelete(p.id)} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                    {p.obs && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>{p.obs}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'membros' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {membros.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
              <div style={{ fontWeight: 700 }}>Nenhum membro cadastrado</div>
            </div>
          ) : membros.map(m => (
            <div key={m.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: m.role === 'gestor' ? 'rgba(108,59,255,0.2)' : 'rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, flexShrink: 0 }}>
                  {m.nome.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{m.nome}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: m.role === 'gestor' ? '#6C3BFF' : '#06B6D4', background: m.role === 'gestor' ? 'rgba(108,59,255,0.12)' : 'rgba(6,182,212,0.12)', padding: '2px 7px', borderRadius: 99 }}>{m.role === 'gestor' ? 'Gestor' : 'Membro'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text3)' }}><Mail size={10} /> {m.email}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.tarefas_concluidas} concluidas</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.tarefas_pendentes} pendentes</div>
                </div>
                {isGestor && (
                  <button className="btn btn-secondary" onClick={() => setTarefaTarget(m)} style={{ gap: 6, flexShrink: 0 }}>
                    <Send size={13} /> Tarefa
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(modalOpen || editPessoa) && (
        <PessoaModal
          initial={editPessoa || undefined}
          onSave={p => {
            if (editPessoa) setPessoas(prev => prev.map(x => x.id === p.id ? p : x))
            else setPessoas(prev => [p, ...prev])
            setModalOpen(false); setEditPessoa(null)
          }}
          onClose={() => { setModalOpen(false); setEditPessoa(null) }}
        />
      )}
      {conviteOpen && <ConviteModal onSave={() => { setConviteOpen(false); load() }} onClose={() => setConviteOpen(false)} />}
      {tarefaTarget && <ModalTarefaMembro membro={tarefaTarget} onClose={() => setTarefaTarget(null)} onSaved={() => load()} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
