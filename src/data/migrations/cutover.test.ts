import { afterEach, describe, expect, it } from 'vitest'
import { listSnapshots, readSnapshot } from '../backup'
import { createDb, type AppDb } from '../db'
import { readSettings } from '../settingsRepo'
import type { Habit, LegacyHabit } from '../types'
import { buildCompletionIndex, entryKey } from '../../engine/completion'
import { addDays, dateRange } from '../../engine/dates'
import { legacyDayScore } from '../../engine/legacy'
import { periodOf } from '../../engine/periods'
import { dayScore } from '../../engine/score'
import { targetProgress } from '../../engine/targets'
import { currentVersion, habitProblems, isDueOn, nameOn, versionOn } from '../../engine/timeline'
import { loadExport, loadPhoneState, PHONE_FIRST_DAY, phoneEntries, phoneHabits } from '../../testing/fixtures'
import { legacyBoot } from '../../testing/legacy/boot'
import { MIGRATIONS, pendingMigrations, runMigrations, type Migration } from './index'
import { detectPatchDate, parseDose, planCutover } from './cutover'

const PATCH_DAY = '2026-10-06'
const CUTOVER_DAY = '2026-10-07'

let counter = 0
const open: AppDb[] = []

function freshDb(): { db: AppDb; backupName: string } {
  counter += 1
  const db = createDb(`cutover-test-${counter}`)
  open.push(db)
  return { db, backupName: `cutover-test-backups-${counter}` }
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

async function migrate(db: AppDb, backupName: string, today = CUTOVER_DAY) {
  return runMigrations({ db, today, now: 1_000, theme: 'dark' }, { backupName })
}

async function habitsByName(db: AppDb): Promise<Map<string, Habit>> {
  const all = await db.habits.toArray()
  return new Map(all.filter((h) => h.retired_on === null).map((h) => [h.name, h]))
}

async function indexFor(db: AppDb) {
  return buildCompletionIndex({
    entries: await db.entries.toArray(),
    sessions: await db.sessions.toArray(),
    learningSessions: [],
    journalDates: [],
  })
}

/** Scores every day before `until` with the old rules and the new ones, and lists differences. */
async function scoreDifferences(
  db: AppDb,
  legacyRows: LegacyHabit[],
  legacyDone: Set<string>,
  until: string,
  patchDate: string | null,
): Promise<string[]> {
  const habits = await db.habits.toArray()
  const index = await indexFor(db)
  const differences: string[] = []
  for (const date of dateRange(PHONE_FIRST_DAY, addDays(until, -1))) {
    const before = legacyDayScore(legacyRows, legacyDone, date, patchDate !== null && date >= patchDate)
    const after = dayScore(habits, date, index)
    if (before.done !== after.done || before.total !== after.due) {
      differences.push(`${date}: ${before.done}/${before.total} became ${after.done}/${after.due}`)
    }
  }
  return differences
}

const EXPECTED_ACTIVE = [
  'Wake up at 4:00 AM', 'Water on waking', 'Brush with right hand', 'Chia seeds', 'Creatine',
  'Soaked nuts / dry fruits', 'Meditation (Isha Kriya)', 'Hanuman Chalisa', 'Shiv Tandav Stotram',
  'Reading', 'Writing / reflection', 'Learning', 'Daily moisturiser', 'Hair oiling', 'Breakfast',
  'Lunch', 'Dinner', '2.5–3 L water', 'Fish oil', 'Vitamin D', 'Yakult', 'Sleep before 10:00 PM',
  'No alcohol', 'No fast food', 'NS', 'NF', 'Gym', 'Cardio', '10 push-ups', '10 crunches', '10 pull-ups',
]

async function expectFinalShape(db: AppDb): Promise<void> {
  const all = await db.habits.toArray()
  for (const habit of all) expect(habitProblems(habit), habit.name).toEqual([])

  const active = all.filter((h) => h.retired_on === null).sort((a, b) => a.sort_order - b.sort_order)
  expect(active.map((h) => h.name)).toEqual(EXPECTED_ACTIVE)

  const byName = new Map(active.map((h) => [h.name, h]))
  const now = (name: string) => currentVersion(byName.get(name)!)

  // History stays attached to the same rows.
  expect(byName.get('Wake up at 4:00 AM')!.id).toBe(1)
  expect(byName.get('Chia seeds')!.id).toBe(3)
  expect(byName.get('Reading')!.id).toBe(6)
  expect(byName.get('Learning')!.id).toBe(7)
  expect(byName.get('Gym')!.id).toBe(8)
  expect(byName.get('Creatine')!.id).toBe(9)
  expect(byName.get('Daily moisturiser')!.id).toBe(11)
  expect(byName.get('Hair oiling')!.id).toBe(12)
  expect(byName.get('Breakfast')!.id).toBe(18)

  expect(now('Gym')).toMatchObject({ area: 'exercise', day: { kind: 'daily' }, target: { per: 'week', count: 7 }, sources: ['workout'] })
  expect(now('Cardio')).toMatchObject({ area: 'exercise', sources: ['manual', 'cardio'], target: { per: 'week', count: 7 } })
  expect(now('Hair oiling')).toMatchObject({ day: { kind: 'flexible' }, target: { per: 'week', count: 2 }, group: 'Grooming' })
  expect(now('Reading')).toMatchObject({ area: 'mind', sources: ['manual', 'reading'] })
  expect(now('Writing / reflection').sources).toEqual(['manual', 'journal'])
  expect(now('Learning')).toMatchObject({ area: 'learning', sources: ['manual', 'learning'] })
  expect(now('Vitamin D').day).toEqual({ kind: 'weekdays', weekdays: [0] })

  expect(byName.get('Creatine')).toMatchObject({ kind: 'supplement', dose: { amount: 5, unit: 'g' } })
  expect(byName.get('Fish oil')).toMatchObject({ kind: 'supplement', dose: { amount: 2, unit: 'capsules' } })
  expect(byName.get('Chia seeds')!.kind).toBe('supplement')
  expect(byName.get('Breakfast')).toMatchObject({ kind: 'meal', meal_slot: 'breakfast' })
  expect(byName.get('Dinner')).toMatchObject({ kind: 'meal', meal_slot: 'dinner' })
  expect(byName.get('No alcohol')!.polarity).toBe('abstain')
  expect(byName.get('10 push-ups')!.measure).toEqual({ type: 'count', target: 10, unit: 'reps' })

  // The duplicate Breakfast that was retired in August stays retired and untouched.
  const duplicate = all.find((h) => h.id === 19)!
  expect(duplicate.retired_on).not.toBeNull()
  expect(isDueOn(duplicate, CUTOVER_DAY)).toBe(false)

  // No leftovers from the pre-versioning shape.
  for (const habit of all) {
    expect(habit).not.toHaveProperty('category')
    expect(habit).not.toHaveProperty('schedule')
    expect(habit).not.toHaveProperty('times_per_week')
  }

  // The day's routines point at real, active habits.
  const routines = await db.day_routines.orderBy('sort_order').toArray()
  expect(routines.map((r) => r.name)).toEqual(['Morning routine', 'Evening routine'])
  const activeIds = new Set(active.map((h) => h.id))
  for (const routine of routines) {
    for (const step of routine.steps) {
      if (step.habit_id !== null) expect(activeIds.has(step.habit_id)).toBe(true)
      else expect(step.label).not.toBe('')
    }
  }
  expect(routines[0].steps[0]).toMatchObject({ habit_id: 1, time: '04:00' })

  const settings = await readSettings(db)
  expect(settings.cutover_date).toBe(CUTOVER_DAY)
  expect(settings.theme).toBe('dark')
}

describe('a phone that never saw the 6 October build', () => {
  it('keeps every past day scoring exactly as it did', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    const legacyRows = phoneHabits()
    const legacyDone = new Set(phoneEntries().filter((e) => e.done).map((e) => entryKey(e.habit_id, e.date)))

    const result = await migrate(db, backupName)
    expect(result.ran).toEqual(MIGRATIONS.map((m) => m.id))

    expect(await scoreDifferences(db, legacyRows, legacyDone, CUTOVER_DAY, null)).toEqual([])
    const ledger = await db.migrations.get('001-cutover')
    expect(ledger?.notes).toMatchObject({ kind: 'existing', patch_date: null, parity: { mismatches: [] } })
  })

  it('ends in the new layout with every history still attached', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await migrate(db, backupName)
    await expectFinalShape(db)
  })

  it('does not lose or alter a single tick', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    const before = phoneEntries()
    await migrate(db, backupName)
    const after = new Map((await db.entries.toArray()).map((e) => [e.id, e]))
    for (const entry of before) expect(after.get(entry.id)).toMatchObject(entry)
    expect(after.size).toBe(before.length)
  })

  it('shows old days under the names they had then', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await migrate(db, backupName)
    const byName = await habitsByName(db)
    expect(nameOn(byName.get('Reading')!, '2026-09-01')).toBe('Read / learn / writing')
    expect(nameOn(byName.get('Hair oiling')!, '2026-09-01')).toBe('Hair care')
    expect(nameOn(byName.get('Gym')!, '2026-09-01')).toBe('Gym / Exercise')
    expect(nameOn(byName.get('Gym')!, CUTOVER_DAY)).toBe('Gym')
  })

  it('makes hair oiling a weekly target from the cutover, counting this week’s earlier ticks', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await db.table('entries').where('[habit_id+date]').equals([12, '2026-10-05']).delete()
    await db.table('entries').where('[habit_id+date]').equals([12, '2026-10-06']).delete()
    await db.table('entries').add({ habit_id: 12, date: '2026-10-05', done: true })
    await migrate(db, backupName)
    const hair = (await habitsByName(db)).get('Hair oiling')!
    expect(isDueOn(hair, '2026-10-06')).toBe(true) // still a daily habit the day before
    expect(isDueOn(hair, CUTOVER_DAY)).toBe(false)
    const progress = targetProgress(hair, periodOf('week', CUTOVER_DAY), CUTOVER_DAY, await indexFor(db))!
    expect([progress.done, progress.target]).toEqual([1, 2])
  })

  it('turns a Gym tick made earlier today into a recorded workout', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await db.table('entries').add({ habit_id: 8, date: CUTOVER_DAY, done: true })
    await migrate(db, backupName)
    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ date: CUTOVER_DAY, quick: true, title: 'Gym' })
    const gym = (await habitsByName(db)).get('Gym')!
    expect(dayScore([gym], CUTOVER_DAY, await indexFor(db))).toMatchObject({ done: 1, due: 1 })
  })

  it('records no workout when Gym was not ticked today', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await migrate(db, backupName)
    expect(await db.sessions.count()).toBe(0)
  })

  it('seeds the training library, the programme, the quotes and the learning pillars once', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await migrate(db, backupName)
    expect(await db.exercises.count()).toBe(76)
    const routines = await db.routines.orderBy('sort_order').toArray()
    expect(routines.map((r) => r.name)).toEqual([
      'Legs + Shoulders', 'Cardio', 'Chest + Triceps', 'Back + Biceps', 'Shoulders + Arms + Core',
    ])
    expect(routines.find((r) => r.name === 'Chest + Triceps')!.weekdays).toEqual([1])
    expect(await db.routine_items.count()).toBeGreaterThan(20)
    // The first collection and the fifty added later, each exactly once.
    expect(await db.quotes.count()).toBe(110)
    expect((await db.learning_pillars.orderBy('sort_order').toArray()).map((p) => p.name)).toEqual([
      'Self Growth', 'AI & Technology', 'Construction', 'Manufacturing',
    ])
  })

  it('carries weekly weights into dated weigh-ins and weekly notes into reviews', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await migrate(db, backupName)
    const weights = await db.weight_entries.orderBy('date').toArray()
    expect(weights).toHaveLength(8)
    expect(weights[0]).toMatchObject({ date: '2026-08-16', kg: 71.0 })
    expect(weights[weights.length - 1]).toMatchObject({ date: '2026-10-04', kg: 71.8 })
    const review = await db.weekly_reviews.get('2026-08-16')
    expect(review).toMatchObject({ week_end: '2026-08-22', legacy_notes: 'Started waking earlier. Evenings slipped.', frozen: null })
    expect(await db.weekly_reviews.count()).toBe(5)
    // The old rows are still there, untouched.
    expect(await db.weekly_records.count()).toBe(9)
  })

  it('keeps a copy of everything from before it started', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    const result = await migrate(db, backupName)
    const [summary] = await listSnapshots(backupName)
    expect(summary.id).toBe(result.snapshot)
    const snapshot = await readSnapshot(summary.id, backupName)
    expect(snapshot!.tables.habits).toHaveLength(19)
    expect(snapshot!.tables.entries).toHaveLength(phoneEntries().length)
    expect((snapshot!.tables.habits[11] as LegacyHabit).name).toBe('Hair care')
  })
})

