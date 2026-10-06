import { db } from './db'
import { todayLocalStr } from './dates'
import type { Exercise, Meal, MealSlot, Polarity, Session, SetLog, Supplement } from './types'

/**
 * Read and write inside one transaction: outside one, two fast taps can both read the same
 * `existing` and the second write silently overwrites the first — the check-then-act shape that
 * dropped saves twice before (see setWeeklyRecord below). The &[habit_id+date] unique index stops
 * a duplicate row, but not a lost toggle.
 */
export async function toggleEntry(habitId: number, date: string): Promise<void> {
  await db.transaction('rw', db.entries, async () => {
    const existing = await db.entries.where('[habit_id+date]').equals([habitId, date]).first()
    if (existing) {
      await db.entries.update(existing.id!, { done: !existing.done })
    } else {
      await db.entries.add({ habit_id: habitId, date, done: true })
    }
  })
}

export async function addHabit(name: string, sortOrder: number, polarity: Polarity = 'do'): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.habits.add({
    name: trimmed,
    short_name: trimmed.length > 22 ? trimmed.slice(0, 22) : trimmed,
    polarity,
    created_on: todayLocalStr(),
    retired_on: null,
    sort_order: sortOrder,
  })
}

export async function retireHabit(id: number): Promise<void> {
  await db.habits.update(id, { retired_on: todayLocalStr() })
}

export async function restoreHabit(id: number): Promise<void> {
  // Land at the end of the active list rather than reviving a stale sort_order that might now
  // sit in the middle of habits reordered since this one retired.
  await db.transaction('rw', db.habits, async () => {
    const active = await db.habits.filter((h) => !h.retired_on).toArray()
    const nextSortOrder = active.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1
    await db.habits.update(id, { retired_on: null, sort_order: nextSortOrder })
  })
}

export async function renameHabit(id: number, name: string, shortName: string): Promise<void> {
  const trimmedName = name.trim()
  const trimmedShort = shortName.trim()
  if (!trimmedName || !trimmedShort) return
  await db.habits.update(id, { name: trimmedName, short_name: trimmedShort })
}

/**
 * True deletion — the one exception to "habits are never deleted" (CLAUDE.md). Only ever call
 * this for a habit whose created_on is today: such a habit has never been part of a completed
 * day's score (today's is still "so far", not settled history — see CLAUDE.md's scoring rules),
 * so removing it can't retroactively change any daily score a user has already seen. A habit even
 * one day older than today WOULD have already contributed a miss/done to a locked-in past day's
 * denominator — deleting that turns history into fiction, which is exactly what retire/restore
 * exists to avoid. Callers must check eligibility themselves; this function trusts the caller.
 */
export async function deleteHabit(id: number): Promise<void> {
  await db.transaction('rw', db.habits, db.entries, async () => {
    await db.entries.where('habit_id').equals(id).delete()
    await db.habits.delete(id)
  })
}

export async function reorderHabits(orderedIds: number[]): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    await Promise.all(orderedIds.map((id, i) => db.habits.update(id, { sort_order: i })))
  })
}

export async function setDailyNote(date: string, text: string): Promise<void> {
  // `date` is the primary key, so this is a single atomic upsert — no read-then-write race
  // possible, unlike setWeeklyRecord below (which predates giving weekly_records a proper
  // primary key and still needs the transaction wrapper).
  await db.daily_notes.put({ date, text })
}

export async function setWeeklyRecord(
  weekMonday: string,
  patch: Partial<{ weight_kg: number | null; notes: string }>,
): Promise<void> {
  await db.transaction('rw', db.weekly_records, async () => {
    const existing = await db.weekly_records.where('week_monday').equals(weekMonday).first()
    if (existing) {
      await db.weekly_records.update(existing.id!, patch)
    } else {
      await db.weekly_records.add({
        week_monday: weekMonday,
        weight_kg: patch.weight_kg ?? null,
        notes: patch.notes ?? '',
      })
    }
  })
}

// ─── Gym ─────────────────────────────────────────────────────────────────────────────────────

