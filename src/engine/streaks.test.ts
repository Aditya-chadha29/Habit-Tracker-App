import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks, version } from '../testing/builders'
import { dateRange, weekdayIndex } from './dates'
import { consistency, streakOf, weekdayRates } from './streaks'

describe('daily streaks', () => {
  const h = habit({ id: 1, from: '2026-09-01' })

  it('counts consecutive due days done, and an unfinished today does not end it', () => {
    const index = indexOf({ entries: ticks(1, dateRange('2026-10-01', '2026-10-05')) })
    expect(streakOf(h, '2026-10-06', index)).toEqual({ current: 5, longest: 5, unit: 'days' })
  })

  it('today extends it once done', () => {
    const index = indexOf({ entries: ticks(1, dateRange('2026-10-01', '2026-10-06')) })
    expect(streakOf(h, '2026-10-06', index).current).toBe(6)
  })

  it('a missed past day ends it, and the longest run is remembered', () => {
    const index = indexOf({
      entries: ticks(1, [...dateRange('2026-09-01', '2026-09-20'), ...dateRange('2026-10-04', '2026-10-06')]),
    })
    expect(streakOf(h, '2026-10-06', index)).toEqual({ current: 3, longest: 20, unit: 'days' })
  })

  it('only counts the days it was due', () => {
    const mondays = habit({ id: 2, from: '2026-09-01', day: { kind: 'weekdays', weekdays: [0] } })
    const index = indexOf({ entries: ticks(2, ['2026-09-21', '2026-09-28', '2026-10-05']) })
    expect(streakOf(mondays, '2026-10-08', index).current).toBe(3)
  })

  it('a retired gap neither counts nor breaks it', () => {
    const paused = habit({ id: 3, from: '2026-09-01' }, [
      version('2026-09-10', {}, { active: false }),
      version('2026-09-20', {}, { active: true }),
    ])
    const index = indexOf({
      entries: ticks(3, [...dateRange('2026-09-05', '2026-09-09'), ...dateRange('2026-09-20', '2026-09-22')]),
    })
    expect(streakOf(paused, '2026-09-22', index).current).toBe(8)
  })
})

describe('weekly-target streaks', () => {
  const hair = habit({ id: 12, from: '2026-09-07', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })

  it('counts weeks at target, not days', () => {
    const index = indexOf({
      entries: ticks(12, ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-19', '2026-09-22', '2026-09-27']),
    })
    // Three full weeks met; the running week (from 28 Sep) has nothing yet and does not break it.
    expect(streakOf(hair, '2026-09-29', index)).toEqual({ current: 3, longest: 3, unit: 'weeks' })
  })

  it('a missed week ends it', () => {
    const index = indexOf({ entries: ticks(12, ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-22', '2026-09-27']) })
    // Week of 14 Sep had one of two.
    expect(streakOf(hair, '2026-09-29', index)).toEqual({ current: 1, longest: 1, unit: 'weeks' })
  })

  it('a week that was only partly tracked neither counts nor breaks it', () => {
    const midweek = habit({ id: 13, from: '2026-09-10', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })
    const index = indexOf({ entries: ticks(13, ['2026-09-15', '2026-09-16']) })
    expect(streakOf(midweek, '2026-09-22', index).current).toBe(1)
  })
})

describe('consistency', () => {
  const h = habit({ id: 1, from: '2026-09-27' })

  it('is due days done over due days, leaving out an unfinished today', () => {
    const index = indexOf({ entries: ticks(1, ['2026-10-01', '2026-10-02', '2026-10-04']) })
    const result = consistency(h, '2026-09-30', '2026-10-06', '2026-10-06', index)
    expect([result.done, result.due]).toEqual([3, 6])
    expect(result.rate).toBeCloseTo(0.5)
  })

  it('never reaches back before the habit existed', () => {
    const result = consistency(h, '2026-09-01', '2026-09-30', '2026-10-06', indexOf({}))
    expect(result.due).toBe(4)
  })

  it('has no rate when nothing was due', () => {
    expect(consistency(h, '2026-09-01', '2026-09-20', '2026-10-06', indexOf({})).rate).toBeNull()
  })

  it('breaks down by weekday', () => {
    const index = indexOf({ entries: ticks(1, ['2026-09-28', '2026-10-05']) }) // two Mondays
    const rates = weekdayRates(h, '2026-09-27', '2026-10-06', '2026-10-06', index, weekdayIndex)
    expect(rates[0]).toEqual({ rate: 1, done: 2, due: 2 }) // Monday
    expect(rates[2]).toEqual({ rate: 0, done: 0, due: 1 }) // Wednesday
  })
})
