import { db, type AppDb } from './db'
import type {
  AreaId, CompletionSource, DateStr, DayRule, Dose, Entry, Habit, HabitKind, HabitVersion, Measure,
  PeriodTarget, Polarity,
} from './types'
import { assertEditable } from '../engine/lock'
import { appendVersion, currentVersion, habitProblems, versionOn, type VersionPatch } from '../engine/timeline'

/**
 * Everything that writes a habit or a tick. Screens never touch the tables directly: this is the
 * one place that enforces the rules that keep the record trustworthy —
 *   - a change to a habit starts today and never rewrites an earlier chapter,
 *   - a habit is retired, not deleted,
 *   - days outside the correction window cannot be written to,
 *   - a habit completed by sessions cannot be ticked by hand.
 * Every read-then-write is inside a transaction; two quick taps cannot lose one of them.
 */

/** What every dated write needs to know to enforce the history lock. */
export interface WriteContext {
  today: DateStr
  windowDays: number
}

export class NotTickableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotTickableError'
  }
}

export const BOOLEAN_MEASURE: Measure = { type: 'boolean', target: null, unit: '' }

/** Copies the newest chapter's name and retirement onto the row. */
export function withMirror(habit: Habit): Habit {
  const last = currentVersion(habit)
  return { ...habit, name: last.name, short_name: last.short_name, retired_on: last.active ? null : last.from }
}

export function shortNameFor(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > 22 ? trimmed.slice(0, 22).trimEnd() : trimmed
}

function assertValid(habit: Habit): void {
  const problems = habitProblems(habit)
  if (problems.length) throw new Error(`This habit cannot be saved: ${problems.join('; ')}.`)
}

export async function listHabits(database: AppDb = db): Promise<Habit[]> {
  return database.habits.orderBy('sort_order').toArray()
}

export interface NewHabit {
  name: string
  short_name?: string
  kind?: HabitKind
  polarity?: Polarity
  area: AreaId
  group?: string
  day?: DayRule
  target?: PeriodTarget | null
  sources?: CompletionSource[]
  measure?: Measure
  description?: string
  icon?: string
  meal_slot?: string | null
  dose?: Dose | null
}

export function buildHabit(input: NewHabit, today: DateStr, sortOrder: number): Habit {
  const name = input.name.trim()
  const version: HabitVersion = {
    from: today,
    active: true,
    name,
    short_name: input.short_name?.trim() || shortNameFor(name),
    area: input.area,
    group: input.group?.trim() ?? '',
    day: input.day ?? { kind: 'daily' },
    target: input.target ?? null,
    sources: input.sources ?? ['manual'],
  }
  return {
    kind: input.kind ?? 'habit',
    polarity: input.polarity ?? 'do',
    created_on: today,
    sort_order: sortOrder,
    description: input.description?.trim() ?? '',
    icon: input.icon ?? '',
    measure: input.measure ?? BOOLEAN_MEASURE,
    meal_slot: input.meal_slot ?? null,
    dose: input.dose ?? null,
    versions: [version],
    name: version.name,
    short_name: version.short_name,
    retired_on: null,
  }
}

export async function createHabit(input: NewHabit, today: DateStr, database: AppDb = db): Promise<number> {
  if (!input.name.trim()) throw new Error('A habit needs a name.')
  return database.transaction('rw', database.habits, async () => {
    const all = await database.habits.toArray()
    const sortOrder = all.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1
    const habit = buildHabit(input, today, sortOrder)
    assertValid(habit)
    return (await database.habits.add(habit)) as number
  })
}

/**
 * Changes anything that is part of a habit's history — name, pillar, group, schedule, target,
 * sources, or whether it is active. The change starts on `today`; every earlier day keeps reading
 * exactly as it did.
 */
export async function changeHabit(
  id: number,
  patch: VersionPatch,
  today: DateStr,
  database: AppDb = db,
): Promise<void> {
  await database.transaction('rw', database.habits, async () => {
    const habit = await database.habits.get(id)
    if (!habit) throw new Error('That habit no longer exists.')
    const cleaned: VersionPatch = { ...patch }
    if (cleaned.name !== undefined) {
      cleaned.name = cleaned.name.trim()
      if (!cleaned.name) throw new Error('A habit needs a name.')
      if (cleaned.short_name === undefined) cleaned.short_name = shortNameFor(cleaned.name)
    }
    if (cleaned.short_name !== undefined) cleaned.short_name = cleaned.short_name.trim() || shortNameFor(cleaned.name ?? habit.name)
    const next = withMirror({ ...habit, versions: appendVersion(habit.versions, today, cleaned) })
    assertValid(next)
    await database.habits.put(next)
  })
}

