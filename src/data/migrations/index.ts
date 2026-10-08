import type { AppDb } from '../db'
import { changeHabit, retireHabit } from '../habitRepo'
import { takeSnapshot } from '../backup'
import { readSettings, saveSettings, DATA_FORMAT, DEFAULT_PROMPTS } from '../settingsRepo'
import { EXERCISE_LIBRARY } from '../seed/exercises'
import { LEARNING_PILLAR_SEED } from '../seed/learning'
import { SEED_QUOTES } from '../seed/quotes'
import { MORE_QUOTES } from '../seed/quotesMore'
import { WORKOUT_ROUTINE_SEED } from '../seed/workoutRoutines'
import type {
  DateStr, Entry, Exercise, LegacyHabit, LegacySupplement, LegacySupplementLog, Session, SetLog,
  ThemePreference, WeeklyRecord,
} from '../types'
import { addDays, weekdayIndex } from '../../engine/dates'
import { planCutover, planDayRoutines, type CutoverReport } from './cutover'

/**
 * Data migrations: steps that change rows, as opposed to Dexie versions, which only add tables.
 *
 * Each step runs once per device. It runs inside a transaction together with the ledger row that
 * records it, so a step either happened completely and is recorded, or did not happen at all and
 * will be tried again on the next start. Before the first pending step, a copy of the whole
 * database is put in the backup store.
 *
 * Steps are never edited after they ship — a device that already ran one would not run the
 * edited version. A correction is a new step.
 */
export interface MigrationContext {
  db: AppDb
  today: DateStr
  now: number
  /** The theme the device was already using, carried into settings on first run. */
  theme: ThemePreference
}

export interface Migration {
  id: string
  run(ctx: MigrationContext): Promise<unknown>
}

export interface MigrationResult {
  ran: string[]
  snapshot: string | null
}

async function runCutover(ctx: MigrationContext): Promise<CutoverReport> {
  const { db, today, now } = ctx
  const plan = planCutover({
    today,
    now,
    habits: (await db.table('habits').toArray()) as LegacyHabit[],
    entries: (await db.entries.toArray()) as Entry[],
    supplements: (await db.supplements.toArray()) as LegacySupplement[],
    supplementLogs: (await db.supplement_logs.toArray()) as LegacySupplementLog[],
    sessions: (await db.sessions.toArray()) as Session[],
    setLogs: (await db.set_logs.toArray()) as SetLog[],
    exercises: (await db.exercises.toArray()) as Exercise[],
  })

  const ids: number[] = []
  for (const planned of plan.habits) {
    if (planned.habit.id !== undefined) {
      // put() replaces the whole row, which is what drops the pre-versioning fields.
      await db.habits.put(planned.habit)
      ids.push(planned.habit.id)
    } else {
      ids.push((await db.habits.add(planned.habit)) as number)
    }
  }

  if (plan.ticksToAdd.length) {
    await db.entries.bulkAdd(
      plan.ticksToAdd.map((tick) => ({
        habit_id: ids[tick.habitIndex],
        date: tick.date,
        done: true,
        value: null,
        note: '',
        time: null,
      })),
    )
  }
  for (const entryId of plan.entryIdsToMarkDone) await db.entries.update(entryId, { done: true })
  for (const patch of plan.sessionKinds) await db.sessions.update(patch.id, { kinds: patch.kinds })
  if (plan.quickSession) await db.sessions.add(plan.quickSession)

  const idByRole = new Map<string, number>()
  plan.habits.forEach((planned, i) => {
    if (planned.role && planned.habit.retired_on === null) idByRole.set(planned.role, ids[i])
  })
  if ((await db.day_routines.count()) === 0) await db.day_routines.bulkAdd(planDayRoutines(idByRole))

  await saveSettings(
    {
      theme: ctx.theme,
      cutover_date: plan.report.kind === 'existing' ? today : null,
      data_format: DATA_FORMAT,
      name: 'Aditya',
      focus: 'A better mind. A stronger body. Continuous learning.',
    },
    db,
  )
  return plan.report
}

