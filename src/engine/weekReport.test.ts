import { describe, expect, it } from 'vitest'
import type { Exercise, Meal, Session, SetLog } from '../data/types'
import { EMPTY_INDEX } from './completion'
import { weekReport } from './weekReport'

const bench = { id: 1, name: 'Bench', primary_muscle: 'chest', kind: 'weight_reps' } as Exercise
const set = (date: string, weight_kg: number) => ({ exercise_id: 1, date, weight_kg, reps: 10, rir: null, done: true, kind: 'work' }) as SetLog
const session = (date: string, kinds: string[]) => ({ date, ended_at: 1, kinds }) as unknown as Session
const meal = (date: string, ate_out: boolean) => ({ date, slot: 'lunch', text: 'rice', ate_out }) as Meal

const report = () =>
  weekReport({
    start: '2026-11-01', today: '2026-11-03', habits: [], index: EMPTY_INDEX,
    sessions: [session('2026-11-02', ['strength']), session('2026-11-03', []), session('2026-10-28', ['strength'])],
    sets: [set('2026-10-28', 50), set('2026-11-02', 60)],
    exercisesById: new Map([[1, bench]]),
    meals: [meal('2026-11-02', true), meal('2026-10-28', false), meal('2026-10-29', false)],
    weights: [],
    muscleNames: ['chest', 'back'],
  })

describe('the weekly report', () => {
  it('sets this week beside the week before, and ignores empty sessions', () => {
    const r = report()
    expect(r.gym[0]).toEqual({ label: 'Days trained', value: '1', before: '1' })
    expect(r.diet[0]).toMatchObject({ value: '1', before: '2' })
    expect(r.diet[1]).toMatchObject({ value: '1', before: '0' })
  })
  it('names new bests and untrained muscles', () => {
    const r = report()
    expect(r.newBests).toEqual(['Bench'])
    expect(r.untrained).toEqual(['back'])
  })
})
