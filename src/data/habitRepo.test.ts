import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import {
  changeHabit, createHabit, deleteHabitCreatedToday, listHabits, NotTickableError, reorderHabits,
  restoreHabit, retireHabit, setHabitDone, toggleHabit,
} from './habitRepo'
import { buildCompletionIndex } from '../engine/completion'
import { LockedError } from '../engine/lock'
import { dayScore } from '../engine/score'
import { isDueOn, nameOn } from '../engine/timeline'

let counter = 0
const open: AppDb[] = []

function freshDb(): AppDb {
  counter += 1
  const db = createDb(`habit-repo-test-${counter}`)
  open.push(db)
  return db
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }

async function indexOf(db: AppDb) {
  return buildCompletionIndex({ entries: await db.entries.toArray(), sessions: [], learningSessions: [], journalDates: [] })
}

describe('creating and changing habits', () => {
  it('creates a habit that starts today', async () => {
    const db = freshDb()
    const id = await createHabit({ name: '  Stretch  ', area: 'body' }, TODAY, db)
    const [habit] = await listHabits(db)
    expect(habit).toMatchObject({ id, name: 'Stretch', short_name: 'Stretch', created_on: TODAY, retired_on: null })
    expect(isDueOn(habit, '2026-10-06')).toBe(false)
    expect(isDueOn(habit, TODAY)).toBe(true)
  })

  it('refuses a habit with no name or an impossible schedule', async () => {
    const db = freshDb()
    await expect(createHabit({ name: '   ', area: 'body' }, TODAY, db)).rejects.toThrow()
    await expect(
      createHabit({ name: 'X', area: 'body', day: { kind: 'weekdays', weekdays: [] } }, TODAY, db),
    ).rejects.toThrow()
    expect(await db.habits.count()).toBe(0)
  })

  it('a rename keeps the old name on old days and the history on the same habit', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'Skincare', area: 'body' }, '2026-09-01', db)
    await setHabitDone(id, '2026-10-05', true, ctx, {}, db)
    await changeHabit(id, { name: 'Daily moisturiser' }, TODAY, db)
    const habit = (await db.habits.get(id))!
    expect(habit.name).toBe('Daily moisturiser')
    expect(nameOn(habit, '2026-09-15')).toBe('Skincare')
    expect(await db.entries.where('habit_id').equals(id).count()).toBe(1)
  })

  it('changing the frequency does not change any earlier day', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'Hair care', area: 'body' }, '2026-09-01', db)
    await setHabitDone(id, '2026-10-05', true, ctx, {}, db)
    const before = dayScore(await listHabits(db), '2026-10-05', await indexOf(db))
    await changeHabit(id, { day: { kind: 'flexible' }, target: { per: 'week', count: 2 } }, TODAY, db)
    const habits = await listHabits(db)
    expect(dayScore(habits, '2026-10-05', await indexOf(db))).toMatchObject({ done: before.done, due: before.due })
    expect(dayScore(habits, '2026-10-06', await indexOf(db)).due).toBe(1)
    expect(dayScore(habits, TODAY, await indexOf(db)).due).toBe(0)
  })

  it('retiring removes it from today on, and restoring leaves the gap untracked', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'Cold shower', area: 'body' }, '2026-09-01', db)
    await retireHabit(id, '2026-09-20', db)
    let habit = (await db.habits.get(id))!
    expect(habit.retired_on).toBe('2026-09-20')
    expect(isDueOn(habit, '2026-09-19')).toBe(true)
    expect(isDueOn(habit, '2026-09-20')).toBe(false)

    await restoreHabit(id, TODAY, db)
    habit = (await db.habits.get(id))!
    expect(habit.retired_on).toBeNull()
    expect(isDueOn(habit, '2026-10-01')).toBe(false)
    expect(isDueOn(habit, TODAY)).toBe(true)
  })

  it('reorders', async () => {
    const db = freshDb()
    const a = await createHabit({ name: 'A', area: 'mind' }, TODAY, db)
    const b = await createHabit({ name: 'B', area: 'mind' }, TODAY, db)
    await reorderHabits([b, a], db)
    expect((await listHabits(db)).map((h) => h.name)).toEqual(['B', 'A'])
  })

  it('only a habit created today can be deleted', async () => {
    const db = freshDb()
    const old = await createHabit({ name: 'Old', area: 'mind' }, '2026-10-01', db)
    const fresh = await createHabit({ name: 'Mistake', area: 'mind' }, TODAY, db)
    await expect(deleteHabitCreatedToday(old, TODAY, db)).rejects.toThrow()
    await deleteHabitCreatedToday(fresh, TODAY, db)
    expect((await listHabits(db)).map((h) => h.name)).toEqual(['Old'])
  })
})

