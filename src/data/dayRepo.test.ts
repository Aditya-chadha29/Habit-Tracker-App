import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { saveDayPlan, setDayMark } from './dayRepo'
import { setMissReason } from './habitRepo'
import { LockedError } from '../engine/lock'

let counter = 0
const open: AppDb[] = []
afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})
const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }
function fresh(): AppDb {
  const db = createDb(`day-repo-test-${++counter}`)
  open.push(db)
  return db
}

describe('days off', () => {
  it('sets, changes and clears a mark', async () => {
    const db = fresh()
    await setDayMark(TODAY, 'travel', ctx, db)
    await setDayMark(TODAY, 'sick', ctx, db)
    expect(await db.day_marks.toArray()).toEqual([{ date: TODAY, kind: 'sick', note: '' }])
    await setDayMark(TODAY, null, ctx, db)
    expect(await db.day_marks.count()).toBe(0)
  })

  it('refuses a day outside the correction window', async () => {
    const db = fresh()
    await expect(setDayMark('2026-09-01', 'rest', ctx, db)).rejects.toBeInstanceOf(LockedError)
    await expect(setDayMark('2026-10-08', 'rest', ctx, db)).rejects.toBeInstanceOf(LockedError)
  })
})

describe('the plan for a day', () => {
  it('keeps at most three trimmed lines and removes an empty plan', async () => {
    const db = fresh()
    await saveDayPlan('2026-10-08', [' deep work ', '', 'gym', 'call', 'extra'], db)
    expect((await db.day_plans.get('2026-10-08'))?.items).toEqual(['deep work', 'gym', 'call'])
    await saveDayPlan('2026-10-08', ['', ' '], db)
    expect(await db.day_plans.count()).toBe(0)
  })
})

describe('a reason for a miss', () => {
  it('creates a not-done row, changes it and clears it, inside the window only', async () => {
    const db = fresh()
    const id = (await db.habits.add({ name: 'Read', versions: [], created_on: '2026-10-01' } as never)) as number
    await setMissReason(id, '2026-10-06', 'travel', ctx, db)
    expect(await db.entries.toArray()).toMatchObject([{ habit_id: id, date: '2026-10-06', done: false, reason: 'travel' }])
    await setMissReason(id, '2026-10-06', null, ctx, db)
    expect((await db.entries.toArray())[0].reason).toBeNull()
    await expect(setMissReason(id, '2026-09-01', 'sick', ctx, db)).rejects.toBeInstanceOf(LockedError)
  })
})
