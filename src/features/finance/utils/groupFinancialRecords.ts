import type { Pagamento } from '../../../lib/api'

/**
 * Interface de um grupo financeiro consolidado por pessoa. Cada grupo
 * contém todos os lançamentos daquela pessoa, além de totais
 * consolidados para receber, pagar, pendentes, pagos e saldo. Também
 * expõe a próxima data de vencimento e se há pendências vencidas.
 */
export interface FinancialPersonGroup {
  /** Identificador da pessoa, se existir */
  pessoaId?: string
  /** Nome da pessoa associada aos lançamentos */
  pessoaNome: string
  /** Lista de todos os lançamentos financeiros dessa pessoa */
  items: Pagamento[]
  /** Total de valores a receber (recebimentos pendentes ou pagos) */
  aReceber: number
  /** Total de valores a pagar (pagamentos pendentes ou pagos) */
  aPagar: number
  /** Total de valores em aberto (status pendente) */
  pendentes: number
  /** Total de valores já pagos */
  pagos: number
  /** Saldo geral (aReceber - aPagar) */
  saldo: number
  /** Próximo vencimento pendente, se existir */
  proximoVencimento?: string
  /** Indica se há algum lançamento pendente vencido */
  vencido: boolean
}

/**
 * Agrupa uma lista de lançamentos financeiros por pessoa, calculando
 * totais e status para cada grupo. O agrupamento utiliza primeiro
 * o campo `pessoa_id`; se não existir, usa o nome livre (`pessoa_nome`).
 * 
 * @param records Lista de lançamentos financeiros brutos
 * @returns Array de grupos financeiros por pessoa
 */
export function groupFinancialRecords(records: Pagamento[]): FinancialPersonGroup[] {
  const map = new Map<string, FinancialPersonGroup>()
  const hojeIso = new Date().toISOString().slice(0, 10)
  const hoje = new Date(`${hojeIso}T00:00:00`)

  for (const rec of records) {
    // chave de agrupamento: usa pessoa_id quando existente; senão usa o nome
    const key = rec.pessoa_id || (rec.pessoa_nome ? `nome:${rec.pessoa_nome}` : 'sem')
    const nome = rec.pessoa_nome || rec.pessoa_nome_atual || 'Sem pessoa'
    let group = map.get(key)
    if (!group) {
      group = {
        pessoaId: rec.pessoa_id,
        pessoaNome: nome,
        items: [],
        aReceber: 0,
        aPagar: 0,
        pendentes: 0,
        pagos: 0,
        saldo: 0,
        proximoVencimento: undefined,
        vencido: false,
      }
      map.set(key, group)
    }
    group.items.push(rec)
    const valor = Number(rec.valor || 0)
    // soma totais por tipo, desconsiderando cancelados
    if (rec.status !== 'cancelado') {
      if (rec.tipo === 'recebimento') group.aReceber += valor
      if (rec.tipo === 'pagamento') group.aPagar += valor
    }
    // soma pendentes e pagos
    if (rec.status === 'pendente') group.pendentes += valor
    if (rec.status === 'pago') group.pagos += valor
  }

  const groups: FinancialPersonGroup[] = []
  map.forEach(group => {
    // calcula saldo
    group.saldo = group.aReceber - group.aPagar
    // ordena itens por vencimento ou data de criação
    group.items.sort((a, b) => {
      const da = (a.vencimento || a.created_at)?.slice(0, 10) || ''
      const db = (b.vencimento || b.created_at)?.slice(0, 10) || ''
      return da.localeCompare(db)
    })
    // calcula próxima parcela pendente
    const pendentes = group.items.filter(i => i.status === 'pendente' && i.vencimento)
    pendentes.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))
    if (pendentes.length > 0) {
      group.proximoVencimento = pendentes[0].vencimento
      const d = pendentes[0].vencimento!
      if (new Date(`${d.slice(0, 10)}T00:00:00`) < hoje) group.vencido = true
    }
    groups.push(group)
  })
  // Ordena grupos: vencidos primeiro, depois por data de vencimento
  groups.sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1
    return (a.proximoVencimento || '').localeCompare(b.proximoVencimento || '')
  })
  return groups
}