describe('a phone that had already run the 6 October build', () => {
  async function patchedPhone() {
    const made = freshDb()
    await loadPhoneState(made.db)
    await legacyBoot(made.db, PATCH_DAY)
    // That build ran on every start, so run it again as it would have the next morning.
    await legacyBoot(made.db, CUTOVER_DAY)
    return made
  }

  it('arrives in exactly the same layout', async () => {
    const { db, backupName } = await patchedPhone()
    await migrate(db, backupName)
    await expectFinalShape(db)
  })

  it('keeps past days as they were seen — and gives hair care its past back', async () => {
    const { db, backupName } = await patchedPhone()
    const legacyRows = (await db.table('habits').toArray()) as LegacyHabit[]
    const legacyDone = new Set(phoneEntries().filter((e) => e.done).map((e) => entryKey(e.habit_id, e.date)))
    expect(detectPatchDate(legacyRows, CUTOVER_DAY)).toBe(PATCH_DAY)

    await migrate(db, backupName)
    expect(await scoreDifferences(db, legacyRows, legacyDone, CUTOVER_DAY, PATCH_DAY)).toEqual([])

    // The repair: before the patch day hair care was a daily habit, and it reads that way again.
    const hair = (await db.habits.get(12))!
    expect(isDueOn(hair, '2026-09-15')).toBe(true)
    expect(nameOn(hair, '2026-09-15')).toBe('Hair care')
    expect(isDueOn(hair, PATCH_DAY)).toBe(false)
    expect(nameOn(hair, PATCH_DAY)).toBe('Hair oiling')

    // And it matches the phone that never saw that build, for every day before the patch.
    const other = freshDb()
    await loadPhoneState(other.db)
    await migrate(other.db, other.backupName)
    const index = await indexFor(db)
    const otherIndex = await indexFor(other.db)
    const mine = await db.habits.toArray()
    const theirs = await other.db.habits.toArray()
    for (const date of dateRange(PHONE_FIRST_DAY, addDays(PATCH_DAY, -1))) {
      const a = dayScore(mine, date, index)
      const b = dayScore(theirs, date, otherIndex)
      expect([a.done, a.due], date).toEqual([b.done, b.due])
    }
  })

  it('brings creatine and chia back as supplements with their whole history', async () => {
    const { db, backupName } = await patchedPhone()
    await db.table('supplement_logs').bulkAdd([
      { supplement_id: 1, date: PATCH_DAY, taken: true }, // Creatine
      { supplement_id: 4, date: PATCH_DAY, taken: true }, // Fish oil
      { supplement_id: 4, date: CUTOVER_DAY, taken: true },
      { supplement_id: 5, date: PATCH_DAY, taken: false }, // Yakult, explicitly skipped
    ])
    const ticksBefore = (await db.entries.where('habit_id').equals(9).toArray()).filter((e) => e.done).length
    await migrate(db, backupName)

    const creatine = (await db.habits.get(9))!
    expect(creatine.retired_on).toBeNull()
    expect(isDueOn(creatine, '2026-09-10')).toBe(true)
    expect(isDueOn(creatine, PATCH_DAY)).toBe(false) // the one day it lived on the supplements list
    expect(isDueOn(creatine, CUTOVER_DAY)).toBe(true)
    const ticksAfter = (await db.entries.where('habit_id').equals(9).toArray()).filter((e) => e.done).length
    expect(ticksAfter).toBeGreaterThanOrEqual(ticksBefore)

    const fishOil = (await habitsByName(db)).get('Fish oil')!
    expect(fishOil.dose).toEqual({ amount: 2, unit: 'capsules' })
    expect(isDueOn(fishOil, PATCH_DAY)).toBe(false)
    expect(isDueOn(fishOil, CUTOVER_DAY)).toBe(true)
    const fishTicks = await db.entries.where('habit_id').equals(fishOil.id!).toArray()
    expect(fishTicks.map((e) => e.date).sort()).toEqual([PATCH_DAY, CUTOVER_DAY])

    const yakult = (await habitsByName(db)).get('Yakult')!
    expect(await db.entries.where('habit_id').equals(yakult.id!).count()).toBe(0)
  })

  it('leaves behind supplements nobody asked for and nobody used', async () => {
    const { db, backupName } = await patchedPhone()
    await migrate(db, backupName)
    const names = (await db.habits.toArray()).map((h) => h.name)
    expect(names).not.toContain('Whey protein')
    expect(names).not.toContain('Multivitamin')
    const report = (await db.migrations.get('001-cutover'))!.notes as { supplements_left_behind: string[] }
    expect(report.supplements_left_behind.sort()).toEqual(['Multivitamin', 'Whey protein'])
    // The old rows are still on the device and in every export.
    expect(await db.supplements.count()).toBe(7)
  })

  it('carries over an unrequested supplement that was actually being taken', async () => {
    const { db, backupName } = await patchedPhone()
    await db.table('supplement_logs').add({ supplement_id: 2, date: PATCH_DAY, taken: true }) // Whey
    await migrate(db, backupName)
    const whey = (await habitsByName(db)).get('Whey protein')!
    expect(whey).toMatchObject({ kind: 'supplement', dose: { amount: 1, unit: 'scoop' } })
    expect(isDueOn(whey, CUTOVER_DAY)).toBe(true)
  })

  it('respects a habit the user had retired themselves', async () => {
    const { db, backupName } = await patchedPhone()
    const lunch = ((await db.table('habits').toArray()) as LegacyHabit[]).find((h) => h.name === 'Lunch')!
    await db.table('habits').update(lunch.id!, { retired_on: CUTOVER_DAY })
    await migrate(db, backupName)
    const after = (await db.habits.get(lunch.id!))!
    expect(after.retired_on).toBe(CUTOVER_DAY)
    expect((await db.habits.toArray()).filter((h) => h.name === 'Lunch')).toHaveLength(1)
  })

  it('keeps training sessions logged under that build, and notes what they contained', async () => {
    const { db, backupName } = await patchedPhone()
    const bench = (await db.exercises.toArray()).find((e) => e.name === 'Barbell Bench Press')!
    const run = (await db.exercises.toArray()).find((e) => e.name === 'Treadmill / Run')!
    const lifting = await db.table('sessions').add({ date: PATCH_DAY, routine_id: null, title: 'Chest + Triceps', started_at: 1, ended_at: 2, notes: '', rest_started_at: null, rest_seconds: null })
    const cardio = await db.table('sessions').add({ date: CUTOVER_DAY, routine_id: null, title: 'Cardio', started_at: 3, ended_at: 4, notes: '', rest_started_at: null, rest_seconds: null })
    const set = { position: 0, set_index: 1, weight_kg: 60, reps: 10, seconds: null, distance_m: null, rir: null, kind: 'work', done: true, done_at: 1, note: '' }
    await db.table('set_logs').add({ ...set, session_id: lifting, exercise_id: bench.id, date: PATCH_DAY })
    await db.table('set_logs').add({ ...set, session_id: cardio, exercise_id: run.id, date: CUTOVER_DAY, weight_kg: null, reps: null, seconds: 900 })
    await db.table('entries').add({ habit_id: 8, date: CUTOVER_DAY, done: true }) // the old build's auto-tick

    await migrate(db, backupName)
    expect((await db.sessions.get(lifting as number))!.kinds).toEqual(['strength'])
    expect((await db.sessions.get(cardio as number))!.kinds).toEqual(['cardio'])
    // A real session exists for today, so no stand-in workout is invented.
    expect(await db.sessions.count()).toBe(2)
    const byName = await habitsByName(db)
    const index = await indexFor(db)
    expect(dayScore([byName.get('Gym')!, byName.get('Cardio')!], CUTOVER_DAY, index)).toMatchObject({ done: 2, due: 2 })
  })

  it('works when that build first ran on the cutover day itself', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await legacyBoot(db, CUTOVER_DAY)
    await migrate(db, backupName)
    await expectFinalShape(db)
    const hair = (await db.habits.get(12))!
    expect(isDueOn(hair, PATCH_DAY)).toBe(true)
    expect(versionOn(hair, CUTOVER_DAY)!.day).toEqual({ kind: 'flexible' })
  })
})

