export const PING_KEYS = ['ct', 'cu', 'cm', 'bd', 'node_1', 'node_2', 'node_3', 'node_4'] as const
export type PingKey = typeof PING_KEYS[number]

export interface BackendPingDisplay {
  order: PingKey[]
  count: number
  enabled?: PingKey[]
  names?: Partial<Record<PingKey, string>>
}

function validKeys(value: unknown): PingKey[] {
  return Array.isArray(value)
    ? value.filter((key): key is PingKey => PING_KEYS.includes(key as PingKey))
    : []
}

/** Normalize at the API boundary; display order never changes metric slot ids. */
export function normalizeBackendPingDisplay(value: unknown, fallback?: BackendPingDisplay): BackendPingDisplay {
  const raw = value && typeof value === 'object' ? value as Partial<BackendPingDisplay> : {}
  const count = Number(raw.count ?? fallback?.count ?? 3)
  const names: Partial<Record<PingKey, string>> = { ...fallback?.names }
  for (const key of PING_KEYS) {
    const name = raw.names?.[key]
    if (typeof name === 'string' && name.trim())
      names[key] = name.trim()
  }
  return {
    order: [...new Set([...validKeys(raw.order ?? fallback?.order), ...PING_KEYS])],
    count: Number.isInteger(count) && count >= 1 && count <= 8 ? count : fallback?.count ?? 3,
    enabled: Array.isArray(raw.enabled) ? [...new Set(validKeys(raw.enabled))] : fallback?.enabled,
    names,
  }
}

export function selectBackendPingKeys(display: BackendPingDisplay | undefined, available: string[]): PingKey[] {
  const normalized = normalizeBackendPingDisplay(display)
  const enabled = new Set(normalized.enabled ?? available)
  return normalized.order.filter(key => enabled.has(key)).slice(0, normalized.count)
}
