import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
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

/** True for ~durationMs whenever `value` flips from false to true. Used for a one-shot "just
 * completed" animation trigger that doesn't replay on unrelated re-renders. */
export function useFlashOnTrue(value: boolean, durationMs = 250): boolean {
  const [flashing, setFlashing] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (value && !prev.current) {
      setFlashing(true)
      const t = setTimeout(() => setFlashing(false), durationMs)
      prev.current = value
      return () => clearTimeout(t)
    }
    prev.current = value
  }, [value, durationMs])

  return flashing
}
