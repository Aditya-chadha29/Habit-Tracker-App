import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from './db'
import { buildDoneMap } from './derive'
import type {
  DailyNote, Exercise, Habit, Meal, Routine, RoutineItem, Session, SetLog, Supplement,
  SupplementLog, WeeklyRecord,
} from './types'

export function useHabits(): Habit[] {
  return useLiveQuery(() => db.habits.orderBy('sort_order').toArray(), [], [] as Habit[]) ?? []
}

export function useDoneMap() {
  const entries = useLiveQuery(() => db.entries.toArray(), [], [])
  return useMemo(() => buildDoneMap(entries ?? []), [entries])
}

/**
 * A live query that can never hand back another key's data.
 *
 * useLiveQuery keeps rendering the previous deps' result until the new one resolves, which is how
 * one week's weight once got written onto a different week (see useWeeklyRecordForWeek below).
 * Carrying the key inside the query result and comparing it on the way out makes that
 * unrepresentable while keeping live updates — so unlike the one-shot hooks below, a write from
 * anywhere still re-renders immediately.
 *
 * Callers must render a placeholder while `loaded` is false, and must never feed `data` into an
 * uncontrolled input's defaultValue before then.
 */
export function useKeyedLiveQuery<K extends string | number, T>(
  key: K,
  querier: (key: K) => Promise<T>,
): { data: T | undefined; loaded: boolean } {
  const result = useLiveQuery(async () => ({ key, data: await querier(key) }), [key])
  const fresh = result !== undefined && result.key === key
  return { data: fresh ? result.data : undefined, loaded: fresh }
}

// ─── Gym ─────────────────────────────────────────────────────────────────────────────────────

export function useExercises(): Exercise[] {
  return useLiveQuery(() => db.exercises.orderBy('sort_order').toArray(), [], [] as Exercise[]) ?? []
}

export function useRoutines(): Routine[] {
  return useLiveQuery(() => db.routines.orderBy('sort_order').toArray(), [], [] as Routine[]) ?? []
}

export function useRoutineItems(routineId: number | null): RoutineItem[] {
  const { data } = useKeyedLiveQuery(routineId ?? 0, async (id) =>
    id ? db.routine_items.where('routine_id').equals(id).sortBy('position') : [],
  )
  return data ?? []
}

/** Every session recorded on a date — usually none or one, two on a two-a-day. */
export function useSessionsForDate(date: string): { sessions: Session[]; loaded: boolean } {
  const { data, loaded } = useKeyedLiveQuery(date, (d) =>
    db.sessions.where('date').equals(d).toArray(),
  )
  return { sessions: data ?? [], loaded }
}

export function useSetsForSession(sessionId: number | null): { sets: SetLog[]; loaded: boolean } {
  const { data, loaded } = useKeyedLiveQuery(sessionId ?? 0, async (id) =>
    id ? db.set_logs.where('session_id').equals(id).toArray() : [],
  )
  return { sets: data ?? [], loaded }
}

export function useRecentSessions(limit = 8): Session[] {
  return (
    useLiveQuery(
      () => db.sessions.orderBy('date').reverse().limit(limit).toArray(),
      [limit],
      [] as Session[],
    ) ?? []
  )
}

/** Sets across a date range — scoped deliberately, never the whole table: a year of training is
 *  thousands of rows, and deserialising all of them on every write would drop frames. */
export function useSetsInRange(fromDate: string, toDate: string): SetLog[] {
  const { data } = useKeyedLiveQuery(`${fromDate}|${toDate}`, async (key) => {
    const [from, to] = key.split('|')
    return db.set_logs.where('date').between(from, to, true, true).toArray()
  })
  return data ?? []
}

/** Every set ever recorded for one exercise, for its history screen. */
export function useSetsForExercise(exerciseId: number | null): SetLog[] {
  const { data } = useKeyedLiveQuery(exerciseId ?? 0, async (id) =>
    id ? db.set_logs.where('exercise_id').equals(id).toArray() : [],
  )
  return data ?? []
}

// ─── Food and supplements ────────────────────────────────────────────────────────────────────

