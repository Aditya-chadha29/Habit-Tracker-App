import { describe, expect, it } from 'vitest'
import { habit, ticks } from '../testing/builders'
import { buildCompletionIndex } from './completion'
import { dateRange } from './dates'
import { hasEnough, pairRate, patternLines } from './patterns'

const sleep = habit({ id: 1, name: 'Sleep before 10:00 PM', from: '2026-09-01' })
const wake = habit({ id: 2, name: 'Wake up at 4:00 AM', from: '2026-09-01' })
const days = dateRange('2026-09-01', '2026-09-20')
const index = (a: string[], b: string[], daysOff: string[] = []) =>
  buildCompletionIndex({ entries: [...ticks(1, a), ...ticks(2, b)], sessions: [], learningSessions: [], journalDates: [], daysOff })

describe('patterns between two habits', () => {
  it('counts B on the day after A with a lag of one', () => {
    const rate = pairRate(sleep, wake, days, index(['2026-09-01', '2026-09-02'], ['2026-09-02', '2026-09-10']), 1)
    expect(rate.whenA).toEqual({ done: 1, of: 2 })
    expect(rate.whenNotA).toEqual({ done: 1, of: 18 })
  })

  it('counts the same day with no lag', () => {
    const rate = pairRate(sleep, wake, days, index(['2026-09-01', '2026-09-02'], ['2026-09-02', '2026-09-10']), 0)
    expect(rate.whenA).toEqual({ done: 1, of: 2 })
  })

  it('skips days off on either side', () => {
    const rate = pairRate(sleep, wake, days, index([], [], ['2026-09-05']), 1)
    // 4 Sept pairs with the 5th (off) and the 5th itself is off: two days fewer.
    expect(rate.whenNotA.of).toBe(18)
  })

  it('withholds a pair until both sides have seven days', () => {
    const few = index(['2026-09-01', '2026-09-02'], [])
    expect(hasEnough(pairRate(sleep, wake, days, few, 1))).toBe(false)
    expect(patternLines([sleep, wake], days, few)).toEqual([])
    const enough = index(dateRange('2026-09-01', '2026-09-08'), ['2026-09-02'])
    const lines = patternLines([sleep, wake], days, enough)
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Wake up at 4:00 AM: done on 1 of 8 days the day after Sleep before 10:00 PM done, and 0 of 12 days otherwise.')
  })
})
