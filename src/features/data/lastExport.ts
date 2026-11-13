import type { DateStr } from '../../data/types'
import { isValidDateStr } from '../../engine/dates'

const KEY = 'ikikata-last-export'

/** Remembers, on this device only, the day an export was last downloaded or shared. */
export function rememberExport(today: DateStr): void {
  try {
    localStorage.setItem(KEY, today)
  } catch {
    // Not remembered; the reminder simply stays.
  }
}

export function lastExportDay(): DateStr | null {
  try {
    const stored = localStorage.getItem(KEY)
    return isValidDateStr(stored) ? stored : null
  } catch {
    return null
  }
}
