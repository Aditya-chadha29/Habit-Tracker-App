import type { DateStr } from '../data/types'
import { addDays, addMonths, daysBetween, monthEndOf, monthStartOf, weekStartOf } from './dates'

/** A week or a calendar month, inclusive at both ends. */
export interface Period {
  per: 'week' | 'month'
  start: DateStr
  end: DateStr
}

export function periodOf(per: 'week' | 'month', date: DateStr, weekStart = 0): Period {
  if (per === 'month') return { per, start: monthStartOf(date), end: monthEndOf(date) }
  const start = weekStartOf(date, weekStart)
  return { per, start, end: addDays(start, 6) }
}

/** The period `n` steps later (negative = earlier). */
export function shiftPeriod(period: Period, n: number): Period {
  if (period.per === 'week') {
    const start = addDays(period.start, 7 * n)
    return { per: 'week', start, end: addDays(start, 6) }
  }
  const start = addMonths(period.start, n)
  return { per: 'month', start, end: monthEndOf(start) }
}

export function periodLength(period: Period): number {
  return daysBetween(period.start, period.end) + 1
}

export function periodContains(period: Period, date: DateStr): boolean {
  return date >= period.start && date <= period.end
}
