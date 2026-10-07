import type { DateStr, Exercise, Habit, MuscleGroup, SetLog } from '../data/types'
import type { CompletionIndex } from './completion'
import { addDays, addMonths, monthEndOf, monthStartOf, weekStartOf } from './dates'
import { rateOf, tallyRange } from './insights'
import { e1rm, isHardSet, isWorkSet, volumeLoad } from './training'

/**
 * Longer views of the record: month by month, and what the training log adds up to. Like the rest
 * of Progress, every figure is drawn from the rows themselves and is withheld when there is too
 * little behind it.
 */
export interface MonthPoint {
  /** First day of the month. */
  month: DateStr
  done: number
  due: number
  /** Whole percent, or null with too little due. */
  rate: number | null
  /** The month is still running: counted up to yesterday. */
  running: boolean
}

/** Completion for each of the last `months` months, oldest first. Today is left out, as elsewhere. */
export function monthlySeries(habits: readonly Habit[], months: number, today: DateStr, index: CompletionIndex): MonthPoint[] {
  const yesterday = addDays(today, -1)
  const current = monthStartOf(today)
  const points: MonthPoint[] = []
  for (let i = months - 1; i >= 0; i--) {
    const start = addMonths(current, -i)
    const end = monthEndOf(start)
    const to = end > yesterday ? yesterday : end
    const tally = to < start ? { done: 0, due: 0 } : tallyRange(habits, { from: start, to }, index)
    points.push({ month: start, done: tally.done, due: tally.due, rate: rateOf(tally), running: i === 0 })
  }
  return points
}

const doneWork = (sets: readonly SetLog[]): SetLog[] => sets.filter((set) => set.done && isWorkSet(set))

/** Kilograms lifted in each of the last `weeks` weeks (weight x reps over work sets), oldest first. */
export function weeklyVolume(sets: readonly SetLog[], today: DateStr, weekStart: number, weeks: number): { x: DateStr; y: number }[] {
  const current = weekStartOf(today, weekStart)
  const byWeek = new Map<DateStr, SetLog[]>()
  for (const set of doneWork(sets)) {
    const start = weekStartOf(set.date, weekStart)
    const list = byWeek.get(start)
    if (list) list.push(set)
    else byWeek.set(start, [set])
  }
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(current, -7 * (weeks - 1 - i))
    return { x: start, y: Math.round(volumeLoad(byWeek.get(start) ?? [])) }
  })
}

export interface MuscleRow {
  muscle: MuscleGroup
  sets: number
  /** Hard sets in the equally long period before. */
  previous: number
}

/** Hard sets per muscle over the last `days` days against the `days` before, most trained first. */
export function muscleBalance(sets: readonly SetLog[], exercisesById: ReadonlyMap<number, Exercise>, today: DateStr, days: number): MuscleRow[] {
  const from = addDays(today, -days + 1)
  const before = addDays(from, -days)
  const rows = new Map<MuscleGroup, MuscleRow>()
  for (const set of sets) {
    if (!set.done || !isHardSet(set) || set.date < before || set.date > today) continue
    const exercise = exercisesById.get(set.exercise_id)
    if (!exercise || exercise.primary_muscle === 'cardio') continue
    const row = rows.get(exercise.primary_muscle) ?? { muscle: exercise.primary_muscle, sets: 0, previous: 0 }
    if (set.date >= from) row.sets += 1
    else row.previous += 1
    rows.set(exercise.primary_muscle, row)
  }
  return [...rows.values()].sort((a, b) => b.sets - a.sets || b.previous - a.previous)
}

export interface PersonalBest {
  exercise: Exercise
  set: SetLog
  /** Estimated one-rep max in kg, the measure the best is judged by. */
  estimate: number
}

/** The best set ever logged for each exercise, by estimated one-rep max, most recent first. */
export function personalBests(sets: readonly SetLog[], exercisesById: ReadonlyMap<number, Exercise>): PersonalBest[] {
  const best = new Map<number, PersonalBest>()
  for (const set of doneWork(sets)) {
    const exercise = exercisesById.get(set.exercise_id)
    const estimate = e1rm(set.weight_kg, set.reps, set.rir)
    if (!exercise || estimate === null) continue
    const current = best.get(set.exercise_id)
    // A tie goes to the earlier day: that is when the best was first reached.
    if (!current || estimate > current.estimate) best.set(set.exercise_id, { exercise, set, estimate })
  }
  return [...best.values()].sort((a, b) => (a.set.date < b.set.date ? 1 : a.set.date > b.set.date ? -1 : b.estimate - a.estimate))
}
