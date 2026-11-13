import type { DateStr, DayRule, Habit, HabitVersion, PeriodTarget } from '../data/types'
import { addDays, dayOfMonth, daysBetween, daysInMonthOf, isValidDateStr, weekdayIndex } from './dates'

/**
 * Reading and writing a habit's dated chapters.
 *
 * Every question about a past day is answered by the chapter that was in force on that day, so a
 * change made today can never alter how an earlier day reads.
 */

/** The chapter in force on a date, or null before the habit existed. */
export function versionOn(habit: Habit, date: DateStr): HabitVersion | null {
  let found: HabitVersion | null = null
  for (const version of habit.versions) {
    if (version.from > date) break
    found = version
  }
  return found
}

export function currentVersion(habit: Habit): HabitVersion {
  return habit.versions[habit.versions.length - 1]
}

export function isRetired(habit: Habit): boolean {
  return !currentVersion(habit).active
}

export function isActiveOn(habit: Habit, date: DateStr): boolean {
  return versionOn(habit, date)?.active ?? false
}

export function matchesDayRule(rule: DayRule, date: DateStr): boolean {
  switch (rule.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return rule.weekdays.includes(weekdayIndex(date))
    case 'every_n_days':
      if (rule.n < 1 || date < rule.anchor) return false
      return daysBetween(rule.anchor, date) % rule.n === 0
    case 'month_days': {
      const last = daysInMonthOf(date)
      const today = dayOfMonth(date)
      return rule.days.some((day) => Math.min(day, last) === today)
    }
    case 'flexible':
      return false
  }
}

/** Expected on this particular day, and so part of that day's score. */
export function isDueOn(habit: Habit, date: DateStr, daysOff?: ReadonlySet<DateStr>): boolean {
  if (daysOff?.has(date)) return false
  const version = versionOn(habit, date)
  return !!version && version.active && matchesDayRule(version.day, date)
}

/** Active with no particular day: can be done today, can never be missed today. */
export function isFlexibleOn(habit: Habit, date: DateStr): boolean {
  const version = versionOn(habit, date)
  return !!version && version.active && version.day.kind === 'flexible'
}

/** The name the habit went by on a date. */
export function nameOn(habit: Habit, date: DateStr): string {
  return (versionOn(habit, date) ?? habit.versions[0]).name
}

/** Dates in [from, to] the habit was due on. */
export function dueDatesBetween(habit: Habit, from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = []
  const start = from < habit.created_on ? habit.created_on : from
  for (let date = start; date <= to; date = addDays(date, 1)) {
    if (isDueOn(habit, date)) out.push(date)
  }
  return out
}

// ─── Editing ─────────────────────────────────────────────────────────────────────────────────

export type VersionPatch = Partial<Omit<HabitVersion, 'from'>>

function shapeOf(version: HabitVersion): string {
  const { from: _from, ...rest } = version
  return JSON.stringify(rest)
}

export function sameShape(a: HabitVersion, b: HabitVersion): boolean {
  return shapeOf(a) === shapeOf(b)
}

/**
 * Returns the chapter list after a change that takes effect on `from`.
 *
 * Changes made on the same day collapse into one chapter, and a change that ends up identical to
 * what was already there adds nothing — so toggling a setting back and forth leaves no litter.
 * Earlier chapters are never touched.
 */
export function appendVersion(
  versions: readonly HabitVersion[],
  from: DateStr,
  patch: VersionPatch,
): HabitVersion[] {
  const last = versions[versions.length - 1]
  if (from < last.from) throw new Error('A habit cannot be changed in the past')
  const next: HabitVersion = { ...last, ...patch, from }
  if (sameShape(next, last)) return [...versions]
  if (from !== last.from) return [...versions, next]
  const before = versions[versions.length - 2]
  if (before && sameShape(next, before)) return versions.slice(0, -1)
  return [...versions.slice(0, -1), next]
}

// ─── Validation ──────────────────────────────────────────────────────────────────────────────

const SOURCES = new Set(['manual', 'workout', 'cardio', 'learning', 'reading', 'journal'])

export function dayRuleProblem(rule: DayRule): string | null {
  switch (rule.kind) {
    case 'daily':
    case 'flexible':
      return null
    case 'weekdays':
      if (!rule.weekdays.length) return 'choose at least one weekday'
      if (rule.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'weekday out of range'
      return null
    case 'every_n_days':
      if (!Number.isInteger(rule.n) || rule.n < 1) return 'the interval must be at least 1 day'
      if (!isValidDateStr(rule.anchor)) return 'the starting date is not a real date'
      return null
    case 'month_days':
      if (!rule.days.length) return 'choose at least one day of the month'
      if (rule.days.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) return 'day of month out of range'
      return null
    default:
      return 'unknown schedule'
  }
}

export function targetProblem(target: PeriodTarget | null, rule: DayRule): string | null {
  if (!target) return null
  if (target.per !== 'week' && target.per !== 'month') return 'unknown target period'
  if (!Number.isInteger(target.count) || target.count < 1) return 'the target must be at least 1'
  const max = target.per === 'week' ? 7 : 31
  if (target.count > max) return `the target cannot be more than ${max}`
  if (rule.kind === 'weekdays' && target.per === 'week' && target.count > rule.weekdays.length) {
    return 'the target is higher than the number of days it is scheduled on'
  }
  return null
}

/** Every reason a habit row is not safe to store. Empty means valid. */
export function habitProblems(habit: Habit): string[] {
  const problems: string[] = []
  if (!habit.versions?.length) return ['it has no schedule history']
  if (!isValidDateStr(habit.created_on)) problems.push('its start date is not a real date')
  if (habit.versions[0].from !== habit.created_on) problems.push('its first chapter does not start on its start date')
  habit.versions.forEach((version, i) => {
    if (!isValidDateStr(version.from)) problems.push(`chapter ${i + 1} has an invalid date`)
    if (i > 0 && version.from <= habit.versions[i - 1].from) problems.push(`chapter ${i + 1} is out of order`)
    if (!version.name?.trim()) problems.push(`chapter ${i + 1} has no name`)
    const rule = dayRuleProblem(version.day)
    if (rule) problems.push(`chapter ${i + 1}: ${rule}`)
    const target = targetProblem(version.target, version.day)
    if (target) problems.push(`chapter ${i + 1}: ${target}`)
    if (!version.sources?.length) problems.push(`chapter ${i + 1} has no way to be completed`)
    else if (version.sources.some((s) => !SOURCES.has(s))) problems.push(`chapter ${i + 1} has an unknown completion source`)
  })
  return problems
}
