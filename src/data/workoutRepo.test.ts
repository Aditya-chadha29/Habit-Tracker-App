import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { createHabit } from './habitRepo'
import { MIGRATIONS, runMigrations } from './migrations'
import {
  addExercise, addExerciseToSession, addSetRow, completeSet, deleteSession, finishSession, lastPerformedSets,
  openSession, quickLogSession, removeSetRow, setProgrammeDay, setRoutineItems, startSession, uncompleteSet,
} from './workoutRepo'
import { buildCompletionIndex } from '../engine/completion'
import { LockedError } from '../engine/lock'
import { periodOf } from '../engine/periods'
import { dayScore } from '../engine/score'
import { targetProgress } from '../engine/targets'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

// Tuesday 6 October 2026: the programme's Chest + Triceps day.
const TODAY = '2026-10-06'
const ctx = { today: TODAY, windowDays: 7 }

async function setup() {
  const db = createDb(`workout-repo-test-${++counter}`)
  open.push(db)
  // A fresh install: the seeded habits, exercise library and five-routine programme.
  // Cardio was still a habit of its own when these rules were written; they are tested as such.
  await runMigrations({ db, today: '2026-09-01', now: 1, theme: 'system' }, { backupName: `workout-backups-${counter}`, migrations: MIGRATIONS.filter((step) => step.id < '012') })
  const gym = (await db.habits.toArray()).find((habit) => habit.name === 'Gym')!
  const cardio = (await db.habits.toArray()).find((habit) => habit.name === 'Cardio')!
  const routine = (await db.routines.toArray()).find((r) => r.name === 'Chest + Triceps')!
  const bench = (await db.exercises.toArray()).find((e) => e.name === 'Barbell Bench Press')!
  return { db, gym, cardio, routine, bench }
}

async function indexOf(db: AppDb) {
  return buildCompletionIndex({
    entries: await db.entries.toArray(),
    sessions: await db.sessions.toArray(),
    learningSessions: [],
    journalDates: [],
  })
}

async function logSets(db: AppDb, sessionId: number, exerciseId: number, sets: [number, number][], at = 1000) {
  const rows = (await db.set_logs.where('session_id').equals(sessionId).toArray())
    .filter((row) => row.exercise_id === exerciseId)
    .sort((a, b) => a.set_index - b.set_index)
  for (const [i, [weight_kg, reps]] of sets.entries()) {
    await completeSet(rows[i].id!, { weight_kg, reps }, 120, ctx, at + i, db)
  }
}

describe('the gym acceptance scenario', () => {
  it('finishing a workout completes Gym and adds to the week, with no tick written', async () => {
    const { db, gym, routine, bench } = await setup()
    // One session earlier this week and two at the end of last week.
    await quickLogSession({ date: '2026-10-05', kind: 'cardio', minutes: 30 }, ctx, 10, db)
    await quickLogSession({ date: '2026-10-04', kind: 'strength', minutes: 50 }, ctx, 11, db)
    await quickLogSession({ date: '2026-10-03', kind: 'strength', minutes: 45 }, ctx, 12, db)
    const lastWeek = periodOf('week', '2026-10-04')
    const thisWeek = periodOf('week', TODAY)
    expect(targetProgress(gym, thisWeek, TODAY, await indexOf(db))!.done).toBe(1)
    expect(targetProgress(gym, lastWeek, TODAY, await indexOf(db))!.done).toBe(2)

    const sessionId = await startSession(routine.id!, TODAY, ctx, 5_000, db)
    const planned = await db.set_logs.where('session_id').equals(sessionId).toArray()
    expect(planned.length).toBeGreaterThan(10) // five exercises, three sets each
    expect(planned.every((row) => !row.done)).toBe(true)

    // While the workout is open, Gym is not done yet.
    expect(dayScore([gym], TODAY, await indexOf(db))).toMatchObject({ done: 0, due: 1 })

    await logSets(db, sessionId, bench.id!, [[60, 10], [60, 9], [57.5, 10]], 6_000)
    await finishSession(sessionId, 'Felt strong', ctx, 3_600_000, db)

    const session = (await db.sessions.get(sessionId))!
    expect(session).toMatchObject({ title: 'Chest + Triceps', ended_at: 3_600_000, notes: 'Felt strong', kinds: ['strength'] })
    const saved = (await db.set_logs.where('session_id').equals(sessionId).toArray()).sort((a, b) => a.set_index - b.set_index)
    expect(saved.map((row) => [row.weight_kg, row.reps, row.done])).toEqual([[60, 10, true], [60, 9, true], [57.5, 10, true]])

    const index = await indexOf(db)
    expect(targetProgress(gym, thisWeek, TODAY, index)!.done).toBe(2)
    expect(dayScore([gym], TODAY, index)).toMatchObject({ done: 1, due: 1 })
    // The habit was never ticked: there is no entry row for it at all.
    expect(await db.entries.where('habit_id').equals(gym.id!).count()).toBe(0)
  })

  it('counts 3 then 4 across a week with three earlier sessions', async () => {
    const { db, gym, routine, bench } = await setup()
    const sunday = '2026-10-11'
    const late = { today: sunday, windowDays: 7 }
    for (const [i, date] of ['2026-10-05', '2026-10-07', '2026-10-09'].entries()) {
      await quickLogSession({ date, kind: 'strength', minutes: 40 }, late, 100 + i, db)
    }
    const week = periodOf('week', sunday)
    expect(targetProgress(gym, week, sunday, await indexOf(db))!.done).toBe(3)
    const sessionId = await startSession(routine.id!, sunday, late, 5_000, db)
    const rows = (await db.set_logs.where('session_id').equals(sessionId).toArray()).filter((row) => row.exercise_id === bench.id)
    await completeSet(rows[0].id!, { weight_kg: 60, reps: 10 }, 120, late, 6_000, db)
    await finishSession(sessionId, '', late, 9_000, db)
    expect(targetProgress(gym, week, sunday, await indexOf(db))!.done).toBe(4)
  })
})

