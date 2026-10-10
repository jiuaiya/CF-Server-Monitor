export const BUILTIN_THEMES = ['emerald', 'classic'];
export const DEFAULT_BUILTIN_THEME = 'emerald';

export function normalizeBuiltinTheme(value) {
  // The former bundled SAO choice now uses Emerald as well.
  return BUILTIN_THEMES.includes(value) ? value : DEFAULT_BUILTIN_THEME;
}

export function isLegacyBuiltinThemeUrl(value) {
  return typeof value === 'string' && /^https:\/\/github\.com\/(?:WAOR\/CFSM-SAO|Tokinx\/cf-server-monitor-theme-emerald)\/tree\/[A-Za-z0-9._-]+\/?$/i.test(value.trim());
}
