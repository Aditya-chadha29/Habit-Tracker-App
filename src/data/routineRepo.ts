import { db, type AppDb } from './db'
import type { DateStr, DayRoutine, RoutineSlot, RoutineStep } from './types'

/**
 * Day routines: named, ordered lists of steps (a morning, an evening). A step either points at a
 * habit — and then simply shows that habit's state — or is a plain reminder line. A routine is a
 * guide to the shape of the day, never an alarm and never a schedule.
 */
const SLOTS: RoutineSlot[] = ['morning', 'pre_gym', 'evening', 'custom']

export function newStepKey(): string {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function cleanSteps(steps: readonly RoutineStep[]): RoutineStep[] {
  const seen = new Set<string>()
  const out: RoutineStep[] = []
  for (const step of steps) {
    const label = step.label.trim()
    // A reminder line with no words has nothing to show; a linked step is named by its habit.
    if (step.habit_id === null && !label) continue
    let key = step.key || newStepKey()
    while (seen.has(key)) key = newStepKey()
    seen.add(key)
    out.push({
      key,
      habit_id: step.habit_id,
      label,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(step.time) ? step.time : '',
      minutes: step.minutes !== null && step.minutes > 0 ? Math.round(step.minutes) : null,
      note: step.note.trim(),
    })
  }
  return out
}

export async function createDayRoutine(name: string, slot: RoutineSlot, steps: readonly RoutineStep[] = [], database: AppDb = db): Promise<number> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A routine needs a name.')
  return database.transaction('rw', database.day_routines, async () => {
    const all = await database.day_routines.toArray()
    const sortOrder = all.reduce((max, routine) => Math.max(max, routine.sort_order), -1) + 1
    return (await database.day_routines.add({
      name: trimmed,
      slot: SLOTS.includes(slot) ? slot : 'custom',
      steps: cleanSteps(steps),
      sort_order: sortOrder,
      retired_on: null,
    })) as number
  })
}

export async function updateDayRoutine(
  id: number,
  patch: Partial<Pick<DayRoutine, 'name' | 'slot' | 'steps'>>,
  database: AppDb = db,
): Promise<void> {
  const next: Partial<DayRoutine> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('A routine needs a name.')
    next.name = name
  }
  if (patch.slot !== undefined) next.slot = SLOTS.includes(patch.slot) ? patch.slot : 'custom'
  if (patch.steps !== undefined) next.steps = cleanSteps(patch.steps)
  await database.day_routines.update(id, next)
}

export async function setDayRoutineRetired(id: number, retiredOn: DateStr | null, database: AppDb = db): Promise<void> {
  await database.day_routines.update(id, { retired_on: retiredOn })
}

export async function reorderDayRoutines(orderedIds: number[], database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.day_routines, async () => {
    await Promise.all(orderedIds.map((id, i) => database.day_routines.update(id, { sort_order: i })))
  })
}

/** Adds a habit to a routine (at the end) or takes it out. Used by the habit editor. */
export async function setHabitInRoutine(routineId: number, habitId: number, member: boolean, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.day_routines, async () => {
    const routine = await database.day_routines.get(routineId)
    if (!routine) return
    const has = routine.steps.some((step) => step.habit_id === habitId)
    if (member === has) return
    const steps = member
      ? [...routine.steps, { key: newStepKey(), habit_id: habitId, label: '', time: '', minutes: null, note: '' }]
      : routine.steps.filter((step) => step.habit_id !== habitId)
    await database.day_routines.update(routineId, { steps })
  })
}
