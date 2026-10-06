import type { AppDb } from '../../data/db'
import { EXERCISE_LIBRARY } from '../../data/seed/exercises'
import type { DateStr } from '../../data/types'

/**
 * What the 6 October 2026 build (commit 02634a2) did every time it started: seedIfEmpty,
 * seedGymAndFoodIfEmpty and applyPendingSetup, reproduced here step for step with the date passed
 * in instead of read from the clock.
 *
 * Test-only. It exists so the cutover can be rehearsed against a device that had already run
 * that build. Do not tidy it: its value is that it does exactly what that build did, including
 * the parts that were mistakes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

const SUPPLEMENT_SEED: [string, string, string, number | null, string, number | null, number | null][] = [
  ['Creatine', '5 g', 'daily', null, 'anytime', null, 10],
  ['Whey protein', '1 scoop', 'daily', null, 'postworkout', null, 10],
  ['Multivitamin', '1 tablet', 'daily', null, 'morning', null, null],
  ['Fish oil', '2 capsules', 'daily', null, 'morning', null, null],
  ['Yakult', '1 bottle', 'daily', null, 'anytime', null, null],
  ['Vitamin D', '60,000 IU', 'weekly', 0, 'morning', null, null],
]

const SHAPE_BY_NAME: Record<string, Row> = {
  'meditation (isha kriya)': { category: 'mind', group: '' },
  'read / learn / writing': { category: 'mind', group: '' },
  'useful / educational video': { category: 'mind', group: '' },
  skincare: { category: 'body', group: 'Face care', rename: 'Daily moisturiser' },
  'hair care': { category: 'body', group: 'Hair care', rename: 'Hair oiling', schedule: 'times_per_week', times_per_week: 2 },
  'soaked nuts / dry fruits': { category: 'body', group: 'Food' },
  '2.5–3 l water': { category: 'body', group: 'Food' },
  'no alcohol': { category: 'body', group: 'Avoid' },
  'no fast food': { category: 'body', group: 'Avoid' },
  ns: { category: 'body', group: 'Avoid' },
  nf: { category: 'body', group: 'Avoid' },
  'brush with right hand': { category: 'body', group: '' },
  'wake up at 4:00 am': { category: 'body', group: 'Sleep' },
  'sleep before 10:00 pm': { category: 'body', group: 'Sleep' },
  'gym / training': { category: 'exercise', group: '' },
  '10 push-ups': { category: 'exercise', group: 'Daily 10s' },
  '10 crunches': { category: 'exercise', group: 'Daily 10s' },
  '10 pull-ups': { category: 'exercise', group: 'Daily 10s' },
  '15 min walk / jog': { category: 'exercise', group: 'Cardio' },
}

const HABITS_TO_ADD: Row[] = [
  { name: 'Hanuman Chalisa', short_name: 'Hanuman Chalisa', polarity: 'do', category: 'mind', group: '' },
  { name: 'Shiv Tandav Strotam', short_name: 'Shiv Tandav', polarity: 'do', category: 'mind', group: '' },
  { name: 'Breakfast', short_name: 'Breakfast', polarity: 'do', category: 'body', group: 'Food' },
  { name: 'Lunch', short_name: 'Lunch', polarity: 'do', category: 'body', group: 'Food' },
  { name: 'Dinner', short_name: 'Dinner', polarity: 'do', category: 'body', group: 'Food' },
]

const HABITS_TO_RETIRE = ['water + chia seeds']

const SUPPLEMENTS_TO_ADD: Row[] = [
  { name: 'Fish oil', category: 'body', dose_text: '2 capsules', schedule: 'daily', weekly_day: null, time_hint: 'morning', servings_left: null, low_stock_at: null },
  { name: 'Yakult', category: 'body', dose_text: '1 bottle', schedule: 'daily', weekly_day: null, time_hint: 'anytime', servings_left: null, low_stock_at: null },
  { name: 'Chia seeds', category: 'body', dose_text: '1 tbsp', schedule: 'daily', weekly_day: null, time_hint: 'morning', servings_left: null, low_stock_at: null },
]

const ROUTINE_SEED: { name: string; weekdays: number[]; exercises: string[] }[] = [
  { name: 'Legs + Shoulders', weekdays: [6], exercises: ['Back Squat', 'Leg Press', 'Romanian Deadlift', 'Seated Leg Curl', 'Standing Calf Raise', 'Overhead Press', 'Dumbbell Lateral Raise'] },
  { name: 'Cardio', weekdays: [0, 2, 4], exercises: ['Treadmill / Run'] },
  { name: 'Chest + Triceps', weekdays: [1], exercises: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Pec Deck', 'Triceps Rope Pushdown', 'Overhead Cable Extension'] },
  { name: 'Back + Biceps', weekdays: [3], exercises: ['Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Barbell Curl', 'Hammer Curl'] },
  { name: 'Shoulders + Arms + Core', weekdays: [5], exercises: ['Machine Shoulder Press', 'Dumbbell Lateral Raise', 'Hammer Curl', 'Triceps Rope Pushdown', 'Hip Abduction Machine', 'Cable Crunch', 'Plank', 'Treadmill / Run'] },
]

async function seedGymAndFoodIfEmpty(db: AppDb, today: DateStr): Promise<void> {
  const exercises = db.table('exercises')
  if (!(await exercises.count())) {
    await exercises.bulkAdd(
      EXERCISE_LIBRARY.map(([name, primary_muscle, equipment, kind, increment_kg, bar_weight_kg, rest_seconds], i) => ({
        name, primary_muscle, equipment, kind, increment_kg, bar_weight_kg,
        rest_seconds: rest_seconds || null, is_builtin: true, retired_on: null, sort_order: i, notes: '',
      })),
    )
  }
  const supplements = db.table('supplements')
  if (await supplements.count()) return
  await supplements.bulkAdd(
    SUPPLEMENT_SEED.map(([name, dose_text, schedule, weekly_day, time_hint, servings_left, low_stock_at], i) => ({
      name, dose_text, schedule, weekly_day, time_hint, servings_left, low_stock_at,
      created_on: today, retired_on: null, sort_order: i,
    })),
  )
  const habits = db.table('habits')
  const superseded = (await habits.toArray()).find((h: Row) => h.short_name === 'Creatine' && !h.retired_on)
  if (superseded?.id) await habits.update(superseded.id, { retired_on: today })
}

async function applyPendingSetup(db: AppDb, today: DateStr): Promise<void> {
  const habits = db.table('habits')
  const all: Row[] = await habits.toArray()

  for (const habit of all) {
    const shape = SHAPE_BY_NAME[habit.name.toLowerCase()]
    if (!shape || !habit.id) continue
    const patch: Row = {}
    if (habit.category !== shape.category) patch.category = shape.category
    if ((habit.group ?? '') !== shape.group) patch.group = shape.group
    const schedule = shape.schedule ?? 'daily'
    if ((habit.schedule ?? 'daily') !== schedule) patch.schedule = schedule
    if (shape.times_per_week && habit.times_per_week !== shape.times_per_week) patch.times_per_week = shape.times_per_week
    if (shape.rename && habit.name !== shape.rename) {
      patch.name = shape.rename
      patch.short_name = shape.rename
    }
    if (Object.keys(patch).length) await habits.update(habit.id, patch)
  }

  for (const habit of all) {
    if (!habit.id || habit.category) continue
    if (SHAPE_BY_NAME[habit.name.toLowerCase()]) continue
    await habits.update(habit.id, { category: 'body', group: '' })
  }

  for (const name of HABITS_TO_RETIRE) {
    const match = all.find((h) => h.name.toLowerCase() === name && !h.retired_on)
    if (match?.id) await habits.update(match.id, { retired_on: today })
  }

  let sortOrder = all.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1
  for (const wanted of HABITS_TO_ADD) {
    const existing = all.find((h) => h.name.toLowerCase() === wanted.name.toLowerCase())
    if (existing?.id) {
      const patch: Row = { category: wanted.category, group: wanted.group }
      if (existing.retired_on) patch.retired_on = null
      await habits.update(existing.id, patch)
      continue
    }
    await habits.add({
      name: wanted.name, short_name: wanted.short_name, polarity: wanted.polarity,
      created_on: today, retired_on: null, sort_order: sortOrder++,
      category: wanted.category, group: wanted.group, schedule: 'daily',
    })
  }

  const supplements = db.table('supplements')
  const allSupplements: Row[] = await supplements.toArray()
  const byName = new Map(allSupplements.map((s) => [s.name.toLowerCase(), s]))
  const vitaminD = byName.get('vitamin d')
  if (vitaminD?.id && (vitaminD.schedule !== 'weekly' || vitaminD.weekly_day !== 0)) {
    await supplements.update(vitaminD.id, { schedule: 'weekly', weekly_day: 0 })
  }
  for (const supplement of allSupplements) {
    if (!supplement.id || supplement.category) continue
    await supplements.update(supplement.id, { category: supplement.name.toLowerCase() === 'creatine' ? 'exercise' : 'body' })
  }
  let supplementOrder = allSupplements.reduce((max, s) => Math.max(max, s.sort_order), -1) + 1
  for (const supplement of SUPPLEMENTS_TO_ADD) {
    if (byName.has(supplement.name.toLowerCase())) continue
    await supplements.add({ ...supplement, created_on: today, retired_on: null, sort_order: supplementOrder++ })
  }

  const routines = db.table('routines')
  const existingRoutines: Row[] = await routines.toArray()
  const taken = new Set(existingRoutines.map((r) => r.name.toLowerCase()))
  const library: Row[] = await db.table('exercises').toArray()
  const idByName = new Map(library.map((e) => [e.name.toLowerCase(), e.id]))
  let routineOrder = existingRoutines.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1
  for (const routine of ROUTINE_SEED) {
    if (taken.has(routine.name.toLowerCase())) continue
    const routineId = await routines.add({
      name: routine.name, day_hint: routine.weekdays.length ? routine.weekdays[0] + 1 : null,
      weekdays: routine.weekdays, sort_order: routineOrder++, retired_on: null,
    })
    let position = 0
    for (const exerciseName of routine.exercises) {
      const exerciseId = idByName.get(exerciseName.toLowerCase())
      if (!exerciseId) continue
      await db.table('routine_items').add({
        routine_id: routineId, exercise_id: exerciseId, position: position++,
        target_sets: 3, target_reps_low: null, target_reps_high: null, note: '',
      })
    }
  }
}

/** One start of the 6 October build on `today`. Safe to call repeatedly, as that build was. */
export async function legacyBoot(db: AppDb, today: DateStr): Promise<void> {
  await seedGymAndFoodIfEmpty(db, today)
  await applyPendingSetup(db, today)
}
