import { describe, expect, it } from 'vitest'
import { habit, version } from '../testing/builders'
import {
  appendVersion, dueDatesBetween, habitProblems, isActiveOn, isDueOn, isFlexibleOn, isRetired,
  matchesDayRule, nameOn, versionOn,
} from './timeline'

describe('which chapter is in force', () => {
  const h = habit({ name: 'Skincare', from: '2026-08-16' }, [
    version('2026-10-07', { name: 'Daily moisturiser' }),
  ])

  it('is nothing before the habit existed', () => {
    expect(versionOn(h, '2026-08-15')).toBeNull()
    expect(isActiveOn(h, '2026-08-15')).toBe(false)
    expect(isDueOn(h, '2026-08-15')).toBe(false)
  })

  it('switches exactly on the chapter date', () => {
    expect(versionOn(h, '2026-10-06')?.name).toBe('Skincare')
    expect(versionOn(h, '2026-10-07')?.name).toBe('Daily moisturiser')
  })

  it('keeps the old name on old days after a rename', () => {
    expect(nameOn(h, '2026-09-01')).toBe('Skincare')
    expect(nameOn(h, '2026-10-20')).toBe('Daily moisturiser')
  })
})

describe('day rules', () => {
  it('daily is due every day', () => {
    expect(matchesDayRule({ kind: 'daily' }, '2026-10-06')).toBe(true)
  })

  it('weekdays is due only on its days', () => {
    const rule = { kind: 'weekdays' as const, weekdays: [0, 2, 4] }
    expect(matchesDayRule(rule, '2026-10-05')).toBe(true) // Mon
    expect(matchesDayRule(rule, '2026-10-06')).toBe(false) // Tue
    expect(matchesDayRule(rule, '2026-10-09')).toBe(true) // Fri
  })

  it('every N days counts from its anchor and never before it', () => {
    const rule = { kind: 'every_n_days' as const, n: 3, anchor: '2026-10-01' }
    expect(matchesDayRule(rule, '2026-10-01')).toBe(true)
    expect(matchesDayRule(rule, '2026-10-02')).toBe(false)
    expect(matchesDayRule(rule, '2026-10-04')).toBe(true)
    expect(matchesDayRule(rule, '2026-09-28')).toBe(false)
    // Keeps its rhythm across a month and a year
    expect(matchesDayRule(rule, '2026-10-31')).toBe(true)
    expect(matchesDayRule(rule, '2027-01-02')).toBe(true)
  })

  it('a monthly day past the end of the month falls on its last day', () => {
    const rule = { kind: 'month_days' as const, days: [31] }
    expect(matchesDayRule(rule, '2026-10-31')).toBe(true)
    expect(matchesDayRule(rule, '2026-11-30')).toBe(true)
    expect(matchesDayRule(rule, '2026-11-29')).toBe(false)
    expect(matchesDayRule(rule, '2027-02-28')).toBe(true)
    expect(matchesDayRule(rule, '2028-02-29')).toBe(true)
    expect(matchesDayRule(rule, '2028-02-28')).toBe(false)
  })

  it('flexible is never due on a particular day', () => {
    const h = habit({ day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })
    expect(isDueOn(h, '2026-10-06')).toBe(false)
    expect(isFlexibleOn(h, '2026-10-06')).toBe(true)
  })

  it('lists due dates inside a range, never before creation', () => {
    const h = habit({ from: '2026-10-07', day: { kind: 'weekdays', weekdays: [0, 2] } })
    expect(dueDatesBetween(h, '2026-10-01', '2026-10-14')).toEqual(['2026-10-07', '2026-10-12', '2026-10-14'])
  })
})

describe('retiring and restoring', () => {
  const h = habit({ from: '2026-08-16' }, [
    version('2026-09-10', {}, { active: false }),
    version('2026-09-20', {}, { active: true }),
  ])

  it('stops being due from the retirement date', () => {
    expect(isDueOn(h, '2026-09-09')).toBe(true)
    expect(isDueOn(h, '2026-09-10')).toBe(false)
  })

  it('leaves the retired gap not due after it is restored', () => {
    expect(isDueOn(h, '2026-09-15')).toBe(false)
    expect(isDueOn(h, '2026-09-19')).toBe(false)
    expect(isDueOn(h, '2026-09-20')).toBe(true)
    expect(isRetired(h)).toBe(false)
  })
})

describe('changing a habit', () => {
  const base = [version('2026-08-16', { name: 'Hair care' })]

  it('adds a chapter from today and leaves earlier ones alone', () => {
    const next = appendVersion(base, '2026-10-07', {
      name: 'Hair oiling',
      day: { kind: 'flexible' },
      target: { per: 'week', count: 2 },
    })
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(base[0])
    expect(next[1].from).toBe('2026-10-07')
    expect(next[1].day).toEqual({ kind: 'flexible' })
    expect(base).toHaveLength(1)
  })

  it('collapses several edits on the same day into one chapter', () => {
    const once = appendVersion(base, '2026-10-07', { name: 'Hair oil' })
    const twice = appendVersion(once, '2026-10-07', { name: 'Hair oiling' })
    expect(twice).toHaveLength(2)
    expect(twice[1].name).toBe('Hair oiling')
  })

  it('adds nothing when the change is no change', () => {
    expect(appendVersion(base, '2026-10-07', { name: 'Hair care' })).toEqual(base)
  })

  it('drops the chapter again when the day ends up where it started', () => {
    const changed = appendVersion(base, '2026-10-07', { name: 'Hair oiling' })
    const reverted = appendVersion(changed, '2026-10-07', { name: 'Hair care' })
    expect(reverted).toEqual(base)
  })

  it('refuses to change the past', () => {
    const later = appendVersion(base, '2026-10-07', { name: 'Hair oiling' })
    expect(() => appendVersion(later, '2026-10-01', { name: 'Earlier' })).toThrow()
  })
})

describe('validation', () => {
  it('accepts a well-formed habit', () => {
    expect(habitProblems(habit())).toEqual([])
  })

  it('reports each kind of broken schedule', () => {
    expect(habitProblems({ ...habit(), versions: [] })).toHaveLength(1)
    expect(habitProblems(habit({ day: { kind: 'weekdays', weekdays: [] } }))).not.toEqual([])
    expect(habitProblems(habit({ day: { kind: 'weekdays', weekdays: [7] } }))).not.toEqual([])
    expect(habitProblems(habit({ day: { kind: 'every_n_days', n: 0, anchor: '2026-10-01' } }))).not.toEqual([])
    expect(habitProblems(habit({ day: { kind: 'month_days', days: [0] } }))).not.toEqual([])
    expect(habitProblems(habit({ day: { kind: 'flexible' }, target: { per: 'week', count: 8 } }))).not.toEqual([])
    expect(habitProblems(habit({ day: { kind: 'flexible' }, target: { per: 'week', count: 0 } }))).not.toEqual([])
    expect(
      habitProblems(habit({ day: { kind: 'weekdays', weekdays: [0, 2] }, target: { per: 'week', count: 3 } })),
    ).not.toEqual([])
    expect(habitProblems(habit({ sources: [] }))).not.toEqual([])
  })

  it('reports chapters that are out of order', () => {
    const h = habit({ from: '2026-08-16' }, [version('2026-08-10')])
    expect(habitProblems(h).some((p) => p.includes('out of order'))).toBe(true)
  })
})
