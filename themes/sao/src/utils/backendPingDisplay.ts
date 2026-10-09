import { CARRIER_KEYS, type CarrierKey, type CarrierNames } from '@/types/cfsm';

export interface BackendPingDisplay {
  order: CarrierKey[];
  count: number;
  enabled?: CarrierKey[];
  names?: Partial<CarrierNames>;
}

const isKey = (value: unknown): value is CarrierKey => typeof value === 'string' && CARRIER_KEYS.includes(value as CarrierKey);

export function normalizeBackendPingDisplay(value: unknown): BackendPingDisplay | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.order === undefined && raw.count === undefined) return undefined;
  const order = [...new Set([...(Array.isArray(raw.order) ? raw.order.filter(isKey) : []), ...CARRIER_KEYS])];
  const count = Number(raw.count);
  const names: Partial<CarrierNames> = {};
  if (raw.names && typeof raw.names === 'object') {
    for (const key of CARRIER_KEYS) {
      const name = (raw.names as Record<string, unknown>)[key];
      if (typeof name === 'string' && name.trim()) names[key] = name.trim();
    }
  }
  return {
    order,
    count: Number.isInteger(count) && count >= 1 && count <= CARRIER_KEYS.length ? count : 3,
    ...(Array.isArray(raw.enabled) ? { enabled: [...new Set(raw.enabled.filter(isKey))] } : {}),
    ...(Object.keys(names).length ? { names } : {}),
  };
}

export function backendPingTaskIds(display: BackendPingDisplay): number[] {
  return display.order.filter(key => !display.enabled || display.enabled.includes(key)).slice(0, display.count).map(key => CARRIER_KEYS.indexOf(key) + 1);
}
