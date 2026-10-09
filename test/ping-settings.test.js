import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { PING_SLOTS, PING_KEYS, resolvePingDisplay } from '../src/utils/pingSettings.js';
import { buildAgentConfig, serializeAgentConfig } from '../src/utils/agentConfig.js';
import { clearSiteSettingsCache, loadSiteSettings } from '../src/utils/settings.js';
import { getPingCatalog, normalizePingCatalog, savePingSettings } from '../src/handlers/pingNodes.js';
import { handleAdminAPI } from '../src/handlers/admin.js';
import { catalogEndpoint, groupPingCatalog } from '../src/frontend/utils/pingCatalog.js';

const serverId = '00000000-0000-4000-8000-000000000001';
const nodes = Object.fromEntries(PING_SLOTS.map(slot => [slot.field, slot.key === 'ct' ? 'example.com:80' : '']));
const names = Object.fromEntries(PING_SLOTS.map(slot => [slot.key, slot.label]));

test('province IP family switches preserve ports and leave city and other hostnames unchanged', () => {
  const node = { level: 'province', endpoint: 'he-ct-v4.ip.zstaticcdn.com:80' };
  assert.equal(catalogEndpoint(node, 'ipv6'), 'he-ct-v6.ip.zstaticcdn.com:80');
  assert.equal(catalogEndpoint(node, 'dual'), 'he-ct-dualstack.ip.zstaticcdn.com:80');
  assert.equal(catalogEndpoint(node, 'ipv4'), node.endpoint);
  assert.equal(catalogEndpoint({ ...node, level: 'city' }, 'ipv6'), node.endpoint);
  assert.equal(catalogEndpoint({ ...node, endpoint: 'custom-v4.example.com:443' }, 'ipv6'), 'custom-v4.example.com:443');
  assert.equal(catalogEndpoint(node, 'invalid'), node.endpoint);
});

test('catalog groups carriers by region, searches switched addresses, and separates same-named cities', () => {
  const catalog = normalizePingCatalog({ ProvinceNodes: [{ province: '河北', carriers: {
    mobile: 'he-cm-v4.ip.zstaticcdn.com:80', telecom: 'he-ct-v4.ip.zstaticcdn.com:80', unicom: 'he-cu-v4.ip.zstaticcdn.com:80'
  } }], CityNodes: [
    { province: '河北', city: '同名市', carrier: 'mobile', endpoint: 'he-city-v4.ip.zstaticcdn.com:443' },
    { province: '山西', city: '同名市', carrier: 'unicom', endpoint: 'sx-city-v4.ip.zstaticcdn.com:443' }
  ] }).nodes;
  const groups = groupPingCatalog(catalog);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].nodes.map(node => node.carrier), ['telecom', 'unicom', 'mobile']);
  assert.equal(groupPingCatalog(catalog, { family: 'ipv6', query: 'he-ct-v6' })[0].nodes[0].endpoint, 'he-ct-v6.ip.zstaticcdn.com:80');
  assert.equal(groupPingCatalog(catalog, { query: ' 河北 ' })[0].nodes.length, 3);
  assert.equal(groupPingCatalog(catalog, { query: 'missing' }).length, 0);
  assert.equal(groupPingCatalog(catalog, { level: 'city' }).length, 2);
  assert.equal(groupPingCatalog(catalog, { level: 'city', family: 'dual', province: '山西' })[0].nodes[0].endpoint, 'sx-city-v4.ip.zstaticcdn.com:443');
});

test('catalog normalizes province and city nodes, preserves ports and tolerates invalid entries', () => {
  const catalog = normalizePingCatalog({ UpdatedAt: '2026-09-15T12:27:24Z', ProvinceNodes: [
    { province: '广东', carriers: { telecom: 'gd-ct.example.com:80', mobile: 'invalid://host', unicom: 'gd-cu.example.com:80' } }
  ], CityNodes: [{ province: '广东', city: '深圳', carrier: 'telecom', endpoint: 'gd-sz.example.com:443' }, null] });
  assert.deepEqual(catalog.nodes.map(node => [node.name, node.endpoint, node.level]), [
    ['广东电信', 'gd-ct.example.com:80', 'province'], ['广东联通', 'gd-cu.example.com:80', 'province'], ['深圳电信', 'gd-sz.example.com:443', 'city']
  ]);
  assert.throws(() => normalizePingCatalog({ ProvinceNodes: [], CityNodes: [] }));
});

test('catalog caches successful responses and retains them on a failed refresh', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ ProvinceNodes: [{ province: '上海', carriers: { telecom: 'sh.example.com:80' } }], CityNodes: [] });
  };
  try {
    const first = await (await getPingCatalog({ data: { refresh: true } })).json();
    const second = await (await getPingCatalog({ data: {} })).json();
    assert.equal(calls, 1);
    assert.deepEqual(first.nodes, second.nodes);
    globalThis.fetch = async () => { throw new Error('offline'); };
    const stale = await (await getPingCatalog({ data: { refresh: true } })).json();
    assert.equal(stale.stale, true);
    assert.deepEqual(stale.nodes, first.nodes);
  } finally { globalThis.fetch = originalFetch; }
});

