import type { DateStr, Exercise, Habit, Meal, Session, SetLog, WeightEntry } from '../data/types'
import type { CompletionIndex } from './completion'
import { addDays, dateRange, minDate } from './dates'
import { muscleWeek } from './history'
import { dueItems } from './score'
import { e1rm, isWorkSet, weightIn, type WeightUnit } from './training'

/** One line of the weekly report: this week beside the week before. */
export interface ReportRow {
  label: string
  value: string
  before: string
}

export interface WeekReport {
  gym: ReportRow[]
  diet: ReportRow[]
  /** Muscles with no hard sets this week. */
  untrained: string[]
  /** Exercises whose best estimated one-rep max was beaten this week. */
  newBests: string[]
}

interface ReportInput {
  start: DateStr
  today: DateStr
  habits: readonly Habit[]
  index: CompletionIndex
  sessions: readonly Session[]
  sets: readonly SetLog[]
  exercisesById: ReadonlyMap<number, Exercise>
  meals: readonly Meal[]
  weights: readonly WeightEntry[]
  muscleNames: readonly string[]
  unit?: WeightUnit
}

/** How many of a kind of habit were done of those due in a period. */
function doneOfDue(input: ReportInput, days: readonly DateStr[], match: (item: ReturnType<typeof dueItems>[number]) => boolean): string {
  let done = 0
  let due = 0
  for (const day of days) {
    for (const item of dueItems(input.habits, day, input.index)) {
      if (!match(item)) continue
      due += 1
      if (item.done) done += 1
    }
  }
  return due ? `${done} of ${due}` : '—'
}

/** The week so far beside the whole week before. Every figure is read from the record. */
export function weekReport(input: ReportInput): WeekReport {
  const { start, today } = input
  const end = minDate(addDays(start, 6), today)
  const thisWeek = dateRange(start, end)
  const lastWeek = dateRange(addDays(start, -7), addDays(start, -1))
  const within = (date: DateStr, days: readonly DateStr[]) => date >= days[0] && date <= days[days.length - 1]

  const trained = (days: readonly DateStr[]) =>
    String(new Set(input.sessions.filter((session) => session.ended_at !== null && (session.kinds?.length ?? 0) > 0 && within(session.date, days)).map((session) => session.date)).size)
  const work = (days: readonly DateStr[]) => String(input.sets.filter((set) => isWorkSet(set) && within(set.date, days)).length)

  const latestWeight = (days: readonly DateStr[]) => {
    const rows = input.weights.filter((row) => within(row.date, days)).sort((a, b) => (a.date < b.date ? 1 : -1))
    return rows.length ? `${weightIn(rows[0].kg, input.unit ?? 'kg')} ${input.unit ?? 'kg'}` : '—'
  }

  const meals = (days: readonly DateStr[]) => input.meals.filter((meal) => meal.text.trim() && within(meal.date, days))
  const named = (pattern: RegExp) => (item: ReturnType<typeof dueItems>[number]) => pattern.test(item.habit.name)

  const rows = muscleWeek(input.sets, input.exercisesById, thisWeek[0], thisWeek[thisWeek.length - 1])
  const worked = new Set<string>(rows.map((row) => row.muscle))

  const newBests: string[] = []
  const bestBefore = new Map<number, number>()
  const bestNow = new Map<number, number>()
  for (const set of input.sets) {
    if (!isWorkSet(set) || set.date > end) continue
    const estimate = e1rm(set.weight_kg, set.reps, set.rir)
    if (estimate === null) continue
    const into = set.date < start ? bestBefore : bestNow
    into.set(set.exercise_id, Math.max(into.get(set.exercise_id) ?? 0, estimate))
  }
  for (const [id, estimate] of bestNow) {
    const before = bestBefore.get(id)
    const name = input.exercisesById.get(id)?.name
    if (before !== undefined && estimate > before && name) newBests.push(name)
  }

  return {
    gym: [
      { label: 'Days trained', value: trained(thisWeek), before: trained(lastWeek) },
      { label: 'Work sets', value: work(thisWeek), before: work(lastWeek) },
      { label: 'Body weight', value: latestWeight(thisWeek), before: latestWeight(lastWeek) },
    ],
    diet: [
      { label: 'Meals logged', value: String(meals(thisWeek).length), before: String(meals(lastWeek).length) },
      { label: 'Meals eaten out', value: String(meals(thisWeek).filter((meal) => meal.ate_out).length), before: String(meals(lastWeek).filter((meal) => meal.ate_out).length) },
      { label: 'No fast food', value: doneOfDue(input, thisWeek, named(/fast food/i)), before: doneOfDue(input, lastWeek, named(/fast food/i)) },
      { label: 'Water', value: doneOfDue(input, thisWeek, named(/water/i)), before: doneOfDue(input, lastWeek, named(/water/i)) },
      { label: 'Protein', value: doneOfDue(input, thisWeek, named(/^protein/i)), before: doneOfDue(input, lastWeek, named(/^protein/i)) },
      { label: 'Supplements', value: doneOfDue(input, thisWeek, (item) => item.habit.kind === 'supplement'), before: doneOfDue(input, lastWeek, (item) => item.habit.kind === 'supplement') },
    ],
    untrained: input.muscleNames.filter((muscle) => !worked.has(muscle)),
    newBests,
  }
}
