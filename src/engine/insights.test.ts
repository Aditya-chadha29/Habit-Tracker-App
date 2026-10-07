import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks, version } from '../testing/builders'
import { dateRange } from './dates'
import {
  compare, compareRange, habitSummaries, historyDays, lowestWeekday, pointsWithData, previousRange, rangeEnding, rangeFor,
  rateOf, standingComparisons, streakLeaders, tallyRange, weeklySeries,
} from './insights'

describe('ranges', () => {
  it('cover finished days only, and step back by their own length', () => {
    expect(rangeFor('7d', '2026-10-15')).toEqual({ from: '2026-10-08', to: '2026-10-14' })
    expect(previousRange({ from: '2026-10-08', to: '2026-10-14' })).toEqual({ from: '2026-10-01', to: '2026-10-07' })
    expect(rangeFor('30d', '2026-10-15')).toEqual({ from: '2026-09-15', to: '2026-10-14' })
  })

  it('cross month ends, year ends and a leap day', () => {
    expect(rangeEnding('2027-01-03', 7)).toEqual({ from: '2026-12-27', to: '2027-01-02' })
    expect(previousRange(rangeEnding('2028-03-05', 7))).toEqual({ from: '2028-02-20', to: '2028-02-26' })
    expect(rangeEnding('2028-03-01', 2)).toEqual({ from: '2028-02-28', to: '2028-02-29' })
  })
})

describe('rates and comparisons', () => {
  it('has no rate without enough behind it', () => {
    expect(rateOf({ done: 3, due: 3 })).toBeNull()
    expect(rateOf({ done: 6, due: 7 })).toBe(86)
    expect(compare({ done: 6, due: 7 }, { done: 1, due: 2 }).delta).toBeNull()
    expect(compare({ done: 6, due: 7 }, { done: 1, due: 2 }).direction).toBeNull()
  })

  it('reports a small change as steady', () => {
    expect(compare({ done: 80, due: 100 }, { done: 78, due: 100 })).toMatchObject({ delta: 2, direction: 'flat' })
    expect(compare({ done: 87, due: 100 }, { done: 73, due: 100 })).toMatchObject({ delta: 14, direction: 'up' })
    expect(compare({ done: 60, due: 100 }, { done: 73, due: 100 })).toMatchObject({ delta: -13, direction: 'down' })
  })

  it('compares a range with the one before, overall and for one pillar', () => {
    const mind = habit({ id: 1, from: '2026-09-01', area: 'mind' })
    const body = habit({ id: 2, from: '2026-09-01', area: 'body' })
    const index = indexOf({ entries: [...ticks(1, dateRange('2026-10-08', '2026-10-14')), ...ticks(2, dateRange('2026-10-01', '2026-10-07'))] })
    const range = rangeEnding('2026-10-15', 7)
    expect(tallyRange([mind, body], range, index)).toEqual({ done: 7, due: 14 })
    expect(compareRange([mind, body], range, index, 'mind')).toMatchObject({ rate: 100, previous_rate: 0, direction: 'up' })
    expect(compareRange([mind, body], range, index, 'body')).toMatchObject({ rate: 0, previous_rate: 100, direction: 'down' })
  })

  it('gives the four standing comparisons, with nothing claimed for an empty side', () => {
    const h = habit({ id: 1, from: '2026-10-05' })
    const index = indexOf({ entries: ticks(1, dateRange('2026-10-05', '2026-10-14')) })
    const rows = standingComparisons([h], '2026-10-15', 0, index)
    expect(rows.map((row) => row.label)).toEqual(['This week', 'This month', 'Last 30 days', 'Last 90 days'])
    // This week so far: Mon 12 – Wed 14 = 3 due, under the gate.
    expect(rows[0].rate).toBeNull()
    expect(rows[2]).toMatchObject({ rate: 100, previous_rate: null, delta: null })
    // Last week (Mon 5 – Sun 11) was complete: 7 of 7.
    expect(rows[0].previous).toEqual({ done: 7, due: 7 })
    expect(rows[0].current).toEqual({ done: 3, due: 3 })
  })
})

describe('weekly series', () => {
  it('lists weeks oldest first with the running week last', () => {
    const habits = Array.from({ length: 2 }, (_, i) => habit({ id: i + 1, from: '2026-09-21' }))
    const index = indexOf({ entries: ticks(1, dateRange('2026-09-21', '2026-10-07')) })
    const series = weeklySeries(habits, 4, '2026-10-07', 0, index)
    expect(series.map((point) => point.week_start)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'])
    expect(series[0].rate).toBeNull() // before anything was tracked
    expect(series[1]).toMatchObject({ done: 7, due: 14, rate: 50 })
    expect(series[3]).toMatchObject({ done: 3, due: 6, rate: 50 })
    expect(pointsWithData(series)).toBe(3)
  })

  it('leaves earlier weeks unchanged when a habit changes frequency later', () => {
    const before = habit({ id: 1, from: '2026-09-01' })
    const after = habit({ id: 1, from: '2026-09-01' }, [version('2026-10-05', { day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })])
    const index = indexOf({ entries: ticks(1, dateRange('2026-09-21', '2026-09-25')) })
    const a = weeklySeries([before], 3, '2026-10-07', 0, index)
    const b = weeklySeries([after], 3, '2026-10-07', 0, index)
    expect(b.slice(0, 2)).toEqual(a.slice(0, 2))
  })
})

describe('habits', () => {
  it('summarises each active habit and finds the streak leaders', () => {
    const steady = habit({ id: 1, name: 'Steady', from: '2026-09-01' })
    const patchy = habit({ id: 2, name: 'Patchy', from: '2026-09-01' })
    const gone = habit({ id: 3, name: 'Gone', from: '2026-09-01' }, [version('2026-09-10', {}, { active: false })])
    const index = indexOf({ entries: [...ticks(1, dateRange('2026-09-01', '2026-10-14')), ...ticks(2, ['2026-10-10', '2026-10-12'])] })
    const summaries = habitSummaries([steady, patchy, gone], rangeEnding('2026-10-15', 7), '2026-10-15', 0, index)
    expect(summaries.map((s) => s.habit.name)).toEqual(['Steady', 'Patchy'])
    expect(summaries[0]).toMatchObject({ rate: 100, direction: 'flat' })
    expect(summaries[1]).toMatchObject({ rate: 29, direction: 'up' })
    const leaders = streakLeaders(summaries)
    expect(leaders.current!.habit.name).toBe('Steady')
    expect(leaders.longest!.streak.longest).toBe(44)
  })

  it('names a lowest weekday only with enough history and a clear gap', () => {
    const rate = (r: number, due = 5) => ({ rate: r, due })
    expect(lowestWeekday([rate(0.62), rate(0.81), rate(0.88), rate(0.93), rate(0.79), rate(0.95), rate(0.91)])).toEqual({ weekday: 0, rate: 0.62 })
    expect(lowestWeekday([rate(0.8), rate(0.82), rate(0.9), rate(0.9), rate(0.9), rate(0.9), rate(0.9)])).toBeNull() // too close to call
    expect(lowestWeekday([rate(0.2, 2), rate(0.9), rate(0.9), rate(0.9), rate(0.9), rate(0.9), rate(0.9)])).toBeNull() // too little history
  })

  it('counts the days of history', () => {
    expect(historyDays([habit({ from: '2026-10-01' })], '2026-10-07')).toBe(7)
    expect(historyDays([], '2026-10-07')).toBe(0)
  })
})
