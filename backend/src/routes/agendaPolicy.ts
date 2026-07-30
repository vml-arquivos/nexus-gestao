// Função pura, isolada das rotas e do pool PostgreSQL para permitir teste sem
// abrir handles de infraestrutura.
export function shouldAutoSyncAgenda(syncParam: unknown): boolean {
  return syncParam === 'true'
}