describe('a device that last ran one of the earlier 6 October builds', () => {
  // The first build of that day seeded a supplements list and, in the same step, retired the
  // Creatine habit the list replaced. It knew nothing about schedules, so it left no patch date.
  const FIRST_SEED: [name: string, dose_text: string, schedule: string, weekly_day: number | null][] = [
    ['Creatine', '5 g', 'daily', null],
    ['Whey protein', '1 scoop', 'daily', null],
    ['Multivitamin', '1 tablet', 'daily', null],
    ['Omega-3', '2 capsules', 'daily', null],
    ['Vitamin D', '60,000 IU', 'weekly', 6],
  ]

  async function seedSupplements(db: AppDb, day: string) {
    await db.table('supplements').bulkAdd(
      FIRST_SEED.map(([name, dose_text, schedule, weekly_day], i) => ({
        name, dose_text, schedule, weekly_day, time_hint: 'anytime', servings_left: null, low_stock_at: null,
        created_on: day, retired_on: null, sort_order: i,
      })),
    )
  }

  async function firstBuildOnly(day = PATCH_DAY) {
    const made = freshDb()
    await loadPhoneState(made.db)
    await seedSupplements(made.db, day)
    await made.db.table('habits').update(9, { retired_on: day })
    return made
  }

  it('arrives in exactly the same layout', async () => {
    const { db, backupName } = await firstBuildOnly()
    expect(detectPatchDate((await db.table('habits').toArray()) as LegacyHabit[], CUTOVER_DAY)).toBeNull()
    await migrate(db, backupName)
    await expectFinalShape(db)
  })

  it('keeps every past day scoring exactly as it did', async () => {
    const { db, backupName } = await firstBuildOnly()
    const legacyRows = (await db.table('habits').toArray()) as LegacyHabit[]
    const legacyDone = new Set(phoneEntries().filter((e) => e.done).map((e) => entryKey(e.habit_id, e.date)))
    await migrate(db, backupName)
    expect(await scoreDifferences(db, legacyRows, legacyDone, CUTOVER_DAY, null)).toEqual([])
    const report = (await db.migrations.get('001-cutover'))!.notes as { parity: { days_checked: number; mismatches: unknown[] } }
    expect(report.parity.days_checked).toBeGreaterThan(0)
    expect(report.parity.mismatches).toEqual([])
  })

  it('brings creatine back as one supplement, with its history and the day it spent on the list', async () => {
    const { db, backupName } = await firstBuildOnly()
    await db.table('supplement_logs').add({ supplement_id: 1, date: PATCH_DAY, taken: true })
    await migrate(db, backupName)

    const creatine = (await db.habits.get(9))!
    expect(creatine).toMatchObject({ kind: 'supplement', retired_on: null, dose: { amount: 5, unit: 'g' } })
    expect(isDueOn(creatine, '2026-09-10')).toBe(true)
    expect(isDueOn(creatine, PATCH_DAY)).toBe(false)
    expect(isDueOn(creatine, CUTOVER_DAY)).toBe(true)
    expect((await db.habits.toArray()).filter((h) => h.name === 'Creatine')).toHaveLength(1)
    const onTheList = (await db.entries.where('habit_id').equals(9).toArray()).filter((e) => e.date === PATCH_DAY)
    expect(onTheList.map((e) => e.done)).toEqual([true])
    const report = (await db.migrations.get('001-cutover'))!.notes as { reactivated: string[] }
    expect(report.reactivated).toContain('Creatine')
  })

  it('moves vitamin D to Mondays, as the later builds did', async () => {
    const { db, backupName } = await firstBuildOnly()
    await migrate(db, backupName)
    expect(currentVersion((await habitsByName(db)).get('Vitamin D')!).day).toEqual({ kind: 'weekdays', weekdays: [0] })
  })

  it('keeps a vitamin D day the user had chosen themselves', async () => {
    const { db, backupName } = await firstBuildOnly()
    await db.table('supplements').update(5, { weekly_day: 3 })
    await migrate(db, backupName)
    expect(currentVersion((await habitsByName(db)).get('Vitamin D')!).day).toEqual({ kind: 'weekdays', weekdays: [3] })
  })

  it('calls the omega-3 capsules fish oil, at the dose they had', async () => {
    const { db, backupName } = await firstBuildOnly()
    await migrate(db, backupName)
    const byName = await habitsByName(db)
    expect(byName.get('Fish oil')!.dose).toEqual({ amount: 2, unit: 'capsules' })
    expect(byName.has('Omega-3')).toBe(false)
  })

  it('leaves creatine retired when the user had retired it before any of that', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await db.table('habits').update(9, { retired_on: '2026-09-20' })
    // The seed only retired a habit that was still active, so this one kept its own date.
    await seedSupplements(db, PATCH_DAY)
    await migrate(db, backupName)

    expect((await db.habits.get(9))!.retired_on).toBe('2026-09-20')
    expect((await habitsByName(db)).has('Creatine')).toBe(false)
  })

  it('brings creatine back when the later build arrived on a different day', async () => {
    const { db, backupName } = await firstBuildOnly('2026-10-05')
    await legacyBoot(db, PATCH_DAY)
    await migrate(db, backupName)
    await expectFinalShape(db)

    const creatine = (await db.habits.get(9))!
    expect(isDueOn(creatine, '2026-10-04')).toBe(true)
    expect(isDueOn(creatine, '2026-10-05')).toBe(false)
    expect(isDueOn(creatine, CUTOVER_DAY)).toBe(true)
  })
})
describe('a brand-new install', () => {
  it('starts with the seeded personal system and no history', async () => {
    const { db, backupName } = freshDb()
    const result = await migrate(db, backupName)
    expect(result.snapshot).toBeNull()
    const habits = await db.habits.orderBy('sort_order').toArray()
    expect(habits.map((h) => h.name)).toEqual([
      'Wake up at 4:00 AM', 'Water on waking', 'Chia seeds', 'Creatine', 'Meditation (Isha Kriya)',
      'Hanuman Chalisa', 'Shiv Tandav Stotram', 'Reading', 'Writing / reflection', 'Learning',
      'Daily moisturiser', 'Hair oiling', 'Breakfast', 'Lunch', 'Dinner', 'Fish oil', 'Vitamin D',
      'Gym', 'Cardio', '10 push-ups', '10 crunches', '10 pull-ups',
    ])
    for (const habit of habits) {
      expect(habitProblems(habit)).toEqual([])
      expect(habit.created_on).toBe(CUTOVER_DAY)
    }
    expect(await db.entries.count()).toBe(0)
    expect((await readSettings(db)).cutover_date).toBeNull()
    expect(await db.day_routines.count()).toBe(2)
    expect(await db.exercises.count()).toBe(76)
  })
})

