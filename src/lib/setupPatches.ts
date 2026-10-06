import { db } from './db'
import { todayLocalStr } from './dates'
import type { Polarity, Supplement } from './types'

/**
 * Corrections to the seeded data, applied to installs that were already seeded.
 *
 * Seeds only fire into an empty table, so a phone that has been running for weeks would never see
 * a change to the starter lists. Every step here checks the data itself rather than a "has run"
 * flag, which makes running it on every start harmless: nothing is added twice, and anything the
 * user has since renamed, edited or retired is left alone.
 */

const HABITS_TO_ADD: [name: string, short_name: string, polarity: Polarity][] = [
  ['10 push-ups', '10 push-ups', 'do'],
  ['10 crunches', '10 crunches', 'do'],
  ['10 pull-ups', '10 pull-ups', 'do'],
  ['15 min walk / jog', '15 min walk', 'do'],
]

type NewSupplement = Omit<Supplement, 'id' | 'created_on' | 'retired_on' | 'sort_order'>

const SUPPLEMENTS_TO_ADD: NewSupplement[] = [
  {
    name: 'Fish oil',
    dose_text: '2 capsules',
    schedule: 'daily',
    weekly_day: null,
    time_hint: 'morning',
    servings_left: null,
    low_stock_at: null,
  },
  {
    name: 'Yakult',
    dose_text: '1 bottle',
    schedule: 'daily',
    weekly_day: null,
    time_hint: 'anytime',
    servings_left: null,
    low_stock_at: null,
  },
]

export async function applyPendingSetup(): Promise<void> {
  const today = todayLocalStr()

  await db.transaction('rw', db.habits, async () => {
    const all = await db.habits.toArray()
    const taken = new Set(all.map((h) => h.name.toLowerCase()))
    const missing = HABITS_TO_ADD.filter(([name]) => !taken.has(name.toLowerCase()))
    if (!missing.length) return

    // created_on is today, so no past day's score changes — these simply start counting now.
    let sortOrder = all.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1
    await db.habits.bulkAdd(
      missing.map(([name, short_name, polarity]) => ({
        name,
        short_name,
        polarity,
        created_on: today,
        retired_on: null,
        sort_order: sortOrder++,
      })),
    )
  })

  await db.transaction('rw', db.supplements, async () => {
    const all = await db.supplements.toArray()
    const byName = new Map(all.map((s) => [s.name.toLowerCase(), s]))

    // Vitamin D is one dose a week, taken on Mondays (0 = Monday).
    const vitaminD = byName.get('vitamin d')
    if (vitaminD?.id && (vitaminD.schedule !== 'weekly' || vitaminD.weekly_day !== 0)) {
      await db.supplements.update(vitaminD.id, { schedule: 'weekly', weekly_day: 0 })
    }

    // Fish oil and omega-3 are the same capsule, so rename rather than add a second row to tick.
    const omega = byName.get('omega-3')
    if (omega?.id && !byName.has('fish oil')) {
      await db.supplements.update(omega.id, { name: 'Fish oil' })
      byName.set('fish oil', { ...omega, name: 'Fish oil' })
    }

    let sortOrder = all.reduce((max, s) => Math.max(max, s.sort_order), -1) + 1
    for (const supplement of SUPPLEMENTS_TO_ADD) {
      if (byName.has(supplement.name.toLowerCase())) continue
      await db.supplements.add({
        ...supplement,
        created_on: today,
        retired_on: null,
        sort_order: sortOrder++,
      })
    }
  })
}
