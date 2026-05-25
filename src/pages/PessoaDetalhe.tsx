import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronUp, CircleDollarSign, ClipboardList,
  CreditCard, FileText, History, Loader, Pencil, Phone,
  Plus, Mail, Trash2, Upload, UserRound, WalletCards, X,
  AlertTriangle, Link2, ReceiptText,
} from 'lucide-react'
import {
  documentosApi, equipeApi, pagamentosApi, tarefasApi,
  type Documento, type HistoricoPessoa, type Pagamento,
  type Pessoa, type Tarefa,
} from '../lib/api'
import { useAuth } from '../lib/AuthContext'

// ── tipos internos ────────────────────────────────────────────────────────────
type Tab = 'resumo' | 'pagar' | 'receber' | 'tarefas' | 'documentos' | 'historico'

interface GrupoPag {
  key: string
  grupoId: string | null
  titulo: string
  tipo: 'pagamento' | 'recebimento'
  itens: Pagamento[]
  total: number
  pendente: number
  pago: number
  vencido: number
  parcelas: number
  proximoVenc?: string
  status: 'pago' | 'pendente' | 'vencido' | 'parcial'
  formaPagamento?: string
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d?: string) {
  if (!d) return '—'
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR')
}
function fmtRelativa(d?: string) {
  if (!d) return ''
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const dt = new Date(`${d.slice(0,10)}T00:00:00`)
  const diff = Math.round((dt.getTime() - hoje.getTime()) / 86400000)
  if (diff === 0) return 'Vence hoje'
  if (diff < 0)  return `Venceu há ${Math.abs(diff)}d`
  if (diff === 1) return 'Vence amanhã'
  return `Em ${diff} dias`
}
function extrairGrupoId(obs?: string) {
  const m = obs?.match(/grupo_id:([^|\s]+)/)
  return m ? m[1] : null
}
function extrairForma(obs?: string) {
  const m = obs?.match(/forma:([^|\s]+)/)
  return m ? m[1] : undefined
}
function hoje() { return new Date().toISOString().slice(0, 10) }

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;
    padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;
    z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.35);pointer-events:none;`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ── agrupar pagamentos por grupo_id ou avulso ─────────────────────────────────
function agrupar(pags: Pagamento[]): GrupoPag[] {
  const map = new Map<string, Pagamento[]>()
  for (const p of pags) {
    const gid = extrairGrupoId(p.obs)
    const key = gid ? `g:${gid}` : `i:${p.id}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  const now = hoje()
  return Array.from(map.entries()).map(([key, itens]) => {
    const sorted = [...itens].sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))
    const base = sorted[0]
    const pendentes = itens.filter(p => p.status === 'pendente')
    const pagos    = itens.filter(p => p.status === 'pago')
    const vencidos = pendentes.filter(p => (p.vencimento || '') < now)
    const total    = itens.reduce((s, p) => s + Number(p.valor), 0)
    const pendente = pendentes.reduce((s, p) => s + Number(p.valor), 0)
    const pago     = pagos.reduce((s, p) => s + Number(p.valor), 0)
    const vencido  = vencidos.reduce((s, p) => s + Number(p.valor), 0)
    const proximo  = pendentes.sort((a, b) => (a.vencimento||'').localeCompare(b.vencimento||''))[0]
    let status: GrupoPag['status'] =
      pendente === 0 ? 'pago' :
      vencido > 0    ? 'vencido' :
      pago > 0       ? 'parcial' : 'pendente'
    return {
      key, grupoId: key.startsWith('g:') ? key.slice(2) : null,
      titulo: base.titulo, tipo: base.tipo, itens, total,
      pendente, pago, vencido, parcelas: itens.length,
      proximoVenc: proximo?.vencimento || base.vencimento,
      status,
      formaPagamento: extrairForma(base.obs) || base.categoria,
    }
  }).sort((a, b) => (a.proximoVenc || '').localeCompare(b.proximoVenc || ''))
}

