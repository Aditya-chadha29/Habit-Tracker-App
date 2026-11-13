import type { DateStr, Habit } from '../data/types'
import { isComplete, type CompletionIndex } from './completion'
import { addDays } from './dates'
import { currentVersion, isDueOn, isRetired } from './timeline'

/**
 * How often one habit was done on the days another was, against the days it was not. Counts only:
 * nothing here says one thing causes another, and a pair with too few days behind it is withheld.
 */
export interface PairCount {
  done: number
  of: number
}

export interface PairRate {
  whenA: PairCount
  whenNotA: PairCount
}

/** Fewest days each side needs before a pair is shown. */
export const PATTERN_MIN_DAYS = 7

/**
 * Over the given days on which A was due and B was due `lag` days later: how often B was done
 * when A was done, and when it was not. Days off are skipped on either side.
 */
export function pairRate(a: Habit, b: Habit, days: readonly DateStr[], index: CompletionIndex, lag: 0 | 1 = 0): PairRate {
  const whenA: PairCount = { done: 0, of: 0 }
  const whenNotA: PairCount = { done: 0, of: 0 }
  for (const day of days) {
    const later = lag ? addDays(day, lag) : day
    if (!isDueOn(a, day, index.daysOff) || !isDueOn(b, later, index.daysOff)) continue
    const bucket = isComplete(a, day, index) ? whenA : whenNotA
    bucket.of += 1
    if (isComplete(b, later, index)) bucket.done += 1
  }
  return { whenA, whenNotA }
}

export function hasEnough(rate: PairRate): boolean {
  return rate.whenA.of >= PATTERN_MIN_DAYS && rate.whenNotA.of >= PATTERN_MIN_DAYS
}

/** The pairs looked at, by the start of each habit's name. Fixed here on purpose: no fishing. */
export const PATTERN_PAIRS: { a: string; b: string; lag: 0 | 1 }[] = [
  { a: 'sleep before', b: 'wake up', lag: 1 },
  { a: 'wake up', b: 'meditation', lag: 0 },
  { a: 'gym', b: 'learning', lag: 0 },
  { a: 'sleep before', b: 'gym', lag: 1 },
]

export interface PatternLine {
  key: string
  text: string
}

/** The pattern lines that have enough days behind them, for the days given (end before today). */
export function patternLines(habits: readonly Habit[], days: readonly DateStr[], index: CompletionIndex): PatternLine[] {
  const find = (prefix: string) => habits.find((habit) => !isRetired(habit) && currentVersion(habit).name.toLowerCase().startsWith(prefix))
  const lines: PatternLine[] = []
  for (const pair of PATTERN_PAIRS) {
    const a = find(pair.a)
    const b = find(pair.b)
    if (!a || !b) continue
    const rate = pairRate(a, b, days, index, pair.lag)
    if (!hasEnough(rate)) continue
    const nameA = currentVersion(a).name
    const nameB = currentVersion(b).name
    const link = pair.lag ? 'the day after' : 'on days with'
    lines.push({
      key: `${a.id}-${b.id}-${pair.lag}`,
      text: `${nameB}: done on ${rate.whenA.done} of ${rate.whenA.of} days ${link} ${nameA} done, and ${rate.whenNotA.done} of ${rate.whenNotA.of} days otherwise.`,
    })
  }
  return lines
}
