import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'habit-tracker-theme'
const DARK_MEDIA = '(prefers-color-scheme: dark)'

function readStoredPreference(): ThemePreference {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

function applyDataTheme(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

const GROUND_BY_THEME: Record<EffectiveTheme, string> = { dark: '#181716', light: '#f3f2f2' }

function applyMetaThemeColor(effective: EffectiveTheme): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', GROUND_BY_THEME[effective])
}

interface ThemeContextValue {
  preference: ThemePreference
  effective: EffectiveTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_MEDIA).matches)

  useEffect(() => {
    const mql = window.matchMedia(DARK_MEDIA)
    const onChange = () => setSystemDark(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    applyDataTheme(preference)
  }, [preference])

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref)
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, pref)
  }, [])

  const effective: EffectiveTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    applyMetaThemeColor(effective)
  }, [effective])

  return (
    <ThemeContext.Provider value={{ preference, effective, setPreference }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