describe('sessions', () => {
  it('prefills a new session from the last time each exercise was performed', async () => {
    const { db, routine, bench } = await setup()
    const first = await startSession(routine.id!, '2026-10-01', ctx, 1, db)
    await logSets(db, first, bench.id!, [[60, 10], [60, 9]])
    await finishSession(first, '', ctx, 2, db)
    expect((await lastPerformedSets(bench.id!, TODAY, db)).map((row) => [row.weight_kg, row.reps])).toEqual([[60, 10], [60, 9]])

    const second = await startSession(routine.id!, TODAY, ctx, 3, db)
    const rows = (await db.set_logs.where('session_id').equals(second).toArray())
      .filter((row) => row.exercise_id === bench.id)
      .sort((a, b) => a.set_index - b.set_index)
    // Three planned; the third repeats the last set actually done.
    expect(rows.map((row) => [row.weight_kg, row.reps])).toEqual([[60, 10], [60, 9], [60, 9]])
  })

  it('never has two workouts in progress', async () => {
    const { db, routine } = await setup()
    const a = await startSession(routine.id!, TODAY, ctx, 1, db)
    const b = await startSession(null, TODAY, ctx, 2, db)
    expect(b).toBe(a)
    expect(await db.sessions.count()).toBe(1)
    expect((await openSession(db))!.id).toBe(a)
  })

  it('a quick cardio log completes both Gym and Cardio', async () => {
    const { db, gym, cardio } = await setup()
    await quickLogSession({ date: TODAY, kind: 'cardio', minutes: 30 }, ctx, 1, db)
    expect(dayScore([gym, cardio], TODAY, await indexOf(db))).toMatchObject({ done: 2, due: 2 })
  })

  it('a lifting session with a cardio finisher counts as both kinds', async () => {
    const { db, cardio, routine } = await setup()
    const run = (await db.exercises.toArray()).find((e) => e.name === 'Treadmill / Run')!
    const sessionId = await startSession(routine.id!, TODAY, ctx, 1, db)
    await addExerciseToSession(sessionId, run.id!, ctx, 1, db)
    const rows = await db.set_logs.where('session_id').equals(sessionId).toArray()
    await completeSet(rows.find((row) => row.exercise_id === run.id)!.id!, { seconds: 900 }, null, ctx, 2, db)
    await completeSet(rows[0].id!, { weight_kg: 60, reps: 8 }, 120, ctx, 3, db)
    await finishSession(sessionId, '', ctx, 4, db)
    expect((await db.sessions.get(sessionId))!.kinds!.sort()).toEqual(['cardio', 'strength'])
    expect(dayScore([cardio], TODAY, await indexOf(db)).done).toBe(1)
  })

  it('adds a set by copying the last one, and removes one', async () => {
    const { db, bench } = await setup()
    const sessionId = await startSession(null, TODAY, ctx, 1, db)
    await addExerciseToSession(sessionId, bench.id!, ctx, 2, db)
    const [first] = await db.set_logs.where('session_id').equals(sessionId).sortBy('set_index')
    await completeSet(first.id!, { weight_kg: 62.5, reps: 8 }, 120, ctx, 2, db)
    await addSetRow(sessionId, first.position, ctx, db)
    let rows = await db.set_logs.where('session_id').equals(sessionId).sortBy('set_index')
    expect(rows.map((row) => row.set_index)).toEqual([1, 2, 3])
    expect(rows[2].done).toBe(false)
    await removeSetRow(rows[2].id!, ctx, db)
    rows = await db.set_logs.where('session_id').equals(sessionId).sortBy('set_index')
    expect(rows).toHaveLength(2)
  })

  it('correcting a finished session keeps what it contained up to date', async () => {
    const { db, gym, bench } = await setup()
    const sessionId = await startSession(null, TODAY, ctx, 1, db)
    await addExerciseToSession(sessionId, bench.id!, ctx, 1, db)
    const [row] = await db.set_logs.where('session_id').equals(sessionId).toArray()
    await completeSet(row.id!, { weight_kg: 60, reps: 10 }, 120, ctx, 2, db)
    await finishSession(sessionId, '', ctx, 3, db)
    expect((await db.sessions.get(sessionId))!.kinds).toEqual(['strength'])
    await uncompleteSet(row.id!, ctx, db)
    expect((await db.sessions.get(sessionId))!.kinds).toEqual([])
    // An empty finished session is still a logged workout: the day still counts.
    expect(dayScore([gym], TODAY, await indexOf(db)).done).toBe(1)
  })

  it('deleting a session inside the window un-completes Gym for that day', async () => {
    const { db, gym } = await setup()
    const id = await quickLogSession({ date: TODAY, kind: 'strength', minutes: 40 }, ctx, 1, db)
    expect(dayScore([gym], TODAY, await indexOf(db)).done).toBe(1)
    await deleteSession(id, ctx, db)
    expect(dayScore([gym], TODAY, await indexOf(db)).done).toBe(0)
  })

  it('refuses to write to a locked day', async () => {
    const { db, routine } = await setup()
    await expect(quickLogSession({ date: '2026-09-20', kind: 'strength', minutes: 30 }, ctx, 1, db)).rejects.toBeInstanceOf(LockedError)
    await expect(startSession(routine.id!, '2026-09-20', ctx, 1, db)).rejects.toBeInstanceOf(LockedError)
    const old = await quickLogSession({ date: '2026-09-30', kind: 'strength', minutes: 30 }, ctx, 1, db)
    const later = { today: '2026-10-20', windowDays: 7 }
    await expect(deleteSession(old, later, db)).rejects.toBeInstanceOf(LockedError)
    expect(await db.sessions.count()).toBe(1)
  })

  it('closes a session forgotten from an earlier day at the time of its last set', async () => {
    const { db, bench } = await setup()
    const sessionId = await startSession(null, '2026-10-05', ctx, 1_000, db)
    await addExerciseToSession(sessionId, bench.id!, ctx, 1, db)
    const [row] = await db.set_logs.where('session_id').equals(sessionId).toArray()
    await completeSet(row.id!, { weight_kg: 60, reps: 10 }, 120, ctx, 2_000, db)
    await finishSession(sessionId, '', ctx, 99_999_999, db)
    expect((await db.sessions.get(sessionId))!.ended_at).toBe(2_000)
  })
})

