import type { Entry, Habit } from './types'
import { addDays, compareDateStr, dateRange, mondayIndex, parseLocalDateStr } from './dates'

export type DoneMap = Map<string, boolean>

export function buildDoneMap(entries: Entry[]): DoneMap {
  const map: DoneMap = new Map()
  for (const e of entries) map.set(`${e.habit_id}|${e.date}`, e.done)
  return map
}

export function isDone(doneMap: DoneMap, habitId: number, dateStr: string): boolean {
  return doneMap.get(`${habitId}|${dateStr}`) ?? false
}

export function isHabitActive(habit: Habit, dateStr: string): boolean {
  return habit.created_on <= dateStr && (!habit.retired_on || habit.retired_on > dateStr)
}

export function activeHabits(habits: Habit[], dateStr: string): Habit[] {
  return habits.filter((h) => isHabitActive(h, dateStr))
}

export function computeScore(
  habits: Habit[],
  doneMap: DoneMap,
  dateStr: string,
): { done: number; total: number } {
  const active = activeHabits(habits, dateStr)
  const done = active.filter((h) => isDone(doneMap, h.id!, dateStr)).length
  return { done, total: active.length }
}

/** Editing history is allowed for the previous 7 days only (today back to today-6). */
export function isEditable(dateStr: string, todayStr: string): boolean {
  return dateStr <= todayStr && dateStr >= addDays(todayStr, -6)
}

/** Last date (inclusive) a habit is/was active, capped at today. */
export function habitEndDate(habit: Habit, todayStr: string): string {
  if (!habit.retired_on) return todayStr
  const lastActive = addDays(habit.retired_on, -1)
  return compareDateStr(lastActive, todayStr) < 0 ? lastActive : todayStr
}

/** All calendar dates (inclusive) a habit has been or is active, capped at today. */
export function habitActiveDates(habit: Habit, todayStr: string): string[] {
  const end = habitEndDate(habit, todayStr)
  if (compareDateStr(habit.created_on, end) > 0) return []
  return dateRange(habit.created_on, end)
}

export function streak(
  habit: Habit,
  doneMap: DoneMap,
  todayStr: string,
): { cur: number; best: number } {
  const dates = habitActiveDates(habit, todayStr)
  let cur = 0
  let best = 0
  let run = 0
  for (const iso of dates) {
    if (isDone(doneMap, habit.id!, iso)) {
      run++
      best = Math.max(best, run)
    } else if (iso !== todayStr) {
      run = 0
    }
  }
  for (let i = dates.length - 1; i >= 0; i--) {
    const iso = dates[i]
    if (isDone(doneMap, habit.id!, iso)) cur++
    else if (iso !== todayStr) break
  }
  return { cur, best }
}

/** Per-weekday (Mon-first) completion rate across the habit's whole history, or null if no data. */
export function weekdayRateGrid(habit: Habit, doneMap: DoneMap, todayStr: string): (number | null)[] {
  const dates = habitActiveDates(habit, todayStr)
  const n = [0, 0, 0, 0, 0, 0, 0]
  const d = [0, 0, 0, 0, 0, 0, 0]
  for (const iso of dates) {
    const wd = mondayIndex(iso)
    n[wd]++
    if (isDone(doneMap, habit.id!, iso)) d[wd]++
  }
  return n.map((count, i) => (count ? d[i] / count : null))
}

/** Overall completion rate across the habit's whole history, or null if no data. */
export function allTimeRate(habit: Habit, doneMap: DoneMap, todayStr: string): number | null {
  const dates = habitActiveDates(habit, todayStr)
  if (!dates.length) return null
  const done = dates.filter((iso) => isDone(doneMap, habit.id!, iso)).length
  return done / dates.length
}

export function daysCountInclusive(startStr: string, endStr: string): number {
  if (compareDateStr(startStr, endStr) > 0) return 0
  const start = parseLocalDateStr(startStr)
  const end = parseLocalDateStr(endStr)
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

/** Days of history recorded across the whole app, from the earliest habit's created_on to today. */
export function historyDayCount(habits: Habit[], todayStr: string): number {
  if (!habits.length) return 0
  const earliest = habits.reduce(
    (min, h) => (compareDateStr(h.created_on, min) < 0 ? h.created_on : min),
    habits[0].created_on,
  )
  return daysCountInclusive(earliest, todayStr)
}

export function dailyScorePercents(habits: Habit[], doneMap: DoneMap, dates: string[]): number[] {
  return dates.map((iso) => {
    const s = computeScore(habits, doneMap, iso)
    return s.total ? s.done / s.total : 0
  })
}

export function rollingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

export function historyStartDate(habits: Habit[]): string | null {
  if (!habits.length) return null
  return habits.reduce(
    (min, h) => (compareDateStr(h.created_on, min) < 0 ? h.created_on : min),
    habits[0].created_on,
  )
}