/** Presentation details that are not part of history: changing them rewrites nothing. */
export async function updateHabitDetails(
  id: number,
  patch: Partial<Pick<Habit, 'description' | 'icon' | 'measure' | 'dose' | 'polarity' | 'meal_slot'>>,
  database: AppDb = db,
): Promise<void> {
  await database.habits.update(id, patch)
}

/** From today the habit leaves Today and every denominator. Its past stays exactly as it was. */
export async function retireHabit(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await changeHabit(id, { active: false }, today, database)
}

/** Brings a habit back from today. The days it was retired stay untracked — they are not turned
 *  into misses. It rejoins at the end of the list. */
export async function restoreHabit(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.habits, async () => {
    const all = await database.habits.toArray()
    const sortOrder = all.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1
    await changeHabit(id, { active: true }, today, database)
    await database.habits.update(id, { sort_order: sortOrder })
  })
}

export async function reorderHabits(orderedIds: number[], database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.habits, async () => {
    await Promise.all(orderedIds.map((id, i) => database.habits.update(id, { sort_order: i })))
  })
}

/**
 * The single exception to "never delete": a habit created today has not been part of any finished
 * day, so removing it cannot change a score that already stands. Anything older must be retired.
 */
export async function deleteHabitCreatedToday(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.habits, database.entries, database.day_routines, async () => {
    const habit = await database.habits.get(id)
    if (!habit) return
    if (habit.created_on !== today) throw new Error('Only a habit created today can be deleted. Retire it instead.')
    await database.entries.where('habit_id').equals(id).delete()
    await database.habits.delete(id)
    const routines = await database.day_routines.toArray()
    for (const routine of routines) {
      if (!routine.steps.some((s) => s.habit_id === id)) continue
      await database.day_routines.update(routine.id!, { steps: routine.steps.filter((s) => s.habit_id !== id) })
    }
  })
}

// ─── Ticks ───────────────────────────────────────────────────────────────────────────────────

export interface TickDetails {
  value?: number | null
  note?: string
  /** Local 'HH:MM'. */
  time?: string | null
}

/**
 * Records a habit as done or not done on a day.
 *
 * The date is always passed in by the screen that was showing it — never read from the clock in
 * here, or a save landing just after midnight would write onto the wrong day.
 */
export async function setHabitDone(
  habitId: number,
  date: DateStr,
  done: boolean,
  ctx: WriteContext,
  details: TickDetails = {},
  database: AppDb = db,
): Promise<void> {
  assertEditable(date, ctx.today, ctx.windowDays)
  await database.transaction('rw', database.habits, database.entries, async () => {
    const habit = await database.habits.get(habitId)
    if (!habit) throw new Error('That habit no longer exists.')
    const version = versionOn(habit, date)
    if (!version || !version.active) throw new NotTickableError(`${habit.name} was not being tracked on ${date}.`)
    if (!version.sources.includes('manual')) {
      throw new NotTickableError(`${habit.name} is completed by logging a session, not by ticking it.`)
    }
    const existing = await database.entries.where('[habit_id+date]').equals([habitId, date]).first()
    const row: Entry = {
      habit_id: habitId,
      date,
      done,
      value: done ? details.value ?? existing?.value ?? habit.measure.target ?? null : null,
      note: details.note ?? existing?.note ?? '',
      time: done ? details.time ?? existing?.time ?? null : null,
    }
    if (existing) await database.entries.update(existing.id!, row)
    else await database.entries.add(row)
  })
}

/** Flips a habit's tick for a day and returns the new state. */
export async function toggleHabit(
  habitId: number,
  date: DateStr,
  ctx: WriteContext,
  details: TickDetails = {},
  database: AppDb = db,
): Promise<boolean> {
  return database.transaction('rw', database.habits, database.entries, async () => {
    const existing = await database.entries.where('[habit_id+date]').equals([habitId, date]).first()
    const next = !(existing?.done ?? false)
    await setHabitDone(habitId, date, next, ctx, details, database)
    return next
  })
}

/** Adds or changes the note or value on a tick without changing whether it is done. */
export async function annotateEntry(
  habitId: number,
  date: DateStr,
  ctx: WriteContext,
  details: TickDetails,
  database: AppDb = db,
): Promise<void> {
  assertEditable(date, ctx.today, ctx.windowDays)
  await database.transaction('rw', database.entries, async () => {
    const existing = await database.entries.where('[habit_id+date]').equals([habitId, date]).first()
    if (!existing) {
      await database.entries.add({ habit_id: habitId, date, done: false, value: details.value ?? null, note: details.note ?? '', time: null })
      return
    }
    const patch: Partial<Entry> = {}
    if (details.value !== undefined) patch.value = details.value
    if (details.note !== undefined) patch.note = details.note
    if (details.time !== undefined) patch.time = details.time
    await database.entries.update(existing.id!, patch)
  })
}
