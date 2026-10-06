import type { AreaId, DateStr, Habit, HabitVersion } from '../data/types'
import { isComplete, type CompletionIndex } from './completion'
import { addDays, daysBetween } from './dates'
import type { Period } from './periods'
import { matchesDayRule, versionOn } from './timeline'

/**
 * Progress against a "N times per week / month" target.
 *
 * The rule the whole product leans on: a target that is still possible is never called missed.
 * It is pending, then possibly worth pointing out, then at risk — and only once the period has
 * actually ended does an unmet target become "missed".
 */
export type TargetState =
  /** Target reached. */
  | 'met'
  /** Not reached yet, with room to spare. */
  | 'on_track'
  /** One spare day left: skipping tomorrow would make every remaining day necessary. */
  | 'attention'
  /** Every remaining day is now needed. */
  | 'at_risk'
  /** Can no longer be reached this period, whatever happens next. */
  | 'unreachable'
  /** The period is over and the target was not reached. */
  | 'missed'
  /** The period is over, but the habit was only tracked for part of it, so it is not judged. */
  | 'partial'
  /** The period has not started. */
  | 'upcoming'

export interface TargetProgress {
  habit_id: number
  period: Period
  target: number
  /** Distinct days completed in the period. Not capped: 6 of 5 is reported as 6. */
  done: number
  remaining: number
  /** Days from today to the period's end on which it could still be done. */
  open_days: number
  /** Days after today left in the period. */
  days_left: number
  /** Tracked for only part of the period (created, re-scheduled or retired midway). */
  partial: boolean
  /** No particular day: the target is the whole commitment, and counts in the week's score. */
  flexible: boolean
  /** Pillar the target counted toward during this period. */
  area: AreaId
  state: TargetState
}

function sameCommitment(a: HabitVersion, b: HabitVersion): boolean {
  return (
    a.active === b.active &&
    JSON.stringify(a.day) === JSON.stringify(b.day) &&
    JSON.stringify(a.target) === JSON.stringify(b.target)
  )
}

/**
 * The chapter that owns a period's target: the one in force on the last day of the period the
 * habit was active. Returns it with the date that commitment has been running since, which is
 * how a rename mid-week avoids looking like a new commitment.
 */
function owner(
  habit: Habit,
  period: Period,
  today: DateStr,
): { version: HabitVersion; since: DateStr; endedEarly: boolean } | null {
  const versions = habit.versions
  let index = -1
  for (let i = 0; i < versions.length; i++) {
    if (versions[i].from > period.end) break
    index = i
  }
  if (index < 0) return null

  let endedEarly = false
  if (!versions[index].active) {
    // Retired on or before the period's last day. A finished period still reports what was done
    // before the retirement; a running one simply stops showing the habit.
    if (period.end >= today) return null
    if (versions[index].from <= period.start || index === 0) return null
    index -= 1
    endedEarly = true
    if (!versions[index].active) return null
  }

  const version = versions[index]
  if (!version.target || version.target.per !== period.per) return null

  let since = version.from
  for (let i = index - 1; i >= 0 && sameCommitment(versions[i], version); i--) since = versions[i].from
  return { version, since, endedEarly }
}

/** Progress for one habit over one period, or null when it carries no such target then. */
export function targetProgress(
  habit: Habit,
  period: Period,
  today: DateStr,
  index: CompletionIndex,
): TargetProgress | null {
  if (habit.id === undefined) return null
  const owned = owner(habit, period, today)
  if (!owned) return null
  const target = owned.version.target!.count

  let done = 0
  let eligible = 0
  let openDays = 0
  for (let date = period.start; date <= period.end; date = addDays(date, 1)) {
    const version = versionOn(habit, date)
    if (!version || !version.active) continue
    const complete = date <= today && isComplete(habit, date, index)
    if (complete) done += 1
    const canBeDone = version.day.kind === 'flexible' || matchesDayRule(version.day, date)
    if (!canBeDone) continue
    eligible += 1
    if (date >= today && !complete) openDays += 1
  }

  const remaining = Math.max(0, target - done)
  const partial = owned.since > period.start || owned.endedEarly
  const daysLeft = Math.max(0, daysBetween(today, period.end))

  let state: TargetState
  if (done >= target) state = 'met'
  else if (period.end < today) state = partial ? 'partial' : 'missed'
  else if (period.start > today) state = 'upcoming'
  else if (partial) state = 'on_track'
  else {
    const slack = openDays - remaining
    const spare = eligible - target
    if (slack < 0) state = 'unreachable'
    else if (slack === 0 && spare > 0) state = 'at_risk'
    else if (slack === 1 && spare > 1) state = 'attention'
    else state = 'on_track'
  }

  return {
    habit_id: habit.id,
    period,
    target,
    done,
    remaining,
    open_days: openDays,
    days_left: daysLeft,
    partial,
    flexible: owned.version.day.kind === 'flexible',
    area: owned.version.area,
    state,
  }
}

/** Every habit carrying a target of this period's kind, in the order given. */
export function targetsFor(
  habits: readonly Habit[],
  period: Period,
  today: DateStr,
  index: CompletionIndex,
): { habit: Habit; progress: TargetProgress }[] {
  const out: { habit: Habit; progress: TargetProgress }[] = []
  for (const habit of habits) {
    const progress = targetProgress(habit, period, today, index)
    if (progress) out.push({ habit, progress })
  }
  return out
}

/** "1 session still required", "2 sessions remaining" — the wording the product uses. */
export function remainingPhrase(remaining: number): string {
  return `${remaining} ${remaining === 1 ? 'session' : 'sessions'} still required`
}

export function daysLeftPhrase(daysLeft: number): string {
  if (daysLeft === 0) return 'last day'
  return `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
}
