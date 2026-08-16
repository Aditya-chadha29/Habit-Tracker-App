import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from './db'
import { buildDoneMap } from './derive'
import type { Habit } from './types'

export function useHabits(): Habit[] {
  return useLiveQuery(() => db.habits.orderBy('sort_order').toArray(), [], [] as Habit[]) ?? []
}

export function useDoneMap() {
  const entries = useLiveQuery(() => db.entries.toArray(), [], [])
  return useMemo(() => buildDoneMap(entries ?? []), [entries])
}

export function useWeeklyRecord(weekMonday: string) {
  return useLiveQuery(
    () => db.weekly_records.where('week_monday').equals(weekMonday).first(),
    [weekMonday],
  )
}
