import type { AppDb } from '../db'
import { takeSnapshot } from '../backup'
import { saveSettings, DATA_FORMAT } from '../settingsRepo'
import { EXERCISE_LIBRARY } from '../seed/exercises'
import { LEARNING_PILLAR_SEED } from '../seed/learning'
import { SEED_QUOTES } from '../seed/quotes'
import { MORE_QUOTES } from '../seed/quotesMore'
import { WORKOUT_ROUTINE_SEED } from '../seed/workoutRoutines'
import type {
  DateStr, Entry, Exercise, LegacyHabit, LegacySupplement, LegacySupplementLog, Session, SetLog,
  ThemePreference, WeeklyRecord,
} from '../types'
import { addDays } from '../../engine/dates'
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