describe('ticking', () => {
  it('toggles on and off without ever duplicating the row', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'Meditation', area: 'mind' }, '2026-09-01', db)
    expect(await toggleHabit(id, TODAY, ctx, {}, db)).toBe(true)
    expect(await toggleHabit(id, TODAY, ctx, {}, db)).toBe(false)
    expect(await toggleHabit(id, TODAY, ctx, {}, db)).toBe(true)
    const rows = await db.entries.where('habit_id').equals(id).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].done).toBe(true)
  })

  it('two taps landing together still end up as one tick each', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'Meditation', area: 'mind' }, '2026-09-01', db)
    await Promise.all([toggleHabit(id, TODAY, ctx, {}, db), toggleHabit(id, TODAY, ctx, {}, db)])
    const rows = await db.entries.where('habit_id').equals(id).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].done).toBe(false)
  })

  it('records the target value for a measured habit, and a given value when there is one', async () => {
    const db = freshDb()
    const id = await createHabit(
      { name: '10 push-ups', area: 'exercise', measure: { type: 'count', target: 10, unit: 'reps' } },
      '2026-09-01',
      db,
    )
    await setHabitDone(id, TODAY, true, ctx, { time: '04:20' }, db)
    expect((await db.entries.toArray())[0]).toMatchObject({ done: true, value: 10, time: '04:20' })
    await setHabitDone(id, TODAY, true, ctx, { value: 14 }, db)
    expect((await db.entries.toArray())[0].value).toBe(14)
    await setHabitDone(id, TODAY, false, ctx, {}, db)
    // Unticking keeps what was recorded, so ticking again brings it back rather than the default.
    expect((await db.entries.toArray())[0]).toMatchObject({ done: false, value: 14, time: '04:20' })
    await setHabitDone(id, TODAY, true, ctx, {}, db)
    expect((await db.entries.toArray())[0]).toMatchObject({ done: true, value: 14, time: '04:20' })
  })

  it('allows the last seven days and refuses anything older or in the future', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'Meditation', area: 'mind' }, '2026-09-01', db)
    await setHabitDone(id, '2026-10-01', true, ctx, {}, db)
    await expect(setHabitDone(id, '2026-09-30', true, ctx, {}, db)).rejects.toBeInstanceOf(LockedError)
    await expect(setHabitDone(id, '2026-10-08', true, ctx, {}, db)).rejects.toBeInstanceOf(LockedError)
    expect(await db.entries.count()).toBe(1)
  })

  it('refuses to tick a habit that sessions complete', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'Gym', area: 'exercise', sources: ['workout'] }, '2026-09-01', db)
    await expect(toggleHabit(id, TODAY, ctx, {}, db)).rejects.toBeInstanceOf(NotTickableError)
    expect(await db.entries.count()).toBe(0)
  })

  it('refuses to tick a day the habit was not being tracked', async () => {
    const db = freshDb()
    const id = await createHabit({ name: 'New', area: 'mind' }, TODAY, db)
    await expect(setHabitDone(id, '2026-10-06', true, ctx, {}, db)).rejects.toBeInstanceOf(NotTickableError)
  })
})
