import { useEffect, useState } from 'react'
import type { ThemePreference } from '../data/types'

// index.html's boot script reads the same key, so the right theme is on screen before any
// JavaScript bundle has loaded. The setting in the database is the truth; this is its cache.
const STORAGE_KEY = 'habit-tracker-theme'
const DARK_MEDIA = '(prefers-color-scheme: dark)'

/** Browser chrome colour per theme: the `ground` token's value. */
export const GROUND: Record<'dark' | 'light', string> = { dark: '#0b0f1a', light: '#f7f1ee' }

export function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_MEDIA).matches
}

/** Applies a theme preference to the document and returns which theme is actually showing. */
export function useAppliedTheme(preference: ThemePreference): 'dark' | 'light' {
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA)
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const effective = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    const root = document.documentElement
    if (preference === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', preference)
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
  }, [preference])

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', GROUND[effective])
  }, [effective])

  return effective
}
