import { validatePingNode } from '../utils/agentConfig.js';
import { PING_SLOTS, effectivePingEndpoint, isValidPingOrder, normalizePingOrder } from '../utils/pingSettings.js';
import { clearSiteSettingsCache, loadSiteSettings } from '../utils/settings.js';
import { clearServersListCache } from '../utils/cache.js';
import { scheduleAgentConfigChanged } from '../utils/agentConfigNotify.js';
import { createBadRequestResponse, createSuccessResponse, createNotFoundResponse } from '../utils/errors.js';

const NODE_URL = 'https://www.zstaticcdn.com/api/v1/DescribeAllNodes';
const CACHE_TTL = 5 * 60 * 1000;
const CARRIERS = { telecom: '电信', unicom: '联通', mobile: '移动' };
let cachedCatalog = null;
let catalogRequest = null;

export function normalizePingCatalog(data) {
  if (!Array.isArray(data?.ProvinceNodes) || !Array.isArray(data?.CityNodes)) throw new Error('Invalid node catalog');
  const nodes = [];
  const endpoints = new Set();
  const add = (province, city, carrier, endpoint, level) => {
    if (!Object.hasOwn(CARRIERS, carrier) || typeof province !== 'string' || !province || (city && typeof city !== 'string')) return;
    const validated = validatePingNode(endpoint);
    if (!validated.valid || !validated.value || validated.value === '0' || endpoints.has(validated.value)) return;
    endpoints.add(validated.value);
    nodes.push({ province, city: city || '', carrier, endpoint: validated.value, level, name: `${city || province}${CARRIERS[carrier]}` });
  };
  for (const item of data.ProvinceNodes) {
    for (const [carrier, endpoint] of Object.entries(item?.carriers || {})) add(item.province, '', carrier, endpoint, 'province');
  }
  for (const item of data.CityNodes) if (item) add(item.province, item.city, item.carrier, item.endpoint, 'city');
  if (!nodes.length) throw new Error('Empty node catalog');
  return { nodes, updated_at: typeof data.UpdatedAt === 'string' ? data.UpdatedAt : '' };
}

export async function getPingCatalog({ data }) {
  if (cachedCatalog && Date.now() - cachedCatalog.fetched_at < CACHE_TTL && !data.refresh) return createSuccessResponse({ ...cachedCatalog, stale: false });
  try {
    if (!catalogRequest) {
      catalogRequest = (async () => {
        const response = await fetch(NODE_URL, { headers: { pragma: 'no-cache' }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Node catalog unavailable');
        const catalog = normalizePingCatalog(await response.json());
        cachedCatalog = { ...catalog, fetched_at: Date.now() };
        return cachedCatalog;
      })().finally(() => { catalogRequest = null; });
    }
    return createSuccessResponse({ ...await catalogRequest, stale: false });
  } catch (_) {
    if (cachedCatalog) return createSuccessResponse({ ...cachedCatalog, stale: true });
    return createBadRequestResponse('pingCatalogUnavailable');
  }
}

// Patch just the requested JSON paths, preserving concurrent edits to other settings.
function optionsStatement(db, updates) {
  const pairs = Object.entries(updates);
  const placeholders = pairs.map(() => '?, json(?)').join(', ');
  const initial = pairs.reduce((result, [path, value]) => {
    if (path.startsWith('$.ping_server_overrides.')) result.ping_server_overrides = { [path.split('"')[1]]: value };
    else result[path.slice(2)] = value;
    return result;
  }, {});
  return db.prepare(`INSERT INTO settings (key, value) VALUES ('site_options', ?)
    ON CONFLICT(key) DO UPDATE SET value = json_set(
      CASE WHEN json_valid(value) THEN CASE WHEN json_type(value) = 'object' THEN value ELSE '{}' END ELSE '{}' END,
      ${placeholders})`).bind(JSON.stringify(initial), ...pairs.flatMap(([path, value]) => [path, JSON.stringify(value)]));
}

export async function savePingSettings({ env, data, ctx }) {
  const serverId = data.server_id ?? '';
  if (typeof serverId !== 'string' || (serverId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverId))) return createBadRequestResponse('invalidServerId');
  if (!data.nodes || typeof data.nodes !== 'object' || Array.isArray(data.nodes)) return createBadRequestResponse('invalidPingNodeFormat');
  if (!(serverId && data.order === null) && !isValidPingOrder(data.order)) return createBadRequestResponse('invalidPingDisplayOrder');
  if (!(serverId && data.count === null) && (!Number.isInteger(data.count) || data.count < 1 || data.count > 8)) return createBadRequestResponse('invalidPingDisplayCount');
  if (data.names !== undefined && (!data.names || typeof data.names !== 'object' || Array.isArray(data.names))) return createBadRequestResponse('invalidPingNodeName');
  const values = {};
  const names = {};
  for (const slot of PING_SLOTS) {
    if (!Object.hasOwn(data.nodes, slot.field)) return createBadRequestResponse('invalidPingNodeFormat');
    const raw = data.nodes[slot.field];
    if (raw !== null && typeof raw !== 'string' && raw !== 0) return createBadRequestResponse('invalidPingNodeFormat');
    const validated = validatePingNode(raw);
    if (!validated.valid) return createBadRequestResponse('invalidPingNodeFormat');
    values[slot.field] = serverId && (raw === null || raw === '') ? null : raw === '0' || raw === 0 ? '0' : validated.value;
    const name = data.names?.[slot.key] ?? '';
    if (typeof name !== 'string' || name.trim().length > 60) return createBadRequestResponse('invalidPingNodeName');
    names[slot.key] = name.trim();
  }
  let statements;
  let nodesChanged = false;
  if (serverId) {
    const server = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(serverId).first();
    if (!server) return createNotFoundResponse('Server not found');
    nodesChanged = PING_SLOTS.some(slot => String(server[slot.field] ?? '') !== String(values[slot.field] ?? ''));
    const settings = await loadSiteSettings(env.DB, { forceRefresh: true });
    const endpoints = Object.fromEntries(PING_SLOTS.map(slot => [slot.key, effectivePingEndpoint(values, settings, slot)]));
    const override = { order: data.order === null ? null : normalizePingOrder(data.order), count: data.count, names, endpoints };
    statements = [
      env.DB.prepare(`UPDATE servers SET ${PING_SLOTS.map(slot => `${slot.field} = ?`).join(', ')} WHERE id = ?`).bind(...PING_SLOTS.map(slot => values[slot.field]), serverId),
      optionsStatement(env.DB, { [`$.ping_server_overrides."${serverId}"`]: override })
    ];
  } else {
    const previous = await loadSiteSettings(env.DB, { forceRefresh: true });
    nodesChanged = PING_SLOTS.some(slot => String(previous[slot.field] ?? '') !== String(values[slot.field] ?? ''));
    const updates = { ...values, ping_display_order: normalizePingOrder(data.order), ping_display_count: data.count };
    for (const slot of PING_SLOTS) updates[slot.nameField] = names[slot.key] || slot.label;
    statements = [optionsStatement(env.DB, Object.fromEntries(Object.entries(updates).map(([key, value]) => [`$.${key}`, value])))];
  }
  await env.DB.batch(statements);
  clearSiteSettingsCache();
  clearServersListCache();
  if (nodesChanged && serverId) scheduleAgentConfigChanged(env, ctx, serverId);
  else if (nodesChanged) {
    const { results } = await env.DB.prepare('SELECT id FROM servers').all();
    for (const server of results || []) scheduleAgentConfigChanged(env, ctx, server.id);
  }
  return createSuccessResponse({ success: true, message: 'updateSuccess' });
}
