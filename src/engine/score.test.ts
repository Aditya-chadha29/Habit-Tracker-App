import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks, version } from '../testing/builders'
import { periodOf } from './periods'
import { dayScore, flexibleItems, percent, weekTally } from './score'

const WEEK = periodOf('week', '2026-10-05')

describe('the daily score', () => {
  it('is due items done over items due', () => {
    const habits = [habit({ id: 1 }), habit({ id: 2 }), habit({ id: 3 })]
    const score = dayScore(habits, '2026-10-06', indexOf({ entries: ticks(1, ['2026-10-06']) }))
    expect([score.done, score.due]).toEqual([1, 3])
  })

  it('a missing entry on a past day is simply not done', () => {
    const score = dayScore([habit({ id: 1 })], '2026-10-01', indexOf({}))
    expect([score.done, score.due]).toEqual([0, 1])
  })

  it('leaves out habits that are not due that day', () => {
    const habits = [
      habit({ id: 1 }),
      habit({ id: 2, day: { kind: 'weekdays', weekdays: [0] } }), // Mondays only
      habit({ id: 3, day: { kind: 'flexible' }, target: { per: 'week', count: 2 } }),
    ]
    expect(dayScore(habits, '2026-10-06', indexOf({})).due).toBe(1) // Tuesday
    expect(dayScore(habits, '2026-10-05', indexOf({})).due).toBe(2) // Monday
  })

  it('a flexible habit never enters a day score even when it is done that day', () => {
    const habits = [habit({ id: 3, day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })]
    const score = dayScore(habits, '2026-10-06', indexOf({ entries: ticks(3, ['2026-10-06']) }))
    expect([score.done, score.due]).toEqual([0, 0])
    expect(percent(score)).toBeNull()
    const [item] = flexibleItems(habits, '2026-10-06', indexOf({ entries: ticks(3, ['2026-10-06']) }))
    expect(item.done_today).toBe(true)
  })

  it('days before a habit existed are not in its denominator', () => {
    const habits = [habit({ id: 1, from: '2026-08-16' }), habit({ id: 2, from: '2026-10-07' })]
    expect(dayScore(habits, '2026-10-06', indexOf({})).due).toBe(1)
    expect(dayScore(habits, '2026-10-07', indexOf({})).due).toBe(2)
  })

  it('a retired habit leaves the denominator from its retirement date and keeps its history', () => {
    const habits = [
      habit({ id: 1, from: '2026-08-16' }),
      habit({ id: 2, from: '2026-08-16' }, [version('2026-10-07', {}, { active: false })]),
    ]
    const index = indexOf({ entries: ticks(2, ['2026-10-06']) })
    expect(dayScore(habits, '2026-10-06', index)).toMatchObject({ done: 1, due: 2 })
    expect(dayScore(habits, '2026-10-07', index)).toMatchObject({ done: 0, due: 1 })
  })

  it('changing a frequency today does not rewrite yesterday', () => {
    const before = habit({ id: 12, from: '2026-08-16' })
    const after = habit({ id: 12, from: '2026-08-16' }, [
      version('2026-10-07', { day: { kind: 'flexible' }, target: { per: 'week', count: 2 } }),
    ])
    const index = indexOf({ entries: ticks(12, ['2026-10-01']) })
    for (const date of ['2026-09-30', '2026-10-01', '2026-10-06']) {
      const a = dayScore([before], date, index)
      const b = dayScore([after], date, index)
      expect([b.done, b.due]).toEqual([a.done, a.due])
    }
    expect(dayScore([after], '2026-10-07', index).due).toBe(0)
  })

  it('splits the score by the pillar each habit belonged to on that day', () => {
    const moved = habit({ id: 1, from: '2026-08-16', area: 'body' }, [version('2026-10-07', { area: 'mind' })])
    const habits = [moved, habit({ id: 2, area: 'mind' })]
    const index = indexOf({ entries: ticks(1, ['2026-10-06', '2026-10-07']) })
    const earlier = dayScore(habits, '2026-10-06', index)
    expect(earlier.by_area.get('body')).toEqual({ done: 1, due: 1 })
    expect(earlier.by_area.get('mind')).toEqual({ done: 0, due: 1 })
    const later = dayScore(habits, '2026-10-07', index)
    expect(later.by_area.get('body')).toBeUndefined()
    expect(later.by_area.get('mind')).toEqual({ done: 1, due: 2 })
  })

  it('reports no percentage when nothing was due', () => {
    expect(percent({ done: 0, due: 0 })).toBeNull()
    expect(percent({ done: 2, due: 3 })).toBe(67)
  })
})

describe('the week score', () => {
  const daily = habit({ id: 1, from: '2026-09-01', area: 'mind' })
  const hair = habit({ id: 2, from: '2026-09-01', area: 'body', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })

  it('counts only the days so far, and the flexible target in full', () => {
    const index = indexOf({ entries: [...ticks(1, ['2026-10-05', '2026-10-06']), ...ticks(2, ['2026-10-05'])] })
    const tally = weekTally([daily, hair], WEEK, '2026-10-07', index)
    // Mon ✓, Tue ✓, Wed pending = 2 of 3; hair 1 of 2.
    expect([tally.done, tally.due]).toEqual([3, 5])
    expect(tally.days.filter((d) => d.counted)).toHaveLength(3)
    expect(tally.by_area.get('mind')).toEqual({ done: 2, due: 3 })
    expect(tally.by_area.get('body')).toEqual({ done: 1, due: 2 })
  })

  it('caps a flexible target at the target', () => {
    const index = indexOf({ entries: ticks(2, ['2026-10-05', '2026-10-06', '2026-10-07']) })
    const tally = weekTally([hair], WEEK, '2026-10-12', index)
    expect([tally.done, tally.due]).toEqual([2, 2])
  })

  it('a finished week counts all seven days', () => {
    const index = indexOf({ entries: ticks(1, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) })
    const tally = weekTally([daily], WEEK, '2026-10-20', index)
    expect([tally.done, tally.due]).toEqual([5, 7])
  })

  it('a daily habit with a weekly target is counted once, by its days', () => {
    const gym = habit({ id: 8, from: '2026-09-01', day: { kind: 'daily' }, target: { per: 'week', count: 7 }, sources: ['workout'] })
    const tally = weekTally([gym], WEEK, '2026-10-12', indexOf({ workouts: ['2026-10-05', '2026-10-06'] }))
    expect([tally.done, tally.due]).toEqual([2, 7])
    expect(tally.targets).toHaveLength(1)
    expect(tally.targets[0].progress.done).toBe(2)
  })

  it('a target tracked for only part of the week is listed but not scored', () => {
    const fresh = habit({ id: 3, from: '2026-10-08', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })
    const tally = weekTally([fresh], WEEK, '2026-10-12', indexOf({}))
    expect([tally.done, tally.due]).toEqual([0, 0])
    expect(tally.targets[0].progress.state).toBe('partial')
  })

  it('an old week is unchanged by anything ticked after it', () => {
    const index1 = indexOf({ entries: ticks(1, ['2026-09-28', '2026-09-29']) })
    const index2 = indexOf({ entries: ticks(1, ['2026-09-28', '2026-09-29', '2026-10-05', '2026-10-06']) })
    const old = periodOf('week', '2026-09-28')
    const a = weekTally([daily], old, '2026-10-06', index1)
    const b = weekTally([daily], old, '2026-10-20', index2)
    expect([b.done, b.due]).toEqual([a.done, a.due])
  })
})
