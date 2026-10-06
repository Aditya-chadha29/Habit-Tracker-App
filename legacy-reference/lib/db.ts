import Dexie, { type EntityTable } from 'dexie'
import type {
  Habit, Entry, WeeklyRecord, DailyNote,
  Exercise, Routine, RoutineItem, Session, SetLog,
  Meal, Supplement, SupplementLog,
} from './types'

export const db = new Dexie('habit-tracker') as Dexie & {
  habits: EntityTable<Habit, 'id'>
  entries: EntityTable<Entry, 'id'>
  weekly_records: EntityTable<WeeklyRecord, 'id'>
  daily_notes: EntityTable<DailyNote, 'date'>
  // v3 - gym
  exercises: EntityTable<Exercise, 'id'>
  routines: EntityTable<Routine, 'id'>
  routine_items: EntityTable<RoutineItem, 'id'>
  sessions: EntityTable<Session, 'id'>
  set_logs: EntityTable<SetLog, 'id'>
  // v3 - food and supplements
  meals: EntityTable<Meal, 'date'>
  supplements: EntityTable<Supplement, 'id'>
  supplement_logs: EntityTable<SupplementLog, 'supplement_id'>
}

// Shipped versions. Never edit these: a device still running an older cached bundle has to be
// able to reconcile the schema already on its disk.
db.version(1).stores({
  habits: '++id, sort_order, created_on, retired_on',
  entries: '++id, &[habit_id+date], date, habit_id',
  weekly_records: '++id, &week_monday',
})

// Pure addition — daily_notes didn't exist in v1, so this needs no upgrade() migration.
// `date` is the primary key (not an autoincrement id + separate unique index like
// weekly_records), so writes are a single atomic put() — no check-then-act race to guard
// against, unlike the bug weekly_records had (see mutations.ts).
db.version(2).stores({
  daily_notes: 'date',
})

/**
 * v3 — gym, food and supplements. Pure addition again, and deliberately without an upgrade()
 * callback: there is nothing to transform, and a throwing upgrader is the one failure that can
 * leave the database unopenable. Only the new tables are listed; the v1/v2 tables are left out on
 * purpose so their existing indexes carry forward untouched — naming a table here REPLACES its
 * whole index list, which is how `&[habit_id+date]` would get silently dropped.
 *
 * Primary keys are deterministic wherever a row is "one per day per thing" (meals, supplement
 * logs), so writing one is a single put() with no read first: the check-then-act shape that has
 * dropped saves twice in this app cannot be written here.
 *
 * Booleans are never indexed (`done`, `taken`, `ate_out`) — IndexedDB silently refuses to index
 * them, so such an index would look fine and quietly match nothing.
 */
db.version(3).stores({
  exercises: '++id, name, primary_muscle, equipment, sort_order, retired_on',
  routines: '++id, sort_order, day_hint, retired_on',
  routine_items: '++id, routine_id, [routine_id+position], exercise_id',
  sessions: '++id, date, routine_id',
  set_logs: '++id, session_id, [session_id+position+set_index], [exercise_id+date], date, exercise_id',
  meals: '[date+slot], date',
  supplements: '++id, sort_order, created_on, retired_on',
  supplement_logs: '[supplement_id+date], date, supplement_id',
})

// Another tab still holding the old schema open blocks this tab's upgrade indefinitely. Closing
// and reloading is the documented way out; the reloaded tab opens at the new version.
db.on('versionchange', () => {
  db.close()
  location.reload()
})
