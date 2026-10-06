import type { DateStr, LegacyHabit } from '../data/types'
import { weekdayIndex } from './dates'

/**
 * The scoring rules exactly as the app applied them before habits carried dated chapters. Frozen.
 *
 * It exists for one job: the cutover checks that every day before it still scores the way this
 * says it did. Do not "fix" or modernise anything here — a change would silently redefine what
 * "the same as before" means.
 */
export function legacyIsActive(habit: LegacyHabit, date: DateStr): boolean {
  return habit.created_on <= date && (!habit.retired_on || habit.retired_on > date)
}

/**
 * `honourSchedule: false` is the original app, where every active habit was due every day.
 * `true` is the build of 6 October 2026, which added weekday and times-per-week schedules.
 */
export function legacyIsDue(habit: LegacyHabit, date: DateStr, honourSchedule: boolean): boolean {
  if (!legacyIsActive(habit, date)) return false
  if (!honourSchedule) return true
  const schedule = habit.schedule ?? 'daily'
  if (schedule === 'daily') return true
  if (schedule === 'weekdays') return (habit.weekdays ?? []).includes(weekdayIndex(date))
  return false
}

export function legacyDayScore(
  habits: readonly LegacyHabit[],
  doneKeys: ReadonlySet<string>,
  date: DateStr,
  honourSchedule: boolean,
): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const habit of habits) {
    if (habit.id === undefined || !legacyIsDue(habit, date, honourSchedule)) continue
    total += 1
    if (doneKeys.has(`${habit.id}|${date}`)) done += 1
  }
  return { done, total }
}
