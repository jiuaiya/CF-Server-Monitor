import assert from 'node:assert/strict';
import test from 'node:test';
import { serveFrontend } from '../src/handlers/frontend.js';
import { normalizeBuiltinTheme } from '../src/utils/builtinTheme.js';
import { clearSiteSettingsCache, loadSiteSettings } from '../src/utils/settings.js';

const html = name => `<!doctype html><html><head><title>${name}</title><meta name="apiBase" content=""></head><body>${name}</body></html>`;
const env = { ASSETS: { fetch: async request => new Response(html(new URL(request.url).pathname === '/emerald.html' ? 'Emerald' : 'Classic')) } };
const settings = { theme_url: '', site_title: 'Monitor' };

test('bundled Emerald is the default homepage while the admin entry always uses Vue', async () => {
  const home = await serveFrontend(new Request('https://monitor.example/'), env, settings);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<body>Emerald<\/body>/);
  const admin = await serveFrontend(new Request('https://monitor.example/admin'), env, settings);
  assert.match(await admin.text(), /<body>Classic<\/body>/);
  const classic = await serveFrontend(new Request('https://monitor.example/'), env, { ...settings, builtin_theme: 'classic' });
  assert.match(await classic.text(), /<body>Classic<\/body>/);
  const previous = await serveFrontend(new Request('https://monitor.example/'), env, { ...settings, builtin_theme: 'sao' });
  assert.match(await previous.text(), /<body>Emerald<\/body>/);
});

test('explicit remote themes still take precedence over the built-in default', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(html('Remote'));
  try {
    const response = await serveFrontend(new Request('https://monitor.example/'), env, { ...settings, theme_url: 'https://github.com/example/theme/tree/main' });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<body>Remote<\/body>/);
  } finally { globalThis.fetch = original; }
});

test('only supported bundled theme ids are selected', () => {
  assert.equal(normalizeBuiltinTheme('classic'), 'classic');
  for (const value of [undefined, '', null, 'sao', 'emerald', '../../admin', 'https://example.com']) assert.equal(normalizeBuiltinTheme(value), 'emerald');
});

test('existing remote SAO/Emerald settings adopt the bundle while a later explicit external choice is preserved', async () => {
  for (const themeUrl of ['https://github.com/Tokinx/cf-server-monitor-theme-emerald/tree/dist', 'https://github.com/WAOR/CFSM-SAO/tree/dist']) {
    for (const builtinTheme of [undefined, 'sao', 'emerald', 'classic']) {
      const explicit = builtinTheme === 'emerald' || builtinTheme === 'classic';
      const options = { jwt_secret: 'a'.repeat(32), theme_url: themeUrl, ...(builtinTheme ? { builtin_theme: builtinTheme } : {}) };
      const db = { prepare: sql => ({ first: async () => sql.includes("key = 'site_options'") ? { value: JSON.stringify(options) } : null, bind() { return this; }, all: async () => ({ results: [] }) }) };
      clearSiteSettingsCache();
      const result = await loadSiteSettings(db, { forceRefresh: true });
      assert.equal(result.builtin_theme, builtinTheme === 'classic' ? 'classic' : 'emerald');
      assert.equal(result.theme_url, explicit ? options.theme_url : '');
    }
  }
  clearSiteSettingsCache();
});
