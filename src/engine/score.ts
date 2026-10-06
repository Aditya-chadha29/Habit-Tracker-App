import type { AreaId, CompletionSource, DateStr, Habit, HabitVersion } from '../data/types'
import { completedBy, type CompletionIndex } from './completion'
import { addDays } from './dates'
import type { Period } from './periods'
import { targetProgress, type TargetProgress } from './targets'
import { matchesDayRule, versionOn } from './timeline'

/**
 * Scores, and nothing hidden about them:
 *
 *   day score  = due items done ÷ items due that day
 *   week score = (due items done on each day so far + flexible targets met, capped at the target)
 *                ÷ (items due on each day so far + the flexible targets themselves)
 *
 * A habit that is not due on a day is not in that day's score at all. A flexible habit
 * ("twice a week") is never in a day's score; it joins the week's score as its target.
 */
export interface Tally {
  done: number
  due: number
}

export interface DayItem {
  habit: Habit
  version: HabitVersion
  done: boolean
  /** What completed it, when done. */
  via: CompletionSource | null
}

export interface DayScore extends Tally {
  items: DayItem[]
  by_area: Map<AreaId, Tally>
}

function bump(map: Map<AreaId, Tally>, area: AreaId, done: number, due: number): void {
  const tally = map.get(area)
  if (tally) {
    tally.done += done
    tally.due += due
  } else {
    map.set(area, { done, due })
  }
}

/** The habits due on a date, in the order given, each with whether it was done. */
export function dueItems(habits: readonly Habit[], date: DateStr, index: CompletionIndex): DayItem[] {
  const items: DayItem[] = []
  for (const habit of habits) {
    const version = versionOn(habit, date)
    if (!version || !version.active || !matchesDayRule(version.day, date)) continue
    const via = completedBy(habit, date, index)
    items.push({ habit, version, done: via !== null, via })
  }
  return items
}

export function dayScore(habits: readonly Habit[], date: DateStr, index: CompletionIndex): DayScore {
  const items = dueItems(habits, date, index)
  const byArea = new Map<AreaId, Tally>()
  let done = 0
  for (const item of items) {
    if (item.done) done += 1
    bump(byArea, item.version.area, item.done ? 1 : 0, 1)
  }
  return { done, due: items.length, items, by_area: byArea }
}

export interface FlexibleItem {
  habit: Habit
  version: HabitVersion
  done_today: boolean
  via: CompletionSource | null
}

/** Active habits with no particular day: shown on a day so they can be done, never scored on it. */
export function flexibleItems(habits: readonly Habit[], date: DateStr, index: CompletionIndex): FlexibleItem[] {
  const items: FlexibleItem[] = []
  for (const habit of habits) {
    const version = versionOn(habit, date)
    if (!version || !version.active || version.day.kind !== 'flexible') continue
    const via = completedBy(habit, date, index)
    items.push({ habit, version, done_today: via !== null, via })
  }
  return items
}

export interface WeekTally extends Tally {
  by_area: Map<AreaId, Tally>
  /** One per day of the week; days after `today` carry zeros and `counted: false`. */
  days: { date: DateStr; done: number; due: number; counted: boolean }[]
  /** Every weekly target in force, flexible or not. */
  targets: { habit: Habit; progress: TargetProgress }[]
}

/**
 * A week's score. Days after `today` are not counted yet, which is what makes the running week
 * read "so far" instead of counting tomorrow's habits as already missed.
 */
export function weekTally(
  habits: readonly Habit[],
  period: Period,
  today: DateStr,
  index: CompletionIndex,
): WeekTally {
  const byArea = new Map<AreaId, Tally>()
  const days: WeekTally['days'] = []
  let done = 0
  let due = 0

  for (let date = period.start; date <= period.end; date = addDays(date, 1)) {
    if (date > today) {
      days.push({ date, done: 0, due: 0, counted: false })
      continue
    }
    const score = dayScore(habits, date, index)
    days.push({ date, done: score.done, due: score.due, counted: true })
    done += score.done
    due += score.due
    for (const [area, tally] of score.by_area) bump(byArea, area, tally.done, tally.due)
  }

  const targets: WeekTally['targets'] = []
  for (const habit of habits) {
    const progress = targetProgress(habit, period, today, index)
    if (!progress) continue
    targets.push({ habit, progress })
    // Fixed-day habits were already counted day by day above; only flexible ones add their target.
    // A target tracked for only part of the week is reported but not scored.
    if (!progress.flexible || progress.partial || progress.state === 'upcoming') continue
    const counted = Math.min(progress.done, progress.target)
    done += counted
    due += progress.target
    bump(byArea, progress.area, counted, progress.target)
  }

  return { done, due, by_area: byArea, days, targets }
}

/** 0–100, or null when nothing was due — "no data" is not the same as 0%. */
export function percent(tally: Tally): number | null {
  if (!tally.due) return null
  return Math.round((tally.done / tally.due) * 100)
}
