import { describe, expect, it, vi } from 'vitest'
import { SingleFlightTtlCache } from '../src/lib/singleFlightTtlCache'

describe('SingleFlightTtlCache', () => {
  it('compartilha uma única carga entre chamadas concorrentes', async () => {
    let resolveLoad!: (value: string) => void
    const loader = vi.fn(() => new Promise<string>((resolve) => {
      resolveLoad = resolve
    }))
    const cache = new SingleFlightTtlCache<string, string>(1_000, 4)

    const first = cache.get('org-1', loader)
    const second = cache.get('org-1', loader)
    const third = cache.get('org-1', loader)
    resolveLoad('tarefas')

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      'tarefas',
      'tarefas',
      'tarefas',
    ])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('remove uma carga com erro e permite nova tentativa', async () => {
    const cache = new SingleFlightTtlCache<string, string>(1_000, 4)
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('falha temporária'))
      .mockResolvedValueOnce('recuperado')

    await expect(cache.get('org-1', loader)).rejects.toThrow('falha temporária')
    await expect(cache.get('org-1', loader)).resolves.toBe('recuperado')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('limita entradas antigas para não reter organizações indefinidamente', async () => {
    const cache = new SingleFlightTtlCache<string, string>(60_000, 2)

    await cache.get('org-1', async () => '1')
    await cache.get('org-2', async () => '2')
    await cache.get('org-3', async () => '3')

    expect(cache.size()).toBe(2)
  })
})
