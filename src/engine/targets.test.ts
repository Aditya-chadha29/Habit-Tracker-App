import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks, version } from '../testing/builders'
import { periodOf, shiftPeriod } from './periods'
import { daysLeftPhrase, remainingPhrase, targetProgress } from './targets'

const WEEK = periodOf('week', '2026-10-05') // Mon 5 Oct – Sun 11 Oct
const NEXT_WEEK = shiftPeriod(WEEK, 1)
const twiceAWeek = { day: { kind: 'flexible' as const }, target: { per: 'week' as const, count: 2 } }

describe('the hair-oiling acceptance scenario', () => {
  const hair = habit({ id: 12, name: 'Hair oiling', from: '2026-10-05', ...twiceAWeek })
  const index = indexOf({ entries: ticks(12, ['2026-10-05']) })

  it('Monday, done once: 1/2 with 1 remaining, and nothing alarming', () => {
    const p = targetProgress(hair, WEEK, '2026-10-05', index)!
    expect([p.done, p.target, p.remaining]).toEqual([1, 2, 1])
    expect(p.state).toBe('on_track')
  })

  it('Wednesday, nothing more done: still 1/2, still not missed', () => {
    const p = targetProgress(hair, WEEK, '2026-10-07', index)!
    expect([p.done, p.remaining]).toEqual([1, 1])
    expect(p.state).toBe('on_track')
  })

  it('Saturday: flagged, 1 session still required, 1 day left', () => {
    const p = targetProgress(hair, WEEK, '2026-10-10', index)!
    expect(p.state).toBe('attention')
    expect(p.days_left).toBe(1)
    expect(remainingPhrase(p.remaining)).toBe('1 session still required')
    expect(daysLeftPhrase(p.days_left)).toBe('1 day left')
  })

  it('Sunday, still not done: at risk, last day', () => {
    const p = targetProgress(hair, WEEK, '2026-10-11', index)!
    expect(p.state).toBe('at_risk')
    expect(daysLeftPhrase(p.days_left)).toBe('last day')
  })

  it('once the week is over the target is missed, one short', () => {
    const p = targetProgress(hair, WEEK, '2026-10-12', index)!
    expect(p.state).toBe('missed')
    expect([p.done, p.target, p.remaining]).toEqual([1, 2, 1])
  })

  it('the new week starts at 0/2 and the old week still reads 1/2', () => {
    const fresh = targetProgress(hair, NEXT_WEEK, '2026-10-12', index)!
    expect([fresh.done, fresh.target]).toEqual([0, 2])
    expect(fresh.state).toBe('on_track')
    // Ticking in the new week changes nothing about the old one.
    const later = indexOf({ entries: ticks(12, ['2026-10-05', '2026-10-13', '2026-10-14']) })
    expect(targetProgress(hair, WEEK, '2026-10-20', later)!.done).toBe(1)
    expect(targetProgress(hair, WEEK, '2026-10-20', later)!.state).toBe('missed')
    expect(targetProgress(hair, NEXT_WEEK, '2026-10-20', later)!.state).toBe('met')
  })
})

