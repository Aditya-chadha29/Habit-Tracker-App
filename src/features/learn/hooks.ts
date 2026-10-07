import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../../data/db'
import type { DateStr, LearningPillar, LearningResource, LearningSession } from '../../data/types'
import { currentAndNext, daysInProgress } from '../../engine/learning'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'

export interface LearningNow {
  loaded: boolean
  /** Today's learning: the head of the queue. */
  current: LearningResource | null
  /** What follows it. */
  next: LearningResource | null
  /** How many resources are in the queue, the current one included. */
  queueSize: number
  /** The one book being read, if any. */
  activeBook: LearningResource | null
  /** Days the current item has been in progress, or null when it has not been started. */
  currentDaysInProgress: number | null
}

const NO_PILLARS: LearningPillar[] = []
const NO_SESSIONS: LearningSession[] = []

export function useResources(): { loaded: boolean; list: LearningResource[] } {
  const list = useLiveQuery(() => db.learning_resources.toArray(), [])
  return { loaded: list !== undefined, list: list ?? [] }
}

export function usePillars(): LearningPillar[] {
  return useLive(() => db.learning_pillars.orderBy('sort_order').toArray(), [], NO_PILLARS)
}

/** What learning looks like right now: today's item, the next one, and the book being read. */
export function useLearningNow(): LearningNow {
  const { today, settings } = useCore()
  const { loaded, list } = useResources()
  return useMemo(() => {
    const { current, next, size } = currentAndNext(list)
    const book = list.find((resource) => resource.id === settings.active_book_id && resource.status !== 'archived' && resource.status !== 'completed')
    return {
      loaded,
      current,
      next,
      queueSize: size,
      activeBook: book ?? null,
      currentDaysInProgress: current ? daysInProgress(current, today) : null,
    }
  }, [loaded, list, settings.active_book_id, today])
}

/** Learning and reading sessions in [from, to]. */
export function useLearningSessions(from: DateStr, to: DateStr): LearningSession[] {
  return useLive(() => db.learning_sessions.where('date').between(from, to, true, true).toArray(), [from, to], NO_SESSIONS)
}
