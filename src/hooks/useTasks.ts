import { useEffect, useState, useCallback } from 'react'
import { tarefasApi, type Tarefa } from '../lib/api'

/**
 * Hook para listar e monitorar tarefas da organização. Retorna a lista,
 * um estado de carregamento e uma função para recarregar. Pode receber
 * filtros opcionais (status, prioridade ou responsavel).
 */
export function useTasks(filters?: { status?: string; prioridade?: string; responsavel_id?: string }) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<unknown>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await tarefasApi.list(filters)
      setTarefas(data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return { tarefas, loading, error, reload: fetchTasks }
}

export default useTasks