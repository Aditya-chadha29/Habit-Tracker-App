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
  await db.habits.update(id, { retired_on: null })
}

export async function renameHabit(id: number, name: string, shortName: string): Promise<void> {
  const trimmedName = name.trim()
  const trimmedShort = shortName.trim()
  if (!trimmedName || !trimmedShort) return
  await db.habits.update(id, { name: trimmedName, short_name: trimmedShort })
}

export async function reorderHabits(orderedIds: number[]): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    await Promise.all(orderedIds.map((id, i) => db.habits.update(id, { sort_order: i })))
  })
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
