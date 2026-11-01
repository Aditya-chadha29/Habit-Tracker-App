import { describe, expect, it } from 'vitest'
import { buildCompletionIndex } from './completion'
import { weightFrom, weightIn } from './training'

describe('weight units', () => {
  it('shows pounds and stores kilograms', () => {
    expect(weightIn(60, 'lb')).toBe(132.3)
    expect(weightFrom(135, 'lb')).toBe(61.23)
    expect(weightIn(60, 'kg')).toBe(60)
    expect(weightFrom(60, 'kg')).toBe(60)
  })
})

describe('an empty workout', () => {
  const index = (date: string, kinds: ('strength' | 'cardio')[]) =>
    buildCompletionIndex({ entries: [], sessions: [{ date, ended_at: 1, kinds }], learningSessions: [], journalDates: [] }).workout.has(date)
  it('does not count as training from the day the rule began', () => {
    expect(index('2026-11-02', [])).toBe(false)
    expect(index('2026-11-02', ['strength'])).toBe(true)
  })
  it('leaves earlier days as they were', () => {
    expect(index('2026-10-09', [])).toBe(true)
  })
})
