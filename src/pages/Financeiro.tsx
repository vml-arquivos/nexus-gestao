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
  CreditCard,
  Layers,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react'
import { pagamentosApi, equipeApi, type Pagamento, type Pessoa, type GrupoPagamento, type ResumoPorPessoa, type ResumoFinanceiro } from '../lib/api'
import { MicBtn } from '../components/ui'

type ScheduleMode = 'unico' | 'recorrente' | 'personalizado' | 'parcelado'

const FORMAS_PAGAMENTO = ['Pix', 'Boleto', 'Transferência', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Cheque']

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

// ── Helpers de parcelamento ───────────────────────────────────────────────────
function calcPMT(total: number, n: number, taxaMensal: number): number {
  if (n <= 0) return 0
  if (taxaMensal === 0) return total / n
  const i = taxaMensal / 100
  return total * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
}

function gerarDatasParcelamento(
  primeiraData: string,
  n: number,
  intervalo: 'mensal' | 'quinzenal' | 'semanal',
): string[] {
  const datas: string[] = []
  const base = new Date(`${primeiraData}T00:00:00`)
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    if (intervalo === 'mensal') d.setMonth(d.getMonth() + i)
    else if (intervalo === 'quinzenal') d.setDate(d.getDate() + i * 14)
    else d.setDate(d.getDate() + i * 7)
    datas.push(d.toISOString().slice(0, 10))
  }
  return datas
}

function ParcelaPreview({ total, n, taxa, intervalo, primeiraData }: {
  total: number; n: number; taxa: number; intervalo: 'mensal'|'quinzenal'|'semanal'; primeiraData: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (!primeiraData || n < 1 || total <= 0) return null
  const pmt = calcPMT(total, n, taxa)
  const datas = gerarDatasParcelamento(primeiraData, n, intervalo)
  const totalFinal = pmt * n
  const jurosTotal = totalFinal - total
  const mostrar = expanded ? datas : datas.slice(0, 3)

  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 4 }}>
      <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>Prévia das parcelas</span>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text3)' }}>
          {jurosTotal > 0.01 && <span>Juros: <strong style={{ color: '#F59E0B' }}>{fmt(jurosTotal)}</strong></span>}
          <span>Total: <strong style={{ color: 'var(--text1)' }}>{fmt(totalFinal)}</strong></span>
        </div>
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {mostrar.map((d, i) => (
          <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', borderBottom: i < mostrar.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{i + 1}ª parcela — {fmtDate(d)}</span>
            <span style={{ fontWeight: 800, color: 'var(--text1)', fontFamily: 'var(--font-heading)' }}>{fmt(pmt)}</span>
          </div>
        ))}
      </div>
      {datas.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          style={{ width: '100%', padding: '8px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          {expanded ? <><ChevronUp size={13} /> Mostrar menos</> : <><ChevronDown size={13} /> Ver todas as {datas.length} parcelas</>}
        </button>
      )}
    </div>
  )
}

// ── Helpers de grupo de parcelamento ─────────────────────────────────────────
function extrairGrupoId(obs?: string): string | null {
  if (!obs) return null
  const m = obs.match(/grupo_id:([^|\s]+)/)
  return m ? m[1] : null
}

function calcSaldoGrupo(parcelas: Pagamento[]) {
  const pendentes = parcelas.filter(p => p.status === 'pendente')
  const pagas     = parcelas.filter(p => p.status === 'pago')
  return {
    totalOriginal : parcelas.reduce((s, p) => s + Number(p.valor), 0),
    totalPago     : pagas.reduce((s, p) => s + Number(p.valor), 0),
    totalPendente : pendentes.reduce((s, p) => s + Number(p.valor), 0),
    numPendentes  : pendentes.length,
    pendentes     : [...pendentes].sort((a, b) => (a.vencimento || '') < (b.vencimento || '') ? -1 : 1),
  }
}


type GrupoFinanceiro = {
  id: string
  grupoId: string | null
  pessoaId?: string
  pessoaNome: string
  titulo: string
  tipo: 'pagamento' | 'recebimento'
  categoria?: string
  status: 'pendente' | 'pago' | 'cancelado'
  itens: Pagamento[]
  principal: Pagamento
  total: number
  pendente: number
  pago: number
  proximoVencimento?: string
  isVencido: boolean
}

