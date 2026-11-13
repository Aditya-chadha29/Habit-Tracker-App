import type { DateStr, Habit, LearningSession, Meal, Session, SetLog, WeightEntry } from '../data/types'
import type { CompletionIndex } from './completion'
import { addDays, monthEndOf } from './dates'
import { consistency } from './streaks'
import { currentVersion, nameOn } from './timeline'
import { isWorkSet } from './training'

export interface MonthHabitRow {
  id: number
  name: string
  done: number
  due: number
  /** Whole percent. */
  rate: number
}

export interface MonthReport {
  /** Every habit that was due at least once, best rate first. */
  habits: MonthHabitRow[]
  highest: MonthHabitRow[]
  lowest: MonthHabitRow[]
  done: number
  due: number
  gymDays: number
  workSets: number
  weightStart: number | null
  weightEnd: number | null
  minutesLearned: number
  mealsLogged: number
  mealsOut: number
  daysOff: number
}

interface MonthInput {
  /** First day of the month. */
  month: DateStr
  today: DateStr
  habits: readonly Habit[]
  index: CompletionIndex
  sessions: readonly Pick<Session, 'date' | 'ended_at' | 'kinds'>[]
  sets: readonly SetLog[]
  weights: readonly WeightEntry[]
  learning: readonly Pick<LearningSession, 'date' | 'minutes'>[]
  meals: readonly Meal[]
}

/** A month in figures, all read from the record. The running month counts up to yesterday. */
export function monthReport(input: MonthInput): MonthReport {
  const { month, today, index } = input
  const monthEnd = monthEndOf(month)
  const yesterday = addDays(today, -1)
  const to = monthEnd > yesterday ? yesterday : monthEnd
  const within = (date: DateStr) => date >= month && date <= monthEnd && date <= today

  const rows: MonthHabitRow[] = []
  if (to >= month) {
    for (const habit of input.habits) {
      if (habit.id === undefined) continue
      const result = consistency(habit, month, to, today, index)
      if (!result.due) continue
      rows.push({ id: habit.id, name: nameOn(habit, to) || currentVersion(habit).name, done: result.done, due: result.due, rate: Math.round((result.done / result.due) * 100) })
    }
  }
  rows.sort((a, b) => b.rate - a.rate || b.due - a.due || a.name.localeCompare(b.name))

  const weights = input.weights.filter((row) => within(row.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at - b.created_at))
  const meals = input.meals.filter((meal) => within(meal.date) && meal.text.trim())
  let daysOff = 0
  for (const date of index.daysOff) if (within(date)) daysOff += 1

  return {
    habits: rows,
    highest: rows.slice(0, 5),
    lowest: rows.length > 5 ? rows.slice(-5).reverse() : [],
    done: rows.reduce((total, row) => total + row.done, 0),
    due: rows.reduce((total, row) => total + row.due, 0),
    gymDays: new Set(input.sessions.filter((session) => session.ended_at !== null && (session.kinds?.length ?? 0) > 0 && within(session.date)).map((session) => session.date)).size,
    workSets: input.sets.filter((set) => isWorkSet(set) && within(set.date)).length,
    weightStart: weights.length ? weights[0].kg : null,
    weightEnd: weights.length ? weights[weights.length - 1].kg : null,
    minutesLearned: input.learning.filter((session) => within(session.date)).reduce((total, session) => total + (session.minutes ?? 0), 0),
    mealsLogged: meals.length,
    mealsOut: meals.filter((meal) => meal.ate_out).length,
    daysOff,
  }
}