// ── componentes auxiliares ───────────────────────────────────────────────────
function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: 30, textAlign: 'center', color: 'var(--text3)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {icon && <div style={{ opacity: .5 }}>{icon}</div>}
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  )
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  pago:     { label: 'Pago',     bg: 'rgba(16,185,129,.15)', color: '#10B981' },
  pendente: { label: 'Pendente', bg: 'rgba(245,158,11,.12)', color: '#F59E0B' },
  vencido:  { label: 'Vencido',  bg: 'rgba(239,68,68,.15)',  color: '#EF4444' },
  parcial:  { label: 'Parcial',  bg: 'rgba(108,59,255,.15)', color: '#B99FFF' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pendente
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, letterSpacing: '.03em' }}>
      {s.label}
    </span>
  )
}

// ── Cartão de grupo de pagamentos ────────────────────────────────────────────
function GrupoCard({ g, onAbrirParcelas, onMarcarPago, onExcluir }: {
  g: GrupoPag
  onAbrirParcelas: (g: GrupoPag) => void
  onMarcarPago: (ids: string[]) => void
  onExcluir: (ids: string[]) => void
}) {
  const cor = g.tipo === 'pagamento' ? 'var(--danger)' : 'var(--success)'
  const Icon = g.tipo === 'pagamento' ? WalletCards : CircleDollarSign
  const venceHj = g.proximoVenc === hoje()
  const relativa = fmtRelativa(g.proximoVenc)

  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${g.status === 'vencido' ? 'rgba(239,68,68,.35)' : 'var(--border)'}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {/* cabeçalho do card */}
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={cor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {g.titulo}
            <StatusBadge status={g.status} />
            {g.parcelas > 1 && (
              <span style={{ fontSize: 10, color: 'var(--text3)', background: 'var(--bg3)', padding: '1px 7px', borderRadius: 20 }}>
                {g.itens.filter(p => p.status === 'pago').length}/{g.parcelas} parcelas
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text3)' }}>
            {g.proximoVenc && (
              <span style={{ color: g.status === 'vencido' ? '#EF4444' : venceHj ? '#F59E0B' : 'var(--text3)', fontWeight: g.status === 'vencido' || venceHj ? 600 : 400 }}>
                {relativa || fmtDate(g.proximoVenc)}
              </span>
            )}
            {g.formaPagamento && <span>· {g.formaPagamento}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {g.pendente > 0 && <div style={{ color: cor, fontWeight: 900, fontSize: 15, fontFamily: 'var(--font-heading)' }}>{fmt(g.pendente)}</div>}
          {g.pago > 0 && <div style={{ color: 'var(--text3)', fontSize: 11 }}>Pago {fmt(g.pago)}</div>}
          {g.parcelas > 1 && g.total !== g.pendente && <div style={{ color: 'var(--text3)', fontSize: 10 }}>Total {fmt(g.total)}</div>}
        </div>
      </div>

      {/* barra de progresso para parcelados */}
      {g.parcelas > 1 && g.total > 0 && (
        <div style={{ height: 3, background: 'var(--bg3)', margin: '0 14px 10px' }}>
          <div style={{ height: '100%', width: `${Math.round((g.pago / g.total) * 100)}%`, background: 'var(--success)', borderRadius: 2, transition: 'width .3s' }} />
        </div>
      )}

      {/* ações rápidas */}
      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 6 }}>
        {g.parcelas > 1 ? (
          <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => onAbrirParcelas(g)}>
            <ReceiptText size={12} /> Ver parcelas
          </button>
        ) : g.status !== 'pago' ? (
          <button className="btn btn-success btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => onMarcarPago(g.itens.map(p => p.id))}>
            <Check size={12} /> Marcar pago
          </button>
        ) : null}
        <button className="btn btn-danger btn-sm" style={{ width: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => onExcluir(g.itens.map(p => p.id))}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Modal de parcelas ─────────────────────────────────────────────────────────
function ModalParcelas({ grupo, onClose, onMarcarPago, onExcluirParcela }: {
  grupo: GrupoPag
  onClose: () => void
  onMarcarPago: (ids: string[]) => void
  onExcluirParcela: (id: string) => void
}) {
  const sorted = [...grupo.itens].sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))
  const now = hoje()
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '20px 18px 32px', width: '100%', maxWidth: 540, maxHeight: '88dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>{grupo.titulo}</h2>
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>{grupo.parcelas} parcelas · Total {fmt(grupo.total)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((p, i) => {
            const vencido = p.status === 'pendente' && (p.vencimento || '') < now
            return (
              <div key={p.id} style={{ background: 'var(--bg3)', border: `1px solid ${vencido ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: p.status === 'pago' ? 'rgba(16,185,129,.2)' : 'var(--bg4)', border: `1px solid ${p.status === 'pago' ? 'rgba(16,185,129,.4)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: p.status === 'pago' ? '#10B981' : 'var(--text3)', flexShrink: 0 }}>
                  {p.status === 'pago' ? <Check size={12} /> : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Parcela {i + 1}
                    <StatusBadge status={vencido ? 'vencido' : p.status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Vence {fmtDate(p.vencimento)}{p.pago_em ? ` · Pago ${fmtDate(p.pago_em)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(Number(p.valor))}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {p.status !== 'pago' && (
                      <button className="btn btn-success btn-sm" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => onMarcarPago([p.id])}>
                        <Check size={10} /> Pago
                      </button>
                    )}
                    <button className="btn btn-danger btn-sm" style={{ padding: '3px 8px' }} onClick={() => onExcluirParcela(p.id)}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Modal de upload ───────────────────────────────────────────────────────────
function ModalUpload({ pessoaId, onClose, onSaved }: { pessoaId: string; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState('comprovante')
  const [progresso, setProgresso] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!file || !titulo.trim()) { toast('Título e arquivo são obrigatórios', 'error'); return }
    setSalvando(true)
    try {
      await documentosApi.upload(file, { titulo: titulo.trim(), tipo, pessoa_id: pessoaId }, setProgresso)
      toast('Documento salvo!')
      onSaved()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro no upload', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '20px 18px 32px', width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>Enviar documento</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-input" placeholder="Ex: Comprovante de pagamento" value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="comprovante">Comprovante de pagamento</option>
              <option value="contrato">Contrato</option>
              <option value="nota_fiscal">Nota fiscal</option>
              <option value="recibo">Recibo</option>
              <option value="foto">Foto</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
            <button className="btn btn-ghost" style={{ width: '100%', border: '1px dashed var(--border2)', padding: '14px' }} onClick={() => inputRef.current?.click()}>
              <Upload size={14} /> {file ? file.name : 'Selecionar arquivo (imagem, PDF…)'}
            </button>
          </div>
          {salvando && (
            <div style={{ background: 'var(--bg3)', borderRadius: 8, overflow: 'hidden', height: 6 }}>
              <div style={{ width: `${progresso}%`, height: '100%', background: 'var(--grad-primary)', transition: 'width .2s' }} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={salvando}>
            {salvando ? `Enviando ${progresso}%…` : <><Check size={14} /> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de edição de pessoa ─────────────────────────────────────────────────
function ModalEditPessoa({ pessoa, onClose, onSaved }: { pessoa: Pessoa; onClose: () => void; onSaved: (p: Pessoa) => void }) {
  const [nome,    setNome]    = useState(pessoa.nome)
  const [tipo,    setTipo]    = useState(pessoa.tipo)
  const [cargo,   setCargo]   = useState(pessoa.cargo || '')
  const [contato, setContato] = useState(pessoa.contato || '')
  const [email,   setEmail]   = useState(pessoa.email || '')
  const [valor,   setValor]   = useState(pessoa.valor ? String(pessoa.valor) : '')
  const [obs,     setObs]     = useState(pessoa.obs || '')
  const [docTipo, setDocTipo] = useState<'cpf'|'cnpj'|''>('')
  const [docNum,  setDocNum]  = useState('')
  const [saving,  setSaving]  = useState(false)

  // Extrair doc do obs se já existir
  useEffect(() => {
    const m = pessoa.obs?.match(/\|(cpf|cnpj):([^\|]+)/)
    if (m) { setDocTipo(m[1] as 'cpf'|'cnpj'); setDocNum(m[2]) }
  }, [pessoa.obs])

  async function handleSave() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSaving(true)
    // guarda CPF/CNPJ no campo obs como metadado
    const obsBase = obs.replace(/\|(cpf|cnpj):[^\|]+/g, '').trim()
    const docTag  = docNum.trim() ? `|${docTipo || 'cpf'}:${docNum.trim()}` : ''
    try {
      const updated = await equipeApi.updatePessoa(pessoa.id, {
        nome: nome.trim(), tipo,
        cargo: cargo || undefined,
        contato: contato || undefined,
        email: email || undefined,
        valor: valor ? parseFloat(valor) : undefined,
        obs: `${obsBase}${docTag}` || undefined,
      })
      onSaved(updated)
      toast('Pessoa atualizada!')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '20px 18px 32px', width: '100%', maxWidth: 540, maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>Editar contato</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <input className="form-input" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value as Pessoa['tipo'])}>
                <option value="funcionario">Funcionário</option>
                <option value="prestador">Prestador</option>
                <option value="credor">Credor</option>
                <option value="devedor">Devedor</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Cargo / Função</label>
              <input className="form-input" value={cargo} onChange={e => setCargo(e.target.value)} />
            </div>
          </div>
          {/* PF / PJ */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Tipo doc.</label>
              <select className="form-input" value={docTipo} onChange={e => setDocTipo(e.target.value as 'cpf'|'cnpj'|'')}>
                <option value="">—</option>
                <option value="cpf">CPF (PF)</option>
                <option value="cnpj">CNPJ (PJ)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{docTipo === 'cnpj' ? 'CNPJ' : 'CPF'}</label>
              <input className="form-input" placeholder={docTipo === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'} value={docNum} onChange={e => setDocNum(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Telefone / WhatsApp</label>
              <input className="form-input" value={contato} onChange={e => setContato(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          {(tipo === 'credor' || tipo === 'devedor' || tipo === 'funcionario') && (
            <div className="form-group">
              <label className="form-label">Valor de referência (R$)</label>
              <input className="form-input" type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : <><Check size={14} /> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de nova tarefa ────────────────────────────────────────────────────
function ModalNovaTarefa({ pessoaId, pessoaNome, onClose, onSaved }: { pessoaId: string; pessoaNome: string; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo]       = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo]         = useState('')
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media')
  const [saving, setSaving]       = useState(false)

  async function handleSave() {
    if (!titulo.trim()) {
      toast('Título é obrigatório', 'error')
      return
    }
    setSaving(true)
    try {
      await tarefasApi.create({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: pessoaId,
      })
      toast('Tarefa criada!')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar tarefa', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ background: 'var(--bg2)', borderRadius: '20px', padding: '20px 18px 32px', width: '100%', maxWidth: 540, maxHeight: '92dvh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>Nova tarefa para {pessoaNome}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input
              className="form-input"
              placeholder="Ex: Enviar contrato"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Detalhes da tarefa"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Prazo</label>
              <input
                className="form-input"
                type="date"
                value={prazo}
                onChange={e => setPrazo(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select
                className="form-input"
                value={prioridade}
                onChange={e => setPrioridade(e.target.value as 'baixa' | 'media' | 'alta')}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : (
              <>
                <Check size={14} /> Criar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────
export default function PessoaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [hist,    setHist]    = useState<HistoricoPessoa | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('resumo')

  const [modalParcelas, setModalParcelas] = useState<GrupoPag | null>(null)
  const [modalUpload,   setModalUpload]   = useState(false)
  const [modalEdit,     setModalEdit]     = useState(false)
  // modal para criação de nova tarefa
  const [modalNovaTarefa, setModalNovaTarefa] = useState(false)

  // ── carrega histórico ──
  async function carregar() {
    if (!id) return
    setLoading(true)
    try {
      const h = await documentosApi.historicoPessoa(id)
      setHist(h)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [id])

  // ── marcar pago ──
  async function marcarPago(ids: string[]) {
    try {
      await Promise.all(ids.map(pid => pagamentosApi.update(pid, { status: 'pago', pago_em: hoje() })))
      toast(`${ids.length > 1 ? ids.length + ' pagamentos' : 'Pagamento'} confirmado!`)
      await carregar()
      setModalParcelas(null)
    } catch { toast('Erro ao marcar como pago', 'error') }
  }

  // ── excluir ──
  async function excluirPagamentos(ids: string[]) {
    if (!confirm(`Excluir ${ids.length > 1 ? ids.length + ' lançamentos' : 'este lançamento'}?`)) return
    try {
      await Promise.all(ids.map(pid => pagamentosApi.remove(pid)))
      toast('Excluído!')
      await carregar()
      setModalParcelas(null)
    } catch { toast('Erro ao excluir', 'error') }
  }

  async function excluirDoc(docId: string) {
    if (!confirm('Excluir este documento?')) return
    try {
      await documentosApi.remove(docId)
      toast('Documento removido!')
      await carregar()
    } catch { toast('Erro ao excluir', 'error') }
  }

  // ── novo lançamento → vai para Financeiro com state ──
  function novoLancamento(tipo: 'pagamento' | 'recebimento') {
    if (!hist?.pessoa) return
    navigate('/financeiro', {
      state: { novoLancamento: { pessoa_id: hist.pessoa.id, pessoa_nome: hist.pessoa.nome, tipo, status: 'pendente' } },
    })
  }

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center', color: 'var(--text3)' }}>
        <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }
  if (!hist?.pessoa) {
    return (
      <div style={{ padding: 24 }}>
        <button className="btn btn-ghost" onClick={() => navigate('/pessoas')} style={{ marginBottom: 14 }}><ArrowLeft size={14} /> Voltar</button>
        <EmptyState text="Pessoa não encontrada." icon={<UserRound size={32} />} />
      </div>
    )
  }

  const pessoa  = hist.pessoa
  const grupos  = agrupar(hist.pagamentos || [])
  const aPagar  = grupos.filter(g => g.tipo === 'pagamento')
  const aRec    = grupos.filter(g => g.tipo === 'recebimento')
  const docs    = hist.documentos || []
  const tarefas = hist.tarefas || []
  const saldo   = (hist.resumo.totalMeDevem || 0) - (hist.resumo.totalDevo || 0)
  const totalVenc = grupos.filter(g => g.status === 'vencido').reduce((s, g) => s + g.vencido, 0)

  // extrair doc (CPF/CNPJ) do campo obs
  const docMatch = pessoa.obs?.match(/\|(cpf|cnpj):([^\|]+)/)
  const docLabel = docMatch ? `${docMatch[1].toUpperCase()} ${docMatch[2]}` : null
  const obsLimpa = pessoa.obs?.replace(/\|(cpf|cnpj):[^\|]+/g, '').trim()

  // histórico unificado cronológico
  const historicoItens = [
    ...grupos.map(g => ({ id: g.key, titulo: g.titulo, data: g.proximoVenc, sub: `${g.tipo === 'pagamento' ? '↑ Pagar' : '↓ Receber'} · ${fmt(g.pendente || g.total)}`, status: g.status, Icon: g.tipo === 'pagamento' ? WalletCards : CircleDollarSign, cor: g.tipo === 'pagamento' ? 'var(--danger)' : 'var(--success)' })),
    ...docs.map(d => ({ id: d.id, titulo: d.titulo, data: d.created_at, sub: `Documento · ${d.tipo}`, status: 'doc', Icon: FileText, cor: 'var(--primary-light)' })),
    ...tarefas.map(t => ({ id: t.id, titulo: t.titulo, data: t.prazo || t.data, sub: `Tarefa · ${t.status}`, status: t.status, Icon: ClipboardList, cor: 'var(--secondary)' })),
  ].sort((a, b) => (b.data || '').localeCompare(a.data || ''))

  const TIPO_LABEL: Record<string, string> = { funcionario: 'Funcionário', prestador: 'Prestador', credor: 'Credor', devedor: 'Devedor', cliente: 'Cliente' }
  const TIPO_COR:   Record<string, string> = { funcionario: '#7C3AED', prestador: '#06B6D4', credor: '#EF4444', devedor: '#F59E0B', cliente: '#10B981' }

  return (
    <div style={{ padding: '16px 16px 80px', maxWidth: 760, margin: '0 auto' }}>
      {/* ── voltar ── */}
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pessoas')} style={{ marginBottom: 12 }}>
        <ArrowLeft size={13} /> Pessoas
      </button>

      {/* ── card de perfil ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 14 }}>
        {/* faixa de cor no topo */}
        <div style={{ height: 5, background: `linear-gradient(90deg, ${TIPO_COR[pessoa.tipo] || 'var(--primary)'}, transparent)` }} />

        <div style={{ padding: '14px 16px 16px' }}>
          {/* avatar + nome */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--bg3)', border: '2px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {pessoa.avatar_url
                ? <img src={pessoa.avatar_url} alt={pessoa.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <UserRound size={22} color="var(--primary-light)" />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 20 }}>{pessoa.nome}</h1>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: `${TIPO_COR[pessoa.tipo]}22`, color: TIPO_COR[pessoa.tipo] }}>
                  {TIPO_LABEL[pessoa.tipo] || pessoa.tipo}
                </span>
              </div>
              {pessoa.cargo && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>{pessoa.cargo}</div>}
              {/* dados de contato em linha */}
              <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                {pessoa.contato && (
                  <a href={`https://wa.me/55${pessoa.contato.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#10B981', textDecoration: 'none' }}>
                    <Phone size={12} /> {pessoa.contato}
                  </a>
                )}
                {pessoa.email && (
                  <a href={`mailto:${pessoa.email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none' }}>
                    <Mail size={12} /> {pessoa.email}
                  </a>
                )}
                {docLabel && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}>
                    {docLabel.startsWith('CNPJ') ? <Building2 size={12} /> : <UserRound size={12} />}
                    {docLabel}
                  </span>
                )}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setModalEdit(true)} style={{ flexShrink: 0, marginTop: 2 }}>
              <Pencil size={14} />
            </button>
          </div>

          {/* alerta de vencidos */}
          {totalVenc > 0 && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#EF4444' }}>
              <AlertTriangle size={14} /> {fmt(totalVenc)} em atraso
            </div>
          )}

          {/* resumo financeiro */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}>
              <div style={{ color: 'var(--text3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>A pagar</div>
              <strong style={{ color: 'var(--danger)', fontSize: 15, fontFamily: 'var(--font-heading)' }}>{fmt(hist.resumo.totalDevo)}</strong>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}>
              <div style={{ color: 'var(--text3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>A receber</div>
              <strong style={{ color: 'var(--success)', fontSize: 15, fontFamily: 'var(--font-heading)' }}>{fmt(hist.resumo.totalMeDevem)}</strong>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 10 }}>
              <div style={{ color: 'var(--text3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Saldo</div>
              <strong style={{ color: saldo >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 15, fontFamily: 'var(--font-heading)' }}>{saldo >= 0 ? '+' : ''}{fmt(saldo)}</strong>
            </div>
          </div>

          {/* botões principais */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => novoLancamento('pagamento')}>
              <Plus size={13} /> Novo pagamento
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => novoLancamento('recebimento')}>
              <Plus size={13} /> Novo recebimento
            </button>
          </div>
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="tabs" style={{ marginBottom: 12, overflowX: 'auto' }}>
        {([
          ['resumo',    'Resumo',      History],
          ['pagar',     `Pagar (${aPagar.length})`, WalletCards],
          ['receber',   `Receber (${aRec.length})`, CircleDollarSign],
          ['tarefas',   `Tarefas (${tarefas.length})`, ClipboardList],
          ['documentos',`Docs (${docs.length})`, FileText],
          ['historico', 'Histórico',   CalendarDays],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── conteúdo das tabs ── */}

      {/* RESUMO */}
      {tab === 'resumo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.length === 0 && <EmptyState text="Nenhum movimento financeiro com esta pessoa." icon={<CircleDollarSign size={28} />} />}
          {grupos.slice(0, 8).map(g => (
            <GrupoCard key={g.key} g={g}
              onAbrirParcelas={setModalParcelas}
              onMarcarPago={marcarPago}
              onExcluir={excluirPagamentos}
            />
          ))}
          {grupos.length > 8 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setTab(g => g === 'resumo' ? 'pagar' : 'resumo')}>
              Ver todos ({grupos.length}) →
            </button>
          )}
          {obsLimpa && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ color: 'var(--text3)', fontSize: 11, marginBottom: 4, fontWeight: 600 }}>OBSERVAÇÕES</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{obsLimpa}</div>
            </div>
          )}
        </div>
      )}

      {/* A PAGAR */}
      {tab === 'pagar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => novoLancamento('pagamento')}>
            <Plus size={13} /> Novo pagamento
          </button>
          {aPagar.length === 0
            ? <EmptyState text="Nenhum pagamento registrado." icon={<WalletCards size={28} />} />
            : aPagar.map(g => <GrupoCard key={g.key} g={g} onAbrirParcelas={setModalParcelas} onMarcarPago={marcarPago} onExcluir={excluirPagamentos} />)
          }
        </div>
      )}

      {/* A RECEBER */}
      {tab === 'receber' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => novoLancamento('recebimento')}>
            <Plus size={13} /> Novo recebimento
          </button>
          {aRec.length === 0
            ? <EmptyState text="Nenhum recebimento registrado." icon={<CircleDollarSign size={28} />} />
            : aRec.map(g => <GrupoCard key={g.key} g={g} onAbrirParcelas={setModalParcelas} onMarcarPago={marcarPago} onExcluir={excluirPagamentos} />)
          }
        </div>
      )}

      {/* TAREFAS */}
      {tab === 'tarefas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* botão para criar nova tarefa, apenas para gestores */}
          {user?.role === 'gestor' && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setModalNovaTarefa(true)}>
              <Plus size={13} /> Nova tarefa
            </button>
          )}
          {tarefas.length === 0
            ? <EmptyState text="Nenhuma tarefa vinculada a esta pessoa." icon={<ClipboardList size={28} />} />
            : tarefas.map((t: Tarefa) => (
              <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <CheckCircle2 size={15} color={t.status === 'concluida' ? 'var(--success)' : 'var(--text3)'} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, textDecoration: t.status === 'concluida' ? 'line-through' : 'none', opacity: t.status === 'concluida' ? .6 : 1 }}>{t.titulo}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 3, display: 'flex', gap: 8 }}>
                      <span>{t.status}</span>
                      {(t.prazo || t.data) && <span>· {fmtDate(t.prazo || t.data)}</span>}
                      {t.prioridade && <span style={{ color: t.prioridade === 'alta' ? '#EF4444' : t.prioridade === 'media' ? '#F59E0B' : 'var(--text3)' }}>· {t.prioridade}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* DOCUMENTOS */}
      {tab === 'documentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setModalUpload(true)}>
            <Upload size={13} /> Enviar documento
          </button>
          {docs.length === 0
            ? <EmptyState text="Nenhum documento enviado ainda." icon={<FileText size={28} />} />
            : docs.map((d: Documento) => (
              <div key={d.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={16} color="var(--primary-light)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.titulo}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>{d.tipo} · {fmtDate(d.created_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <a href={d.arquivo_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm btn-icon"><Link2 size={13} /></a>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => excluirDoc(d.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* HISTÓRICO */}
      {tab === 'historico' && (
        <div style={{ position: 'relative', paddingLeft: 20 }}>
          <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 2, background: 'var(--border)', borderRadius: 2 }} />
          {historicoItens.length === 0
            ? <EmptyState text="Nenhum histórico registrado." icon={<History size={28} />} />
            : historicoItens.map(item => {
              const Icon = item.Icon
              return (
                <div key={item.id} style={{ position: 'relative', marginBottom: 12 }}>
                  <div style={{ position: 'absolute', left: -20, top: 8, width: 18, height: 18, borderRadius: '50%', background: 'var(--bg3)', border: `2px solid ${item.cor}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={10} color={item.cor} />
                  </div>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.titulo}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2, display: 'flex', gap: 8 }}>
                      {item.data && <span>{fmtDate(item.data)}</span>}
                      <span>· {item.sub}</span>
                    </div>
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ── modals ── */}
      {modalParcelas && (
        <ModalParcelas
          grupo={modalParcelas}
          onClose={() => setModalParcelas(null)}
          onMarcarPago={marcarPago}
          onExcluirParcela={id => excluirPagamentos([id])}
        />
      )}
      {modalUpload && hist?.pessoa && (
        <ModalUpload
          pessoaId={hist.pessoa.id}
          onClose={() => setModalUpload(false)}
          onSaved={carregar}
        />
      )}
      {modalEdit && hist?.pessoa && (
        <ModalEditPessoa
          pessoa={hist.pessoa}
          onClose={() => setModalEdit(false)}
          onSaved={p => { setHist(h => h ? { ...h, pessoa: p } : h); setModalEdit(false) }}
        />
      )}

      {/* modal nova tarefa */}
      {modalNovaTarefa && hist?.pessoa && (
        <ModalNovaTarefa
          pessoaId={hist.pessoa.id}
          pessoaNome={hist.pessoa.nome}
          onClose={() => setModalNovaTarefa(false)}
          onSaved={async () => { await carregar(); setModalNovaTarefa(false) }}
        />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
