import { db, type AppDb } from './db'
import type { WriteContext } from './habitRepo'
import type { DateStr, WeightEntry } from './types'
import { assertEditable } from '../engine/lock'

/**
 * Body weight. Stored in kilograms whatever unit is shown. A weigh-in is a measurement on a day:
 * it can be corrected or removed while that day is still open to correction, and after that it is
 * part of the record. An earlier measurement is never overwritten by a later one.
 */
const KG_PER_LB = 0.45359237

export function toDisplay(kg: number, unit: 'kg' | 'lb'): number {
  return Math.round((unit === 'lb' ? kg / KG_PER_LB : kg) * 10) / 10
}

export function toKg(value: number, unit: 'kg' | 'lb'): number {
  return Math.round((unit === 'lb' ? value * KG_PER_LB : value) * 100) / 100
}

function check(kg: number): void {
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) throw new Error('That weight does not look right. Enter a value between 20 and 400 kg.')
}

export async function addWeight(input: { date: DateStr; kg: number; note: string }, ctx: WriteContext, now: number, database: AppDb = db): Promise<number> {
  assertEditable(input.date, ctx.today, ctx.windowDays)
  check(input.kg)
  return (await database.weight_entries.add({ date: input.date, kg: input.kg, note: input.note.trim(), created_at: now })) as number
}

export async function updateWeight(id: number, patch: { kg: number; note: string }, ctx: WriteContext, database: AppDb = db): Promise<void> {
  check(patch.kg)
  await database.transaction('rw', database.weight_entries, async () => {
    const existing = await database.weight_entries.get(id)
    if (!existing) throw new Error('That weigh-in no longer exists.')
    assertEditable(existing.date, ctx.today, ctx.windowDays)
    await database.weight_entries.update(id, { kg: patch.kg, note: patch.note.trim() })
  })
}

export async function deleteWeight(id: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.weight_entries, async () => {
    const existing = await database.weight_entries.get(id)
    if (!existing) return
    assertEditable(existing.date, ctx.today, ctx.windowDays)
    await database.weight_entries.delete(id)
  })
}

/** Weigh-ins oldest first; several on one day stay in the order they were entered. */
export function sortWeights(entries: readonly WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at - b.created_at))
}
