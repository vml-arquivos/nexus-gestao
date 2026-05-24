/*
 * Logger simples que delega a console com formatação básica. Pode ser
 * expandido para usar Pino, Winston ou outra biblioteca. Por enquanto
 * centraliza logs para permitir futuramente persistir ou formatar.
 */
export const logger = {
  info: (...args: unknown[]) => console.info('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  debug: (...args: unknown[]) => console.debug('[DEBUG]', ...args),
}

export default logger