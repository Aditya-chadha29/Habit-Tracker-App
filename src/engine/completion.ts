import type { CompletionSource, DateStr, Entry, Habit, LearningSession, Session } from '../data/types'
import { versionOn } from './timeline'

/**
 * One place that knows whether a habit was completed on a day.
 *
 * Completion is a fact read from records that already exist — a tick, a finished workout, a
 * learning session, a journal entry. Nothing is ever stored a second time to say "gym was done":
 * finishing the workout IS the gym habit being done.
 */
export interface CompletionIndex {
  /** `habitId|date` for every done tick. */
  manual: ReadonlySet<string>
  /** Value recorded with a tick (reps, minutes, dose), same key. */
  values: ReadonlyMap<string, number>
  workout: ReadonlySet<DateStr>
  cardio: ReadonlySet<DateStr>
  learning: ReadonlySet<DateStr>
  reading: ReadonlySet<DateStr>
  journal: ReadonlySet<DateStr>
}

export interface CompletionInput {
  entries: readonly Pick<Entry, 'habit_id' | 'date' | 'done' | 'value'>[]
  sessions: readonly Pick<Session, 'date' | 'ended_at' | 'kinds'>[]
  learningSessions: readonly Pick<LearningSession, 'date' | 'lane'>[]
  journalDates: readonly DateStr[]
}

export function entryKey(habitId: number, date: DateStr): string {
  return `${habitId}|${date}`
}

export function buildCompletionIndex(input: CompletionInput): CompletionIndex {
  const manual = new Set<string>()
  const values = new Map<string, number>()
  for (const entry of input.entries) {
    const key = entryKey(entry.habit_id, entry.date)
    if (entry.done) manual.add(key)
    if (typeof entry.value === 'number') values.set(key, entry.value)
  }

  const workout = new Set<DateStr>()
  const cardio = new Set<DateStr>()
  for (const session of input.sessions) {
    // An open session is a workout in progress, not a workout done.
    if (session.ended_at === null) continue
    workout.add(session.date)
    if (session.kinds?.includes('cardio')) cardio.add(session.date)
  }

  const learning = new Set<DateStr>()
  const reading = new Set<DateStr>()
  for (const session of input.learningSessions) {
    if (session.lane === 'reading') reading.add(session.date)
    else learning.add(session.date)
  }

  return { manual, values, workout, cardio, learning, reading, journal: new Set(input.journalDates) }
}

export const EMPTY_INDEX: CompletionIndex = buildCompletionIndex({
  entries: [],
  sessions: [],
  learningSessions: [],
  journalDates: [],
})

function sourceSays(source: CompletionSource, habitId: number, date: DateStr, index: CompletionIndex): boolean {
  switch (source) {
    case 'manual':
      return index.manual.has(entryKey(habitId, date))
    case 'workout':
      return index.workout.has(date)
    case 'cardio':
      return index.cardio.has(date)
    case 'learning':
      return index.learning.has(date)
    case 'reading':
      return index.reading.has(date)
    case 'journal':
      return index.journal.has(date)
  }
}

/** Which source completed the habit that day, or null if nothing did. Sources are tried in the
 *  order the habit lists them. */
export function completedBy(habit: Habit, date: DateStr, index: CompletionIndex): CompletionSource | null {
  const version = versionOn(habit, date)
  if (!version || habit.id === undefined) return null
  for (const source of version.sources) {
    if (sourceSays(source, habit.id, date, index)) return source
  }
  return null
}

export function isComplete(habit: Habit, date: DateStr, index: CompletionIndex): boolean {
  return completedBy(habit, date, index) !== null
}

/** The value recorded with a tick, if any. */
export function valueOn(habit: Habit, date: DateStr, index: CompletionIndex): number | null {
  if (habit.id === undefined) return null
  return index.values.get(entryKey(habit.id, date)) ?? null
}

/** Whether a tap can change the habit's state that day: only when a manual tick is one of the
 *  ways it can be completed. A habit completed purely by sessions is changed by logging one. */
export function isManuallyTickable(habit: Habit, date: DateStr): boolean {
  return versionOn(habit, date)?.sources.includes('manual') ?? false
}
