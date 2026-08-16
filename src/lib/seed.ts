import { db } from './db'
import { todayLocalStr } from './dates'
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