/** Rest used when neither the exercise nor the session specifies one. */
export const DEFAULT_REST_SECONDS = 120

/** The habit a finished session ticks. Looked up by short_name so no id is hardcoded. */
const GYM_HABIT_SHORT_NAME = 'Gym'

/**
 * The sets from the most recent *earlier* session that actually performed this exercise — the
 * prefill source for a new session. The plan comes from the routine; the numbers come from here,
 * because what you lifted last time is a fact and what the routine says is only an intention.
 */
export async function lastPerformedSets(exerciseId: number, beforeDate: string): Promise<SetLog[]> {
  const rows = await db.set_logs.where('exercise_id').equals(exerciseId).toArray()
  const done = rows.filter((r) => r.done && r.date < beforeDate)
  if (!done.length) return []
  const latest = done.reduce((max, r) => (r.date > max ? r.date : max), done[0].date)
  return done.filter((r) => r.date === latest).sort((a, b) => a.set_index - b.set_index)
}

/** Today's session that hasn't been finished yet, if there is one. */
export async function openSessionForDate(date: string): Promise<Session | undefined> {
  const sessions = await db.sessions.where('date').equals(date).toArray()
  return sessions.find((s) => s.ended_at === null)
}

/**
 * Starts a session and lays out its planned sets from the routine, all in one transaction — a
 * session with no rows, or rows with no session, are both broken states to have to recover from.
 */
export async function startSession(routineId: number | null, date: string): Promise<number> {
  return db.transaction('rw', db.sessions, db.routines, db.routine_items, db.set_logs, async () => {
    const routine = routineId ? await db.routines.get(routineId) : undefined
    const sessionId = (await db.sessions.add({
      date,
      routine_id: routine?.id ?? null,
      // Snapshotted: renaming the routine later must not rewrite what this session was called.
      title: routine?.name ?? 'Free session',
      started_at: Date.now(),
      ended_at: null,
      notes: '',
      rest_started_at: null,
      rest_seconds: null,
    })) as number

    if (!routine?.id) return sessionId

    const items = await db.routine_items.where('routine_id').equals(routine.id).sortBy('position')
    for (const item of items) {
      const previous = await lastPerformedSets(item.exercise_id, date)
      const setCount = Math.max(1, item.target_sets)
      for (let i = 0; i < setCount; i++) {
        // Fewer sets last time than planned: repeat its final set rather than leaving blanks.
        const prior = previous.length ? previous[Math.min(i, previous.length - 1)] : undefined
        await db.set_logs.add({
          session_id: sessionId,
          exercise_id: item.exercise_id,
          date,
          position: item.position,
          set_index: i + 1,
          weight_kg: prior?.weight_kg ?? null,
          reps: prior?.reps ?? item.target_reps_low ?? null,
          seconds: prior?.seconds ?? null,
          distance_m: prior?.distance_m ?? null,
          rir: null,
          kind: 'work',
          done: false,
          done_at: null,
          note: '',
        })
      }
    }
    return sessionId
  })
}

/** Adds an exercise block to a running session, prefilled from its last performance. */
export async function addExerciseToSession(
  sessionId: number,
  exerciseId: number,
  date: string,
  sets = 3,
): Promise<void> {
  await db.transaction('rw', db.set_logs, async () => {
    const existing = await db.set_logs.where('session_id').equals(sessionId).toArray()
    const position = existing.reduce((max, s) => Math.max(max, s.position), 0) + 1
    const previous = await lastPerformedSets(exerciseId, date)
    for (let i = 0; i < sets; i++) {
      const prior = previous.length ? previous[Math.min(i, previous.length - 1)] : undefined
      await db.set_logs.add({
        session_id: sessionId,
        exercise_id: exerciseId,
        date,
        position,
        set_index: i + 1,
        weight_kg: prior?.weight_kg ?? null,
        reps: prior?.reps ?? null,
        seconds: prior?.seconds ?? null,
        distance_m: prior?.distance_m ?? null,
        rir: null,
        kind: 'work',
        done: false,
        done_at: null,
        note: '',
      })
    }
  })
}

