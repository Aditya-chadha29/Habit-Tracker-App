import { describe, expect, it } from 'vitest'
import type { Exercise, SetLog } from '../data/types'
import { cardioWeeks } from './history'
import { platesPerSide } from './training'

describe('plates for a bar', () => {
  it('loads each side from the heaviest plate down', () => {
    expect(platesPerSide(100, 20)).toEqual({ plates: [25, 15], left: 0 })
    expect(platesPerSide(62.5, 20)).toEqual({ plates: [20, 1.25], left: 0 })
  })
  it('says what cannot be made up, and never goes below the bar', () => {
    expect(platesPerSide(61, 20)).toEqual({ plates: [20], left: 1 })
    expect(platesPerSide(15, 20)).toEqual({ plates: [], left: 0 })
  })
})

describe('cardio by week', () => {
  const run = { id: 1, name: 'Run', primary_muscle: 'cardio', kind: 'distance_time' } as Exercise
  const bench = { id: 2, name: 'Bench', primary_muscle: 'chest', kind: 'weight_reps' } as Exercise
  const set = (exercise_id: number, date: string, done = true) => ({ exercise_id, date, seconds: 1800, distance_m: 5000, done }) as SetLog

  it('adds done cardio sets and quick cardio sessions, and nothing else', () => {
    const weeks = cardioWeeks(
      [set(1, '2026-10-06'), set(1, '2026-10-07', false), set(2, '2026-10-06')],
      new Map([[1, run], [2, bench]]),
      [
        { date: '2026-10-08', ended_at: 1, quick: true, kinds: ['cardio'], minutes: 20, distance_km: 3 },
        { date: '2026-10-08', ended_at: 1, quick: true, kinds: ['strength'], minutes: 40 },
        { date: '2026-09-30', ended_at: 1, quick: true, kinds: ['cardio'], minutes: 10 },
      ],
      '2026-10-09', 0, 2,
    )
    expect(weeks).toEqual([{ x: '2026-09-28', minutes: 10, km: 0 }, { x: '2026-10-05', minutes: 50, km: 8 }])
  })
})