export function useMealsForDate(date: string): { meals: Meal[]; loaded: boolean } {
  const { data, loaded } = useKeyedLiveQuery(date, (d) => db.meals.where('date').equals(d).toArray())
  return { meals: data ?? [], loaded }
}

export function useSupplements(): Supplement[] {
  return (
    useLiveQuery(() => db.supplements.orderBy('sort_order').toArray(), [], [] as Supplement[]) ?? []
  )
}

export function useSupplementLogsForDate(date: string): SupplementLog[] {
  const { data } = useKeyedLiveQuery(date, (d) =>
    db.supplement_logs.where('date').equals(d).toArray(),
  )
  return data ?? []
}

export function useMealsInRange(fromDate: string, toDate: string): Meal[] {
  const { data } = useKeyedLiveQuery(`${fromDate}|${toDate}`, async (key) => {
    const [from, to] = key.split('|')
    return db.meals.where('date').between(from, to, true, true).toArray()
  })
  return data ?? []
}

/**
 * Deliberately NOT useLiveQuery. dexie-react-hooks' useObservable keeps its result ref across
 * `deps` changes (to preserve a default value across resubscribes), so on the exact render where
 * `weekMonday` changes it can return the PREVIOUS week's record for one render before the new
 * subscription resolves. Fed into an uncontrolled input's `defaultValue`, that stale record gets
 * baked in at mount and, if the user blurs before it's corrected, gets written into the new
 * week's row — real cross-week data corruption, not just a display glitch. A plain one-shot fetch
 * per `weekMonday`, gated by `loaded`, can't leak a wrong week's value: it's either the current
 * week's real record or nothing.
 */
export function useWeeklyRecordForWeek(weekMonday: string): {
  record: WeeklyRecord | undefined
  loaded: boolean
} {
  const [resolved, setResolved] = useState<{ monday: string; record: WeeklyRecord | undefined } | null>(null)

  useEffect(() => {
    let cancelled = false
    db.weekly_records
      .where('week_monday')
      .equals(weekMonday)
      .first()
      .then((record) => {
        if (!cancelled) setResolved({ monday: weekMonday, record })
      })
    return () => {
      cancelled = true
    }
  }, [weekMonday])

  const loaded = resolved?.monday === weekMonday
  return { record: loaded ? resolved.record : undefined, loaded }
}

/**
 * Same reasoning as useWeeklyRecordForWeek: a plain one-shot fetch per `date`, not a
 * useLiveQuery, so navigating between days can never briefly show a different day's note.
 * daily_notes uses `date` as its primary key, so this is a direct db.get() rather than a
 * where().first() query.
 */
export function useDailyNoteForDate(date: string): { note: DailyNote | undefined; loaded: boolean } {
  const [resolved, setResolved] = useState<{ date: string; note: DailyNote | undefined } | null>(null)

  useEffect(() => {
    let cancelled = false
    db.daily_notes.get(date).then((note) => {
      if (!cancelled) setResolved({ date, note })
    })
    return () => {
      cancelled = true
    }
  }, [date])

  const loaded = resolved?.date === date
  return { note: loaded ? resolved.note : undefined, loaded }
}

/** The whole weekly_records table, live. Safe as a live query (unlike a single week's record)
 * because every consumer here reads the full history, not one key that changes with navigation —
 * there's no "previous key's value" to leak. */
export function useAllWeeklyRecords(): WeeklyRecord[] {
  return useLiveQuery(() => db.weekly_records.toArray(), [], [] as WeeklyRecord[]) ?? []
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

/** True for ~durationMs whenever `value` changes at all (not just false→true). Used for a quiet
 * acknowledgment pulse on a number that just moved, in either direction. */
export function usePulseOnChange<T>(value: T, durationMs = 200): boolean {
  const [pulsing, setPulsing] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (value !== prev.current) {
      setPulsing(true)
      const t = setTimeout(() => setPulsing(false), durationMs)
      prev.current = value
      return () => clearTimeout(t)
    }
  }, [value, durationMs])

  return pulsing
}
