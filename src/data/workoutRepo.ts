import { db, type AppDb } from './db'
import type { WriteContext } from './habitRepo'
import type {
  DateStr, Equipment, Exercise, ExerciseKind, MuscleGroup, Session, SessionKind, SetLog, WorkoutRoutine,
} from './types'
import { assertEditable } from '../engine/lock'
import { sessionKindsFrom } from '../engine/training'

/**
 * Everything that writes a workout.
 *
 * A session is a record of what was done. Finishing one writes no tick anywhere: the Gym habit
 * is complete on a day because a finished session exists on it, and that is read, never stored.
 * Routines are templates — starting one COPIES its rows into the session, so editing a routine
 * later can never rewrite a workout that already happened.
 *
 * `now` (epoch ms) is passed in rather than read here, which keeps every function testable and
 * keeps all clock-reading in the screens.
 */

async function loadExercises(database: AppDb): Promise<Map<number, Exercise>> {
  return new Map((await database.exercises.toArray()).map((exercise) => [exercise.id!, exercise]))
}

/** Rewrites what a finished session contained from the sets that were actually performed. */
async function refreshKinds(sessionId: number, database: AppDb): Promise<void> {
  const session = await database.sessions.get(sessionId)
  if (!session || session.ended_at === null || session.quick) return
  const sets = await database.set_logs.where('session_id').equals(sessionId).toArray()
  await database.sessions.update(sessionId, { kinds: sessionKindsFrom(sets, await loadExercises(database)) })
}

/**
 * The sets from the most recent EARLIER day this exercise was actually performed — the prefill
 * for a new session. The plan comes from the routine; the numbers come from here, because what
 * was lifted last time is a fact and what the routine says is only an intention.
 */
export async function lastPerformedSets(exerciseId: number, beforeDate: DateStr, database: AppDb = db): Promise<SetLog[]> {
  const rows = await database.set_logs.where('exercise_id').equals(exerciseId).toArray()
  const done = rows.filter((row) => row.done && row.date < beforeDate)
  if (!done.length) return []
  const latest = done.reduce((max, row) => (row.date > max ? row.date : max), done[0].date)
  return done.filter((row) => row.date === latest).sort((a, b) => a.set_index - b.set_index)
}

/** The session that has been started and not finished, if there is one. */
export async function openSession(database: AppDb = db): Promise<Session | undefined> {
  const sessions = (await database.sessions.orderBy('date').toArray()).reverse().slice(0, 30)
  return sessions.find((session) => session.ended_at === null)
}

function plannedSet(sessionId: number, exerciseId: number, date: DateStr, position: number, setIndex: number, prior: SetLog | undefined, reps: number | null): Omit<SetLog, 'id'> {
  return {
    session_id: sessionId,
    exercise_id: exerciseId,
    date,
    position,
    set_index: setIndex,
    weight_kg: prior?.weight_kg ?? null,
    reps: prior?.reps ?? reps,
    seconds: prior?.seconds ?? null,
    distance_m: prior?.distance_m ?? null,
    rir: null,
    kind: 'work',
    done: false,
    done_at: null,
    note: '',
  }
}

/**
 * Starts a session and lays out its planned sets from the routine, in one transaction. If a
 * session is already open it is returned instead — there is only ever one workout in progress.
 */
export async function startSession(
  routineId: number | null,
  date: DateStr,
  ctx: WriteContext,
  now: number,
  database: AppDb = db,
): Promise<number> {
  assertEditable(date, ctx.today, ctx.windowDays)
  return database.transaction('rw', database.sessions, database.routines, database.routine_items, database.set_logs, async () => {
    const already = await openSession(database)
    if (already?.id !== undefined) return already.id

    const routine = routineId ? await database.routines.get(routineId) : undefined
    const sessionId = (await database.sessions.add({
      date,
      routine_id: routine?.id ?? null,
      // Snapshotted: renaming the routine later must not rewrite what this session was called.
      title: routine?.name ?? 'Free session',
      started_at: now,
      ended_at: null,
      notes: '',
      rest_started_at: null,
      rest_seconds: null,
    })) as number
    if (!routine?.id) return sessionId

    const items = await database.routine_items.where('routine_id').equals(routine.id).sortBy('position')
    for (const item of items) {
      const previous = await lastPerformedSets(item.exercise_id, date, database)
      const count = Math.max(1, item.target_sets)
      for (let i = 0; i < count; i++) {
        // Fewer sets last time than planned: repeat its final set rather than leaving blanks.
        const prior = previous.length ? previous[Math.min(i, previous.length - 1)] : undefined
        await database.set_logs.add(plannedSet(sessionId, item.exercise_id, date, item.position, i + 1, prior, item.target_reps_low))
      }
    }
    return sessionId
  })
}

