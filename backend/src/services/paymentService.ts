import { PaymentRepository, PaymentFilter, PaymentCreateInput, PaymentUpdateInput } from '../repositories/paymentRepository'

/**
 * PaymentService encapsula regras de negócio relacionadas a pagamentos.
 * Ele delega o acesso a dados ao PaymentRepository e lida com validações
 * de alto nível ou comportamentos adicionais (ex.: recorrências).
 */
export const PaymentService = {
  /**
   * Lista pagamentos para uma organização e usuário com filtros opcionais.
   * Recebe orgId e userId para garantir isolamento de dados.
   */
  async listPayments(orgId: string, userId: string, filters: PaymentFilter) {
    return PaymentRepository.list(orgId, userId, filters)
  },
  /**
   * Retorna resumo financeiro de uma organização e usuário.
   */
  async getResumo(orgId: string, userId: string) {
    return PaymentRepository.getResumo(orgId, userId)
  },
  /**
   * Retorna agregações por pessoa para uma organização e usuário.
   */
  async getPorPessoa(orgId: string, userId: string) {
    return PaymentRepository.getPorPessoa(orgId, userId)
  },
  /**
   * Cria um novo pagamento. Para lógicas de recorrência e validação adicional,
   * estas devem ser adicionadas aqui futuramente.
   */
  async createPayment(data: PaymentCreateInput) {
    return PaymentRepository.create(data)
  },
  /**
   * Atualiza um pagamento existente. Necessita orgId e userId para filtrar.
   */
  async updatePayment(id: string, orgId: string, userId: string, updates: PaymentUpdateInput) {
    return PaymentRepository.update(id, orgId, userId, updates)
  },
  /**
   * Remove um pagamento. Necessita orgId e userId para filtrar.
   */
  async deletePayment(id: string, orgId: string, userId: string) {
    return PaymentRepository.remove(id, orgId, userId)
  },
}