describe('weekly targets in other shapes', () => {
  it('nothing done by Saturday on a twice-a-week habit is at risk', () => {
    const hair = habit({ id: 1, from: '2026-10-05', ...twiceAWeek })
    const p = targetProgress(hair, WEEK, '2026-10-10', indexOf({}))!
    expect(p.state).toBe('at_risk')
    expect([p.remaining, p.days_left]).toEqual([2, 1])
  })

  it('nothing done by Sunday can no longer be met', () => {
    const hair = habit({ id: 1, from: '2026-10-05', ...twiceAWeek })
    expect(targetProgress(hair, WEEK, '2026-10-11', indexOf({}))!.state).toBe('unreachable')
  })

  it('completing early is met, stays met, and extra days are reported uncapped', () => {
    const hair = habit({ id: 1, from: '2026-10-05', ...twiceAWeek })
    const index = indexOf({ entries: ticks(1, ['2026-10-05', '2026-10-06', '2026-10-08']) })
    expect(targetProgress(hair, WEEK, '2026-10-06', index)!.state).toBe('met')
    const sunday = targetProgress(hair, WEEK, '2026-10-11', index)!
    expect(sunday.state).toBe('met')
    expect(sunday.done).toBe(3)
    expect(sunday.remaining).toBe(0)
  })

  it('completing late, on the last two days, is met', () => {
    const hair = habit({ id: 1, from: '2026-10-05', ...twiceAWeek })
    const index = indexOf({ entries: ticks(1, ['2026-10-10', '2026-10-11']) })
    expect(targetProgress(hair, WEEK, '2026-10-11', index)!.state).toBe('met')
    expect(targetProgress(hair, WEEK, '2026-10-12', index)!.state).toBe('met')
  })

  it('a tick dated tomorrow is not counted today', () => {
    const hair = habit({ id: 1, from: '2026-10-05', ...twiceAWeek })
    const index = indexOf({ entries: ticks(1, ['2026-10-09']) })
    expect(targetProgress(hair, WEEK, '2026-10-08', index)!.done).toBe(0)
  })

  it('five sessions a week: one spare day left is worth pointing out, none is at risk', () => {
    const gym = habit({ id: 8, from: '2026-10-05', day: { kind: 'flexible' }, target: { per: 'week', count: 5 }, sources: ['workout'] })
    expect(targetProgress(gym, WEEK, '2026-10-05', indexOf({}))!.state).toBe('on_track')
    expect(targetProgress(gym, WEEK, '2026-10-06', indexOf({}))!.state).toBe('attention')
    expect(targetProgress(gym, WEEK, '2026-10-07', indexOf({}))!.state).toBe('at_risk')
    expect(targetProgress(gym, WEEK, '2026-10-08', indexOf({}))!.state).toBe('unreachable')
    const four = indexOf({ workouts: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'] })
    expect(targetProgress(gym, WEEK, '2026-10-09', four)!.state).toBe('on_track')
    expect(targetProgress(gym, WEEK, '2026-10-10', four)!.state).toBe('attention')
    expect(targetProgress(gym, WEEK, '2026-10-11', four)!.state).toBe('at_risk')
  })

  it('a six-a-week target is not flagged on the first morning of the week', () => {
    const h = habit({ id: 1, from: '2026-10-05', day: { kind: 'flexible' }, target: { per: 'week', count: 6 } })
    expect(targetProgress(h, WEEK, '2026-10-05', indexOf({}))!.state).toBe('on_track')
    expect(targetProgress(h, WEEK, '2026-10-06', indexOf({}))!.state).toBe('at_risk')
  })
})

describe('a daily habit carrying a weekly target', () => {
  const gym = habit({ id: 8, name: 'Gym', from: '2026-09-28', day: { kind: 'daily' }, target: { per: 'week', count: 7 }, sources: ['workout'] })

  it('is not flagged just because every day is needed', () => {
    const p = targetProgress(gym, WEEK, '2026-10-05', indexOf({}))!
    expect(p.state).toBe('on_track')
    expect(p.flexible).toBe(false)
  })

  it('counts the days a workout was finished', () => {
    const index = indexOf({ workouts: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'] })
    const p = targetProgress(gym, WEEK, '2026-10-08', index)!
    expect([p.done, p.target]).toEqual([4, 7])
    expect(p.state).toBe('on_track')
  })

  it('cannot be met once a day has been missed, and reads missed when the week ends', () => {
    const index = indexOf({ workouts: ['2026-10-06', '2026-10-07'] })
    expect(targetProgress(gym, WEEK, '2026-10-07', index)!.state).toBe('unreachable')
    const sixDays = indexOf({ workouts: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'] })
    const after = targetProgress(gym, WEEK, '2026-10-12', sixDays)!
    expect(after.state).toBe('missed')
    expect([after.done, after.remaining]).toEqual([6, 1])
  })
})

describe('weeks that are only partly tracked', () => {
  it('a habit created mid-week is not judged for that week', () => {
    const hair = habit({ id: 1, from: '2026-10-07', ...twiceAWeek })
    expect(targetProgress(hair, WEEK, '2026-10-10', indexOf({}))!.state).toBe('on_track')
    const over = targetProgress(hair, WEEK, '2026-10-12', indexOf({}))!
    expect(over.partial).toBe(true)
    expect(over.state).toBe('partial')
  })

  it('but it is still met if the target is reached anyway', () => {
    const hair = habit({ id: 1, from: '2026-10-07', ...twiceAWeek })
    const index = indexOf({ entries: ticks(1, ['2026-10-08', '2026-10-09']) })
    expect(targetProgress(hair, WEEK, '2026-10-12', index)!.state).toBe('met')
  })

  it('a change of frequency mid-week keeps the ticks already made that week', () => {
    // Daily until Tuesday, twice a week from Wednesday. Monday's and Tuesday's ticks still count.
    const hair = habit({ id: 12, name: 'Hair care', from: '2026-08-16' }, [
      version('2026-10-07', { name: 'Hair oiling', ...twiceAWeek }),
    ])
    const index = indexOf({ entries: ticks(12, ['2026-10-05', '2026-10-06']) })
    const p = targetProgress(hair, WEEK, '2026-10-07', index)!
    expect([p.done, p.target]).toEqual([2, 2])
    expect(p.state).toBe('met')
  })

  it('there was no weekly target in the weeks before the change', () => {
    const hair = habit({ id: 12, from: '2026-08-16' }, [version('2026-10-07', twiceAWeek)])
    expect(targetProgress(hair, periodOf('week', '2026-09-28'), '2026-10-07', indexOf({}))).toBeNull()
  })

  it('a rename mid-week does not make the week partial', () => {
    const hair = habit({ id: 1, name: 'Hair care', from: '2026-09-28', ...twiceAWeek }, [
      version('2026-10-08', { name: 'Hair oiling', ...twiceAWeek }),
    ])
    const p = targetProgress(hair, WEEK, '2026-10-12', indexOf({}))!
    expect(p.partial).toBe(false)
    expect(p.state).toBe('missed')
  })

  it('a habit retired mid-week reports what was done and is not judged', () => {
    const hair = habit({ id: 1, from: '2026-09-28', ...twiceAWeek }, [
      version('2026-10-08', twiceAWeek, { active: false }),
    ])
    const index = indexOf({ entries: ticks(1, ['2026-10-06']) })
    // While the week is running a retired habit simply is not shown.
    expect(targetProgress(hair, WEEK, '2026-10-09', index)).toBeNull()
    const over = targetProgress(hair, WEEK, '2026-10-12', index)!
    expect(over.done).toBe(1)
    expect(over.state).toBe('partial')
    // And it has no target at all in later weeks.
    expect(targetProgress(hair, NEXT_WEEK, '2026-10-20', index)).toBeNull()
  })

  it('a habit with no target has no target progress', () => {
    expect(targetProgress(habit({ id: 1 }), WEEK, '2026-10-07', indexOf({}))).toBeNull()
  })
})

describe('other periods', () => {
  it('respects a week that starts on Sunday', () => {
    const sundayWeek = periodOf('week', '2026-10-07', 6)
    expect([sundayWeek.start, sundayWeek.end]).toEqual(['2026-10-04', '2026-10-10'])
    const hair = habit({ id: 1, from: '2026-10-04', ...twiceAWeek })
    const index = indexOf({ entries: ticks(1, ['2026-10-04', '2026-10-11']) })
    expect(targetProgress(hair, sundayWeek, '2026-10-12', index)!.done).toBe(1)
  })

  it('judges a monthly target across the calendar month, including a year change', () => {
    const haircut = habit({ id: 1, from: '2026-12-01', day: { kind: 'flexible' }, target: { per: 'month', count: 1 } })
    const december = periodOf('month', '2026-12-15')
    const january = shiftPeriod(december, 1)
    expect([december.start, december.end]).toEqual(['2026-12-01', '2026-12-31'])
    expect([january.start, january.end]).toEqual(['2027-01-01', '2027-01-31'])
    const index = indexOf({ entries: ticks(1, ['2026-12-20']) })
    expect(targetProgress(haircut, december, '2027-01-05', index)!.state).toBe('met')
    expect(targetProgress(haircut, january, '2027-01-05', index)!.state).toBe('on_track')
    expect(targetProgress(haircut, january, '2027-01-31', index)!.state).toBe('at_risk')
    expect(targetProgress(haircut, january, '2027-02-01', index)!.state).toBe('missed')
  })

  it('does not look for a weekly target in a month, or a monthly one in a week', () => {
    const hair = habit({ id: 1, from: '2026-10-05', ...twiceAWeek })
    expect(targetProgress(hair, periodOf('month', '2026-10-05'), '2026-10-07', indexOf({}))).toBeNull()
  })

  it('a week that has not begun is upcoming', () => {
    const hair = habit({ id: 1, from: '2026-10-05', ...twiceAWeek })
    expect(targetProgress(hair, NEXT_WEEK, '2026-10-07', indexOf({}))!.state).toBe('upcoming')
  })
})
