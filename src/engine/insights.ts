import type { AreaId, DateStr, Habit } from '../data/types'
import type { CompletionIndex } from './completion'
import { addDays, addMonths, monthEndOf, monthStartOf, weekStartOf } from './dates'
import { periodOf, shiftPeriod, type Period } from './periods'
import { dayScore, weekTally, type Tally } from './score'
import { consistency, streakOf, type Streak } from './streaks'
import { isRetired } from './timeline'

/**
 * Long-term history: is consistency improving?
 *
 * Every figure here is built on the same day and week scores as the rest of the app. And every
 * figure has a gate: with too little behind it, the answer is "need more history" (null), never
 * a confident-looking number drawn from three days of data.
 */
export type RangeKey = '7d' | '30d' | '3m' | '6m' | '1y'

export const RANGES: { id: RangeKey; label: string; days: number; weeks: number }[] = [
  { id: '7d', label: '7D', days: 7, weeks: 8 },
  { id: '30d', label: '30D', days: 30, weeks: 8 },
  { id: '3m', label: '3M', days: 91, weeks: 13 },
  { id: '6m', label: '6M', days: 182, weeks: 26 },
  { id: '1y', label: '1Y', days: 365, weeks: 52 },
]

export interface DateRange {
  from: DateStr
  to: DateStr
}

/** Fewest due items a rate is shown for. */
export const MIN_DUE_FOR_RATE = 7
/** Changes smaller than this many points are reported as steady. */
export const TREND_DEAD_ZONE = 3
/** Fewest due days per weekday before a weekday comparison is made. */
export const MIN_DUE_PER_WEEKDAY = 3

export type Direction = 'up' | 'down' | 'flat'

/**
 * The last `days` finished days. Today is left out on purpose: it is still in progress, and
 * including it would drag every figure down each morning.
 */
export function rangeEnding(today: DateStr, days: number): DateRange {
  return { from: addDays(today, -days), to: addDays(today, -1) }
}

export function rangeFor(key: RangeKey, today: DateStr): DateRange {
  return rangeEnding(today, RANGES.find((range) => range.id === key)!.days)
}

/** The equally long range immediately before. */
export function previousRange(range: DateRange): DateRange {
  const days = Math.round((Date.UTC(+range.to.slice(0, 4), +range.to.slice(5, 7) - 1, +range.to.slice(8)) - Date.UTC(+range.from.slice(0, 4), +range.from.slice(5, 7) - 1, +range.from.slice(8))) / 86_400_000) + 1
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) }
}

/** Due items done over due items across a range, optionally for one pillar. */
export function tallyRange(habits: readonly Habit[], range: DateRange, index: CompletionIndex, area?: AreaId): Tally {
  let done = 0
  let due = 0
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const score = dayScore(habits, date, index)
    const part = area ? score.by_area.get(area) : score
    if (!part) continue
    done += part.done
    due += part.due
  }
  return { done, due }
}

/** A rate in whole percent, or null when too little was due to say. */
export function rateOf(tally: Tally, minDue = MIN_DUE_FOR_RATE): number | null {
  return tally.due >= minDue ? Math.round((tally.done / tally.due) * 100) : null
}

export interface Comparison {
  current: Tally
  previous: Tally
  /** Whole percent, or null without enough data. */
  rate: number | null
  previous_rate: number | null
  /** Percentage points; null when either side has too little data. */
  delta: number | null
  direction: Direction | null
}

export function compare(current: Tally, previous: Tally, minDue = MIN_DUE_FOR_RATE): Comparison {
  const rate = rateOf(current, minDue)
  const previousRate = rateOf(previous, minDue)
  const delta = rate !== null && previousRate !== null ? rate - previousRate : null
  const direction: Direction | null = delta === null ? null : Math.abs(delta) < TREND_DEAD_ZONE ? 'flat' : delta > 0 ? 'up' : 'down'
  return { current, previous, rate, previous_rate: previousRate, delta, direction }
}

/** A range against the equally long range before it. */
export function compareRange(habits: readonly Habit[], range: DateRange, index: CompletionIndex, area?: AreaId): Comparison {
  return compare(tallyRange(habits, range, index, area), tallyRange(habits, previousRange(range), index, area))
}

export interface NamedComparison extends Comparison {
  label: string
  previous_label: string
}

const asRange = (period: Period): DateRange => ({ from: period.start, to: period.end })

