import { describe, expect, it } from 'vitest'
import type { Meal, SetLog, WeightEntry } from '../data/types'
import { habit, indexOf, ticks } from '../testing/builders'
import { dateRange } from './dates'
import { monthReport } from './monthReport'

describe('the monthly review', () => {
  it('rates each habit over the month and adds up the rest', () => {
    const habits = [habit({ id: 1, name: 'Read', from: '2026-09-01' }), habit({ id: 2, name: 'Walk', from: '2026-09-01' })]
    const index = indexOf({ entries: [...ticks(1, dateRange('2026-10-01', '2026-10-31')), ...ticks(2, ['2026-10-01'])] })
    const report = monthReport({
      month: '2026-10-01', today: '2026-11-13', habits, index,
      sessions: [{ date: '2026-10-03', ended_at: 1, kinds: ['strength'] }, { date: '2026-10-03', ended_at: 1, kinds: ['strength'] }, { date: '2026-11-01', ended_at: 1, kinds: ['strength'] }],
      sets: [{ date: '2026-10-03', done: true, kind: 'work', reps: 8, weight_kg: 40 } as SetLog],
      weights: [{ date: '2026-10-02', kg: 72, note: '', created_at: 1 }, { date: '2026-10-28', kg: 71, note: '', created_at: 2 }] as WeightEntry[],
      learning: [{ date: '2026-10-05', minutes: 30 }, { date: '2026-10-06', minutes: null }],
      meals: [{ date: '2026-10-05', slot: 'lunch', text: 'dal', ate_out: true }, { date: '2026-10-06', slot: 'lunch', text: '', ate_out: false }] as Meal[],
    })
    expect(report.habits.map((row) => [row.name, row.done, row.due, row.rate])).toEqual([['Read', 31, 31, 100], ['Walk', 1, 31, 3]])
    expect([report.gymDays, report.workSets, report.weightStart, report.weightEnd, report.minutesLearned, report.mealsLogged, report.mealsOut]).toEqual([1, 1, 72, 71, 30, 1, 1])
  })

  it('counts the running month up to yesterday', () => {
    const report = monthReport({
      month: '2026-11-01', today: '2026-11-03', habits: [habit({ id: 1, from: '2026-09-01' })], index: indexOf({ entries: ticks(1, ['2026-11-01']) }),
      sessions: [], sets: [], weights: [], learning: [], meals: [],
    })
    expect([report.done, report.due]).toEqual([1, 2])
  })
})