/** One more set of the same exercise, copying the last row's numbers. */
export async function addSetRow(sessionId: number, exerciseId: number): Promise<void> {
  await db.transaction('rw', db.set_logs, async () => {
    const rows = (await db.set_logs.where('session_id').equals(sessionId).toArray())
      .filter((r) => r.exercise_id === exerciseId)
      .sort((a, b) => a.set_index - b.set_index)
    const last = rows[rows.length - 1]
    if (!last) return
    await db.set_logs.add({
      ...last,
      id: undefined,
      set_index: last.set_index + 1,
      done: false,
      done_at: null,
      rir: null,
    })
  })
}

export async function updateSet(setId: number, patch: Partial<SetLog>): Promise<void> {
  await db.set_logs.update(setId, patch)
}

/**
 * Marks a set done and starts the rest clock. Autosaved on the tick itself: a gym session gets
 * interrupted, and nothing may live only in component state. Rest seconds are passed in by the
 * screen (which already holds the exercise) so this transaction needs no extra table.
 */
export async function completeSet(
  setId: number,
  patch: Partial<SetLog>,
  restSeconds: number | null,
): Promise<void> {
  await db.transaction('rw', db.set_logs, db.sessions, async () => {
    const row = await db.set_logs.get(setId)
    if (!row) return
    await db.set_logs.update(setId, { ...patch, done: true, done_at: Date.now() })
    await db.sessions.update(row.session_id, {
      rest_started_at: Date.now(),
      rest_seconds: restSeconds ?? DEFAULT_REST_SECONDS,
    })
  })
}

export async function uncompleteSet(setId: number): Promise<void> {
  await db.set_logs.update(setId, { done: false, done_at: null })
}

export async function removeSetRow(setId: number): Promise<void> {
  await db.set_logs.delete(setId)
}

export async function clearRest(sessionId: number): Promise<void> {
  await db.sessions.update(sessionId, { rest_started_at: null, rest_seconds: null })
}

export async function extendRest(sessionId: number, bySeconds: number): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const session = await db.sessions.get(sessionId)
    if (!session?.rest_seconds) return
    await db.sessions.update(sessionId, { rest_seconds: session.rest_seconds + bySeconds })
  })
}

/**
 * Finishes a session: drops the rows that were planned but never performed (they are noise in
 * history, and every statistic ignores them anyway) and ticks the gym habit for that date, so
 * logging the session is the only chore. All one transaction — a finished session whose habit
 * tick went missing would quietly change that day's score.
 */
export async function finishSession(sessionId: number, notes: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.set_logs, db.habits, db.entries, async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) return

    const rows = await db.set_logs.where('session_id').equals(sessionId).toArray()
    await db.set_logs.bulkDelete(rows.filter((s) => !s.done).map((s) => s.id!))
    await db.sessions.update(sessionId, {
      ended_at: Date.now(),
      notes,
      rest_started_at: null,
      rest_seconds: null,
    })

    const habit = await db.habits.filter((h) => h.short_name === GYM_HABIT_SHORT_NAME).first()
    if (!habit?.id) return
    const entry = await db.entries.where('[habit_id+date]').equals([habit.id, session.date]).first()
    if (entry) {
      if (!entry.done) await db.entries.update(entry.id!, { done: true })
    } else {
      await db.entries.add({ habit_id: habit.id, date: session.date, done: true })
    }
  })
}

/** A session records an event and is part of no denominator, so deleting one rewrites no score —
 *  unlike a habit. The gym habit tick is deliberately left alone. */
export async function deleteSession(sessionId: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.set_logs, async () => {
    const rows = await db.set_logs.where('session_id').equals(sessionId).toArray()
    await db.set_logs.bulkDelete(rows.map((s) => s.id!))
    await db.sessions.delete(sessionId)
  })
}

// ─── Routines ────────────────────────────────────────────────────────────────────────────────

