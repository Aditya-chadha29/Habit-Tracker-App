import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { createHabit, setHabitDone } from './habitRepo'
import { canReflectOn, freezeDueWeeks, saveReflection, weekStatsFor } from './reviewRepo'
import { DEFAULT_SETTINGS } from './settingsRepo'
import { LockedError } from '../engine/lock'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

async function setup() {
  const db = createDb(`review-repo-test-${++counter}`)
  open.push(db)
  // Tracked from Monday 14 September 2026.
  const meditation = await createHabit({ name: 'Meditation', area: 'mind' }, '2026-09-14', db)
  const hair = await createHabit({ name: 'Hair oiling', area: 'body', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } }, '2026-09-14', db)
  const tick = (habitId: number, date: string) => setHabitDone(habitId, date, true, { today: date, windowDays: 7 }, {}, db)
  for (const date of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-21', '2026-09-28']) await tick(meditation, date)
  await tick(hair, '2026-09-14') // week 1: 1 of 2
  await tick(hair, '2026-09-21')
  await tick(hair, '2026-09-23') // week 2: 2 of 2
  return { db, meditation, hair, tick }
}

// These cases are written around weeks that start on a Monday.
const settings = { ...DEFAULT_SETTINGS, week_start: 0 }

describe('freezing weeks', () => {
  it('freezes every fully locked week, oldest first, and leaves recent weeks live', async () => {
    const { db } = await setup()
    // On Wed 7 Oct the correction window reaches back to Thu 1 Oct. Weeks ending 20 and 27 Sep
    // are fully locked; the week ending 4 Oct still has correctable days.
    const frozen = await freezeDueWeeks('2026-10-07', settings, 1, db)
    expect(frozen).toEqual(['2026-09-14', '2026-09-21'])
    const first = (await db.weekly_reviews.get('2026-09-14'))!
    expect(first.frozen_on).toBe('2026-10-07')
    expect(first.frozen!.targets[0]).toMatchObject({ name: 'Hair oiling', done: 1, target: 2, outcome: 'missed' })
    expect([first.frozen!.done, first.frozen!.due]).toEqual([4, 9])
    expect((await db.weekly_reviews.get('2026-09-21'))!.frozen!.targets[0].outcome).toBe('met')
    expect(await db.weekly_reviews.get('2026-09-28')).toBeUndefined()
  })

  it('is idempotent', async () => {
    const { db } = await setup()
    await freezeDueWeeks('2026-10-07', settings, 1, db)
    const before = await db.weekly_reviews.toArray()
    expect(await freezeDueWeeks('2026-10-07', settings, 2, db)).toEqual([])
    expect(await db.weekly_reviews.toArray()).toEqual(before)
  })

  it('a frozen week never changes, whatever happens to its data afterwards', async () => {
    const { db, hair } = await setup()
    await freezeDueWeeks('2026-10-07', settings, 1, db)
    // Force a tick into the old week directly, as an import or a bug might.
    await db.entries.add({ habit_id: hair, date: '2026-09-17', done: true })
    const { stats, frozen } = await weekStatsFor('2026-09-14', '2026-10-07', settings, db)
    expect(frozen).toBe(true)
    expect(stats.targets[0]).toMatchObject({ done: 1, outcome: 'missed' })
  })

  it('keeps a reflection that was written before the week froze', async () => {
    const { db } = await setup()
    await saveReflection('2026-09-21', { reflection_good: 'Steady week.' }, { today: '2026-09-28', windowDays: 7 }, 5, db)
    await freezeDueWeeks('2026-10-07', settings, 9, db)
    expect(await db.weekly_reviews.get('2026-09-21')).toMatchObject({ reflection_good: 'Steady week.', frozen_on: '2026-10-07' })
  })

  it('carries earlier weeks into the comparisons of a later one', async () => {
    const { db } = await setup()
    await freezeDueWeeks('2026-10-20', settings, 1, db)
    const third = (await db.weekly_reviews.get('2026-09-28'))!.frozen!
    expect(third.observations.some((line) => line.startsWith('Week completion was'))).toBe(false) // fewer than 10 due items: not enough evidence
    expect((await db.weekly_reviews.get('2026-09-21'))!.frozen!.targets[0].outcome).toBe('met')
  })
})

describe('live weeks', () => {
  it('computes the running week live, with open targets', async () => {
    const { db, hair, tick } = await setup()
    await tick(hair, '2026-10-05')
    const { stats, frozen } = await weekStatsFor('2026-10-05', '2026-10-07', settings, db)
    expect(frozen).toBe(false)
    expect(stats.targets[0]).toMatchObject({ done: 1, target: 2, outcome: 'open' })
    expect(stats.days).toHaveLength(3)
  })

  it('a new week starts at zero and the week before keeps what it had', async () => {
    const { db } = await setup()
    const now = (await weekStatsFor('2026-10-05', '2026-10-05', settings, db)).stats
    expect(now.targets[0]).toMatchObject({ done: 0, target: 2 })
    const before = (await weekStatsFor('2026-09-21', '2026-10-05', settings, db)).stats
    expect(before.targets[0]).toMatchObject({ done: 2, outcome: 'met' })
  })
})

describe('reflections', () => {
  it('can be written during the week and for a few days after it ends', async () => {
    const { db } = await setup()
    expect(canReflectOn('2026-10-05', '2026-10-07', 7)).toBe(true) // running week
    expect(canReflectOn('2026-09-28', '2026-10-07', 7)).toBe(true) // ended on the 4th, still inside the window
    expect(canReflectOn('2026-09-21', '2026-10-07', 7)).toBe(false)
    expect(canReflectOn('2026-10-12', '2026-10-07', 7)).toBe(false) // a week that has not begun
    await saveReflection('2026-09-28', { reflection_change: 'Sleep earlier.' }, { today: '2026-10-07', windowDays: 7 }, 3, db)
    await saveReflection('2026-09-28', { next_week_notes: 'Oil hair on Tuesday.' }, { today: '2026-10-07', windowDays: 7 }, 4, db)
    expect(await db.weekly_reviews.get('2026-09-28')).toMatchObject({ reflection_change: 'Sleep earlier.', next_week_notes: 'Oil hair on Tuesday.', week_end: '2026-10-04' })
    await expect(saveReflection('2026-09-14', { reflection_good: 'x' }, { today: '2026-10-07', windowDays: 7 }, 5, db)).rejects.toBeInstanceOf(LockedError)
  })
})
