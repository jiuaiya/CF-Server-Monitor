// Stable keys identify metric slots. Display order must never reassign these slots.
export const PING_SLOTS = Object.freeze([
  { key: 'ct', field: 'custom_ct', nameField: 'custom_ct_name', label: '电信' },
  { key: 'cu', field: 'custom_cu', nameField: 'custom_cu_name', label: '联通' },
  { key: 'cm', field: 'custom_cm', nameField: 'custom_cm_name', label: '移动' },
  { key: 'bd', field: 'custom_bd', nameField: 'custom_bd_name', label: 'BGP' },
  ...Array.from({ length: 4 }, (_, i) => ({ key: `node_${i + 1}`, field: `node_${i + 1}`, nameField: `node_${i + 1}_name`, label: `Node ${i + 1}` }))
]);
export const PING_KEYS = Object.freeze(PING_SLOTS.map(slot => slot.key));

export function isValidPingOrder(value) {
  return Array.isArray(value) && value.length <= 8 && new Set(value).size === value.length && value.every(key => PING_KEYS.includes(key));
}

export function normalizePingOrder(value) {
  const order = Array.isArray(value) ? value.filter(key => PING_KEYS.includes(key)) : [];
  return [...new Set([...order, ...PING_KEYS])];
}

export function normalizePingCount(value, fallback = 3) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 8 ? count : fallback;
}

export function effectivePingEndpoint(server, settings, slot) {
  const own = server?.[slot.field];
  if (own === '0' || own === 0) return '';
  const endpoint = own === null || own === undefined || own === '' ? settings?.[slot.field] : own;
  return endpoint === '0' || endpoint === 0 ? '' : String(endpoint || '').trim();
}

export function resolvePingDisplay(server = {}, settings = {}) {
  const overrides = settings.ping_server_overrides;
  const override = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides[server.id] || {} : {};
  const names = {};
  const enabled = [];
  for (const slot of PING_SLOTS) {
    const endpoint = effectivePingEndpoint(server, settings, slot);
    if (endpoint) enabled.push(slot.key);
    // A saved alias belongs to the endpoint it was configured for.
    const alias = override.endpoints?.[slot.key] === endpoint ? override.names?.[slot.key] : '';
    names[slot.key] = String(alias || settings[slot.nameField] || slot.label);
  }
  return {
    order: normalizePingOrder(override.order ?? settings.ping_display_order),
    count: normalizePingCount(override.count, normalizePingCount(settings.ping_display_count)),
    names,
    enabled
  };
}
