import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from './db'
import { buildDoneMap } from './derive'
import type { DailyNote, Habit, WeeklyRecord } from './types'

export function useHabits(): Habit[] {
  return useLiveQuery(() => db.habits.orderBy('sort_order').toArray(), [], [] as Habit[]) ?? []
}

export function useDoneMap() {
  const entries = useLiveQuery(() => db.entries.toArray(), [], [])
  return useMemo(() => buildDoneMap(entries ?? []), [entries])
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
