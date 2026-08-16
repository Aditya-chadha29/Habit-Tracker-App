const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayLocalStr(): string {
  return toLocalDateStr(new Date())
}

export function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(dateStr: string, n: number): string {
  const d = parseLocalDateStr(dateStr)
  d.setDate(d.getDate() + n)
  return toLocalDateStr(d)
}

/** 0 = Monday ... 6 = Sunday */
export function mondayIndex(dateStr: string): number {
  const jsDay = parseLocalDateStr(dateStr).getDay()
  return (jsDay + 6) % 7
}

export function mondayOf(dateStr: string): string {
  return addDays(dateStr, -mondayIndex(dateStr))
}

export function compareDateStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function formatDayTitle(dateStr: string): string {
  const d = parseLocalDateStr(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

export function formatWeekTitle(mondayStr: string): string {
  const start = parseLocalDateStr(mondayStr)
  const end = parseLocalDateStr(addDays(mondayStr, 6))
  return `${start.getDate()}–${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`
}

export function formatShortDate(dateStr: string): string {
  const d = parseLocalDateStr(dateStr)
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`
}

export const WEEKDAY_LABELS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAY_INITIALS_MON_FIRST = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
export const WEEKDAY_FULL_MON_FIRST = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
]

/** Inclusive list of YYYY-MM-DD strings from `startStr` to `endStr`. */
export function dateRange(startStr: string, endStr: string): string[] {
  const out: string[] = []
  let cur = startStr
  while (compareDateStr(cur, endStr) <= 0) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}
