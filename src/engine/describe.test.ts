import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks } from '../testing/builders'
import { describeAmount, describeFrequency, describeTarget, ordinal, routeForSources } from './describe'
import { periodOf } from './periods'
import { targetProgress } from './targets'

describe('frequency in words', () => {
  it('names the common shapes', () => {
    expect(describeFrequency({ day: { kind: 'daily' }, target: null })).toBe('Daily')
    expect(describeFrequency({ day: { kind: 'daily' }, target: { per: 'week', count: 7 } })).toBe('Daily')
    expect(describeFrequency({ day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })).toBe('2 per week')
    expect(describeFrequency({ day: { kind: 'flexible' }, target: { per: 'month', count: 1 } })).toBe('1 per month')
    expect(describeFrequency({ day: { kind: 'flexible' }, target: null })).toBe('As needed')
    expect(describeFrequency({ day: { kind: 'weekdays', weekdays: [0] }, target: null })).toBe('Mondays')
    expect(describeFrequency({ day: { kind: 'weekdays', weekdays: [4, 0, 2] }, target: null })).toBe('Mon, Wed, Fri')
    expect(describeFrequency({ day: { kind: 'weekdays', weekdays: [0, 1, 2, 3, 4] }, target: null })).toBe('Weekdays')
    expect(describeFrequency({ day: { kind: 'weekdays', weekdays: [5, 6] }, target: null })).toBe('Weekends')
    expect(describeFrequency({ day: { kind: 'every_n_days', n: 2, anchor: '2026-10-01' }, target: null })).toBe('Every other day')
    expect(describeFrequency({ day: { kind: 'every_n_days', n: 3, anchor: '2026-10-01' }, target: null })).toBe('Every 3 days')
    expect(describeFrequency({ day: { kind: 'month_days', days: [1] }, target: null })).toBe('Monthly on the 1st')
    expect(describeFrequency({ day: { kind: 'month_days', days: [15, 1] }, target: null })).toBe('Monthly on the 1st and 15th')
  })

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ])
  })
})

describe('amounts and routes', () => {
  it('describes a dose or a measured target, and nothing for a plain tick', () => {
    expect(describeAmount({ dose: { amount: 5, unit: 'g' }, measure: { type: 'boolean', target: null, unit: '' } })).toBe('5 g')
    expect(describeAmount({ dose: { amount: 60000, unit: 'IU' }, measure: { type: 'boolean', target: null, unit: '' } })).toBe('60,000 IU')
    expect(describeAmount({ dose: null, measure: { type: 'count', target: 10, unit: 'reps' } })).toBe('10 reps')
    expect(describeAmount({ dose: null, measure: { type: 'boolean', target: null, unit: '' } })).toBe('')
  })

  it('sends a session-completed habit to where the session is logged', () => {
    expect(routeForSources(['workout'])).toBe('/train')
    expect(routeForSources(['manual', 'reading'])).toBe('/learn/reading')
    expect(routeForSources(['manual', 'learning'])).toBe('/learn')
    expect(routeForSources(['manual', 'journal'])).toBe('/journal')
    expect(routeForSources(['manual'])).toBeNull()
  })
})

describe('a target in one line', () => {
  const hair = habit({ id: 12, from: '2026-09-28', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })
  const week = periodOf('week', '2026-10-05')
  const once = indexOf({ entries: ticks(12, ['2026-10-05']) })

  it('reads as a fact at every stage of the week', () => {
    expect(describeTarget(targetProgress(hair, week, '2026-10-07', once)!)).toBe('1 to go')
    expect(describeTarget(targetProgress(hair, week, '2026-10-10', once)!)).toBe('1 session still required · 1 day left')
    expect(describeTarget(targetProgress(hair, week, '2026-10-11', once)!)).toBe('1 session still required · last day')
    expect(describeTarget(targetProgress(hair, week, '2026-10-12', once)!)).toBe('Target missed · 1 short')
    const twice = indexOf({ entries: ticks(12, ['2026-10-05', '2026-10-06', '2026-10-07']) })
    expect(describeTarget(targetProgress(hair, week, '2026-10-08', twice)!)).toBe('Target met · 1 extra')
  })
})
