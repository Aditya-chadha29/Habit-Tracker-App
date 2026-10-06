import type { DateStr, Habit } from '../data/types'
import { isComplete, type CompletionIndex } from './completion'
import { addDays } from './dates'
import { periodOf, shiftPeriod, type Period } from './periods'
import { targetProgress } from './targets'
import { currentVersion, isDueOn, versionOn } from './timeline'

/**
 * Streaks and consistency. These are records of what happened, not a game: nothing here is ever
 * "protected", nagged about or rewarded.
 *
 * A habit with fixed days streaks by due day — a Monday-only habit does not break on a Tuesday.
 * A flexible habit ("twice a week") streaks by period: weeks in which the target was met.
 */
export interface Streak {
  current: number
  longest: number
  /** What is being counted. */
  unit: 'days' | 'weeks' | 'months'
}

/** Whether a habit is judged by period targets rather than by due days. */
export function isPeriodJudged(habit: Habit, date: DateStr): boolean {
  const version = versionOn(habit, date) ?? currentVersion(habit)
  return version.day.kind === 'flexible' && version.target !== null
}

function dayStreak(habit: Habit, today: DateStr, index: CompletionIndex): Streak {
  let longest = 0
  let run = 0
  for (let date = habit.created_on; date <= today; date = addDays(date, 1)) {
    if (!isDueOn(habit, date)) continue
    if (isComplete(habit, date, index)) {
      run += 1
      if (run > longest) longest = run
    } else if (date !== today) {
      // Today is still pending, so an unfinished today neither extends nor ends the run.
      run = 0
    }
  }
  return { current: run, longest, unit: 'days' }
}

function periodStreak(habit: Habit, today: DateStr, index: CompletionIndex, weekStart: number): Streak {
  const per = (versionOn(habit, today) ?? currentVersion(habit)).target?.per ?? 'week'
  let period: Period = periodOf(per, habit.created_on, weekStart)
  const last = periodOf(per, today, weekStart)
  let longest = 0
  let run = 0
  while (period.start <= last.start) {
    const progress = targetProgress(habit, period, today, index)
    if (progress) {
      if (progress.state === 'met') {
        run += 1
        if (run > longest) longest = run
      } else if (progress.state === 'missed' || progress.state === 'unreachable') {
        run = 0
      }
      // partial, pending and at-risk periods neither extend nor end a run.
    }
    period = shiftPeriod(period, 1)
  }
  return { current: run, longest, unit: per === 'week' ? 'weeks' : 'months' }
}

export function streakOf(habit: Habit, today: DateStr, index: CompletionIndex, weekStart = 0): Streak {
  return isPeriodJudged(habit, today)
    ? periodStreak(habit, today, index, weekStart)
    : dayStreak(habit, today, index)
}

export interface Consistency {
  done: number
  due: number
  /** 0–1, or null when nothing was due in the range. */
  rate: number | null
}

/**
 * Due days completed across [from, to]. Today is only counted once it is done: an unfinished
 * today is pending, and counting it would understate the rate every morning.
 */
export function consistency(
  habit: Habit,
  from: DateStr,
  to: DateStr,
  today: DateStr,
  index: CompletionIndex,
): Consistency {
  let done = 0
  let due = 0
  const start = from < habit.created_on ? habit.created_on : from
  const end = to > today ? today : to
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (!isDueOn(habit, date)) continue
    const complete = isComplete(habit, date, index)
    if (date === today && !complete) continue
    due += 1
    if (complete) done += 1
  }
  return { done, due, rate: due ? done / due : null }
}

/** Completion rate by weekday (index 0 = Monday) over [from, to]; null where never due. */
export function weekdayRates(
  habit: Habit,
  from: DateStr,
  to: DateStr,
  today: DateStr,
  index: CompletionIndex,
  weekdayOf: (date: DateStr) => number,
): { rate: number | null; done: number; due: number }[] {
  const done = [0, 0, 0, 0, 0, 0, 0]
  const due = [0, 0, 0, 0, 0, 0, 0]
  const start = from < habit.created_on ? habit.created_on : from
  const end = to > today ? today : to
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (!isDueOn(habit, date)) continue
    const complete = isComplete(habit, date, index)
    if (date === today && !complete) continue
    const weekday = weekdayOf(date)
    due[weekday] += 1
    if (complete) done[weekday] += 1
  }
  return due.map((count, i) => ({ rate: count ? done[i] / count : null, done: done[i], due: count }))
}
