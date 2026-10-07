import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { addWeight, deleteWeight, sortWeights, toDisplay, toKg, updateWeight } from './weightRepo'
import { LockedError } from '../engine/lock'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }

function fresh(): AppDb {
  const db = createDb(`weight-repo-test-${++counter}`)
  open.push(db)
  return db
}

describe('weigh-ins', () => {
  it('adds a measurement without touching earlier ones', async () => {
    const db = fresh()
    await addWeight({ date: '2026-10-04', kg: 71.3, note: '' }, ctx, 1, db)
    await addWeight({ date: TODAY, kg: 70.8, note: ' morning ' }, ctx, 2, db)
    await addWeight({ date: TODAY, kg: 70.9, note: '' }, ctx, 3, db)
    const all = sortWeights(await db.weight_entries.toArray())
    expect(all.map((entry) => [entry.date, entry.kg])).toEqual([['2026-10-04', 71.3], [TODAY, 70.8], [TODAY, 70.9]])
    expect(all[1].note).toBe('morning')
  })

  it('corrects and removes only inside the window', async () => {
    const db = fresh()
    const id = await addWeight({ date: '2026-10-02', kg: 71.0, note: '' }, ctx, 1, db)
    await updateWeight(id, { kg: 70.6, note: 'retyped' }, ctx, db)
    expect(await db.weight_entries.get(id)).toMatchObject({ kg: 70.6, note: 'retyped' })
    const later = { today: '2026-10-20', windowDays: 7 }
    await expect(updateWeight(id, { kg: 60, note: '' }, later, db)).rejects.toBeInstanceOf(LockedError)
    await expect(deleteWeight(id, later, db)).rejects.toBeInstanceOf(LockedError)
    await deleteWeight(id, ctx, db)
    expect(await db.weight_entries.count()).toBe(0)
  })

  it('refuses a locked or future day and an impossible value', async () => {
    const db = fresh()
    await expect(addWeight({ date: '2026-09-20', kg: 70, note: '' }, ctx, 1, db)).rejects.toBeInstanceOf(LockedError)
    await expect(addWeight({ date: '2026-10-08', kg: 70, note: '' }, ctx, 1, db)).rejects.toBeInstanceOf(LockedError)
    await expect(addWeight({ date: TODAY, kg: 7, note: '' }, ctx, 1, db)).rejects.toThrow()
    await expect(addWeight({ date: TODAY, kg: Number.NaN, note: '' }, ctx, 1, db)).rejects.toThrow()
    expect(await db.weight_entries.count()).toBe(0)
  })

  it('converts between kilograms and pounds without drifting', () => {
    expect(toDisplay(70.8, 'kg')).toBe(70.8)
    expect(toDisplay(70.8, 'lb')).toBe(156.1)
    expect(toKg(156.1, 'lb')).toBe(70.81)
    expect(toDisplay(toKg(156.1, 'lb'), 'lb')).toBe(156.1)
    expect(toKg(70.8, 'kg')).toBe(70.8)
  })
})
