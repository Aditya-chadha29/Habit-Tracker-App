import type { DateStr, Habit } from '../data/types'
import { isComplete, type CompletionIndex } from './completion'
import { matchesDayRule, versionOn } from './timeline'

/**
 * What one habit's cell for one day should say.
 *
 * `pending` and `missed` are different things: today's unfinished habit is pending, and only a
 * day that has ended can hold a miss. `not_due` is neither.
 */
export type DayStatus = 'done' | 'pending' | 'missed' | 'not_due' | 'inactive' | 'upcoming'

export function dayStatus(habit: Habit, date: DateStr, today: DateStr, index: CompletionIndex): DayStatus {
  const version = versionOn(habit, date)
  if (!version || !version.active) return 'inactive'
  if (date <= today && isComplete(habit, date, index)) return 'done'
  if (version.day.kind === 'flexible' || !matchesDayRule(version.day, date) || index.daysOff.has(date)) return 'not_due'
  if (date > today) return 'upcoming'
  return date === today ? 'pending' : 'missed'
}

/** Words for a status. Abstaining habits are held or broken, never completed or missed. */
export function statusLabel(status: DayStatus, polarity: Habit['polarity']): string {
  switch (status) {
    case 'done':
      return polarity === 'abstain' ? 'Held' : 'Done'
    case 'missed':
      return polarity === 'abstain' ? 'Broken' : 'Missed'
    case 'pending':
      return 'Pending'
    case 'not_due':
      return 'Not due'
    case 'upcoming':
      return 'Upcoming'
    case 'inactive':
      return 'Not tracked'
  }
}
