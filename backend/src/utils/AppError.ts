/**
 * Classe de erro customizada para encapsular mensagens amigáveis e
 * códigos de status HTTP. Use esta classe nos services e controllers
 * para disparar erros controlados que o middleware de errorHandler
 * saberá converter em respostas JSON.
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly payload?: unknown

  constructor(message: string, statusCode = 400, payload?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.payload = payload
    // Necessário para extender Error adequadamente em transpile ES5
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export default AppError