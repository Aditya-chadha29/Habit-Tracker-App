import { db } from './db'
import { todayLocalStr } from './dates'
import type { Habit, HabitCategory, Polarity, Supplement } from './types'

/**
 * Corrections to the seeded data, applied to installs that were already seeded.
 *
 * Seeds only fire into an empty table, so a phone that has been running for weeks would never see
 * a change to the starter lists. Every step here checks the data itself rather than a "has run"
 * flag, which makes running it on every start harmless: nothing is added twice, and anything the
 * user has since renamed, edited or retired is left alone.
 */

type HabitShape = {
  category: HabitCategory
  group: string
  schedule?: Habit['schedule']
  weekdays?: number[]
  times_per_week?: number
  /** Rename an existing habit to the name the user actually uses for it. */
  rename?: string
}

/** Where each existing habit belongs, keyed by its lowercased current name. */
const SHAPE_BY_NAME: Record<string, HabitShape> = {
  'meditation (isha kriya)': { category: 'mind', group: '' },
  'read / learn / writing': { category: 'mind', group: '' },
  'useful / educational video': { category: 'mind', group: '' },

  skincare: { category: 'body', group: 'Face care', rename: 'Daily moisturiser' },
  // Twice a week, so it carries a weekly target instead of being missable every day.
  'hair care': {
    category: 'body',
    group: 'Hair care',
    rename: 'Hair oiling',
    schedule: 'times_per_week',
    times_per_week: 2,
  },
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

/** Habits that should exist. A retired one of the same name is restored rather than duplicated. */
const HABITS_TO_ADD: (HabitShape & { name: string; short_name: string; polarity: Polarity })[] = [
  { name: 'Hanuman Chalisa', short_name: 'Hanuman Chalisa', polarity: 'do', category: 'mind', group: '' },
  { name: 'Shiv Tandav Strotam', short_name: 'Shiv Tandav', polarity: 'do', category: 'mind', group: '' },
  { name: 'Breakfast', short_name: 'Breakfast', polarity: 'do', category: 'body', group: 'Food' },
  { name: 'Lunch', short_name: 'Lunch', polarity: 'do', category: 'body', group: 'Food' },
  { name: 'Dinner', short_name: 'Dinner', polarity: 'do', category: 'body', group: 'Food' },
]

/** Habits replaced by something else, retired rather than deleted so their history survives. */
const HABITS_TO_RETIRE = ['water + chia seeds']

type NewSupplement = Omit<Supplement, 'id' | 'created_on' | 'retired_on' | 'sort_order'>

const SUPPLEMENTS_TO_ADD: NewSupplement[] = [
  {
    name: 'Fish oil',
    category: 'body',
    dose_text: '2 capsules',
    schedule: 'daily',
    weekly_day: null,
    time_hint: 'morning',
    servings_left: null,
    low_stock_at: null,
  },
  {
    name: 'Yakult',
    category: 'body',
    dose_text: '1 bottle',
    schedule: 'daily',
    weekly_day: null,
    time_hint: 'anytime',
    servings_left: null,
    low_stock_at: null,
  },
  {
    name: 'Chia seeds',
    category: 'body',
    dose_text: '1 tbsp',
    schedule: 'daily',
    weekly_day: null,
    time_hint: 'morning',
    servings_left: null,
    low_stock_at: null,
  },
]

/** The week's training. 0 = Monday … 6 = Sunday. Exercises are matched by name in the library. */
const ROUTINE_SEED: { name: string; weekdays: number[]; exercises: string[] }[] = [
  {
    name: 'Legs + Shoulders',
    weekdays: [6],
    exercises: [
      'Back Squat',
      'Leg Press',
      'Romanian Deadlift',
      'Seated Leg Curl',
      'Standing Calf Raise',
      'Overhead Press',
      'Dumbbell Lateral Raise',
    ],
  },
  { name: 'Cardio', weekdays: [0, 2, 4], exercises: ['Treadmill / Run'] },
  {
    name: 'Chest + Triceps',
    weekdays: [1],
    exercises: [
      'Barbell Bench Press',
      'Incline Dumbbell Press',
      'Pec Deck',
      'Triceps Rope Pushdown',
      'Overhead Cable Extension',
    ],
  },
  {
    name: 'Back + Biceps',
    weekdays: [3],
    exercises: [
      'Lat Pulldown',
      'Barbell Row',
      'Seated Cable Row',
      'Barbell Curl',
      'Hammer Curl',
    ],
  },
  {
    name: 'Shoulders + Arms + Core',
    weekdays: [5],
    exercises: [
      'Machine Shoulder Press',
      'Dumbbell Lateral Raise',
      'Hammer Curl',
      'Triceps Rope Pushdown',
      'Hip Abduction Machine',
      'Cable Crunch',
      'Plank',
      'Treadmill / Run',
    ],
  },
]

export async function applyPendingSetup(): Promise<void> {
  const today = todayLocalStr()

  await db.transaction('rw', db.habits, async () => {
    const all = await db.habits.toArray()

    // Give every habit a category and schedule, and rename the two whose names no longer match
    // what they are. Only fields that are actually missing or wrong are written.
    for (const habit of all) {
      const shape = SHAPE_BY_NAME[habit.name.toLowerCase()]
      if (!shape || !habit.id) continue
      const patch: Partial<Habit> = {}
      if (habit.category !== shape.category) patch.category = shape.category
      if ((habit.group ?? '') !== shape.group) patch.group = shape.group
      const schedule = shape.schedule ?? 'daily'
      if ((habit.schedule ?? 'daily') !== schedule) patch.schedule = schedule
      if (shape.times_per_week && habit.times_per_week !== shape.times_per_week) {
        patch.times_per_week = shape.times_per_week
      }
      if (shape.weekdays && habit.weekdays?.join() !== shape.weekdays.join()) {
        patch.weekdays = shape.weekdays
      }
      if (shape.rename && habit.name !== shape.rename) {
        patch.name = shape.rename
        patch.short_name = shape.rename
      }
      if (Object.keys(patch).length) await db.habits.update(habit.id, patch)
    }

    // Anything with no mapping still needs defaults, or it would vanish from every category screen.
    for (const habit of all) {
      if (!habit.id || habit.category) continue
      if (SHAPE_BY_NAME[habit.name.toLowerCase()]) continue
      await db.habits.update(habit.id, { category: 'body', group: '' })
    }

    for (const name of HABITS_TO_RETIRE) {
      const match = all.find((h) => h.name.toLowerCase() === name && !h.retired_on)
      if (match?.id) await db.habits.update(match.id, { retired_on: today })
    }

    let sortOrder = all.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1
    for (const wanted of HABITS_TO_ADD) {
      const existing = all.find((h) => h.name.toLowerCase() === wanted.name.toLowerCase())
      if (existing?.id) {
        // An old habit of the same name (Breakfast was retired in August) comes back rather than
        // being duplicated, so its history stays attached.
        const patch: Partial<Habit> = { category: wanted.category, group: wanted.group }
        if (existing.retired_on) patch.retired_on = null
        await db.habits.update(existing.id, patch)
        continue
      }
      // created_on is today, so no past day's score changes.
      await db.habits.add({
        name: wanted.name,
        short_name: wanted.short_name,
        polarity: wanted.polarity,
        created_on: today,
        retired_on: null,
        sort_order: sortOrder++,
        category: wanted.category,
        group: wanted.group,
        schedule: wanted.schedule ?? 'daily',
      })
    }
  })

  await db.transaction('rw', db.supplements, async () => {
    const all = await db.supplements.toArray()
    const byName = new Map(all.map((s) => [s.name.toLowerCase(), s]))

    // Vitamin D is one dose a week, taken on Mondays (0 = Monday).
    const vitaminD = byName.get('vitamin d')
    if (vitaminD?.id && (vitaminD.schedule !== 'weekly' || vitaminD.weekly_day !== 0)) {
      await db.supplements.update(vitaminD.id, { schedule: 'weekly', weekly_day: 0 })
    }

    // Fish oil and omega-3 are the same capsule, so rename rather than add a second row to tick.
    const omega = byName.get('omega-3')
    if (omega?.id && !byName.has('fish oil')) {
      await db.supplements.update(omega.id, { name: 'Fish oil' })
      byName.set('fish oil', { ...omega, name: 'Fish oil' })
    }

    // Creatine belongs to training; everything else sits with food.
    for (const supplement of all) {
      if (!supplement.id || supplement.category) continue
      const category = supplement.name.toLowerCase() === 'creatine' ? 'exercise' : 'body'
      await db.supplements.update(supplement.id, { category })
    }

    let sortOrder = all.reduce((max, s) => Math.max(max, s.sort_order), -1) + 1
    for (const supplement of SUPPLEMENTS_TO_ADD) {
      if (byName.has(supplement.name.toLowerCase())) continue
      await db.supplements.add({
        ...supplement,
        created_on: today,
        retired_on: null,
        sort_order: sortOrder++,
      })
    }
  })

  // The training week. Seeded only when a routine of that name doesn't already exist, and never
  // edited afterwards — the routine list is the user's to change.
  await db.transaction('rw', db.routines, db.routine_items, db.exercises, async () => {
    const existing = await db.routines.toArray()
    const taken = new Set(existing.map((r) => r.name.toLowerCase()))
    const library = await db.exercises.toArray()
    const idByName = new Map(library.map((e) => [e.name.toLowerCase(), e.id!]))
    let sortOrder = existing.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1

    for (const routine of ROUTINE_SEED) {
      if (taken.has(routine.name.toLowerCase())) continue
      const routineId = (await db.routines.add({
        name: routine.name,
        day_hint: routine.weekdays.length ? routine.weekdays[0] + 1 : null,
        weekdays: routine.weekdays,
        sort_order: sortOrder++,
        retired_on: null,
      })) as number

      let position = 0
      for (const exerciseName of routine.exercises) {
        const exerciseId = idByName.get(exerciseName.toLowerCase())
        if (!exerciseId) continue
        await db.routine_items.add({
          routine_id: routineId,
          exercise_id: exerciseId,
          position: position++,
          target_sets: 3,
          target_reps_low: null,
          target_reps_high: null,
          note: '',
        })
      }
    }
  })
}