describe('running safely', () => {
  it('runs each step once: a second start changes nothing', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await migrate(db, backupName)
    const habits = await db.habits.toArray()
    const entries = await db.entries.count()
    const second = await migrate(db, backupName, '2026-10-08')
    expect(second).toEqual({ ran: [], snapshot: null })
    expect(await db.habits.toArray()).toEqual(habits)
    expect(await db.entries.count()).toBe(entries)
    expect(await pendingMigrations(db)).toEqual([])
  })

  it('a step that fails leaves the database exactly as it was and is retried next time', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    const before = await db.table('habits').toArray()
    const failing: Migration[] = [
      {
        id: '001-cutover',
        run: async (ctx) => {
          await ctx.db.table('habits').clear()
          throw new Error('boom')
        },
      },
    ]
    await expect(
      runMigrations({ db, today: CUTOVER_DAY, now: 1, theme: 'system' }, { migrations: failing, backupName }),
    ).rejects.toThrow('boom')
    expect(await db.table('habits').toArray()).toEqual(before)
    expect(await db.migrations.count()).toBe(0)
    // The copy taken beforehand is there regardless.
    expect(await listSnapshots(backupName)).toHaveLength(1)

    await migrate(db, backupName)
    await expectFinalShape(db)
  })

  it('leaves rows alone that are already in the new shape', async () => {
    const { db, backupName } = freshDb()
    await loadPhoneState(db)
    await migrate(db, backupName)
    const converted = (await db.table('habits').toArray()) as LegacyHabit[]
    const plan = planCutover({
      today: '2026-10-09', now: 2, habits: converted, entries: [], supplements: [], supplementLogs: [],
      sessions: [], setLogs: [], exercises: [],
    })
    expect(plan.habits.map((p) => p.habit)).toEqual(converted)
    expect(plan.report.added).toEqual([])
  })
})

