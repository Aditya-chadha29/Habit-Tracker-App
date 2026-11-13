/**
 * What changed, shown once after an update. Add an entry (with the next version number) whenever
 * something the user will notice ships. Lines report; they do not sell.
 */
export interface ChangeNote {
  version: number
  date: string
  lines: string[]
}

export const CHANGES: ChangeNote[] = [
  {
    version: 1,
    date: '2026-11-13',
    lines: [
      'Dark theme only. The light theme was removed.',
      'Train opens on Start. The body map is smaller and sits under it.',
      'Today shows how many are left. Meals fold to one line; tap a meal to write it, mark protein or eating out, or reuse a meal written before.',
      'A tick shows Undo for a few seconds.',
      'Day off (rest, travel, sick) on Today: nothing is due that day.',
      'A missed day can be given a reason from the three dots on its row.',
      'Home has a plan for tomorrow in the evening, and Up next for learning.',
      'Review has a month view, a Copy summary button and, on Progress, patterns between habits.',
      'Workouts: name on Finish, a note per exercise, Swap, Plates, change the order. History has a calendar and cardio totals.',
      'Body measurements, a weight trend line and a goal weight are under Body weight.',
      'Settings: text size, and a weekly limit for meals eaten out.',
    ],
  },
]

export const LATEST_VERSION = CHANGES.reduce((max, note) => Math.max(max, note.version), 0)
const SEEN_KEY = 'ikikata-seen-version'

/** The notes not yet seen on this device. A device with no record yet is told nothing. */
export function unseenChanges(hasHistory: boolean): ChangeNote[] {
  try {
    const stored = localStorage.getItem(SEEN_KEY)
    if (stored === null && !hasHistory) {
      localStorage.setItem(SEEN_KEY, String(LATEST_VERSION))
      return []
    }
    const seen = Number(stored ?? 0) || 0
    return CHANGES.filter((note) => note.version > seen)
  } catch {
    return []
  }
}

export function markChangesSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, String(LATEST_VERSION))
  } catch {
    // Shown again next time; nothing else depends on it.
  }
}
