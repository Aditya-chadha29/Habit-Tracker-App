/** Order is the toggle's cycle order. */
export const THEME_OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const

export type ThemePreference = (typeof THEME_OPTIONS)[number]['id']
export type EffectiveTheme = Exclude<ThemePreference, 'system'>

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === 'string' && THEME_OPTIONS.some((o) => o.id === v)
}

/** Browser chrome colour (meta theme-color) per theme — the theme's ground. */
export const GROUND_BY_THEME: Record<EffectiveTheme, string> = {
  dark: '#0e131c',
  light: '#f2f5f9',
}

export interface ChartPalette {
  /** Daily score line. */
  raw: string
  /** Rolling average line, weight line — the accent. */
  avg: string
  /** Heatmap cell with no data. */
  noData: string
  /** Single sequential ramp, lowest rate first (five steps). */
  ramp: readonly [string, string, string, string, string]
}

// Sequential blue ramps with a deliberately wide lightness spread: the previous five steps were
// hard to tell apart on the weekday heatmap, which is the one place five shades have to be read
// against each other. Dark theme climbs from deep navy to bright blue; light theme climbs the
// other way, pale to deep, so "more" always reads as "stronger" against its own background.
const RAMP_DARK = ['#17293d', '#1d4568', '#246a9e', '#4593cd', '#7fc0f2'] as const
const RAMP_LIGHT = ['#dce8f4', '#a9c8e6', '#6fa3d2', '#3c7ab2', '#1d5285'] as const

// Raw JS colour strings for Chart.js and the heatmap — these don't route through the CSS tokens
// in src/index.css, so each theme needs its own set.
export const CHART_PALETTE: Record<EffectiveTheme, ChartPalette> = {
  dark: {
    raw: 'rgba(234,240,247,0.3)',
    avg: '#5fa8e8',
    noData: 'rgba(234,240,247,0.04)',
    ramp: RAMP_DARK,
  },
  light: {
    raw: 'rgba(22,32,44,0.35)',
    avg: '#2d6ea8',
    noData: 'rgba(22,32,44,0.05)',
    ramp: RAMP_LIGHT,
  },
}

/** Which ramp step a rate falls in, 0–4. */
export function rampStep(rate: number): number {
  return Math.min(5, Math.max(1, Math.ceil(rate * 5))) - 1
}

/** Text colour that stays legible on a given ramp step, so the number can sit inside the cell. */
export function rampTextColor(theme: EffectiveTheme, step: number): string {
  if (theme === 'dark') return step <= 1 ? 'rgba(234,240,247,0.75)' : '#07101a'
  return step >= 3 ? '#f2f5f9' : 'rgba(22,32,44,0.82)'
}
