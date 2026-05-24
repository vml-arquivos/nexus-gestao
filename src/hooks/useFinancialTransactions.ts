import { useCallback } from 'react'

/**
 * Hook para interagir com transações financeiras (pagamentos e recebimentos).
 * Abstrai chamadas à API e trata headers de autenticação.
 */
export function useFinancialTransactions() {
  // Helper para executar chamadas de API incluindo cookies para autenticação por sessão.
  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erro na requisição')
      }
      return res.json()
    },
    []
  )

  const listPagamentos = useCallback(
    async (params: Record<string, string | number | undefined> = {}) => {
      const queryString = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      const url = `/api/pagamentos${queryString ? `?${queryString}` : ''}`
      const data = await apiFetch(url)
      return data.pagamentos as any[]
    },
    [apiFetch]
  )

  const getResumo = useCallback(async () => {
    const data = await apiFetch('/api/pagamentos/resumo')
    return data.resumo as any
  }, [apiFetch])

  return {
    listPagamentos,
    getResumo,
  }
}