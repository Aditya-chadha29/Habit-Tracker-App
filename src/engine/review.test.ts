import { describe, expect, it } from 'vitest'
import { DEFAULT_AREAS } from '../data/settingsRepo'
import type { WeekStats } from '../data/types'
import { habit, indexOf, ticks, version } from '../testing/builders'
import { dateRange } from './dates'
import { periodOf } from './periods'
import { computeWeekStats, rankHabits, type WeekInput } from './review'

const WEEK = periodOf('week', '2026-10-05') // Mon 5 – Sun 11 Oct

function input(overrides: Partial<WeekInput>): WeekInput {
  return {
    habits: [],
    index: indexOf({}),
    period: WEEK,
    today: '2026-10-12',
    areas: DEFAULT_AREAS,
    weights: [],
    sessions: [],
    setLogs: [],
    exercises: [],
    learningSessions: [],
    resources: [],
    pillars: [],
    previous: [],
    ...overrides,
  }
}

const hair = () => habit({ id: 12, name: 'Hair oiling', area: 'body', from: '2026-09-28', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })

describe('the hair-oiling acceptance scenario, in the review', () => {
  const once = indexOf({ entries: ticks(12, ['2026-10-05']) })

  it('reports a missed target, one short, once the week is over', () => {
    const stats = computeWeekStats(input({ habits: [hair()], index: once }))
    expect(stats.targets).toEqual([{ habit_id: 12, name: 'Hair oiling', area: 'body', per: 'week', target: 2, done: 1, outcome: 'missed' }])
    expect([stats.done, stats.due]).toEqual([1, 2])
  })

  it('leaves the old week at 1 of 2 whatever is ticked afterwards', () => {
    const later = indexOf({ entries: ticks(12, ['2026-10-05', '2026-10-12', '2026-10-13']) })
    const stats = computeWeekStats(input({ habits: [hair()], index: later, today: '2026-10-20' }))
    expect(stats.targets[0]).toMatchObject({ done: 1, outcome: 'missed' })
  })

  it('is still open, not missed, while the week is running', () => {
    const stats = computeWeekStats(input({ habits: [hair()], index: once, today: '2026-10-10' }))
    expect(stats.targets[0].outcome).toBe('open')
    expect(stats.observations).toEqual([])
  })
})

describe('the numbers', () => {
  it('scores the week by pillar and lists each counted day', () => {
    const meditation = habit({ id: 1, name: 'Meditation', area: 'mind', from: '2026-09-01' })
    const cardio = habit({ id: 2, name: 'Cardio', area: 'exercise', from: '2026-09-01' })
    const index = indexOf({ entries: [...ticks(1, dateRange('2026-10-05', '2026-10-09')), ...ticks(2, ['2026-10-05'])] })
    const stats = computeWeekStats(input({ habits: [meditation, cardio], index }))
    expect([stats.done, stats.due]).toEqual([6, 14])
    expect(stats.areas.find((a) => a.area === 'mind')).toMatchObject({ done: 5, due: 7 })
    expect(stats.areas.find((a) => a.area === 'exercise')).toMatchObject({ done: 1, due: 7 })
    expect(stats.areas.find((a) => a.area === 'learning')).toMatchObject({ done: 0, due: 0 })
    expect(stats.days).toHaveLength(7)
    expect(stats.habits.map((h) => [h.name, h.done, h.due])).toEqual([['Meditation', 5, 7], ['Cardio', 1, 7]])
    expect(rankHabits(stats.habits).map((h) => h.name)).toEqual(['Meditation', 'Cardio'])
  })

  it('reports a partly tracked target without judging or scoring it', () => {
    const fresh = habit({ id: 3, name: 'Stretching', from: '2026-10-08', day: { kind: 'flexible' }, target: { per: 'week', count: 3 } })
    const stats = computeWeekStats(input({ habits: [fresh] }))
    expect(stats.targets[0].outcome).toBe('partial')
    expect([stats.done, stats.due]).toEqual([0, 0])
    expect(stats.habits).toEqual([])
  })

  it('uses the name a habit had during that week', () => {
    const renamed = habit({ id: 4, name: 'Skincare', from: '2026-09-01' }, [version('2026-10-20', { name: 'Daily moisturiser' })])
    const stats = computeWeekStats(input({ habits: [renamed], today: '2026-10-25' }))
    expect(stats.habits[0].name).toBe('Skincare')
  })

  it('takes the last weigh-in of the week and of the week before', () => {
    const weights = [
      { id: 1, date: '2026-09-30', kg: 71.3, note: '', created_at: 1 },
      { id: 2, date: '2026-10-06', kg: 71.0, note: '', created_at: 2 },
      { id: 3, date: '2026-10-11', kg: 70.8, note: '', created_at: 3 },
    ]
    const stats = computeWeekStats(input({ weights }))
    expect(stats.weight).toEqual({ kg: 70.8, previous_kg: 71.3 })
    expect(stats.observations).toContain('Weight 70.8 kg, down 0.5 kg from the week before.')
  })

  it('summarises training and learning inside the week only', () => {
    const exercises = [{ id: 1, name: 'Barbell Bench Press', primary_muscle: 'chest' as const, equipment: 'barbell' as const, kind: 'weight_reps' as const, increment_kg: 2.5, bar_weight_kg: 20, rest_seconds: 150, is_builtin: true, retired_on: null, sort_order: 0, notes: '' }]
    const session = (id: number, date: string) => ({ id, date, routine_id: null, title: 'Chest', started_at: 0, ended_at: 50 * 60000, notes: '', rest_started_at: null, rest_seconds: null })
    const set = (id: number, date: string, weight_kg: number, reps: number) => ({ id, session_id: 1, exercise_id: 1, date, position: 0, set_index: id, weight_kg, reps, seconds: null, distance_m: null, rir: null, kind: 'work' as const, done: true, done_at: 1, note: '' })
    const stats = computeWeekStats(
      input({
        exercises,
        sessions: [session(1, '2026-10-06'), session(2, '2026-10-13')],
        setLogs: [set(1, '2026-10-06', 60, 10), set(2, '2026-10-06', 60, 9), set(3, '2026-10-13', 100, 5)],
        learningSessions: [
          { id: 1, resource_id: 1, date: '2026-10-07', lane: 'learning', minutes: 38, progress_before: 0, progress_after: 38, completed_resource: true, notes: '', created_at: 1 },
          { id: 2, resource_id: 1, date: '2026-10-14', lane: 'learning', minutes: 20, progress_before: 0, progress_after: 0, completed_resource: false, notes: '', created_at: 2 },
        ],
      }),
    )
    expect(stats.training).toEqual({ sessions: 1, sets: 2, volume_kg: 1140, minutes: 50, best: 'Barbell Bench Press 60 × 10', best_set: { name: 'Barbell Bench Press', weight_kg: 60, reps: 10 } })
    expect(stats.learning).toMatchObject({ sessions: 1, minutes: 38, completed: 1 })
  })

  it('handles a week that spans the new year', () => {
    const daily = habit({ id: 1, from: '2026-12-01' })
    const week = periodOf('week', '2026-12-30')
    const stats = computeWeekStats(input({ habits: [daily], period: week, today: '2027-01-10', index: indexOf({ entries: ticks(1, ['2026-12-31', '2027-01-01']) }) }))
    expect([stats.week_start, stats.week_end]).toEqual(['2026-12-28', '2027-01-03'])
    expect([stats.done, stats.due]).toEqual([2, 7])
  })
})

