import type { Session, WorkoutRoutine } from '../../data/types'

/** STUB — replaced by the Train feature. Signature is the contract other screens rely on. */
export interface TodaysWorkout {
  loaded: boolean
  /** Routines the weekly programme suggests for today (usually one; none on an unscheduled day). */
  scheduled: WorkoutRoutine[]
  /** A session started today and not yet finished. */
  open: Session | null
  /** Sessions finished today. */
  finished: Session[]
}

export function useTodaysWorkout(): TodaysWorkout {
  return { loaded: false, scheduled: [], open: null, finished: [] }
}
