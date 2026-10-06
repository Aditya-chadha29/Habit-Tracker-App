import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks, version } from '../testing/builders'
import { assertEditable, firstEditableDate, isEditable, LockedError } from './lock'
import { dayStatus, statusLabel } from './status'

describe('pending is not missed', () => {
  const h = habit({ id: 1, from: '2026-10-01' })
  const index = indexOf({ entries: ticks(1, ['2026-10-04']) })
  const today = '2026-10-06'

  it('today, not yet done, is pending', () => {
    expect(dayStatus(h, today, today, index)).toBe('pending')
  })

  it('yesterday, not done, is missed', () => {
    expect(dayStatus(h, '2026-10-05', today, index)).toBe('missed')
  })

  it('a done day is done', () => {
    expect(dayStatus(h, '2026-10-04', today, index)).toBe('done')
  })

  it('tomorrow is upcoming, and before creation is not tracked', () => {
    expect(dayStatus(h, '2026-10-07', today, index)).toBe('upcoming')
    expect(dayStatus(h, '2026-09-30', today, index)).toBe('inactive')
  })

  it('a flexible habit is not due on a day it was not done, and done on a day it was', () => {
    const hair = habit({ id: 2, from: '2026-10-01', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })
    const i = indexOf({ entries: ticks(2, ['2026-10-05']) })
    expect(dayStatus(hair, '2026-10-04', today, i)).toBe('not_due')
    expect(dayStatus(hair, '2026-10-05', today, i)).toBe('done')
    expect(dayStatus(hair, today, today, i)).toBe('not_due')
  })

  it('a weekday habit is not due on its off days', () => {
    const mondays = habit({ id: 3, from: '2026-10-01', day: { kind: 'weekdays', weekdays: [0] } })
    expect(dayStatus(mondays, '2026-10-06', '2026-10-07', indexOf({}))).toBe('not_due')
    expect(dayStatus(mondays, '2026-10-05', '2026-10-07', indexOf({}))).toBe('missed')
  })

  it('retired days are not tracked', () => {
    const retired = habit({ id: 4, from: '2026-10-01' }, [version('2026-10-05', {}, { active: false })])
    expect(dayStatus(retired, '2026-10-05', today, indexOf({}))).toBe('inactive')
    expect(dayStatus(retired, '2026-10-04', today, indexOf({}))).toBe('missed')
  })
})

describe('wording', () => {
  it('abstaining habits are held or broken', () => {
    expect(statusLabel('done', 'abstain')).toBe('Held')
    expect(statusLabel('missed', 'abstain')).toBe('Broken')
    expect(statusLabel('done', 'do')).toBe('Done')
    expect(statusLabel('missed', 'do')).toBe('Missed')
    expect(statusLabel('pending', 'abstain')).toBe('Pending')
  })
})

describe('the history lock', () => {
  const today = '2026-10-06'

  it('today and the six days before it can be edited', () => {
    expect(isEditable(today, today)).toBe(true)
    expect(isEditable('2026-10-05', today)).toBe(true)
    expect(isEditable('2026-09-30', today)).toBe(true)
    expect(firstEditableDate(today)).toBe('2026-09-30')
  })

  it('anything older is read-only', () => {
    expect(isEditable('2026-09-29', today)).toBe(false)
    expect(isEditable('2026-09-28', today)).toBe(false)
  })

  it('the future cannot be edited', () => {
    expect(isEditable('2026-10-07', today)).toBe(false)
  })

  it('follows a configured window', () => {
    expect(isEditable('2026-09-23', today, 14)).toBe(true)
    expect(isEditable('2026-09-22', today, 14)).toBe(false)
    expect(isEditable('2026-10-05', today, 1)).toBe(false)
    expect(isEditable(today, today, 0)).toBe(true)
  })

  it('refuses a locked date with an error that names it', () => {
    expect(() => assertEditable('2026-10-05', today)).not.toThrow()
    expect(() => assertEditable('2026-09-01', today)).toThrow(LockedError)
  })
})
