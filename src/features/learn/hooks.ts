import type { LearningResource } from '../../data/types'

/** STUB — replaced by the Learn feature. Signature is the contract other screens rely on. */
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

export function useLearningNow(): LearningNow {
  return { loaded: false, current: null, next: null, queueSize: 0, activeBook: null, currentDaysInProgress: null }
}
