import { db, type AppDb } from './db'
import type { WriteContext } from './habitRepo'
import type { DateStr, Settings, WeekStats, WeeklyReview } from './types'
import { buildCompletionIndex } from '../engine/completion'
import { addDays, weekStartOf } from '../engine/dates'
import { firstEditableDate, isEditable, LockedError } from '../engine/lock'
import type { Period } from '../engine/periods'
import { computeWeekStats } from '../engine/review'

/**
 * Weekly reviews.
 *
 * A week's numbers are computed live while any of its days can still be corrected. Once the whole
 * week has left the correction window the numbers are computed one last time and stored in the
 * review row — and from then on that stored copy is what is shown, whatever is changed later.
 * That is what lets an old review be trusted months afterwards.
 */
export type ReflectionPatch = Partial<
  Pick<WeeklyReview, 'reflection_good' | 'reflection_bad' | 'reflection_learned' | 'reflection_change' | 'next_week_notes'>
>

export function emptyReview(weekStart: DateStr, now: number): WeeklyReview {
  return {
    week_start: weekStart,
    week_end: addDays(weekStart, 6),
    reflection_good: '',
    reflection_bad: '',
    reflection_learned: '',
    reflection_change: '',
    next_week_notes: '',
    legacy_notes: '',
    frozen: null,
    frozen_on: null,
    updated_at: now,
  }
}

const weekOf = (weekStart: DateStr): Period => ({ per: 'week', start: weekStart, end: addDays(weekStart, 6) })

/** Whether a week's reflection can still be written: the running week, or one whose last day is
 *  still inside the correction window. */
export function canReflectOn(weekStart: DateStr, today: DateStr, windowDays: number): boolean {
  const end = addDays(weekStart, 6)
  if (weekStart > today) return false
  return end >= today || isEditable(end, today, windowDays)
}

export async function saveReflection(
  weekStart: DateStr,
  patch: ReflectionPatch,
  ctx: WriteContext,
  now: number,
  database: AppDb = db,
): Promise<void> {
  if (!canReflectOn(weekStart, ctx.today, ctx.windowDays)) throw new LockedError(addDays(weekStart, 6))
  await database.transaction('rw', database.weekly_reviews, async () => {
    const existing = await database.weekly_reviews.get(weekStart)
    await database.weekly_reviews.put({ ...(existing ?? emptyReview(weekStart, now)), ...patch, updated_at: now })
  })
}

/** Reads everything a week's statistics are computed from. */
async function loadWeek(period: Period, today: DateStr, settings: Settings, previous: WeekStats[], database: AppDb) {
  const from = addDays(period.start, -7)
  const [habits, entries, sessions, learningAll, journalDates, weights, setLogs, exercises, resources, pillars, marks] = await Promise.all([
    database.habits.orderBy('sort_order').toArray(),
    database.entries.where('date').between(period.start, period.end, true, true).toArray(),
    database.sessions.where('date').between(period.start, period.end, true, true).toArray(),
    database.learning_sessions.where('date').between(period.start, period.end, true, true).toArray(),
    database.journal_entries.where('date').between(period.start, period.end, true, true).toArray().then((rows) => [...new Set(rows.map((row) => row.date))]),
    database.weight_entries.where('date').between(from, period.end, true, true).toArray(),
    database.set_logs.where('date').between(period.start, period.end, true, true).toArray(),
    database.exercises.toArray(),
    database.learning_resources.toArray(),
    database.learning_pillars.toArray(),
    database.day_marks.toArray(),
  ])
  return computeWeekStats({
    habits,
    index: buildCompletionIndex({ entries, sessions, learningSessions: learningAll, journalDates: journalDates as DateStr[], daysOff: marks.map((mark) => mark.date) }),
    period,
    today,
    areas: [...settings.areas].sort((a, b) => a.sort_order - b.sort_order),
    weights,
    sessions,
    setLogs,
    exercises,
    learningSessions: learningAll,
    resources,
    pillars,
    previous,
  })
}

/** First tracked week: the week holding the earliest habit's start date. */
async function firstWeekStart(settings: Settings, database: AppDb): Promise<DateStr | null> {
  const habits = await database.habits.toArray()
  if (!habits.length) return null
  const earliest = habits.reduce((min, habit) => (habit.created_on < min ? habit.created_on : min), habits[0].created_on)
  return weekStartOf(earliest, settings.week_start)
}

/**
 * A week's statistics: the stored copy when the week is frozen, otherwise computed now. Weeks
 * before it are needed for comparisons, so up to `depth` earlier weeks are resolved the same way.
 */
export async function weekStatsFor(
  weekStart: DateStr,
  today: DateStr,
  settings: Settings,
  database: AppDb = db,
  depth = 5,
): Promise<{ stats: WeekStats; frozen: boolean; review: WeeklyReview | null }> {
  const review = (await database.weekly_reviews.get(weekStart)) ?? null
  // A stored week stands only while none of its days can be corrected. If the correction window
  // has since been widened over it, it is worked out live again.
  const locked = addDays(weekStart, 6) < firstEditableDate(today, settings.edit_window_days)
  if (review?.frozen && locked) return { stats: review.frozen, frozen: true, review }

  const first = await firstWeekStart(settings, database)
  const chain: DateStr[] = []
  for (let start = addDays(weekStart, -7), i = 0; i < depth && first !== null && start >= first; start = addDays(start, -7), i++) chain.push(start)

  // Oldest first, so each week has the ones before it to compare with.
  const earlier: WeekStats[] = []
  for (const start of chain.reverse()) {
    const stored = await database.weekly_reviews.get(start)
    earlier.unshift(stored?.frozen ?? (await loadWeek(weekOf(start), today, settings, earlier, database)))
  }
  return { stats: await loadWeek(weekOf(weekStart), today, settings, earlier, database), frozen: false, review }
}

/**
 * Freezes every week that has fully left the correction window and is not frozen yet, oldest
 * first. Safe to call at any time and any number of times: a frozen week is never touched again.
 * Returns the weeks it froze.
 */
export async function freezeDueWeeks(today: DateStr, settings: Settings, now: number, database: AppDb = db): Promise<DateStr[]> {
  const first = await firstWeekStart(settings, database)
  if (first === null) return []
  const lockedBefore = firstEditableDate(today, settings.edit_window_days)
  const frozen: DateStr[] = []
  // Weeks the window has been widened over are released, to be stored again once they lock.
  await database.transaction('rw', database.weekly_reviews, async () => {
    const reopened = (await database.weekly_reviews.toArray()).filter((row) => row.frozen && addDays(row.week_start, 6) >= lockedBefore)
    for (const row of reopened) await database.weekly_reviews.update(row.week_start, { frozen: null, frozen_on: null })
  })
  for (let start = first; addDays(start, 6) < lockedBefore; start = addDays(start, 7)) {
    const existing = await database.weekly_reviews.get(start)
    if (existing?.frozen) continue
    const { stats } = await weekStatsFor(start, today, settings, database)
    await database.transaction('rw', database.weekly_reviews, async () => {
      // Read again inside the transaction: another tab may have frozen it in the meantime.
      const current = await database.weekly_reviews.get(start)
      if (current?.frozen) return
      await database.weekly_reviews.put({ ...(current ?? emptyReview(start, now)), frozen: stats, frozen_on: today, updated_at: now })
      frozen.push(start)
    })
  }
  return frozen
}
