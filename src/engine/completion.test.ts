import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks, version } from '../testing/builders'
import { buildCompletionIndex, completedBy, isComplete, isManuallyTickable, valueOn } from './completion'

describe('where a completion comes from', () => {
  it('a tick completes a manual habit and only that habit', () => {
    const a = habit({ id: 1 })
    const b = habit({ id: 2 })
    const index = indexOf({ entries: ticks(1, ['2026-10-06']) })
    expect(isComplete(a, '2026-10-06', index)).toBe(true)
    expect(isComplete(b, '2026-10-06', index)).toBe(false)
    expect(isComplete(a, '2026-10-07', index)).toBe(false)
  })

  it('an unticked row is not a completion', () => {
    const a = habit({ id: 1 })
    const index = buildCompletionIndex({
      entries: [{ habit_id: 1, date: '2026-10-06', done: false }],
      sessions: [],
      learningSessions: [],
      journalDates: [],
    })
    expect(isComplete(a, '2026-10-06', index)).toBe(false)
  })

  it('a finished workout completes the gym habit with no tick at all', () => {
    const gym = habit({ id: 8, sources: ['workout'] })
    const index = indexOf({ workouts: ['2026-10-06'] })
    expect(completedBy(gym, '2026-10-06', index)).toBe('workout')
    expect(isManuallyTickable(gym, '2026-10-06')).toBe(false)
  })

  it('a workout still in progress completes nothing', () => {
    const gym = habit({ id: 8, sources: ['workout'] })
    const index = buildCompletionIndex({
      entries: [],
      sessions: [{ date: '2026-10-06', ended_at: null, kinds: ['strength'] }],
      learningSessions: [],
      journalDates: [],
    })
    expect(isComplete(gym, '2026-10-06', index)).toBe(false)
  })

  it('a cardio-only session counts as a workout and as cardio; a lifting session is not cardio', () => {
    const gym = habit({ id: 8, sources: ['workout'] })
    const cardio = habit({ id: 9, sources: ['manual', 'cardio'] })
    const cardioDay = indexOf({ cardio: ['2026-10-05'] })
    expect(isComplete(gym, '2026-10-05', cardioDay)).toBe(true)
    expect(completedBy(cardio, '2026-10-05', cardioDay)).toBe('cardio')
    const liftingDay = indexOf({ workouts: ['2026-10-06'] })
    expect(isComplete(cardio, '2026-10-06', liftingDay)).toBe(false)
  })

  it('any listed source is enough, and the first that applies is reported', () => {
    const reading = habit({ id: 6, sources: ['manual', 'reading'] })
    expect(completedBy(reading, '2026-10-06', indexOf({ reading: ['2026-10-06'] }))).toBe('reading')
    expect(completedBy(reading, '2026-10-06', indexOf({ entries: ticks(6, ['2026-10-06']) }))).toBe('manual')
    expect(completedBy(reading, '2026-10-06', indexOf({ learning: ['2026-10-06'] }))).toBeNull()
  })

  it('learning and reading sessions feed different habits', () => {
    const learning = habit({ id: 7, sources: ['learning'] })
    const reading = habit({ id: 6, sources: ['reading'] })
    const index = indexOf({ learning: ['2026-10-06'] })
    expect(isComplete(learning, '2026-10-06', index)).toBe(true)
    expect(isComplete(reading, '2026-10-06', index)).toBe(false)
  })

  it('a journal entry completes the writing habit', () => {
    const writing = habit({ id: 20, sources: ['manual', 'journal'] })
    expect(completedBy(writing, '2026-10-06', indexOf({ journal: ['2026-10-06'] }))).toBe('journal')
  })

  it('uses the sources that were in force on that day', () => {
    // Ticked by hand until 7 October, completed by workouts from then on.
    const gym = habit({ id: 8, from: '2026-08-16', sources: ['manual'] }, [
      version('2026-10-07', { sources: ['workout'] }),
    ])
    const index = indexOf({ entries: ticks(8, ['2026-10-06', '2026-10-08']), workouts: ['2026-10-07'] })
    expect(isComplete(gym, '2026-10-06', index)).toBe(true) // old tick still counts
    expect(isComplete(gym, '2026-10-07', index)).toBe(true) // workout
    expect(isComplete(gym, '2026-10-08', index)).toBe(false) // a stray tick no longer counts
  })

  it('keeps the value recorded with a tick', () => {
    const pushups = habit({ id: 30 })
    const index = buildCompletionIndex({
      entries: [{ habit_id: 30, date: '2026-10-06', done: true, value: 12 }],
      sessions: [],
      learningSessions: [],
      journalDates: [],
    })
    expect(valueOn(pushups, '2026-10-06', index)).toBe(12)
    expect(valueOn(pushups, '2026-10-07', index)).toBeNull()
  })
})
