import type {
  AreaConfig, DateStr, Exercise, Habit, HabitWeekResult, LearningPillar, LearningResource, LearningSession,
  Session, SetLog, TargetResult, WeekStats, WeightEntry,
} from '../data/types'
import { isComplete, type CompletionIndex } from './completion'
import { addDays, WEEKDAY_LONG, weekdayIndex } from './dates'
import { learningStats } from './learning'
import { shiftPeriod, type Period } from './periods'
import { weekTally } from './score'
import { isDueOn, nameOn, versionOn } from './timeline'
import { bestSet, formatSet, isWorkSet, sessionMinutes, volumeLoad } from './training'

/**
 * The weekly review, computed.
 *
 * Everything the review shows comes from here, built on the same score and target functions the
 * rest of the app uses. The observations are sentences the numbers prove — a comparison, a run
 * of weeks, a lowest day — each with a minimum amount of evidence behind it. Nothing here ever
 * suggests a reason, a feeling or a remedy.
 */

/** Bumped when the scoring rules change, so a frozen week records which rules produced it. */
export const REVIEW_ENGINE = 1

export interface WeekInput {
  habits: readonly Habit[]
  index: CompletionIndex
  /** The week being reviewed. */
  period: Period
  today: DateStr
  areas: readonly AreaConfig[]
  weights: readonly WeightEntry[]
  sessions: readonly Session[]
  setLogs: readonly SetLog[]
  exercises: readonly Exercise[]
  learningSessions: readonly LearningSession[]
  resources: readonly LearningResource[]
  pillars: readonly LearningPillar[]
  /** Statistics of earlier weeks, newest first, for comparisons. */
  previous: readonly WeekStats[]
}

const MIN_DUE_FOR_COMPARISON = 10
const MIN_AREA_DUE = 5
const MIN_CHANGE_POINTS = 5

const pct = (done: number, due: number): number => Math.round((done / due) * 100)

function latestWeight(weights: readonly WeightEntry[], from: DateStr, to: DateStr): number | null {
  let best: WeightEntry | null = null
  for (const entry of weights) {
    if (entry.date < from || entry.date > to) continue
    if (!best || entry.date > best.date || (entry.date === best.date && entry.created_at > best.created_at)) best = entry
  }
  return best ? best.kg : null
}

function habitResults(input: WeekInput, targets: TargetResult[]): HabitWeekResult[] {
  const { habits, period, today, index } = input
  const last = period.end < today ? period.end : today
  const results: HabitWeekResult[] = []
  const targetById = new Map(targets.map((target) => [target.habit_id, target]))
  for (const habit of habits) {
    if (habit.id === undefined) continue
    let done = 0
    let due = 0
    for (let date = period.start; date <= last; date = addDays(date, 1)) {
      if (!isDueOn(habit, date)) continue
      due += 1
      if (isComplete(habit, date, index)) done += 1
    }
    const version = versionOn(habit, last)
    if (due === 0) {
      // A flexible habit is judged against its target, not day by day.
      const target = targetById.get(habit.id)
      if (!target || version?.day.kind !== 'flexible' || target.outcome === 'partial') continue
      results.push({ habit_id: habit.id, name: target.name, area: target.area, done: Math.min(target.done, target.target), due: target.target })
      continue
    }
    results.push({ habit_id: habit.id, name: nameOn(habit, last), area: version?.area ?? habit.versions[0].area, done, due })
  }
  return results
}

