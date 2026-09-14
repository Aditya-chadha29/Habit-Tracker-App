/** Order is the picker's order. Style themes are explicit choices only — never picked by the OS. */
export const THEME_OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'cybercore', label: 'Cybercore' },
  { id: 'scrapbook', label: 'Scrapbook' },
  { id: 'glass', label: 'Glassmorphism' },
  { id: 'wabi-sabi', label: 'Wabi-sabi' },
] as const

export type ThemePreference = (typeof THEME_OPTIONS)[number]['id']
export type EffectiveTheme = Exclude<ThemePreference, 'system'>

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === 'string' && THEME_OPTIONS.some((o) => o.id === v)
}

/** Browser chrome colour (meta theme-color) per theme — the theme's ground. */
export const GROUND_BY_THEME: Record<EffectiveTheme, string> = {
  dark: '#181716',
  light: '#f3f2f2',
  cybercore: '#07060d',
  scrapbook: '#e6d6ba',
  glass: '#0f1230',
  'wabi-sabi': '#ebe5da',
}

export interface ChartPalette {
  /** Daily score line. */
  raw: string
  /** Rolling average line, weight line — the theme's accent. */
  avg: string
  /** Heatmap cell with no data. */
  noData: string
  /** Single sequential ramp, lowest rate first (five steps). */
  ramp: readonly [string, string, string, string, string]
}

const GOLD_RAMP = ['#4b3208', '#7d5411', '#a06f24', '#c28d41', '#e1ad66'] as const

// Raw JS colour strings for Chart.js and the heatmap — these don't route through the CSS tokens
// in src/index.css, so every theme needs its own set.
export const CHART_PALETTE: Record<EffectiveTheme, ChartPalette> = {
  dark: { raw: 'rgba(243,242,242,0.3)', avg: '#e1ad66', noData: 'rgba(243,242,242,0.03)', ramp: GOLD_RAMP },
  light: { raw: 'rgba(32,31,29,0.35)', avg: '#b68235', noData: 'rgba(32,31,29,0.04)', ramp: GOLD_RAMP },
  cybercore: {
    raw: 'rgba(230,227,255,0.3)',
    avg: '#3ff0e8',
    noData: 'rgba(230,227,255,0.04)',
    ramp: ['#0b3a3a', '#11605f', '#1a8f8c', '#2cc2bd', '#3ff0e8'],
  },
  scrapbook: {
    raw: 'rgba(58,47,38,0.35)',
    avg: '#b8452f',
    noData: 'rgba(58,47,38,0.05)',
    ramp: ['#ecd3b0', '#dfb083', '#cf8a5c', '#bf653e', '#a3402a'],
  },
  glass: {
    raw: 'rgba(255,255,255,0.35)',
    avg: '#e7a6ff',
    noData: 'rgba(255,255,255,0.05)',
    ramp: ['#2c2f6e', '#4d4196', '#7b54ba', '#b06cd8', '#e7a6ff'],
  },
  'wabi-sabi': {
    raw: 'rgba(45,42,38,0.32)',
    avg: '#9b6f56',
    noData: 'rgba(45,42,38,0.04)',
    ramp: ['#e2d7c7', '#cfb9a0', '#b99a7e', '#a37d63', '#7e5b46'],
  },
}