export async function createRoutine(name: string, dayHint: number | null): Promise<number> {
  const trimmed = name.trim()
  if (!trimmed) return 0
  return db.transaction('rw', db.routines, async () => {
    const all = await db.routines.toArray()
    const sortOrder = all.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1
    return (await db.routines.add({
      name: trimmed,
      day_hint: dayHint,
      sort_order: sortOrder,
      retired_on: null,
    })) as number
  })
}

export async function updateRoutine(
  id: number,
  patch: Partial<{ name: string; day_hint: number | null }>,
): Promise<void> {
  await db.routines.update(id, patch)
}

export async function retireRoutine(id: number): Promise<void> {
  await db.routines.update(id, { retired_on: todayLocalStr() })
}

export async function restoreRoutine(id: number): Promise<void> {
  await db.routines.update(id, { retired_on: null })
}

/** Replaces a routine's exercise list wholesale, inside one transaction so an interrupted save
 *  can't leave the routine half-empty. */
export async function setRoutineItems(
  routineId: number,
  items: {
    exercise_id: number
    target_sets: number
    target_reps_low: number | null
    target_reps_high: number | null
  }[],
): Promise<void> {
  await db.transaction('rw', db.routine_items, async () => {
    const existing = await db.routine_items.where('routine_id').equals(routineId).toArray()
    await db.routine_items.bulkDelete(existing.map((i) => i.id!))
    await db.routine_items.bulkAdd(
      items.map((item, position) => ({ ...item, routine_id: routineId, position, note: '' })),
    )
  })
}

// ─── Exercises ───────────────────────────────────────────────────────────────────────────────

export async function addExercise(exercise: Omit<Exercise, 'id'>): Promise<number> {
  return (await db.exercises.add(exercise)) as number
}

export async function updateExercise(id: number, patch: Partial<Exercise>): Promise<void> {
  await db.exercises.update(id, patch)
}

export async function retireExercise(id: number): Promise<void> {
  await db.exercises.update(id, { retired_on: todayLocalStr() })
}

export async function restoreExercise(id: number): Promise<void> {
  await db.exercises.update(id, { retired_on: null })
}

// ─── Food and supplements ────────────────────────────────────────────────────────────────────

/**
 * [date+slot] is the primary key, so this merges into one row with a single put. The caller
 * passes the date it was rendering — never today's date read inside here, or a save landing after
 * the user has navigated would write onto the wrong day.
 */
export async function setMeal(
  date: string,
  slot: MealSlot,
  patch: Partial<Pick<Meal, 'text' | 'ate_out'>>,
): Promise<void> {
  await db.transaction('rw', db.meals, async () => {
    const existing = await db.meals.get([date, slot])
    await db.meals.put({ text: '', ate_out: false, ...existing, date, slot, ...patch })
  })
}

/**
 * Ticks a supplement and moves the stock count with it, both in one transaction: a tick that
 * recorded the dose but lost the decrement would quietly corrupt "how many servings are left",
 * which is the only reason stock is tracked at all.
 */
export async function toggleSupplement(supplementId: number, date: string): Promise<void> {
  await db.transaction('rw', db.supplements, db.supplement_logs, async () => {
    const existing = await db.supplement_logs.get([supplementId, date])
    const taken = !(existing?.taken ?? false)
    await db.supplement_logs.put({ supplement_id: supplementId, date, taken })

    const supplement = await db.supplements.get(supplementId)
    if (supplement && supplement.servings_left !== null) {
      const next = supplement.servings_left + (taken ? -1 : 1)
      await db.supplements.update(supplementId, { servings_left: Math.max(0, next) })
    }
  })
}

export async function addSupplement(supplement: Omit<Supplement, 'id'>): Promise<number> {
  return (await db.supplements.add(supplement)) as number
}

export async function updateSupplement(id: number, patch: Partial<Supplement>): Promise<void> {
  await db.supplements.update(id, patch)
}

export async function retireSupplement(id: number): Promise<void> {
  await db.supplements.update(id, { retired_on: todayLocalStr() })
}

export async function restoreSupplement(id: number): Promise<void> {
  await db.supplements.update(id, { retired_on: null })
}
