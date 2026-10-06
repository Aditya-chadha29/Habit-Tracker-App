import type { DateStr } from '../data/types'

/**
 * Calendar arithmetic on `YYYY-MM-DD` strings.
 *
 * A date string names a calendar day, not an instant, so every calculation here goes through UTC
 * purely as a calculator: no local timezone or daylight-saving rule can shift a result. The only
 * functions that look at the device clock are `toLocalDateStr`, `logicalDate` and `clockHHMM`,
 * and they read LOCAL fields — never `toISOString()`, which would move anything before 05:30 IST
 * into the previous day.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Index 0 = Monday, matching every weekday number stored in the database. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const WEEKDAY_INITIAL = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parts(date: DateStr): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

function fromUtc(t: Date): DateStr {
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

function utcDayNumber(date: DateStr): number {
  const [y, m, d] = parts(date)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function toLocalDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Local midnight of a date string. For display libraries only; never for arithmetic. */
export function parseLocalDateStr(date: DateStr): Date {
  const [y, m, d] = parts(date)
  return new Date(y, m - 1, d)
}

export function isValidDateStr(value: unknown): value is DateStr {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = parts(value)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export function addDays(date: DateStr, n: number): DateStr {
  const [y, m, d] = parts(date)
  return fromUtc(new Date(Date.UTC(y, m - 1, d + n)))
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: DateStr, to: DateStr): number {
  return utcDayNumber(to) - utcDayNumber(from)
}

export function compareDateStr(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a <= b ? a : b
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a >= b ? a : b
}

/** Inclusive list of dates from `start` to `end`; empty when `end` is before `start`. */
export function dateRange(start: DateStr, end: DateStr): DateStr[] {
  const out: DateStr[] = []
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) out.push(cur)
  return out
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: DateStr): number {
  const [y, m, d] = parts(date)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** First day of the week holding `date`, for a week that starts on `weekStart` (0 = Monday). */
export function weekStartOf(date: DateStr, weekStart = 0): DateStr {
  return addDays(date, -((weekdayIndex(date) - weekStart + 7) % 7))
}

export function weekEndOf(date: DateStr, weekStart = 0): DateStr {
  return addDays(weekStartOf(date, weekStart), 6)
}

export function weekDates(weekStartDate: DateStr): DateStr[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i))
}

export function dayOfMonth(date: DateStr): number {
  return parts(date)[2]
}

export function daysInMonthOf(date: DateStr): number {
  const [y, m] = parts(date)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function monthStartOf(date: DateStr): DateStr {
  return `${date.slice(0, 7)}-01`
}

export function monthEndOf(date: DateStr): DateStr {
  return `${date.slice(0, 7)}-${pad2(daysInMonthOf(date))}`
}

/** First day of the month `n` months away from the month holding `date`. */
export function addMonths(date: DateStr, n: number): DateStr {
  const [y, m] = parts(date)
  return fromUtc(new Date(Date.UTC(y, m - 1 + n, 1)))
}

/**
 * The calendar day a moment belongs to. With a day start of 3, anything before 03:00 still counts
 * toward the previous day — for someone who is occasionally up past midnight.
 */
export function logicalDate(now: Date, dayStartHour = 0): DateStr {
  const shifted = new Date(now.getTime())
  shifted.setHours(shifted.getHours() - dayStartHour)
  return toLocalDateStr(shifted)
}

/** Local wall-clock time as 'HH:MM'. */
export function clockHHMM(now: Date): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

// ─── Formatting ──────────────────────────────────────────────────────────────────────────────

function utcDate(date: DateStr): Date {
  const [y, m, d] = parts(date)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "Tuesday, 6 October" */
export function formatDayTitle(date: DateStr): string {
  const t = utcDate(date)
  return `${DAY_NAMES[t.getUTCDay()]}, ${t.getUTCDate()} ${MONTH_NAMES[t.getUTCMonth()]}`
}

/** "6 Oct" */
export function formatShortDate(date: DateStr): string {
  const t = utcDate(date)
  return `${t.getUTCDate()} ${MONTH_NAMES[t.getUTCMonth()].slice(0, 3)}`
}

/** "Tue 6 Oct" */
export function formatMediumDate(date: DateStr): string {
  return `${WEEKDAY_SHORT[weekdayIndex(date)]} ${formatShortDate(date)}`
}

/** "6 October 2026" */
export function formatFullDate(date: DateStr): string {
  const t = utcDate(date)
  return `${t.getUTCDate()} ${MONTH_NAMES[t.getUTCMonth()]} ${t.getUTCFullYear()}`
}

/** "October 2026" */
export function formatMonthTitle(date: DateStr): string {
  const t = utcDate(date)
  return `${MONTH_NAMES[t.getUTCMonth()]} ${t.getUTCFullYear()}`
}

/** "29 Sep – 5 Oct 2026" */
export function formatRange(start: DateStr, end: DateStr): string {
  return `${formatShortDate(start)} – ${formatShortDate(end)} ${end.slice(0, 4)}`
}

/** "Today", "Yesterday", "3 days ago", or the date itself once it is further away. */
export function relativeDayLabel(date: DateStr, today: DateStr): string {
  const diff = daysBetween(date, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return `${diff} days ago`
  return formatMediumDate(date)
}
