import type { DateStr, Exercise, Habit, SetLog } from '../data/types'
import type { CompletionIndex } from './completion'
import { daysBetween, weekdayIndex } from './dates'
import { periodOf, shiftPeriod } from './periods'
import { muscleWeek } from './history'
import { dueItems } from './score'
import { daysLeftPhrase, remainingPhrase, targetsFor } from './targets'
import { currentVersion, isRetired } from './timeline'

/**
 * "Needs attention": the short list of things that are genuinely worth pointing out.
 *
 * It is deliberately stingy. An unfinished habit at seven in the morning is not an emergency and
 * is not listed. What is listed: a target that is running out of days, a target that was missed
 * last week and has not been looked at yet, what is still open once the day is nearly over, a
 * learning item that has stalled, and the review when it is due.
 *
 * Every line is a fact. Nothing here encourages, warns of consequences or guesses at reasons.
 */
export type AttentionLevel = 'at_risk' | 'missed' | 'attention' | 'normal'

export interface AttentionItem {
  id: string
  level: AttentionLevel
  title: string
  detail: string
  /** Where tapping it goes. */
  to: string
}

export interface AttentionInput {
  habits: readonly Habit[]
  index: CompletionIndex
  today: DateStr
  /** Local hour, 0–23. */
  hour: number
  weekStart: number
  /** From this hour the day counts as nearly over. */
  eveningHour: number
  /** Weekday the weekly review is put forward on. */
  reviewDay: number
  /** Today's programmed workout, when there is a programme. */
  workout: { scheduled: string | null; doneToday: boolean } | null
  /** The learning item in progress, when there is one. */
  learning: { title: string; daysInProgress: number; staleDays: number } | null
  /** Whether last week's review already has a reflection written. */
  lastWeekReviewed: boolean
  /** The training log, for muscles that have gone untrained. Optional. */
  sets?: readonly SetLog[]
  exercisesById?: ReadonlyMap<number, Exercise>
  /** Date of the last export downloaded on this device, or null. Undefined: not looked at. */
  lastExport?: DateStr | null
  /** The first day anything was recorded. */
  firstDay?: DateStr | null
}

/** A muscle worked before but not in this many days is pointed out. */
export const UNTRAINED_DAYS = 14
/** An export older than this is pointed out. */
export const EXPORT_DAYS = 30

