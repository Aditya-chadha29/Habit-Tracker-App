import { db } from './db'
import { todayLocalStr } from './dates'
import { EXERCISE_LIBRARY } from './exerciseLibrary'
import { SUPPLEMENT_SEED, SUPERSEDED_HABIT_SHORT_NAME } from './supplementSeed'
import type { Polarity } from './types'

// Matches the habit list from the design handoff prototype (design_handoff_habit_tracker,
// byline "Aditya Chadha"). NS / NF are open items pending full display names from the owner.
const INITIAL_HABITS: [name: string, short_name: string, polarity: Polarity][] = [
  ['Wake up at 4:00 AM', 'Wake up 4 AM', 'do'],
  ['Brush with right hand', 'Brush right hand', 'do'],
  ['Water + chia seeds', 'Water + chia', 'do'],
  ['Soaked nuts / dry fruits', 'Soaked nuts', 'do'],
  ['Meditation (Isha Kriya)', 'Meditation', 'do'],
  ['Read / learn / writing', 'Read / write', 'do'],
  ['Useful / educational video', 'Educational video', 'do'],
  ['Gym / training', 'Gym', 'do'],
  ['Creatine', 'Creatine', 'do'],
  ['2.5–3 L water', '2.5–3 L water', 'do'],
  ['Skincare', 'Skincare', 'do'],
  ['Hair care', 'Hair care', 'do'],
  ['Sleep before 10:00 PM', 'Sleep before 10', 'do'],
  ['No alcohol', 'No alcohol', 'abstain'],
  ['No fast food', 'No fast food', 'abstain'],
  ['NS', 'NS', 'abstain'],
  ['NF', 'NF', 'abstain'],
  ['10 push-ups', '10 push-ups', 'do'],
  ['10 crunches', '10 crunches', 'do'],
  ['10 pull-ups', '10 pull-ups', 'do'],
  ['15 min walk / jog', '15 min walk', 'do'],
]

/** Seeds the owner's known habit list on first run only (habits table empty). */
export async function seedIfEmpty(): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    const count = await db.habits.count()
    if (count > 0) return
    const today = todayLocalStr()
    await db.habits.bulkAdd(
      INITIAL_HABITS.map(([name, short_name, polarity], i) => ({
        name,
        short_name,
        polarity,
        created_on: today,
        retired_on: null,
        sort_order: i,
      })),
    )
  })
}

/**
 * Gym and supplement seeds, added in schema v3. Each table is checked on its own rather than
 * piggy-backing on the habits check, so an existing user — whose habits were seeded weeks ago —
 * still gets these the first time they open the new version.
 */
export async function seedGymAndFoodIfEmpty(): Promise<void> {
  const today = todayLocalStr()

  await db.transaction('rw', db.exercises, async () => {
    if (await db.exercises.count()) return
    await db.exercises.bulkAdd(
      EXERCISE_LIBRARY.map(
        ([name, primary_muscle, equipment, kind, increment_kg, bar_weight_kg, rest_seconds], i) => ({
          name,
          primary_muscle,
          equipment,
          kind,
          increment_kg,
          bar_weight_kg,
          rest_seconds: rest_seconds || null,
          is_builtin: true,
          retired_on: null,
          sort_order: i,
          notes: '',
        }),
      ),
    )
  })

  // Seeding the supplements and retiring the habit they replace happen together: if only one of
  // the two landed, creatine would be ticked in two places or in none.
  await db.transaction('rw', db.supplements, db.habits, async () => {
    if (await db.supplements.count()) return
    await db.supplements.bulkAdd(
      SUPPLEMENT_SEED.map(
        ([name, dose_text, schedule, weekly_day, time_hint, servings_left, low_stock_at], i) => ({
          name,
          dose_text,
          schedule,
          weekly_day,
          time_hint,
          servings_left,
          low_stock_at,
          created_on: today,
          retired_on: null,
          sort_order: i,
        }),
      ),
    )

    // Retired, never deleted: every past tick stays and no past daily score changes. From today
    // forward it simply leaves the denominator, which is exactly what retirement is for.
    const superseded = await db.habits
      .filter((h) => h.short_name === SUPERSEDED_HABIT_SHORT_NAME && !h.retired_on)
      .first()
    if (superseded?.id) await db.habits.update(superseded.id, { retired_on: today })
  })
}
