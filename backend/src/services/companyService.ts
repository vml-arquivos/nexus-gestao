import * as CompanyRepository from '../repositories/companyRepository'

export class CompanyService {
  static async listCompanies(orgId: string) {
    return CompanyRepository.list(orgId)
  }

  static async createCompany(orgId: string, data: any) {
    return CompanyRepository.create(orgId, data)
  }

  static async updateCompany(orgId: string, id: string, data: any) {
    return CompanyRepository.update(orgId, id, data)
  }

  static async deleteCompany(orgId: string, id: string) {
    return CompanyRepository.remove(orgId, id)
  }
}

export default CompanyService