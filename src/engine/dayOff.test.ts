import { describe, expect, it } from 'vitest'
import { habit, ticks } from '../testing/builders'
import { buildCompletionIndex } from './completion'
import { periodOf } from './periods'
import { dayScore, dueItems, weekTally } from './score'
import { dayStatus } from './status'
import { consistency } from './streaks'

const index = (daysOff: string[], entries = ticks(1, [])) => buildCompletionIndex({ entries, sessions: [], learningSessions: [], journalDates: [], daysOff })

describe('a day off', () => {
  it('has nothing due, though its rows can still be listed', () => {
    const habits = [habit({ id: 1 }), habit({ id: 2 })]
    expect(dayScore(habits, '2026-10-06', index(['2026-10-06'])).due).toBe(0)
    expect(dueItems(habits, '2026-10-06', index(['2026-10-06']), true)).toHaveLength(2)
    expect(dayScore(habits, '2026-10-07', index(['2026-10-06'])).due).toBe(2)
  })

  it('is left out of the week tally', () => {
    const habits = [habit({ id: 1 })]
    const week = periodOf('week', '2026-10-05')
    expect(weekTally(habits, week, '2026-10-11', index([])).due).toBe(7)
    expect(weekTally(habits, week, '2026-10-11', index(['2026-10-06', '2026-10-07'])).due).toBe(5)
  })

  it('is not a miss, and does not lower a completion rate', () => {
    const habits = habit({ id: 1, from: '2026-10-05' })
    const off = index(['2026-10-06'], ticks(1, ['2026-10-05', '2026-10-07']))
    expect(dayStatus(habits, '2026-10-06', '2026-10-08', off)).toBe('not_due')
    expect(consistency(habits, '2026-10-05', '2026-10-07', '2026-10-08', off)).toMatchObject({ done: 2, due: 2 })
  })
})
