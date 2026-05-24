import { useState, useEffect, useCallback } from 'react'
import { equipeApi, type Pessoa } from '../lib/api'

/**
 * Hook para listar pessoas ou empresas (dependendo do backend). O projeto
 * atual não define explicitamente uma rota de empresas, então este hook
 * chama `equipeApi.pessoas()` como placeholder. Pode ser estendido para
 * integrar `/empresas` quando estiver disponível.
 */
export function useCompanies() {
  const [companies, setCompanies] = useState<Pessoa[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await equipeApi.pessoas()
      setCompanies(data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  return { companies, loading, error, reload: fetchCompanies }
}

export default useCompanies