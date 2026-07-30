// Alguns sandboxes de CI não montam /proc. Node 24 então lança ENOENT em
// process.memoryUsage(), e o pool do Vitest fica aguardando workers que já
// terminaram. O shim só afeta o comando de teste e mantém métricas reais onde
// elas estão disponíveis.
const originalMemoryUsage = process.memoryUsage.bind(process)

function fallbackMemoryUsage() {
  try {
    return originalMemoryUsage()
  } catch {
    return {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    }
  }
}

fallbackMemoryUsage.rss = () => {
  try {
    return originalMemoryUsage.rss()
  } catch {
    return 0
  }
}

process.memoryUsage = fallbackMemoryUsage
