import { useState, useEffect, useCallback } from 'react'
import { equipeApi, type Pessoa } from '../lib/api'

/**
 * Hook para listar pessoas (funcionários, clientes etc.). Permite filtrar
 * por tipo. Usa a API de equipe para buscar pessoas.
 */
export function usePeople(tipo?: string) {
  const [people, setPeople] = useState<Pessoa[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const fetchPeople = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await equipeApi.pessoas(tipo)
      setPeople(data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [tipo])

  useEffect(() => {
    fetchPeople()
  }, [fetchPeople])

  return { people, loading, error, reload: fetchPeople }
}

export default usePeople