describe('observations state only what the numbers prove', () => {
  const daily = (id: number, name: string, area = 'mind') => habit({ id, name, area, from: '2026-08-01' })
  const habits = [daily(1, 'Meditation'), daily(2, 'Reading')]

  function weekOf(start: string, doneA: number, doneB: number, previous: WeekStats[] = []): WeekStats {
    const period = periodOf('week', start)
    const days = dateRange(period.start, period.end)
    const index = indexOf({ entries: [...ticks(1, days.slice(0, doneA)), ...ticks(2, days.slice(0, doneB))] })
    return computeWeekStats(input({ habits, index, period, today: '2026-12-01', previous }))
  }

  it('compares the week with the one before', () => {
    const before = weekOf('2026-09-28', 4, 4)
    const now = weekOf('2026-10-05', 7, 6, [before])
    expect(now.observations).toContain('Week completion was 93%, up from 57% the week before.')
    expect(now.observations).toContain('Mind went from 57% to 93%.')
    expect(now.observations).toContain('Meditation went from 4 of 7 to 7 of 7.')
  })

  it('says "about the same" for a small change, and nothing at all without a week to compare', () => {
    const before = weekOf('2026-09-28', 6, 6)
    expect(weekOf('2026-10-05', 6, 6, [before]).observations[0]).toBe('Week completion was 86%, about the same as the week before (86%).')
    expect(weekOf('2026-10-05', 7, 7).observations.filter((line) => line.startsWith('Week completion'))).toEqual([])
  })

  it('counts consecutive weeks a target was met, and how often it was missed', () => {
    const target = habit({ id: 9, name: 'Hair oiling', area: 'body', from: '2026-08-03', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })
    const run = (start: string, done: number, previous: WeekStats[]) => {
      const period = periodOf('week', start)
      const index = indexOf({ entries: ticks(9, dateRange(period.start, period.end).slice(0, done)) })
      return computeWeekStats(input({ habits: [target], index, period, today: '2026-12-01', previous }))
    }
    const w1 = run('2026-09-07', 2, [])
    const w2 = run('2026-09-14', 2, [w1])
    const w3 = run('2026-09-21', 2, [w2, w1])
    expect(w3.observations).toContain('Hair oiling target met for 3 consecutive weeks.')
    expect(w1.observations.filter((line) => line.includes('consecutive'))).toEqual([])

    const m1 = run('2026-09-07', 1, [])
    const m2 = run('2026-09-14', 2, [m1])
    const m3 = run('2026-09-21', 0, [m2, m1])
    expect(m3.observations).toContain('Hair oiling target missed in 2 of the last 3 weeks.')
  })

  it('points out a day that stood well below the rest', () => {
    const many = Array.from({ length: 6 }, (_, i) => daily(i + 1, `Habit ${i + 1}`))
    const days = dateRange(WEEK.start, WEEK.end)
    const entries = many.flatMap((h) => ticks(h.id!, days.filter((d) => d !== '2026-10-07' || h.id === 1)))
    const stats = computeWeekStats(input({ habits: many, index: indexOf({ entries }) }))
    expect(stats.observations).toContain('Wednesday had the lowest completion this week (17%).')
  })
})