export interface QuickLog {
  date: DateStr
  kind: SessionKind
  minutes: number | null
  /** Kilometres, for cardio. */
  distance_km?: number | null
  title?: string
  notes?: string
}

/**
 * Records that a workout happened without logging its sets: a cardio day, or a session done
 * away from the phone. It is a real session row, so the day's training counts like any other.
 */
export async function quickLogSession(input: QuickLog, ctx: WriteContext, now: number, database: AppDb = db): Promise<number> {
  assertEditable(input.date, ctx.today, ctx.windowDays)
  const minutes = input.minutes !== null && input.minutes > 0 ? Math.round(input.minutes) : null
  return (await database.sessions.add({
    date: input.date,
    routine_id: null,
    title: input.title?.trim() || (input.kind === 'cardio' ? 'Cardio' : 'Strength'),
    started_at: null,
    ended_at: now,
    notes: input.notes?.trim() ?? '',
    rest_started_at: null,
    rest_seconds: null,
    kinds: [input.kind],
    quick: true,
    minutes,
    distance_km: input.kind === 'cardio' && input.distance_km && input.distance_km > 0 ? Math.round(input.distance_km * 100) / 100 : null,
  })) as number
}

async function editableSession(sessionId: number, ctx: WriteContext, database: AppDb): Promise<Session> {
  const session = await database.sessions.get(sessionId)
  if (!session) throw new Error('That session no longer exists.')
  assertEditable(session.date, ctx.today, ctx.windowDays)
  return session
}

/** Adds an exercise block to a session, prefilled from its last performance. */
export async function addExerciseToSession(sessionId: number, exerciseId: number, ctx: WriteContext, sets = 3, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.sessions, database.set_logs, async () => {
    const session = await editableSession(sessionId, ctx, database)
    const existing = await database.set_logs.where('session_id').equals(sessionId).toArray()
    const position = existing.reduce((max, set) => Math.max(max, set.position), -1) + 1
    const previous = await lastPerformedSets(exerciseId, session.date, database)
    for (let i = 0; i < sets; i++) {
      const prior = previous.length ? previous[Math.min(i, previous.length - 1)] : undefined
      await database.set_logs.add(plannedSet(sessionId, exerciseId, session.date, position, i + 1, prior, null))
    }
  })
}

/** One more set in a block, copying the numbers of the block's last row. */
export async function addSetRow(sessionId: number, position: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.sessions, database.set_logs, async () => {
    await editableSession(sessionId, ctx, database)
    const rows = (await database.set_logs.where('session_id').equals(sessionId).toArray())
      .filter((row) => row.position === position)
      .sort((a, b) => a.set_index - b.set_index)
    const last = rows[rows.length - 1]
    if (!last) return
    const { id: _id, ...copy } = last
    await database.set_logs.add({ ...copy, set_index: last.set_index + 1, done: false, done_at: null, rir: null, note: '' })
  })
}

type SetPatch = Partial<Pick<SetLog, 'weight_kg' | 'reps' | 'seconds' | 'distance_m' | 'rir' | 'kind' | 'note'>>

async function withSet<T>(setId: number, ctx: WriteContext, database: AppDb, action: (row: SetLog, session: Session) => Promise<T>): Promise<T | undefined> {
  return database.transaction('rw', database.sessions, database.set_logs, database.exercises, async () => {
    const row = await database.set_logs.get(setId)
    if (!row) return undefined
    const session = await editableSession(row.session_id, ctx, database)
    return action(row, session)
  })
}

export async function updateSet(setId: number, patch: SetPatch, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await withSet(setId, ctx, database, async () => {
    await database.set_logs.update(setId, patch)
  })
}

/**
 * Marks a set done and starts the rest clock. Saved on the tap itself: a workout gets
 * interrupted, and nothing may live only in memory.
 */
export async function completeSet(setId: number, patch: SetPatch, restSeconds: number | null, ctx: WriteContext, now: number, database: AppDb = db): Promise<void> {
  await withSet(setId, ctx, database, async (row, session) => {
    await database.set_logs.update(setId, { ...patch, done: true, done_at: now })
    if (session.ended_at === null) {
      await database.sessions.update(row.session_id, { rest_started_at: now, rest_seconds: restSeconds })
    } else {
      await refreshKinds(row.session_id, database)
    }
  })
}

