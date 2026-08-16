import Dexie, { type EntityTable } from 'dexie'
import type { Habit, Entry, WeeklyRecord } from './types'

export const db = new Dexie('habit-tracker') as Dexie & {
  habits: EntityTable<Habit, 'id'>
  entries: EntityTable<Entry, 'id'>
  weekly_records: EntityTable<WeeklyRecord, 'id'>
}

db.version(1).stores({
  habits: '++id, sort_order, created_on, retired_on',
  entries: '++id, &[habit_id+date], date, habit_id',
  weekly_records: '++id, &week_monday',
})
