import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/AppError'

/**
 * Middleware global de tratamento de erros. Deve ser registrado após
 * todas as rotas. Intercepta exceções lançadas em handlers e converte
 * em respostas JSON consistentes. Usa AppError para status customizados.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  // Se o erro for um AppError, responde com status e mensagem definidos
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, ...(err.payload ?? {}) })
    return
  }
  // Erro inesperado: registra e devolve 500
  console.error('[ERROR]', err)
  res.status(500).json({ error: 'Erro interno do servidor' })
}