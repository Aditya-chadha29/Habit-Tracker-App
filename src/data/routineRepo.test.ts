import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { createDayRoutine, reorderDayRoutines, setDayRoutineRetired, setHabitInRoutine, updateDayRoutine } from './routineRepo'
import type { RoutineStep } from './types'

const open: AppDb[] = []
let counter = 0

function fresh(): AppDb {
  const db = createDb(`routine-test-${++counter}`)
  open.push(db)
  return db
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

const step = (patch: Partial<RoutineStep>): RoutineStep => ({ key: '', habit_id: null, label: '', time: '', minutes: null, note: '', ...patch })

describe('day routines', () => {
  it('creates a routine at the end of the list with its steps tidied', async () => {
    const db = fresh()
    const first = await createDayRoutine(
      '  Morning routine ',
      'morning',
      [step({ habit_id: 1, time: '04:00' }), step({ label: '  Leave for work ' }), step({ label: '   ' })],
      db,
    )
    const second = await createDayRoutine('Evening', 'evening', [], db)

    const rows = await db.day_routines.orderBy('sort_order').toArray()
    expect(rows.map((row) => [row.id, row.name, row.sort_order, row.retired_on])).toEqual([
      [first, 'Morning routine', 0, null],
      [second, 'Evening', 1, null],
    ])
    // The reminder with no words is gone; the others keep their order.
    expect(rows[0].steps.map((s) => [s.habit_id, s.label, s.time])).toEqual([
      [1, '', '04:00'],
      [null, 'Leave for work', ''],
    ])
    expect(rows[0].steps.every((s) => s.key !== '')).toBe(true)
    expect(new Set(rows[0].steps.map((s) => s.key)).size).toBe(2)
  })

  it('refuses a routine without a name', async () => {
    const db = fresh()
    await expect(createDayRoutine('  ', 'morning', [], db)).rejects.toThrow('A routine needs a name.')
    const id = await createDayRoutine('Morning', 'morning', [], db)
    await expect(updateDayRoutine(id, { name: ' ' }, db)).rejects.toThrow('A routine needs a name.')
    expect((await db.day_routines.get(id))!.name).toBe('Morning')
  })

  it('drops a time that is not a time and a duration that is not positive', async () => {
    const db = fresh()
    const id = await createDayRoutine(
      'Morning',
      'morning',
      [step({ habit_id: 1, time: '25:00', minutes: 0 }), step({ habit_id: 2, time: '9:5', minutes: 12.4 }), step({ habit_id: 3, time: '23:59', minutes: -3 })],
      db,
    )
    const steps = (await db.day_routines.get(id))!.steps
    expect(steps.map((s) => [s.time, s.minutes])).toEqual([
      ['', null],
      ['', 12],
      ['23:59', null],
    ])
  })

  it('gives two steps that share a key their own', async () => {
    const db = fresh()
    const id = await createDayRoutine('Morning', 'morning', [step({ key: 'a', habit_id: 1 }), step({ key: 'a', habit_id: 2 })], db)
    const keys = (await db.day_routines.get(id))!.steps.map((s) => s.key)
    expect(keys[0]).toBe('a')
    expect(keys[1]).not.toBe('a')
  })

  it('changes only what it is given', async () => {
    const db = fresh()
    const id = await createDayRoutine('Morning', 'morning', [step({ key: 'a', habit_id: 1 })], db)
    await updateDayRoutine(id, { slot: 'evening' }, db)
    expect(await db.day_routines.get(id)).toMatchObject({ name: 'Morning', slot: 'evening', steps: [{ key: 'a', habit_id: 1 }] })

    await updateDayRoutine(id, { name: 'Wind down', steps: [] }, db)
    expect(await db.day_routines.get(id)).toMatchObject({ name: 'Wind down', slot: 'evening', steps: [] })
  })

  it('adds a habit to a routine once, at the end, and takes it out again', async () => {
    const db = fresh()
    const id = await createDayRoutine('Morning', 'morning', [step({ key: 'a', habit_id: 1 })], db)

    await setHabitInRoutine(id, 7, true, db)
    await setHabitInRoutine(id, 7, true, db)
    expect((await db.day_routines.get(id))!.steps.map((s) => s.habit_id)).toEqual([1, 7])

    await setHabitInRoutine(id, 7, false, db)
    await setHabitInRoutine(id, 7, false, db)
    expect((await db.day_routines.get(id))!.steps.map((s) => s.habit_id)).toEqual([1])

    // A routine that has gone is not an error: there is simply nothing to change.
    await expect(setHabitInRoutine(999, 7, true, db)).resolves.toBeUndefined()
  })

  it('reorders and retires without touching the steps', async () => {
    const db = fresh()
    const morning = await createDayRoutine('Morning', 'morning', [step({ key: 'a', habit_id: 1 })], db)
    const evening = await createDayRoutine('Evening', 'evening', [step({ key: 'b', habit_id: 2 })], db)

    await reorderDayRoutines([evening, morning], db)
    expect((await db.day_routines.orderBy('sort_order').toArray()).map((row) => row.name)).toEqual(['Evening', 'Morning'])

    await setDayRoutineRetired(morning, '2026-10-07', db)
    expect(await db.day_routines.get(morning)).toMatchObject({ retired_on: '2026-10-07', steps: [{ key: 'a', habit_id: 1 }] })
    await setDayRoutineRetired(morning, null, db)
    expect((await db.day_routines.get(morning))!.retired_on).toBeNull()
  })
})
