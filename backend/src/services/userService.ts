import { Request } from 'express'
import bcrypt from 'bcryptjs'
import { UserRepository } from '../repositories/userRepository'

/**
 * Service layer para gerenciamento de usuários.
 * Fornece métodos para listar e criar usuários, aplicando regras de negócio
 * como permissões e validações.
 */
export class UserService {
  /**
   * Lista usuários da organização do usuário autenticado.
   */
  static async listUsers(req: Request) {
    const { orgId } = req.user!
    return UserRepository.list(orgId)
  }

  /**
   * Cria um novo usuário na organização.
   * Apenas gestores e sub-gestores podem criar usuários.
   * Sub-gestores não podem criar outros sub-gestores.
   *
   * @param req Request para extrair contexto do usuário autenticado
   * @param nome Nome do novo usuário
   * @param email E-mail do novo usuário
   * @param role Papel do novo usuário (sub_gestor ou membro)
   * @param senha Senha provisória opcional. Se não fornecida, gera aleatória.
   */
  static async createUser(
    req: Request,
    nome: string,
    email: string,
    role: 'gestor' | 'sub_gestor' | 'membro',
    senha?: string,
  ) {
    const { orgId, userId, role: currentRole } = req.user!
    // Somente gestor ou sub-gestor podem criar usuários
    if (currentRole !== 'gestor' && currentRole !== 'sub_gestor') {
      throw new Error('Sem permissão para criar usuários')
    }
    // Sub-gestor não pode criar outro sub-gestor ou gestor
    if (currentRole === 'sub_gestor' && (role === 'sub_gestor' || role === 'gestor')) {
      throw new Error('Sub-gestor não pode criar outro sub-gestor ou gestor')
    }

    // Gera senha aleatória se não fornecida
    let plainPassword = senha
    if (!plainPassword) {
      plainPassword = Math.random().toString(36).slice(-8)
    }
    const senha_hash = await bcrypt.hash(plainPassword, 10)
    const user = await UserRepository.create({
      org_id: orgId,
      nome,
      email,
      senha_hash,
      role,
      criado_por: userId,
    })
    return { user, senha: plainPassword }
  }
}