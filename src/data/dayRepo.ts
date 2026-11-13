import { db, type AppDb } from './db'
import type { WriteContext } from './habitRepo'
import type { DateStr, DayMarkKind } from './types'
import { assertEditable } from '../engine/lock'

/**
 * Marks a day as a day off (rest, travel, sick), or clears the mark with null. Nothing is due on
 * a day off. It can only be set on a day still open to correction, so a locked day's score can
 * never be changed this way.
 */
export async function setDayMark(date: DateStr, kind: DayMarkKind | null, ctx: WriteContext, database: AppDb = db): Promise<void> {
  assertEditable(date, ctx.today, ctx.windowDays)
  if (kind === null) await database.day_marks.delete(date)
  else await database.day_marks.put({ date, kind, note: '' })
}

export const PLAN_ITEMS = 3
export const PLAN_ITEM_LENGTH = 80

/** Saves the lines planned for a day. Empty lines are dropped; a plan with none is removed. */
export async function saveDayPlan(date: DateStr, items: readonly string[], database: AppDb = db): Promise<void> {
  const clean = items.map((item) => item.trim().slice(0, PLAN_ITEM_LENGTH)).filter(Boolean).slice(0, PLAN_ITEMS)
  if (clean.length === 0) await database.day_plans.delete(date)
  else await database.day_plans.put({ date, items: clean })
}
