import { describe, expect, it } from 'vitest'
import type { Exercise, SetLog } from '../data/types'
import { habit, indexOf, ticks } from '../testing/builders'
import { dateRange } from './dates'
import { monthlySeries, muscleBalance, personalBests, weeklyVolume } from './history'

const exercise = (id: number, name: string, primary_muscle: Exercise['primary_muscle']): Exercise => ({
  id, name, primary_muscle, equipment: 'barbell', kind: 'weight_reps', increment_kg: 2.5, bar_weight_kg: 20, rest_seconds: null, is_builtin: true, retired_on: null, sort_order: id, notes: '',
})
const EXERCISES = new Map([exercise(1, 'Bench Press', 'chest'), exercise(2, 'Squat', 'quads'), exercise(3, 'Treadmill', 'cardio')].map((e) => [e.id!, e]))

let nextId = 1
const set = (exercise_id: number, date: string, weight_kg: number | null, reps: number | null, patch: Partial<SetLog> = {}): SetLog => ({
  id: nextId++, session_id: 1, exercise_id, date, position: 0, set_index: 1, weight_kg, reps, seconds: null, distance_m: null, rir: null, kind: 'work', done: true, done_at: 1, note: '', ...patch,
})

describe('month by month', () => {
  it('counts whole months, the running month up to yesterday, and withholds a rate with too little', () => {
    const habits = [habit({ id: 1, from: '2026-09-01' })]
    const index = indexOf({ entries: ticks(1, [...dateRange('2026-09-01', '2026-09-15'), ...dateRange('2026-10-01', '2026-10-09')]) })
    const series = monthlySeries(habits, 3, '2026-10-10', index)
    expect(series.map((point) => point.month)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
    expect(series[0]).toMatchObject({ due: 0, rate: null, running: false })
    expect(series[1]).toMatchObject({ done: 15, due: 30, rate: 50 })
    expect(series[2]).toMatchObject({ done: 9, due: 9, rate: 100, running: true })
  })

  it('has nothing for a month that began today', () => {
    const habits = [habit({ id: 1, from: '2026-09-01' })]
    const series = monthlySeries(habits, 1, '2026-10-01', indexOf({}))
    expect(series[0]).toMatchObject({ due: 0, rate: null })
  })
})

describe('the training log added up', () => {
  const sets = [
    set(1, '2026-10-05', 60, 10),
    set(1, '2026-10-05', 60, 8),
    set(1, '2026-10-05', 40, 10, { kind: 'warmup' }),
    set(1, '2026-10-05', 60, 10, { done: false }),
    set(2, '2026-09-28', 100, 5),
    set(1, '2026-08-20', 70, 5),
    set(3, '2026-10-06', null, null, { seconds: 900 }),
  ]

  it('adds weight times reps for finished work sets, week by week', () => {
    const volume = weeklyVolume(sets, '2026-10-07', 0, 3)
    expect(volume).toEqual([
      { x: '2026-09-21', y: 0 },
      { x: '2026-09-28', y: 500 },
      { x: '2026-10-05', y: 1080 },
    ])
  })

  it('counts hard sets per muscle against the period before, leaving cardio out', () => {
    const balance = muscleBalance(sets, EXERCISES, '2026-10-07', 30)
    expect(balance).toEqual([
      { muscle: 'chest', sets: 2, previous: 1 },
      { muscle: 'quads', sets: 1, previous: 0 },
    ])
    expect(muscleBalance(sets, EXERCISES, '2026-10-07', 7).find((row) => row.muscle === 'quads')).toEqual({ muscle: 'quads', sets: 0, previous: 1 })
  })

  it('finds the best set of each exercise by estimated one-rep max', () => {
    const bests = personalBests(sets, EXERCISES)
    expect(bests.map((best) => [best.exercise.name, best.set.weight_kg, best.set.reps])).toEqual([
      ['Squat', 100, 5],
      // 70 x 5 estimates higher than 60 x 10, so the older set is the best.
      ['Bench Press', 70, 5],
    ])
  })
})
