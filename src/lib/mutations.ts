import { db } from './db'
import { todayLocalStr } from './dates'
import type { Polarity } from './types'

export async function toggleEntry(habitId: number, date: string): Promise<void> {
  const existing = await db.entries.where('[habit_id+date]').equals([habitId, date]).first()
  const newDone = !(existing?.done ?? false)
  if (existing) {
    await db.entries.update(existing.id!, { done: newDone })
  } else {
    await db.entries.add({ habit_id: habitId, date, done: newDone })
  }
}

export async function addHabit(name: string, sortOrder: number, polarity: Polarity = 'do'): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.habits.add({
    name: trimmed,
    short_name: trimmed.length > 22 ? trimmed.slice(0, 22) : trimmed,
    polarity,
    created_on: todayLocalStr(),
    retired_on: null,
    sort_order: sortOrder,
  })
}

export async function retireHabit(id: number): Promise<void> {
  await db.habits.update(id, { retired_on: todayLocalStr() })
}

export async function restoreHabit(id: number): Promise<void> {
  // Land at the end of the active list rather than reviving a stale sort_order that might now
  // sit in the middle of habits reordered since this one retired.
  await db.transaction('rw', db.habits, async () => {
    const active = await db.habits.filter((h) => !h.retired_on).toArray()
    const nextSortOrder = active.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1
    await db.habits.update(id, { retired_on: null, sort_order: nextSortOrder })
  })
}

export async function renameHabit(id: number, name: string, shortName: string): Promise<void> {
  const trimmedName = name.trim()
  const trimmedShort = shortName.trim()
  if (!trimmedName || !trimmedShort) return
  await db.habits.update(id, { name: trimmedName, short_name: trimmedShort })
}

/**
 * True deletion — the one exception to "habits are never deleted" (CLAUDE.md). Only ever call
 * this for a habit whose created_on is today: such a habit has never been part of a completed
 * day's score (today's is still "so far", not settled history — see CLAUDE.md's scoring rules),
 * so removing it can't retroactively change any daily score a user has already seen. A habit even
 * one day older than today WOULD have already contributed a miss/done to a locked-in past day's
 * denominator — deleting that turns history into fiction, which is exactly what retire/restore
 * exists to avoid. Callers must check eligibility themselves; this function trusts the caller.
 */
export async function deleteHabit(id: number): Promise<void> {
  await db.transaction('rw', db.habits, db.entries, async () => {
    await db.entries.where('habit_id').equals(id).delete()
    await db.habits.delete(id)
  })
}

export async function reorderHabits(orderedIds: number[]): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    await Promise.all(orderedIds.map((id, i) => db.habits.update(id, { sort_order: i })))
  })
}

export async function setDailyNote(date: string, text: string): Promise<void> {
  // `date` is the primary key, so this is a single atomic upsert — no read-then-write race
  // possible, unlike setWeeklyRecord below (which predates giving weekly_records a proper
  // primary key and still needs the transaction wrapper).
  await db.daily_notes.put({ date, text })
}

export async function setWeeklyRecord(
  weekMonday: string,
  patch: Partial<{ weight_kg: number | null; notes: string }>,
): Promise<void> {
  await db.transaction('rw', db.weekly_records, async () => {
    const existing = await db.weekly_records.where('week_monday').equals(weekMonday).first()
    if (existing) {
      await db.weekly_records.update(existing.id!, patch)
    } else {
      await db.weekly_records.add({
        week_monday: weekMonday,
        weight_kg: patch.weight_kg ?? null,
        notes: patch.notes ?? '',
      })
    }
  })
}