async function seedTrainingLibrary({ db }: MigrationContext): Promise<{ exercises: number; routines: number }> {
  let exercises = 0
  let routines = 0
  if ((await db.exercises.count()) === 0) {
    await db.exercises.bulkAdd(
      EXERCISE_LIBRARY.map(([name, primary_muscle, equipment, kind, increment_kg, bar_weight_kg, rest_seconds], i) => ({
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
      })),
    )
    exercises = EXERCISE_LIBRARY.length
  }
  // Only into an empty table: once a routine exists the programme is the user's to change.
  if ((await db.routines.count()) === 0) {
    const library = await db.exercises.toArray()
    const idByName = new Map(library.map((e) => [e.name.toLowerCase(), e.id!]))
    for (const [order, routine] of WORKOUT_ROUTINE_SEED.entries()) {
      const routineId = (await db.routines.add({
        name: routine.name,
        day_hint: routine.weekdays.length ? routine.weekdays[0] + 1 : null,
        weekdays: routine.weekdays,
        sort_order: order,
        retired_on: null,
      })) as number
      let position = 0
      for (const exerciseName of routine.exercises) {
        const exerciseId = idByName.get(exerciseName.toLowerCase())
        if (!exerciseId) continue
        await db.routine_items.add({
          routine_id: routineId,
          exercise_id: exerciseId,
          position: position++,
          target_sets: 3,
          target_reps_low: null,
          target_reps_high: null,
          note: '',
        })
      }
      routines += 1
    }
  }
  return { exercises, routines }
}

/** FNV-1a. Identifies a built-in quote by its words, so the seed list can be reordered or added
 *  to without ever inserting one twice. */
export function quoteSeedKey(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `seed:${(hash >>> 0).toString(16)}`
}

const QUOTE_CATEGORIES: [RegExp, string][] = [
  [/disciplin|motivat|habit|consisten|repeated|every day|daily/i, 'Discipline'],
  [/health|body|sleep|water|rest|wealth/i, 'Health'],
  [/courage|risk|fear|brave/i, 'Courage'],
  [/learn|knowledge|wisdom|mind/i, 'Learning'],
  [/patien|persist|effort|journey|step/i, 'Resilience'],
]

export function guessQuoteCategory(text: string): string {
  return QUOTE_CATEGORIES.find(([pattern]) => pattern.test(text))?.[1] ?? 'Life'
}

async function seedQuotes(ctx: MigrationContext): Promise<{ added: number }> {
  return addSeedQuotes(ctx, SEED_QUOTES)
}

async function seedMoreQuotes(ctx: MigrationContext): Promise<{ added: number }> {
  return addSeedQuotes(ctx, MORE_QUOTES)
}

/** Adds built-in quotes that are not in the collection yet. Never touches a quote that is. */
async function addSeedQuotes({ db, today }: MigrationContext, list: readonly { text: string; attribution: string }[]): Promise<{ added: number }> {
  const existing = new Set((await db.quotes.toArray()).map((q) => q.seed_key).filter(Boolean))
  const rows = list.map((quote) => ({ quote, key: quoteSeedKey(quote.text) })).filter(({ key }) => !existing.has(key))
  await db.quotes.bulkAdd(
    rows.map(({ quote, key }) => ({
      text: quote.text,
      author: quote.attribution,
      category: guessQuoteCategory(quote.text),
      favorite: false,
      active: true,
      never_show: false,
      times_shown: 0,
      last_shown: null,
      note: '',
      created_on: today,
      seed_key: key,
    })),
  )
  return { added: rows.length }
}

/**
 * The user settled on four pillars: Self Growth, AI & Technology, Construction, Manufacturing.
 * The two that were seeded under other names are brought into line - but only where they are
 * still exactly as seeded and nothing is saved under them. Anything the user renamed or uses is
 * left alone, and the pillar that is then missing is added.
 */