export async function uncompleteSet(setId: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await withSet(setId, ctx, database, async (row) => {
    await database.set_logs.update(setId, { done: false, done_at: null })
    await refreshKinds(row.session_id, database)
  })
}

export async function removeSetRow(setId: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await withSet(setId, ctx, database, async (row) => {
    await database.set_logs.delete(setId)
    await refreshKinds(row.session_id, database)
  })
}

/** Removes a whole exercise block from a session. */
export async function removeExerciseBlock(sessionId: number, position: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.sessions, database.set_logs, database.exercises, async () => {
    await editableSession(sessionId, ctx, database)
    const rows = (await database.set_logs.where('session_id').equals(sessionId).toArray()).filter((row) => row.position === position)
    await database.set_logs.bulkDelete(rows.map((row) => row.id!))
    await refreshKinds(sessionId, database)
  })
}

export async function clearRest(sessionId: number, database: AppDb = db): Promise<void> {
  await database.sessions.update(sessionId, { rest_started_at: null, rest_seconds: null })
}

export async function extendRest(sessionId: number, bySeconds: number, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.sessions, async () => {
    const session = await database.sessions.get(sessionId)
    if (!session?.rest_seconds) return
    await database.sessions.update(sessionId, { rest_seconds: session.rest_seconds + bySeconds })
  })
}

export async function setSessionNotes(sessionId: number, notes: string, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.sessions, async () => {
    await editableSession(sessionId, ctx, database)
    await database.sessions.update(sessionId, { notes: notes.trim() })
  })
}

/**
 * Finishes a session: drops the rows that were planned but never performed (they are noise in
 * history, and every statistic ignores them anyway), stamps the end time and records what the
 * session contained.
 *
 * A session left open from an earlier day is closed at the time of its last set, not "now" —
 * otherwise a forgotten Finish would record a thirty-hour workout.
 */
export async function finishSession(sessionId: number, notes: string, ctx: WriteContext, now: number, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.sessions, database.set_logs, database.exercises, async () => {
    const session = await database.sessions.get(sessionId)
    if (!session) return
    // Finishing is what makes the day count as trained, so it obeys the lock like any other
    // write. A session left open on a day that has since locked can only be discarded.
    assertEditable(session.date, ctx.today, ctx.windowDays)
    const rows = await database.set_logs.where('session_id').equals(sessionId).toArray()
    const done = rows.filter((row) => row.done)
    await database.set_logs.bulkDelete(rows.filter((row) => !row.done).map((row) => row.id!))

    const lastSetAt = done.reduce((max, row) => Math.max(max, row.done_at ?? 0), 0)
    const endedAt = session.date === ctx.today ? now : lastSetAt || session.started_at || now
    await database.sessions.update(sessionId, {
      ended_at: endedAt,
      notes: notes.trim(),
      rest_started_at: null,
      rest_seconds: null,
      kinds: sessionKindsFrom(done, await loadExercises(database)),
    })
  })
}

/**
 * Deletes a session and its sets. A session is an event, not part of any denominator, so this
 * rewrites no score beyond the plain fact that the day no longer has a workout. Only inside the
 * correction window.
 */
export async function deleteSession(sessionId: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.sessions, database.set_logs, async () => {
    const session = await database.sessions.get(sessionId)
    if (!session) return
    // An unfinished session can always be discarded; a finished one only while it can be corrected.
    if (session.ended_at !== null) assertEditable(session.date, ctx.today, ctx.windowDays)
    const rows = await database.set_logs.where('session_id').equals(sessionId).toArray()
    await database.set_logs.bulkDelete(rows.map((row) => row.id!))
    await database.sessions.delete(sessionId)
  })
}

// ─── Routines and the weekly programme ───────────────────────────────────────────────────────

export interface RoutineItemInput {
  exercise_id: number
  target_sets: number
  target_reps_low: number | null
  target_reps_high: number | null
}

export async function createRoutine(name: string, weekdays: number[] = [], database: AppDb = db): Promise<number> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A routine needs a name.')
  return database.transaction('rw', database.routines, async () => {
    const all = await database.routines.toArray()
    const sortOrder = all.reduce((max, routine) => Math.max(max, routine.sort_order), -1) + 1
    return (await database.routines.add({
      name: trimmed,
      day_hint: weekdays.length ? weekdays[0] + 1 : null,
      weekdays,
      sort_order: sortOrder,
      retired_on: null,
    })) as number
  })
}

