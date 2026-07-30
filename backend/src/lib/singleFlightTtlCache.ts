type CacheEntry<V> = {
  value?: V
  expiresAt: number
  lastAccessAt: number
  inFlight?: Promise<V>
}

/**
 * Cache curto e limitado que também reúne chamadas simultâneas para a mesma
 * chave. Diferente de um Map com TTL apenas no valor, entradas expiradas são
 * removidas e uma rajada de requisições compartilha a mesma consulta em curso.
 */
export class SingleFlightTtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 32,
  ) {}

  async get(key: K, loader: () => Promise<V>): Promise<V> {
    const now = Date.now()
    this.prune(now)

    const current = this.entries.get(key)
    if (current?.value !== undefined && current.expiresAt > now) {
      current.lastAccessAt = now
      return current.value
    }
    if (current?.inFlight) {
      current.lastAccessAt = now
      return current.inFlight
    }

    const entry: CacheEntry<V> = {
      expiresAt: 0,
      lastAccessAt: now,
    }
    const inFlight = loader()
      .then((value) => {
        entry.value = value
        entry.expiresAt = Date.now() + this.ttlMs
        entry.lastAccessAt = Date.now()
        entry.inFlight = undefined
        this.enforceLimit()
        return value
      })
      .catch((error) => {
        if (this.entries.get(key) === entry) this.entries.delete(key)
        throw error
      })

    entry.inFlight = inFlight
    this.entries.set(key, entry)
    this.enforceLimit()
    return inFlight
  }

  delete(key: K) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }

  size() {
    return this.entries.size
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (!entry.inFlight && entry.expiresAt <= now) this.entries.delete(key)
    }
  }

  private enforceLimit() {
    if (this.entries.size <= this.maxEntries) return
    const removable = [...this.entries.entries()]
      .filter(([, entry]) => !entry.inFlight)
      .sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt)

    for (const [key] of removable) {
      if (this.entries.size <= this.maxEntries) break
      this.entries.delete(key)
    }
  }
}