function agruparLancamentosFinanceiros(pags: Pagamento[]): GrupoFinanceiro[] {
  const map = new Map<string, Pagamento[]>()
  for (const p of pags) {
    const grupoId = extrairGrupoId(p.obs)
    const key = grupoId ? `grupo:${grupoId}` : `item:${p.id}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }

  const hoje = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')

  return Array.from(map.entries()).map(([key, itens]) => {
    const ordenados = [...itens].sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))
    const principal = ordenados.find(p => p.status === 'pendente') || ordenados[0]
    const pendentes = itens.filter(p => p.status === 'pendente')
    const pagos = itens.filter(p => p.status === 'pago')
    const proxima = pendentes.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))[0]
    const isVencido = !!(proxima?.vencimento && new Date(`${proxima.vencimento.slice(0, 10)}T00:00:00`) < hoje)
    const total = itens.reduce((sum, p) => sum + Number(p.valor || 0), 0)
    const pendente = pendentes.reduce((sum, p) => sum + Number(p.valor || 0), 0)
    const pago = pagos.reduce((sum, p) => sum + Number(p.valor || 0), 0)
    const grupoId = key.startsWith('grupo:') ? key.replace('grupo:', '') : null

    return {
      id: key,
      grupoId,
      pessoaId: principal.pessoa_id,
      pessoaNome: principal.pessoa_nome || principal.pessoa_nome_atual || 'Sem pessoa',
      titulo: principal.titulo,
      tipo: principal.tipo,
      categoria: principal.categoria,
      status: pendente > 0 ? 'pendente' : itens.some(p => p.status === 'pago') ? 'pago' : principal.status,
      itens,
      principal,
      total,
      pendente,
      pago,
      proximoVencimento: proxima?.vencimento || principal.vencimento,
      isVencido,
    }
  }).sort((a, b) => {
    if (a.isVencido !== b.isVencido) return a.isVencido ? -1 : 1
    return (a.proximoVencimento || '').localeCompare(b.proximoVencimento || '')
  })
}

function statusChip(g: GrupoFinanceiro) {
  if (g.isVencido) return 'Vencido'
  if (g.status === 'pago') return 'Pago'
  if (g.status === 'cancelado') return 'Cancelado'
  return 'Pendente'
}

// ── Card de grupo (uma dívida/crédito = um card) ─────────────────────────────
function GrupoCard({ g, onGerenciar, onEdit, onDelete, onMarkPaid }: {
  g: GrupoFinanceiro
  onGerenciar: () => void
  onEdit: (p: Pagamento) => void
  onDelete: (id: string) => void
  onMarkPaid: (p: Pagamento) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isGrupo = g.itens.length > 1
  const chip = statusChip(g)
  const chipColor = chip === 'Vencido' ? '#EF4444' : chip === 'Pago' ? '#10B981' : chip === 'Cancelado' ? 'var(--text3)' : '#F59E0B'
  const chipBg = chip === 'Vencido' ? 'rgba(239,68,68,0.12)' : chip === 'Pago' ? 'rgba(16,185,129,0.12)' : chip === 'Cancelado' ? 'var(--bg3)' : 'rgba(245,158,11,0.12)'
  const valorColor = g.tipo === 'recebimento' ? '#10B981' : '#EF4444'
  const sinal = g.tipo === 'recebimento' ? '+' : '-'

  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${g.isVencido ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {/* Cabeçalho do card */}
      <div style={{ padding: '14px 16px', cursor: isGrupo ? 'pointer' : 'default' }} onClick={() => isGrupo && setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{g.titulo}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: chipColor, background: chipBg, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{chip}</span>
              {isGrupo && (
                <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>
                  {g.itens.filter(p => p.status === 'pago').length}/{g.itens.length} parcelas
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              {g.pessoaNome && g.pessoaNome !== 'Sem pessoa' && (
                <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <User size={11} /> {g.pessoaNome}
                </span>
              )}
              {g.categoria && (
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{g.categoria}</span>
              )}
              {g.proximoVencimento && (
                <span style={{ fontSize: 12, color: g.isVencido ? '#EF4444' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CalendarDays size={11} /> {g.isVencido ? 'Venceu ' : 'Vence '}{fmtDate(g.proximoVencimento)}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: valorColor, fontFamily: 'var(--font-heading)' }}>
              {sinal}{fmt(isGrupo ? g.pendente : g.total)}
            </div>
            {isGrupo && g.pago > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Pago: {fmt(g.pago)}</div>
            )}
          </div>
        </div>

        {/* Barra de progresso para grupos */}
        {isGrupo && g.total > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (g.pago / g.total) * 100)}%`, background: '#10B981', borderRadius: 999, transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>
              <span>Total: {fmt(g.total)}</span>
              <span>{Math.round((g.pago / g.total) * 100)}% pago</span>
            </div>
          </div>
        )}

        {/* Botões de ação para lançamento único */}
        {!isGrupo && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {g.principal.status === 'pendente' && (
              <button
                onClick={e => { e.stopPropagation(); onMarkPaid(g.principal) }}
                style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                <Check size={13} /> Marcar pago
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onEdit(g.principal) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}><Pencil size={13} /></button>
            <button onClick={e => { e.stopPropagation(); onDelete(g.principal.id) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={13} /></button>
          </div>
        )}

        {/* Botões de ação para grupo */}
        {isGrupo && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={e => { e.stopPropagation(); onGerenciar() }}
              style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(99,102,241,0.12)', color: '#6366F1', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <WalletCards size={13} /> Gerenciar dívida
            </button>
            <button onClick={e => { e.stopPropagation(); setExpanded(ex => !ex) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={13} /> : <Eye size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Lista de parcelas expandida */}
      {isGrupo && expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {[...g.itens].sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')).map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < g.itens.length - 1 ? '1px solid var(--border)' : 'none', background: p.status === 'pago' ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.status === 'pago' ? 'var(--text3)' : 'var(--text1)' }}>
                  {i + 1}ª parcela
                  {p.status === 'pago' && <span style={{ marginLeft: 6, fontSize: 11, color: '#10B981' }}>Paga</span>}
                  {p.status === 'pendente' && p.vencimento && new Date(`${p.vencimento.slice(0,10)}T00:00:00`) < new Date() && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#EF4444' }}>Vencida</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(p.vencimento)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: p.status === 'pago' ? '#10B981' : valorColor }}>{fmt(Number(p.valor))}</span>
                {p.status === 'pendente' && (
                  <button onClick={() => onMarkPaid(p)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    <Check size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GerenciarDividaModal({ parcelas, tipo, onUpdate, onClose }: {
  parcelas  : Pagamento[]
  tipo      : 'pagamento' | 'recebimento'
  onUpdate  : () => void
  onClose   : () => void
}) {
  const [modo, setModo]     = useState<'abatimento' | 'acrescimo'>('abatimento')
  const [valor, setValor]   = useState('')
  const [acao, setAcao]     = useState<'recalcular' | 'proximas'>('recalcular')
  const [data, setData]     = useState(new Date().toISOString().slice(0, 10))
  const [forma, setForma]   = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  const saldo    = calcSaldoGrupo(parcelas)
  const valorNum = parseFloat(valor) || 0
  const ref      = parcelas[0]

  const novoSaldo      = modo === 'abatimento'
    ? Math.max(0, saldo.totalPendente - valorNum)
    : saldo.totalPendente + valorNum
  const novaParcelaPMT = saldo.numPendentes > 0 ? novoSaldo / saldo.numPendentes : 0
  const quitado        = modo === 'abatimento' && valorNum >= saldo.totalPendente

  useEffect(() => {
    if (valor) return
    const sugerido = saldo.pendentes[0]?.valor || (saldo.numPendentes ? saldo.totalPendente / saldo.numPendentes : saldo.totalPendente)
    if (sugerido > 0) setValor(String(Math.round(Number(sugerido) * 100) / 100))
  }, [parcelas, saldo.numPendentes, saldo.totalPendente, saldo.pendentes, valor])

  async function handleConfirm() {
    if (!valorNum || valorNum <= 0) { toast('Informe um valor válido', 'error'); return }
    if (modo === 'abatimento' && !data) { toast('Informe a data', 'error'); return }
    setSaving(true)
    try {
      const obsMovimento = [
        forma ? `Forma de pagamento: ${forma}` : '',
        motivo || '',
        modo === 'abatimento'
          ? `Abatimento sobre dívida "${ref?.titulo}"`
          : `Acréscimo sobre dívida "${ref?.titulo}"`,
      ].filter(Boolean).join(' | ')

      await pagamentosApi.create({
        titulo     : modo === 'abatimento' ? `Abatimento — ${ref?.titulo}` : `Acréscimo — ${ref?.titulo}`,
        valor      : valorNum,
        tipo,
        status     : modo === 'abatimento' ? 'pago' : 'pendente',
        vencimento : data || undefined,
        pago_em    : modo === 'abatimento' ? data : undefined,
        pessoa_id  : ref?.pessoa_id  || undefined,
        pessoa_nome: ref?.pessoa_nome || undefined,
        categoria  : ref?.categoria  || undefined,
        obs        : obsMovimento,
        recorrencia: 'nenhum',
      })

      if (quitado) {
        for (const p of saldo.pendentes) {
          await pagamentosApi.update(p.id, {
            status: 'cancelado',
            obs   : `${p.obs ? p.obs + ' | ' : ''}Quitado via abatimento`,
          })
        }
      } else if (saldo.numPendentes > 0) {
        if (acao === 'recalcular') {
          const novoValor = Math.round(novaParcelaPMT * 100) / 100
          for (const p of saldo.pendentes) await pagamentosApi.update(p.id, { valor: novoValor })
        } else {
          if (modo === 'abatimento') {
            let restante = valorNum
            for (const p of saldo.pendentes) {
              const atual = Number(p.valor || 0)
              if (restante <= 0) break
              if (restante >= atual) {
                await pagamentosApi.update(p.id, {
                  status: 'pago',
                  pago_em: data,
                  obs: `${p.obs ? p.obs + ' | ' : ''}Baixado por abatimento parcial`,
                })
                restante -= atual
              } else {
                await pagamentosApi.update(p.id, { valor: Math.round((atual - restante) * 100) / 100 })
                restante = 0
              }
            }
          } else {
            const primeira = saldo.pendentes[0]
            if (primeira) await pagamentosApi.update(primeira.id, { valor: Math.round((Number(primeira.valor) + valorNum) * 100) / 100 })
          }
        }
      }

      toast(
        quitado
          ? 'Dívida quitada! Parcelas canceladas.'
          : modo === 'abatimento'
            ? `Abatimento registrado. Parcelas recalculadas para ${fmt(novaParcelaPMT)} cada.`
            : `Acréscimo registrado. Parcelas recalculadas para ${fmt(novaParcelaPMT)} cada.`
      )
      onUpdate()
      onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto', zIndex: 300 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: '24px', padding: '28px 24px', width: '100%', maxWidth: 520, overflowY: 'visible', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, margin: 0 }}>Gerenciar dívida</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18 }}>{ref?.titulo}{ref?.pessoa_nome ? ` · ${ref.pessoa_nome}` : ''}</div>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          {([
            { label: 'Total original', value: saldo.totalOriginal, color: 'var(--text1)', bg: 'var(--bg3)' },
            { label: 'Já pago',        value: saldo.totalPago,     color: '#10B981',      bg: 'rgba(16,185,129,0.1)' },
            { label: 'Saldo restante', value: saldo.totalPendente, color: '#EF4444',      bg: 'rgba(239,68,68,0.1)'  },
          ] as const).map(({ label, value, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color, fontFamily: 'var(--font-heading)' }}>{fmt(value)}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
          {saldo.numPendentes} parcela{saldo.numPendentes !== 1 ? 's' : ''} pendente{saldo.numPendentes !== 1 ? 's' : ''} · {fmt(saldo.totalPendente / (saldo.numPendentes || 1))} cada
        </div>

        {/* Abas modo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setModo('abatimento')} style={{ padding: '12px', borderRadius: 'var(--radius)', border: `2px solid ${modo === 'abatimento' ? '#10B981' : 'var(--border)'}`, background: modo === 'abatimento' ? 'rgba(16,185,129,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: modo === 'abatimento' ? '#10B981' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <TrendingDown size={15} /> Pagar / Abater
          </button>
          <button type="button" onClick={() => setModo('acrescimo')} style={{ padding: '12px', borderRadius: 'var(--radius)', border: `2px solid ${modo === 'acrescimo' ? '#F59E0B' : 'var(--border)'}`, background: modo === 'acrescimo' ? 'rgba(245,158,11,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: modo === 'acrescimo' ? '#F59E0B' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <TrendingUp size={15} /> Acrescentar valor
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: modo === 'abatimento' ? '1fr 1fr' : '1fr', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{modo === 'abatimento' ? 'Valor pago (R$)' : 'Valor a acrescentar (R$)'}</label>
              <input className="form-input" type="number" step="0.01" min="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} />
            </div>
            {modo === 'abatimento' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data do pagamento</label>
                <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
              </div>
            )}
          </div>

          {modo === 'abatimento' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={12} /> Forma de pagamento</label>
              <select className="form-input" value={forma} onChange={e => setForma(e.target.value)}>
                <option value="">Não informado</option>
                {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Como aplicar?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" className={`btn ${acao === 'recalcular' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAcao('recalcular')} style={{ fontSize: 12 }}>
                Recalcular todas
              </button>
              <button type="button" className={`btn ${acao === 'proximas' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAcao('proximas')} style={{ fontSize: 12 }}>
                Abater próximas
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
              O sistema calcula automaticamente o novo saldo. Você escolhe se quer redistribuir nas parcelas restantes ou baixar nas próximas parcelas.
            </div>
          </div>

          {/* Prévia do recálculo */}
          {valorNum > 0 && saldo.numPendentes > 0 && (
            <div style={{ borderRadius: 10, border: `1px solid ${quitado ? 'rgba(16,185,129,0.4)' : modo === 'acrescimo' ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.3)'}`, background: quitado ? 'rgba(16,185,129,0.07)' : modo === 'acrescimo' ? 'rgba(245,158,11,0.07)' : 'rgba(99,102,241,0.07)', padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
                {quitado ? 'Dívida quitada integralmente' : 'Recálculo das parcelas restantes'}
              </div>
              {!quitado ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                  {[
                    { label: 'Saldo atual',                                       value: saldo.totalPendente, sign: '',  color: 'var(--text1)' },
                    { label: modo === 'abatimento' ? '− Pagamento' : '+ Acréscimo', value: valorNum,            sign: modo === 'abatimento' ? '−' : '+', color: modo === 'abatimento' ? '#10B981' : '#F59E0B' },
                  ].map(({ label, value, sign, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text3)' }}>{label}</span>
                      <span style={{ fontWeight: 700, color }}>{sign}{fmt(value)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 5, marginTop: 2 }}>
                    <span style={{ color: 'var(--text3)' }}>Novo saldo</span>
                    <span style={{ fontWeight: 800 }}>{fmt(novoSaldo)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text3)' }}>Nova parcela ({saldo.numPendentes}x restantes)</span>
                    <span style={{ fontWeight: 800, color: '#6366f1' }}>{fmt(novaParcelaPMT)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  As {saldo.numPendentes} parcelas pendentes serão canceladas automaticamente.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={saving || !valorNum}
            style={{
              flex: 2,
              background  : quitado ? '#10B981' : modo === 'acrescimo' ? '#F59E0B' : undefined,
              borderColor : quitado ? '#10B981' : modo === 'acrescimo' ? '#F59E0B' : undefined,
            }}
          >
            {saving
              ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</>
              : quitado
                ? <><Check size={14} /> Quitar dívida</>
                : modo === 'abatimento'
                  ? <><Check size={14} /> Registrar abatimento</>
                  : <><Plus size={14} /> Registrar acréscimo</>
            }
          </button>
        </div>
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

  // ── Parcelado ──
  const [numParcelas, setNumParcelas] = useState(2)
  const [taxaJuros, setTaxaJuros] = useState('0')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [intervaloParc, setIntervaloParc] = useState<'mensal' | 'quinzenal' | 'semanal'>('mensal')

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
    if (scheduleMode === 'parcelado' && !vencimento) { toast('Informe a data da primeira parcela', 'error'); return }
    if (scheduleMode === 'parcelado' && numParcelas < 2) { toast('Mínimo de 2 parcelas', 'error'); return }

    setSaving(true)
    try {
      const pessoa = pessoas.find(p => p.id === pessoaId)
      const primeiraDataPersonalizada = datasPersonalizadas[0]

      // Para parcelado: calcula valor da parcela e gera datas
      let valorFinal = parseFloat(valor)
      let datasParcelado: string[] | undefined
      if (scheduleMode === 'parcelado') {
        const taxa = parseFloat(taxaJuros) || 0
        valorFinal = calcPMT(parseFloat(valor), numParcelas, taxa)
        datasParcelado = gerarDatasParcelamento(vencimento, numParcelas, intervaloParc)
      }

      const obsComForma = [
        scheduleMode === 'parcelado' ? `grupo_id:grp_${Date.now()}` : '',
        formaPagamento ? `Forma de pagamento: ${formaPagamento}` : '',
        scheduleMode === 'parcelado' ? `${numParcelas}x de ${fmt(valorFinal)}${parseFloat(taxaJuros) > 0 ? ` (${taxaJuros}% a.m.)` : ''}` : '',
        obs,
      ].filter(Boolean).join(' | ')

      const payload: Partial<Pagamento> = {
        titulo: titulo.trim(),
        descricao: descricao || undefined,
        valor: valorFinal,
        tipo,
        status,
        vencimento: scheduleMode === 'personalizado' ? (primeiraDataPersonalizada || undefined) : (vencimento || undefined),
        pago_em: pagoEm || undefined,
        pessoa_id: pessoaId || undefined,
        pessoa_nome: pessoa?.nome || pessoaNome || undefined,
        categoria: categoria || undefined,
        obs: obsComForma || undefined,
        recorrencia: scheduleMode === 'recorrente' ? recorrencia : 'nenhum',
        recorrencia_fim: scheduleMode === 'recorrente' && recorrenciaFim ? recorrenciaFim : undefined,
        datas_personalizadas: scheduleMode === 'personalizado' ? datasPersonalizadas : (scheduleMode === 'parcelado' ? datasParcelado : undefined),
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto', zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '24px', padding: '28px 24px', width: '100%', maxWidth: 580, overflowY: 'visible', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
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
            <div className="form-group">
              <label className="form-label">{scheduleMode === 'parcelado' ? 'Valor total da dívida (R$) *' : 'Valor (R$) *'}</label>
              <input className="form-input" type="number" step="0.01" min="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} />
            </div>
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

          {scheduleMode !== 'parcelado' && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <CreditCard size={12} /> Forma de pagamento
              </label>
              <select className="form-input" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
                <option value="">Não informado</option>
                {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Como lançar?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" onClick={() => setScheduleMode('unico')} className={`btn ${scheduleMode === 'unico' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }}><CalendarDays size={14} /> Único</button>
              <button type="button" onClick={() => setScheduleMode('recorrente')} className={`btn ${scheduleMode === 'recorrente' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }}><Repeat size={14} /> Recorrente</button>
              <button type="button" onClick={() => setScheduleMode('personalizado')} className={`btn ${scheduleMode === 'personalizado' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }}><ListPlus size={14} /> Datas</button>
              <button type="button" onClick={() => setScheduleMode('parcelado')} className={`btn ${scheduleMode === 'parcelado' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }}><Layers size={14} /> Parcelado</button>
            </div>
          </div>

          {scheduleMode !== 'personalizado' && (
            <div className="form-group">
              <label className="form-label">
                {scheduleMode === 'recorrente' ? 'Primeira data' : scheduleMode === 'parcelado' ? 'Data da 1ª parcela' : 'Data de vencimento'}
              </label>
              <input className="form-input" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} />
            </div>
          )}

          {scheduleMode === 'parcelado' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Nº de parcelas</label>
                  <input
                    className="form-input"
                    type="number"
                    min={2}
                    max={360}
                    value={numParcelas}
                    onChange={e => setNumParcelas(Math.max(2, parseInt(e.target.value) || 2))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Intervalo</label>
                  <select className="form-input" value={intervaloParc} onChange={e => setIntervaloParc(e.target.value as 'mensal' | 'quinzenal' | 'semanal')}>
                    <option value="mensal">Mensal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="semanal">Semanal</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Juros (% ao mês)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0,00"
                    value={taxaJuros}
                    onChange={e => setTaxaJuros(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CreditCard size={12} /> Forma de pagamento
                  </label>
                  <select className="form-input" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
                    <option value="">Não informado</option>
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <ParcelaPreview
                total={parseFloat(valor) || 0}
                n={numParcelas}
                taxa={parseFloat(taxaJuros) || 0}
                intervalo={intervaloParc}
                primeiraData={vencimento}
              />

              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                <strong>Como funciona:</strong> O valor digitado acima é o <em>total da dívida</em>. O sistema calcula automaticamente o valor de cada parcela{parseFloat(taxaJuros) > 0 ? ' com juros compostos (Tabela Price)' : ' sem juros'} e cria um lançamento por parcela no financeiro, cada um na sua data correta.
              </div>
            </>
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

// ── Card usando GrupoPagamento do backend ─────────────────────────────────────
function GrupoBetaCard({ g, onEdit, onDelete, onMarkPaid, onGerenciar }: {
  g: GrupoPagamento
  onEdit: (p: Pagamento) => void
  onDelete: (id: string) => void
  onMarkPaid: (p: Pagamento) => void
  onGerenciar: (g: GrupoPagamento) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isGrupo = g.is_grupo
  const valorColor = g.tipo === 'recebimento' ? '#10B981' : '#EF4444'
  const sinal = g.tipo === 'recebimento' ? '+' : '-'
  const chip = g.vencido ? 'Vencido' : g.valor_pendente === 0 ? 'Pago' : 'Pendente'
  const chipColor = chip === 'Vencido' ? '#EF4444' : chip === 'Pago' ? '#10B981' : '#F59E0B'
  const chipBg = chip === 'Vencido' ? 'rgba(239,68,68,0.12)' : chip === 'Pago' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'
  const principal = g.parcelas[0]

  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${g.vencido ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', cursor: isGrupo ? 'pointer' : 'default' }} onClick={() => isGrupo && setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{g.titulo}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: chipColor, background: chipBg, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{chip}</span>
              {isGrupo && (
                <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>
                  {g.parcelas_pagas}/{g.num_parcelas} parcelas
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              {g.pessoa_nome && (
                <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <User size={11} /> {g.pessoa_nome}
                </span>
              )}
              {g.categoria && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{g.categoria}</span>}
              {g.proxima_parcela && (
                <span style={{ fontSize: 12, color: g.vencido ? '#EF4444' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CalendarDays size={11} /> {g.vencido ? 'Venceu ' : 'Vence '}{fmtDate(g.proxima_parcela)}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: valorColor, fontFamily: 'var(--font-heading)' }}>
              {sinal}{fmt(isGrupo ? g.valor_pendente : g.valor_total)}
            </div>
            {isGrupo && g.valor_pago > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Pago: {fmt(g.valor_pago)}</div>
            )}
          </div>
        </div>

        {/* Barra de progresso */}
        {isGrupo && g.valor_total > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (g.valor_pago / g.valor_total) * 100)}%`, background: '#10B981', borderRadius: 999, transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>
              <span>Total: {fmt(g.valor_total)}</span>
              <span>{Math.round((g.valor_pago / g.valor_total) * 100)}% pago</span>
            </div>
          </div>
        )}

        {/* Ações para lançamento único */}
        {!isGrupo && principal && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {principal.status === 'pendente' && (
              <button onClick={e => { e.stopPropagation(); onMarkPaid(principal) }} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Check size={13} /> Marcar pago
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onEdit(principal) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}><Pencil size={13} /></button>
            <button onClick={e => { e.stopPropagation(); onDelete(principal.id) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={13} /></button>
          </div>
        )}

        {/* Ações para grupo */}
        {isGrupo && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={e => { e.stopPropagation(); onGerenciar(g) }} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(99,102,241,0.12)', color: '#6366F1', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <WalletCards size={13} /> Gerenciar dívida
            </button>
            <button onClick={e => { e.stopPropagation(); setExpanded(ex => !ex) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={13} /> : <Eye size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Parcelas expandidas */}
      {isGrupo && expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {g.parcelas.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < g.parcelas.length - 1 ? '1px solid var(--border)' : 'none', background: p.status === 'pago' ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.status === 'pago' ? 'var(--text3)' : 'var(--text1)' }}>
                  {i + 1}ª parcela
                  {p.status === 'pago' && <span style={{ marginLeft: 6, fontSize: 11, color: '#10B981' }}>Paga</span>}
                  {p.status === 'pendente' && p.vencimento && new Date(`${p.vencimento.slice(0,10)}T00:00:00`) < new Date() && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#EF4444' }}>Vencida</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(p.vencimento)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: p.status === 'pago' ? '#10B981' : valorColor }}>{fmt(Number(p.valor))}</span>
                {p.status === 'pendente' && (
                  <button onClick={() => onMarkPaid(p)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    <Check size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Financeiro() {
  const location = useLocation()
  const navigate = useNavigate()

  const [grupos, setGrupos] = useState<GrupoPagamento[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null)
  const [porPessoa, setPorPessoa] = useState<ResumoPorPessoa[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [gerenciarDivida, setGerenciarDivida] = useState<{ parcelas: Pagamento[]; tipo: 'pagamento' | 'recebimento' } | null>(null)
  const [editPag, setEditPag] = useState<Pagamento | null>(null)
  const [prefill, setPrefill] = useState<Partial<Pagamento> | null>(null)
  const [tab, setTab] = useState<'lista' | 'pessoas'>('lista')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [search, setSearch] = useState('')
  const [pessoaFiltro, setPessoaFiltro] = useState<ResumoPorPessoa | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [gs, ps, res, pp] = await Promise.all([
        pagamentosApi.grupos(),
        equipeApi.pessoas(),
        pagamentosApi.resumo(),
        pagamentosApi.porPessoa(),
      ])
      setGrupos(gs)
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
      await pagamentosApi.update(p.id, { status: 'pago', pago_em: new Date().toISOString().slice(0, 10) })
      toast('Marcado como pago!')
      load()
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este lançamento?')) return
    try { await pagamentosApi.remove(id); load(); toast('Excluído') }
    catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  // Filtragem sobre os grupos retornados pelo backend
  const filtrarGrupos = (tipo: 'pagamento' | 'recebimento') => {
    return grupos.filter(g => {
      if (g.tipo !== tipo) return false
      if (filtroStatus !== 'todos') {
        if (filtroStatus === 'pago' && g.valor_pendente > 0) return false
        if (filtroStatus === 'pendente' && g.valor_pendente === 0) return false
      }
      if (pessoaFiltro && g.pessoa_id !== pessoaFiltro.pessoa_id) return false
      if (search) {
        const q = search.toLowerCase()
        return (g.titulo || '').toLowerCase().includes(q) || (g.pessoa_nome || '').toLowerCase().includes(q) || (g.categoria || '').toLowerCase().includes(q)
      }
      return true
    })
  }

  const gruposPagar = filtrarGrupos('pagamento')
  const gruposReceber = filtrarGrupos('recebimento')
  const vencidos = grupos.filter(g => g.vencido)

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 760, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 22 }}>Financeiro</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Pagamentos, recebimentos, recorrências e datas personalizadas</p>
        </div>
        <button className="btn btn-primary" onClick={() => openLancamento()} style={{ gap: 6 }}><Plus size={16} /> Lançar</button>
      </div>

      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingUp size={14} color="#10B981" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>A receber</span></div>
            <div style={{ fontWeight: 700, fontSize: 20, color: '#10B981', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.receita_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Recebido: {fmt(resumo.receita_paga)}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingDown size={14} color="#EF4444" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>A pagar</span></div>
            <div style={{ fontWeight: 700, fontSize: 20, color: '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.despesa_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Pago: {fmt(resumo.despesa_paga)}</div>
          </div>
        </div>
      )}

      {vencidos.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#F59E0B' }}>{vencidos.length} lançamento{vencidos.length > 1 ? 's' : ''} vencido{vencidos.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Total: {fmt(vencidos.reduce((s, p) => s + Number(p.valor_pendente), 0))}</div>
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
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── SEÇÃO A PAGAR ─────────────────────────────────────── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingDown size={16} color="#EF4444" />
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#EF4444' }}>A Pagar</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 999, padding: '2px 8px' }}>{gruposPagar.length}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', gap: 4 }} onClick={() => openLancamento({ tipo: 'pagamento' })}>
                    <Plus size={13} /> Novo
                  </button>
                </div>
                {gruposPagar.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '28px 20px', color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: 13 }}>Nenhum pagamento registrado</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {gruposPagar.map(g => (
                      <GrupoBetaCard
                        key={g.grupo_id || g.parcelas[0]?.id}
                        g={g}
                        onGerenciar={gp => setGerenciarDivida({ parcelas: gp.parcelas, tipo: gp.tipo })}
                        onEdit={p => { setPrefill(null); setEditPag(p); setModalOpen(true) }}
                        onDelete={id => handleDelete(id)}
                        onMarkPaid={p => handleMarcarPago(p)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── SEÇÃO A RECEBER ───────────────────────────────────── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingUp size={16} color="#10B981" />
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#10B981' }}>A Receber</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 999, padding: '2px 8px' }}>{gruposReceber.length}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', gap: 4 }} onClick={() => openLancamento({ tipo: 'recebimento' })}>
                    <Plus size={13} /> Novo
                  </button>
                </div>
                {gruposReceber.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '28px 20px', color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: 13 }}>Nenhum recebimento registrado</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {gruposReceber.map(g => (
                      <GrupoBetaCard
                        key={g.grupo_id || g.parcelas[0]?.id}
                        g={g}
                        onGerenciar={gp => setGerenciarDivida({ parcelas: gp.parcelas, tipo: gp.tipo })}
                        onEdit={p => { setPrefill(null); setEditPag(p); setModalOpen(true) }}
                        onDelete={id => handleDelete(id)}
                        onMarkPaid={p => handleMarcarPago(p)}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </>
      )}

      {(modalOpen || editPag) && (
        <PagamentoModal
          pessoas={pessoas}
          initial={editPag || prefill || undefined}
          onSave={_p => {
            setModalOpen(false)
            setEditPag(null)
            setPrefill(null)
            load()
          }}
          onClose={() => { setModalOpen(false); setEditPag(null); setPrefill(null) }}
        />
      )}

      {gerenciarDivida && (
        <GerenciarDividaModal
          parcelas={gerenciarDivida.parcelas}
          tipo={gerenciarDivida.tipo}
          onUpdate={load}
          onClose={() => setGerenciarDivida(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
