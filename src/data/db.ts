import Dexie, { type DBCore, type EntityTable, type Table } from 'dexie'
import { notifyLocalChange } from './changes'
import type {
  DailyNote, DayRoutine, Entry, Exercise, Habit, JournalEntry, LearningPillar, LearningResource,
  LearningSession, LegacySupplement, LegacySupplementLog, Meal, MigrationRow, Quote, QuoteDay,
  RoutineItem, Session, SetLog, SettingRow, WeeklyRecord, WeeklyReview, WeightEntry, WorkoutRoutine,
} from './types'

export type AppDb = Dexie & {
  habits: EntityTable<Habit, 'id'>
  entries: EntityTable<Entry, 'id'>
  /** Legacy: weekly weight and notes from before weight entries and weekly reviews existed. */
  weekly_records: EntityTable<WeeklyRecord, 'id'>
  /** Legacy: never written to. */
  daily_notes: EntityTable<DailyNote, 'date'>
  exercises: EntityTable<Exercise, 'id'>
  routines: EntityTable<WorkoutRoutine, 'id'>
  routine_items: EntityTable<RoutineItem, 'id'>
  sessions: EntityTable<Session, 'id'>
  set_logs: EntityTable<SetLog, 'id'>
  meals: Table<Meal, [string, string]>
  /** Legacy: supplements became habit rows at the cutover. */
  supplements: EntityTable<LegacySupplement, 'id'>
  supplement_logs: Table<LegacySupplementLog, [number, string]>
  // v4
  settings: Table<SettingRow, string>
  migrations: Table<MigrationRow, string>
  weight_entries: EntityTable<WeightEntry, 'id'>
  weekly_reviews: Table<WeeklyReview, string>
  journal_entries: EntityTable<JournalEntry, 'id'>
  quotes: EntityTable<Quote, 'id'>
  quote_days: Table<QuoteDay, string>
  learning_pillars: EntityTable<LearningPillar, 'id'>
  learning_resources: EntityTable<LearningResource, 'id'>
  learning_sessions: EntityTable<LearningSession, 'id'>
  day_routines: EntityTable<DayRoutine, 'id'>
}

export const DB_NAME = 'habit-tracker'

/**
 * Builds a database handle. The app uses the one exported below; tests build their own under a
 * throwaway name so each starts empty.
 *
 * Shipped versions are never edited: a device still running an older cached bundle has to be able
 * to reconcile the schema already on its disk. New tables go in a new version, and only the new
 * tables are listed in it — naming an existing table REPLACES its whole index list, which is how
 * `&[habit_id+date]` would get silently dropped.
 *
 * No version has an upgrade() callback. A throwing upgrader is the one failure that can leave the
 * database unopenable, so data is transformed afterwards by the ledgered steps in
 * data/migrations, each inside an ordinary transaction that can simply roll back.
 *
 * Booleans are never indexed: IndexedDB silently refuses to index them, so such an index would
 * look fine and quietly match nothing. A nullable `retired_on` index only holds the non-null
 * rows, so "active" is always filtered in code.
 */
export function createDb(name: string = DB_NAME): AppDb {
  const database = new Dexie(name) as AppDb

  database.version(1).stores({
    habits: '++id, sort_order, created_on, retired_on',
    entries: '++id, &[habit_id+date], date, habit_id',
    weekly_records: '++id, &week_monday',
  })

  database.version(2).stores({
    daily_notes: 'date',
  })

  database.version(3).stores({
    exercises: '++id, name, primary_muscle, equipment, sort_order, retired_on',
    routines: '++id, sort_order, day_hint, retired_on',
    routine_items: '++id, routine_id, [routine_id+position], exercise_id',
    sessions: '++id, date, routine_id',
    set_logs: '++id, session_id, [session_id+position+set_index], [exercise_id+date], date, exercise_id',
    meals: '[date+slot], date',
    supplements: '++id, sort_order, created_on, retired_on',
    supplement_logs: '[supplement_id+date], date, supplement_id',
  })

  // v4 — the Personal OS tables. Deterministic primary keys wherever a row is "one per day" or
  // "one per week", so writing one is a single put() with no read first.
  database.version(4).stores({
    settings: 'key',
    migrations: 'id',
    weight_entries: '++id, date',
    weekly_reviews: 'week_start',
    journal_entries: '++id, date, [date+kind]',
    quotes: '++id, &seed_key',
    quote_days: 'date',
    learning_pillars: '++id, sort_order',
    learning_resources: '++id, status, pillar_id',
    learning_sessions: '++id, date, resource_id',
    day_routines: '++id, sort_order',
  })

  // Another tab still holding the old schema open blocks this tab's upgrade indefinitely. Closing
  // and reloading is the documented way out; the reloaded tab opens at the new version.
  // The cloud copy needs to know when the record changes. Only the real database reports; the
  // throwaway ones used for tests and for checking an import do not.
  if (name === DB_NAME) {
    database.use({
      stack: 'dbcore',
      name: 'change-notices',
      create: (down: DBCore): DBCore => ({
        ...down,
        table(tableName: string) {
          const table = down.table(tableName)
          return {
            ...table,
            mutate: (request) =>
              table.mutate(request).then((result) => {
                notifyLocalChange(tableName)
                return result
              }),
          }
        },
      }),
    })
  }

  database.on('versionchange', () => {
    database.close()
    if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload()
  })

  return database
}

export const db = createDb()

/** Every table, for snapshots, exports and whole-database transactions. */
export function allTables(database: AppDb): Table[] {
  return database.tables
}
