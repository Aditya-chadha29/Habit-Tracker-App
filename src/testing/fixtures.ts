import type { AppDb } from '../data/db'
import type { Entry, LegacyHabit, WeeklyRecord } from '../data/types'
import { addDays, dateRange } from '../engine/dates'

/**
 * A stand-in for the phone the app is actually used on: the same nineteen habit rows the real
 * export contains (names, ids, dates and the duplicate retired "Breakfast" included), with
 * made-up ticks and weights in place of the real ones. The real export is personal data and
 * stays out of the repository; a second, local-only test runs against it when the file is there.
 */
type HabitRow = [id: number, name: string, short_name: string, polarity: 'do' | 'abstain', created: string, retired: string | null, sort: number]

const ROWS: HabitRow[] = [
  [1, 'Wake up at 4:00 AM', 'Wake up 4 AM', 'do', '2026-08-16', null, 0],
  [2, 'Brush with right hand', 'Brush right hand', 'do', '2026-08-16', null, 1],
  [3, 'Water + chia seeds', 'Water + chia', 'do', '2026-08-16', null, 2],
  [4, 'Soaked nuts / dry fruits', 'Soaked nuts', 'do', '2026-08-16', null, 3],
  [5, 'Meditation (Isha Kriya)', 'Meditation', 'do', '2026-08-16', null, 4],
  [6, 'Read / learn / writing', 'Read / write', 'do', '2026-08-16', null, 5],
  [7, 'Useful / educational video', 'Educational video', 'do', '2026-08-16', null, 6],
  [8, 'Gym / Exercise', 'Gym', 'do', '2026-08-16', null, 7],
  [9, 'Creatine', 'Creatine', 'do', '2026-08-16', null, 9],
  [10, '2.5–3 L water', '2.5–3 L water', 'do', '2026-08-16', null, 10],
  [11, 'Skincare', 'Skincare', 'do', '2026-08-16', null, 11],
  [12, 'Hair care', 'Hair care', 'do', '2026-08-16', null, 12],
  [13, 'Sleep before 10:00 PM', 'Sleep before 10', 'do', '2026-08-16', null, 13],
  [14, 'No alcohol', 'No alcohol', 'abstain', '2026-08-16', null, 14],
  [15, 'No fast food', 'No fast food', 'abstain', '2026-08-16', null, 15],
  [16, 'NS', 'NS', 'abstain', '2026-08-16', null, 16],
  [17, 'NF', 'NF', 'abstain', '2026-08-16', null, 17],
  [18, 'Breakfast', 'Breakfast', 'do', '2026-08-24', null, 8],
  [19, 'Breakfast', 'Breakfast', 'do', '2026-08-24', '2026-08-24', 18],
]

export const PHONE_FIRST_DAY = '2026-08-16'
export const PHONE_LAST_DAY = '2026-10-06'

export function phoneHabits(): LegacyHabit[] {
  return ROWS.map(([id, name, short_name, polarity, created_on, retired_on, sort_order]) => ({
    id, name, short_name, polarity, created_on, retired_on, sort_order,
  }))
}

/** mulberry32: a tiny seeded generator, so the "random" ticks are the same on every run. */
function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function phoneEntries(lastDay: string = PHONE_LAST_DAY, seed = 7): Entry[] {
  const random = generator(seed)
  const entries: Entry[] = []
  let id = 1
  for (const date of dateRange(PHONE_FIRST_DAY, lastDay)) {
    for (const [habitId, , , , created, retired] of ROWS) {
      if (created > date || (retired !== null && retired <= date)) continue
      const roll = random()
      if (roll < 0.72) entries.push({ id: id++, habit_id: habitId, date, done: true })
      else if (roll < 0.8) entries.push({ id: id++, habit_id: habitId, date, done: false })
    }
  }
  return entries
}

export function phoneWeeklyRecords(): WeeklyRecord[] {
  const weights: [string, number | null, string][] = [
    ['2026-08-10', 71.0, ''],
    ['2026-08-17', 70.6, 'Started waking earlier. Evenings slipped.'],
    ['2026-08-24', 70.6, 'Travel on two days.'],
    ['2026-08-03', null, ''],
    ['2026-08-31', 70.4, 'Good week for reading.'],
    ['2026-09-07', 70.9, ''],
    ['2026-09-14', 71.0, 'Gym four times.'],
    ['2026-09-21', 71.4, 'Late nights.'],
    ['2026-09-28', 71.8, ''],
  ]
  return weights.map(([week_monday, weight_kg, notes], i) => ({ id: i + 1, week_monday, weight_kg, notes }))
}

/** Puts the stand-in phone data into a database exactly as the original app stored it. */
export async function loadPhoneState(db: AppDb, lastDay: string = PHONE_LAST_DAY): Promise<void> {
  await db.table('habits').bulkAdd(phoneHabits())
  await db.table('entries').bulkAdd(phoneEntries(lastDay))
  await db.table('weekly_records').bulkAdd(phoneWeeklyRecords())
}

/** Loads a real export file's tables as they are. Returns what it found. */
export async function loadExport(db: AppDb, data: Record<string, unknown>): Promise<string[]> {
  const loaded: string[] = []
  for (const table of db.tables) {
    const rows = data[table.name]
    if (!Array.isArray(rows) || !rows.length) continue
    await table.bulkAdd(rows)
    loaded.push(table.name)
  }
  return loaded
}

export const dayAfter = (date: string): string => addDays(date, 1)