const ORDER: Record<AttentionLevel, number> = { at_risk: 0, missed: 1, attention: 2, normal: 3 }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function attentionItems(input: AttentionInput): AttentionItem[] {
  const { habits, index, today, hour, weekStart } = input
  const active = habits.filter((habit) => !isRetired(habit))
  const items: AttentionItem[] = []
  const late = hour >= input.eveningHour

  // 1. Targets that are running out of room, this week and this month.
  const week = periodOf('week', today, weekStart)
  for (const period of [week, periodOf('month', today, weekStart)]) {
    const span = period.per === 'week' ? 'this week' : 'this month'
    for (const { habit, progress } of targetsFor(active, period, today, index)) {
      const name = currentVersion(habit).name
      const count = `${progress.done} of ${progress.target} complete`
      if (progress.state === 'at_risk' || progress.state === 'attention') {
        items.push({
          id: `target-${period.per}-${habit.id}`,
          level: progress.state,
          title: name,
          detail: `${count} · ${remainingPhrase(progress.remaining)} · ${daysLeftPhrase(progress.days_left)}`,
          to: '/today',
        })
      } else if (progress.state === 'unreachable' && progress.flexible) {
        // A fixed-day habit that has already missed a day is yesterday's news and nothing can be
        // done about it; a flexible one can still be partly done, so it stays visible.
        const possible = progress.open_days > 0 ? ` · ${plural(progress.open_days, 'session', 'sessions')} still possible` : ''
        items.push({
          id: `target-${period.per}-${habit.id}`,
          level: 'at_risk',
          title: name,
          detail: `${count} · the target can no longer be met ${span}${possible}`,
          to: '/today',
        })
      }
    }
  }

  // 2. Last week's missed targets, for the first days of a new week, until the review is written.
  if (!input.lastWeekReviewed && daysBetween(week.start, today) <= 2) {
    const lastWeek = shiftPeriod(week, -1)
    const missed = targetsFor(habits, lastWeek, today, index).filter(({ progress }) => progress.state === 'missed')
    if (missed.length === 1) {
      const { habit, progress } = missed[0]
      items.push({
        id: 'last-week-missed',
        level: 'missed',
        title: 'Last week',
        detail: `${currentVersion(habit).name}: ${progress.done} of ${progress.target}. Target missed, ${progress.remaining} short.`,
        to: `/review/${lastWeek.start}`,
      })
    } else if (missed.length > 1) {
      items.push({
        id: 'last-week-missed',
        level: 'missed',
        title: 'Last week',
        detail: `${missed.length} targets missed: ${missed.map(({ habit }) => currentVersion(habit).name).join(', ')}.`,
        to: `/review/${lastWeek.start}`,
      })
    }
  }

  // 3. Once the day is nearly over: what is still open.
  if (late) {
    const pending = dueItems(active, today, index).filter((item) => !item.done)
    const tickable = pending.filter((item) => item.version.sources.includes('manual'))
    const needsWorkout = pending.some((item) => item.version.sources.includes('workout'))

    if (input.workout?.scheduled && !input.workout.doneToday) {
      items.push({
        id: 'workout',
        level: 'attention',
        title: input.workout.scheduled,
        detail: 'Scheduled for today. No session logged yet.',
        to: '/train',
      })
    } else if (needsWorkout && !input.workout?.doneToday) {
      items.push({ id: 'workout', level: 'attention', title: 'Training', detail: 'No session logged today.', to: '/train' })
    }

    if (tickable.length) {
      const names = tickable.slice(0, 3).map((item) => item.version.name)
      const more = tickable.length > 3 ? ` and ${tickable.length - 3} more` : ''
      items.push({
        id: 'pending-today',
        level: 'attention',
        title: 'Still open today',
        detail: `${plural(tickable.length, 'item', 'items')}: ${names.join(', ')}${more}.`,
        to: '/today',
      })
    }
  }

  // 4. A learning item that has been in progress for a long time.
  if (input.learning && input.learning.staleDays > 0 && input.learning.daysInProgress >= input.learning.staleDays) {
    items.push({
      id: 'learning-stale',
      level: 'normal',
      title: input.learning.title,
      detail: `In progress for ${plural(input.learning.daysInProgress, 'day', 'days')}.`,
      to: '/learn',
    })
  }

  // 4b. Muscles that have been trained before but not in the last two weeks: one combined line.
  if (input.sets && input.exercisesById) {
    const stale = muscleWeek(input.sets, input.exercisesById, '0000-01-01', today)
      .filter((row) => daysBetween(row.last, today) >= UNTRAINED_DAYS)
      .map((row) => row.muscle as string)
    if (stale.length) {
      const names = stale.join(', ')
      items.push({ id: 'untrained', level: 'normal', title: `Not trained in ${UNTRAINED_DAYS} days`, detail: `${names.charAt(0).toUpperCase()}${names.slice(1)}.`, to: '/train' })
    }
  }

  // 4c. No export downloaded for a month, once there is a month of record to lose.
  if (input.lastExport !== undefined && input.firstDay && daysBetween(input.firstDay, today) > EXPORT_DAYS) {
    if (input.lastExport === null || daysBetween(input.lastExport, today) > EXPORT_DAYS) {
      items.push({ id: 'export', level: 'normal', title: 'Backup', detail: `No export downloaded in ${EXPORT_DAYS} days.`, to: '/data' })
    }
  }

  // 5. The weekly review, on its day.
  if (weekdayIndex(today) === input.reviewDay) {
    items.push({ id: 'review', level: 'normal', title: 'Weekly review', detail: 'This week is ready to review.', to: '/review' })
  }

  return items
    .map((item, order) => ({ item, order }))
    .sort((a, b) => ORDER[a.item.level] - ORDER[b.item.level] || a.order - b.order)
    .map(({ item }) => item)
}
