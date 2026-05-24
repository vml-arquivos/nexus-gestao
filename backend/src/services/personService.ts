import * as PersonRepository from '../repositories/personRepository'

export class PersonService {
  static async listPeople(orgId: string, filters: PersonRepository.PersonFilters) {
    return PersonRepository.list(orgId, filters)
  }

  static async createPerson(orgId: string, data: any) {
    return PersonRepository.create(orgId, data)
  }

  static async updatePerson(orgId: string, id: string, data: any) {
    return PersonRepository.update(orgId, id, data)
  }

  static async deletePerson(orgId: string, id: string) {
    return PersonRepository.remove(orgId, id)
  }
}

export default PersonService