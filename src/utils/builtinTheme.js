export const BUILTIN_THEMES = ['sao', 'classic'];
export const DEFAULT_BUILTIN_THEME = 'sao';

export function normalizeBuiltinTheme(value) {
  return BUILTIN_THEMES.includes(value) ? value : DEFAULT_BUILTIN_THEME;
}

export function isLegacySaoThemeUrl(value) {
  return typeof value === 'string' && /^https:\/\/github\.com\/WAOR\/CFSM-SAO\/tree\/[A-Za-z0-9._-]+\/?$/i.test(value.trim());
}
