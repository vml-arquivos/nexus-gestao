import { useState, useEffect, useCallback, useRef } from 'react'
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
import { useAuth } from '../lib/AuthContext'
import { useVisualTexts } from '../hooks/useVisualTexts'

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

function parseMoneyInput(value: string): number {
  const raw = String(value || '').trim().replace(/\s/g, '').replace(/R\$/gi, '')
  if (!raw) return 0

  const onlyMoneyChars = raw.replace(/[^0-9.,-]/g, '')
  const hasComma = onlyMoneyChars.includes(',')
  const hasDot = onlyMoneyChars.includes('.')

  let normalized = onlyMoneyChars

  if (hasComma) {
    normalized = onlyMoneyChars.replace(/\./g, '').replace(',', '.')
  } else if (hasDot) {
    const parts = onlyMoneyChars.split('.')
    const last = parts[parts.length - 1] || ''
    const looksLikeDecimal = parts.length === 2 && last.length > 0 && last.length <= 2
    normalized = looksLikeDecimal ? onlyMoneyChars : onlyMoneyChars.replace(/\./g, '')
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function moneyInputValue(value: string): string {
  return String(value || '').replace(/[^0-9.,]/g, '')
}

function moneyInputFromNumber(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100)
}

function fromCents(cents: number): number {
  return Number((Math.round(cents) / 100).toFixed(2))
}

function sumMoneyCents(values: Array<number | string | null | undefined>): number {
  return values.reduce<number>((total, value) => total + toCents(Number(value || 0)), 0)
}

function distribuirCentavos(totalCents: number, n: number): number[] {
  const safeN = Math.max(1, Math.floor(Number(n) || 1))
  const safeTotal = Math.max(0, Math.round(Number(totalCents) || 0))
  const base = Math.trunc(safeTotal / safeN)
  const resto = safeTotal - base * safeN
  return Array.from({ length: safeN }, (_, i) => base + (i < resto ? 1 : 0))
}

function distribuirParcelasEmCentavos(total: number, n: number, taxaMensal: number): number[] {
  const safeN = Math.max(1, Math.floor(Number(n) || 1))
  const taxa = Number(taxaMensal) || 0

  if (taxa <= 0) {
    const totalCents = toCents(total)
    const base = Math.trunc(totalCents / safeN)
    const resto = totalCents - base * safeN
    return Array.from({ length: safeN }, (_, i) => fromCents(base + (i < resto ? 1 : 0)))
  }

  const parcelaCents = toCents(calcPMT(total, safeN, taxa))
  return Array.from({ length: safeN }, () => fromCents(parcelaCents))
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')
}

function fmtDateTime(d?: string) {
  if (!d) return '—'
  const parsed = new Date(d)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('pt-BR')
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
  const valores = distribuirParcelasEmCentavos(total, n, taxa)
  const pmt = valores[0] || 0
  const datas = gerarDatasParcelamento(primeiraData, n, intervalo)
  const totalFinal = valores.reduce((sum, item) => sum + item, 0)
  const jurosTotal = totalFinal - total
  const mostrar = expanded ? datas : datas.slice(0, 3)

  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 4 }}>
      <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Prévia das parcelas</span>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text3)' }}>
          {jurosTotal > 0.01 && <span>Juros: <strong style={{ color: '#F59E0B' }}>{fmt(jurosTotal)}</strong></span>}
          <span>Total: <strong style={{ color: 'var(--text1)' }}>{fmt(totalFinal)}</strong></span>
        </div>
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {mostrar.map((d, i) => (
          <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', borderBottom: i < mostrar.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{i + 1}ª parcela — {fmtDate(d)}</span>
            <span style={{ fontWeight: 600, color: 'var(--text1)', fontFamily: 'var(--font-heading)' }}>{fmt(valores[i] ?? pmt)}</span>
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
  const pendentesOrdenadas = [...pendentes].sort((a, b) => (a.vencimento || '') < (b.vencimento || '') ? -1 : 1)
  const totalOriginalCents = sumMoneyCents(parcelas.map(p => p.valor))
  const totalPagoCents = sumMoneyCents(pagas.map(p => p.valor))
  const totalPendenteCents = sumMoneyCents(pendentes.map(p => p.valor))
  return {
    totalOriginal : fromCents(totalOriginalCents),
    totalPago     : fromCents(totalPagoCents),
    totalPendente : fromCents(totalPendenteCents),
    totalOriginalCents,
    totalPagoCents,
    totalPendenteCents,
    numPendentes  : pendentesOrdenadas.length,
    pendentes     : pendentesOrdenadas,
  }
}


type HistoricoFinanceiroItem = NonNullable<GrupoPagamento['historico']>[number]

function historicoDerivado(parcelas: Pagamento[]): HistoricoFinanceiroItem[] {
  const eventos: HistoricoFinanceiroItem[] = []
  for (const p of parcelas) {
    if (p.status === 'pago') {
      eventos.push({
        id: `parcela-${p.id}`,
        pagamento_id: p.id,
        grupo_id: p.grupo_id || null,
        tipo_evento: 'pagamento',
        titulo: p.num_parcela ? `Parcela ${p.num_parcela} paga` : 'Pagamento registrado',
        descricao: p.obs || null,
        valor: Number(p.valor || 0),
        data_evento: p.pago_em || p.vencimento || p.updated_at || p.created_at,
        forma_pagamento: null,
        created_at: p.updated_at || p.created_at,
      } as HistoricoFinanceiroItem)
    }
  }
  return eventos.sort((a, b) => new Date(b.created_at || b.data_evento || 0).getTime() - new Date(a.created_at || a.data_evento || 0).getTime())
}

function readHistoricoMetadata(h?: HistoricoFinanceiroItem | null): Record<string, unknown> {
  const raw = (h as any)?.metadata
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
  }
  return {}
}

function isDerivedParcelaEvent(h: HistoricoFinanceiroItem): boolean {
  return String(h.id || '').startsWith('parcela-') || String(h.id || '').startsWith('parcela:')
}

function isAntecipacaoFinanceira(h: HistoricoFinanceiroItem): boolean {
  const meta = readHistoricoMetadata(h)
  return h.tipo_evento === 'abatimento' && (
    meta.antecipacao_pagamento === true ||
    meta.tipo_abatimento === 'antecipacao' ||
    /antecip/i.test(String(h.titulo || '')) ||
    /antecip/i.test(String(h.descricao || ''))
  )
}

function isDescontoFinanceiro(h: HistoricoFinanceiroItem): boolean {
  const meta = readHistoricoMetadata(h)
  return h.tipo_evento === 'abatimento' && !isAntecipacaoFinanceira(h) && (
    meta.tipo_abatimento === 'desconto' ||
    /desconto|abatimento/i.test(String(h.titulo || '')) ||
    /desconto/i.test(String(h.descricao || ''))
  )
}

function calcExtratoGrupo(parcelas: Pagamento[], historico: HistoricoFinanceiroItem[] = []) {
  const eventosManuais = (historico || []).filter(h => !isDerivedParcelaEvent(h))
  const pagasCents = sumMoneyCents((parcelas || []).filter(p => p.status === 'pago').map(p => p.valor))
  const pendentesCents = sumMoneyCents((parcelas || []).filter(p => p.status === 'pendente').map(p => p.valor))
  const antecipacoesCents = sumMoneyCents(eventosManuais.filter(isAntecipacaoFinanceira).map(h => h.valor || 0))
  const descontosCents = sumMoneyCents(eventosManuais.filter(isDescontoFinanceiro).map(h => h.valor || 0))
  const acrescimosCents = sumMoneyCents(eventosManuais.filter(h => h.tipo_evento === 'acrescimo').map(h => h.valor || 0))
  const totalPagoRealCents = pagasCents + antecipacoesCents
  const valorAtualizadoCents = pendentesCents + totalPagoRealCents
  const ultimoMovimento = [...eventosManuais]
    .sort((a, b) => new Date(b.created_at || b.data_evento || 0).getTime() - new Date(a.created_at || a.data_evento || 0).getTime())[0] || null

  return {
    pagasCents,
    pendentesCents,
    antecipacoesCents,
    descontosCents,
    acrescimosCents,
    totalPagoRealCents,
    valorAtualizadoCents,
    ultimoMovimento,
    pagoReal: fromCents(totalPagoRealCents),
    pendente: fromCents(pendentesCents),
    valorAtualizado: fromCents(valorAtualizadoCents),
    antecipacoes: fromCents(antecipacoesCents),
    descontos: fromCents(descontosCents),
    acrescimos: fromCents(acrescimosCents),
  }
}

function valorHistoricoColor(h: HistoricoFinanceiroItem): string {
  if (h.tipo_evento === 'acrescimo') return '#F59E0B'
  if (isDescontoFinanceiro(h)) return '#6366F1'
  if (h.tipo_evento === 'pagamento' || isAntecipacaoFinanceira(h) || h.tipo_evento === 'abatimento') return '#10B981'
  return 'var(--text1)'
}

function sinalHistorico(h: HistoricoFinanceiroItem, entrada = false): string {
  if (h.tipo_evento === 'acrescimo') return '+'
  if (h.tipo_evento === 'pagamento') return entrada ? '+' : '-'
  if (h.tipo_evento === 'abatimento') return '-'
  return ''
}

function tituloEventoFinanceiro(tipo: string) {
  if (tipo === 'abatimento') return 'Abatimento / pagamento'
  if (tipo === 'acrescimo') return 'Acréscimo de saldo'
  if (tipo === 'pagamento') return 'Pagamento de parcela'
  if (tipo === 'recalculo') return 'Recálculo de parcelas'
  if (tipo === 'cancelamento') return 'Cancelamento'
  return 'Movimento financeiro'
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


type PeriodoFinanceiro = {
  mes: string
  ano: string
  grupoKey: string
}

type ParcelaComGrupo = {
  pagamento: Pagamento
  grupo: GrupoPagamento
  grupoKey: string
}

function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function grupoKey(g: GrupoPagamento): string {
  return g.grupo_id || buildFinancialNaturalKey(g)
}

function grupoLabel(g: GrupoPagamento): string {
  const pessoa = g.pessoa_nome ? ` · ${g.pessoa_nome}` : ''
  const tipo = g.tipo === 'recebimento' ? 'Receber' : 'Pagar'
  return `${tipo}: ${g.titulo}${pessoa}`
}

function dateParts(value?: string | null): { ano: string; mes: string } | null {
  const d = normalizeDateValue(value)
  if (!d || d.length < 7) return null
  return { ano: d.slice(0, 4), mes: d.slice(5, 7) }
}

function parcelaCompetenciaDate(p: Pagamento): string | null {
  return normalizeDateValue(p.vencimento || p.pago_em || p.created_at)
}

function matchesPeriodoPagamento(p: Pagamento, periodo: PeriodoFinanceiro): boolean {
  const parts = dateParts(parcelaCompetenciaDate(p))
  if (!parts) return periodo.mes === 'todos' && periodo.ano === 'todos'
  if (periodo.ano !== 'todos' && parts.ano !== periodo.ano) return false
  if (periodo.mes !== 'todos' && parts.mes !== periodo.mes) return false
  return true
}

function dedupeParcelas(grupos: GrupoPagamento[]): ParcelaComGrupo[] {
  const seen = new Set<string>()
  const result: ParcelaComGrupo[] = []
  for (const g of grupos) {
    const key = grupoKey(g)
    for (const p of g.parcelas || []) {
      if (!p?.id || seen.has(p.id)) continue
      seen.add(p.id)
      result.push({ pagamento: p, grupo: g, grupoKey: key })
    }
  }
  return result
}

function mesNome(mes: string) {
  if (mes === 'todos') return 'Todos os meses'
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return nomes[Math.max(0, Number(mes) - 1)] || mes
}

function statusResumoParcela(p: Pagamento) {
  if (p.status === 'pago') return 'Pago'
  if (p.status === 'cancelado') return 'Cancelado'
  const venc = normalizeDateValue(p.vencimento)
  const hoje = new Date().toISOString().slice(0, 10)
  return venc && venc < hoje ? 'Vencido' : 'Pendente'
}

function isPagamentoInSearch(item: ParcelaComGrupo, search: string) {
  if (!search) return true
  const q = normalizeSearch(search)
  const p = item.pagamento
  return [p.titulo, p.descricao, p.categoria, p.pessoa_nome, p.pessoa_nome_atual, item.grupo.pessoa_nome, item.grupo.titulo, p.obs]
    .some(v => normalizeSearch(v).includes(q))
}


type MovimentoFinanceiroPeriodo = {
  id: string
  data: string
  createdAt?: string | null
  tipo: 'pagamento' | 'recebimento'
  natureza: 'realizado' | 'ajuste'
  tipoEvento: string
  titulo: string
  subtitulo: string
  pessoaNome?: string | null
  grupoTitulo: string
  valor: number
  sinal: string
  cor: string
  historico: HistoricoFinanceiroItem
  grupo: GrupoPagamento
}

function matchesPeriodoData(value: unknown, periodo: PeriodoFinanceiro): boolean {
  const parts = dateParts(String(value || ''))
  if (!parts) return periodo.mes === 'todos' && periodo.ano === 'todos'
  if (periodo.ano !== 'todos' && parts.ano !== periodo.ano) return false
  if (periodo.mes !== 'todos' && parts.mes !== periodo.mes) return false
  return true
}

function historicoTituloHumano(h: HistoricoFinanceiroItem): string {
  if (isAntecipacaoFinanceira(h)) return 'Antecipação lançada'
  if (isDescontoFinanceiro(h)) return 'Desconto / abatimento'
  if (h.tipo_evento === 'pagamento') return 'Pagamento registrado'
  if (h.tipo_evento === 'acrescimo') return 'Acréscimo lançado'
  if (h.tipo_evento === 'recalculo') return 'Parcelas recalculadas'
  return h.titulo || tituloEventoFinanceiro(h.tipo_evento)
}

function isMovimentoDeCaixa(h: HistoricoFinanceiroItem): boolean {
  return h.tipo_evento === 'pagamento' || isAntecipacaoFinanceira(h)
}

function buildMovimentosFinanceirosPeriodo(
  grupos: GrupoPagamento[],
  periodo: PeriodoFinanceiro,
  filtros: { search: string; tipo: 'todos' | 'pagamento' | 'recebimento'; grupo: string; pessoaId?: string | null; status: string },
): MovimentoFinanceiroPeriodo[] {
  const movimentos: MovimentoFinanceiroPeriodo[] = []
  const q = normalizeSearch(filtros.search)

  for (const g of grupos) {
    const key = grupoKey(g)
    if (filtros.grupo !== 'todos' && key !== filtros.grupo) continue
    if (filtros.tipo !== 'todos' && g.tipo !== filtros.tipo) continue
    if (filtros.pessoaId && g.pessoa_id !== filtros.pessoaId) continue

    const historico = [...(g.historico || [])]
    const manualPayments = new Set(
      historico
        .filter(h => h.tipo_evento === 'pagamento' && !isDerivedParcelaEvent(h))
        .map(h => String(h.pagamento_id || ''))
        .filter(Boolean),
    )

    for (const h of historico) {
      const pagamentoId = String(h.pagamento_id || '')
      if (isDerivedParcelaEvent(h) && pagamentoId && manualPayments.has(pagamentoId)) continue

      const data = normalizeDateValue(h.data_evento || h.created_at)
      if (!data || !matchesPeriodoData(data, periodo)) continue
      if (filtros.status === 'pendente') continue
      if (filtros.status === 'cancelado' && h.tipo_evento !== 'cancelamento') continue
      if (filtros.status === 'pago' && !isMovimentoDeCaixa(h)) continue

      const haystack = [
        h.titulo,
        h.descricao,
        h.forma_pagamento,
        g.titulo,
        g.pessoa_nome,
        g.categoria,
        h.tipo_evento,
      ]
      if (q && !haystack.some(v => normalizeSearch(v).includes(q))) continue

      const entrada = g.tipo === 'recebimento'
      const caixa = isMovimentoDeCaixa(h)
      const ajuste = !caixa
      const valor = Number(h.valor || 0)
      if (!valor && h.tipo_evento !== 'recalculo') continue

      let sinal = ''
      let cor = 'var(--text2)'
      if (caixa) {
        sinal = entrada ? '+' : '-'
        cor = entrada ? '#10B981' : '#EF4444'
      } else if (h.tipo_evento === 'acrescimo') {
        sinal = '+'
        cor = '#F59E0B'
      } else if (isDescontoFinanceiro(h)) {
        sinal = '−'
        cor = '#6366F1'
      }

      movimentos.push({
        id: `mov-${key}-${h.id || h.created_at || h.data_evento}`,
        data,
        createdAt: h.created_at,
        tipo: g.tipo,
        natureza: ajuste ? 'ajuste' : 'realizado',
        tipoEvento: h.tipo_evento,
        titulo: historicoTituloHumano(h),
        subtitulo: h.descricao || g.titulo || 'Registro financeiro',
        pessoaNome: g.pessoa_nome,
        grupoTitulo: g.titulo,
        valor,
        sinal,
        cor,
        historico: h,
        grupo: g,
      })
    }
  }

  return movimentos.sort((a, b) => compareNullableDates(b.createdAt || b.data, a.createdAt || a.data))
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
              <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(100%, 320px)' }}>{g.titulo}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: chipColor, background: chipBg, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{chip}</span>
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
            <div style={{ fontWeight: 600, fontSize: 16, color: valorColor, fontFamily: 'var(--font-heading)' }}>
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
                style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
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
              style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(99,102,241,0.12)', color: '#6366F1', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <WalletCards size={13} /> Gerenciar dívida
            </button>
            <button title="Mostrar parcelas no card" onClick={e => { e.stopPropagation(); setExpanded(ex => !ex) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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
                <span style={{ fontWeight: 500, fontSize: 13, color: p.status === 'pago' ? '#10B981' : valorColor }}>{fmt(Number(p.valor))}</span>
                {p.status === 'pendente' && (
                  <button onClick={() => onMarkPaid(p)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
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

function GerenciarDividaModal({ parcelas, tipo, historico = [], onUpdate, onClose }: {
  parcelas  : Pagamento[]
  tipo      : 'pagamento' | 'recebimento'
  historico?: HistoricoFinanceiroItem[]
  onUpdate  : () => void
  onClose   : () => void
}) {
  const [modo, setModo]     = useState<'abatimento' | 'acrescimo'>('abatimento')
  const [valor, setValor]   = useState('')
  const [acao, setAcao]     = useState<'recalcular' | 'proximas'>('recalcular')
  const [tipoAbatimento, setTipoAbatimento] = useState<'antecipacao' | 'desconto'>('antecipacao')
  const [data, setData]     = useState(new Date().toISOString().slice(0, 10))
  const [forma, setForma]   = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [historicoLocal, setHistoricoLocal] = useState<HistoricoFinanceiroItem[]>(historico || [])
  const sugestaoAplicadaRef = useRef<string | null>(null)

  const saldo    = calcSaldoGrupo(parcelas)
  const valorNum = parseMoneyInput(valor)
  const valorCents = toCents(valorNum)
  const ref      = parcelas[0]
  const historicoCompleto = [...(historicoLocal || []), ...historicoDerivado(parcelas)]
    .filter((item, index, arr) => arr.findIndex(x => x.id === item.id) === index)
    .sort((a, b) => new Date(b.created_at || b.data_evento || 0).getTime() - new Date(a.created_at || a.data_evento || 0).getTime())
  const extrato = calcExtratoGrupo(parcelas, historicoCompleto)
  const nomeOperacao = tipo === 'recebimento' ? 'recebimento' : 'pagamento'

  const novoSaldoCents = modo === 'abatimento'
    ? Math.max(0, saldo.totalPendenteCents - valorCents)
    : saldo.totalPendenteCents + valorCents
  const novoSaldo      = fromCents(novoSaldoCents)
  const novosValoresCents = distribuirCentavos(novoSaldoCents, saldo.numPendentes || 1)
  const novaParcelaPMT = saldo.numPendentes > 0 ? fromCents(novosValoresCents[0] || 0) : 0
  const quitado        = modo === 'abatimento' && valorCents >= saldo.totalPendenteCents

  useEffect(() => {
    setHistoricoLocal(historico || [])
  }, [historico])

  useEffect(() => {
    // Preenche sugestão apenas uma vez por dívida. Depois disso o usuário pode apagar e digitar livremente.
    const chaveAtual = ref?.grupo_id || ref?.id || 'sem-referencia'
    if (sugestaoAplicadaRef.current === chaveAtual) return
    const sugerido = saldo.pendentes[0]?.valor || (saldo.numPendentes ? saldo.totalPendente / saldo.numPendentes : saldo.totalPendente)
    if (sugerido > 0) setValor(String(Math.round(Number(sugerido) * 100) / 100).replace('.', ','))
    sugestaoAplicadaRef.current = chaveAtual
  }, [ref?.grupo_id, ref?.id, saldo.numPendentes, saldo.totalPendente, saldo.pendentes])

  async function handleConfirm() {
    if (!valorNum || valorNum <= 0) { toast('Informe um valor válido', 'error'); return }
    if (modo === 'abatimento' && !data) { toast('Informe a data', 'error'); return }
    setSaving(true)
    try {
      const ehAntecipacao = modo === 'abatimento' && tipoAbatimento === 'antecipacao'
      const rotuloMovimento = modo === 'abatimento'
        ? (ehAntecipacao ? 'Antecipação de pagamento' : 'Abatimento / desconto')
        : 'Acréscimo'
      const obsMovimento = [
        modo === 'abatimento' ? `Tipo: ${rotuloMovimento}` : '',
        forma ? `Forma de pagamento: ${forma}` : '',
        motivo || '',
        modo === 'abatimento'
          ? `${rotuloMovimento} sobre dívida "${ref?.titulo}"`
          : `Acréscimo sobre dívida "${ref?.titulo}"`,
      ].filter(Boolean).join(' | ')

      // IMPORTANTE:
      // Abatimento/acréscimo NÃO cria novo lançamento financeiro independente.
      // Ele deve aparecer somente no Histórico/Extrato do registro original.
      // Antes isso criava um card separado “Abatimento — ...”, poluindo a tela.
      const eventoHistorico = await pagamentosApi.addHistorico({
        pagamento_id: ref?.id,
        grupo_id: ref?.grupo_id || null,
        tipo_evento: modo === 'abatimento' ? 'abatimento' : 'acrescimo',
        titulo: modo === 'abatimento' ? `${rotuloMovimento} registrado` : 'Acréscimo registrado',
        descricao: obsMovimento,
        valor: fromCents(valorCents),
        data_evento: data,
        forma_pagamento: forma || undefined,
        saldo_anterior: saldo.totalPendente,
        saldo_posterior: novoSaldo,
        referencia: {
          titulo: ref?.titulo,
          tipo,
          categoria: ref?.categoria,
          pessoa_id: ref?.pessoa_id,
          pessoa_nome: ref?.pessoa_nome || ref?.pessoa_nome_atual,
          valor_parcela: Number(ref?.valor || 0),
        },
        metadata: { acao, modo, tipo_abatimento: tipoAbatimento, antecipacao_pagamento: ehAntecipacao, parcelas_pendentes: saldo.numPendentes, valor_centavos: valorCents, saldo_anterior_centavos: saldo.totalPendenteCents, saldo_posterior_centavos: novoSaldoCents },
      })

      setHistoricoLocal(prev => [eventoHistorico as HistoricoFinanceiroItem, ...prev])

      if (quitado) {
        for (const p of saldo.pendentes) {
          await pagamentosApi.update(p.id, {
            status: ehAntecipacao ? 'pago' : 'cancelado',
            pago_em: ehAntecipacao ? data : undefined,
            obs   : `${p.obs ? p.obs + ' | ' : ''}${ehAntecipacao ? 'Quitado por antecipação de pagamento' : 'Quitado por abatimento/desconto'}`,
          })
        }
      } else if (saldo.numPendentes > 0) {
        if (acao === 'recalcular') {
          for (let i = 0; i < saldo.pendentes.length; i++) {
            await pagamentosApi.update(saldo.pendentes[i].id, { valor: fromCents(novosValoresCents[i] || 0) })
          }
        } else {
          if (modo === 'abatimento') {
            let restanteCents = valorCents
            for (const p of saldo.pendentes) {
              const atualCents = toCents(Number(p.valor || 0))
              if (restanteCents <= 0) break
              if (restanteCents >= atualCents) {
                await pagamentosApi.update(p.id, {
                  status: ehAntecipacao ? 'pago' : 'cancelado',
                  pago_em: ehAntecipacao ? data : undefined,
                  obs: `${p.obs ? p.obs + ' | ' : ''}${ehAntecipacao ? 'Baixado por antecipação de pagamento' : 'Baixado por abatimento/desconto'}`,
                })
                restanteCents -= atualCents
              } else {
                await pagamentosApi.update(p.id, { valor: fromCents(atualCents - restanteCents) })
                restanteCents = 0
              }
            }
          } else {
            const primeira = saldo.pendentes[0]
            if (primeira) await pagamentosApi.update(primeira.id, { valor: fromCents(toCents(Number(primeira.valor || 0)) + valorCents) })
          }
        }
      }

      toast(
        quitado
          ? (ehAntecipacao ? 'Dívida quitada por antecipação!' : 'Dívida quitada por abatimento/desconto!')
          : modo === 'abatimento'
            ? `${rotuloMovimento} registrado. Novo saldo: ${fmt(novoSaldo)}.`
            : `Acréscimo registrado. Novo saldo: ${fmt(novoSaldo)}.`
      )
      setValor('')
      setMotivo('')
      onUpdate()
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, margin: 0 }}>Gerenciar dívida</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18 }}>{ref?.titulo}{ref?.pessoa_nome ? ` · ${ref.pessoa_nome}` : ''}</div>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          {([
            { label: 'Valor atualizado', value: extrato.valorAtualizado, color: 'var(--text1)', bg: 'var(--bg3)' },
            { label: tipo === 'recebimento' ? 'Já recebido' : 'Já pago', value: extrato.pagoReal, color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
            { label: 'Saldo restante', value: saldo.totalPendente, color: saldo.totalPendente > 0 ? '#EF4444' : '#10B981', bg: 'rgba(239,68,68,0.1)'  },
          ] as const).map(({ label, value, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 600, fontSize: 14, color, fontFamily: 'var(--font-heading)' }}>{fmt(value)}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, textAlign: 'center' }}>
          {saldo.numPendentes} parcela{saldo.numPendentes !== 1 ? 's' : ''} pendente{saldo.numPendentes !== 1 ? 's' : ''} · {fmt(saldo.totalPendente / (saldo.numPendentes || 1))} cada
        </div>
        {(extrato.antecipacoes > 0 || extrato.descontos > 0 || extrato.acrescimos > 0 || extrato.ultimoMovimento) && (
          <div style={{ border: '1px solid var(--border)', background: 'var(--bg3)', borderRadius: 12, padding: 10, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {extrato.antecipacoes > 0 && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Antecipações</div><strong style={{ fontSize: 13, color: '#10B981' }}>{fmt(extrato.antecipacoes)}</strong></div>}
              {extrato.descontos > 0 && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Descontos</div><strong style={{ fontSize: 13, color: '#6366F1' }}>{fmt(extrato.descontos)}</strong></div>}
              {extrato.acrescimos > 0 && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Acréscimos</div><strong style={{ fontSize: 13, color: '#F59E0B' }}>{fmt(extrato.acrescimos)}</strong></div>}
              {extrato.ultimoMovimento && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Último movimento</div><strong style={{ fontSize: 13 }}>{fmt(Number(extrato.ultimoMovimento.valor || 0))}</strong><div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtDate(extrato.ultimoMovimento.data_evento || extrato.ultimoMovimento.created_at)}</div></div>}
            </div>
          </div>
        )}

        <section style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg3)', padding: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Extrato deste registro</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Pagamentos, recebimentos, antecipações, descontos, acréscimos e recálculos.</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>{historicoCompleto.length} evento(s)</span>
          </div>
          {historicoCompleto.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: 10, padding: 10 }}>Nenhum movimento registrado ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
              {historicoCompleto.map((h, i) => (
                <div key={h.id || i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--bg2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{h.titulo || tituloEventoFinanceiro(h.tipo_evento)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{h.data_evento ? fmtDate(String(h.data_evento)) : fmtDateTime(h.created_at)}{h.forma_pagamento ? ` · ${h.forma_pagamento}` : ''}</div>
                    </div>
                    {h.valor !== null && h.valor !== undefined && <div style={{ fontWeight: 500, color: valorHistoricoColor(h), whiteSpace: 'nowrap' }}>{sinalHistorico(h, tipo === 'recebimento')}{fmt(Number(h.valor))}</div>}
                  </div>
                  {h.descricao && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, overflowWrap: 'anywhere' }}>{h.descricao}</div>}
                  {(h.saldo_anterior !== null && h.saldo_anterior !== undefined && h.saldo_posterior !== null && h.saldo_posterior !== undefined) && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Saldo: {fmt(Number(h.saldo_anterior))} → <strong>{fmt(Number(h.saldo_posterior))}</strong></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Abas modo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setModo('abatimento')} style={{ padding: '12px', borderRadius: 'var(--radius)', border: `2px solid ${modo === 'abatimento' ? '#10B981' : 'var(--border)'}`, background: modo === 'abatimento' ? 'rgba(16,185,129,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 500, fontSize: 13, color: modo === 'abatimento' ? '#10B981' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <TrendingDown size={15} /> Pagar / Abater
          </button>
          <button type="button" onClick={() => setModo('acrescimo')} style={{ padding: '12px', borderRadius: 'var(--radius)', border: `2px solid ${modo === 'acrescimo' ? '#F59E0B' : 'var(--border)'}`, background: modo === 'acrescimo' ? 'rgba(245,158,11,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 500, fontSize: 13, color: modo === 'acrescimo' ? '#F59E0B' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <TrendingUp size={15} /> Acrescentar valor
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: modo === 'abatimento' ? '1fr 1fr' : '1fr', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{modo === 'abatimento' ? `Valor do ${nomeOperacao} / abatimento (R$)` : 'Valor a acrescentar (R$)'}</label>
              <input className="form-input" type="text" inputMode="decimal" placeholder="" value={valor} onChange={e => setValor(moneyInputValue(e.target.value))} />
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

          {modo === 'abatimento' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tipo do abatimento</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" className={`btn ${tipoAbatimento === 'antecipacao' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTipoAbatimento('antecipacao')} style={{ fontSize: 12 }}>
                  Antecipação
                </button>
                <button type="button" className={`btn ${tipoAbatimento === 'desconto' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTipoAbatimento('desconto')} style={{ fontSize: 12 }}>
                  Desconto
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Antecipação marca parcelas pagas. Desconto reduz ou cancela saldo sem criar lançamento separado.
              </div>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Observação do movimento</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Ex.: pagamento parcial, desconto negociado, correção do saldo..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

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
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 8 }}>
                {quitado ? 'Dívida quitada integralmente' : 'Recálculo das parcelas restantes'}
              </div>
              {!quitado ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                  {[
                    { label: 'Saldo atual',                                       value: saldo.totalPendente, sign: '',  color: 'var(--text1)' },
                    { label: modo === 'abatimento' ? (tipoAbatimento === 'antecipacao' ? '− Antecipação' : '− Desconto') : '+ Acréscimo', value: fromCents(valorCents), sign: modo === 'abatimento' ? '−' : '+', color: modo === 'abatimento' ? '#10B981' : '#F59E0B' },
                  ].map(({ label, value, sign, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text3)' }}>{label}</span>
                      <span style={{ fontWeight: 500, color }}>{sign}{fmt(value)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 5, marginTop: 2 }}>
                    <span style={{ color: 'var(--text3)' }}>Novo saldo</span>
                    <span style={{ fontWeight: 600 }}>{fmt(novoSaldo)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text3)' }}>Nova parcela ({saldo.numPendentes}x restantes)</span>
                    <span style={{ fontWeight: 600, color: '#6366f1' }}>{fmt(novaParcelaPMT)}</span>
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
                  ? <><Check size={14} /> Registrar {tipoAbatimento === 'antecipacao' ? 'antecipação' : 'abatimento'}</>
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
  const [valor, setValor] = useState(initial?.valor ? moneyInputFromNumber(initial.valor) : '')
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
  const [numParcelas, setNumParcelas] = useState('')
  const [taxaJuros, setTaxaJuros] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [intervaloParc, setIntervaloParc] = useState<'mensal' | 'quinzenal' | 'semanal'>('mensal')

  const initialMode: ScheduleMode = initial?.recorrencia && initial.recorrencia !== 'nenhum' ? 'recorrente' : 'unico'
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(initialMode)
  const [recorrencia, setRecorrencia] = useState(initial?.recorrencia || 'mensal')
  const [recorrenciaFim, setRecorrenciaFim] = useState(initial?.recorrencia_fim?.slice(0, 10) || '')
  const [datasPersonalizadas, setDatasPersonalizadas] = useState<string[]>([])

  async function handleSave() {
    const valorNum = parseMoneyInput(valor)
    const qtdParcelas = Math.floor(Number(numParcelas) || 0)

    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    if (!valor || valorNum <= 0) { toast('Valor inválido', 'error'); return }
    if (scheduleMode === 'unico' && !vencimento && !isEdit) { toast('Informe uma data ou escolha datas personalizadas', 'error'); return }
    if (scheduleMode === 'recorrente' && !vencimento && !isEdit) { toast('Informe a primeira data da recorrência', 'error'); return }
    if (scheduleMode === 'personalizado' && datasPersonalizadas.length === 0 && !isEdit) { toast('Adicione pelo menos uma data personalizada', 'error'); return }
    if (scheduleMode === 'parcelado' && !vencimento) { toast('Informe a data da primeira parcela', 'error'); return }
    if (scheduleMode === 'parcelado' && qtdParcelas < 2) { toast('Informe 2 ou mais parcelas', 'error'); return }

    setSaving(true)
    try {
      const pessoa = pessoas.find(p => p.id === pessoaId)
      const primeiraDataPersonalizada = datasPersonalizadas[0]

      // Para parcelado: calcula valor da parcela e gera datas
      let valorFinal = Number(valorNum.toFixed(2))
      let datasParcelado: string[] | undefined
      let valoresParcelado: number[] | undefined
      if (scheduleMode === 'parcelado') {
        const taxa = parseMoneyInput(taxaJuros) || 0
        valoresParcelado = distribuirParcelasEmCentavos(valorNum, qtdParcelas, taxa)
        valorFinal = valoresParcelado[0] || 0
        datasParcelado = gerarDatasParcelamento(vencimento, qtdParcelas, intervaloParc)
      }

      const obsComForma = [
        scheduleMode === 'parcelado' ? `grupo_id:grp_${Date.now()}` : '',
        formaPagamento ? `Forma de pagamento: ${formaPagamento}` : '',
        scheduleMode === 'parcelado' ? `${qtdParcelas}x de ${fmt(valorFinal)}${parseMoneyInput(taxaJuros) > 0 ? ` (${taxaJuros}% a.m.)` : ''}` : '',
        obs,
      ].filter(Boolean).join(' | ')

      const payload: Partial<Pagamento> = {
        titulo: titulo.trim(),
        descricao: descricao || undefined,
        valor: valorFinal,
        parcelas_valores: scheduleMode === 'parcelado' ? valoresParcelado : undefined,
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{isEdit ? 'Editar lançamento' : 'Novo lançamento'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setTipo('pagamento')} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${tipo === 'pagamento' ? '#EF4444' : 'var(--border)'}`, background: tipo === 'pagamento' ? 'rgba(239,68,68,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 500, fontSize: 14, color: tipo === 'pagamento' ? '#EF4444' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <WalletCards size={16} /> Eu pago
          </button>
          <button type="button" onClick={() => setTipo('recebimento')} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${tipo === 'recebimento' ? '#10B981' : 'var(--border)'}`, background: tipo === 'recebimento' ? 'rgba(16,185,129,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 500, fontSize: 14, color: tipo === 'recebimento' ? '#10B981' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
              <input className="form-input" type="text" inputMode="decimal" placeholder="" value={valor} onChange={e => setValor(moneyInputValue(e.target.value))} />
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
                    placeholder=""
                    value={numParcelas}
                    onChange={e => setNumParcelas(e.target.value.replace(/\D/g, ''))}
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
                    placeholder=""
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
                total={parseMoneyInput(valor)}
                n={Math.floor(Number(numParcelas) || 0)}
                taxa={parseMoneyInput(taxaJuros) || 0}
                intervalo={intervaloParc}
                primeiraData={vencimento}
              />

              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                <strong>Como funciona:</strong> O valor digitado acima é o <em>total da dívida</em>. O sistema calcula automaticamente o valor de cada parcela{parseMoneyInput(taxaJuros) > 0 ? ' com juros compostos (Tabela Price)' : ' sem juros'} e cria um lançamento por parcela no financeiro, cada um na sua data correta.
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
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: 14, color: '#fff', flexShrink: 0 }}>
            {r.pessoa_nome.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.pessoa_nome}</div>
            <div style={{ fontSize: 11, color: saldo > 0 ? '#10B981' : saldo < 0 ? '#EF4444' : 'var(--text3)', fontWeight: 600 }}>
              {saldo > 0 ? `Saldo: +${fmt(saldo)}` : saldo < 0 ? `Saldo: ${fmt(saldo)}` : 'Quitado'}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}><WalletCards size={12} /> Eu devo</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: r.devo_pendente > 0 ? '#EF4444' : 'var(--text3)', fontFamily: 'var(--font-heading)' }}>{fmt(r.devo_pendente)}</div>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}><CircleDollarSign size={12} /> Me devem</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: r.me_devem_pendente > 0 ? '#10B981' : 'var(--text3)', fontFamily: 'var(--font-heading)' }}>{fmt(r.me_devem_pendente)}</div>
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

function normalizeDateValue(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') {
    const v = value.trim()
    return v ? v.slice(0, 10) : null
  }
  try {
    const d = new Date(value as any)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {
    return null
  }
  return null
}

function compareNullableDates(a: unknown, b: unknown): number {
  const da = normalizeDateValue(a)
  const db = normalizeDateValue(b)
  const ta = da ? new Date(`${da}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
  const tb = db ? new Date(`${db}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
  return ta - tb
}

function normalizeGroupPart(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function buildFinancialNaturalKey(g: GrupoPagamento): string {
  const first = g.parcelas?.[0]
  const pessoa = g.pessoa_id || g.pessoa_nome || first?.pessoa_id || first?.pessoa_nome || first?.pessoa_nome_atual || 'sem-pessoa'
  return [
    'natural',
    normalizeGroupPart(g.titulo || first?.titulo),
    normalizeGroupPart(g.tipo || first?.tipo),
    normalizeGroupPart(g.categoria || first?.categoria || 'sem-categoria'),
    normalizeGroupPart(pessoa),
  ].join('|')
}

function normalizarGruposFinanceiros(input: GrupoPagamento[]): GrupoPagamento[] {
  const map = new Map<string, GrupoPagamento>()

  for (const grupo of input || []) {
    const key = grupo.grupo_id ? `grupo:${grupo.grupo_id}` : buildFinancialNaturalKey(grupo)
    const parcelas = Array.isArray(grupo.parcelas) ? grupo.parcelas : []

    if (!map.has(key)) {
      map.set(key, {
        ...grupo,
        grupo_id: grupo.grupo_id || key,
        parcelas: [...parcelas],
        valor_total: Number(grupo.valor_total || 0),
        valor_pago: Number(grupo.valor_pago || 0),
        valor_pendente: Number(grupo.valor_pendente || 0),
        num_parcelas: Number(grupo.num_parcelas || parcelas.length || 1),
        parcelas_pagas: Number(grupo.parcelas_pagas || parcelas.filter(p => p.status === 'pago').length),
        parcelas_pendentes: Number(grupo.parcelas_pendentes || parcelas.filter(p => p.status === 'pendente').length),
        proxima_parcela: normalizeDateValue(grupo.proxima_parcela),
        ultima_parcela: normalizeDateValue(grupo.ultima_parcela),
        vencido: Boolean(grupo.vencido),
        is_grupo: Boolean(grupo.is_grupo || parcelas.length > 1),
      })
      continue
    }

    const existente = map.get(key)!
    const parcelasExistentes = new Map<string, Pagamento>()
    for (const p of existente.parcelas || []) parcelasExistentes.set(p.id, p)
    for (const p of parcelas) parcelasExistentes.set(p.id, p)
    const todasParcelas = Array.from(parcelasExistentes.values()).sort((a, b) => {
      const byNum = Number(a.num_parcela || 0) - Number(b.num_parcela || 0)
      if (byNum !== 0) return byNum
      return compareNullableDates(a.vencimento, b.vencimento)
    })

    const pagas = todasParcelas.filter(p => p.status === 'pago')
    const pendentes = todasParcelas.filter(p => p.status === 'pendente')
    const proxima = pendentes[0] || todasParcelas[0]
    const ultima = [...todasParcelas].sort((a, b) => compareNullableDates(b.vencimento, a.vencimento))[0]
    const hoje = new Date().toISOString().slice(0, 10)

    existente.parcelas = todasParcelas
    existente.valor_total = todasParcelas.filter(p => p.status !== 'cancelado').reduce((s, p) => s + Number(p.valor || 0), 0)
    existente.valor_pago = pagas.reduce((s, p) => s + Number(p.valor || 0), 0)
    existente.valor_pendente = pendentes.reduce((s, p) => s + Number(p.valor || 0), 0)
    existente.num_parcelas = todasParcelas.length
    existente.parcelas_pagas = pagas.length
    existente.parcelas_pendentes = pendentes.length
    existente.proxima_parcela = normalizeDateValue(proxima?.vencimento)
    existente.ultima_parcela = normalizeDateValue(ultima?.vencimento)
    existente.vencido = pendentes.some(p => compareNullableDates(p.vencimento, hoje) < 0)
    existente.is_grupo = true
  }

  return Array.from(map.values()).map(g => {
    const parcelas = [...(g.parcelas || [])].sort((a, b) => {
      const byNum = Number(a.num_parcela || 0) - Number(b.num_parcela || 0)
      if (byNum !== 0) return byNum
      return compareNullableDates(a.vencimento, b.vencimento)
    })
    const pagas = parcelas.filter(p => p.status === 'pago')
    const pendentes = parcelas.filter(p => p.status === 'pendente')
    const proxima = pendentes[0] || parcelas[0]
    const ultima = [...parcelas].sort((a, b) => compareNullableDates(b.vencimento, a.vencimento))[0]
    const hoje = new Date().toISOString().slice(0, 10)

    return {
      ...g,
      parcelas,
      valor_total: parcelas.filter(p => p.status !== 'cancelado').reduce((s, p) => s + Number(p.valor || 0), 0),
      valor_pago: pagas.reduce((s, p) => s + Number(p.valor || 0), 0),
      valor_pendente: pendentes.reduce((s, p) => s + Number(p.valor || 0), 0),
      num_parcelas: parcelas.length,
      parcelas_pagas: pagas.length,
      parcelas_pendentes: pendentes.length,
      proxima_parcela: normalizeDateValue(proxima?.vencimento),
      ultima_parcela: normalizeDateValue(ultima?.vencimento),
      vencido: pendentes.some(p => compareNullableDates(p.vencimento, hoje) < 0),
      is_grupo: Boolean(g.is_grupo || parcelas.length > 1),
    }
  }).sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1
    return compareNullableDates(a.proxima_parcela, b.proxima_parcela)
  })
}

function GrupoBetaCard({ g, onEdit, onDelete, onDeleteGrupo, onMarkPaid, onGerenciar, onDetalhes, canDeleteFinanceiro }: {
  g: GrupoPagamento
  onEdit: (p: Pagamento) => void
  onDelete: (id: string) => void
  onDeleteGrupo: (g: GrupoPagamento) => void
  onMarkPaid: (p: Pagamento) => void
  onGerenciar: (g: GrupoPagamento) => void
  onDetalhes: (g: GrupoPagamento) => void
  canDeleteFinanceiro: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const isGrupo = Boolean(g.is_grupo || g.parcelas.length > 1)
  const valorColor = g.tipo === 'recebimento' ? '#10B981' : '#EF4444'
  const sinal = g.tipo === 'recebimento' ? '+' : '-'
  const extrato = calcExtratoGrupo(g.parcelas || [], g.historico || [])
  const valorPagoReal = extrato.pagoReal || Number(g.valor_pago || 0)
  const valorPendenteReal = extrato.pendente || Number(g.valor_pendente || 0)
  const valorTotalReal = extrato.valorAtualizado || Number(g.valor_total || 0)
  const chip = g.vencido ? 'Vencido' : valorPendenteReal === 0 ? 'Pago' : 'Pendente'
  const chipColor = chip === 'Vencido' ? '#EF4444' : chip === 'Pago' ? '#10B981' : '#F59E0B'
  const chipBg = chip === 'Vencido' ? 'rgba(239,68,68,0.12)' : chip === 'Pago' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'
  const principal = g.parcelas[0]

  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${g.vencido ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', cursor: isGrupo ? 'pointer' : 'default' }} onClick={() => isGrupo && setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(100%, 320px)' }}>{g.titulo}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: chipColor, background: chipBg, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{chip}</span>
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
            <div style={{ fontWeight: 600, fontSize: 16, color: valorColor, fontFamily: 'var(--font-heading)' }}>
              {sinal}{fmt(isGrupo ? valorPendenteReal : valorTotalReal)}
            </div>
            {isGrupo && valorPagoReal > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Pago: {fmt(valorPagoReal)}</div>
            )}
          </div>
        </div>

        {/* Barra de progresso */}
        {isGrupo && valorTotalReal > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (valorPagoReal / valorTotalReal) * 100)}%`, background: '#10B981', borderRadius: 999, transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>
              <span>Total: {fmt(valorTotalReal)}</span>
              <span>{Math.round((valorPagoReal / valorTotalReal) * 100)}% pago</span>
            </div>
          </div>
        )}

        {/* Ações para lançamento único */}
        {!isGrupo && principal && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {principal.status === 'pendente' && (
              <button onClick={e => { e.stopPropagation(); onMarkPaid(principal) }} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Check size={13} /> Marcar pago
              </button>
            )}
            <button title="Visualizar detalhes" onClick={e => { e.stopPropagation(); onDetalhes(g) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}><Eye size={13} /></button>
            <button onClick={e => { e.stopPropagation(); onEdit(principal) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}><Pencil size={13} /></button>
            {canDeleteFinanceiro && (
              <button
                title="Apagar registro financeiro"
                onClick={e => { e.stopPropagation(); onDelete(principal.id) }}
                style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#EF4444', cursor: 'pointer' }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}

        {/* Ações para grupo */}
        {isGrupo && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={e => { e.stopPropagation(); onGerenciar(g) }} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(99,102,241,0.12)', color: '#6366F1', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <WalletCards size={13} /> Gerenciar dívida
            </button>
            <button title="Visualizar detalhes" onClick={e => { e.stopPropagation(); onDetalhes(g) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
              <Eye size={13} />
            </button>
            <button title="Mostrar parcelas no card" onClick={e => { e.stopPropagation(); setExpanded(ex => !ex) }} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {canDeleteFinanceiro && (
              <button
                title="Apagar registro financeiro completo"
                onClick={e => { e.stopPropagation(); onDeleteGrupo(g) }}
                style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#EF4444', cursor: 'pointer' }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Parcelas expandidas */}
      {isGrupo && expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {[...g.parcelas].sort((a, b) => {
            const byNum = Number(a.num_parcela || 0) - Number(b.num_parcela || 0)
            if (byNum !== 0) return byNum
            return compareNullableDates(a.vencimento, b.vencimento)
          }).map((p, i) => (
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
                <span style={{ fontWeight: 500, fontSize: 13, color: p.status === 'pago' ? '#10B981' : valorColor }}>{fmt(Number(p.valor))}</span>
                {p.status === 'pendente' && (
                  <button onClick={() => onMarkPaid(p)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
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

function FinanceiroDetalhesModal({ grupo, onClose, onGerenciar, onEdit, onMarkPaid }: {
  grupo: GrupoPagamento
  onClose: () => void
  onGerenciar: (g: GrupoPagamento) => void
  onEdit: (p: Pagamento) => void
  onMarkPaid: (p: Pagamento) => void
}) {
  const parcelas = [...(grupo.parcelas || [])].sort((a, b) => {
    const byNum = Number(a.num_parcela || 0) - Number(b.num_parcela || 0)
    if (byNum !== 0) return byNum
    return compareNullableDates(a.vencimento, b.vencimento)
  })
  const primeira = parcelas[0]
  const pendentes = parcelas.filter(p => p.status === 'pendente')
  const pagas = parcelas.filter(p => p.status === 'pago')
  const canceladas = parcelas.filter(p => p.status === 'cancelado')
  const proxima = pendentes[0]
  const valorParcelaBase = parcelas.length ? Number(parcelas[0]?.valor || 0) : Number(grupo.valor_total || 0)
  const progresso = Number(grupo.valor_total || 0) > 0 ? Math.min(100, Math.round((Number(grupo.valor_pago || 0) / Number(grupo.valor_total || 1)) * 100)) : 0
  const entrada = grupo.tipo === 'recebimento'
  const valorColor = entrada ? '#10B981' : '#EF4444'
  const tituloTipo = entrada ? 'A receber' : 'A pagar'
  const hoje = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')

  function diferencaDias(date?: string | null) {
    const d = normalizeDateValue(date)
    if (!d) return null
    const alvo = new Date(`${d}T00:00:00`)
    return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
  }

  function textoAlerta(date?: string | null) {
    const diff = diferencaDias(date)
    if (diff === null) return 'Sem vencimento'
    if (diff < 0) return `Vencido há ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'}`
    if (diff === 0) return 'Aviso hoje: vence no dia'
    if (diff === 1) return 'Aviso amanhã: lembrete 1 dia antes'
    return `Lembrete automático 1 dia antes e no dia (${diff} dias restantes)`
  }

  const historicoCompleto = [...(grupo.historico || []), ...historicoDerivado(parcelas)]
    .filter((item, index, arr) => arr.findIndex(x => x.id === item.id) === index)
    .sort((a, b) => new Date(b.created_at || b.data_evento || 0).getTime() - new Date(a.created_at || a.data_evento || 0).getTime())
  const extrato = calcExtratoGrupo(parcelas, historicoCompleto)
  const progressoReal = extrato.valorAtualizadoCents > 0 ? Math.min(100, Math.round((extrato.totalPagoRealCents / extrato.valorAtualizadoCents) * 100)) : progresso

  const resumo = [
    { label: tituloTipo, value: extrato.valorAtualizado, color: valorColor },
    { label: `Parcelado em`, valueText: `${grupo.num_parcelas || parcelas.length || 1}x`, color: 'var(--text1)' },
    { label: 'Parcela atual', value: valorParcelaBase, color: 'var(--text1)' },
    { label: 'Saldo restante', value: extrato.pendente, color: extrato.pendente > 0 ? '#EF4444' : '#10B981' },
    { label: entrada ? 'Já recebido' : 'Já pago', value: extrato.pagoReal, color: '#10B981' },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto', zIndex: 320 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: 24, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.55)', border: '1px solid var(--border)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: valorColor, background: entrada ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', borderRadius: 999, padding: '3px 8px' }}>{tituloTipo}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px' }}>{pagas.length}/{parcelas.length || 1} parcelas pagas</span>
            </div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 19, margin: 0, lineHeight: 1.2 }}>{grupo.titulo}</h2>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {grupo.pessoa_nome && <span><User size={11} style={{ verticalAlign: -1 }} /> {grupo.pessoa_nome}</span>}
              {grupo.categoria && <span>{grupo.categoria}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 12, cursor: 'pointer', padding: 8 }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginBottom: 14 }}>
            {resumo.map(item => (
              <div key={item.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 13px' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontWeight: 500, fontSize: 17, color: item.color, fontFamily: 'var(--font-heading)' }}>{item.valueText || fmt(Number(item.value || 0))}</div>
              </div>
            ))}
          </section>

          <section style={{ background: entrada ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${entrada ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}`, borderRadius: 16, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>Próximo vencimento e lembretes</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{textoAlerta(proxima?.vencimento)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Próxima parcela</div>
                <div style={{ fontWeight: 500, color: valorColor }}>{proxima ? `${fmt(Number(proxima.valor || 0))} · ${fmtDate(proxima.vencimento)}` : 'Sem pendências'}</div>
              </div>
            </div>
            <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressoReal}%`, background: '#10B981', borderRadius: 999 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
              <span>{progressoReal}% realizado</span>
              <span>{pagas.length} pagas · {pendentes.length} pendentes{canceladas.length ? ` · ${canceladas.length} canceladas` : ''}</span>
            </div>
          </section>

          {(extrato.antecipacoes > 0 || extrato.descontos > 0 || extrato.acrescimos > 0 || extrato.ultimoMovimento) && (
            <section style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 14 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 8 }}>Resumo do extrato</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                {extrato.antecipacoes > 0 && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Antecipações</div><strong style={{ color: '#10B981' }}>{fmt(extrato.antecipacoes)}</strong></div>}
                {extrato.descontos > 0 && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Descontos</div><strong style={{ color: '#6366F1' }}>{fmt(extrato.descontos)}</strong></div>}
                {extrato.acrescimos > 0 && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Acréscimos</div><strong style={{ color: '#F59E0B' }}>{fmt(extrato.acrescimos)}</strong></div>}
                {extrato.ultimoMovimento && <div><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Último movimento</div><strong>{fmt(Number(extrato.ultimoMovimento.valor || 0))}</strong><div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtDate(extrato.ultimoMovimento.data_evento || extrato.ultimoMovimento.created_at)}</div></div>}
              </div>
            </section>
          )}

          {primeira?.descricao && (
            <section style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Descrição</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{primeira.descricao}</div>
            </section>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, .8fr)', gap: 12 }}>
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 16, padding: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>Vencimentos</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Parcelas, status e saldo restante.</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px' }}>{parcelas.length || 1} linha(s)</span>
              </div>
              <div style={{ display: 'grid', gap: 7, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                {(parcelas.length ? parcelas : [primeira]).filter(Boolean).map((p, i) => {
                  const status = statusResumoParcela(p as Pagamento)
                  const isPendente = (p as Pagamento).status === 'pendente'
                  return (
                    <div key={(p as Pagamento).id || i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2)', padding: '9px 10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 12 }}>{(p as Pagamento).num_parcela || i + 1}/{(p as Pagamento).num_parcelas || parcelas.length || 1}</strong>
                          <span style={{ fontSize: 10, fontWeight: 500, color: status === 'Pago' ? '#10B981' : status === 'Vencido' ? '#EF4444' : 'var(--text3)' }}>{status}</span>
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{textoAlerta((p as Pagamento).vencimento)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Vence: {fmtDate((p as Pagamento).vencimento)}{(p as Pagamento).pago_em ? ` · Pago em ${fmtDate((p as Pagamento).pago_em)}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ color: (p as Pagamento).status === 'pago' ? '#10B981' : valorColor, whiteSpace: 'nowrap' }}>{fmt(Number((p as Pagamento).valor || 0))}</strong>
                        {isPendente && <button title="Marcar como pago/recebido" onClick={() => onMarkPaid(p as Pagamento)} style={{ padding: '5px 7px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer' }}><Check size={12} /></button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 16, padding: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>Extrato do registro</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Pagamentos, antecipações, descontos, acréscimos e recálculos.</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px' }}>{historicoCompleto.length}</span>
              </div>
              {historicoCompleto.length === 0 ? (
                <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 12, color: 'var(--text3)', fontSize: 12 }}>Sem histórico ainda.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                  {historicoCompleto.slice(0, 50).map((h, i) => (
                    <div key={h.id || i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--bg2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontSize: 12 }}>{h.titulo || tituloEventoFinanceiro(h.tipo_evento)}</strong>
                        {h.valor !== null && h.valor !== undefined && <strong style={{ fontSize: 12, color: valorHistoricoColor(h), whiteSpace: 'nowrap' }}>{sinalHistorico(h, entrada)}{fmt(Number(h.valor || 0))}</strong>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>{fmtDate(h.data_evento || h.created_at)}{h.forma_pagamento ? ` · ${h.forma_pagamento}` : ''}</div>
                      {h.descricao && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, whiteSpace: 'pre-wrap' }}>{h.descricao}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: '1 1 120px' }}>Fechar</button>
            {primeira && <button className="btn btn-ghost" onClick={() => onEdit(primeira)} style={{ flex: '1 1 120px' }}><Pencil size={14} /> Editar</button>}
            <button className="btn btn-primary" onClick={() => onGerenciar(grupo)} style={{ flex: '2 1 180px' }}><WalletCards size={14} /> Pagar / ajustar saldo</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Financeiro() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useVisualTexts()
  const canDeleteFinanceiro = !!user

  const [grupos, setGrupos] = useState<GrupoPagamento[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null)
  const [porPessoa, setPorPessoa] = useState<ResumoPorPessoa[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [gerenciarDivida, setGerenciarDivida] = useState<{ parcelas: Pagamento[]; tipo: 'pagamento' | 'recebimento'; historico?: HistoricoFinanceiroItem[] } | null>(null)
  const [detalhesGrupo, setDetalhesGrupo] = useState<GrupoPagamento | null>(null)
  const [editPag, setEditPag] = useState<Pagamento | null>(null)
  const [prefill, setPrefill] = useState<Partial<Pagamento> | null>(null)
  const [tab, setTab] = useState<'lista' | 'pessoas'>('lista')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'pagamento' | 'recebimento'>('todos')
  const [search, setSearch] = useState('')
  const [pessoaFiltro, setPessoaFiltro] = useState<ResumoPorPessoa | null>(null)
  const [filtroMes, setFiltroMes] = useState('todos')
  const [filtroAno, setFiltroAno] = useState('todos')
  const [filtroGrupo, setFiltroGrupo] = useState('todos')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [gs, ps, res, pp] = await Promise.all([
        pagamentosApi.grupos(),
        equipeApi.pessoas(),
        pagamentosApi.resumo(),
        pagamentosApi.porPessoa(),
      ])
      setGrupos(normalizarGruposFinanceiros(gs))
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
      const hoje = new Date().toISOString().slice(0, 10)
      await pagamentosApi.update(p.id, { status: 'pago', pago_em: hoje })
      const eventoHistorico = await pagamentosApi.addHistorico({
        pagamento_id: p.id,
        grupo_id: p.grupo_id || null,
        tipo_evento: 'pagamento',
        titulo: p.num_parcela ? `Parcela ${p.num_parcela} marcada como paga` : 'Pagamento marcado como pago',
        valor: Number(p.valor || 0),
        data_evento: hoje,
        referencia: {
          titulo: p.titulo,
          tipo: p.tipo,
          categoria: p.categoria,
          pessoa_id: p.pessoa_id,
          pessoa_nome: p.pessoa_nome || p.pessoa_nome_atual,
          valor_parcela: Number(p.valor || 0),
        },
      }).catch(() => {})
      toast('Marcado como pago!')
      load()
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  async function handleDelete(id: string) {
    if (!canDeleteFinanceiro) {
      toast('Você não tem permissão para apagar este registro financeiro.', 'error')
      return
    }
    if (!confirm('Apagar definitivamente este registro financeiro? Esta ação não pode ser desfeita.')) return
    try { await pagamentosApi.remove(id); load(); toast('Registro financeiro apagado') }
    catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  async function handleDeleteGrupo(g: GrupoPagamento) {
    if (!canDeleteFinanceiro) {
      toast('Você não tem permissão para apagar este registro financeiro.', 'error')
      return
    }
    const total = g.parcelas?.length || 0
    if (!confirm(`Apagar definitivamente este registro financeiro completo${total > 1 ? ` com ${total} parcelas` : ''}? Esta ação não pode ser desfeita.`)) return
    try {
      if (g.grupo_id) {
        await pagamentosApi.removeGrupo(g.grupo_id)
      } else {
        await Promise.all((g.parcelas || []).map(p => pagamentosApi.remove(p.id)))
      }
      load()
      toast('Registro financeiro apagado')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    }
  }

  const todasParcelas = dedupeParcelas(grupos)
  const anosDisponiveis = Array.from(new Set(
    todasParcelas
      .map(({ pagamento }) => dateParts(parcelaCompetenciaDate(pagamento))?.ano)
      .filter(Boolean) as string[]
  )).sort((a, b) => Number(b) - Number(a))
  if (!anosDisponiveis.includes(filtroAno) && filtroAno !== 'todos') anosDisponiveis.unshift(filtroAno)

  const opcoesDivida = grupos
    .map(g => ({ key: grupoKey(g), label: grupoLabel(g) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

  const periodoAtual: PeriodoFinanceiro = { mes: filtroMes, ano: filtroAno, grupoKey: filtroGrupo }

  const parcelasFiltradas = todasParcelas.filter(item => {
    const p = item.pagamento
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
    if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false
    if (pessoaFiltro && p.pessoa_id !== pessoaFiltro.pessoa_id) return false
    if (filtroGrupo !== 'todos' && item.grupoKey !== filtroGrupo) return false
    if (!matchesPeriodoPagamento(p, periodoAtual)) return false
    if (!isPagamentoInSearch(item, search)) return false
    return true
  })

  const filtrarGrupos = (tipo: 'pagamento' | 'recebimento') => {
    return grupos.filter(g => {
      if (g.tipo !== tipo) return false
      if (filtroGrupo !== 'todos' && grupoKey(g) !== filtroGrupo) return false
      if (pessoaFiltro && g.pessoa_id !== pessoaFiltro.pessoa_id) return false
      if (search) {
        const q = normalizeSearch(search)
        const matchGrupo = [g.titulo, g.pessoa_nome, g.categoria].some(v => normalizeSearch(v).includes(q))
        const matchParcela = (g.parcelas || []).some(p => isPagamentoInSearch({ pagamento: p, grupo: g, grupoKey: grupoKey(g) }, search))
        if (!matchGrupo && !matchParcela) return false
      }
      const parcelasDoPeriodo = (g.parcelas || []).filter(p => matchesPeriodoPagamento(p, periodoAtual))
      if (parcelasDoPeriodo.length === 0) return false
      if (filtroStatus !== 'todos' && !parcelasDoPeriodo.some(p => p.status === filtroStatus)) return false
      if (filtroTipo !== 'todos' && g.tipo !== filtroTipo) return false
      return true
    }).map(g => {
      const parcelas = (g.parcelas || []).filter(p => matchesPeriodoPagamento(p, periodoAtual))
      if (filtroStatus !== 'todos') {
        const statusParcelas = parcelas.filter(p => p.status === filtroStatus)
        return statusParcelas.length ? normalizarGruposFinanceiros([{ ...g, parcelas: statusParcelas }])[0] : g
      }
      return normalizarGruposFinanceiros([{ ...g, parcelas }])[0]
    }).filter(Boolean)
  }

  const gruposPagar = filtrarGrupos('pagamento')
  const gruposReceber = filtrarGrupos('recebimento')
  const vencidos = parcelasFiltradas.filter(({ pagamento }) => statusResumoParcela(pagamento) === 'Vencido')

  const somaParcelas = (tipo: 'pagamento' | 'recebimento', status?: 'pendente' | 'pago' | 'cancelado') => parcelasFiltradas
    .filter(({ pagamento }) => pagamento.tipo === tipo && pagamento.status !== 'cancelado' && (!status || pagamento.status === status))
    .reduce((s, { pagamento }) => s + Number(pagamento.valor || 0), 0)

  const totalEntradasPeriodo = somaParcelas('recebimento')
  const totalSaidasPeriodo = somaParcelas('pagamento')
  const recebidoPeriodo = somaParcelas('recebimento', 'pago')
  const pagoPeriodo = somaParcelas('pagamento', 'pago')
  const aReceberPeriodo = somaParcelas('recebimento', 'pendente')
  const aPagarPeriodo = somaParcelas('pagamento', 'pendente')
  const saldoPrevistoPeriodo = totalEntradasPeriodo - totalSaidasPeriodo
  const saldoAbertoPeriodo = aReceberPeriodo - aPagarPeriodo

  const movimentosPeriodo = buildMovimentosFinanceirosPeriodo(grupos, periodoAtual, {
    search,
    tipo: filtroTipo,
    grupo: filtroGrupo,
    pessoaId: pessoaFiltro?.pessoa_id || null,
    status: filtroStatus,
  })
  const movimentosRealizadosPeriodo = movimentosPeriodo.filter(m => m.natureza === 'realizado')
  const entradasRealizadasPeriodo = fromCents(sumMoneyCents(movimentosRealizadosPeriodo.filter(m => m.tipo === 'recebimento').map(m => m.valor)))
  const saidasRealizadasPeriodo = fromCents(sumMoneyCents(movimentosRealizadosPeriodo.filter(m => m.tipo === 'pagamento').map(m => m.valor)))
  const saldoRealizadoPeriodo = entradasRealizadasPeriodo - saidasRealizadasPeriodo

  const parcelasPrevistasPeriodo = [...parcelasFiltradas]
    .filter(({ pagamento }) => pagamento.status !== 'cancelado')
    .sort((a, b) => compareNullableDates(b.pagamento.vencimento || b.pagamento.pago_em || b.pagamento.created_at, a.pagamento.vencimento || a.pagamento.pago_em || a.pagamento.created_at))

  const filtroDescricao = `${mesNome(filtroMes)}${filtroAno !== 'todos' ? `/${filtroAno}` : ''}`

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 760, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16 }}>{t('finance.pageTitle')}</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Pagamentos, recebimentos, recorrências e datas personalizadas</p>
        </div>
        <button className="btn btn-primary" onClick={() => openLancamento()} style={{ gap: 6 }}><Plus size={16} /> Lançar</button>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingUp size={14} color="#10B981" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>Entradas realizadas</span></div>
          <div style={{ fontWeight: 600, fontSize: 19, color: '#10B981', fontFamily: 'var(--font-heading)' }}>{fmt(entradasRealizadasPeriodo)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Previsto: {fmt(totalEntradasPeriodo)}</div>
        </div>
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><TrendingDown size={14} color="#EF4444" /><span style={{ fontSize: 11, color: 'var(--text3)' }}>Saídas realizadas</span></div>
          <div style={{ fontWeight: 600, fontSize: 19, color: '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(saidasRealizadasPeriodo)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Previsto: {fmt(totalSaidasPeriodo)}</div>
        </div>
        <div style={{ background: saldoPrevistoPeriodo >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${saldoPrevistoPeriodo >= 0 ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}`, borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><CircleDollarSign size={14} color={saldoPrevistoPeriodo >= 0 ? '#10B981' : '#EF4444'} /><span style={{ fontSize: 11, color: 'var(--text3)' }}>Saldo previsto</span></div>
          <div style={{ fontWeight: 600, fontSize: 19, color: saldoPrevistoPeriodo >= 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(saldoPrevistoPeriodo)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{filtroDescricao}</div>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><WalletCards size={14} /><span style={{ fontSize: 11, color: 'var(--text3)' }}>Em aberto</span></div>
          <div style={{ fontWeight: 600, fontSize: 19, color: saldoAbertoPeriodo >= 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(saldoAbertoPeriodo)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>A receber {fmt(aReceberPeriodo)} · A pagar {fmt(aPagarPeriodo)}</div>
        </div>
      </section>

      {resumo && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Carteira total a receber</div>
            <div style={{ fontWeight: 600, fontSize: 17, color: '#10B981', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.receita_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Histórico recebido: {fmt(resumo.receita_paga)}</div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Carteira total a pagar</div>
            <div style={{ fontWeight: 600, fontSize: 17, color: '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.despesa_pendente)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Histórico pago: {fmt(resumo.despesa_paga)}</div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Saldo realizado total</div>
            <div style={{ fontWeight: 600, fontSize: 17, color: resumo.saldo >= 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-heading)' }}>{fmt(resumo.saldo)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Baseado no que já foi pago/recebido</div>
          </div>
        </section>
      )}

      {vencidos.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 500, fontSize: 13, color: '#F59E0B' }}>{vencidos.length} lançamento{vencidos.length > 1 ? 's' : ''} vencido{vencidos.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Total: {fmt(vencidos.reduce((s, item) => s + Number(item.pagamento.valor || 0), 0))}</div>
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
              <div style={{ fontWeight: 500 }}>Nenhum lançamento por pessoa</div>
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
          <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Filter size={15} />
                <strong style={{ fontSize: 14 }}>Filtros dinâmicos</strong>
                <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>{parcelasFiltradas.length} movimento{parcelasFiltradas.length === 1 ? '' : 's'}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '6px 10px' }}
                onClick={() => { setFiltroMes('todos'); setFiltroAno('todos'); setFiltroGrupo('todos'); setFiltroStatus('todos'); setFiltroTipo('todos'); setSearch(''); setPessoaFiltro(null) }}
              >
                Limpar filtros
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
                <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar por descrição, pessoa, categoria..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>

              <select className="form-input" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
                <option value="todos">Todos meses</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => <option key={m} value={m}>{mesNome(m)}</option>)}
              </select>

              <select className="form-input" value={filtroAno} onChange={e => setFiltroAno(e.target.value)}>
                <option value="todos">Todos anos</option>
                {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
              </select>

              <select className="form-input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                <option value="todos">Todos status</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>

              <select className="form-input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as 'todos' | 'pagamento' | 'recebimento')}>
                <option value="todos">Entradas e saídas</option>
                <option value="recebimento">Somente entradas</option>
                <option value="pagamento">Somente saídas</option>
              </select>

              <select className="form-input" value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
                <option value="todos">Todas dívidas/contratos</option>
                {opcoesDivida.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
              </select>
            </div>
          </section>

          {pessoaFiltro && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <User size={14} color="#2563EB" />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Filtrado: {pessoaFiltro.pessoa_nome}</span>
              <button onClick={() => setPessoaFiltro(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 14 }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Entradas filtradas</div>
              <div style={{ fontWeight: 500, color: '#10B981', fontSize: 16 }}>{fmt(totalEntradasPeriodo)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Aberto: {fmt(aReceberPeriodo)} · Realizado: {fmt(entradasRealizadasPeriodo)}</div>
            </div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Saídas filtradas</div>
              <div style={{ fontWeight: 500, color: '#EF4444', fontSize: 16 }}>{fmt(totalSaidasPeriodo)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Aberto: {fmt(aPagarPeriodo)} · Realizado: {fmt(saidasRealizadasPeriodo)}</div>
            </div>
            <div style={{ background: saldoPrevistoPeriodo >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${saldoPrevistoPeriodo >= 0 ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)'}`, borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Fechamento previsto</div>
              <div style={{ fontWeight: 500, color: saldoPrevistoPeriodo >= 0 ? '#10B981' : '#EF4444', fontSize: 16 }}>{fmt(saldoPrevistoPeriodo)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{saldoPrevistoPeriodo >= 0 ? 'Período positivo' : 'Período negativo'} considerando todos os filtros</div>
            </div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Realizado / extrato</div>
              <div style={{ fontWeight: 500, color: saldoRealizadoPeriodo >= 0 ? '#10B981' : '#EF4444', fontSize: 16 }}>{fmt(saldoRealizadoPeriodo)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{movimentosPeriodo.length} movimento{movimentosPeriodo.length === 1 ? '' : 's'} lançado{movimentosPeriodo.length === 1 ? '' : 's'}</div>
            </div>
          </section>

          <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>Extrato do período</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Pagamentos, recebimentos, antecipações e ajustes lançados pela data em que aconteceram.</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px' }}>{filtroDescricao}</span>
            </div>
            {movimentosPeriodo.length === 0 ? (
              <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 14, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>Nenhum pagamento, recebimento ou ajuste lançado com os filtros atuais.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                {movimentosPeriodo.slice(0, 80).map(m => {
                  const entrada = m.tipo === 'recebimento'
                  const isAjuste = m.natureza === 'ajuste'
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', background: isAjuste ? 'rgba(99,102,241,0.06)' : 'var(--bg3)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{m.titulo}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, borderRadius: 999, padding: '2px 7px', color: isAjuste ? '#6366F1' : entrada ? '#10B981' : '#EF4444', background: isAjuste ? 'rgba(99,102,241,0.12)' : entrada ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}>{isAjuste ? 'Ajuste' : entrada ? 'Entrada' : 'Saída'}</span>
                          {isAntecipacaoFinanceira(m.historico) && <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600 }}>Antecipação</span>}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span>{fmtDate(m.data)}</span>
                          {m.pessoaNome && <span>{m.pessoaNome}</span>}
                          <span>{m.grupoTitulo}</span>
                          {m.historico.forma_pagamento && <span>{m.historico.forma_pagamento}</span>}
                        </div>
                        {m.subtitulo && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.subtitulo}</div>}
                      </div>
                      <strong style={{ color: m.cor, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{m.sinal}{fmt(Number(m.valor || 0))}</strong>
                    </div>
                  )
                })}
              </div>
            )}

            {parcelasPrevistasPeriodo.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Previsão e parcelas</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>O que vence ou está programado no período selecionado.</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px' }}>{parcelasPrevistasPeriodo.length}</span>
                </div>
                <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                  {parcelasPrevistasPeriodo.slice(0, 50).map(({ pagamento: p, grupo }) => {
                    const entrada = p.tipo === 'recebimento'
                    const status = statusResumoParcela(p)
                    return (
                      <div key={`previsto-${p.id}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 12, padding: '9px 12px', background: 'var(--bg3)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontWeight: 500, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{p.titulo || grupo.titulo}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: status === 'Pago' ? '#10B981' : status === 'Vencido' ? '#EF4444' : 'var(--text3)' }}>{status}</span>
                          </div>
                          <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <span>Vence {fmtDate(p.vencimento)}</span>
                            {(p.pessoa_nome || p.pessoa_nome_atual || grupo.pessoa_nome) && <span>{p.pessoa_nome || p.pessoa_nome_atual || grupo.pessoa_nome}</span>}
                            {p.num_parcela && p.num_parcelas && <span>{p.num_parcela}/{p.num_parcelas} parcelas</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong style={{ color: entrada ? '#10B981' : '#EF4444', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{entrada ? '+' : '-'}{fmt(Number(p.valor || 0))}</strong>
                          {p.status === 'pendente' && (
                            <button title="Marcar como pago/recebido" onClick={() => handleMarcarPago(p)} style={{ padding: '6px 8px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10B981', cursor: 'pointer' }}><Check size={13} /></button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── SEÇÃO A PAGAR ─────────────────────────────────────── */}
              {filtroTipo !== 'recebimento' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingDown size={16} color="#EF4444" />
                    <span style={{ fontWeight: 500, fontSize: 15, color: '#EF4444' }}>A Pagar</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 999, padding: '2px 8px' }}>{gruposPagar.length} registro{gruposPagar.length === 1 ? '' : 's'}</span>
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
                        key={g.grupo_id || `${g.titulo}-${g.pessoa_nome}-${g.valor_total}`}
                        g={g}
                        onGerenciar={gp => setGerenciarDivida({ parcelas: gp.parcelas, tipo: gp.tipo, historico: gp.historico || [] })}
                        onDetalhes={gp => setDetalhesGrupo(gp)}
                        onEdit={p => { setPrefill(null); setEditPag(p); setModalOpen(true) }}
                        onDelete={id => handleDelete(id)}
                        onDeleteGrupo={g => handleDeleteGrupo(g)}
                        canDeleteFinanceiro={canDeleteFinanceiro}
                        onMarkPaid={p => handleMarcarPago(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* ── SEÇÃO A RECEBER ───────────────────────────────────── */}
              {filtroTipo !== 'pagamento' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingUp size={16} color="#10B981" />
                    <span style={{ fontWeight: 500, fontSize: 15, color: '#10B981' }}>A Receber</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 999, padding: '2px 8px' }}>{gruposReceber.length} registro{gruposReceber.length === 1 ? '' : 's'}</span>
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
                        key={g.grupo_id || `${g.titulo}-${g.pessoa_nome}-${g.valor_total}`}
                        g={g}
                        onGerenciar={gp => setGerenciarDivida({ parcelas: gp.parcelas, tipo: gp.tipo, historico: gp.historico || [] })}
                        onDetalhes={gp => setDetalhesGrupo(gp)}
                        onEdit={p => { setPrefill(null); setEditPag(p); setModalOpen(true) }}
                        onDelete={id => handleDelete(id)}
                        onDeleteGrupo={g => handleDeleteGrupo(g)}
                        canDeleteFinanceiro={canDeleteFinanceiro}
                        onMarkPaid={p => handleMarcarPago(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
              )}

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

      {detalhesGrupo && (
        <FinanceiroDetalhesModal
          grupo={detalhesGrupo}
          onClose={() => setDetalhesGrupo(null)}
          onGerenciar={gp => {
            setDetalhesGrupo(null)
            setGerenciarDivida({ parcelas: gp.parcelas, tipo: gp.tipo, historico: gp.historico || [] })
          }}
          onEdit={p => {
            setDetalhesGrupo(null)
            setPrefill(null)
            setEditPag(p)
            setModalOpen(true)
          }}
          onMarkPaid={p => handleMarcarPago(p)}
        />
      )}

      {gerenciarDivida && (
        <GerenciarDividaModal
          parcelas={gerenciarDivida.parcelas}
          tipo={gerenciarDivida.tipo}
          historico={gerenciarDivida.historico || []}
          onUpdate={load}
          onClose={() => setGerenciarDivida(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
