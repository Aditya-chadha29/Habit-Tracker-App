import { describe, expect, it } from 'vitest'
import { buildCompletionIndex } from './completion'
import { weightFrom, weightIn } from './training'

describe('weight units', () => {
  it('shows pounds and stores kilograms', () => {
    expect(weightIn(60, 'lb')).toBe(132.3)
    expect(weightFrom(135, 'lb')).toBe(61.23)
    expect(weightIn(60, 'kg')).toBe(60)
    expect(weightFrom(60, 'kg')).toBe(60)
  })
})

describe('an empty workout', () => {
  const index = (date: string, kinds: ('strength' | 'cardio')[]) =>
    buildCompletionIndex({ entries: [], sessions: [{ date, ended_at: 1, kinds }], learningSessions: [], journalDates: [] }).workout.has(date)
  it('does not count as training from the day the rule began', () => {
    expect(index('2026-11-02', [])).toBe(false)
    expect(index('2026-11-02', ['strength'])).toBe(true)
  })
  it('leaves earlier days as they were', () => {
    expect(index('2026-10-09', [])).toBe(true)
  })
})

import { muscleWeek } from './history'
import type { Exercise, SetLog } from '../data/types'

describe('the week by muscle', () => {
  const bench = { id: 1, name: 'Bench', primary_muscle: 'chest', secondary_muscles: ['triceps'], kind: 'weight_reps' } as Exercise
  const squat = { id: 2, name: 'Squat', primary_muscle: 'quads', kind: 'weight_reps' } as Exercise
  const run = { id: 3, name: 'Run', primary_muscle: 'cardio', kind: 'distance_time' } as Exercise
  const byId = new Map([bench, squat, run].map((e) => [e.id!, e]))
  const set = (exercise_id: number, date: string, weight_kg: number | null, kind = 'work') => ({ exercise_id, date, weight_kg, reps: 10, rir: null, done: true, kind }) as SetLog
  it('counts the main muscle whole and an assisting one by half', () => {
    const rows = muscleWeek([set(1, '2026-11-02', 60), set(1, '2026-11-03', 60)], byId, '2026-11-01', '2026-11-07')
    expect(rows.find((r) => r.muscle === 'chest')).toMatchObject({ sets: 2, last: '2026-11-03', exercises: ['Bench'] })
    expect(rows.find((r) => r.muscle === 'triceps')?.sets).toBe(1)
  })
  it('leaves out warm-ups, unweighted lifts, cardio and other weeks', () => {
    const rows = muscleWeek([set(1, '2026-11-02', 60, 'warmup'), set(2, '2026-11-02', null), set(3, '2026-11-02', null), set(1, '2026-10-31', 60)], byId, '2026-11-01', '2026-11-07')
    expect(rows).toEqual([])
  })
})