describe('routines, programme and exercises', () => {
  it('replaces a routine’s exercises and keeps old sessions as they were', async () => {
    const { db, routine, bench } = await setup()
    const sessionId = await startSession(routine.id!, TODAY, ctx, 1, db)
    const before = await db.set_logs.where('session_id').equals(sessionId).count()
    await setRoutineItems(routine.id!, [{ exercise_id: bench.id!, target_sets: 5, target_reps_low: 5, target_reps_high: 5 }], db)
    expect(await db.routine_items.where('routine_id').equals(routine.id!).count()).toBe(1)
    expect(await db.set_logs.where('session_id').equals(sessionId).count()).toBe(before)
  })

  it('sets which routines a weekday suggests', async () => {
    const { db, routine } = await setup()
    const cardio = (await db.routines.toArray()).find((r) => r.name === 'Cardio')!
    await setProgrammeDay(1, [cardio.id!], db) // Tuesday becomes a cardio day
    expect((await db.routines.get(routine.id!))!.weekdays).toEqual([])
    expect((await db.routines.get(cardio.id!))!.weekdays).toEqual([0, 1, 2, 4])
  })

  it('adds a custom exercise once', async () => {
    const { db } = await setup()
    const input = { name: ' Landmine Press ', primary_muscle: 'shoulders' as const, equipment: 'barbell' as const, kind: 'weight_reps' as const, increment_kg: 2.5, rest_seconds: 120 }
    const id = await addExercise(input, db)
    expect(await db.exercises.get(id)).toMatchObject({ name: 'Landmine Press', is_builtin: false, bar_weight_kg: 20 })
    await expect(addExercise(input, db)).rejects.toThrow('already')
    await expect(addExercise({ ...input, name: ' ' }, db)).rejects.toThrow()
  })

  it('needs the gym habit from the seed to exist for these tests to mean anything', async () => {
    const { db, gym } = await setup()
    expect(gym.versions[0].sources).toEqual(['workout'])
    // A habit with no link to training is unaffected by sessions.
    const other = await createHabit({ name: 'Stretch', area: 'body' }, '2026-09-01', db)
    await quickLogSession({ date: TODAY, kind: 'strength', minutes: 30 }, ctx, 1, db)
    const habit = (await db.habits.get(other))!
    expect(dayScore([habit], TODAY, await indexOf(db)).done).toBe(0)
  })
})
