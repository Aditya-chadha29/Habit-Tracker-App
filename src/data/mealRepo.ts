import { db, type AppDb } from './db'
import { setHabitDone, type WriteContext } from './habitRepo'
import type { DateStr, Meal } from './types'
import { assertEditable } from '../engine/lock'
import { versionOn } from '../engine/timeline'

/**
 * What was eaten. A meal row holds only the description, the ate-out flag and the time; whether
 * the meal happened is the meal habit's tick, so the day's score and the food log can never
 * disagree.
 */
export interface MealPatch {
  text?: string
  ate_out?: boolean
  protein?: boolean
  /** Local 'HH:MM', or null to clear. */
  time?: string | null
}

/**
 * Saves part of a meal. `[date+slot]` is the primary key, so this merges into one row.
 *
 * When a description is written for a meal that had none, the meal's habit is ticked as well —
 * writing down what you ate says that you ate. Clearing the text never unticks anything.
 */
export async function saveMeal(
  date: DateStr,
  slot: string,
  patch: MealPatch,
  ctx: WriteContext,
  link: { habitId?: number; time?: string | null } = {},
  database: AppDb = db,
): Promise<void> {
  assertEditable(date, ctx.today, ctx.windowDays)
  await database.transaction('rw', database.meals, database.habits, database.entries, async () => {
    const existing = await database.meals.get([date, slot])
    const next: Meal = { text: '', ate_out: false, time: null, ...existing, date, slot }
    if (patch.text !== undefined) next.text = patch.text.trim()
    if (patch.ate_out !== undefined) next.ate_out = patch.ate_out
    if (patch.protein !== undefined) next.protein = patch.protein
    if (patch.time !== undefined) next.time = patch.time
    const firstWords = next.text !== '' && !(existing?.text ?? '').trim()
    if (firstWords && !next.time && link.time) next.time = link.time
    await database.meals.put(next)

    if (!firstWords || link.habitId === undefined) return
    // Checked here rather than caught: an error thrown inside a nested Dexie transaction aborts
    // the outer one even when it is caught, which would lose the text that was just saved.
    const habit = await database.habits.get(link.habitId)
    const version = habit ? versionOn(habit, date) : null
    if (!habit || !version || !version.active || !version.sources.includes('manual')) return
    const entry = await database.entries.where('[habit_id+date]').equals([link.habitId, date]).first()
    if (entry?.done) return
    await setHabitDone(link.habitId, date, true, ctx, { time: link.time ?? null }, database)
  })
}

export async function mealsOn(date: DateStr, database: AppDb = db): Promise<Meal[]> {
  return database.meals.where('date').equals(date).toArray()
}

/** Meals in [from, to], newest day first. For the food history. */
export async function mealsBetween(from: DateStr, to: DateStr, database: AppDb = db): Promise<Meal[]> {
  const rows = await database.meals.where('date').between(from, to, true, true).toArray()
  return rows.filter((meal) => meal.text.trim() !== '' || meal.ate_out).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** How many favourites are offered for a meal. */
export const FAVOURITE_MEALS = 4

/** The descriptions written most often for a slot (at least twice), most frequent first. */
export function favouriteMeals(meals: readonly Meal[], slot: string, limit = FAVOURITE_MEALS): string[] {
  const counts = new Map<string, { text: string; count: number; last: DateStr }>()
  for (const meal of meals) {
    const text = meal.text.trim()
    if (meal.slot !== slot || !text) continue
    const key = text.toLowerCase()
    const row = counts.get(key)
    if (!row) counts.set(key, { text, count: 1, last: meal.date })
    else {
      row.count += 1
      // The spelling of the most recent use is the one offered.
      if (meal.date > row.last) {
        row.last = meal.date
        row.text = text
      }
    }
  }
  return [...counts.values()]
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, limit)
    .map((row) => row.text)
}
