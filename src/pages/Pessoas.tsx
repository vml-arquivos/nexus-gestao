import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, X, Loader, Search, Mail, Phone, Trash2, Edit2, UserPlus, Check, WalletCards, CircleDollarSign, Share2, MessageCircle, Copy, Briefcase, Wrench, Handshake, UserRound, Eye } from 'lucide-react'
import { equipeApi, auth, type Pessoa, type MembroEquipe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useVisualTexts } from '../hooks/useVisualTexts'

// O componente Pessoas unifica todos os tipos de pessoas cadastradas no sistema:
// membros da equipe, prestadores de serviço, credores, devedores e clientes.
// Ele reutiliza a lógica existente em Equipe.tsx, mas muda os textos e rótulos
// para refletir que o cadastro é abrangente e não apenas de colaboradores internos.

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const TIPO_CONFIG = {
  funcionario: { label: 'Funcionário', color: '#2563EB', icon: Briefcase },
  prestador:   { label: 'Prestador',   color: '#06B6D4', icon: Wrench },
  credor:      { label: 'Credor',      color: '#EF4444', icon: WalletCards },
  devedor:     { label: 'Devedor',     color: '#F59E0B', icon: CircleDollarSign },
  cliente:     { label: 'Cliente',     color: '#10B981', icon: Handshake },
} as const

