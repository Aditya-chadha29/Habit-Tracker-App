import { db, type AppDb } from './db'
import type { WriteContext } from './habitRepo'
import type { DateStr } from './types'
import { assertEditable } from '../engine/lock'

export interface MeasurementInput {
  date: DateStr
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  note: string
}

const check = (value: number | null, what: string): void => {
  if (value !== null && (!Number.isFinite(value) || value < 10 || value > 300)) throw new Error(`That ${what} does not look right. Enter centimetres between 10 and 300.`)
}

/** Adds body measurements for a day, in centimetres. At least one measure is needed. */
export async function addMeasurement(input: MeasurementInput, ctx: WriteContext, now: number, database: AppDb = db): Promise<number> {
  assertEditable(input.date, ctx.today, ctx.windowDays)
  check(input.waist_cm, 'waist')
  check(input.chest_cm, 'chest')
  check(input.arm_cm, 'arm')
  if (input.waist_cm === null && input.chest_cm === null && input.arm_cm === null) throw new Error('Enter at least one measurement.')
  return (await database.measurements.add({ ...input, note: input.note.trim(), created_at: now })) as number
}

export async function deleteMeasurement(id: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.measurements, async () => {
    const existing = await database.measurements.get(id)
    if (!existing) return
    assertEditable(existing.date, ctx.today, ctx.windowDays)
    await database.measurements.delete(id)
  })
}