async function fourPillars({ db }: MigrationContext): Promise<{ renamed: string[]; added: string[] }> {
  const renamed: string[] = []
  const added: string[] = []
  const pillars = await db.learning_pillars.toArray()
  const used = new Set((await db.learning_resources.toArray()).map((resource) => resource.pillar_id))
  const has = (name: string) => pillars.some((pillar) => pillar.name.toLowerCase() === name.toLowerCase())
  const wanted: { name: string; from: string; description: string; color: string }[] = [
    { name: 'Construction', from: 'Construction & Manufacturing', description: 'Construction: materials, methods, structures and how things are built.', color: 'body' },
    { name: 'Manufacturing', from: 'Technical / Professional', description: 'Manufacturing: processes, machines, quality and how things are made.', color: 'exercise' },
  ]
  let next = pillars.reduce((max, pillar) => Math.max(max, pillar.sort_order), -1) + 1
  for (const want of wanted) {
    if (has(want.name)) continue
    const old = pillars.find((pillar) => pillar.name === want.from && pillar.retired_on === null && !used.has(pillar.id!))
    if (old) {
      // Construction sits third and Manufacturing fourth, whichever row each one came from.
      await db.learning_pillars.update(old.id!, { name: want.name, description: want.description, color: want.color, sort_order: want.name === 'Construction' ? 2 : 3 })
      renamed.push(`${want.from} -> ${want.name}`)
    } else {
      await db.learning_pillars.add({ name: want.name, description: want.description, color: want.color, sort_order: next++, retired_on: null })
      added.push(want.name)
    }
  }
  return { renamed, added }
}

/**
 * The week now runs Sunday to Saturday. The setting is changed, and each weekly review - which is
 * stored under the first day of its week - moves to the Sunday just before its Monday, the new
 * week that shares six of its seven days. Its stored figures are dropped so they are worked out
 * again for the new week; what the user wrote is kept as it is.
 */
async function weekStartsSunday({ db }: MigrationContext): Promise<{ moved: number }> {
  await saveSettings({ week_start: 6 }, db)
  let moved = 0
  for (const review of await db.weekly_reviews.toArray()) {
    if (weekdayIndex(review.week_start) !== 0) continue
    const sunday = addDays(review.week_start, -1)
    if (await db.weekly_reviews.get(sunday)) continue
    await db.weekly_reviews.put({ ...review, week_start: sunday, week_end: addDays(sunday, 6), frozen: null, frozen_on: null })
    await db.weekly_reviews.delete(review.week_start)
    moved += 1
  }
  return { moved }
}

/**
 * The journal is one page a day. Its questions become the daily ones followed by the morning and
 * the evening ones, each once; the morning and evening lists are left as they are.
 */
async function oneJournalPage({ db }: MigrationContext): Promise<{ questions: number }> {
  const prompts = (await readSettings(db)).journal_prompts
  const daily = [...new Set([...prompts.daily, ...prompts.morning, ...prompts.evening].map((prompt) => prompt.trim()).filter(Boolean))]
  await saveSettings({ journal_prompts: { ...prompts, daily } }, db)
  return { questions: daily.length }
}

/**
 * The journal is written in the evening, to look back and prepare tomorrow (the user's request of
 * 2026-10-08). The morning questions come off the daily page; anything else the user put there
 * stays. Entries already written keep every answer they hold.
 */
async function eveningJournal({ db }: MigrationContext): Promise<{ questions: number }> {
  const prompts = (await readSettings(db)).journal_prompts
  const morning = new Set([...prompts.morning, ...DEFAULT_PROMPTS.morning].map((prompt) => prompt.trim()))
  const kept = prompts.daily.map((prompt) => prompt.trim()).filter((prompt) => prompt && !morning.has(prompt))
  const daily = kept.length ? kept : DEFAULT_PROMPTS.evening
  await saveSettings({ journal_prompts: { ...prompts, daily } }, db)
  return { questions: daily.length }
}

