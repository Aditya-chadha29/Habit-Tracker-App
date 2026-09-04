import Dexie, { type EntityTable } from 'dexie'
import type { Habit, Entry, WeeklyRecord, DailyNote } from './types'

export const db = new Dexie('habit-tracker') as Dexie & {
  habits: EntityTable<Habit, 'id'>
  entries: EntityTable<Entry, 'id'>
  weekly_records: EntityTable<WeeklyRecord, 'id'>
  daily_notes: EntityTable<DailyNote, 'date'>
}

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
