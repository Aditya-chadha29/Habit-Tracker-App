import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { addMeasurement, deleteMeasurement } from './measurementRepo'
import { addExerciseToSession, completeSet, finishSession, reorderBlocks, setBlockNote, startSession, swapExercise } from './workoutRepo'
import type { Exercise } from './types'
import { LockedError } from '../engine/lock'

let counter = 0
const open: AppDb[] = []
afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})
const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }
const exercise = (name: string): Exercise => ({ name, primary_muscle: 'chest', equipment: 'barbell', kind: 'weight_reps', increment_kg: 2.5, bar_weight_kg: 20, rest_seconds: null, is_builtin: false, retired_on: null, sort_order: 0, notes: '' })

async function session(): Promise<{ db: AppDb; id: number; a: number; b: number; c: number }> {
  const db = createDb(`gym-tools-test-${++counter}`)
  open.push(db)
  const a = (await db.exercises.add(exercise('Bench'))) as number
  const b = (await db.exercises.add(exercise('Row'))) as number
  const c = (await db.exercises.add(exercise('Press'))) as number
  const id = await startSession(null, TODAY, ctx, 1, db)
  await addExerciseToSession(id, a, ctx, 2, db)
  await addExerciseToSession(id, b, ctx, 2, db)
  return { db, id, a, b, c }
}
const blocks = async (db: AppDb, id: number) =>
  (await db.set_logs.where('session_id').equals(id).toArray()).sort((x, y) => x.position - y.position || x.set_index - y.set_index).map((row) => [row.position, row.exercise_id, row.set_index, row.done])

describe('in-workout tools', () => {
  it('reorders the blocks', async () => {
    const { db, id, a, b } = await session()
    await reorderBlocks(id, [1, 0], ctx, db)
    expect((await blocks(db, id)).map((row) => row[1])).toEqual([b, b, a, a])
  })

  it('swaps only the sets not yet done, as a block of their own after the done ones', async () => {
    const { db, id, a, b, c } = await session()
    const first = (await db.set_logs.where('session_id').equals(id).toArray()).find((row) => row.position === 0 && row.set_index === 1)!
    await completeSet(first.id!, { weight_kg: 60, reps: 8 }, null, ctx, 2, db)
    await swapExercise(id, 0, c, ctx, db)
    expect(await blocks(db, id)).toEqual([[0, a, 1, true], [1, c, 1, false], [2, b, 1, false], [2, b, 2, false]])
  })

  it('swaps a block in place when nothing in it is done', async () => {
    const { db, id, b, c } = await session()
    await swapExercise(id, 0, c, ctx, db)
    expect((await blocks(db, id)).map((row) => [row[0], row[1]])).toEqual([[0, c], [0, c], [1, b], [1, b]])
  })

  it('keeps an exercise note and a chosen name through finishing', async () => {
    const { db, id } = await session()
    await setBlockNote(id, 0, ' elbows in ', ctx, db)
    const second = (await db.set_logs.where('session_id').equals(id).toArray()).find((row) => row.position === 0 && row.set_index === 2)!
    await completeSet(second.id!, { weight_kg: 60, reps: 8 }, null, ctx, 2, db)
    await finishSession(id, '', ctx, 3, db, 'Chest day')
    const rows = await db.set_logs.where('session_id').equals(id).toArray()
    expect(rows.map((row) => row.note)).toEqual(['elbows in'])
    expect((await db.sessions.get(id))?.title).toBe('Chest day')
  })
})

describe('body measurements', () => {
  it('adds and removes inside the window, and needs at least one figure', async () => {
    const db = createDb(`gym-tools-test-${++counter}`)
    open.push(db)
    const id = await addMeasurement({ date: TODAY, waist_cm: 84, chest_cm: null, arm_cm: null, note: '' }, ctx, 1, db)
    await expect(addMeasurement({ date: TODAY, waist_cm: null, chest_cm: null, arm_cm: null, note: '' }, ctx, 1, db)).rejects.toThrow('at least one')
    await expect(addMeasurement({ date: '2026-09-01', waist_cm: 84, chest_cm: null, arm_cm: null, note: '' }, ctx, 1, db)).rejects.toBeInstanceOf(LockedError)
    await deleteMeasurement(id, ctx, db)
    expect(await db.measurements.count()).toBe(0)
  })
})