/**
 * A simpler day, at the user's request of 2026-10-08: no day routines; Water on waking, Cardio and
 * the three Daily 10s leave Today (exercise is Gym alone, and the rest is logged inside a
 * workout); Creatine sits with the other supplements; Vitamin D is taken on Sundays. Habits are retired from today, never
 * deleted, so every past day still reads as it did.
 */
const HAIR_RESET_FROM = "2026-10-04"
const HAIR_RESET_TO = "2026-10-08"
const RETIRED_FOR_SIMPLER_DAY = ['water on waking', 'cardio', '10 push-ups', '10 crunches', '10 pull-ups']

async function simplerDay({ db, today }: MigrationContext): Promise<{ retired: string[]; routines: number; moved: string[]; hair_reset: number }> {
  const retired: string[] = []
  const moved: string[] = []
  for (const habit of await db.habits.toArray()) {
    if (habit.id === undefined || habit.retired_on !== null) continue
    const name = habit.name.trim().toLowerCase()
    if (RETIRED_FOR_SIMPLER_DAY.includes(name)) {
      await retireHabit(habit.id, today, db)
      retired.push(habit.name)
      continue
    }
    const current = habit.versions[habit.versions.length - 1]
    if (name === 'creatine' && (current.area !== 'body' || current.group !== 'Supplements')) {
      await changeHabit(habit.id, { area: 'body', group: 'Supplements' }, today, db)
      moved.push(habit.name)
    }
    // Vitamin D moves from Monday to Sunday (weekday 6), from today on.
    if (name === 'vitamin d' && !(current.day.kind === 'weekdays' && current.day.weekdays.length === 1 && current.day.weekdays[0] === 6)) {
      await changeHabit(habit.id, { day: { kind: 'weekdays', weekdays: [6] } }, today, db)
      moved.push(habit.name)
    }
  }
  // The user also asked for Hair oiling to go back to 0 for the week they asked in. The dates are
  // fixed, so a device that first runs this in a later week does not lose that week's ticks.
  let hairReset = 0
  const hair = (await db.habits.toArray()).find((habit) => habit.name.trim().toLowerCase() === "hair oiling")
  if (hair?.id !== undefined) {
    const rows = await db.entries.where("habit_id").equals(hair.id).toArray()
    const keys = rows.filter((row) => row.date >= HAIR_RESET_FROM && row.date <= HAIR_RESET_TO).map((row) => row.id!)
    await db.entries.bulkDelete(keys)
    hairReset = keys.length
  }

  let routines = 0
  for (const routine of await db.day_routines.toArray()) {
    if (routine.id === undefined || routine.retired_on !== null) continue
    await db.day_routines.update(routine.id, { retired_on: today })
    routines += 1
  }
  return { retired, routines, moved, hair_reset: hairReset }
}

/**
 * Removes the duplicate Breakfast habit, at the user's request. It was created and retired on the
 * same day in August, so it was never due on any day and no score has ever counted it; the
 * Breakfast that is in use is untouched. Done only when that is exactly the situation.
 */
async function dropDuplicateBreakfast({ db }: MigrationContext): Promise<{ removed: number[] }> {
  const habits = await db.habits.toArray()
  const inUse = habits.some((habit) => habit.name.toLowerCase() === 'breakfast' && habit.retired_on === null)
  const removed: number[] = []
  if (!inUse) return { removed }
  for (const habit of habits) {
    if (habit.name.toLowerCase() !== 'breakfast' || habit.retired_on === null || habit.retired_on > habit.created_on) continue
    await db.entries.bulkDelete(await db.entries.where('habit_id').equals(habit.id!).primaryKeys())
    await db.habits.delete(habit.id!)
    removed.push(habit.id!)
  }
  return { removed }
}

async function seedLearningPillars({ db }: MigrationContext): Promise<{ added: number }> {
  if ((await db.learning_pillars.count()) > 0) return { added: 0 }
  await db.learning_pillars.bulkAdd(
    LEARNING_PILLAR_SEED.map((pillar, i) => ({ ...pillar, sort_order: i, retired_on: null })),
  )
  return { added: LEARNING_PILLAR_SEED.length }
}

