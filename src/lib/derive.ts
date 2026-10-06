import type {
  Entry, Exercise, Habit, Meal, MealSlot, MuscleGroup, SetLog, Supplement, SupplementLog,
} from './types'
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

// ─── Gym ─────────────────────────────────────────────────────────────────────────────────────

/** Weekly hard-set band drawn behind the per-muscle bars. A reference, never a target or a score. */
export const WEEKLY_SET_BAND = { low: 10, high: 20 }

/**
 * Estimated one-rep max, Epley. Deliberately conservative about when it refuses to answer:
 * the formula assumes the set ended at or near failure, and its error grows past ~10 reps, so
 * above 12 effective reps this returns null and the caller shows the raw set instead. RIR counts
 * as reps left in the tank, so a set with 2 RIR is treated as 2 reps heavier than it was taken.
 */
export function e1rm(weightKg: number | null, reps: number | null, rir: number | null = null): number | null {
  if (weightKg === null || reps === null || reps < 1) return null
  const effective = reps + (rir ?? 0)
  if (effective === 1) return weightKg
  if (effective > 12) return null
  return weightKg * (1 + effective / 30)
}

export function isWorkSet(s: SetLog): boolean {
  return s.done && s.kind === 'work'
}

/** A set close enough to failure to count toward weekly volume. No RIR recorded = counted. */
export function isHardSet(s: SetLog): boolean {
  return isWorkSet(s) && (s.rir === null || s.rir <= 4)
}

/** Sets × reps × weight. Computed because it's cheap, shown small and last: it flatters light
 *  high-rep work and heavy exercises, so it is context, never a headline. */
export function volumeLoad(sets: SetLog[]): number {
  return sets.filter(isWorkSet).reduce((t, s) => t + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
}

/** Hard sets per muscle, biggest first. Credits the primary muscle only, so a push day reads
 *  low on triceps — a known, accepted simplification. */
export function setsByMuscle(
  sets: SetLog[],
  exercisesById: Map<number, Exercise>,
): { muscle: MuscleGroup; count: number }[] {
  const counts = new Map<MuscleGroup, number>()
  for (const s of sets.filter(isHardSet)) {
    const exercise = exercisesById.get(s.exercise_id)
    if (!exercise) continue
    counts.set(exercise.primary_muscle, (counts.get(exercise.primary_muscle) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([muscle, count]) => ({ muscle, count }))
    .sort((a, b) => b.count - a.count)
}

function setScore(s: SetLog): number {
  return e1rm(s.weight_kg, s.reps, s.rir) ?? (s.weight_kg ?? 0) * (s.reps ?? 0)
}

export function bestSet(sets: SetLog[]): SetLog | null {
  const work = sets.filter(isWorkSet)
  if (!work.length) return null
  return work.reduce((best, s) => (setScore(s) > setScore(best) ? s : best))
}

/** "80 × 6 · 80 × 6 · 75 × 7" — the single most useful line on any history screen. */
export function formatSetLine(sets: SetLog[]): string {
  return sets
    .filter(isWorkSet)
    .slice()
    .sort((a, b) => a.set_index - b.set_index)
    .map((s) => {
      if (s.weight_kg !== null && s.reps !== null) return `${s.weight_kg} × ${s.reps}`
      if (s.reps !== null) return `${s.reps} reps`
      if (s.seconds !== null) return `${s.seconds}s`
      if (s.distance_m !== null) return `${s.distance_m} m`
      return '—'
    })
    .join(' · ')
}

/** Sets grouped into sessions by date, most recent first. */
export function groupSetsByDate(sets: SetLog[]): { date: string; sets: SetLog[] }[] {
  const byDate = new Map<string, SetLog[]>()
  for (const s of sets) {
    const list = byDate.get(s.date)
    if (list) list.push(s)
    else byDate.set(s.date, [s])
  }
  return [...byDate.entries()]
    .map(([date, rows]) => ({ date, sets: rows }))
    .sort((a, b) => compareDateStr(b.date, a.date))
}

// ─── Food and supplements ────────────────────────────────────────────────────────────────────

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner']

export const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
}

/** The slot a log at this hour most likely belongs to, so the right box is focused by default. */
export function slotForHour(hour: number): MealSlot {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 19) return 'snack'
  return 'dinner'
}

export function mealFor(meals: Meal[], slot: MealSlot): Meal | undefined {
  return meals.find((m) => m.slot === slot)
}

export function mealsLogged(meals: Meal[]): number {
  return meals.filter((m) => m.text.trim().length > 0).length
}

export function ateOutCount(meals: Meal[]): number {
  return meals.filter((m) => m.ate_out).length
}

/** Whether a supplement is expected on this date: daily always, weekly on its weekday, and
 *  as-needed never (it can still be ticked, it just isn't counted as due). */
export function supplementDueOn(s: Supplement, dateStr: string): boolean {
  if (s.created_on > dateStr) return false
  if (s.retired_on && s.retired_on <= dateStr) return false
  if (s.schedule === 'daily') return true
  if (s.schedule === 'weekly') return s.weekly_day === mondayIndex(dateStr)
  return false
}

export function supplementTaken(logs: SupplementLog[], supplementId: number): boolean {
  return logs.find((l) => l.supplement_id === supplementId)?.taken ?? false
}

export function supplementAdherence(
  supplements: Supplement[],
  logs: SupplementLog[],
  dateStr: string,
): { taken: number; due: number } {
  const due = supplements.filter((s) => supplementDueOn(s, dateStr))
  return { taken: due.filter((s) => supplementTaken(logs, s.id!)).length, due: due.length }
}

export function isLowStock(s: Supplement): boolean {
  return s.servings_left !== null && s.low_stock_at !== null && s.servings_left <= s.low_stock_at
}
