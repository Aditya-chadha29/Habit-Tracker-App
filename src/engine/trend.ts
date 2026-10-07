import type { AreaId, DateStr, Habit } from '../data/types'
import type { CompletionIndex } from './completion'
import { addDays } from './dates'
import { dayScore, type Tally } from './score'

/**
 * The small "am I improving?" indicator: the last N finished days against the N before them.
 *
 * It refuses to answer on thin evidence. With too little due in either window there is no
 * direction at all, and a change smaller than the dead zone is reported as flat — day-to-day
 * noise is not a trend.
 */
export type Direction = 'up' | 'down' | 'flat'

export interface WindowComparison {
  current: Tally
  previous: Tally
  /** Change in percentage points, or null when either window has too little behind it. */
  delta: number | null
  direction: Direction | null
}

export const TREND_MIN_DUE = 7
export const TREND_DEAD_ZONE = 3

function tally(habits: readonly Habit[], index: CompletionIndex, from: DateStr, to: DateStr, area?: AreaId): Tally {
  let done = 0
  let due = 0
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const score = dayScore(habits, date, index)
    const part = area ? score.by_area.get(area) : score
    if (!part) continue
    done += part.done
    due += part.due
  }
  return { done, due }
}

/** Compares the `days` days before today with the `days` before those. Today is left out: it is
 *  still in progress, and including it would make every morning look like a decline. */
export function compareWindows(
  habits: readonly Habit[],
  index: CompletionIndex,
  today: DateStr,
  days = 7,
  area?: AreaId,
): WindowComparison {
  const current = tally(habits, index, addDays(today, -days), addDays(today, -1), area)
  const previous = tally(habits, index, addDays(today, -2 * days), addDays(today, -days - 1), area)
  if (current.due < TREND_MIN_DUE || previous.due < TREND_MIN_DUE) {
    return { current, previous, delta: null, direction: null }
  }
  const delta = Math.round((current.done / current.due - previous.done / previous.due) * 100)
  const direction: Direction = Math.abs(delta) < TREND_DEAD_ZONE ? 'flat' : delta > 0 ? 'up' : 'down'
  return { current, previous, delta, direction }
}
