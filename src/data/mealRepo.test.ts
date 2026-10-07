import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { createHabit, retireHabit } from './habitRepo'
import { mealsBetween, mealsOn, saveMeal } from './mealRepo'
import { LockedError } from '../engine/lock'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }

async function setup() {
  const db = createDb(`meal-repo-test-${++counter}`)
  open.push(db)
  const breakfast = await createHabit({ name: 'Breakfast', area: 'body', kind: 'meal', meal_slot: 'breakfast' }, '2026-09-01', db)
  return { db, breakfast }
}

describe('meals', () => {
  it('keeps what was eaten, on the day and slot it was written for', async () => {
    const { db } = await setup()
    await saveMeal(TODAY, 'breakfast', { text: '  Poha, two eggs, chai ' }, ctx, {}, db)
    await saveMeal('2026-10-06', 'dinner', { text: 'Rajma, rice', ate_out: true }, ctx, {}, db)
    expect(await mealsOn(TODAY, db)).toEqual([{ date: TODAY, slot: 'breakfast', text: 'Poha, two eggs, chai', ate_out: false, time: null }])
    expect((await mealsOn('2026-10-06', db))[0]).toMatchObject({ slot: 'dinner', ate_out: true })
  })

  it('merges separate saves into one row', async () => {
    const { db } = await setup()
    await saveMeal(TODAY, 'lunch', { text: 'Dal, roti' }, ctx, {}, db)
    await saveMeal(TODAY, 'lunch', { ate_out: true }, ctx, {}, db)
    await saveMeal(TODAY, 'lunch', { time: '13:10' }, ctx, {}, db)
    expect(await mealsOn(TODAY, db)).toEqual([{ date: TODAY, slot: 'lunch', text: 'Dal, roti', ate_out: true, time: '13:10' }])
  })

  it('ticks the meal when a description is first written, with the time', async () => {
    const { db, breakfast } = await setup()
    await saveMeal(TODAY, 'breakfast', { text: 'Poha' }, ctx, { habitId: breakfast, time: '07:30' }, db)
    expect(await db.entries.toArray()).toMatchObject([{ habit_id: breakfast, date: TODAY, done: true, time: '07:30' }])
    expect((await mealsOn(TODAY, db))[0].time).toBe('07:30')
  })

  it('does not tick again on an edit, and never unticks when the text is cleared', async () => {
    const { db, breakfast } = await setup()
    await saveMeal(TODAY, 'breakfast', { text: 'Poha' }, ctx, { habitId: breakfast }, db)
    await db.entries.where('habit_id').equals(breakfast).modify({ done: false })
    await saveMeal(TODAY, 'breakfast', { text: 'Poha and chai' }, ctx, { habitId: breakfast }, db)
    expect((await db.entries.toArray())[0].done).toBe(false)
    await db.entries.where('habit_id').equals(breakfast).modify({ done: true })
    await saveMeal(TODAY, 'breakfast', { text: '' }, ctx, { habitId: breakfast }, db)
    expect((await db.entries.toArray())[0].done).toBe(true)
  })

  it('still keeps the text when the meal habit cannot be ticked', async () => {
    const { db, breakfast } = await setup()
    await retireHabit(breakfast, '2026-10-05', db)
    await saveMeal(TODAY, 'breakfast', { text: 'Idli' }, ctx, { habitId: breakfast }, db)
    expect((await mealsOn(TODAY, db))[0].text).toBe('Idli')
    expect(await db.entries.count()).toBe(0)
  })

  it('refuses days outside the correction window', async () => {
    const { db } = await setup()
    await expect(saveMeal('2026-09-20', 'lunch', { text: 'x' }, ctx, {}, db)).rejects.toBeInstanceOf(LockedError)
    expect(await db.meals.count()).toBe(0)
  })

  it('lists the food history newest first, skipping empty rows', async () => {
    const { db } = await setup()
    await saveMeal('2026-10-05', 'lunch', { text: 'Dal' }, ctx, {}, db)
    await saveMeal('2026-10-06', 'lunch', { text: 'Khichdi' }, ctx, {}, db)
    await saveMeal('2026-10-06', 'dinner', { text: '' }, ctx, {}, db)
    const history = await mealsBetween('2026-10-01', TODAY, db)
    expect(history.map((m) => `${m.date} ${m.text}`)).toEqual(['2026-10-06 Khichdi', '2026-10-05 Dal'])
  })
})
