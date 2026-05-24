import * as TaskRepository from '../repositories/taskRepository'

/**
 * Serviço de tarefas: delega operações ao repositório e aplica regras
 * adicionais de negócios quando necessário. Recebe filtros tipados
 * e retorna dados no formato esperado pelo controller.
 */
export class TaskService {
  static async listTasks(orgId: string, userId: string, role: string, filters: TaskRepository.TaskFilters) {
    return TaskRepository.list(orgId, userId, role, filters)
  }

  static async getStats(orgId: string, userId: string, role: string) {
    return TaskRepository.getStats(orgId, userId, role)
  }

  static async createTask(orgId: string, userId: string, data: any) {
    return TaskRepository.create(orgId, userId, data)
  }

  static async updateTask(orgId: string, userId: string, role: string, id: string, data: any) {
    return TaskRepository.update(orgId, userId, role, id, data)
  }

  static async deleteTask(orgId: string, id: string) {
    return TaskRepository.remove(orgId, id)
  }
}

export default TaskService