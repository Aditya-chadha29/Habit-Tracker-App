import { db } from '../../data/db'
import type { DayRoutine } from '../../data/types'
import { useLive } from '../../state/live'

const NONE: DayRoutine[] = []

/** The day routines, live. A handful of rows, read whole. */
export function useDayRoutines(): DayRoutine[] {
  return useLive(() => db.day_routines.orderBy('sort_order').toArray(), [], NONE)
}