/**
 * The old weekly record held one weight and one free-text note per week. The weight becomes a
 * dated weigh-in (it was taken at the end of the week, so it is dated to that week's last day,
 * or today for the week still running) and the note is carried into that week's review untouched.
 * The old rows are left exactly as they are.
 */
async function carryWeeklyRecords({ db, today, now }: MigrationContext): Promise<{ weights: number; notes: number }> {
  const records = (await db.weekly_records.toArray()) as WeeklyRecord[]
  let weights = 0
  let notes = 0
  const haveWeightOn = new Set((await db.weight_entries.toArray()).map((w) => w.date))
  for (const record of records) {
    if (typeof record.weight_kg === 'number') {
      const endOfWeek = addDays(record.week_monday, 6)
      const date = endOfWeek > today ? today : endOfWeek
      if (!haveWeightOn.has(date)) {
        await db.weight_entries.add({ date, kg: record.weight_kg, note: '', created_at: now })
        haveWeightOn.add(date)
        weights += 1
      }
    }
    if (record.notes?.trim() && !(await db.weekly_reviews.get(record.week_monday))) {
      await db.weekly_reviews.put({
        week_start: record.week_monday,
        week_end: addDays(record.week_monday, 6),
        reflection_good: '',
        reflection_bad: '',
        reflection_learned: '',
        reflection_change: '',
        next_week_notes: '',
        legacy_notes: record.notes,
        frozen: null,
        frozen_on: null,
        updated_at: now,
      })
      notes += 1
    }
  }
  return { weights, notes }
}

export const MIGRATIONS: Migration[] = [
  { id: '001-cutover', run: runCutover },
  { id: '002-training-library', run: seedTrainingLibrary },
  { id: '003-quotes', run: seedQuotes },
  { id: '004-learning-pillars', run: seedLearningPillars },
  { id: '005-weekly-records', run: carryWeeklyRecords },
  { id: '006-more-quotes', run: seedMoreQuotes },
  { id: '007-four-pillars', run: fourPillars },
  { id: '008-week-starts-sunday', run: weekStartsSunday },
  { id: '009-one-journal-page', run: oneJournalPage },
  { id: '010-drop-duplicate-breakfast', run: dropDuplicateBreakfast },
  { id: '011-evening-journal', run: eveningJournal },
  { id: '012-simpler-day', run: simplerDay },
]

export async function pendingMigrations(db: AppDb, migrations: Migration[] = MIGRATIONS): Promise<Migration[]> {
  const done = new Set(await db.migrations.toCollection().primaryKeys())
  return migrations.filter((m) => !done.has(m.id))
}

export async function runMigrations(
  ctx: MigrationContext,
  options: { migrations?: Migration[]; backupName?: string } = {},
): Promise<MigrationResult> {
  const { db, today, now } = ctx
  const pending = await pendingMigrations(db, options.migrations)
  if (!pending.length) return { ran: [], snapshot: null }

  // Nothing worth copying on a first-ever start; otherwise the state from just before the first
  // pending step is kept, so there is always a way back.
  let snapshot: string | null = null
  const hasData = (await db.table('habits').count()) > 0 || (await db.entries.count()) > 0
  if (hasData) snapshot = await takeSnapshot(db, `before-${pending[0].id}`, today, now, options.backupName)

  const ran: string[] = []
  for (const migration of pending) {
    const applied = await db.transaction('rw', db.tables, async () => {
      // Read again inside the transaction: another tab may have run this step since the list of
      // pending steps was made, and running it twice would convert already-converted rows.
      if (await db.migrations.get(migration.id)) return false
      const notes = await migration.run(ctx)
      await db.migrations.put({ id: migration.id, ran_on: today, ran_at: now, notes })
      return true
    })
    if (applied) ran.push(migration.id)
  }
  return { ran, snapshot }
}
