import { PaymentRepository, PaymentFilter, PaymentCreateInput, PaymentUpdateInput } from '../repositories/paymentRepository'

/**
 * PaymentService encapsula regras de negócio relacionadas a pagamentos.
 * Ele delega o acesso a dados ao PaymentRepository e lida com validações
 * de alto nível ou comportamentos adicionais (ex.: recorrências).
 */
export const PaymentService = {
  /**
   * Lista pagamentos para uma organização com filtros opcionais.
   */
  async listPayments(orgId: string, filters: PaymentFilter) {
    return PaymentRepository.list(orgId, filters)
  },
  /**
   * Retorna resumo financeiro de uma organização.
   */
  async getResumo(orgId: string) {
    return PaymentRepository.getResumo(orgId)
  },
  /**
   * Retorna agregações por pessoa.
   */
  async getPorPessoa(orgId: string) {
    return PaymentRepository.getPorPessoa(orgId)
  },
  /**
   * Cria um novo pagamento. Para lógicas de recorrência e validação adicional,
   * estas devem ser adicionadas aqui futuramente.
   */
  async createPayment(data: PaymentCreateInput) {
    return PaymentRepository.create(data)
  },
  /**
   * Atualiza um pagamento existente.
   */
  async updatePayment(id: string, orgId: string, updates: PaymentUpdateInput) {
    return PaymentRepository.update(id, orgId, updates)
  },
  /**
   * Remove um pagamento.
   */
  async deletePayment(id: string, orgId: string) {
    return PaymentRepository.remove(id, orgId)
  },
}