function PessoaModal({ initial, onSave, onClose }: {
  initial?: Pessoa; onSave: (p: Pessoa) => void; onClose: () => void
}) {
  const [nome, setNome]       = useState(initial?.nome || '')
  const [tipo, setTipo]       = useState<Pessoa['tipo']>(initial?.tipo || 'funcionario')
  const [cargo, setCargo]     = useState(initial?.cargo || '')
  const [contato, setContato] = useState(initial?.contato || '')
  const [email, setEmail]     = useState(initial?.email || '')
  const [valor, setValor]     = useState(initial?.valor ? String(initial.valor) : '')
  const [obs, setObs]         = useState(initial?.obs || '')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        nome: nome.trim(), tipo,
        cargo: cargo || undefined,
        contato: contato || undefined,
        email: email || undefined,
        valor: valor ? parseFloat(valor) : undefined,
        obs: obs || undefined,
      }
      const p = initial?.id
        ? await equipeApi.updatePessoa(initial.id, payload)
        : await equipeApi.createPessoa(payload)
      onSave(p)
      toast(initial?.id ? 'Pessoa atualizada!' : 'Pessoa adicionada!')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto', zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: '24px', padding: '28px 24px', width: '100%', maxWidth: 540, overflowY: 'auto', marginTop: 'auto', marginBottom: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{initial?.id ? 'Editar Contato' : 'Novo Contato'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <input className="form-input" placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value as Pessoa['tipo'])}>
              {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                <option key={k} value={k as Pessoa['tipo']}>{v.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Cargo</label>
              <input className="form-input" placeholder="Ex: Desenvolvedor" value={cargo} onChange={e => setCargo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-input" placeholder="(11) 99999-9999" value={contato} onChange={e => setContato(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input className="form-input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {(tipo === 'credor' || tipo === 'devedor') && (
            <div className="form-group">
              <label className="form-label">Valor (R$)</label>
              <input className="form-input" type="number" step="0.01" placeholder="0,00" value={valor} onWheel={e => (e.target as HTMLInputElement).blur()} onChange={e => setValor(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'Salvando...' : (<><Check size={14} /> Salvar</>)}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConviteModal({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [saving, setSaving] = useState(false)
  const [conviteGerado, setConviteGerado] = useState(false)

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const conviteTexto = `Olá${nome ? `, ${nome}` : ''}! Você foi convidado(a) para acessar o Nexus Gestão Inteligente.\n\nAcesse: ${appUrl}/login\nE-mail: ${email}\nSenha inicial: ${senha}\n\nApós entrar, altere sua senha.`

  async function compartilharNativo() {
    if (!conviteGerado) { toast('Crie o convite antes de compartilhar', 'error'); return }
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Convite Nexus', text: conviteTexto })
      } else {
        await navigator.clipboard.writeText(conviteTexto)
        toast('Convite copiado para compartilhar')
      }
    } catch {
      // usuário cancelou o compartilhamento
    }
  }

  function compartilharWhatsApp() {
    if (!conviteGerado) { toast('Crie o convite antes de enviar', 'error'); return }
    window.open(`https://wa.me/?text=${encodeURIComponent(conviteTexto)}`, '_blank', 'noopener,noreferrer')
  }

  function compartilharEmail() {
    if (!conviteGerado) { toast('Crie o convite antes de enviar', 'error'); return }
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Convite para o Nexus')}&body=${encodeURIComponent(conviteTexto)}`
  }

  async function copiarConvite() {
    if (!conviteGerado) { toast('Crie o convite antes de copiar', 'error'); return }
    await navigator.clipboard.writeText(conviteTexto)
    toast('Convite copiado')
  }

  async function handleSave() {
    if (!nome.trim() || !email.trim() || !senha) { toast('Preencha todos os campos', 'error'); return }
    if (senha.length < 6) { toast('Senha deve ter ao menos 6 caracteres', 'error'); return }
    setSaving(true)
    try {
      await auth.invite({ nome: nome.trim(), email: email.trim(), senha })
      setConviteGerado(true)
      onSave()
      toast('Membro convidado! Agora você pode compartilhar o convite.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto', zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: '24px', padding: '28px 24px', width: '100%', maxWidth: 540, overflowY: 'auto', marginTop: 'auto', marginBottom: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>Convidar membro</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" placeholder="Nome do membro" value={nome} onChange={e => { setNome(e.target.value); setConviteGerado(false) }} /></div>
          <div className="form-group"><label className="form-label">E-mail *</label><input className="form-input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => { setEmail(e.target.value); setConviteGerado(false) }} /></div>
          <div className="form-group"><label className="form-label">Senha inicial *</label><input className="form-input" type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => { setSenha(e.target.value); setConviteGerado(false) }} /></div>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: 18 }}>
          {saving ? 'Convidando...' : (<><UserPlus size={14} /> Criar convite</>)}
        </button>

        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Compartilhar convite</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="btn btn-secondary" type="button" onClick={compartilharWhatsApp}><MessageCircle size={14} /> WhatsApp</button>
            <button className="btn btn-secondary" type="button" onClick={compartilharNativo}><Share2 size={14} /> Redes sociais</button>
            <button className="btn btn-secondary" type="button" onClick={compartilharEmail}><Mail size={14} /> E-mail</button>
            <button className="btn btn-secondary" type="button" onClick={copiarConvite}><Copy size={14} /> Copiar</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            Instagram e outros apps aparecem pela opção “Redes sociais” quando o navegador/dispositivo suporta compartilhamento nativo.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

export default function Pessoas() {
  const { user } = useAuth()
  const { t } = useVisualTexts()
  const navigate = useNavigate()
  const location = useLocation()
  const canDeleteOwnRecords = !!user

  const [tab, setTab]               = useState<'pessoas' | 'membros'>('pessoas')
  const [pessoas, setPessoas]       = useState<Pessoa[]>([])
  const [membros, setMembros]       = useState<MembroEquipe[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [modalOpen, setModalOpen]   = useState(false)
  const [conviteOpen, setConviteOpen] = useState(false)
  const [editPessoa, setEditPessoa] = useState<Pessoa | null>(null)

  // Abre a pessoa certa quando chega por link direto (ex: busca global).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id')
    if (!id || pessoas.length === 0) return
    const achada = pessoas.find(p => p.id === id)
    if (achada) setEditPessoa(achada)
  }, [location.search, pessoas])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ps, ms] = await Promise.all([equipeApi.pessoas(), equipeApi.membros()])
      setPessoas(ps); setMembros(ms)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = () => setModalOpen(true)
    window.addEventListener('nexus:open-new', h)
    return () => window.removeEventListener('nexus:open-new', h)
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Excluir este contato?')) return
    try {
      await equipeApi.removePessoa(id)
      setPessoas(p => p.filter(x => x.id !== id))
      toast('Contato removido')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    }
  }


  function novoLancamento(pessoa: Pessoa, tipo: 'pagamento' | 'recebimento') {
    navigate('/financeiro', {
      state: {
        novoLancamento: {
          pessoa_id: pessoa.id,
          pessoa_nome: pessoa.nome,
          tipo,
          status: 'pendente',
        },
      },
    })
  }

  const filtradas = pessoas.filter(p => {
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
    if (search) {
      const q = search.toLowerCase()
      return p.nome.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 760, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16 }}>{t('people.pageTitle')}</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>
            {t('people.pageSubtitle')}
          </p>
        </div>
        {canDeleteOwnRecords && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setConviteOpen(true)} style={{ gap: 6 }}><UserPlus size={14} /> Convidar</button>
            <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ gap: 6 }}><Plus size={16} /> Contato</button>
          </div>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'pessoas' ? 'active' : ''}`} onClick={() => setTab('pessoas')}>
          Contatos ({pessoas.length})
        </button>
        <button className={`tab ${tab === 'membros' ? 'active' : ''}`} onClick={() => setTab('membros')}>
          Membros ({membros.length})
        </button>
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
              {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}>
              <Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando...
            </div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 500 }}>Nenhum contato encontrado</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtradas.map(p => {
                const tc = TIPO_CONFIG[p.tipo as keyof typeof TIPO_CONFIG] || TIPO_CONFIG.funcionario
                const TipoIcon = tc.icon
                return (
                  <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: tc.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: 16, flexShrink: 0 }}>
                        {p.avatar_url ? <img src={p.avatar_url} alt={p.nome} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserRound size={18} color={tc.color} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.nome}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: tc.color, background: tc.color + '18', padding: '2px 7px', borderRadius: 99 }}><TipoIcon size={10} /> {tc.label}</span>
                          {p.cargo && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.cargo}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                          {p.contato && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}><Phone size={11} /> {p.contato}</span>}
                          {p.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}><Mail size={11} /> {p.email}</span>}
                        </div>
                        {p.valor && (p.tipo === 'credor' || p.tipo === 'devedor') && (
                          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 500, color: p.tipo === 'credor' ? '#EF4444' : '#10B981' }}>
                            {p.tipo === 'credor' ? 'Devo: ' : 'Me deve: '}{Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </div>
                        )}
                      </div>
                      {canDeleteOwnRecords && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => setEditPessoa(p)} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={13} /></button>
                          <button onClick={() => handleDelete(p.id)} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                    {p.obs && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>{p.obs}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => navigate(`/pessoas/${p.id}`)}
                        style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <Eye size={13} /> Ficha
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => novoLancamento(p, 'pagamento')}
                        style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <WalletCards size={13} /> Pagar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => novoLancamento(p, 'recebimento')}
                        style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <CircleDollarSign size={13} /> Receber
                      </button>
                    </div>
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
              <div style={{ fontWeight: 500 }}>Nenhum membro cadastrado</div>
            </div>
          ) : membros.map(m => (
            <div key={m.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: m.role === 'gestor' ? 'rgba(108,59,255,0.2)' : 'rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: 16, flexShrink: 0 }}>
                  {m.nome.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{m.nome}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: m.role === 'gestor' ? '#2563EB' : '#06B6D4', background: m.role === 'gestor' ? 'rgba(37,99,235,0.12)' : 'rgba(6,182,212,0.12)', padding: '2px 7px', borderRadius: 99 }}>{m.role === 'gestor' ? 'Gestor' : 'Membro'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text3)' }}><Mail size={10} /> {m.email}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.tarefas_concluidas} concluídas</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.tarefas_pendentes} pendentes</div>
                </div>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
