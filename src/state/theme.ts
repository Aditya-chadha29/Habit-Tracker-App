import { useEffect } from 'react'
import type { ThemePreference } from '../data/types'

/** Browser chrome colour: the `ground` token's value. */
export const GROUND = '#0c0b10'

/**
 * The theme a migration should record for an install that has none. The app is dark only (the
 * user's decision of 2026-11-13); the setting stays in the record because old exports carry it.
 */
export function readStoredTheme(): ThemePreference {
  return 'dark'
}

/** Keeps the document marked dark, whatever an old setting says. */
export function useAppliedTheme(): 'dark' {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', GROUND)
  }, [])
  return 'dark'
}