export async function updateRoutine(id: number, patch: Partial<Pick<WorkoutRoutine, 'name' | 'weekdays'>>, database: AppDb = db): Promise<void> {
  const next: Partial<WorkoutRoutine> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('A routine needs a name.')
    next.name = name
  }
  if (patch.weekdays) {
    next.weekdays = [...new Set(patch.weekdays)].sort((a, b) => a - b)
    next.day_hint = next.weekdays.length ? next.weekdays[0] + 1 : null
  }
  await database.routines.update(id, next)
}

export async function retireRoutine(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.routines.update(id, { retired_on: today, weekdays: [], day_hint: null })
}

export async function restoreRoutine(id: number, database: AppDb = db): Promise<void> {
  await database.routines.update(id, { retired_on: null })
}

export async function reorderRoutines(orderedIds: number[], database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.routines, async () => {
    await Promise.all(orderedIds.map((id, i) => database.routines.update(id, { sort_order: i })))
  })
}

/** Replaces a routine's exercise list wholesale, in one transaction, so an interrupted save
 *  cannot leave the routine half-empty. */
export async function setRoutineItems(routineId: number, items: RoutineItemInput[], database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.routine_items, async () => {
    const existing = await database.routine_items.where('routine_id').equals(routineId).toArray()
    await database.routine_items.bulkDelete(existing.map((item) => item.id!))
    await database.routine_items.bulkAdd(
      items.map((item, position) => ({
        routine_id: routineId,
        exercise_id: item.exercise_id,
        position,
        target_sets: Math.min(12, Math.max(1, Math.round(item.target_sets))),
        target_reps_low: item.target_reps_low,
        target_reps_high: item.target_reps_high,
        note: '',
      })),
    )
  })
}

/** Sets which routines the programme suggests on one weekday (0 = Monday). */
export async function setProgrammeDay(weekday: number, routineIds: number[], database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.routines, async () => {
    const all = await database.routines.toArray()
    for (const routine of all) {
      if (routine.id === undefined || routine.retired_on) continue
      const days = new Set(routine.weekdays ?? [])
      if (routineIds.includes(routine.id)) days.add(weekday)
      else days.delete(weekday)
      const weekdays = [...days].sort((a, b) => a - b)
      if (weekdays.join() === (routine.weekdays ?? []).join()) continue
      await database.routines.update(routine.id, { weekdays, day_hint: weekdays.length ? weekdays[0] + 1 : null })
    }
  })
}

// ─── Exercises ───────────────────────────────────────────────────────────────────────────────

export interface ExerciseInput {
  name: string
  primary_muscle: MuscleGroup
  secondary_muscles?: MuscleGroup[]
  equipment: Equipment
  kind: ExerciseKind
  increment_kg: number
  rest_seconds: number | null
  notes?: string
}

function cleanExercise(input: ExerciseInput): Omit<Exercise, 'id' | 'is_builtin' | 'retired_on' | 'sort_order' | 'bar_weight_kg'> {
  const name = input.name.trim()
  if (!name) throw new Error('An exercise needs a name.')
  if (!(input.increment_kg > 0)) throw new Error('The weight step must be more than zero.')
  return {
    name,
    primary_muscle: input.primary_muscle,
    secondary_muscles: (input.secondary_muscles ?? []).filter((muscle) => muscle !== input.primary_muscle),
    equipment: input.equipment,
    kind: input.kind,
    increment_kg: input.increment_kg,
    rest_seconds: input.rest_seconds && input.rest_seconds > 0 ? Math.round(input.rest_seconds) : null,
    notes: input.notes?.trim() ?? '',
  }
}

export async function addExercise(input: ExerciseInput, database: AppDb = db): Promise<number> {
  const clean = cleanExercise(input)
  return database.transaction('rw', database.exercises, async () => {
    const all = await database.exercises.toArray()
    if (all.some((exercise) => exercise.name.toLowerCase() === clean.name.toLowerCase())) {
      throw new Error(`There is already an exercise called ${clean.name}.`)
    }
    const sortOrder = all.reduce((max, exercise) => Math.max(max, exercise.sort_order), -1) + 1
    return (await database.exercises.add({
      ...clean,
      bar_weight_kg: input.equipment === 'barbell' ? 20 : null,
      is_builtin: false,
      retired_on: null,
      sort_order: sortOrder,
    })) as number
  })
}

export async function updateExercise(id: number, input: ExerciseInput, database: AppDb = db): Promise<void> {
  await database.exercises.update(id, cleanExercise(input))
}

export async function retireExercise(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.exercises.update(id, { retired_on: today })
}

export async function restoreExercise(id: number, database: AppDb = db): Promise<void> {
  await database.exercises.update(id, { retired_on: null })
}
