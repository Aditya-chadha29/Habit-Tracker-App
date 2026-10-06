import type { DateStr } from '../data/types'
import { addDays } from './dates'

/**
 * The history lock. Recent days can be corrected; older ones are the record and stay as they are.
 * With the default window of 7, today and the six days before it are editable.
 */
export function isEditable(date: DateStr, today: DateStr, windowDays = 7): boolean {
  return date <= today && date >= addDays(today, -(Math.max(1, windowDays) - 1))
}

/** First date that can still be edited. */
export function firstEditableDate(today: DateStr, windowDays = 7): DateStr {
  return addDays(today, -(Math.max(1, windowDays) - 1))
}

export class LockedError extends Error {
  readonly date: DateStr
  constructor(date: DateStr) {
    super(`${date} is locked: it is outside the window in which history can be corrected.`)
    this.name = 'LockedError'
    this.date = date
  }
}

export function assertEditable(date: DateStr, today: DateStr, windowDays = 7): void {
  if (!isEditable(date, today, windowDays)) throw new LockedError(date)
}