describe('small parts', () => {
  it('reads a dose out of free text', () => {
    expect(parseDose('5 g')).toEqual({ amount: 5, unit: 'g' })
    expect(parseDose('60,000 IU')).toEqual({ amount: 60000, unit: 'IU' })
    expect(parseDose('1 scoop')).toEqual({ amount: 1, unit: 'scoop' })
    expect(parseDose('2.5ml')).toEqual({ amount: 2.5, unit: 'ml' })
    expect(parseDose('a pinch')).toEqual({ amount: null, unit: 'a pinch' })
    expect(parseDose('  ')).toBeNull()
  })

  it('finds no patch date on a phone that never ran that build', () => {
    expect(detectPatchDate(phoneHabits(), CUTOVER_DAY)).toBeNull()
  })
})

// Runs against the user's real export when it is on this machine. The file is personal data and
// is never committed, so everywhere else this block is skipped.
const REAL_EXPORTS = import.meta.glob<Record<string, unknown>>(
  '../../../Exported Data/habit-tracker-export-2026-10-06.json',
  { eager: true, import: 'default' },
)
const realExport = Object.values(REAL_EXPORTS)[0]

describe.skipIf(!realExport)('the real phone export', () => {
  const data = realExport ?? {}
  const legacyRows = (data.habits ?? []) as LegacyHabit[]
  const entries = (data.entries ?? []) as { habit_id: number; date: string; done: boolean }[]
  const legacyDone = new Set(entries.filter((e) => e.done).map((e) => entryKey(e.habit_id, e.date)))

  it('migrates straight from the export with every past score unchanged', async () => {
    const { db, backupName } = freshDb()
    await loadExport(db, data)
    await migrate(db, backupName)
    expect(await scoreDifferences(db, legacyRows, legacyDone, CUTOVER_DAY, null)).toEqual([])
    await expectFinalShape(db)
    expect(await db.entries.count()).toBe(entries.length)
    expect(((await db.migrations.get('001-cutover'))!.notes as { parity: { mismatches: unknown[] } }).parity.mismatches).toEqual([])
  })

  it('migrates after the 6 October build had run, with the same result', async () => {
    const { db, backupName } = freshDb()
    await loadExport(db, data)
    await legacyBoot(db, PATCH_DAY)
    await legacyBoot(db, CUTOVER_DAY)
    const patchedRows = (await db.table('habits').toArray()) as LegacyHabit[]
    await migrate(db, backupName)
    expect(await scoreDifferences(db, patchedRows, legacyDone, CUTOVER_DAY, PATCH_DAY)).toEqual([])
    await expectFinalShape(db)
    expect(((await db.migrations.get('001-cutover'))!.notes as { parity: { mismatches: unknown[] } }).parity.mismatches).toEqual([])
  })
})
