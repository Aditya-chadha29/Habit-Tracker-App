import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../data/db'
import type { DateStr, Exercise, Session, SetLog, WorkoutRoutine } from '../../data/types'
import { openSession } from '../../data/workoutRepo'
import { weekdayIndex } from '../../engine/dates'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'

export interface TodaysWorkout {
  loaded: boolean
  /** Routines the weekly programme suggests for today (usually one; none on an unscheduled day). */
  scheduled: WorkoutRoutine[]
  /** The workout in progress, if there is one. */
  open: Session | null
  /** Sessions finished today. */
  finished: Session[]
}

/** What training looks like today: the programme's suggestion, anything in progress, anything done. */
export function useTodaysWorkout(): TodaysWorkout {
  const { today } = useCore()
  const weekday = weekdayIndex(today)
  const data = useLiveQuery(async () => {
    const routines = await db.routines.orderBy('sort_order').toArray()
    return {
      scheduled: routines.filter((routine) => !routine.retired_on && (routine.weekdays ?? []).includes(weekday)),
      open: (await openSession()) ?? null,
      finished: (await db.sessions.where('date').equals(today).toArray()).filter((session) => session.ended_at !== null),
    }
  }, [today, weekday])
  return { loaded: data !== undefined, scheduled: data?.scheduled ?? [], open: data?.open ?? null, finished: data?.finished ?? [] }
}

const NO_ROUTINES: WorkoutRoutine[] = []
const NO_EXERCISES: Exercise[] = []
const NO_SESSIONS: Session[] = []

/** Every routine, retired ones included, in list order. */
export function useRoutines(): WorkoutRoutine[] {
  return useLive(() => db.routines.orderBy('sort_order').toArray(), [], NO_ROUTINES)
}

export function useExercises(): { list: Exercise[]; byId: Map<number, Exercise> } {
  const list = useLive(() => db.exercises.orderBy('sort_order').toArray(), [], NO_EXERCISES)
  const byId = useMemo(() => new Map(list.map((exercise) => [exercise.id!, exercise])), [list])
  return { list, byId }
}

/** How many exercises each routine holds. */
export function useRoutineSizes(): Map<number, number> {
  const items = useLive(() => db.routine_items.toArray(), [], [])
  return useMemo(() => {
    const sizes = new Map<number, number>()
    for (const item of items) sizes.set(item.routine_id, (sizes.get(item.routine_id) ?? 0) + 1)
    return sizes
  }, [items])
}

/** Sessions in [from, to], newest first. */
export function useSessionsBetween(from: DateStr, to: DateStr): Session[] {
  const rows = useLive(() => db.sessions.where('date').between(from, to, true, true).toArray(), [from, to], NO_SESSIONS)
  return useMemo(() => [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ended_at ?? 0) - (a.ended_at ?? 0))), [rows])
}

/** A clock that ticks while `running`, for timers. Reads the time; never used to decide a date. */
export function useNow(running: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), everyMs)
    const onVisible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running, everyMs])
  return now
}

/** Sets grouped into the exercise blocks of a session, in order. */
export function blocksOf(sets: readonly SetLog[]): { position: number; exerciseId: number; sets: SetLog[] }[] {
  const byPosition = new Map<number, SetLog[]>()
  for (const set of sets) {
    const list = byPosition.get(set.position)
    if (list) list.push(set)
    else byPosition.set(set.position, [set])
  }
  return [...byPosition.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, rows]) => ({
      position,
      exerciseId: rows[0].exercise_id,
      sets: rows.sort((a, b) => a.set_index - b.set_index),
    }))
}