test('Ping actions require authentication and reject invalid configuration before any write', async () => {
  const response = await handleAdminAPI(new Request('https://example.com/admin/api', { method: 'POST', body: JSON.stringify({ action: 'get_ping_nodes' }) }), {}, {});
  assert.equal(response.status, 401);
  const env = { DB: { prepare() { throw new Error('Invalid input must not access D1'); } } };
  for (const invalid of [
    { order: ['ct', 'ct'] }, { order: ['node_9'] }, { count: 9 }, { count: 0 },
    { names: { ct: 'a'.repeat(61) } }, { nodes: { ...nodes, node_1: 'host:70000' } },
    { nodes: { custom_ct: 'example.com' } }, { server_id: '../../server' }, { server_id: 0 }, { server_id: false }, { names: [] }
  ]) {
    assert.equal((await savePingSettings({ env, data: { nodes, names, order: PING_KEYS, count: 3, ...invalid } })).status, 400);
  }
});

test('D1 saves global and per-server settings atomically without remapping Agent slots', async () => {
  const miniflare = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("OK") } }', d1Databases: { DB: 'ping-settings-test' } });
  clearSiteSettingsCache();
  try {
    const db = await miniflare.getD1Database('DB');
    await db.prepare('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)').run();
    await db.prepare(`CREATE TABLE servers (id TEXT PRIMARY KEY, ${PING_SLOTS.map(slot => `${slot.field} TEXT`).join(', ')})`).run();
    await db.prepare('INSERT INTO servers (id) VALUES (?)').bind(serverId).run();
    await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('site_options', JSON.stringify({ username: 'admin', jwt_secret: 'x'.repeat(64), ...nodes })).run();
    const notifications = [];
    const env = { DB: db, METRICS_BROADCASTER: {
      idFromName: () => 'global',
      get: () => ({ fetch: async (_, options) => { notifications.push(JSON.parse(options.body)); return new Response('OK'); } })
    } };
    const data = { nodes, names, order: ['node_1', 'ct', 'cu', 'cm', 'bd', 'node_2', 'node_3', 'node_4'], count: 2 };
    assert.equal((await savePingSettings({ env, data })).status, 200);
    const global = await loadSiteSettings(db, { forceRefresh: true });
    assert.equal(global.username, 'admin');
    assert.deepEqual(global.ping_display_order, data.order);
    assert.equal(global.custom_ct, 'example.com:80');
    const serverNodes = { ...nodes, custom_ct: null, custom_cu: '0', node_1: '[2001:db8::1]:443' };
    const serverData = { server_id: serverId, nodes: serverNodes, names: { ...names, node_1: 'My IPv6' }, order: ['node_1', ...PING_KEYS.filter(key => key !== 'node_1')], count: null };
    assert.equal((await savePingSettings({ env, data: serverData })).status, 200);
    const server = await db.prepare('SELECT * FROM servers WHERE id = ?').bind(serverId).first();
    const settings = await loadSiteSettings(db, { forceRefresh: true });
    const display = resolvePingDisplay(server, settings);
    assert.deepEqual(display.enabled, ['ct', 'node_1']);
    assert.equal(display.names.node_1, 'My IPv6');
    assert.equal(display.count, 2);
    const descriptor = serializeAgentConfig(buildAgentConfig(server, settings));
    const notificationCount = notifications.length;
    assert.equal(buildAgentConfig(server, settings).custom_ct, 'example.com:80');
    assert.equal(buildAgentConfig(server, settings).custom_cu, '');
    assert.equal(buildAgentConfig(server, settings).node_1, '[2001:db8::1]:443');
    // An order-only edit must not change any Agent parameter or field assignment.
    assert.equal((await savePingSettings({ env, data: { ...serverData, order: PING_KEYS } })).status, 200);
    assert.equal(serializeAgentConfig(buildAgentConfig(await db.prepare('SELECT * FROM servers WHERE id = ?').bind(serverId).first(), await loadSiteSettings(db, true))), descriptor);
    assert.equal(notifications.length, notificationCount);
    // A global edit preserves machine overrides and unrelated site fields.
    await savePingSettings({ env, data: { ...data, count: 4 } });
    const updated = await loadSiteSettings(db, true);
    assert.equal(updated.ping_server_overrides[serverId].names.node_1, 'My IPv6');
    assert.equal(resolvePingDisplay(server, updated).count, 4);
    assert.equal(resolvePingDisplay({ ...server, node_1: 'different.example.com:443' }, updated).names.node_1, 'Node 1');
    // Restore inheritance independently from monitoring node choices.
    await savePingSettings({ env, data: { ...serverData, order: null, count: null } });
    assert.deepEqual(resolvePingDisplay(server, await loadSiteSettings(db, true)).order, data.order);
  } finally { clearSiteSettingsCache(); await miniflare.dispose(); }
});

test('home cards honor server priority, keep a timed-out priority node, and include extra slots', async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => 'zh' };
  const vite = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { useServerCardData } = await vite.ssrLoadModule('/src/frontend/composables/useServerCardData.js');
    const card = useServerCardData({ server: {
      ping_ct: 20, ping_node_1: null, loss_node_1: 100,
      ping_display: { order: ['node_1', 'ct'], count: 1, names: { node_1: 'Priority', ct: 'Telecom' }, enabled: ['ct', 'node_1'] },
      ping: [{ ts: Date.now() - 1000, node_1: 5, ct: 20 }]
    }, sysConfig: {} });
    assert.deepEqual(card.pingList.value.map(node => node.key), ['node_1', 'ct']);
    assert.equal(card.pingDisplayCount.value, 1);
    assert.equal(card.threeNetDetails.value[0].label, 'Priority');
    assert.equal(card.threeNetDetails.value[0].latestPing, null);
    assert.equal(card.isPingValid(0), true);
  } finally { globalThis.localStorage = originalStorage; await vite.close(); }
});