function observe(stats: Omit<WeekStats, 'observations'>, previous: readonly WeekStats[]): string[] {
  const lines: string[] = []
  const before = previous[0]

  // Overall, against the week before.
  if (before && stats.due >= MIN_DUE_FOR_COMPARISON && before.due >= MIN_DUE_FOR_COMPARISON) {
    const now = pct(stats.done, stats.due)
    const then = pct(before.done, before.due)
    if (Math.abs(now - then) >= MIN_CHANGE_POINTS) {
      lines.push(`Week completion was ${now}%, ${now > then ? 'up' : 'down'} from ${then}% the week before.`)
    } else {
      lines.push(`Week completion was ${now}%, about the same as the week before (${then}%).`)
    }
  }

  // The pillar that moved most in each direction.
  if (before) {
    let rise: { label: string; from: number; to: number } | null = null
    let fall: { label: string; from: number; to: number } | null = null
    for (const area of stats.areas) {
      const earlier = before.areas.find((candidate) => candidate.area === area.area)
      if (!earlier || area.due < MIN_AREA_DUE || earlier.due < MIN_AREA_DUE) continue
      const to = pct(area.done, area.due)
      const from = pct(earlier.done, earlier.due)
      if (to - from >= MIN_CHANGE_POINTS && (!rise || to - from > rise.to - rise.from)) rise = { label: area.label, from, to }
      if (from - to >= MIN_CHANGE_POINTS && (!fall || from - to > fall.from - fall.to)) fall = { label: area.label, from, to }
    }
    if (rise) lines.push(`${rise.label} went from ${rise.from}% to ${rise.to}%.`)
    if (fall) lines.push(`${fall.label} went from ${fall.from}% to ${fall.to}%.`)
  }

  // Targets: runs of weeks met, and how often missed recently.
  for (const target of stats.targets) {
    if (target.outcome === 'partial' || target.outcome === 'open') continue
    const history = [target, ...previous.map((week) => week.targets.find((candidate) => candidate.habit_id === target.habit_id))]
    let run = 0
    for (const week of history) {
      if (!week || week.outcome !== 'met') break
      run += 1
    }
    if (run >= 2) {
      lines.push(`${target.name} target met for ${run} consecutive weeks.`)
      continue
    }
    const recent = history.slice(0, 5).filter((week): week is TargetResult => !!week && (week.outcome === 'met' || week.outcome === 'missed'))
    const missed = recent.filter((week) => week.outcome === 'missed').length
    if (recent.length >= 3 && missed >= 2) lines.push(`${target.name} target missed in ${missed} of the last ${recent.length} weeks.`)
  }

  // The habit that changed most in each direction against the week before.
  if (before) {
    let up: { name: string; text: string; change: number } | null = null
    let down: { name: string; text: string; change: number } | null = null
    for (const habit of stats.habits) {
      const earlier = before.habits.find((candidate) => candidate.habit_id === habit.habit_id)
      if (!earlier || habit.due < 3 || earlier.due < 3 || habit.due !== earlier.due) continue
      const change = habit.done - earlier.done
      const text = `${habit.name} went from ${earlier.done} of ${earlier.due} to ${habit.done} of ${habit.due}.`
      if (change >= 2 && (!up || change > up.change)) up = { name: habit.name, text, change }
      if (change <= -2 && (!down || change < down.change)) down = { name: habit.name, text, change }
    }
    if (up) lines.push(up.text)
    if (down) lines.push(down.text)
  }

  // A day that stood well below the rest of the week.
  const counted = stats.days.filter((day) => day.due >= 5)
  if (counted.length >= 5 && stats.due > 0) {
    const lowest = counted.reduce((min, day) => (day.done / day.due < min.done / min.due ? day : min))
    const lowestPct = pct(lowest.done, lowest.due)
    if (pct(stats.done, stats.due) - lowestPct >= 15) {
      lines.push(`${WEEKDAY_LONG[weekdayIndex(lowest.date)]} had the lowest completion this week (${lowestPct}%).`)
    }
  }

  // Weight.
  if (stats.weight.kg !== null && stats.weight.previous_kg !== null) {
    const change = Math.round((stats.weight.kg - stats.weight.previous_kg) * 10) / 10
    lines.push(
      change === 0
        ? `Weight ${stats.weight.kg} kg, unchanged from the week before.`
        : `Weight ${stats.weight.kg} kg, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} kg from the week before.`,
    )
  }

  return lines
}

export function computeWeekStats(input: WeekInput): WeekStats {
  const { period, today } = input
  const over = period.end < today
  const tally = weekTally(input.habits, period, today, input.index)
  const last = over ? period.end : today

  const targets: TargetResult[] = tally.targets.map(({ habit, progress }) => ({
    habit_id: habit.id!,
    name: nameOn(habit, last),
    area: progress.area,
    per: 'week',
    target: progress.target,
    done: progress.done,
    outcome: progress.state === 'met' ? 'met' : progress.state === 'missed' ? 'missed' : progress.state === 'partial' ? 'partial' : 'open',
  }))

  const inWeek = <T extends { date: DateStr }>(rows: readonly T[]): T[] => rows.filter((row) => row.date >= period.start && row.date <= period.end)
  const sessions = inWeek(input.sessions).filter((session) => session.ended_at !== null)
  const sets = inWeek(input.setLogs).filter(isWorkSet)
  const top = bestSet(sets)
  const topName = top ? (input.exercises.find((exercise) => exercise.id === top.exercise_id)?.name ?? '') : ''
  const learning = learningStats(input.learningSessions, input.resources, input.pillars, period.start, period.end)
  const previousWeek = shiftPeriod(period, -1)

  const stats: Omit<WeekStats, 'observations'> = {
    engine: REVIEW_ENGINE,
    week_start: period.start,
    week_end: period.end,
    done: tally.done,
    due: tally.due,
    areas: input.areas.map((area) => {
      const part = tally.by_area.get(area.id)
      return { area: area.id, label: area.label, done: part?.done ?? 0, due: part?.due ?? 0 }
    }),
    targets,
    habits: habitResults(input, targets),
    days: tally.days.filter((day) => day.counted).map(({ date, done, due }) => ({ date, done, due })),
    weight: {
      kg: latestWeight(input.weights, period.start, period.end),
      previous_kg: latestWeight(input.weights, previousWeek.start, previousWeek.end),
    },
    training: {
      sessions: sessions.length,
      sets: sets.length,
      volume_kg: Math.round(volumeLoad(sets)),
      minutes: sessions.reduce((total, session) => total + (sessionMinutes(session) ?? 0), 0),
      best: top ? `${topName ? `${topName} ` : ''}${formatSet(top)}`.trim() : '',
    },
    learning: {
      sessions: learning.sessions,
      minutes: learning.minutes,
      completed: learning.completed,
      by_pillar: learning.by_pillar.map((row) => ({ name: row.name, sessions: row.sessions })),
    },
  }

  // Comparisons only mean something once the week is complete.
  return { ...stats, observations: over ? observe(stats, input.previous) : [] }
}

/** Habits with enough due days to be worth ranking, best first. */
export function rankHabits(habits: readonly HabitWeekResult[], minDue = 3): HabitWeekResult[] {
  return habits
    .filter((habit) => habit.due >= minDue)
    .slice()
    .sort((a, b) => b.done / b.due - a.done / a.due || b.due - a.due)
}
