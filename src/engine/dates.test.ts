import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, clockHHMM, dateRange, daysBetween, daysInMonthOf, formatDayTitle, formatRange,
  isValidDateStr, logicalDate, monthEndOf, monthStartOf, relativeDayLabel, toLocalDateStr,
  weekEndOf, weekStartOf, weekdayIndex,
} from './dates'

describe('calendar arithmetic', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('counts whole days between dates in either direction', () => {
    expect(daysBetween('2026-10-05', '2026-10-11')).toBe(6)
    expect(daysBetween('2026-10-11', '2026-10-05')).toBe(-6)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  it('lists an inclusive range and returns nothing for a backwards one', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(dateRange('2026-10-05', '2026-10-04')).toEqual([])
  })

  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0) // Monday
    expect(weekdayIndex('2026-10-06')).toBe(1) // Tuesday
    expect(weekdayIndex('2026-10-11')).toBe(6) // Sunday
  })

  it('finds the week for any configured first day', () => {
    expect(weekStartOf('2026-10-07')).toBe('2026-10-05')
    expect(weekEndOf('2026-10-07')).toBe('2026-10-11')
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05')
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05')
    // Sunday-start week
    expect(weekStartOf('2026-10-07', 6)).toBe('2026-10-04')
    expect(weekStartOf('2026-10-04', 6)).toBe('2026-10-04')
    expect(weekStartOf('2026-10-03', 6)).toBe('2026-09-27')
    // A week that spans a year boundary
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28')
    expect(weekEndOf('2026-12-30')).toBe('2027-01-03')
  })

  it('knows month lengths, including February in a leap year', () => {
    expect(daysInMonthOf('2026-02-10')).toBe(28)
    expect(daysInMonthOf('2028-02-10')).toBe(29)
    expect(monthStartOf('2026-10-17')).toBe('2026-10-01')
    expect(monthEndOf('2026-10-17')).toBe('2026-10-31')
    expect(monthEndOf('2026-11-17')).toBe('2026-11-30')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
  })

  it('accepts only real calendar dates', () => {
    expect(isValidDateStr('2026-10-06')).toBe(true)
    expect(isValidDateStr('2028-02-29')).toBe(true)
    expect(isValidDateStr('2027-02-29')).toBe(false)
    expect(isValidDateStr('2026-13-01')).toBe(false)
    expect(isValidDateStr('2026-1-1')).toBe(false)
    expect(isValidDateStr('2026-10-06T00:00:00Z')).toBe(false)
    expect(isValidDateStr(20261006)).toBe(false)
    expect(isValidDateStr(null)).toBe(false)
  })
})

describe('reading the device clock', () => {
  it('uses the local calendar day, never the UTC one', () => {
    // 04:00 local on 6 October. In IST that instant is still 5 October in UTC, which is exactly
    // the bug a toISOString()-based date would introduce for a 4 AM wake-up.
    const fourAm = new Date(2026, 9, 6, 4, 0, 0)
    expect(toLocalDateStr(fourAm)).toBe('2026-10-06')
    expect(logicalDate(fourAm)).toBe('2026-10-06')
    expect(clockHHMM(fourAm)).toBe('04:00')
  })

  it('keeps the small hours on the previous day when the day starts later', () => {
    const halfPastOne = new Date(2026, 9, 6, 1, 30, 0)
    expect(logicalDate(halfPastOne, 0)).toBe('2026-10-06')
    expect(logicalDate(halfPastOne, 3)).toBe('2026-10-05')
    expect(logicalDate(new Date(2026, 9, 6, 3, 0, 0), 3)).toBe('2026-10-06')
    // Across a year boundary
    expect(logicalDate(new Date(2027, 0, 1, 0, 30, 0), 2)).toBe('2026-12-31')
  })
})

describe('formatting', () => {
  it('writes dates the way the screens show them', () => {
    expect(formatDayTitle('2026-10-06')).toBe('Tuesday, 6 October')
    expect(formatRange('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct 2026')
    expect(relativeDayLabel('2026-10-06', '2026-10-06')).toBe('Today')
    expect(relativeDayLabel('2026-10-05', '2026-10-06')).toBe('Yesterday')
    expect(relativeDayLabel('2026-10-03', '2026-10-06')).toBe('3 days ago')
    expect(relativeDayLabel('2026-09-20', '2026-10-06')).toBe('Sun 20 Sep')
  })
})