/** The four standing comparisons: week, month, 30 days, 90 days. */
export function standingComparisons(habits: readonly Habit[], today: DateStr, weekStart: number, index: CompletionIndex): NamedComparison[] {
  const yesterday = addDays(today, -1)
  const thisWeek = periodOf('week', today, weekStart)
  const lastWeek = shiftPeriod(thisWeek, -1)
  const thisMonth: DateRange = { from: monthStartOf(today), to: yesterday }
  const lastMonthStart = addMonths(today, -1)
  const lastMonth: DateRange = { from: lastMonthStart, to: monthEndOf(lastMonthStart) }
  const thirty = rangeEnding(today, 30)
  const ninety = rangeEnding(today, 90)
  // The running week and month are compared as far as they have got; an empty one has no rate.
  const upTo = (range: DateRange): DateRange => ({ from: range.from, to: range.to > yesterday ? yesterday : range.to })
  return [
    { label: 'This week', previous_label: 'Last week', ...compare(tallyRange(habits, upTo(asRange(thisWeek)), index), tallyRange(habits, asRange(lastWeek), index)) },
    { label: 'This month', previous_label: 'Last month', ...compare(tallyRange(habits, thisMonth, index), tallyRange(habits, lastMonth, index)) },
    { label: 'Last 30 days', previous_label: '30 days before', ...compareRange(habits, thirty, index) },
    { label: 'Last 90 days', previous_label: '90 days before', ...compareRange(habits, ninety, index) },
  ]
}

export interface WeekPoint {
  week_start: DateStr
  done: number
  due: number
  /** Whole percent, or null for a week with too little due. */
  rate: number | null
}

/**
 * Week-by-week completion for the last `weeks` weeks, oldest first, the running week last. Like
 * the ranges above, the running week is counted from its finished days only: today is still in
 * progress, and counting it would make the line dip every morning.
 */
export function weeklySeries(
  habits: readonly Habit[],
  weeks: number,
  today: DateStr,
  weekStart: number,
  index: CompletionIndex,
  area?: AreaId,
): WeekPoint[] {
  const points: WeekPoint[] = []
  const current = weekStartOf(today, weekStart)
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(current, -7 * i)
    const period: Period = { per: 'week', start, end: addDays(start, 6) }
    const tally = weekTally(habits, period, i === 0 ? addDays(today, -1) : today, index)
    const part = area ? (tally.by_area.get(area) ?? { done: 0, due: 0 }) : tally
    points.push({ week_start: start, done: part.done, due: part.due, rate: part.due >= 5 ? Math.round((part.done / part.due) * 100) : null })
  }
  return points
}

/** How many of the points carry a rate. Charts are held back until there are at least two. */
export function pointsWithData(points: readonly WeekPoint[]): number {
  return points.filter((point) => point.rate !== null).length
}

export interface HabitSummary {
  habit: Habit
  streak: Streak
  /** Rate over the range in whole percent, or null without enough due days. */
  rate: number | null
  due: number
  direction: Direction | null
  delta: number | null
}

/** Each active habit's streak, its rate over a range, and how that compares with the range before. */
export function habitSummaries(
  habits: readonly Habit[],
  range: DateRange,
  today: DateStr,
  weekStart: number,
  index: CompletionIndex,
): HabitSummary[] {
  const before = previousRange(range)
  return habits
    .filter((habit) => !isRetired(habit))
    .map((habit) => {
      const now = consistency(habit, range.from, range.to, today, index)
      const then = consistency(habit, before.from, before.to, today, index)
      const comparison = compare({ done: now.done, due: now.due }, { done: then.done, due: then.due }, Math.min(MIN_DUE_FOR_RATE, 5))
      return { habit, streak: streakOf(habit, today, index, weekStart), rate: comparison.rate, due: now.due, direction: comparison.direction, delta: comparison.delta }
    })
}

/** The longest streak running now and the longest ever, each with its habit. */
export function streakLeaders(summaries: readonly HabitSummary[]): { current: HabitSummary | null; longest: HabitSummary | null } {
  const daily = summaries.filter((summary) => summary.streak.unit === 'days')
  const current = daily.reduce<HabitSummary | null>((best, s) => (s.streak.current > (best?.streak.current ?? 0) ? s : best), null)
  const longest = daily.reduce<HabitSummary | null>((best, s) => (s.streak.longest > (best?.streak.longest ?? 0) ? s : best), null)
  return { current, longest }
}

/**
 * The weekday a habit is done least on — only when every weekday it is due on has enough
 * history, and only when it is clearly lower than the rest. Otherwise there is nothing to say.
 */
export function lowestWeekday(rates: readonly { rate: number | null; due: number }[]): { weekday: number; rate: number } | null {
  const known = rates.map((entry, weekday) => ({ ...entry, weekday })).filter((entry) => entry.due > 0)
  if (known.length < 2 || known.some((entry) => entry.due < MIN_DUE_PER_WEEKDAY || entry.rate === null)) return null
  const sorted = [...known].sort((a, b) => a.rate! - b.rate!)
  if (sorted[1].rate! - sorted[0].rate! < 0.1) return null
  return { weekday: sorted[0].weekday, rate: sorted[0].rate! }
}

/** Days from the first tracked day to today, inclusive. */
export function historyDays(habits: readonly Habit[], today: DateStr): number {
  if (!habits.length) return 0
  const first = habits.reduce((min, habit) => (habit.created_on < min ? habit.created_on : min), habits[0].created_on)
  if (first > today) return 0
  let days = 0
  for (let date = first; date <= today; date = addDays(date, 1)) days += 1
  return days
}
